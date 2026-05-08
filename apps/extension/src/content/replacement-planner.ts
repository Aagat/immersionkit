import { hashString, normalizeToken } from "@immersionkit/shared";
import type {
  LearningItem,
  UserVocabEntry,
  VocabStatus
} from "@immersionkit/shared";
import type { WordRenderEntry } from "../render-units/render-units";

import type {
  InjectedWordKind,
  SentenceCandidateMetadata
} from "./contracts";
import { findSentenceForOffset, scoreSentenceCandidates, segmentSentences } from "./sentences";
import {
  findRuntimeWordDecision,
  type CachedPhraseMatch,
  type CachedWordRenderDecision,
  type RuntimeAnalysisContext
} from "./storage";
import { preserveWordCasing, segmentText } from "./tokenize";

export type ReplacementPlannerContext = {
  discoveryRate: number;
  samplingSeed: string;
  nodeId: string;
  wordRenderIndex: Map<string, WordRenderEntry>;
  vocabByLexemeId: Map<string, UserVocabEntry>;
  isKnownWordForScoring: (word: string) => boolean;
  isDueForReview?: (lexemeId: string) => boolean;
  analysisContext?: RuntimeAnalysisContext;
  cachedWordRenderDecisions?: Map<string, CachedWordRenderDecision[]>;
  cachedPhraseMatchesBySentenceHash?: Map<string, CachedPhraseMatch[]>;
  sentenceHintPhrases?: readonly string[];
  learningItemsByUnitRefId?: Map<string, LearningItem>;
  shouldActivateWord?: (input: WordActivationInput) => ActivationDecision;
  shouldActivatePhrase?: (input: PhraseActivationInput) => ActivationDecision;
  allowPhraseOnlyCandidates?: boolean;
};

export type ReplacementPlan = {
  sourceText: string;
  nodeId: string;
  spans: ReplacementSpan[];
  phraseRejections: PhraseRenderRejection[];
  sentenceCandidates: SentenceCandidateMetadata[];
  sentenceHashes: string[];
  diagnostics: ReplacementPlanDiagnostics;
};

export type ReplacementPlanDiagnostics = {
  injectedCount: number;
  knownCount: number;
  discoveryCount: number;
  contextSkippedCount: number;
  phraseInjectedCount: number;
  phraseRejectedCount: number;
  curriculumSkippedWordCount: number;
  curriculumSkippedPhraseCount: number;
};

export type ReplacementSpan = WordReplacementSpan | PhraseReplacementSpan;

export type WordReplacementSpan = {
  kind: "word";
  tokenId: string;
  nodeId: string;
  start: number;
  end: number;
  sourceToken: string;
  targetToken: string;
  sentence: {
    text: string;
    hash: string;
  } | null;
  wordEntry: WordRenderEntry;
  status: VocabStatus;
  wordKind: InjectedWordKind;
  isDueForReview: boolean;
  activationReason?: string | null;
};

export type PhraseReplacementSpan = {
  kind: "phrase";
  tokenId: string;
  nodeId: string;
  start: number;
  end: number;
  sourceText: string;
  targetText: string;
  sentence: {
    text: string;
    hash: string;
  };
  phraseId: string;
  itemId: string;
  category: string;
  sourceKind: string;
  ruleId: string;
  confidence: number;
  isDueForReview: boolean;
};

export type ActivationDecision = {
  eligible: boolean;
  configId?: string;
  activeBandId?: string | null;
  discoveryRateFloor?: number | null;
  activationReason?: string | null;
  skipReason?: string | null;
};

export type WordActivationInput = {
  wordEntry: WordRenderEntry;
  learningItem: LearningItem | null;
  status: VocabStatus;
  isDueForReview: boolean;
};

export type PhraseActivationInput = {
  phraseId: string;
  sourceText: string;
  learningItem: LearningItem;
  confidence: number;
  sourceKind: CachedPhraseMatch["sourceKind"];
  category: CachedPhraseMatch["category"];
  renderUnitMinBand?: string;
  isDueForReview: boolean;
};

