import type {
  LearningItem,
  SentenceAnalysisResult,
  SentenceRankingReason,
  SentenceTranslationResult,
  VocabStatus
} from "@immersionkit/shared";
import type { WordRenderEntry } from "../render-units/render-units";
import type { SentenceCandidateMetadata } from "./contracts";
import type { ProcessingContext } from "./storage";
import type { SentenceQueueOutcome } from "./sentence-queue-client";

const MAX_TEXT_NODE_TRACES = 300;
const MAX_TOKEN_DECISIONS = 2000;
const MAX_PHRASE_DECISIONS = 500;
const MAX_SENTENCE_TRACES = 300;
const MAX_TIMELINE_EVENTS = 1000;
const MAX_PREVIEW_LENGTH = 240;

export type DebugTraceSnapshotBase = {
  schemaVersion: 1;
  runId: string;
  startedAt: string;
  updatedAt: string;
  page: DebugPageSummary;
  context: DebugProcessingContextSummary | null;
  status: "starting" | "processing" | "active" | "stopped" | "error";
  stopReason?: string | null;
  nodes: DebugTextNodeTrace[];
  tokensByTokenId: Record<string, DebugTokenDecisionTrace>;
  phrasesByTokenId: Record<string, DebugPhraseDecisionTrace>;
  sentencesByHash: Record<string, DebugSentenceDecisionTrace>;
  events: DebugTimelineEvent[];
  selected?: DebugSelectionSnapshot | null;
  dropped: DebugTraceDroppedCounts;
};

export type DebugPreviousTraceSnapshot = DebugTraceSnapshotBase;

export type DebugTraceSnapshot = DebugTraceSnapshotBase & {
  previousRun: DebugPreviousTraceSnapshot | null;
};

export type DebugTraceDroppedCounts = {
  nodes: number;
  tokens: number;
  phrases: number;
  sentences: number;
  events: number;
};

export type DebugPageSummary = {
  url: string;
  hostname: string;
  pathname: string;
};

export type DebugProcessingContextSummary = {
  siteEnabled: boolean;
  discoveryRate: number;
  sentenceTranslationEnabled: boolean;
  provider: "none" | "openai";
  languagePair: string;
  sourceLanguage: string;
  targetLanguage: string;
  assetSource: string;
  renderUnitCount: number;
  renderAssetVersion: string | null;
  fallbackAsset: boolean;
  activeCurriculumBandId: string | null;
  curriculumConfigId: string | null;
  vocabEntryCount: number;
  learningItemCount: number;
  cachedSentenceAnalysisCount: number;
};

export type DebugTimelineEvent = {
  id: string;
  at: string;
  offsetMs: number;
  phase:
    | "boot"
    | "context"
    | "assets"
    | "dom"
    | "plan"
    | "render"
    | "sentence"
    | "background"
    | "provider"
    | "evidence"
    | "mutation"
    | "error";
  level: "info" | "pass" | "skip" | "warn" | "error";
  title: string;
  detail?: string;
  refs?: {
    nodeId?: string;
    tokenId?: string;
    phraseId?: string;
    sentenceHash?: string;
    renderUnitId?: string;
    lexemeId?: string;
  };
};

export type DebugTextNodeTrace = {
  nodeId: string;
  sourcePreview: string;
  sourceLength: number;
  offsetBase: number;
  windowIndex: number;
  replaced: boolean;
  injectedCount: number;
  phraseInjectedCount: number;
  phraseRejectedCount: number;
  contextSkippedCount: number;
  curriculumSkippedWordCount: number;
  curriculumSkippedPhraseCount: number;
  sentenceHashes: string[];
  tokenIds: string[];
  phraseTokenIds: string[];
};

