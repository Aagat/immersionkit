import {
  evaluateCurriculumEligibility,
  getActiveCurriculumContent,
  hashSentence,
  shouldReceiveDueReviewBoost,
  type CurriculumConfig,
  type CurriculumEligibilityDecision,
  type CurriculumRuntimeProfileInput,
  type LearningItem
} from "@immersionkit/shared";
import type {
  QueueSentenceCandidatesMessage,
  SentenceCacheEntry,
  SentenceCacheRepository,
  SentenceTranslationResult
} from "@immersionkit/shared";

import {
  createSentenceProviderClient,
  OPENAI_SENTENCE_PROMPT_VERSION,
  type ProviderSentenceCandidate
} from "./provider-client";
import {
  SentenceAnalysisService,
  type AnalyzedSentenceCandidate
} from "./sentence-analysis-service";
import { IndexedDbSentenceCacheRepository } from "./sentence-cache";
import {
  loadBackgroundRuntimeConfig,
  type BackgroundRuntimeConfig
} from "./settings";
import { BackgroundLearningItemService } from "./learning-items";

const MAX_CANDIDATES_PER_MESSAGE = 12;
const MAX_SENTENCE_QUEUE_SIZE = 150;
const MAX_SENTENCE_LENGTH = 360;
const QUEUE_FLUSH_DELAY_MS = 220;
const MAX_PROVIDER_ATTEMPTS = 2;

type QueuedSentenceCandidate = ProviderSentenceCandidate & {
  attempts: number;
  senderTabIds: Set<number>;
};

export type TranslationAvailability =
  | "ready"
  | "feature-disabled"
  | "provider-disabled"
  | "missing-credentials";

export type CachedSentenceResult = SentenceTranslationResult;

export type SentenceRankingPrimaryReason =
  | "difficulty-score"
  | "vocab-fit"
  | "due-target-value"
  | "grammar-due-value"
  | "phrase-value"
  | "ambiguity-penalty"
  | "curriculum-sentence-policy"
  | "curriculum-gate"
  | "fallback-original-order";

export type SentenceRankingReason = {
  sentenceHash: string;
  rank: number;
  score: number;
  primaryReason: SentenceRankingPrimaryReason;
  curriculum?: {
    configId: string;
    activeBandId: string | null;
    eligible: boolean;
    skipReason: string | null;
  };
  signals?: {
    vocabularyFit: number;
    grammarFit: number;
    dueTargetValue: number;
    grammarDueValue?: number;
    chunkUsefulness: number;
    ambiguityPenalty: number;
    sentencePolicyFit?: number;
  };
  sentencePolicy?: {
    activeBandId: string;
    tokenCount: number;
    tokenRange: readonly [number, number];
    fit: number;
    penalty: number;
    outsideRange: boolean;
    clausePolicy: string;
    targetPolicy: string;
  };
};

type CurriculumRuntimePolicy = {
  config: CurriculumConfig;
  profile: CurriculumRuntimeProfileInput;
};

export type SentenceTranslationDelivery = {
  tabId: number;
  results: CachedSentenceResult[];
};

type SentenceQueueOrchestratorOptions = {
  sentenceCache?: SentenceCacheRepository;
  sentenceAnalysisService?: SentenceAnalysisService;
  learningItems?: Pick<BackgroundLearningItemService, "listItems">;
  loadRuntimeConfig?: () => Promise<BackgroundRuntimeConfig>;
  createProviderClient?: typeof createSentenceProviderClient;
  notifyFreshTranslations?: (
    deliveries: SentenceTranslationDelivery[]
  ) => Promise<void> | void;
  flushDelayMs?: number;
};

export type QueueSentenceCandidatesResponse = {
  ok: boolean;
  accepted: number;
  analyzed: number;
  analysisCacheHits: number;
  queued: number;
  skipped: number;
  cacheHits: number;
  translationAvailability: TranslationAvailability;
  analysisResults: AnalyzedSentenceCandidate[];
  cachedResults: CachedSentenceResult[];
  rankingReasons: SentenceRankingReason[];
};