type PhraseRenderCandidate = {
  phraseId: string;
  itemId: string;
  sourceKind: string;
  category: string;
  ruleId: string;
  confidence: number;
  start: number;
  end: number;
  sourceText: string;
  targetText: string;
  sentence: {
    text: string;
    hash: string;
  };
  isDueForReview: boolean;
};

export type PhraseRenderRejection = {
  phraseId: string;
  reason: string;
  sourceText: string | null;
  targetText: string | null;
  sourceKind: string | null;
  category: string | null;
  sentenceHash: string | null;
};

export function planTextReplacements(input: {
  sourceText: string;
  context: ReplacementPlannerContext;
  offsetBase: number;
}): ReplacementPlan {
  const { sourceText, context, offsetBase } = input;
  const segments = segmentText(sourceText);
  const sentences = segmentSentences(sourceText, context.sentenceHintPhrases);
  const phraseCandidates = selectPhraseRenderCandidates({
    sourceText,
    sentences,
    cachedPhraseMatchesBySentenceHash: context.cachedPhraseMatchesBySentenceHash,
    analysisContext: context.analysisContext,
    learningItemsByUnitRefId: context.learningItemsByUnitRefId,
    shouldActivatePhrase: context.shouldActivatePhrase
  });
  const injectedSentenceHashes = new Set<string>();
  const spans: ReplacementSpan[] = [];
  let injectedCount = 0;
  let knownCount = 0;
  let discoveryCount = 0;
  let contextSkippedCount = 0;
  let curriculumSkippedWordCount = 0;
  let phraseInjectedCount = 0;
  let tokenIndex = 0;
  let coveredUntil = 0;

  for (const segment of segments) {
    const phraseCandidate = phraseCandidates.acceptedByStart.get(segment.start);
    if (phraseCandidate) {
      spans.push({
        kind: "phrase",
        tokenId: `${context.nodeId}-t${tokenIndex}`,
        nodeId: context.nodeId,
        start: phraseCandidate.start,
        end: phraseCandidate.end,
        sourceText: sourceText.slice(phraseCandidate.start, phraseCandidate.end),
        targetText: phraseCandidate.targetText,
        sentence: phraseCandidate.sentence,
        phraseId: phraseCandidate.phraseId,
        itemId: phraseCandidate.itemId,
        category: phraseCandidate.category,
        sourceKind: phraseCandidate.sourceKind,
        ruleId: phraseCandidate.ruleId,
        confidence: phraseCandidate.confidence,
        isDueForReview: phraseCandidate.isDueForReview
      });
      tokenIndex += 1;
      injectedSentenceHashes.add(phraseCandidate.sentence.hash);
      injectedCount += 1;
      discoveryCount += 1;
      phraseInjectedCount += 1;
      coveredUntil = phraseCandidate.end;
      continue;
    }

    if (segment.start < coveredUntil || segment.kind === "text") {
      continue;
    }

    const sentence = findSentenceForOffset(sentences, segment.start);
    const cachedInjectDecision = sentence
      ? findCachedWordRenderDecision({
          decisionsBySentenceHash: context.cachedWordRenderDecisions,
          analysisContext: context.analysisContext,
          sentenceHash: sentence.hash,
          sourceToken: segment.value,
          decision: "inject"
        })
      : null;
    const wordEntry =
      context.wordRenderIndex.get(segment.normalized) ??
      createWordEntryFromCachedDecision(cachedInjectDecision);
    if (!wordEntry) {
      continue;
    }

    const status = getVocabStatus(wordEntry.lexemeId, context.vocabByLexemeId);
    if (status === "ignored") {
      continue;
    }

    const wordKind: InjectedWordKind = status === "known" ? "known" : "discovery";
    const isDueForReview = context.isDueForReview?.(wordEntry.lexemeId) ?? false;
    const learningItem =
      context.learningItemsByUnitRefId?.get(wordEntry.lexemeId) ?? null;
    let activationDecision: ActivationDecision | null = null;
    if (status === "new" && !isDueForReview && context.shouldActivateWord) {
      activationDecision = context.shouldActivateWord({
        wordEntry,
        learningItem,
        status,
        isDueForReview
      });
      if (!activationDecision.eligible) {
        curriculumSkippedWordCount += 1;
        continue;
      }
    }

    if (
      wordKind === "discovery" &&
      !isDueForReview &&
      !shouldInjectDiscoveryToken(
        `${context.samplingSeed}:${segment.normalized}:${offsetBase + segment.start}`,
        effectiveDiscoveryRate(context.discoveryRate, activationDecision)
      )
    ) {
      continue;
    }

    const cachedSkipDecision = sentence
      ? findCachedSkipDecision({
          decisionsBySentenceHash: context.cachedWordRenderDecisions,
          analysisContext: context.analysisContext,
          sentenceHash: sentence.hash,
          lexemeId: wordEntry.lexemeId,
          renderUnitId: wordEntry.renderUnitId,
          sourceToken: segment.value
        })
      : null;
    if (cachedSkipDecision) {
      contextSkippedCount += 1;
      continue;
    }

    if (sentence) {
      injectedSentenceHashes.add(sentence.hash);
    }

    spans.push({
      kind: "word",
      tokenId: `${context.nodeId}-t${tokenIndex}`,
      nodeId: context.nodeId,
      start: segment.start,
      end: segment.end,
      sourceToken: segment.value,
      targetToken: preserveWordCasing(segment.value, wordEntry.targetLemma),
      sentence,
      wordEntry,
      status,
      wordKind,
      isDueForReview,
      activationReason: activationDecision?.activationReason ?? null
    });
    tokenIndex += 1;
    injectedCount += 1;

    if (wordKind === "known") {
      knownCount += 1;
    } else {
      discoveryCount += 1;
    }
  }

  const scoredSentenceCandidates = scoreSentenceCandidates(
    sentences,
    context.nodeId,
    injectedSentenceHashes,
    context.isKnownWordForScoring
  );
  const sentenceCandidates = context.allowPhraseOnlyCandidates
    ? scoredSentenceCandidates
    : scoredSentenceCandidates.filter((candidate) => candidate.reason === "injected-token");

  return {
    sourceText,
    nodeId: context.nodeId,
    spans,
    phraseRejections: phraseCandidates.rejected,
    sentenceCandidates,
    sentenceHashes: sentences.map((sentence) => sentence.hash),
    diagnostics: {
      injectedCount,
      knownCount,
      discoveryCount,
      contextSkippedCount,
      phraseInjectedCount,
      phraseRejectedCount: phraseCandidates.rejected.length,
      curriculumSkippedWordCount,
      curriculumSkippedPhraseCount: phraseCandidates.curriculumSkippedCount
    }
  };
}

