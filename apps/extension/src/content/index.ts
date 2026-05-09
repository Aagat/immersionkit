import {
  evaluateCurriculumEligibility,
  evaluatePhraseCurriculumContentInventory,
  evaluateWordCurriculumContentInventory,
  beginnerCognateDiscoveryRateFloor,
  getActiveCurriculumContent,
  RuntimeMessageType,
  hashString,
  normalizeToken,
  resolveActiveCurriculumBand,
  shouldReceiveDueReviewBoost
} from "@immersionkit/shared";
import type {
  CurriculumConfig,
  CurriculumRuntimeProfileInput,
  QueuedSentenceCandidate,
  LearningItem,
  SentenceAnalysisEntry,
  SentenceTranslationResult,
  UserVocabEntry
} from "@immersionkit/shared";
import type { PageDiagnosticsSnapshot } from "../diagnostics/page-diagnostics";
import type { PageDiagnosticsSentenceRankingReason } from "../diagnostics/page-diagnostics";
import {
  isPageDiagnosticsMessage
} from "../diagnostics/page-diagnostics";

import {
  applyTokenStatusUpdate,
  processTextNode,
  readPhraseMetadata,
  readTokenMetadata,
  restoreAnnotatedNodes
} from "./annotate";
import type {
  PhraseActivationInput,
  WordActivationInput
} from "./annotate";
import {
  IMMERSIONKIT_RESTORE_EVENT,
  IMMERSIONKIT_TOKEN_ACTIVATED_EVENT,
  IMMERSIONKIT_TOKEN_STATUS_EVENT
} from "./contracts";
import type {
  SentenceCandidateMetadata,
  PhraseActivatedDetail,
  TokenActivatedDetail,
  TokenStatusUpdatedDetail
} from "./contracts";
import {
  IMMERSIONKIT_ROOT_ATTRIBUTE,
  IMMERSIONKIT_TOKEN_ATTRIBUTE,
  IMMERSIONKIT_WORD_SELECTOR
} from "./constants";
import {
  collectEligibleTextNodes,
  shouldSkipDocument
} from "./dom";
import { ContentEvidenceTracker } from "./evidence";
import {
  createDefaultDiagnostics,
  createDiagnosticsSnapshot,
  PHRASE_DIAGNOSTICS_SAMPLE_LIMIT,
  readPageDiagnostics as readContentPageDiagnostics,
  type ContentDiagnosticsProcessingState,
  updateCurriculumDiagnosticsFromRanking,
  updateDiagnostics as updateContentDiagnostics
} from "./diagnostics";
import { applyUiTheme } from "./theme";
import { buildWordRenderIndex, type WordRenderIndex } from "./word-render-index";
import type { WordRenderEntry } from "../render-units/render-units";
import {
  clearSentenceTranslations,
  parseSentenceTranslationResults,
  readSentenceNoteMetadata,
  renderSentenceTranslations,
  toggleSentenceSourceReveal
} from "./sentence-renderer";
import type { SentenceNoteMetadata } from "./sentence-renderer";
import { SentenceAnchorRegistry } from "./sentence-anchor-registry";
import {
  collectRootsSentenceHashes,
  setupMutationObserver
} from "./mutations";
import {
  findRenderedWrapperForCandidates,
  registerRenderedWrappersForRoot,
  rerenderAnnotatedNodesForSentenceHashes,
  type ContentWrapperRegistryState
} from "./wrapper-registry";
import {
  POPOVER_ACTION_ATTRIBUTE,
  POPOVER_SENTENCE_ACTION_ATTRIBUTE,
  closePopover,
  handlePopoverCloseClick,
  isWithinPopover,
  mountPopover,
  readInteractiveStatus,
  readSentencePopoverAction,
  renderPhrasePopover,
  renderSentencePopover,
  renderWordPopover,
  setActiveToken,
  syncSentencePopoverActions,
  type ContentPopoverRuntimeState,
  type InteractiveVocabStatus
} from "./popover";
import {
  loadProcessingContext,
  persistVocabStatus,
  refreshLearningItemsByUnitRefIds,
  upsertRuntimeSentenceAnalysis
} from "./storage";
import type {
  CachedPhraseMatch,
  CachedWordRenderDecision,
  RuntimeAnalysisContext
} from "./storage";
import type { CachedGrammarFeature } from "./storage";
import "@immersionkit/ui/styles.css";
import "./styles.css";

type ProcessingAnalysisCacheState = {
  analysisContext: RuntimeAnalysisContext;
  cachedWordRenderDecisions: Map<string, CachedWordRenderDecision[]>;
  cachedPhraseMatchesBySentenceHash: Map<string, CachedPhraseMatch[]>;
  cachedGrammarFeaturesBySentenceHash: Map<string, CachedGrammarFeature[]>;
};