export class SentenceQueueOrchestrator {
  private readonly sentenceCache: SentenceCacheRepository;
  private readonly sentenceAnalysisService: SentenceAnalysisService;
  private readonly learningItems: Pick<BackgroundLearningItemService, "listItems">;
  private readonly loadRuntimeConfig: () => Promise<BackgroundRuntimeConfig>;
  private readonly createProviderClient: typeof createSentenceProviderClient;
  private readonly notifyFreshTranslations: (
    deliveries: SentenceTranslationDelivery[]
  ) => Promise<void> | void;
  private readonly flushDelayMs: number;
  private readonly pendingQueue = new Map<string, QueuedSentenceCandidate>();
  private readonly inFlightHashes = new Set<string>();
  private readonly inFlightSenderTabIds = new Map<string, Set<number>>();
  private flushTimer: number | null = null;
  private isProcessing = false;

  constructor(options: SentenceQueueOrchestratorOptions = {}) {
    this.sentenceCache =
      options.sentenceCache ?? new IndexedDbSentenceCacheRepository();
    this.sentenceAnalysisService =
      options.sentenceAnalysisService ?? new SentenceAnalysisService();
    this.learningItems = options.learningItems ?? new BackgroundLearningItemService();
    this.loadRuntimeConfig =
      options.loadRuntimeConfig ?? loadBackgroundRuntimeConfig;
    this.createProviderClient =
      options.createProviderClient ?? createSentenceProviderClient;
    this.notifyFreshTranslations =
      options.notifyFreshTranslations ?? (() => undefined);
    this.flushDelayMs = Math.max(
      0,
      Math.round(options.flushDelayMs ?? QUEUE_FLUSH_DELAY_MS)
    );
  }

  async queueMessage(
    message: QueueSentenceCandidatesMessage,
    senderTabId?: number
  ): Promise<QueueSentenceCandidatesResponse> {
    const candidates = normalizeSentenceCandidates(message);
    if (candidates.length === 0) {
      const config = await this.loadRuntimeConfig();
      return {
        ok: true,
        accepted: 0,
        analyzed: 0,
        analysisCacheHits: 0,
        queued: 0,
        skipped: 0,
        cacheHits: 0,
        translationAvailability: resolveTranslationAvailability(config),
        analysisResults: [],
        cachedResults: [],
        rankingReasons: []
      };
    }

    const config = await this.loadRuntimeConfig();
    const analysisResults = await this.analyzeSentenceCandidates(candidates);
    const learningItems = await this.loadLearningItemsForRanking();
    const translationAvailability = resolveTranslationAvailability(config);
    const cacheHits = await this.findCachedEntries(candidates, config);
    const cachedByHash = new Set(cacheHits.map((entry) => entry.sentenceHash));
    const rankedCandidates = rankCandidatesByAnalysis(
      candidates.filter((candidate) => !cachedByHash.has(candidate.sentenceHash)),
      analysisResults,
      config.curriculum,
      learningItems
    );
    const uncachedCandidates = rankedCandidates.candidates;

    let queued = 0;
    let skipped = candidates.length - uncachedCandidates.length;

    if (translationAvailability === "ready") {
      const enqueueSummary = this.enqueueCandidates(uncachedCandidates, senderTabId);
      queued = enqueueSummary.queued;
      skipped += enqueueSummary.skipped;

      if (queued > 0) {
        this.scheduleQueueFlush();
      }
    } else {
      skipped += uncachedCandidates.length;
    }

    return {
      ok: true,
      accepted: candidates.length,
      analyzed: analysisResults.length,
      analysisCacheHits: analysisResults.filter((result) => result.cacheHit).length,
      queued,
      skipped,
      cacheHits: cacheHits.length,
      translationAvailability,
      analysisResults,
      cachedResults: cacheHits.map(toCachedSentenceResult),
      rankingReasons: rankedCandidates.reasons
    };
  }

  private async analyzeSentenceCandidates(
    candidates: readonly ProviderSentenceCandidate[]
  ): Promise<AnalyzedSentenceCandidate[]> {
    try {
      return await this.sentenceAnalysisService.analyzeCandidates(candidates);
    } catch (error) {
      console.warn("ImmersionKit sentence analysis failed closed.", error);
      return [];
    }
  }