function selectPhraseRenderCandidates(input: {
  sourceText: string;
  sentences: ReturnType<typeof segmentSentences>;
  cachedPhraseMatchesBySentenceHash?: Map<string, CachedPhraseMatch[]>;
  analysisContext?: RuntimeAnalysisContext;
  learningItemsByUnitRefId?: Map<string, LearningItem>;
  shouldActivatePhrase?: (input: PhraseActivationInput) => ActivationDecision;
}): {
  acceptedByStart: Map<number, PhraseRenderCandidate>;
  rejected: PhraseRenderRejection[];
  curriculumSkippedCount: number;
} {
  const acceptedByStart = new Map<number, PhraseRenderCandidate>();
  const rejected: PhraseRenderRejection[] = [];
  const candidates: PhraseRenderCandidate[] = [];
  let curriculumSkippedCount = 0;

  for (const sentence of input.sentences) {
    const matches =
      input.analysisContext?.bySentenceHash.get(sentence.hash)?.phraseMatches ??
      input.cachedPhraseMatchesBySentenceHash?.get(sentence.hash) ??
      [];
    for (const match of matches) {
      if (!isInlinePhraseRenderPolicy(match.renderPolicy)) {
        rejected.push(
          createPhraseRenderRejection(
            match,
            sentence.hash,
            `render-policy-${match.renderPolicy ?? "non-inline"}`
          )
        );
        continue;
      }

      const learningItem = input.learningItemsByUnitRefId?.get(match.phraseId);
      if (!learningItem || learningItem.unitType !== "phrase" || learningItem.suspended) {
        rejected.push(
          createPhraseRenderRejection(
            match,
            sentence.hash,
            "missing-active-learning-item"
          )
        );
        continue;
      }

      if (!hasUsablePhraseTarget(learningItem.targetText)) {
        rejected.push(
          createPhraseRenderRejection(match, sentence.hash, "blank-target", {
            targetText: learningItem.targetText
          })
        );
        continue;
      }

      const start = sentence.start + match.span.startChar;
      const end = sentence.start + match.span.endChar;
      const sourceSlice = input.sourceText.slice(start, end);
      if (
        start < sentence.start ||
        end > sentence.end ||
        normalizePhraseText(sourceSlice) !== normalizePhraseText(match.sourceText)
      ) {
        rejected.push(
          createPhraseRenderRejection(match, sentence.hash, "span-mismatch", {
            targetText: learningItem.targetText
          })
        );
        continue;
      }

      const isDueForReview =
        Boolean(learningItem.nextReviewAt) &&
        Date.parse(learningItem.nextReviewAt ?? "") <= Date.now();
      if (input.shouldActivatePhrase) {
        const curriculumDecision = input.shouldActivatePhrase({
          phraseId: match.phraseId,
          sourceText: match.sourceText,
          learningItem,
          confidence: match.confidence,
          sourceKind: match.sourceKind,
          category: match.category,
          renderUnitMinBand: match.renderUnitMinBand,
          isDueForReview
        });
        if (!curriculumDecision.eligible) {
          rejected.push(
            createPhraseRenderRejection(
              match,
              sentence.hash,
              `curriculum-${curriculumDecision.skipReason ?? "skip"}`,
              { targetText: learningItem.targetText }
            )
          );
          curriculumSkippedCount += 1;
          continue;
        }
      }

      candidates.push({
        phraseId: match.phraseId,
        itemId: learningItem.itemId,
        sourceKind: match.sourceKind,
        category: match.category,
        ruleId: match.ruleId,
        confidence: match.confidence,
        start,
        end,
        sourceText: match.sourceText,
        targetText: learningItem.targetText,
        sentence,
        isDueForReview
      });
    }
  }

  const selected: PhraseRenderCandidate[] = [];
  for (const candidate of candidates.sort(comparePhraseCandidates)) {
    if (
      selected.some((existing) =>
        spansOverlap(candidate.start, candidate.end, existing.start, existing.end)
      )
    ) {
      rejected.push(createPhraseRenderRejectionFromCandidate(candidate, "overlap"));
      continue;
    }

    selected.push(candidate);
    acceptedByStart.set(candidate.start, candidate);
  }

  return {
    acceptedByStart,
    rejected,
    curriculumSkippedCount
  };
}

