import {
  beginnerCognateDiscoveryRateFloor,
  evaluateCurriculumEligibility,
  evaluatePhraseCurriculumContentInventory,
  evaluateWordCurriculumContentInventory,
  hashString,
  shouldReceiveDueReviewBoost,
  type SentenceAnalysisEntry
} from "@immersionkit/shared";
import type { WordRenderEntry } from "../render-units/render-units";
import {
  processTextNode,
  type PhraseActivationInput,
  type WordActivationInput
} from "./annotate";
import type { SentenceCandidateMetadata } from "./contracts";
import { PHRASE_DIAGNOSTICS_SAMPLE_LIMIT, updateCurriculumDiagnosticsFromRanking } from "./diagnostics";
import { collectEligibleTextNodes } from "./dom";
import {
  buildCachedSentenceAnalysisContext,
  upsertRuntimeSentenceAnalysis
} from "./runtime-analysis";
import { renderSentenceTranslations } from "./sentence-renderer";
import { sendSentenceCandidatesToQueue } from "./sentence-queue-client";
import { refreshLearningItemsByUnitRefIds } from "./storage";
import type { ProcessingState } from "./state";
import {
  findRenderedWrapperForCandidates,
  registerRenderedWrappersForRoot,
  rerenderAnnotatedNodesForSentenceHashes
} from "./wrapper-registry";

export function processRoots(state: ProcessingState, roots: ParentNode[]) {
  if (!document.body || !state.isActive) {
    return;
  }

  const queuedCandidates: SentenceCandidateMetadata[] = [];
  let processedNodes = 0;
  let injectedTokens = 0;
  let injectedPhrases = 0;
  let rejectedPhrases = 0;
  let contextSkippedTokens = 0;
  let curriculumSkippedWords = 0;
  let curriculumSkippedPhrases = 0;

  for (const root of roots) {
    const nodes = collectEligibleTextNodes(root);

    for (const node of nodes) {
      const result = processTextNode(node, {
        discoveryRate: state.discoveryRate,
        samplingSeed: state.samplingSeed,
        createNodeId: () => createNodeId(state),
        wordRenderIndex: state.wordRenderIndex,
        vocabByLexemeId: state.vocabByLexemeId,
        analysisContext: state.analysisCache.analysisContext,
        cachedWordRenderDecisions: state.analysisCache.cachedWordRenderDecisions,
        cachedPhraseMatchesBySentenceHash:
          state.analysisCache.cachedPhraseMatchesBySentenceHash,
        sentenceHintPhrases: state.sentenceHintPhrases,
        learningItemsByUnitRefId: state.learningItemsByUnitRefId,
        shouldActivateWord: (input) => shouldActivateWordByCurriculum(state, input),
        shouldActivatePhrase: (input) => shouldActivatePhraseByCurriculum(state, input),
        isKnownWordForScoring: (word) => isKnownWord(state, word),
        isDueForReview: (lexemeId) => isDueLearningItem(state, lexemeId),
        allowPhraseOnlyCandidates: true
      });

      if (result.replaced) {
        processedNodes += 1;
      }
      injectedTokens += result.injectedCount;
      injectedPhrases += result.phraseInjectedCount;
      rejectedPhrases += result.phraseRejectedCount;
      contextSkippedTokens += result.contextSkippedCount;
      curriculumSkippedWords += result.curriculumSkippedWordCount;
      curriculumSkippedPhrases += result.curriculumSkippedPhraseCount;
      if (result.unrenderedPhraseRejections.length > 0) {
        state.diagnostics.unrenderedPhraseRejections = [
          ...state.diagnostics.unrenderedPhraseRejections,
          ...result.unrenderedPhraseRejections
        ].slice(-PHRASE_DIAGNOSTICS_SAMPLE_LIMIT);
      }

      const sentenceAnchorNode = result.replaced
        ? findRenderedWrapperForCandidates(result.sentenceCandidates)
        : node;
      if (sentenceAnchorNode) {
        state.renderRegistry.sentenceAnchorRegistry.registerCandidates(
          result.sentenceCandidates,
          sentenceAnchorNode
        );
      }

      for (const candidate of result.sentenceCandidates) {
        if (state.diagnostics.seenSentenceHashes.has(candidate.sentenceHash)) {
          continue;
        }

        state.diagnostics.seenSentenceHashes.add(candidate.sentenceHash);
        queuedCandidates.push(candidate);

        if (queuedCandidates.length >= 12) {
          break;
        }
      }
    }

    registerRenderedWrappersForRoot(state.renderRegistry, root);
  }

  state.diagnostics.processedTextNodes += processedNodes;
  state.diagnostics.injectedTokens += injectedTokens;
  state.diagnostics.injectedPhrases += injectedPhrases;
  state.diagnostics.rejectedPhrases += rejectedPhrases;
  state.diagnostics.contextSkippedTokens += contextSkippedTokens;
  state.diagnostics.curriculumSkippedWords += curriculumSkippedWords;
  state.diagnostics.curriculumSkippedPhrases += curriculumSkippedPhrases;
  for (const root of roots) {
    state.evidenceTracker.registerRenderedTokens(root);
  }
  void handleQueuedSentenceCandidates(state, queuedCandidates);
}