  private async loadLearningItemsForRanking(): Promise<LearningItem[]> {
    try {
      return await this.learningItems.listItems();
    } catch (error) {
      console.warn("ImmersionKit learning item ranking read failed.", error);
      return [];
    }
  }

  private enqueueCandidates(
    candidates: readonly ProviderSentenceCandidate[],
    senderTabId?: number
  ): { queued: number; skipped: number } {
    let queued = 0;
    let skipped = 0;

    for (const candidate of candidates) {
      if (this.inFlightHashes.has(candidate.sentenceHash)) {
        if (typeof senderTabId === "number") {
          const senderTabIds = this.inFlightSenderTabIds.get(candidate.sentenceHash);
          if (senderTabIds) {
            senderTabIds.add(senderTabId);
          } else {
            this.inFlightSenderTabIds.set(
              candidate.sentenceHash,
              new Set([senderTabId])
            );
          }
        }

        skipped += 1;
        continue;
      }

      const existing = this.pendingQueue.get(candidate.sentenceHash);
      if (existing) {
        if (typeof senderTabId === "number") {
          existing.senderTabIds.add(senderTabId);
        }

        skipped += 1;
        continue;
      }

      if (this.pendingQueue.size >= MAX_SENTENCE_QUEUE_SIZE) {
        skipped += 1;
        continue;
      }

      this.pendingQueue.set(candidate.sentenceHash, {
        ...candidate,
        attempts: 0,
        senderTabIds: new Set(
          typeof senderTabId === "number" ? [senderTabId] : []
        )
      });
      queued += 1;
    }

    return { queued, skipped };
  }

  private scheduleQueueFlush(delayMs = this.flushDelayMs) {
    if (this.flushTimer !== null) {
      return;
    }

    this.flushTimer = globalThis.setTimeout(() => {
      this.flushTimer = null;
      void this.flushQueue();
    }, delayMs);
  }

  private async flushQueue() {
    if (this.isProcessing || this.pendingQueue.size === 0) {
      return;
    }

    this.isProcessing = true;
    let batch: QueuedSentenceCandidate[] = [];

    try {
      const config = await this.loadRuntimeConfig();
      if (resolveTranslationAvailability(config) !== "ready") {
        this.pendingQueue.clear();
        return;
      }

      const providerClient = this.createProviderClient(
        config.settings.provider,
        config.credentials
      );
      if (!providerClient) {
        this.pendingQueue.clear();
        return;
      }

      batch = this.takeBatch(config.settings.sentenceBatchSize);
      if (batch.length === 0) {
        return;
      }

      for (const candidate of batch) {
        this.inFlightHashes.add(candidate.sentenceHash);
        this.inFlightSenderTabIds.set(
          candidate.sentenceHash,
          new Set(candidate.senderTabIds)
        );
      }

      const cachedEntries = await this.sentenceCache.getByHashes(
        batch.map((candidate) => candidate.sentenceHash)
      );
      const compatibleCachedEntries = cachedEntries.filter((entry) =>
        isSentenceCacheEntryCompatible(entry, config)
      );
      await this.notifyQueuedTabs(batch, compatibleCachedEntries);
      const cachedHashes = new Set(
        compatibleCachedEntries.map((entry) => entry.sentenceHash)
      );
      const uncachedBatch = batch.filter(
        (candidate) => !cachedHashes.has(candidate.sentenceHash)
      );

      if (uncachedBatch.length === 0) {
        return;
      }

      const translations = await providerClient.translateSentences({
        sourceLanguage: config.settings.sourceLanguage,
        targetLanguage: config.settings.targetLanguage,
        candidates: uncachedBatch.map((candidate) => ({
          sentenceHash: candidate.sentenceHash,
          sourceText: candidate.sourceText
        }))
      });

      if (translations.length === 0) {
        return;
      }

      const now = new Date().toISOString();
      const entries: SentenceCacheEntry[] = translations.map((translation) => ({
        sentenceHash: translation.sentenceHash,
        sourceText: translation.sourceText,
        translatedText: translation.translatedText,
        learningNote: translation.learningNote,
        grammarNote: translation.learningNote.summary,
        targetLanguage: config.settings.targetLanguage,
        sourceLanguage: config.settings.sourceLanguage,
        model: translation.model,
        promptVersion: translation.promptVersion,
        createdAt: now,
        lastAccessedAt: now,
        provider: providerClient.providerName
      }));

      await this.sentenceCache.putMany(entries);
      await this.notifyQueuedTabs(uncachedBatch, entries);
    } catch (error) {
      this.requeueBatch(batch);
      console.warn("ImmersionKit sentence queue flush failed.", error);
    } finally {
      for (const candidate of batch) {
        this.inFlightHashes.delete(candidate.sentenceHash);
        this.inFlightSenderTabIds.delete(candidate.sentenceHash);
      }

      this.isProcessing = false;
      if (this.pendingQueue.size > 0) {
        this.scheduleQueueFlush();
      }
    }
  }