type ProcessingCurriculumState = {
  config: CurriculumConfig;
  profile: CurriculumRuntimeProfileInput;
  activeWordContent: ReturnType<typeof getActiveCurriculumContent>;
  activePhraseContent: ReturnType<typeof getActiveCurriculumContent>;
};

type ProcessingMutationState = {
  pendingRoots: Set<ParentNode>;
  flushHandle: number | null;
  observer: MutationObserver | null;
};

type ProcessingRenderRegistryState = ContentWrapperRegistryState & {
  sentenceAnchorRegistry: SentenceAnchorRegistry;
};

type ProcessingState = {
  discoveryRate: number;
  samplingSeed: string;
  wordRenderIndex: WordRenderIndex;
  vocabByLexemeId: Map<string, UserVocabEntry>;
  learningItemsByUnitRefId: Map<string, LearningItem>;
  sentenceHintPhrases: string[];
  analysisCache: ProcessingAnalysisCacheState;
  diagnostics: ContentDiagnosticsProcessingState;
  curriculum: ProcessingCurriculumState;
  mutation: ProcessingMutationState;
  renderRegistry: ProcessingRenderRegistryState;
  sentenceTranslationEnabled: boolean;
  evidenceTracker: ContentEvidenceTracker;
  isActive: boolean;
};

type RuntimeState = ContentPopoverRuntimeState & {
  processing: ProcessingState | null;
  refreshPromise: Promise<void> | null;
  diagnostics: PageDiagnosticsSnapshot;
};

void boot();

async function boot() {
  if (document.documentElement.hasAttribute(IMMERSIONKIT_ROOT_ATTRIBUTE)) {
    return;
  }

  const pageDecision = shouldSkipDocument(new URL(window.location.href), document);
  if (pageDecision.shouldSkip) {
    console.info("ImmersionKit skipped page.", {
      reason: pageDecision.reason,
      url: window.location.href
    });
    return;
  }

  document.documentElement.setAttribute(IMMERSIONKIT_ROOT_ATTRIBUTE, "true");
  applyUiTheme();
  pingBackground();

  const runtimeState: RuntimeState = {
    processing: null,
    refreshPromise: null,
    activeToken: null,
    popover: null,
    popoverCleanup: null,
    diagnostics: createDefaultDiagnostics()
  };

  setupInteractionHooks(runtimeState);
  setupRefreshHook(runtimeState);
  await refreshProcessing(runtimeState);
}

function setupInteractionHooks(runtimeState: RuntimeState) {
  document.addEventListener(
    "click",
    (event) => {
      if (isWithinPopover(event.target)) {
        return;
      }

      if (emitSentenceNoteActivated(runtimeState, event.target)) {
        event.preventDefault();
        return;
      }

      const activated = emitTokenActivatedEvent(runtimeState, event.target, "click");
      if (activated) {
        return;
      }

      closePopover(runtimeState);
    },
    true
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        closePopover(runtimeState);
        return;
      }

      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      if (emitSentenceNoteActivated(runtimeState, event.target)) {
        event.preventDefault();
        return;
      }

      if (!emitTokenActivatedEvent(runtimeState, event.target, "keyboard")) {
        return;
      }

      event.preventDefault();
    },
    true
  );

  document.addEventListener(
    "dblclick",
    (event) => {
      if (!toggleSentenceSourceReveal(event.target)) {
        return;
      }

      event.preventDefault();
      closePopover(runtimeState);
    },
    true
  );

  window.addEventListener(IMMERSIONKIT_TOKEN_ACTIVATED_EVENT, (event: Event) => {
    const detail = (event as CustomEvent<TokenActivatedDetail>).detail;
    if (!detail) {
      return;
    }

    const tokenElement = findTokenElement(detail.tokenId);
    if (!tokenElement) {
      return;
    }

    openPopover(runtimeState, tokenElement, detail);
  });

  window.addEventListener(IMMERSIONKIT_TOKEN_STATUS_EVENT, (event: Event) => {
    const detail = (event as CustomEvent<TokenStatusUpdatedDetail>).detail;
    if (!detail) {
      return;
    }

    applyStatusToLexemeTokens(detail);
    updateRuntimeVocabEntry(runtimeState, detail);
  });

  window.addEventListener(IMMERSIONKIT_RESTORE_EVENT, () => {
    closePopover(runtimeState);
    clearSentenceTranslations(document);
    restoreAnnotatedNodes(document);
  });
}

