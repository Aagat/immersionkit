import {
  evaluateLearningItemDueStatus,
  hashString,
  normalizeToken
} from "@immersionkit/shared";
import type {
  LearningItem,
  SupportedSourceLanguage,
  SupportedTargetLanguage,
  UserVocabEntry,
  VocabStatus
} from "@immersionkit/shared";
import type { WordRenderEntry } from "../render-units/render-units";

import type {
  InjectedWordKind,
  SentenceCandidateMetadata
} from "./contracts";
import {
  findSentenceForOffset,
  scoreSentenceCandidates,
  segmentSentences,
  type SentenceSegment
} from "./sentences";
import {
  findRuntimeWordDecision,
  type CachedPhraseMatch,
  type CachedWordRenderDecision,
  type RuntimeAnalysisContext
} from "./storage";
import { preserveWordCasing, segmentText } from "./tokenize";
import {
  createAnalyzerPatternWordRenderKey,
  type AnalyzerPatternWordRenderIndex,
  type VerbRenderIndex
} from "./word-render-index";
import {
  createWordDecisionTrace,
  type DebugDecisionSink,
  type DebugPhraseDecisionTrace,
  type DebugTokenDecisionTrace
} from "./debug-trace-store";

export type ReplacementPlannerContext = {
  discoveryRate: number;
  samplingSeed: string;
  nodeId: string;
  sourceLanguage: SupportedSourceLanguage;
  targetLanguage: SupportedTargetLanguage;
  wordRenderIndex: Map<string, WordRenderEntry>;
  analyzerPatternWordRenderIndex?: AnalyzerPatternWordRenderIndex;
  verbRenderIndex?: VerbRenderIndex;
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
  debugSink?: DebugDecisionSink;
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
  activeBandId?: string | null;
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
  sourceLanguage: SupportedSourceLanguage;
  targetLanguage: SupportedTargetLanguage;
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
  phraseMinBand?: string;
  isDueForReview: boolean;
};