  private takeBatch(size: number): QueuedSentenceCandidate[] {
    const batch: QueuedSentenceCandidate[] = [];
    const safeSize = Math.min(5, Math.max(1, Math.round(size)));

    for (const [hash, candidate] of this.pendingQueue.entries()) {
      batch.push(candidate);
      this.pendingQueue.delete(hash);

      if (batch.length >= safeSize) {
        break;
      }
    }

    return batch;
  }

  private requeueBatch(batch: readonly QueuedSentenceCandidate[]) {
    for (const candidate of batch) {
      if (candidate.attempts + 1 >= MAX_PROVIDER_ATTEMPTS) {
        continue;
      }

      const senderTabIds = new Set(candidate.senderTabIds);
      const inFlightTabIds = this.inFlightSenderTabIds.get(candidate.sentenceHash);
      if (inFlightTabIds) {
        for (const tabId of inFlightTabIds) {
          senderTabIds.add(tabId);
        }
      }

      this.pendingQueue.set(candidate.sentenceHash, {
        ...candidate,
        attempts: candidate.attempts + 1,
        senderTabIds
      });
    }
  }

  private async findCachedEntries(
    candidates: readonly ProviderSentenceCandidate[],
    config: BackgroundRuntimeConfig
  ): Promise<SentenceCacheEntry[]> {
    if (candidates.length === 0) {
      return [];
    }

    const hashes = candidates.map((candidate) => candidate.sentenceHash);
    const hits = (await this.sentenceCache.getByHashes(hashes)).filter((entry) =>
      isSentenceCacheEntryCompatible(entry, config)
    );
    if (hits.length === 0) {
      return hits;
    }

    // Cache lookups update access metadata so follow-on cleanup policies can use recency.
    const now = new Date().toISOString();
    await this.sentenceCache.putMany(
      hits.map((entry) => ({
        ...entry,
        lastAccessedAt: now
      }))
    );

    return hits;
  }

  private async notifyQueuedTabs(
    queuedCandidates: readonly QueuedSentenceCandidate[],
    entries: readonly SentenceCacheEntry[]
  ) {
    if (entries.length === 0 || queuedCandidates.length === 0) {
      return;
    }

    const candidateByHash = new Map(
      queuedCandidates.map((candidate) => [candidate.sentenceHash, candidate] as const)
    );
    const deliveriesByTabId = new Map<number, CachedSentenceResult[]>();

    for (const entry of entries) {
      const candidate = candidateByHash.get(entry.sentenceHash);
      if (!candidate) {
        continue;
      }

      const senderTabIds = new Set(candidate.senderTabIds);
      const inFlightSenderTabIds = this.inFlightSenderTabIds.get(entry.sentenceHash);
      if (inFlightSenderTabIds) {
        for (const tabId of inFlightSenderTabIds) {
          senderTabIds.add(tabId);
        }
      }

      if (senderTabIds.size === 0) {
        continue;
      }

      const result = toCachedSentenceResult(entry);
      for (const tabId of senderTabIds) {
        const deliveries = deliveriesByTabId.get(tabId);
        if (deliveries) {
          deliveries.push(result);
          continue;
        }

        deliveriesByTabId.set(tabId, [result]);
      }
    }

    if (deliveriesByTabId.size === 0) {
      return;
    }

    try {
      await this.notifyFreshTranslations(
        [...deliveriesByTabId.entries()].map(([tabId, results]) => ({
          tabId,
          results
        }))
      );
    } catch (error) {
      console.warn("ImmersionKit sentence delivery notification failed.", error);
    }
  }
}