function setupRefreshHook(runtimeState: RuntimeState) {
  if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) {
    return;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (isPageDiagnosticsMessage(message)) {
      sendResponse(readPageDiagnostics(runtimeState));
      return false;
    }

    if (isSentenceTranslationResultMessage(message)) {
      const results = parseSentenceTranslationResults(message.results);
      if (results.length > 0) {
        const renderedCount = renderSentenceTranslations(
          results,
          runtimeState.processing?.renderRegistry.sentenceAnchorRegistry
        );
        if (runtimeState.processing) {
          runtimeState.processing.diagnostics.sentenceNotesRendered += renderedCount;
        }
        updateDiagnostics(runtimeState);
      }

      return false;
    }

    if (message?.type !== RuntimeMessageType.RefreshActiveTab) {
      return false;
    }

    void refreshProcessing(runtimeState);
    return false;
  });
}

function refreshProcessing(runtimeState: RuntimeState): Promise<void> {
  if (runtimeState.refreshPromise) {
    return runtimeState.refreshPromise;
  }

  runtimeState.refreshPromise = (async () => {
    applyUiTheme();

    const initialSentenceHashes = document.body
      ? collectPageSentenceHashes(document.body)
      : [];
    const processingContext = await loadProcessingContext(
      window.location.hostname,
      initialSentenceHashes
    );
    const sentenceTranslationEnabled = isSentenceTranslationEnabled(
      processingContext.settings.sentenceTranslationEnabled,
      processingContext.settings.provider
    );

    runtimeState.diagnostics = createDiagnosticsSnapshot({
      siteEnabled: processingContext.siteEnabled,
      sentenceTranslationEnabled,
      assetSource: processingContext.renderAssetInfo.source,
      renderUnitCount: processingContext.renderAssetInfo.entryCount,
      renderAssetVersion: processingContext.renderAssetInfo.assetVersion,
      fallbackAsset: processingContext.renderAssetInfo.isFallback
    });

    console.info("ImmersionKit render units loaded for page.", {
      source: processingContext.renderAssetInfo.source,
      entryCount: processingContext.renderAssetInfo.entryCount,
      assetVersion: processingContext.renderAssetInfo.assetVersion,
      fallback: processingContext.renderAssetInfo.isFallback
    });
    if (processingContext.renderAssetInfo.isFallback) {
      console.warn(
        "ImmersionKit has no cached asset packs available; inline pack-backed learning will stay off for this page."
      );
    }

    if (!processingContext.siteEnabled) {
      stopProcessing(runtimeState);
      console.info("ImmersionKit disabled for site.", {
        hostname: window.location.hostname
      });
      return;
    }

    const wordRenderIndex = buildWordRenderIndex(processingContext.renderUnits, {
      bandPreference: getCurriculumBandPreference(processingContext.curriculumConfig)
    });
    if (wordRenderIndex.size === 0 && processingContext.sentenceHintPhrases.length === 0) {
      stopProcessing(runtimeState);
      console.info("ImmersionKit has no approved render units to process.");
      return;
    }

    stopProcessing(runtimeState);
    const state: ProcessingState = {
      discoveryRate: processingContext.discoveryRate,
      samplingSeed: `${window.location.hostname}${window.location.pathname}`,
      wordRenderIndex,
      vocabByLexemeId: processingContext.vocabByLexemeId,
      learningItemsByUnitRefId: processingContext.learningItemsByUnitRefId,
      sentenceHintPhrases: processingContext.sentenceHintPhrases,
      analysisCache: {
        analysisContext: processingContext.analysisContext,
        cachedWordRenderDecisions: processingContext.cachedWordRenderDecisions,
        cachedPhraseMatchesBySentenceHash:
          processingContext.cachedPhraseMatchesBySentenceHash,
        cachedGrammarFeaturesBySentenceHash:
          processingContext.cachedGrammarFeaturesBySentenceHash
      },
      diagnostics: {
        seenSentenceHashes: new Set<string>(),
        processedTextNodes: 0,
        injectedTokens: 0,
        injectedPhrases: 0,
        rejectedPhrases: 0,
        contextSkippedTokens: 0,
        analysisSuppressedTokens: 0,
        sentenceCandidatesQueued: 0,
        sentenceNotesRendered: 0,
        mutationCacheRefreshes: 0,
        mutationCacheRefreshHits: 0,
        freshPhraseAnalysisHits: 0,
        freshPhraseRerenders: 0,
        curriculumConfigId: processingContext.curriculumConfig.configId,
        activeCurriculumBandId:
          resolveActiveCurriculumBand(
            processingContext.curriculumConfig,
            "word",
            processingContext.learningProfile
          )?.bandId ?? null,
        curriculumSkippedSentences: 0,
        curriculumSkippedWords: 0,
        curriculumSkippedPhrases: 0,
        sentenceRankingReasons: [],
        unrenderedPhraseRejections: []
      },
      curriculum: {
        config: processingContext.curriculumConfig,
        profile: processingContext.learningProfile,
        activeWordContent: getActiveCurriculumContent({
          config: processingContext.curriculumConfig,
          profile: processingContext.learningProfile,
          unitType: "word"
        }),
        activePhraseContent: getActiveCurriculumContent({
          config: processingContext.curriculumConfig,
          profile: processingContext.learningProfile,
          unitType: "phrase"
        })
      },
      mutation: {
        pendingRoots: new Set<ParentNode>(),
        flushHandle: null,
        observer: null
      },
      renderRegistry: {
        nodeSequence: 0,
        wrappersBySentenceHash: new Map(),
        wrapperMetadataByNodeId: new Map(),
        sentenceAnchorRegistry: new SentenceAnchorRegistry()
      },
      sentenceTranslationEnabled,
      evidenceTracker: new ContentEvidenceTracker(),
      isActive: true
    };

    runtimeState.processing = state;

    if (!document.body) {
      return;
    }

    processRoots(state, [document.body]);
    setupMutationObserver(state, processRoots);
    updateDiagnostics(runtimeState);
  })().finally(() => {
    runtimeState.refreshPromise = null;
  });

  return runtimeState.refreshPromise;
}