type PhraseRenderCandidate = {
  phraseId: string;
  itemId: string;
  sourceKind: string;
  category: string;
  ruleId: string;
  confidence: number;
  renderPolicy?: string | null;
  renderUnitMinBand?: string | null;
  phraseMinBand?: string | null;
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

type DynamicVerbRenderCandidate = {
  decision: CachedWordRenderDecision;
  wordEntry: WordRenderEntry;
  start: number;
  end: number;
  sourceText: string;
  targetText: string;
  sentence: {
    text: string;
    hash: string;
  };
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
  const dynamicVerbCandidates = selectDynamicVerbRenderCandidates({
    sourceText,
    sentences,
    analysisContext: context.analysisContext,
    cachedWordRenderDecisions: context.cachedWordRenderDecisions,
    verbRenderIndex: context.verbRenderIndex,
    blockedSpans: [...phraseCandidates.acceptedByStart.values()].map((candidate) => ({
      start: candidate.start,
      end: candidate.end
    }))
  });
  for (const rejection of phraseCandidates.rejected) {
    context.debugSink?.recordPhraseDecision(
      createRejectedPhraseTrace(context.nodeId, rejection)
    );
  }
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
      const tokenId = `${context.nodeId}-t${tokenIndex}`;
      spans.push({
        kind: "phrase",
        tokenId,
        nodeId: context.nodeId,
        start: phraseCandidate.start,
        end: phraseCandidate.end,
        sourceText: phraseCandidate.sourceText,
        targetText: phraseCandidate.targetText,
        sourceLanguage: context.sourceLanguage,
        targetLanguage: context.targetLanguage,
        sentence: phraseCandidate.sentence,
        phraseId: phraseCandidate.phraseId,
        itemId: phraseCandidate.itemId,
        category: phraseCandidate.category,
        sourceKind: phraseCandidate.sourceKind,
        ruleId: phraseCandidate.ruleId,
        confidence: phraseCandidate.confidence,
        isDueForReview: phraseCandidate.isDueForReview
      });
      context.debugSink?.recordPhraseDecision(
        createInjectedPhraseTrace(context.nodeId, tokenId, phraseCandidate)
      );
      tokenIndex += 1;
      injectedSentenceHashes.add(phraseCandidate.sentence.hash);
      injectedCount += 1;
      discoveryCount += 1;
      phraseInjectedCount += 1;
      coveredUntil = phraseCandidate.end;
      continue;
    }

    const dynamicVerbCandidate = dynamicVerbCandidates.acceptedByStart.get(
      segment.start
    );
    const dynamicVerbDecision = dynamicVerbCandidate?.decision ?? null;

    if (segment.kind === "text") {
      continue;
    }

    const sentence = findSentenceForOffset(sentences, segment.start);
    if (segment.start < coveredUntil) {
      context.debugSink?.recordTokenDecision(
        createWordDecisionTrace({
          nodeId: context.nodeId,
          sourceToken: segment.value,
          normalizedSourceToken: segment.normalized,
          sentenceHash: sentence?.hash ?? null,
          start: segment.start,
          end: segment.end,
          finalAction: "skipped-overlapped-by-phrase",
          explanation: "Token was covered by a selected phrase span."
        })
      );
      continue;
    }

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
      dynamicVerbCandidate?.wordEntry ??
      context.wordRenderIndex.get(segment.normalized) ??
      findCurrentAnalyzerPatternWordEntry(
        cachedInjectDecision,
        context.analyzerPatternWordRenderIndex
      );
    if (!wordEntry) {
      context.debugSink?.recordTokenDecision(
        createWordDecisionTrace({
          nodeId: context.nodeId,
          sourceToken: segment.value,
          normalizedSourceToken: segment.normalized,
          sentenceHash: sentence?.hash ?? null,
          start: segment.start,
          end: segment.end,
          finalAction: "skipped-no-render-unit",
          explanation: "No approved render unit matched this token."
        })
      );
      continue;
    }

    const sourceToken = dynamicVerbCandidate?.sourceText ?? segment.value;
    const normalizedSourceToken = normalizeToken(sourceToken) || segment.normalized;
    const spanStart = dynamicVerbCandidate?.start ?? segment.start;
    const spanEnd = dynamicVerbCandidate?.end ?? segment.end;
    const targetLemma = dynamicVerbCandidate?.targetText ?? wordEntry.targetLemma;
    const contextInjectDecision = dynamicVerbDecision ?? cachedInjectDecision;

    const status = getVocabStatus(wordEntry.lexemeId, context.vocabByLexemeId);
    if (status === "ignored") {
      context.debugSink?.recordTokenDecision(
        createWordDecisionTrace({
          nodeId: context.nodeId,
          sourceToken,
          normalizedSourceToken,
          targetToken: preserveWordCasing(sourceToken, targetLemma),
          sentenceHash: sentence?.hash ?? null,
          start: spanStart,
          end: spanEnd,
          wordEntry,
          status,
          finalAction: "skipped-ignored",
          explanation: "The learner marked this lexeme as ignored."
        })
      );
      continue;
    }

    const wordKind: InjectedWordKind = status === "known" ? "known" : "discovery";
    const isDueForReview = context.isDueForReview?.(wordEntry.lexemeId) ?? false;
    const learningItem =
      context.learningItemsByUnitRefId?.get(wordEntry.lexemeId) ?? null;
    let activationDecision: ActivationDecision | null = null;
    if (context.shouldActivateWord) {
      activationDecision = context.shouldActivateWord({
        wordEntry,
        learningItem,
        status,
        isDueForReview
      });
      if (!activationDecision.eligible) {
        curriculumSkippedWordCount += 1;
        context.debugSink?.recordTokenDecision(
          createWordDecisionTrace({
            nodeId: context.nodeId,
            sourceToken,
            normalizedSourceToken,
            targetToken: preserveWordCasing(sourceToken, targetLemma),
            sentenceHash: sentence?.hash ?? null,
            start: spanStart,
            end: spanEnd,
            wordEntry,
            status,
            learningItem,
            due: isDueForReview,
            activationDecision,
            finalAction: "skipped-curriculum",
            explanation:
              activationDecision.skipReason ??
              "The current curriculum band did not admit this token."
          })
        );
        continue;
      }
    }

    const samplingSeed =
      `${context.samplingSeed}:${normalizedSourceToken}:${offsetBase + spanStart}`;
    const sampling = evaluateDiscoverySampling(
      samplingSeed,
      context.discoveryRate,
      effectiveDiscoveryRate(context.discoveryRate, activationDecision)
    );
    if (
      wordKind === "discovery" &&
      !isDueForReview &&
      !sampling.passed
    ) {
      context.debugSink?.recordTokenDecision(
        createWordDecisionTrace({
          nodeId: context.nodeId,
          sourceToken,
          normalizedSourceToken,
          targetToken: preserveWordCasing(sourceToken, targetLemma),
          sentenceHash: sentence?.hash ?? null,
          start: spanStart,
          end: spanEnd,
          wordEntry,
          status,
          learningItem,
          due: isDueForReview,
          activationDecision,
          sampling,
          finalAction: "skipped-sampling",
          explanation: explainSamplingSkip(sampling)
        })
      );
      continue;
    }

    const cachedSkipDecision = sentence
      ? findCachedSkipDecision({
          decisionsBySentenceHash: context.cachedWordRenderDecisions,
          analysisContext: context.analysisContext,
          sentenceHash: sentence.hash,
          lexemeId: wordEntry.lexemeId,
          renderUnitId: wordEntry.renderUnitId,
          sourceToken
        })
      : null;
    if (cachedSkipDecision) {
      contextSkippedCount += 1;
      context.debugSink?.recordTokenDecision(
        createWordDecisionTrace({
          nodeId: context.nodeId,
          sourceToken,
          normalizedSourceToken,
          targetToken: preserveWordCasing(sourceToken, targetLemma),
          sentenceHash: sentence?.hash ?? null,
          start: spanStart,
          end: spanEnd,
          wordEntry,
          status,
          learningItem,
          due: isDueForReview,
          activationDecision,
          sampling,
          contextDecision: {
            evaluated: true,
            decision: "skip",
            rationale: cachedSkipDecision.rationale ?? null
          },
          finalAction: "skipped-context",
          explanation:
            cachedSkipDecision.rationale ??
            "Cached contextual analysis suppressed this token."
        })
      );
      continue;
    }

    if (sentence) {
      injectedSentenceHashes.add(sentence.hash);
    }

    const tokenId = `${context.nodeId}-t${tokenIndex}`;
    const targetToken = preserveWordCasing(sourceToken, targetLemma);
    spans.push({
      kind: "word",
      tokenId,
      nodeId: context.nodeId,
      start: spanStart,
      end: spanEnd,
      sourceToken,
      targetToken,
      sentence,
      wordEntry,
      status,
      wordKind,
      isDueForReview,
      activeBandId: activationDecision?.activeBandId ?? null,
      activationReason: activationDecision?.activationReason ?? null
    });
    context.debugSink?.recordTokenDecision(
      createWordDecisionTrace({
        tokenId,
        nodeId: context.nodeId,
        sourceToken,
        normalizedSourceToken,
        targetToken,
        sentenceHash: sentence?.hash ?? null,
        start: spanStart,
        end: spanEnd,
        wordEntry,
        status,
        learningItem,
        due: isDueForReview,
        activationDecision,
        sampling:
          wordKind === "discovery" && !isDueForReview
            ? sampling
            : {
                evaluated: false,
                baseRate: context.discoveryRate,
                effectiveRate: effectiveDiscoveryRate(
                  context.discoveryRate,
                  activationDecision
                ),
                seed: samplingSeed
              },
        contextDecision: {
          evaluated: Boolean(contextInjectDecision),
          decision: "inject",
          rationale: contextInjectDecision?.rationale ?? null
        },
        finalAction: "injected",
        explanation:
          contextInjectDecision?.rationale ??
          "Token passed render-unit, vocab, curriculum, sampling, and context gates."
      })
    );
    tokenIndex += 1;
    injectedCount += 1;

    if (wordKind === "known") {
      knownCount += 1;
    } else {
      discoveryCount += 1;
    }
    coveredUntil = Math.max(coveredUntil, spanEnd);
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

      const resolvedSpan = resolvePhraseSpanInSourceText({
        sourceText: input.sourceText,
        sentence,
        match
      });
      if (!resolvedSpan) {
        rejected.push(
          createPhraseRenderRejection(match, sentence.hash, "span-mismatch", {
            targetText: learningItem.targetText
          })
        );
        continue;
      }
      const { start, end } = resolvedSpan;

      const isDueForReview = evaluateLearningItemDueStatus(
        learningItem,
        Date.now()
      ).receivesDueBoost;
      if (input.shouldActivatePhrase) {
        const curriculumDecision = input.shouldActivatePhrase({
          phraseId: match.phraseId,
          sourceText: match.sourceText,
          learningItem,
          confidence: match.confidence,
          sourceKind: match.sourceKind,
          category: match.category,
          renderUnitMinBand: match.renderUnitMinBand,
          phraseMinBand: match.phraseMinBand,
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
        renderPolicy: match.renderPolicy,
        renderUnitMinBand: match.renderUnitMinBand,
        phraseMinBand: match.phraseMinBand,
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

function selectDynamicVerbRenderCandidates(input: {
  sourceText: string;
  sentences: ReturnType<typeof segmentSentences>;
  analysisContext?: RuntimeAnalysisContext;
  cachedWordRenderDecisions?: Map<string, CachedWordRenderDecision[]>;
  verbRenderIndex?: VerbRenderIndex;
  blockedSpans?: readonly { start: number; end: number }[];
}): {
  acceptedByStart: Map<number, DynamicVerbRenderCandidate>;
} {
  const acceptedByStart = new Map<number, DynamicVerbRenderCandidate>();
  if (
    !input.verbRenderIndex ||
    (!input.analysisContext && !input.cachedWordRenderDecisions)
  ) {
    return { acceptedByStart };
  }

  const candidates: DynamicVerbRenderCandidate[] = [];
  for (const sentence of input.sentences) {
    const decisions =
      input.analysisContext?.bySentenceHash.get(sentence.hash)?.wordDecisions ??
      input.cachedWordRenderDecisions?.get(sentence.hash) ??
      [];
    if (decisions.length === 0) {
      continue;
    }

    for (const decision of decisions) {
      if (
        decision.decision !== "inject" ||
        decision.candidatePos !== "verb" ||
        !decision.lexemeId ||
        !decision.renderUnitId ||
        !decision.targetText?.trim()
      ) {
        continue;
      }

      const wordEntry = input.verbRenderIndex.get(
        createAnalyzerPatternWordRenderKey(decision.renderUnitId, decision.lexemeId)
      );
      if (!wordEntry) {
        continue;
      }

      const resolvedSpan = resolveDynamicVerbSpanInSourceText({
        sourceText: input.sourceText,
        sentence,
        decision
      });
      if (!resolvedSpan) {
        continue;
      }

      candidates.push({
        decision,
        wordEntry,
        start: resolvedSpan.start,
        end: resolvedSpan.end,
        sourceText: resolvedSpan.sourceText,
        targetText: decision.targetText.trim(),
        sentence
      });
    }
  }

  const selected: DynamicVerbRenderCandidate[] = [];
  for (const candidate of candidates.sort(compareDynamicVerbCandidates)) {
    if (
      input.blockedSpans?.some((span) =>
        spansOverlap(candidate.start, candidate.end, span.start, span.end)
      )
    ) {
      continue;
    }

    if (
      selected.some((existing) =>
        spansOverlap(candidate.start, candidate.end, existing.start, existing.end)
      )
    ) {
      continue;
    }

    selected.push(candidate);
    acceptedByStart.set(candidate.start, candidate);
  }

  return { acceptedByStart };
}

function resolveDynamicVerbSpanInSourceText(input: {
  sourceText: string;
  sentence: SentenceSegment;
  decision: CachedWordRenderDecision;
}): { start: number; end: number; sourceText: string } | null {
  if (
    typeof input.decision.startChar === "number" &&
    typeof input.decision.endChar === "number"
  ) {
    const directStart = input.sentence.start + input.decision.startChar;
    const directEnd = input.sentence.start + input.decision.endChar;
    const directMatch = toResolvedDynamicVerbSpan(input, directStart, directEnd);
    if (directMatch) {
      return directMatch;
    }
  }

  const normalizedNeedle = normalizePhraseText(
    input.decision.sourceText || input.decision.normalizedText
  );
  if (!normalizedNeedle) {
    return null;
  }

  const normalizedMap = buildNormalizedSentenceOffsetMap(
    input.sourceText.slice(input.sentence.start, input.sentence.end)
  );
  const normalizedHaystack = normalizePhraseText(normalizedMap.normalizedText);
  const candidateStarts = findAllPhraseStartOffsets(
    normalizedHaystack,
    normalizedNeedle
  );
  const closestStart = candidateStarts.sort(
    (left, right) =>
      Math.abs(left - (input.decision.startChar ?? 0)) -
      Math.abs(right - (input.decision.startChar ?? 0))
  )[0];
  if (closestStart === undefined) {
    return null;
  }

  const relativeStart = normalizedMap.charStarts[closestStart];
  const relativeEnd = normalizedMap.charEnds[closestStart + normalizedNeedle.length - 1];
  if (relativeStart === undefined || relativeEnd === undefined) {
    return null;
  }

  return toResolvedDynamicVerbSpan(
    input,
    input.sentence.start + relativeStart,
    input.sentence.start + relativeEnd
  );
}

function toResolvedDynamicVerbSpan(
  input: {
    sourceText: string;
    sentence: SentenceSegment;
    decision: CachedWordRenderDecision;
  },
  start: number,
  end: number
): { start: number; end: number; sourceText: string } | null {
  if (start < input.sentence.start || end > input.sentence.end || end <= start) {
    return null;
  }

  const sourceText = input.sourceText.slice(start, end);
  const expectedSourceText = input.decision.sourceText || input.decision.normalizedText;
  if (normalizePhraseText(sourceText) !== normalizePhraseText(expectedSourceText)) {
    return null;
  }

  return { start, end, sourceText };
}

function createInjectedPhraseTrace(
  nodeId: string,
  tokenId: string,
  candidate: PhraseRenderCandidate
): DebugPhraseDecisionTrace {
  return {
    kind: "phrase",
    tokenId,
    nodeId,
    phraseId: candidate.phraseId,
    sourceText: candidate.sourceText,
    normalizedSourceText: normalizePhraseText(candidate.sourceText),
    targetText: candidate.targetText,
    sentenceHash: candidate.sentence.hash,
    offset: {
      start: candidate.start,
      end: candidate.end
    },
    match: {
      sourceKind: candidate.sourceKind,
      category: candidate.category,
      ruleId: candidate.ruleId,
      confidence: candidate.confidence,
      renderPolicy: candidate.renderPolicy ?? "inline",
      renderUnitMinBand: candidate.renderUnitMinBand ?? null,
      phraseMinBand: candidate.phraseMinBand ?? null
    },
    learningItem: {
      exists: true,
      itemId: candidate.itemId,
      due: candidate.isDueForReview
    },
    gates: {
      renderPolicyOk: true,
      activeLearningItem: true,
      usableTarget: true,
      spanResolved: true,
      curriculumEligible: true,
      overlapSelected: true
    },
    rejectedReason: null,
    finalAction: "injected",
    explanation: "Phrase passed render policy, learning item, target, span, curriculum, and overlap gates."
  };
}

function createRejectedPhraseTrace(
  nodeId: string,
  rejection: PhraseRenderRejection
): DebugPhraseDecisionTrace {
  const reason = rejection.reason;
  return {
    kind: "phrase",
    nodeId,
    phraseId: rejection.phraseId,
    sourceText: rejection.sourceText,
    normalizedSourceText: rejection.sourceText
      ? normalizePhraseText(rejection.sourceText)
      : undefined,
    targetText: rejection.targetText,
    sentenceHash: rejection.sentenceHash,
    offset: null,
    match: {
      sourceKind: rejection.sourceKind,
      category: rejection.category,
      ruleId: null,
      confidence: null,
      renderPolicy: reason.startsWith("render-policy-")
        ? reason.replace("render-policy-", "")
        : null
    },
    learningItem: {
      exists: reason !== "missing-active-learning-item",
      suspended: reason === "missing-active-learning-item" ? undefined : false
    },
    gates: {
      renderPolicyOk: !reason.startsWith("render-policy-"),
      activeLearningItem: reason !== "missing-active-learning-item",
      usableTarget: reason !== "blank-target",
      spanResolved: reason !== "span-mismatch",
      curriculumEligible: !reason.startsWith("curriculum-"),
      overlapSelected: reason !== "overlap"
    },
    rejectedReason: reason,
    finalAction: "rejected",
    explanation: `Phrase rejected: ${reason}.`
  };
}

function resolvePhraseSpanInSourceText(input: {
  sourceText: string;
  sentence: SentenceSegment;
  match: CachedPhraseMatch;
}): { start: number; end: number; sourceText: string } | null {
  const directStart = input.sentence.start + input.match.span.startChar;
  const directEnd = input.sentence.start + input.match.span.endChar;
  const directMatch = toResolvedPhraseSpan(input, directStart, directEnd);
  if (directMatch) {
    return directMatch;
  }

  const normalizedMap = buildNormalizedSentenceOffsetMap(
    input.sourceText.slice(input.sentence.start, input.sentence.end)
  );
  const mappedMatch = mapNormalizedPhraseSpan(input, normalizedMap, {
    startChar: input.match.span.startChar,
    endChar: input.match.span.endChar
  });
  if (mappedMatch) {
    return mappedMatch;
  }

  const normalizedNeedle = normalizePhraseText(
    input.match.sourceText || input.match.normalizedSourceText
  );
  if (!normalizedNeedle) {
    return null;
  }

  const normalizedHaystack = normalizePhraseText(normalizedMap.normalizedText);
  const candidateStarts = findAllPhraseStartOffsets(
    normalizedHaystack,
    normalizedNeedle
  );
  const closestStart = candidateStarts.sort(
    (left, right) =>
      Math.abs(left - input.match.span.startChar) -
      Math.abs(right - input.match.span.startChar)
  )[0];
  if (closestStart === undefined) {
    return null;
  }

  return mapNormalizedPhraseSpan(input, normalizedMap, {
    startChar: closestStart,
    endChar: closestStart + normalizedNeedle.length
  });
}

function toResolvedPhraseSpan(
  input: {
    sourceText: string;
    sentence: SentenceSegment;
    match: CachedPhraseMatch;
  },
  start: number,
  end: number
): { start: number; end: number; sourceText: string } | null {
  if (start < input.sentence.start || end > input.sentence.end || end <= start) {
    return null;
  }

  const sourceText = input.sourceText.slice(start, end);
  if (normalizePhraseText(sourceText) !== normalizePhraseText(input.match.sourceText)) {
    return null;
  }

  return { start, end, sourceText };
}

function buildNormalizedSentenceOffsetMap(rawSentence: string): {
  normalizedText: string;
  charStarts: number[];
  charEnds: number[];
} {
  const chars: string[] = [];
  const charStarts: number[] = [];
  const charEnds: number[] = [];
  let index = 0;

  while (index < rawSentence.length && /\s/.test(rawSentence[index] ?? "")) {
    index += 1;
  }

  while (index < rawSentence.length) {
    const current = rawSentence[index] ?? "";
    if (/\s/.test(current)) {
      const runStart = index;
      while (index < rawSentence.length && /\s/.test(rawSentence[index] ?? "")) {
        index += 1;
      }
      if (!hasNonWhitespaceFrom(rawSentence, index)) {
        break;
      }
      chars.push(" ");
      charStarts.push(runStart);
      charEnds.push(index);
      continue;
    }

    chars.push(current);
    charStarts.push(index);
    index += 1;
    charEnds.push(index);
  }

  return {
    normalizedText: chars.join(""),
    charStarts,
    charEnds
  };
}

function hasNonWhitespaceFrom(value: string, start: number): boolean {
  for (let index = start; index < value.length; index += 1) {
    if (!/\s/.test(value[index] ?? "")) {
      return true;
    }
  }

  return false;
}

function mapNormalizedPhraseSpan(
  input: {
    sourceText: string;
    sentence: SentenceSegment;
    match: CachedPhraseMatch;
  },
  normalizedMap: {
    normalizedText: string;
    charStarts: number[];
    charEnds: number[];
  },
  span: { startChar: number; endChar: number }
): { start: number; end: number; sourceText: string } | null {
  if (
    span.startChar < 0 ||
    span.endChar <= span.startChar ||
    span.endChar > normalizedMap.normalizedText.length
  ) {
    return null;
  }

  const relativeStart = normalizedMap.charStarts[span.startChar];
  const relativeEnd = normalizedMap.charEnds[span.endChar - 1];
  if (relativeStart === undefined || relativeEnd === undefined) {
    return null;
  }

  return toResolvedPhraseSpan(
    input,
    input.sentence.start + relativeStart,
    input.sentence.start + relativeEnd
  );
}

function findAllPhraseStartOffsets(haystack: string, needle: string): number[] {
  const starts: number[] = [];
  let cursor = 0;
  while (cursor <= haystack.length - needle.length) {
    const index = haystack.indexOf(needle, cursor);
    if (index === -1) {
      break;
    }
    starts.push(index);
    cursor = index + Math.max(needle.length, 1);
  }

  return starts;
}

function getVocabStatus(
  lexemeId: string,
  vocabByLexemeId: Map<string, UserVocabEntry>
): VocabStatus {
  const entry = vocabByLexemeId.get(lexemeId);
  return entry?.status ?? "new";
}

function evaluateDiscoverySampling(
  seed: string,
  baseRate: number,
  effectiveRate: number
): DebugTokenDecisionTrace["sampling"] {
  if (effectiveRate <= 0) {
    return {
      evaluated: true,
      baseRate,
      effectiveRate,
      seed,
      passed: false
    };
  }

  if (effectiveRate >= 1) {
    return {
      evaluated: true,
      baseRate,
      effectiveRate,
      seed,
      passed: true
    };
  }

  const hashPrefix = hashString(seed).slice(0, 8);
  const hashValue = Number.parseInt(hashPrefix, 16);
  const value = hashValue / 0xffffffff;
  return {
    evaluated: true,
    baseRate,
    effectiveRate,
    seed,
    hashPrefix,
    value,
    passed: value <= effectiveRate
  };
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

function explainSamplingSkip(
  sampling: DebugTokenDecisionTrace["sampling"]
): string {
  if (typeof sampling.value !== "number") {
    return `Discovery sampling skipped this token at effective rate ${sampling.effectiveRate.toFixed(3)}.`;
  }

  return `Discovery sampling skipped this token (${sampling.value.toFixed(3)} > ${sampling.effectiveRate.toFixed(3)}).`;
}

function findCurrentAnalyzerPatternWordEntry(
  decision: CachedWordRenderDecision | null,
  analyzerPatternWordRenderIndex?: AnalyzerPatternWordRenderIndex
): WordRenderEntry | null {
  if (
    !decision ||
    decision.decision !== "inject" ||
    !decision.renderUnitId ||
    !decision.lexemeId ||
    !analyzerPatternWordRenderIndex
  ) {
    return null;
  }

  const entry = analyzerPatternWordRenderIndex.get(
    createAnalyzerPatternWordRenderKey(decision.renderUnitId, decision.lexemeId)
  );
  if (!entry || entry.renderUnitMatchMode !== "analyzer-pattern") {
    return null;
  }

  return entry;
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

function compareDynamicVerbCandidates(
  left: DynamicVerbRenderCandidate,
  right: DynamicVerbRenderCandidate
): number {
  const leftLength = left.end - left.start;
  const rightLength = right.end - right.start;
  if (leftLength !== rightLength) {
    return rightLength - leftLength;
  }

  const leftConfidence = left.decision.confidence ?? 0;
  const rightConfidence = right.decision.confidence ?? 0;
  if (leftConfidence !== rightConfidence) {
    return rightConfidence - leftConfidence;
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