export type DebugTokenDecisionTrace = {
  kind: "word";
  tokenId?: string;
  nodeId: string;
  sourceToken: string;
  normalizedSourceToken: string;
  targetToken?: string | null;
  sentenceHash: string | null;
  offset: { start: number; end: number };
  renderUnit: {
    found: boolean;
    renderUnitId?: string | null;
    lexemeId?: string | null;
    sourceLemma?: string | null;
    targetLemma?: string | null;
    pos?: string | null;
    matchMode?: string | null;
  };
  vocab: {
    status: "new" | "learning" | "known" | "ignored";
    ignored: boolean;
  } | null;
  learningItem: {
    exists: boolean;
    itemId?: string;
    due: boolean;
    suspended?: boolean;
  } | null;
  curriculum: {
    evaluated: boolean;
    eligible?: boolean;
    configId?: string;
    activeBandId?: string | null;
    activationReason?: string | null;
    skipReason?: string | null;
    discoveryRateFloor?: number | null;
  };
  sampling: {
    evaluated: boolean;
    baseRate: number;
    effectiveRate: number;
    seed: string;
    hashPrefix?: string;
    value?: number;
    passed?: boolean;
  };
  contextDecision: {
    evaluated: boolean;
    decision: "inject" | "skip" | "none";
    rationale?: string | null;
  };
  finalAction:
    | "injected"
    | "skipped-no-render-unit"
    | "skipped-ignored"
    | "skipped-curriculum"
    | "skipped-sampling"
    | "skipped-context"
    | "skipped-overlapped-by-phrase";
  explanation: string;
};

export type DebugPhraseDecisionTrace = {
  kind: "phrase";
  tokenId?: string;
  nodeId: string;
  phraseId: string;
  sourceText: string | null;
  normalizedSourceText?: string | null;
  targetText: string | null;
  sentenceHash: string | null;
  offset?: { start: number; end: number } | null;
  match: {
    sourceKind: string | null;
    category: string | null;
    ruleId: string | null;
    confidence: number | null;
    renderPolicy?: string | null;
    renderUnitMinBand?: string | null;
    phraseMinBand?: string | null;
  };
  learningItem: {
    exists: boolean;
    itemId?: string;
    suspended?: boolean;
    due?: boolean;
  };
  gates: {
    renderPolicyOk: boolean;
    activeLearningItem: boolean;
    usableTarget: boolean;
    spanResolved: boolean;
    curriculumEligible?: boolean;
    overlapSelected?: boolean;
  };
  rejectedReason: string | null;
  finalAction: "injected" | "rejected";
  explanation: string;
};

export type DebugSentenceDecisionTrace = {
  sentenceHash: string;
  sourcePreview: string;
  nodeIds: string[];
  reason: "injected-token" | "fixed-phrase-hint" | string;
  phraseHints: string[];
  knownWordCount: number;
  totalWordCount: number;
  knownRatio: number;
  queued: boolean;
  queueResponse?: {
    accepted: number;
    analyzed: number;
    analysisCacheHits: number;
    queued: number;
    skipped: number;
    cacheHits: number;
    translationAvailability: string;
  };
  analysis?: {
    cacheHit: boolean;
    tokenCount: number;
    phraseMatchCount: number;
    grammarFeatureCount: number;
    contextualDecisionCount: number;
    suitabilityScore?: number | null;
  };
  ranking?: {
    rank: number;
    score: number;
    primaryReason: string;
    curriculumEligible?: boolean;
    curriculumSkipReason?: string | null;
    signals?: Record<string, number | undefined>;
    sentencePolicy?: {
      tokenCount: number;
      tokenRange: readonly [number, number];
      fit: number;
      outsideRange: boolean;
    };
  };
  translation?: {
    cacheHit: boolean;
    rendered: boolean;
    providerReady: boolean;
    availability: string;
  };
};

export type DebugSelectionSnapshot =
  | {
      type: "word";
      tokenId: string;
      trace: DebugTokenDecisionTrace;
      dom: DebugSelectedDomSnapshot;
      sentence?: DebugSentenceDecisionTrace | null;
    }
  | {
      type: "phrase";
      tokenId: string;
      trace: DebugPhraseDecisionTrace;
      dom: DebugSelectedDomSnapshot;
      sentence?: DebugSentenceDecisionTrace | null;
    }
  | {
      type: "sentence-note";
      sentenceHash: string;
      sentence: DebugSentenceDecisionTrace | null;
      dom: DebugSelectedDomSnapshot;
    };