function stopProcessing(runtimeState: RuntimeState) {
  const state = runtimeState.processing;
  clearSentenceTranslations(document);
  updateDiagnostics(runtimeState);

  if (!state) {
    closePopover(runtimeState);
    return;
  }

  state.mutation.observer?.disconnect();
  state.mutation.observer = null;
  state.evidenceTracker.stop();
  state.isActive = false;

  if (state.mutation.flushHandle !== null) {
    window.clearTimeout(state.mutation.flushHandle);
  }

  state.mutation.flushHandle = null;
  state.mutation.pendingRoots.clear();
  state.renderRegistry.wrappersBySentenceHash.clear();
  state.renderRegistry.wrapperMetadataByNodeId.clear();
  state.renderRegistry.sentenceAnchorRegistry.clear();
  runtimeState.processing = null;

  closePopover(runtimeState);
  restoreAnnotatedNodes(document);
  updateDiagnostics(runtimeState);
}

function processRoots(state: ProcessingState, roots: ParentNode[]) {
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
        cachedPhraseMatchesBySentenceHash: state.analysisCache.cachedPhraseMatchesBySentenceHash,
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
  queueSentenceCandidates(state, queuedCandidates);
}

function queueSentenceCandidates(
  state: ProcessingState,
  candidates: readonly SentenceCandidateMetadata[]
) {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    return;
  }

  const compactCandidates = dedupeSentenceCandidates(candidates).slice(0, 12);
  if (compactCandidates.length === 0) {
    return;
  }

  state.diagnostics.sentenceCandidatesQueued += compactCandidates.length;
  const legacySentences = compactCandidates.map((candidate) => candidate.sourceText);

  chrome.runtime.sendMessage(
    {
      type: RuntimeMessageType.QueueSentenceCandidates,
      sentences: legacySentences,
      candidates: compactCandidates
    },
    (response: unknown) => {
      if (chrome.runtime.lastError) {
        return;
      }

      const cachedResults = readCachedResultsFromQueueResponse(response);
      const analysisEntries = readAnalysisEntriesFromQueueResponse(response);
      state.diagnostics.sentenceRankingReasons =
        readRankingReasonsFromQueueResponse(response).slice(0, 8);
      updateCurriculumDiagnosticsFromRanking(state.diagnostics);
      if (analysisEntries.length > 0) {
        void refreshFreshPhraseMatches(state, analysisEntries);
      }

      if (state.sentenceTranslationEnabled && cachedResults.length > 0) {
        state.diagnostics.sentenceNotesRendered += renderSentenceTranslations(
          cachedResults,
          state.renderRegistry.sentenceAnchorRegistry
        );
      }
    }
  );
}

function collectPageSentenceHashes(root: ParentNode): string[] {
  return collectRootsSentenceHashes([root], 500);
}