function normalizeSentenceCandidates(
  message: QueueSentenceCandidatesMessage
): ProviderSentenceCandidate[] {
  const candidatesByHash = new Map<string, ProviderSentenceCandidate>();

  for (const candidate of message.candidates?.slice(0, MAX_CANDIDATES_PER_MESSAGE) ??
    []) {
    if (!candidate || typeof candidate.sourceText !== "string") {
      continue;
    }

    addNormalizedSentenceCandidate(
      candidatesByHash,
      candidate.sourceText,
      candidate.sentenceHash
    );
  }

  return [...candidatesByHash.values()];
}

function addNormalizedSentenceCandidate(
  candidatesByHash: Map<string, ProviderSentenceCandidate>,
  sentence: string,
  suppliedHash?: string
) {
  const normalizedText = sentence.replace(/\s+/g, " ").trim();
  if (!normalizedText) {
    return;
  }

  const sourceText = normalizedText.slice(0, MAX_SENTENCE_LENGTH);
  const sentenceHash = suppliedHash || hashSentence(sourceText);
  if (candidatesByHash.has(sentenceHash)) {
    return;
  }

  candidatesByHash.set(sentenceHash, {
    sentenceHash,
    sourceText
  });
}

export function rankCandidatesByAnalysis(
  candidates: readonly ProviderSentenceCandidate[],
  analysisResults: readonly AnalyzedSentenceCandidate[],
  curriculum?: CurriculumRuntimePolicy | null,
  learningItems: readonly LearningItem[] = []
): { candidates: ProviderSentenceCandidate[]; reasons: SentenceRankingReason[] } {
  const analysisByHash = new Map(
    analysisResults.map((result) => [result.entry.sentenceHash, result] as const)
  );
  const dueGrammarFeatureKeys = buildDueGrammarFeatureKeySet(learningItems);

  const rankedEntries = candidates
    .map((candidate, index) => ({
      candidate,
      index,
      ranking: buildRankingReason(
        candidate.sentenceHash,
        analysisByHash.get(candidate.sentenceHash),
        curriculum,
        dueGrammarFeatureKeys
      )
    }));
  const eligible = rankedEntries
    .filter((entry) => entry.ranking.curriculum?.eligible !== false)
    .sort(
      (left, right) =>
        right.ranking.score - left.ranking.score || left.index - right.index
    );
  const skipped = rankedEntries.filter(
    (entry) => entry.ranking.curriculum?.eligible === false
  );

  return {
    candidates: eligible.map((entry) => entry.candidate),
    reasons: [...eligible, ...skipped].map((entry, index) => ({
      ...entry.ranking,
      rank: entry.ranking.curriculum?.eligible === false ? 0 : index + 1
    }))
  };
}