export type DebugSelectedDomSnapshot = {
  tagName: string;
  textContentPreview: string;
  boundingClientRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  attributes: Record<string, string>;
};

export type DebugTraceExport = {
  schemaVersion: 1;
  exportedAt: string;
  extensionBuildProfile: "diagnostic";
  trace: DebugTraceSnapshot;
  redactions: string[];
};

export type DebugDecisionSink = {
  recordTextNodeTrace(trace: DebugTextNodeTrace): void;
  recordTokenDecision(trace: DebugTokenDecisionTrace): void;
  recordPhraseDecision(trace: DebugPhraseDecisionTrace): void;
  recordSentenceCandidate(candidate: SentenceCandidateMetadata): void;
};

export type DebugTraceStore = DebugDecisionSink & {
  beginRun(input?: Partial<DebugPageSummary> & { reason?: string }): string;
  recordContext(runId: string, context: DebugProcessingContextSummary): void;
  recordRunError(runId: string, reason: string, error?: unknown): void;
  recordStopReason(runId: string, reason: string): void;
  markProcessing(runId: string): void;
  markActive(runId: string): void;
  recordEvent(event: DebugTimelineEventInput): void;
  recordSentenceQueueOutcome(input: {
    candidates: readonly SentenceCandidateMetadata[];
    outcome: SentenceQueueOutcome;
  }): void;
  recordSentenceTranslationsRendered(input: {
    results: readonly SentenceTranslationResult[];
    renderedCount: number;
    availability?: string;
  }): void;
  readSnapshot(): DebugTraceSnapshot;
  readTokenTrace(tokenId: string): DebugTokenDecisionTrace | null;
  readPhraseTrace(tokenId: string): DebugPhraseDecisionTrace | null;
  readSentenceTrace(sentenceHash: string): DebugSentenceDecisionTrace | null;
  setSelection(selection: DebugSelectionSnapshot | null): void;
  clearSelection(): void;
  exportTrace(): DebugTraceExport;
};

export type DebugTimelineEventInput = Omit<
  DebugTimelineEvent,
  "id" | "at" | "offsetMs"
>;

type MutableTraceState = DebugTraceSnapshot & {
  eventSequence: number;
  startedAtMs: number;
};