function getCurriculumBandPreference(config: CurriculumConfig): string[] {
  const seen = new Set<string>();
  return [...config.bands]
    .filter((band) => typeof band.bandId === "string" && band.bandId.trim().length > 0)
    .sort((left, right) => left.order - right.order)
    .flatMap((band): string[] => {
      if (seen.has(band.bandId)) {
        return [];
      }

      seen.add(band.bandId);
      return [band.bandId];
    });
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
  for (const entry of entries) {
    const wordDecisions = entry.contextualWordCandidates.flatMap(
      (candidate): CachedWordRenderDecision[] => {
        if (
          (candidate.decision !== "inject" && candidate.decision !== "skip") ||
          !candidate.lexemeId
        ) {
          return [];
        }

        const normalizedText =
          candidate.normalizedText ?? normalizeToken(candidate.tokenText);
        if (!normalizedText) {
          return [];
        }

        return [
          {
            sentenceHash: entry.sentenceHash,
            lexemeId: candidate.lexemeId,
            renderUnitId: candidate.renderUnitId,
            renderUnitMinBand: candidate.renderUnitMinBand,
            normalizedSourceText: candidate.normalizedSourceText,
            normalizedText,
            targetText: candidate.targetText ?? candidate.targetLemma,
            candidateLemma: candidate.candidateLemma,
            candidatePos: candidate.candidatePos,
            confidence: candidate.confidence,
            decision: candidate.decision,
            rationale: candidate.rationale
          }
        ];
      }
    );
    if (wordDecisions.length > 0) {
      state.analysisCache.cachedWordRenderDecisions.set(entry.sentenceHash, wordDecisions);
      sentenceHashesWithWordDecisions.add(entry.sentenceHash);
    }

    const grammarFeatures = entry.grammarFeatures.flatMap(
      (feature): CachedGrammarFeature[] => {
        const featureKey = readNonEmptyString(feature.featureKey);
        const label = readNonEmptyString(feature.label);
        if (!featureKey || !label) {
          return [];
        }

        return [
          {
            featureId: readNonEmptyString(feature.featureId) ?? `grammar:${featureKey}`,
            featureKey,
            label,
            category: feature.category,
            sourceText: readNonEmptyString(feature.sourceText) ?? label,
            confidence:
              typeof feature.confidence === "number" && Number.isFinite(feature.confidence)
                ? feature.confidence
                : 0
          }
        ];
      }
    );
    if (grammarFeatures.length > 0) {
      state.analysisCache.cachedGrammarFeaturesBySentenceHash.set(
        entry.sentenceHash,
        grammarFeatures
      );
    }

    const phraseMatches = entry.phraseMatches.flatMap((match): CachedPhraseMatch[] => {
      if (!match.phraseId || !match.sourceText || !match.normalizedSourceText) {
        return [];
      }

      return [
        {
          occurrenceId: match.occurrenceId,
          phraseId: match.phraseId,
          renderUnitId: match.renderUnitId,
          renderUnitMinBand: match.renderUnitMinBand,
          renderPolicy: match.renderPolicy,
          sentenceHash: match.sentenceHash || entry.sentenceHash,
          sourceText: match.sourceText,
          normalizedSourceText: match.normalizedSourceText,
          sourceKind: match.sourceKind,
          category: match.category,
          ruleId: match.ruleId,
          span: match.span,
          confidence: match.confidence
        }
      ];
    });

    upsertRuntimeSentenceAnalysis(state.analysisCache.analysisContext, entry.sentenceHash, {
      wordDecisions,
      phraseMatches,
      grammarFeatures
    });

    if (phraseMatches.length === 0) {
      continue;
    }

    state.analysisCache.cachedPhraseMatchesBySentenceHash.set(entry.sentenceHash, phraseMatches);
    sentenceHashesWithPhrases.add(entry.sentenceHash);
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

function dedupeSentenceCandidates(
  candidates: readonly SentenceCandidateMetadata[]
): QueuedSentenceCandidate[] {
  const byHash = new Map<string, QueuedSentenceCandidate>();

  for (const candidate of candidates) {
    if (byHash.has(candidate.sentenceHash)) {
      continue;
    }

    byHash.set(candidate.sentenceHash, {
      sentenceHash: candidate.sentenceHash,
      sourceText: candidate.sentence,
      hostname: window.location.hostname,
      nodeId: candidate.nodeId,
      documentUrl: window.location.href,
      reason: candidate.reason,
      knownWordCount: candidate.knownWordCount,
      totalWordCount: candidate.totalWordCount,
      phraseHints: candidate.phraseHints
    } as QueuedSentenceCandidate);
  }

  return [...byHash.values()];
}

function emitTokenActivatedEvent(
  runtimeState: RuntimeState,
  target: EventTarget | null,
  sourceEvent: "click" | "keyboard"
): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  const tokenElement = target.closest<HTMLElement>(IMMERSIONKIT_WORD_SELECTOR);
  if (!tokenElement) {
    return false;
  }

  const metadata = readTokenMetadata(tokenElement);
  if (metadata) {
    const detail: TokenActivatedDetail = {
      ...metadata,
      sourceEvent
    };
    runtimeState.processing?.evidenceTracker.recordAssist(metadata);

    window.dispatchEvent(
      new CustomEvent<TokenActivatedDetail>(IMMERSIONKIT_TOKEN_ACTIVATED_EVENT, {
        detail
      })
    );

    return true;
  }

  const phraseMetadata = readPhraseMetadata(tokenElement);
  if (!phraseMetadata) {
    return false;
  }

  const detail: PhraseActivatedDetail = {
    ...phraseMetadata,
    sourceEvent
  };
  runtimeState.processing?.evidenceTracker.recordPhraseAssist(phraseMetadata);
  openPhrasePopover(runtimeState, tokenElement, detail);

  return true;
}

function emitSentenceNoteActivated(
  runtimeState: RuntimeState,
  target: EventTarget | null
): boolean {
  const detail = readSentenceNoteMetadata(target);
  if (!detail) {
    return false;
  }

  openSentencePopover(runtimeState, detail.note, detail);
  return true;
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

function openPopover(
  runtimeState: RuntimeState,
  tokenElement: HTMLElement,
  detail: TokenActivatedDetail
) {
  if (runtimeState.activeToken === tokenElement && runtimeState.popover) {
    closePopover(runtimeState);
    return;
  }

  closePopover(runtimeState);
  setActiveToken(runtimeState, tokenElement);

  const popover = renderWordPopover(detail);
  popover.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }

    if (handlePopoverCloseClick(runtimeState, event)) {
      return;
    }

    const actionButton = event.target.closest<HTMLButtonElement>(
      `[${POPOVER_ACTION_ATTRIBUTE}]`
    );
    if (!actionButton) {
      return;
    }

    const status = readInteractiveStatus(
      actionButton.getAttribute(POPOVER_ACTION_ATTRIBUTE)
    );
    if (!status) {
      return;
    }

    event.preventDefault();
    void handlePopoverStatusAction(runtimeState, detail, status);
  });

  mountPopover(runtimeState, popover, tokenElement);
}