function getVocabStatus(
  lexemeId: string,
  vocabByLexemeId: Map<string, UserVocabEntry>
): VocabStatus {
  const entry = vocabByLexemeId.get(lexemeId);
  return entry?.status ?? "new";
}

function shouldInjectDiscoveryToken(seed: string, discoveryRate: number): boolean {
  if (discoveryRate <= 0) {
    return false;
  }

  if (discoveryRate >= 1) {
    return true;
  }

  const hashPrefix = hashString(seed).slice(0, 8);
  const hashValue = Number.parseInt(hashPrefix, 16);
  return hashValue / 0xffffffff <= discoveryRate;
}

function effectiveDiscoveryRate(
  baseRate: number,
  activationDecision: ActivationDecision | null
): number {
  const floor = activationDecision?.discoveryRateFloor;
  if (typeof floor !== "number" || !Number.isFinite(floor)) {
    return baseRate;
  }

  return Math.min(1, Math.max(baseRate, floor));
}

function createWordEntryFromCachedDecision(
  decision: CachedWordRenderDecision | null
): WordRenderEntry | null {
  if (
    !decision ||
    decision.decision !== "inject" ||
    !decision.renderUnitId ||
    !decision.targetText ||
    !decision.candidatePos
  ) {
    return null;
  }

  return {
    lexemeId: decision.lexemeId,
    renderUnitId: decision.renderUnitId,
    renderUnitMinBand: decision.renderUnitMinBand ?? "",
    renderUnitMatchMode: "analyzer-pattern",
    normalizedSourceText:
      decision.normalizedSourceText ?? decision.normalizedText,
    targetText: decision.targetText,
    sourceLemma:
      decision.candidateLemma ??
      decision.normalizedSourceText ??
      decision.normalizedText,
    targetLemma: decision.targetText,
    pos: decision.candidatePos,
    frequencyRank: null,
    confidence: decision.confidence ?? 0.9,
    sourceLanguage: "en",
    targetLanguage: "es",
    sourceDataset: "render-units"
  };
}