export function createDebugTraceStore(): DebugTraceStore {
  let state = createInitialState();
  const capWarnings = new Set<string>();

  function beginRun(input: Partial<DebugPageSummary> & { reason?: string } = {}): string {
    const previousRun =
      state.runId === "ikr-pending" ? state.previousRun : snapshotWithoutPrevious(state);
    state = createInitialState(input, previousRun);
    capWarnings.clear();
    addEvent({
      phase: "boot",
      level: "info",
      title: "debug trace started",
      detail: input.reason ?? "refresh-processing"
    });
    return state.runId;
  }

  function ensureRun(): void {
    if (state.runId === "ikr-pending") {
      beginRun({ reason: "lazy-debug-snapshot" });
    }
  }

  function updateTimestamp(): void {
    state.updatedAt = new Date().toISOString();
  }

  function addEvent(input: DebugTimelineEventInput): void {
    const now = Date.now();
    const event: DebugTimelineEvent = {
      ...input,
      id: `ike-${(state.eventSequence + 1).toString(36)}`,
      at: new Date(now).toISOString(),
      offsetMs: Math.max(0, now - state.startedAtMs)
    };
    state.eventSequence += 1;

    if (state.events.length >= MAX_TIMELINE_EVENTS) {
      state.events.shift();
      state.dropped.events += 1;
    }
    state.events.push(event);
    updateTimestamp();
  }

  function warnCap(kind: keyof DebugTraceDroppedCounts, max: number): void {
    if (capWarnings.has(kind)) {
      return;
    }
    capWarnings.add(kind);
    addEvent({
      phase: "error",
      level: "warn",
      title: `debug ${kind} cap reached`,
      detail: `Further ${kind} traces are dropped after ${max}.`
    });
  }

  return {
    beginRun,
    recordContext(runId, context) {
      if (runId !== state.runId) {
        return;
      }
      state.context = context;
      state.status = "processing";
      addEvent({
        phase: "context",
        level: context.siteEnabled ? "pass" : "skip",
        title: "content context loaded",
        detail: [
          `site=${context.siteEnabled ? "enabled" : "disabled"}`,
          `render_units=${context.renderUnitCount}`,
          `asset=${context.assetSource}`
        ].join(" ")
      });
    },
    recordRunError(runId, reason, error) {
      if (runId !== state.runId) {
        return;
      }
      state.status = "error";
      state.stopReason = reason;
      addEvent({
        phase: "error",
        level: "error",
        title: reason,
        detail: error instanceof Error ? error.message : stringifyError(error)
      });
    },
    recordStopReason(runId, reason) {
      if (runId !== state.runId) {
        return;
      }
      state.status = "stopped";
      state.stopReason = reason;
      addEvent({
        phase: "boot",
        level: "skip",
        title: "processing stopped",
        detail: reason
      });
    },
    markProcessing(runId) {
      if (runId !== state.runId) {
        return;
      }
      state.status = "processing";
      addEvent({
        phase: "dom",
        level: "info",
        title: "page processing started"
      });
    },
    markActive(runId) {
      if (runId !== state.runId) {
        return;
      }
      state.status = "active";
      addEvent({
        phase: "render",
        level: "pass",
        title: "page processing active",
        detail: `nodes=${state.nodes.length} tokens=${Object.keys(state.tokensByTokenId).length}`
      });
    },
    recordEvent(event) {
      ensureRun();
      addEvent(event);
    },
    recordTextNodeTrace(trace) {
      ensureRun();
      if (state.nodes.length >= MAX_TEXT_NODE_TRACES) {
        state.dropped.nodes += 1;
        warnCap("nodes", MAX_TEXT_NODE_TRACES);
        return;
      }
      state.nodes.push({
        ...trace,
        sourcePreview: createPreview(trace.sourcePreview),
        sentenceHashes: [...trace.sentenceHashes],
        tokenIds: [...trace.tokenIds],
        phraseTokenIds: [...trace.phraseTokenIds]
      });
      addEvent({
        phase: "dom",
        level: trace.replaced ? "pass" : "skip",
        title: `${trace.nodeId} scanned`,
        detail: `tokens=${trace.injectedCount} phrases=${trace.phraseInjectedCount} sentences=${trace.sentenceHashes.length}`,
        refs: { nodeId: trace.nodeId }
      });
    },
    recordTokenDecision(trace) {
      ensureRun();
      const key = trace.tokenId ?? createDecisionKey("word", trace);
      if (!(key in state.tokensByTokenId) &&
        Object.keys(state.tokensByTokenId).length >= MAX_TOKEN_DECISIONS) {
        state.dropped.tokens += 1;
        warnCap("tokens", MAX_TOKEN_DECISIONS);
        return;
      }
      state.tokensByTokenId[key] = {
        ...trace,
        sourceToken: createPreview(trace.sourceToken, 80),
        normalizedSourceToken: createPreview(trace.normalizedSourceToken, 80),
        targetToken: trace.targetToken ? createPreview(trace.targetToken, 80) : trace.targetToken
      };
      addEvent({
        phase: "plan",
        level: trace.finalAction === "injected" ? "pass" : "skip",
        title: `${trace.sourceToken} -> ${trace.finalAction}`,
        detail: trace.explanation,
        refs: {
          nodeId: trace.nodeId,
          tokenId: trace.tokenId,
          sentenceHash: trace.sentenceHash ?? undefined,
          renderUnitId: trace.renderUnit.renderUnitId ?? undefined,
          lexemeId: trace.renderUnit.lexemeId ?? undefined
        }
      });
    },
    recordPhraseDecision(trace) {
      ensureRun();
      const key = trace.tokenId ?? createDecisionKey("phrase", trace);
      if (!(key in state.phrasesByTokenId) &&
        Object.keys(state.phrasesByTokenId).length >= MAX_PHRASE_DECISIONS) {
        state.dropped.phrases += 1;
        warnCap("phrases", MAX_PHRASE_DECISIONS);
        return;
      }
      state.phrasesByTokenId[key] = {
        ...trace,
        sourceText: trace.sourceText ? createPreview(trace.sourceText, 120) : trace.sourceText,
        targetText: trace.targetText ? createPreview(trace.targetText, 120) : trace.targetText
      };
      addEvent({
        phase: "plan",
        level: trace.finalAction === "injected" ? "pass" : "skip",
        title: `${trace.phraseId} -> ${trace.finalAction}`,
        detail: trace.explanation,
        refs: {
          nodeId: trace.nodeId,
          tokenId: trace.tokenId,
          phraseId: trace.phraseId,
          sentenceHash: trace.sentenceHash ?? undefined
        }
      });
    },
    recordSentenceCandidate(candidate) {
      ensureRun();
      recordSentenceCandidateInternal(candidate);
    },
    recordSentenceQueueOutcome(input) {
      ensureRun();
      const candidateHashes = new Set(input.candidates.map((candidate) => candidate.sentenceHash));
      for (const candidate of input.candidates) {
        recordSentenceCandidateInternal(candidate);
        upsertSentenceTrace(candidate.sentenceHash, (existing) => ({
          ...existing,
          queued: true,
          queueResponse: {
            accepted: input.outcome.accepted,
            analyzed: input.outcome.analyzed,
            analysisCacheHits: input.outcome.analysisCacheHits,
            queued: input.outcome.queued,
            skipped: input.outcome.skipped,
            cacheHits: input.outcome.cacheHits,
            translationAvailability: input.outcome.translationAvailability
          },
          translation: {
            cacheHit: existing.translation?.cacheHit ?? false,
            rendered: existing.translation?.rendered ?? false,
            providerReady: input.outcome.translationAvailability === "ready",
            availability: input.outcome.translationAvailability
          }
        }));
      }

      for (const result of input.outcome.analysisResults) {
        mergeAnalysisResult(result);
      }

      for (const reason of input.outcome.rankingReasons) {
        mergeRankingReason(reason);
      }

      for (const result of input.outcome.cachedResults) {
        upsertSentenceTrace(result.sentenceHash, (existing) => ({
          ...existing,
          sourcePreview: createPreview(existing.sourcePreview || result.sourceText),
          translation: {
            cacheHit: true,
            rendered: existing.translation?.rendered ?? candidateHashes.has(result.sentenceHash),
            providerReady: input.outcome.translationAvailability === "ready",
            availability: input.outcome.translationAvailability
          }
        }));
      }

      addEvent({
        phase: "background",
        level: input.outcome.translationAvailability === "ready" ? "pass" : "skip",
        title: "sentence queue response",
        detail: `accepted=${input.outcome.accepted} analyzed=${input.outcome.analyzed} queued=${input.outcome.queued} translation=${input.outcome.translationAvailability}`
      });
    },
    recordSentenceTranslationsRendered(input) {
      ensureRun();
      for (const result of input.results) {
        upsertSentenceTrace(result.sentenceHash, (existing) => ({
          ...existing,
          sourcePreview: createPreview(existing.sourcePreview || result.sourceText),
          translation: {
            cacheHit: existing.translation?.cacheHit ?? false,
            rendered: true,
            providerReady: input.availability === "ready" || existing.translation?.providerReady === true,
            availability: input.availability ?? existing.translation?.availability ?? "ready"
          }
        }));
      }
      addEvent({
        phase: "render",
        level: input.renderedCount > 0 ? "pass" : "skip",
        title: "sentence translations rendered",
        detail: `rendered=${input.renderedCount}`
      });
    },
    readSnapshot() {
      ensureRun();
      return cloneSnapshot(state);
    },
    readTokenTrace(tokenId) {
      return state.tokensByTokenId[tokenId] ?? null;
    },
    readPhraseTrace(tokenId) {
      return state.phrasesByTokenId[tokenId] ?? null;
    },
    readSentenceTrace(sentenceHash) {
      return state.sentencesByHash[sentenceHash] ?? null;
    },
    setSelection(selection) {
      state.selected = selection;
      updateTimestamp();
    },
    clearSelection() {
      state.selected = null;
      updateTimestamp();
    },
    exportTrace() {
      ensureRun();
      return {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        extensionBuildProfile: "diagnostic",
        trace: cloneSnapshot(state),
        redactions: [
          "provider API keys are not captured",
          "page URL query parameters and fragments are removed",
          `page text previews are capped to ${MAX_PREVIEW_LENGTH} characters`,
          "full user-data records are summarized by counts"
        ]
      };
    }
  };

  function recordSentenceCandidateInternal(
    candidate: SentenceCandidateMetadata
  ): void {
    upsertSentenceTrace(candidate.sentenceHash, (existing) => ({
      sentenceHash: candidate.sentenceHash,
      sourcePreview: createPreview(existing.sourcePreview || candidate.sentence),
      nodeIds: unique([...existing.nodeIds, candidate.nodeId]),
      reason: existing.reason ?? candidate.reason,
      phraseHints: unique([...existing.phraseHints, ...candidate.phraseHints]),
      knownWordCount: candidate.knownWordCount,
      totalWordCount: candidate.totalWordCount,
      knownRatio: candidate.knownRatio,
      queued: existing.queued,
      queueResponse: existing.queueResponse,
      analysis: existing.analysis,
      ranking: existing.ranking,
      translation: existing.translation
    }));
  }

  function upsertSentenceTrace(
    sentenceHash: string,
    reducer: (
      existing: DebugSentenceDecisionTrace
    ) => DebugSentenceDecisionTrace
  ): void {
    const existing = state.sentencesByHash[sentenceHash] ?? createEmptySentenceTrace(sentenceHash);
    if (!(sentenceHash in state.sentencesByHash) &&
      Object.keys(state.sentencesByHash).length >= MAX_SENTENCE_TRACES) {
      state.dropped.sentences += 1;
      warnCap("sentences", MAX_SENTENCE_TRACES);
      return;
    }
    state.sentencesByHash[sentenceHash] = reducer(existing);
    updateTimestamp();
  }

  function mergeAnalysisResult(result: SentenceAnalysisResult): void {
    const sentenceHash = result.entry.sentenceHash;
    upsertSentenceTrace(sentenceHash, (existing) => ({
      ...existing,
      sourcePreview: createPreview(existing.sourcePreview || result.entry.sourceText),
      analysis: {
        cacheHit: result.cacheHit,
        tokenCount: result.entry.tokens.length,
        phraseMatchCount: result.entry.phraseMatches.length,
        grammarFeatureCount: result.entry.grammarFeatures.length,
        contextualDecisionCount: result.entry.contextualWordCandidates.length,
        suitabilityScore: result.entry.difficultyScore ?? null
      }
    }));
  }

  function mergeRankingReason(reason: SentenceRankingReason): void {
    upsertSentenceTrace(reason.sentenceHash, (existing) => ({
      ...existing,
      ranking: {
        rank: reason.rank,
        score: reason.score,
        primaryReason: reason.primaryReason,
        curriculumEligible: reason.curriculum?.eligible,
        curriculumSkipReason: reason.curriculum?.skipReason ?? null,
        signals: reason.signals,
        sentencePolicy: reason.sentencePolicy
          ? {
              tokenCount: reason.sentencePolicy.tokenCount,
              tokenRange: reason.sentencePolicy.tokenRange,
              fit: reason.sentencePolicy.fit,
              outsideRange: reason.sentencePolicy.outsideRange
            }
          : undefined
      }
    }));
  }
}