function openSentencePopover(
  runtimeState: RuntimeState,
  noteElement: HTMLElement,
  detail: SentenceNoteMetadata
) {
  if (runtimeState.activeToken === noteElement && runtimeState.popover) {
    closePopover(runtimeState);
    return;
  }

  closePopover(runtimeState);
  setActiveToken(runtimeState, noteElement);
  const grammarFeatures =
    runtimeState.processing?.analysisCache.cachedGrammarFeaturesBySentenceHash.get(
      detail.sentenceHash
    ) ?? [];
  runtimeState.processing?.evidenceTracker.recordGrammarAssist(
    detail.sentenceHash,
    grammarFeatures
  );
  const stopGrammarDetailDwell =
    runtimeState.processing?.evidenceTracker.watchGrammarDetailDwell({
      anchor: noteElement,
      sentenceHash: detail.sentenceHash,
      features: grammarFeatures
    }) ?? (() => undefined);

  const popover = renderSentencePopover(noteElement, detail);
  popover.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }

    if (handlePopoverCloseClick(runtimeState, event)) {
      return;
    }

    const actionButton = event.target.closest<HTMLButtonElement>(
      `[${POPOVER_SENTENCE_ACTION_ATTRIBUTE}]`
    );
    if (!actionButton) {
      return;
    }

    const action = readSentencePopoverAction(
      actionButton.getAttribute(POPOVER_SENTENCE_ACTION_ATTRIBUTE)
    );
    if (!action) {
      return;
    }

    event.preventDefault();

    if (action === "show-translation") {
      noteElement.setAttribute("data-ik-source-visible", "false");
      syncSentencePopoverActions(popover, noteElement);
      return;
    }

    if (action === "toggle-source") {
      noteElement.setAttribute("data-ik-source-visible", "true");
      syncSentencePopoverActions(popover, noteElement);
      return;
    }

    if (action === "details") {
      popover.setAttribute("data-ik-details-active", "true");
      syncSentencePopoverActions(popover, noteElement);
      return;
    }

    closePopover(runtimeState);
  });

  mountPopover(runtimeState, popover, noteElement, stopGrammarDetailDwell);
}

function openPhrasePopover(
  runtimeState: RuntimeState,
  phraseElement: HTMLElement,
  detail: PhraseActivatedDetail
) {
  if (runtimeState.activeToken === phraseElement && runtimeState.popover) {
    closePopover(runtimeState);
    return;
  }

  closePopover(runtimeState);
  setActiveToken(runtimeState, phraseElement);

  const popover = renderPhrasePopover(detail);
  popover.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }

    handlePopoverCloseClick(runtimeState, event);
  });
  mountPopover(runtimeState, popover, phraseElement);
}