async function handleQueuedSentenceCandidates(
  state: ProcessingState,
  candidates: readonly SentenceCandidateMetadata[]
) {
  const outcome = await sendSentenceCandidatesToQueue(candidates);
  if (!outcome || !state.isActive) {
    return;
  }

  state.diagnostics.sentenceCandidatesQueued += outcome.queuedCandidateCount;
  state.diagnostics.sentenceRankingReasons = outcome.rankingReasons.slice(0, 8);
  updateCurriculumDiagnosticsFromRanking(state.diagnostics);
  if (outcome.analysisEntries.length > 0) {
    void refreshFreshPhraseMatches(state, outcome.analysisEntries);
  }

  if (state.sentenceTranslationEnabled && outcome.cachedResults.length > 0) {
    state.diagnostics.sentenceNotesRendered += renderSentenceTranslations(
      outcome.cachedResults,
      state.renderRegistry.sentenceAnchorRegistry
    );
  }
}

async function refreshFreshPhraseMatches(
  state: ProcessingState,
  entries: readonly SentenceAnalysisEntry[]
) {
  if (!state.isActive) {
    return;
  }

  const sentenceHashesWithPhrases = new Set<string>();
  const sentenceHashesWithWordDecisions = new Set<string>();
  const freshContext = buildCachedSentenceAnalysisContext(entries);
  for (const [sentenceHash, analysis] of freshContext.analysisContext.bySentenceHash) {
    if (analysis.wordDecisions.length > 0) {
      state.analysisCache.cachedWordRenderDecisions.set(
        sentenceHash,
        analysis.wordDecisions
      );
      sentenceHashesWithWordDecisions.add(sentenceHash);
    }

    if (analysis.grammarFeatures.length > 0) {
      state.analysisCache.cachedGrammarFeaturesBySentenceHash.set(
        sentenceHash,
        analysis.grammarFeatures
      );
    }

    upsertRuntimeSentenceAnalysis(state.analysisCache.analysisContext, sentenceHash, {
      wordDecisions: analysis.wordDecisions,
      phraseMatches: analysis.phraseMatches,
      grammarFeatures: analysis.grammarFeatures
    });

    if (analysis.phraseMatches.length === 0) {
      continue;
    }

    state.analysisCache.cachedPhraseMatchesBySentenceHash.set(
      sentenceHash,
      analysis.phraseMatches
    );
    sentenceHashesWithPhrases.add(sentenceHash);
  }

  if (sentenceHashesWithPhrases.size === 0 && sentenceHashesWithWordDecisions.size === 0) {
    return;
  }

  await refreshPhraseLearningItemsForFreshMatches(state, entries);
  if (!state.isActive) {
    return;
  }

  state.diagnostics.freshPhraseAnalysisHits += sentenceHashesWithPhrases.size;
  state.diagnostics.freshPhraseRerenders += rerenderAnnotatedNodesForSentenceHashes(
    state,
    new Set([
      ...sentenceHashesWithPhrases,
      ...sentenceHashesWithWordDecisions
    ]),
    processRoots
  );
}

async function refreshPhraseLearningItemsForFreshMatches(
  state: ProcessingState,
  entries: readonly SentenceAnalysisEntry[]
) {
  const phraseIds = new Set<string>();
  for (const entry of entries) {
    for (const match of entry.phraseMatches) {
      if (typeof match.phraseId === "string" && match.phraseId.trim().length > 0) {
        phraseIds.add(match.phraseId);
      }
    }
  }

  if (phraseIds.size === 0) {
    return;
  }

  try {
    const refreshedItems = await refreshLearningItemsByUnitRefIds([...phraseIds]);
    for (const [unitRefId, item] of refreshedItems) {
      if (item.unitType === "phrase") {
        state.learningItemsByUnitRefId.set(unitRefId, item);
      }
    }
  } catch (error) {
    console.warn("ImmersionKit failed to refresh fresh phrase learning items.", {
      error,
      requestedPhraseIds: phraseIds.size
    });
  }
}

function createNodeId(state: ProcessingState): string {
  state.renderRegistry.nodeSequence += 1;

  const seed = `${state.samplingSeed}:${state.renderRegistry.nodeSequence}`;
  return `ikn-${state.renderRegistry.nodeSequence.toString(36)}-${hashString(seed).slice(0, 7)}`;
}