export function summarizeProcessingContext(
  context: ProcessingContext,
  sentenceTranslationEnabled: boolean
): DebugProcessingContextSummary {
  return {
    siteEnabled: context.siteEnabled,
    discoveryRate: context.discoveryRate,
    sentenceTranslationEnabled,
    provider: context.settings.provider === "openai" ? "openai" : "none",
    languagePair: context.settings.languagePair ?? "en-es",
    sourceLanguage: context.settings.sourceLanguage ?? "en",
    targetLanguage: context.settings.targetLanguage ?? "es",
    assetSource: context.renderAssetInfo.source,
    renderUnitCount: context.renderAssetInfo.entryCount,
    renderAssetVersion: context.renderAssetInfo.assetVersion,
    fallbackAsset: context.renderAssetInfo.isFallback,
    activeCurriculumBandId: context.learningProfile.activeVocabularyBandId ?? null,
    curriculumConfigId: context.curriculumConfig.configId,
    vocabEntryCount: context.vocabByLexemeId.size,
    learningItemCount: context.learningItemsByUnitRefId.size,
    cachedSentenceAnalysisCount: context.analysisContext.entryCount
  };
}

export function createWordDecisionTrace(input: {
  tokenId?: string;
  nodeId: string;
  sourceToken: string;
  normalizedSourceToken: string;
  targetToken?: string | null;
  sentenceHash: string | null;
  start: number;
  end: number;
  wordEntry?: WordRenderEntry | null;
  status?: VocabStatus | null;
  learningItem?: LearningItem | null;
  due?: boolean;
  activationDecision?: {
    eligible: boolean;
    configId?: string;
    activeBandId?: string | null;
    discoveryRateFloor?: number | null;
    activationReason?: string | null;
    skipReason?: string | null;
  } | null;
  sampling?: DebugTokenDecisionTrace["sampling"];
  contextDecision?: DebugTokenDecisionTrace["contextDecision"];
  finalAction: DebugTokenDecisionTrace["finalAction"];
  explanation: string;
}): DebugTokenDecisionTrace {
  return {
    kind: "word",
    tokenId: input.tokenId,
    nodeId: input.nodeId,
    sourceToken: input.sourceToken,
    normalizedSourceToken: input.normalizedSourceToken,
    targetToken: input.targetToken ?? null,
    sentenceHash: input.sentenceHash,
    offset: {
      start: input.start,
      end: input.end
    },
    renderUnit: input.wordEntry
      ? {
          found: true,
          renderUnitId: input.wordEntry.renderUnitId,
          lexemeId: input.wordEntry.lexemeId,
          sourceLemma: input.wordEntry.sourceLemma,
          targetLemma: input.wordEntry.targetLemma,
          pos: input.wordEntry.pos,
          matchMode: input.wordEntry.renderUnitMatchMode ?? null
        }
      : {
          found: false
        },
    vocab: input.status
      ? {
          status: input.status,
          ignored: input.status === "ignored"
        }
      : null,
    learningItem: input.learningItem
      ? {
          exists: true,
          itemId: input.learningItem.itemId,
          due: Boolean(input.due),
          suspended: input.learningItem.suspended
        }
      : input.wordEntry
        ? {
            exists: false,
            due: Boolean(input.due)
          }
        : null,
    curriculum: input.activationDecision
      ? {
          evaluated: true,
          eligible: input.activationDecision.eligible,
          configId: input.activationDecision.configId,
          activeBandId: input.activationDecision.activeBandId,
          activationReason: input.activationDecision.activationReason,
          skipReason: input.activationDecision.skipReason,
          discoveryRateFloor: input.activationDecision.discoveryRateFloor
        }
      : {
          evaluated: false
        },
    sampling: input.sampling ?? {
      evaluated: false,
      baseRate: 0,
      effectiveRate: 0,
      seed: ""
    },
    contextDecision: input.contextDecision ?? {
      evaluated: false,
      decision: "none"
    },
    finalAction: input.finalAction,
    explanation: input.explanation
  };
}