async function handlePopoverStatusAction(
  runtimeState: RuntimeState,
  detail: TokenActivatedDetail,
  status: InteractiveVocabStatus
) {
  let persistedEntry: UserVocabEntry | null = null;

  try {
    persistedEntry = await persistVocabStatus({
      lexemeId: detail.lexemeId,
      status
    });
  } catch (error) {
    console.warn("ImmersionKit failed to persist vocab status update.", {
      error,
      lexemeId: detail.lexemeId,
      status
    });
  }

  const updateDetail: TokenStatusUpdatedDetail = {
    tokenId: detail.tokenId,
    lexemeId: detail.lexemeId,
    status,
    entry: persistedEntry ?? undefined
  };

  window.dispatchEvent(
    new CustomEvent<TokenStatusUpdatedDetail>(IMMERSIONKIT_TOKEN_STATUS_EVENT, {
      detail: updateDetail
    })
  );

  closePopover(runtimeState);
}

function applyStatusToLexemeTokens(update: TokenStatusUpdatedDetail) {
  const tokens = document.querySelectorAll<HTMLElement>(IMMERSIONKIT_WORD_SELECTOR);
  let anyUpdated = false;

  for (const token of tokens) {
    if (token.getAttribute("data-ik-lexeme-id") !== update.lexemeId) {
      continue;
    }

    const tokenId = token.getAttribute(IMMERSIONKIT_TOKEN_ATTRIBUTE);
    if (!tokenId) {
      continue;
    }

    anyUpdated =
      applyTokenStatusUpdate({
        ...update,
        tokenId
      }) || anyUpdated;
  }

  if (anyUpdated) {
    return;
  }

  applyTokenStatusUpdate(update);
}

function updateRuntimeVocabEntry(
  runtimeState: RuntimeState,
  update: TokenStatusUpdatedDetail
) {
  const processing = runtimeState.processing;
  if (!processing) {
    return;
  }

  const existingEntry = processing.vocabByLexemeId.get(update.lexemeId);
  processing.vocabByLexemeId.set(
    update.lexemeId,
    update.entry ?? {
      lexemeId: update.lexemeId,
      status: update.status,
      updatedAt: new Date().toISOString(),
      lastSeenAt: existingEntry?.lastSeenAt ?? null,
      exposureCount: existingEntry?.exposureCount ?? 0
    }
  );
}

function findTokenElement(tokenId: string): HTMLElement | null {
  const tokens = document.querySelectorAll<HTMLElement>(IMMERSIONKIT_WORD_SELECTOR);
  for (const token of tokens) {
    if (token.getAttribute(IMMERSIONKIT_TOKEN_ATTRIBUTE) === tokenId) {
      return token;
    }
  }

  return null;
}

function readNonEmptyString(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function pingBackground() {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    return;
  }

  chrome.runtime.sendMessage({ type: RuntimeMessageType.Ping }, () => {
    void chrome.runtime.lastError;
  });
}

function readCachedResultsFromQueueResponse(
  response: unknown
): SentenceTranslationResult[] {
  if (!isRecord(response)) {
    return [];
  }

  return parseSentenceTranslationResults(response.cachedResults);
}

function readAnalysisEntriesFromQueueResponse(
  response: unknown
): SentenceAnalysisEntry[] {
  if (!isRecord(response) || !Array.isArray(response.analysisResults)) {
    return [];
  }

  return response.analysisResults.flatMap((result): SentenceAnalysisEntry[] => {
    if (!isRecord(result) || !isRecord(result.entry)) {
      return [];
    }

    if (
      typeof result.entry.sentenceHash !== "string" ||
      !Array.isArray(result.entry.contextualWordCandidates)
    ) {
      return [];
    }

    return [result.entry as SentenceAnalysisEntry];
  });
}

function readRankingReasonsFromQueueResponse(
  response: unknown
): PageDiagnosticsSentenceRankingReason[] {
  if (!isRecord(response) || !Array.isArray(response.rankingReasons)) {
    return [];
  }

  return response.rankingReasons.flatMap(
    (reason): PageDiagnosticsSentenceRankingReason[] => {
      if (!isRecord(reason)) {
        return [];
      }

      const sentenceHash = readNonEmptyString(
        typeof reason.sentenceHash === "string" ? reason.sentenceHash : null
      );
      const rank = typeof reason.rank === "number" ? reason.rank : null;
      const score = typeof reason.score === "number" ? reason.score : null;
      const primaryReason = readNonEmptyString(
        typeof reason.primaryReason === "string" ? reason.primaryReason : null
      );

      if (!sentenceHash || rank === null || score === null || !primaryReason) {
        return [];
      }

      return [
        {
          sentenceHash,
          rank,
          score,
          primaryReason,
          curriculum: readRankingCurriculum(reason.curriculum),
          signals: readRankingSignals(reason.signals),
          sentencePolicy: readRankingSentencePolicy(reason.sentencePolicy)
        }
      ];
    }
  );
}