function isKnownWord(state: ProcessingState, normalizedWord: string): boolean {
  const wordEntry = state.wordRenderIndex.get(normalizedWord);
  if (!wordEntry) {
    return true;
  }

  const status = state.vocabByLexemeId.get(wordEntry.lexemeId)?.status ?? "new";
  return status === "known" || status === "learning";
}

function isDueLearningItem(state: ProcessingState, lexemeId: string): boolean {
  const item = state.learningItemsByUnitRefId.get(lexemeId);
  return shouldReceiveDueReviewBoost(item, Date.now());
}

function shouldActivateWordByCurriculum(
  state: ProcessingState,
  input: WordActivationInput
) {
  if (input.wordEntry.renderUnitMinBand) {
    const renderUnitBandDecision = evaluateWordCurriculumContentInventory({
      wordEntry: input.wordEntry,
      activeContent: state.curriculum.activeWordContent
    });
    if (!renderUnitBandDecision.eligible) {
      return {
        eligible: false,
        activeBandId: renderUnitBandDecision.activeBandId,
        skipReason: renderUnitBandDecision.skipReason
      };
    }
  }

  if (input.isDueForReview || input.status !== "new") {
    return { eligible: true };
  }

  const decision = evaluateCurriculumEligibility(state.curriculum.config, {
    unitType: "word",
    itemId: input.wordEntry.lexemeId,
    bandId: input.learningItem?.bandId ?? null,
    score: scoreWordRenderDifficulty(input.wordEntry),
    profile: state.curriculum.profile
  });

  state.diagnostics.curriculumConfigId = decision.configId;
  state.diagnostics.activeCurriculumBandId = decision.activeBandId;
  if (!decision.eligible) {
    return decision;
  }

  const inventoryDecision = evaluateWordCurriculumContentInventory({
    wordEntry: input.wordEntry,
    activeContent: state.curriculum.activeWordContent
  });
  if (!inventoryDecision.eligible) {
    return {
      eligible: false,
      configId: decision.configId,
      activeBandId: inventoryDecision.activeBandId,
      skipReason: inventoryDecision.skipReason
    };
  }

  const cognateDiscoveryRateFloor = beginnerCognateDiscoveryRateFloor(
    input.wordEntry,
    inventoryDecision.activeBandId
  );

  return {
    ...decision,
    discoveryRateFloor: cognateDiscoveryRateFloor,
    activationReason:
      inventoryDecision.matchReason === "beginner-cognate" ||
      cognateDiscoveryRateFloor !== null
        ? "beginner-cognate"
        : null
  };
}

function shouldActivatePhraseByCurriculum(
  state: ProcessingState,
  input: PhraseActivationInput
) {
  if (input.renderUnitMinBand) {
    const renderUnitBandDecision = evaluatePhraseCurriculumContentInventory({
      sourceText: input.sourceText,
      sourceKind: input.sourceKind,
      category: input.category,
      renderUnitMinBand: input.renderUnitMinBand,
      activeContent: state.curriculum.activePhraseContent
    });
    if (!renderUnitBandDecision.eligible) {
      return {
        eligible: false,
        activeBandId: renderUnitBandDecision.activeBandId,
        skipReason: renderUnitBandDecision.skipReason
      };
    }
  }

  if (input.isDueForReview) {
    return { eligible: true };
  }

  const decision = evaluateCurriculumEligibility(state.curriculum.config, {
    unitType: "phrase",
    itemId: input.phraseId,
    bandId: input.learningItem.bandId ?? null,
    profile: state.curriculum.profile
  });

  state.diagnostics.curriculumConfigId = decision.configId;
  state.diagnostics.activeCurriculumBandId = decision.activeBandId;
  if (!decision.eligible) {
    return decision;
  }

  const inventoryDecision = evaluatePhraseCurriculumContentInventory({
    sourceText: input.sourceText,
    sourceKind: input.sourceKind,
    category: input.category,
    renderUnitMinBand: input.renderUnitMinBand,
    activeContent: state.curriculum.activePhraseContent
  });
  if (!inventoryDecision.eligible) {
    return {
      eligible: false,
      configId: decision.configId,
      activeBandId: inventoryDecision.activeBandId,
      skipReason: inventoryDecision.skipReason
    };
  }

  return decision;
}

function scoreWordRenderDifficulty(entry: WordRenderEntry): number | null {
  if (typeof entry.frequencyRank !== "number" || !Number.isFinite(entry.frequencyRank)) {
    return null;
  }

  return Math.max(0, Math.min(1, entry.frequencyRank / 5000));
}