function createInitialState(
  input: Partial<DebugPageSummary> & { reason?: string } = {},
  previousRun: DebugPreviousTraceSnapshot | null = null
): MutableTraceState {
  const now = new Date();
  const page = readPageSummary(input);
  return {
    schemaVersion: 1,
    runId: input.reason ? createRunId() : "ikr-pending",
    startedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    startedAtMs: now.getTime(),
    eventSequence: 0,
    page,
    context: null,
    status: "starting",
    stopReason: null,
    nodes: [],
    tokensByTokenId: {},
    phrasesByTokenId: {},
    sentencesByHash: {},
    events: [],
    selected: null,
    previousRun,
    dropped: {
      nodes: 0,
      tokens: 0,
      phrases: 0,
      sentences: 0,
      events: 0
    }
  };
}

function readPageSummary(input: Partial<DebugPageSummary>): DebugPageSummary {
  const url = sanitizeUrl(input.url ?? window.location.href);
  let parsed: URL | null = null;
  try {
    parsed = new URL(url);
  } catch {
    parsed = null;
  }

  return {
    url,
    hostname: input.hostname ?? parsed?.hostname ?? window.location.hostname,
    pathname: input.pathname ?? parsed?.pathname ?? window.location.pathname
  };
}

function sanitizeUrl(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return value.split(/[?#]/, 1)[0] ?? value;
  }
}

function createRunId(): string {
  const seed = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `ikr-${seed}`;
}

function cloneSnapshot(snapshot: DebugTraceSnapshot): DebugTraceSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as DebugTraceSnapshot;
}