function readRankingCurriculum(
  value: unknown
): PageDiagnosticsSentenceRankingReason["curriculum"] {
  if (!isRecord(value)) {
    return undefined;
  }

  const configId = readNonEmptyString(
    typeof value.configId === "string" ? value.configId : null
  );
  const activeBandId =
    typeof value.activeBandId === "string" && value.activeBandId.trim()
      ? value.activeBandId
      : null;
  const eligible = typeof value.eligible === "boolean" ? value.eligible : null;
  const skipReason =
    typeof value.skipReason === "string" && value.skipReason.trim()
      ? value.skipReason
      : null;

  if (!configId || eligible === null) {
    return undefined;
  }

  return {
    configId,
    activeBandId,
    eligible,
    skipReason
  };
}

function readRankingSignals(
  value: unknown
): PageDiagnosticsSentenceRankingReason["signals"] {
  if (!isRecord(value)) {
    return undefined;
  }

  const vocabularyFit =
    typeof value.vocabularyFit === "number" ? value.vocabularyFit : null;
  const grammarFit = typeof value.grammarFit === "number" ? value.grammarFit : null;
  const dueTargetValue =
    typeof value.dueTargetValue === "number" ? value.dueTargetValue : null;
  const grammarDueValue =
    typeof value.grammarDueValue === "number" ? value.grammarDueValue : undefined;
  const chunkUsefulness =
    typeof value.chunkUsefulness === "number" ? value.chunkUsefulness : null;
  const ambiguityPenalty =
    typeof value.ambiguityPenalty === "number" ? value.ambiguityPenalty : null;
  const sentencePolicyFit =
    typeof value.sentencePolicyFit === "number" ? value.sentencePolicyFit : undefined;

  if (
    vocabularyFit === null ||
    grammarFit === null ||
    dueTargetValue === null ||
    chunkUsefulness === null ||
    ambiguityPenalty === null
  ) {
    return undefined;
  }

  return {
    vocabularyFit,
    grammarFit,
    dueTargetValue,
    grammarDueValue,
    chunkUsefulness,
    ambiguityPenalty,
    sentencePolicyFit
  };
}

function readRankingSentencePolicy(
  value: unknown
): PageDiagnosticsSentenceRankingReason["sentencePolicy"] {
  if (!isRecord(value)) {
    return undefined;
  }

  const activeBandId = readNonEmptyString(
    typeof value.activeBandId === "string" ? value.activeBandId : null
  );
  const tokenCount = typeof value.tokenCount === "number" ? value.tokenCount : null;
  const tokenRange = Array.isArray(value.tokenRange)
    ? value.tokenRange.filter((entry): entry is number => typeof entry === "number")
    : [];
  const fit = typeof value.fit === "number" ? value.fit : null;
  const penalty = typeof value.penalty === "number" ? value.penalty : null;
  const outsideRange =
    typeof value.outsideRange === "boolean" ? value.outsideRange : null;
  const clausePolicy = readNonEmptyString(
    typeof value.clausePolicy === "string" ? value.clausePolicy : null
  );
  const targetPolicy = readNonEmptyString(
    typeof value.targetPolicy === "string" ? value.targetPolicy : null
  );

  if (
    !activeBandId ||
    tokenCount === null ||
    tokenRange.length !== 2 ||
    fit === null ||
    penalty === null ||
    outsideRange === null ||
    !clausePolicy ||
    !targetPolicy
  ) {
    return undefined;
  }

  return {
    activeBandId,
    tokenCount,
    tokenRange: [tokenRange[0] ?? 0, tokenRange[1] ?? 0],
    fit,
    penalty,
    outsideRange,
    clausePolicy,
    targetPolicy
  };
}

function isSentenceTranslationResultMessage(
  message: unknown
): message is {
  type: RuntimeMessageType.SentenceTranslationResult;
  results: unknown;
} {
  return (
    isRecord(message) &&
    message.type === RuntimeMessageType.SentenceTranslationResult
  );
}

function isSentenceTranslationEnabled(
  sentenceTranslationEnabled: boolean,
  provider: string
): boolean {
  return sentenceTranslationEnabled && provider === "openai";
}

function readPageDiagnostics(runtimeState: RuntimeState): PageDiagnosticsSnapshot {
  return readContentPageDiagnostics({
    diagnostics: runtimeState.diagnostics,
    processing: runtimeState.processing?.diagnostics ?? null
  });
}

function updateDiagnostics(runtimeState: RuntimeState): void {
  updateContentDiagnostics({
    diagnostics: runtimeState.diagnostics,
    processing: runtimeState.processing?.diagnostics ?? null
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