function buildRankingReason(
  sentenceHash: string,
  result: AnalyzedSentenceCandidate | undefined,
  curriculum?: CurriculumRuntimePolicy | null,
  dueGrammarFeatureKeys: ReadonlySet<string> = new Set()
): SentenceRankingReason {
  if (!result) {
    return {
      sentenceHash,
      rank: 0,
      score: 0,
      primaryReason: "fallback-original-order"
    };
  }

  const grammarDueValue = computeGrammarDueValue(result, dueGrammarFeatureKeys);
  const sentencePolicy = curriculum
    ? evaluateSentencePolicyFit(result, curriculum)
    : null;
  const baseScore =
    result.entry.difficultyScore ??
    scoreFromSuitabilitySignals(result, grammarDueValue, sentencePolicy?.fit);
  const score = Math.max(0, baseScore - (sentencePolicy?.penalty ?? 0));
  const curriculumDecision = curriculum
    ? evaluateCurriculumEligibility(curriculum.config, {
        unitType: "sentence",
        score: scoreToDifficultyProxy(score),
        profile: curriculum.profile
      })
    : null;

  return {
    sentenceHash,
    rank: 0,
    score: roundSignal(score),
    primaryReason:
      curriculumDecision?.eligible === false
        ? "curriculum-gate"
        : choosePrimaryRankingReason(result, grammarDueValue, sentencePolicy),
    curriculum: curriculumDecision
      ? serializeCurriculumDecision(curriculumDecision)
      : undefined,
    signals: {
      vocabularyFit: roundSignal(result.suitabilitySignals.vocabularyFit),
      grammarFit: roundSignal(result.suitabilitySignals.grammarFit),
      dueTargetValue: roundSignal(result.suitabilitySignals.dueTargetValue),
      grammarDueValue: roundSignal(grammarDueValue),
      chunkUsefulness: roundSignal(result.suitabilitySignals.chunkUsefulness),
      ambiguityPenalty: roundSignal(result.suitabilitySignals.ambiguityPenalty),
      sentencePolicyFit: sentencePolicy ? roundSignal(sentencePolicy.fit) : undefined
    },
    sentencePolicy: sentencePolicy ? serializeSentencePolicyFit(sentencePolicy) : undefined
  };
}

function scoreToDifficultyProxy(score: number): number {
  if (!Number.isFinite(score)) {
    return 1;
  }

  // Existing analysis stores a suitability score where higher means easier to use now.
  // Curriculum bands expect difficulty, so invert until analysis exposes native difficulty.
  return Math.min(1, Math.max(0, 1 - score));
}

function serializeCurriculumDecision(decision: CurriculumEligibilityDecision) {
  return {
    configId: decision.configId,
    activeBandId: decision.activeBandId,
    eligible: decision.eligible,
    skipReason: decision.skipReason
  };
}

function choosePrimaryRankingReason(
  result: AnalyzedSentenceCandidate,
  grammarDueValue = 0,
  sentencePolicy: SentencePolicyFit | null = null
): SentenceRankingPrimaryReason {
  if (sentencePolicy?.outsideRange && sentencePolicy.penalty >= 0.05) {
    return "curriculum-sentence-policy";
  }

  if (typeof result.entry.difficultyScore === "number") {
    return "difficulty-score";
  }

  const signals = result.suitabilitySignals;
  const positiveSignals: {
    reason: SentenceRankingPrimaryReason;
    value: number;
  }[] = [
    { reason: "vocab-fit", value: signals.vocabularyFit },
    { reason: "due-target-value", value: signals.dueTargetValue },
    { reason: "grammar-due-value", value: grammarDueValue },
    { reason: "phrase-value", value: signals.chunkUsefulness }
  ];
  const bestPositive = positiveSignals.sort((left, right) => right.value - left.value)[0];

  if (signals.ambiguityPenalty >= Math.max(bestPositive?.value ?? 0, 0.4)) {
    return "ambiguity-penalty";
  }

  return bestPositive?.reason ?? "fallback-original-order";
}