function snapshotWithoutPrevious(snapshot: DebugTraceSnapshot): DebugPreviousTraceSnapshot {
  const cloned = cloneSnapshot(snapshot);
  const { previousRun: _previousRun, ...withoutPrevious } = cloned;
  return withoutPrevious;
}

function createPreview(value: string, maxLength = MAX_PREVIEW_LENGTH): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function stringifyError(error: unknown): string {
  if (error === null || error === undefined) {
    return "";
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function createDecisionKey(
  kind: "word" | "phrase",
  trace: DebugTokenDecisionTrace | DebugPhraseDecisionTrace
): string {
  if (kind === "word") {
    const word = trace as DebugTokenDecisionTrace;
    return `${word.nodeId}:word:${word.offset.start}:${word.offset.end}:${word.normalizedSourceToken}`;
  }

  const phrase = trace as DebugPhraseDecisionTrace;
  return `${phrase.nodeId}:phrase:${phrase.offset?.start ?? "x"}:${phrase.offset?.end ?? "x"}:${phrase.phraseId}`;
}

function createEmptySentenceTrace(sentenceHash: string): DebugSentenceDecisionTrace {
  return {
    sentenceHash,
    sourcePreview: "",
    nodeIds: [],
    reason: "injected-token",
    phraseHints: [],
    knownWordCount: 0,
    totalWordCount: 0,
    knownRatio: 0,
    queued: false
  };
}

export function createSelectedDomSnapshot(element: HTMLElement): DebugSelectedDomSnapshot {
  const rect = element.getBoundingClientRect();
  const attributes: Record<string, string> = {};
  for (const attribute of [...element.attributes]) {
    if (attribute.name.length > 80 || attribute.value.length > 400) {
      continue;
    }
    attributes[attribute.name] = attribute.value;
  }

  return {
    tagName: element.tagName.toLowerCase(),
    textContentPreview: createPreview(element.textContent ?? "", 160),
    boundingClientRect: {
      x: roundRectValue(rect.x),
      y: roundRectValue(rect.y),
      width: roundRectValue(rect.width),
      height: roundRectValue(rect.height)
    },
    attributes
  };
}

function roundRectValue(value: number): number {
  return Math.round(value * 10) / 10;
}