function findCachedWordRenderDecision(input: {
  analysisContext?: RuntimeAnalysisContext;
  decisionsBySentenceHash?: Map<string, CachedWordRenderDecision[]>;
  sentenceHash: string;
  sourceToken: string;
  decision: "inject" | "skip";
  lexemeId?: string;
  renderUnitId?: string;
}): CachedWordRenderDecision | null {
  const indexedDecision = findRuntimeWordDecision({
    analysisContext: input.analysisContext,
    sentenceHash: input.sentenceHash,
    sourceToken: input.sourceToken,
    decision: input.decision,
    lexemeId: input.lexemeId,
    renderUnitId: input.renderUnitId
  });
  if (indexedDecision) {
    return indexedDecision;
  }

  const decisions = input.decisionsBySentenceHash?.get(input.sentenceHash);
  if (!decisions || decisions.length === 0) {
    return null;
  }

  const normalizedSourceToken = normalizeToken(input.sourceToken);
  return (
    decisions.find((decision) => {
      if (decision.decision !== input.decision) {
        return false;
      }

      if (input.lexemeId && decision.lexemeId !== input.lexemeId) {
        return false;
      }

      if (
        input.renderUnitId &&
        decision.renderUnitId &&
        decision.renderUnitId !== input.renderUnitId
      ) {
        return false;
      }

      return normalizeToken(decision.normalizedText) === normalizedSourceToken;
    }) ?? null
  );
}

function findCachedSkipDecision(input: {
  analysisContext?: RuntimeAnalysisContext;
  decisionsBySentenceHash?: Map<string, CachedWordRenderDecision[]>;
  sentenceHash: string;
  lexemeId: string;
  renderUnitId?: string;
  sourceToken: string;
}): CachedWordRenderDecision | null {
  return findCachedWordRenderDecision({
    ...input,
    decision: "skip"
  });
}

function createPhraseRenderRejection(
  match: CachedPhraseMatch,
  sentenceHash: string,
  reason: string,
  options: { targetText?: string | null } = {}
): PhraseRenderRejection {
  return {
    phraseId: match.phraseId,
    reason,
    sourceText: match.sourceText,
    targetText: options.targetText ?? null,
    sourceKind: match.sourceKind,
    category: match.category,
    sentenceHash
  };
}

function createPhraseRenderRejectionFromCandidate(
  candidate: PhraseRenderCandidate,
  reason: string
): PhraseRenderRejection {
  return {
    phraseId: candidate.phraseId,
    reason,
    sourceText: candidate.sourceText,
    targetText: candidate.targetText,
    sourceKind: candidate.sourceKind,
    category: candidate.category,
    sentenceHash: candidate.sentence.hash
  };
}

function comparePhraseCandidates(
  left: PhraseRenderCandidate,
  right: PhraseRenderCandidate
): number {
  const leftLength = left.end - left.start;
  const rightLength = right.end - right.start;
  if (leftLength !== rightLength) {
    return rightLength - leftLength;
  }

  if (left.confidence !== right.confidence) {
    return right.confidence - left.confidence;
  }

  return left.start - right.start;
}

function spansOverlap(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number
): boolean {
  return leftStart < rightEnd && rightStart < leftEnd;
}

function normalizePhraseText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function hasUsablePhraseTarget(value: string): boolean {
  return value.trim().length > 0;
}

function isInlinePhraseRenderPolicy(
  policy: CachedPhraseMatch["renderPolicy"]
): boolean {
  return policy === undefined || policy === "inline" || policy === "phrase-only";
}