function roundSignal(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function scoreFromSuitabilitySignals(
  result: AnalyzedSentenceCandidate,
  grammarDueValue = 0,
  sentencePolicyFit = 0
): number {
  return (
    result.suitabilitySignals.vocabularyFit * 0.28 +
    result.suitabilitySignals.grammarFit * 0.16 +
    result.suitabilitySignals.dueTargetValue * 0.18 +
    grammarDueValue * 0.12 +
    result.suitabilitySignals.chunkUsefulness * 0.14 -
    result.suitabilitySignals.ambiguityPenalty * 0.16 -
    result.suitabilitySignals.stretchDemand * 0.08 +
    sentencePolicyFit * 0.08
  );
}

type SentencePolicyFit = {
  activeBandId: string;
  tokenCount: number;
  tokenRange: readonly [number, number];
  fit: number;
  penalty: number;
  outsideRange: boolean;
  clausePolicy: string;
  targetPolicy: string;
};

function evaluateSentencePolicyFit(
  result: AnalyzedSentenceCandidate,
  curriculum: CurriculumRuntimePolicy
): SentencePolicyFit | null {
  if (result.entry.tokens.length === 0) {
    return null;
  }

  const activeContent = getActiveCurriculumContent({
    config: curriculum.config,
    profile: curriculum.profile
  });
  if (!activeContent.band || !activeContent.content) {
    return null;
  }

  const tokenCount = result.entry.tokens.length;
  const tokenRange = activeContent.content.sentencePolicy.tokenRange;
  const [minimumTokens, maximumTokens] = tokenRange;
  const outsideRange = tokenCount < minimumTokens || tokenCount > maximumTokens;
  const distance =
    tokenCount < minimumTokens
      ? minimumTokens - tokenCount
      : tokenCount > maximumTokens
        ? tokenCount - maximumTokens
        : 0;
  const fit = Math.max(0, 1 - distance / Math.max(1, maximumTokens));
  const penalty = outsideRange ? Math.min(0.22, distance * 0.025) : 0;

  return {
    activeBandId: activeContent.band.bandId,
    tokenCount,
    tokenRange,
    fit,
    penalty,
    outsideRange,
    clausePolicy: activeContent.content.sentencePolicy.clausePolicy,
    targetPolicy: activeContent.content.sentencePolicy.targetPolicy
  };
}

function serializeSentencePolicyFit(policy: SentencePolicyFit) {
  return {
    activeBandId: policy.activeBandId,
    tokenCount: policy.tokenCount,
    tokenRange: policy.tokenRange,
    fit: roundSignal(policy.fit),
    penalty: roundSignal(policy.penalty),
    outsideRange: policy.outsideRange,
    clausePolicy: policy.clausePolicy,
    targetPolicy: policy.targetPolicy
  };
}

function buildDueGrammarFeatureKeySet(
  learningItems: readonly LearningItem[]
): ReadonlySet<string> {
  const dueFeatureKeys = new Set<string>();
  for (const item of learningItems) {
    if (item.unitType !== "grammar-feature") {
      continue;
    }

    if (!shouldReceiveDueReviewBoost(item)) {
      continue;
    }

    const featureKey = item.unitRefId.trim();
    if (featureKey) {
      dueFeatureKeys.add(featureKey);
    }
  }

  return dueFeatureKeys;
}

function computeGrammarDueValue(
  result: AnalyzedSentenceCandidate,
  dueGrammarFeatureKeys: ReadonlySet<string>
): number {
  if (dueGrammarFeatureKeys.size === 0 || result.entry.grammarFeatures.length === 0) {
    return 0;
  }

  const dueMatches = result.entry.grammarFeatures.filter((feature) =>
    dueGrammarFeatureKeys.has(feature.featureKey)
  );
  if (dueMatches.length === 0) {
    return 0;
  }

  const confidence = dueMatches.reduce(
    (total, feature) => total + Math.max(0, Math.min(1, feature.confidence)),
    0
  );
  return Math.min(1, confidence / Math.max(1, result.entry.grammarFeatures.length));
}

function resolveTranslationAvailability(
  config: BackgroundRuntimeConfig
): TranslationAvailability {
  if (!config.settings.sentenceTranslationEnabled) {
    return "feature-disabled";
  }

  if (config.settings.provider !== "openai") {
    return "provider-disabled";
  }

  if (!config.credentials.openAiApiKey) {
    return "missing-credentials";
  }

  return "ready";
}

function toCachedSentenceResult(entry: SentenceCacheEntry): CachedSentenceResult {
  return {
    sentenceHash: entry.sentenceHash,
    sourceText: entry.sourceText,
    translatedText: entry.translatedText,
    learningNote: entry.learningNote,
    grammarNote: entry.learningNote.summary
  };
}

function isSentenceCacheEntryCompatible(
  entry: SentenceCacheEntry,
  config: BackgroundRuntimeConfig
): boolean {
  if (config.settings.provider !== "openai") {
    return true;
  }

  if (entry.provider && entry.provider !== "openai") {
    return false;
  }

  return entry.promptVersion === OPENAI_SENTENCE_PROMPT_VERSION;
}
