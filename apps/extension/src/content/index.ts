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
  SentenceLearningNote,
  SentenceTranslationResult,
  UserVocabEntry,
  VocabStatus
} from "@immersionkit/shared";
import type { PageDiagnosticsSnapshot } from "../diagnostics/page-diagnostics";
import type { PageDiagnosticsPhraseSample } from "../diagnostics/page-diagnostics";
import type { PageDiagnosticsSentenceRankingReason } from "../diagnostics/page-diagnostics";
import type { PageDiagnosticsTokenSample } from "../diagnostics/page-diagnostics";
import {
  isPageDiagnosticsMessage
} from "../diagnostics/page-diagnostics";

import {
  applyTokenStatusUpdate,
  processTextNode,
  type PhraseRenderRejection,
  readAnnotatedNodeOriginalText,
  readPhraseMetadata,
  readTokenMetadata,
  restoreAnnotatedElement,
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
  IMMERSIONKIT_ORIGINAL_TEXT_ATTRIBUTE,
  IMMERSIONKIT_ROOT_ATTRIBUTE,
  IMMERSIONKIT_TOKEN_ATTRIBUTE,
  IMMERSIONKIT_NODE_ATTRIBUTE,
  IMMERSIONKIT_WORD_SELECTOR
} from "./constants";
import {
  collectEligibleTextNodes,
  isInImmersionNode,
  nodeToProcessRoot,
  shouldSkipDocument,
  visitEligibleTextNodes
} from "./dom";
import { segmentSentences } from "./sentences";
import { ContentEvidenceTracker } from "./evidence";
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
  loadCachedSentenceAnalysisContext,
  loadProcessingContext,
  mergeRuntimeAnalysisContext,
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

type ProcessingState = {
  discoveryRate: number;
  samplingSeed: string;
  wordRenderIndex: WordRenderIndex;
  vocabByLexemeId: Map<string, UserVocabEntry>;
  learningItemsByUnitRefId: Map<string, LearningItem>;
  analysisContext: RuntimeAnalysisContext;
  cachedWordRenderDecisions: Map<string, CachedWordRenderDecision[]>;
  cachedPhraseMatchesBySentenceHash: Map<string, CachedPhraseMatch[]>;
  sentenceHintPhrases: string[];
  cachedGrammarFeaturesBySentenceHash: Map<string, CachedGrammarFeature[]>;
  seenSentenceHashes: Set<string>;
  processedTextNodes: number;
  injectedTokens: number;
  injectedPhrases: number;
  rejectedPhrases: number;
  contextSkippedTokens: number;
  analysisSuppressedTokens: number;
  sentenceCandidatesQueued: number;
  sentenceNotesRendered: number;
  mutationCacheRefreshes: number;
  mutationCacheRefreshHits: number;
  freshPhraseAnalysisHits: number;
  freshPhraseRerenders: number;
  curriculumConfigId: string | null;
  activeCurriculumBandId: string | null;
  curriculumSkippedSentences: number;
  curriculumSkippedWords: number;
  curriculumSkippedPhrases: number;
  curriculumConfig: CurriculumConfig;
  learningProfile: CurriculumRuntimeProfileInput;
  activeWordCurriculumContent: ReturnType<typeof getActiveCurriculumContent>;
  activePhraseCurriculumContent: ReturnType<typeof getActiveCurriculumContent>;
  sentenceRankingReasons: PageDiagnosticsSentenceRankingReason[];
  unrenderedPhraseRejections: PhraseRenderRejection[];
  pendingRoots: Set<ParentNode>;
  flushHandle: number | null;
  observer: MutationObserver | null;
  nodeSequence: number;
  wrappersBySentenceHash: Map<string, Set<HTMLElement>>;
  wrapperMetadataByNodeId: Map<string, RenderedWrapperMetadata>;
  sentenceAnchorRegistry: SentenceAnchorRegistry;
  sentenceTranslationEnabled: boolean;
  evidenceTracker: ContentEvidenceTracker;
  isActive: boolean;
};

type RenderedWrapperMetadata = {
  nodeId: string;
  wrapper: HTMLElement;
  originalText: string;
  sentenceHashes: Set<string>;
};

type RuntimeState = {
  processing: ProcessingState | null;
  refreshPromise: Promise<void> | null;
  activeToken: HTMLElement | null;
  popover: HTMLDivElement | null;
  popoverCleanup: (() => void) | null;
  diagnostics: PageDiagnosticsSnapshot;
};

type InteractiveVocabStatus = Exclude<VocabStatus, "new">;
type UiTheme = "light" | "dark";
type SentencePopoverAction = "show-translation" | "toggle-source" | "details" | "close";
type PopoverIconName =
  | "book"
  | "check"
  | "chevron"
  | "close"
  | "document"
  | "eyeOff"
  | "info"
  | "link"
  | "lock"
  | "message"
  | "spark"
  | "translate"
  | "volume";
type PopoverPlacement = "right" | "left" | "top" | "bottom";
type PopoverAnchorRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};
type PopoverViewportMonitor = ((event?: Event) => void) & {
  cancel: () => void;
};
type TopLayerPopoverElement = HTMLDivElement & {
  showPopover?: () => void;
  hidePopover?: () => void;
};

const POPOVER_ATTRIBUTE = "data-ik-popover";
const POPOVER_ACTION_ATTRIBUTE = "data-ik-status-action";
const POPOVER_SENTENCE_ACTION_ATTRIBUTE = "data-ik-sentence-action";
const POPOVER_CLOSE_ATTRIBUTE = "data-ik-popover-close";
const POPOVER_VIEWPORT_MARGIN = 10;
const POPOVER_ANCHOR_OFFSET = 12;
const SENTENCE_NOTE_SELECTOR = "[data-ik-sentence-note='true']";
const UI_THEME_ATTRIBUTE = "data-ik-ui-theme";
const TOKEN_DIAGNOSTICS_SAMPLE_LIMIT = 8;
const PHRASE_DIAGNOSTICS_SAMPLE_LIMIT = 8;
const FRESH_PHRASE_RERENDER_LIMIT = 20;
const STATUS_BUTTONS: readonly {
  status: InteractiveVocabStatus;
  label: string;
}[] = [
  { status: "learning", label: "Practicing" },
  { status: "known", label: "Comfortable" }
] as const;

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
          runtimeState.processing?.sentenceAnchorRegistry
        );
        if (runtimeState.processing) {
          runtimeState.processing.sentenceNotesRendered += renderedCount;
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

    runtimeState.diagnostics = {
      pageUrl: window.location.href,
      pageHostname: window.location.hostname,
      pagePathname: window.location.pathname,
      siteEnabled: processingContext.siteEnabled,
      sentenceTranslationEnabled,
      assetSource: processingContext.renderAssetInfo.source,
      renderUnitCount: processingContext.renderAssetInfo.entryCount,
      renderAssetVersion: processingContext.renderAssetInfo.assetVersion,
      fallbackAsset: processingContext.renderAssetInfo.isFallback,
      processedTextNodes: 0,
      injectedTokens: 0,
      injectedPhrases: 0,
      rejectedPhrases: 0,
      contextSkippedTokens: 0,
      analysisSuppressedTokens: 0,
      sentenceCandidatesSeen: 0,
      sentenceCandidatesQueued: 0,
      sentenceNotesRendered: 0,
      mutationCacheRefreshes: 0,
      mutationCacheRefreshHits: 0,
      freshPhraseAnalysisHits: 0,
      freshPhraseRerenders: 0,
      sentenceNotesVisible: countSentenceNotes(),
      curriculumConfigId: null,
      activeCurriculumBandId: null,
      curriculumSkippedSentences: 0,
      curriculumSkippedWords: 0,
      curriculumSkippedPhrases: 0,
      grammarDueSentenceCount: 0,
      sentenceRankingReasons: [],
      phraseDecisionSamples: collectPhraseDecisionSamples(),
      tokenDecisionSamples: collectTokenDecisionSamples(),
      updatedAt: new Date().toISOString()
    };

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
      analysisContext: processingContext.analysisContext,
      cachedWordRenderDecisions: processingContext.cachedWordRenderDecisions,
      cachedPhraseMatchesBySentenceHash:
        processingContext.cachedPhraseMatchesBySentenceHash,
      sentenceHintPhrases: processingContext.sentenceHintPhrases,
      cachedGrammarFeaturesBySentenceHash:
        processingContext.cachedGrammarFeaturesBySentenceHash,
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
      curriculumConfig: processingContext.curriculumConfig,
      learningProfile: processingContext.learningProfile,
      activeWordCurriculumContent: getActiveCurriculumContent({
        config: processingContext.curriculumConfig,
        profile: processingContext.learningProfile,
        unitType: "word"
      }),
      activePhraseCurriculumContent: getActiveCurriculumContent({
        config: processingContext.curriculumConfig,
        profile: processingContext.learningProfile,
        unitType: "phrase"
      }),
      sentenceRankingReasons: [],
      unrenderedPhraseRejections: [],
      pendingRoots: new Set<ParentNode>(),
      flushHandle: null,
      observer: null,
      nodeSequence: 0,
      wrappersBySentenceHash: new Map(),
      wrapperMetadataByNodeId: new Map(),
      sentenceAnchorRegistry: new SentenceAnchorRegistry(),
      sentenceTranslationEnabled,
      evidenceTracker: new ContentEvidenceTracker(),
      isActive: true
    };

    runtimeState.processing = state;

    if (!document.body) {
      return;
    }

    processRoots(state, [document.body]);
    setupMutationObserver(state);
    updateDiagnostics(runtimeState);
  })().finally(() => {
    runtimeState.refreshPromise = null;
  });

  return runtimeState.refreshPromise;
}

function stopProcessing(runtimeState: RuntimeState) {
  const state = runtimeState.processing;
  clearSentenceTranslations(document);
  runtimeState.diagnostics.sentenceNotesVisible = countSentenceNotes();
  runtimeState.diagnostics.updatedAt = new Date().toISOString();

  if (!state) {
    closePopover(runtimeState);
    return;
  }

  state.observer?.disconnect();
  state.observer = null;
  state.evidenceTracker.stop();
  state.isActive = false;

  if (state.flushHandle !== null) {
    window.clearTimeout(state.flushHandle);
  }

  state.flushHandle = null;
  state.pendingRoots.clear();
  state.wrappersBySentenceHash.clear();
  state.wrapperMetadataByNodeId.clear();
  state.sentenceAnchorRegistry.clear();
  runtimeState.processing = null;

  closePopover(runtimeState);
  restoreAnnotatedNodes(document);
  updateDiagnostics(runtimeState);
}

function setupMutationObserver(state: ProcessingState) {
  if (!document.body) {
    return;
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        const target = mutation.target;
        if (!(target instanceof Text) || isInImmersionNode(target)) {
          continue;
        }

        enqueueRootForProcessing(state, target.parentElement);
        continue;
      }

      for (const addedNode of mutation.addedNodes) {
        if (isInImmersionNode(addedNode)) {
          continue;
        }

        enqueueRootForProcessing(state, nodeToProcessRoot(addedNode));
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    characterData: true,
    subtree: true
  });

  state.observer = observer;
}

function enqueueRootForProcessing(state: ProcessingState, root: ParentNode | null) {
  if (!root || !document.body?.contains(root as Node)) {
    return;
  }

  if (root === document.body || state.pendingRoots.size > 40) {
    state.pendingRoots.clear();
    state.pendingRoots.add(document.body);
  } else {
    state.pendingRoots.add(root);
  }

  scheduleRootFlush(state);
}

function scheduleRootFlush(state: ProcessingState) {
  if (state.flushHandle !== null) {
    return;
  }

  state.flushHandle = window.setTimeout(() => {
    state.flushHandle = null;

    const roots =
      state.pendingRoots.size > 0
        ? Array.from(state.pendingRoots)
        : [document.body as ParentNode];

    state.pendingRoots.clear();
    void processMutationRoots(state, roots);
  }, 140);
}

async function processMutationRoots(state: ProcessingState, roots: ParentNode[]) {
  if (!state.isActive) {
    return;
  }

  await refreshScopedAnalysisCacheForRoots(state, roots);

  if (!state.isActive) {
    return;
  }

  processRoots(state, roots);
}

async function refreshScopedAnalysisCacheForRoots(
  state: ProcessingState,
  roots: readonly ParentNode[]
) {
  const sentenceHashes = collectRootsSentenceHashes(roots).filter(
    (hash) =>
      !state.analysisContext.bySentenceHash.has(hash) &&
      !state.cachedWordRenderDecisions.has(hash) &&
      !state.cachedPhraseMatchesBySentenceHash.has(hash) &&
      !state.cachedGrammarFeaturesBySentenceHash.has(hash)
  );

  if (sentenceHashes.length === 0) {
    return;
  }

  state.mutationCacheRefreshes += 1;

  try {
    const context = await loadCachedSentenceAnalysisContext(sentenceHashes.slice(0, 100));
    state.mutationCacheRefreshHits += context.entryCount;
    mergeRuntimeAnalysisContext(state.analysisContext, context.analysisContext);
    mergeCachedAnalysisMap(
      state.cachedWordRenderDecisions,
      context.cachedWordRenderDecisions
    );
    mergeCachedAnalysisMap(
      state.cachedPhraseMatchesBySentenceHash,
      context.cachedPhraseMatchesBySentenceHash
    );
    mergeCachedAnalysisMap(
      state.cachedGrammarFeaturesBySentenceHash,
      context.cachedGrammarFeaturesBySentenceHash
    );
  } catch (error) {
    console.warn("ImmersionKit failed to refresh scoped sentence analysis cache.", {
      error,
      requestedSentenceHashes: sentenceHashes.length
    });
  }
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
        analysisContext: state.analysisContext,
        cachedWordRenderDecisions: state.cachedWordRenderDecisions,
        cachedPhraseMatchesBySentenceHash: state.cachedPhraseMatchesBySentenceHash,
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
        state.unrenderedPhraseRejections = [
          ...state.unrenderedPhraseRejections,
          ...result.unrenderedPhraseRejections
        ].slice(-PHRASE_DIAGNOSTICS_SAMPLE_LIMIT);
      }

      const sentenceAnchorNode = result.replaced
        ? findRenderedWrapperForCandidates(result.sentenceCandidates)
        : node;
      if (sentenceAnchorNode) {
        state.sentenceAnchorRegistry.registerCandidates(
          result.sentenceCandidates,
          sentenceAnchorNode
        );
      }

      for (const candidate of result.sentenceCandidates) {
        if (state.seenSentenceHashes.has(candidate.sentenceHash)) {
          continue;
        }

        state.seenSentenceHashes.add(candidate.sentenceHash);
        queuedCandidates.push(candidate);

        if (queuedCandidates.length >= 12) {
          break;
        }
      }
    }

    registerRenderedWrappersForRoot(state, root);
  }

  state.processedTextNodes += processedNodes;
  state.injectedTokens += injectedTokens;
  state.injectedPhrases += injectedPhrases;
  state.rejectedPhrases += rejectedPhrases;
  state.contextSkippedTokens += contextSkippedTokens;
  state.curriculumSkippedWords += curriculumSkippedWords;
  state.curriculumSkippedPhrases += curriculumSkippedPhrases;
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

  state.sentenceCandidatesQueued += compactCandidates.length;
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
      state.sentenceRankingReasons =
        readRankingReasonsFromQueueResponse(response).slice(0, 8);
      updateCurriculumDiagnosticsFromRanking(state);
      if (analysisEntries.length > 0) {
        void refreshFreshPhraseMatches(state, analysisEntries);
      }

      if (state.sentenceTranslationEnabled && cachedResults.length > 0) {
        state.sentenceNotesRendered += renderSentenceTranslations(
          cachedResults,
          state.sentenceAnchorRegistry
        );
      }
    }
  );
}

function collectPageSentenceHashes(root: ParentNode): string[] {
  return collectRootsSentenceHashes([root], 500);
}

function collectRootsSentenceHashes(
  roots: readonly ParentNode[],
  limit = 100
): string[] {
  const hashes = new Set<string>();

  for (const root of roots) {
    let reachedLimit = false;
    visitEligibleTextNodes(root, (node) => {
      for (const sentence of segmentSentences(node.nodeValue ?? "")) {
        hashes.add(sentence.hash);
        if (hashes.size >= limit) {
          reachedLimit = true;
          return false;
        }
      }

      return true;
    });

    if (reachedLimit) {
      return [...hashes];
    }
  }

  return [...hashes];
}

function mergeCachedAnalysisMap<T>(
  target: Map<string, T[]>,
  source: Map<string, T[]>
) {
  for (const [sentenceHash, values] of source) {
    if (values.length === 0) {
      continue;
    }

    target.set(sentenceHash, values);
  }
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
      state.cachedWordRenderDecisions.set(entry.sentenceHash, wordDecisions);
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
      state.cachedGrammarFeaturesBySentenceHash.set(
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

    upsertRuntimeSentenceAnalysis(state.analysisContext, entry.sentenceHash, {
      wordDecisions,
      phraseMatches,
      grammarFeatures
    });

    if (phraseMatches.length === 0) {
      continue;
    }

    state.cachedPhraseMatchesBySentenceHash.set(entry.sentenceHash, phraseMatches);
    sentenceHashesWithPhrases.add(entry.sentenceHash);
  }

  if (sentenceHashesWithPhrases.size === 0 && sentenceHashesWithWordDecisions.size === 0) {
    return;
  }

  await refreshPhraseLearningItemsForFreshMatches(state, entries);
  if (!state.isActive) {
    return;
  }

  state.freshPhraseAnalysisHits += sentenceHashesWithPhrases.size;
  state.freshPhraseRerenders += rerenderAnnotatedNodesForSentenceHashes(state, new Set([
    ...sentenceHashesWithPhrases,
    ...sentenceHashesWithWordDecisions
  ]));
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

function registerRenderedWrappersForRoot(state: ProcessingState, root: ParentNode) {
  const wrappers = collectRenderedWrappers(root);
  for (const wrapper of wrappers) {
    const nodeId = wrapper.getAttribute(IMMERSIONKIT_NODE_ATTRIBUTE);
    const originalText = readAnnotatedNodeOriginalText(wrapper);
    if (!nodeId || originalText === null) {
      continue;
    }

    unregisterRenderedWrapper(state, nodeId);
    const sentenceHashes = new Set(
      segmentSentences(originalText).map((sentence) => sentence.hash)
    );
    if (sentenceHashes.size === 0) {
      continue;
    }

    state.wrapperMetadataByNodeId.set(nodeId, {
      nodeId,
      wrapper,
      originalText,
      sentenceHashes
    });
    for (const sentenceHash of sentenceHashes) {
      let wrappersForSentence = state.wrappersBySentenceHash.get(sentenceHash);
      if (!wrappersForSentence) {
        wrappersForSentence = new Set();
        state.wrappersBySentenceHash.set(sentenceHash, wrappersForSentence);
      }
      wrappersForSentence.add(wrapper);
    }
  }
}

function unregisterRenderedWrapper(state: ProcessingState, nodeId: string) {
  const metadata = state.wrapperMetadataByNodeId.get(nodeId);
  if (!metadata) {
    return;
  }

  state.wrapperMetadataByNodeId.delete(nodeId);
  for (const sentenceHash of metadata.sentenceHashes) {
    const wrappers = state.wrappersBySentenceHash.get(sentenceHash);
    if (!wrappers) {
      continue;
    }

    wrappers.delete(metadata.wrapper);
    if (wrappers.size === 0) {
      state.wrappersBySentenceHash.delete(sentenceHash);
    }
  }
}

function collectRenderedWrappers(root: ParentNode): HTMLElement[] {
  const selector = `[${IMMERSIONKIT_NODE_ATTRIBUTE}][${IMMERSIONKIT_ORIGINAL_TEXT_ATTRIBUTE}]`;
  const wrappers: HTMLElement[] = [];

  if (root instanceof HTMLElement && root.matches(selector)) {
    wrappers.push(root);
  }

  if (typeof (root as { querySelectorAll?: unknown }).querySelectorAll === "function") {
    wrappers.push(
      ...Array.from(
        (root as ParentNode & Pick<Document, "querySelectorAll">)
          .querySelectorAll<HTMLElement>(selector)
      )
    );
  }

  return wrappers;
}

function findRenderedWrapperForCandidates(
  candidates: readonly SentenceCandidateMetadata[]
): HTMLElement | null {
  const nodeId = candidates[0]?.nodeId;
  if (!nodeId) {
    return null;
  }

  return document.querySelector<HTMLElement>(
    `[${IMMERSIONKIT_NODE_ATTRIBUTE}="${escapeSelectorValue(nodeId)}"][${IMMERSIONKIT_ORIGINAL_TEXT_ATTRIBUTE}]`
  );
}

function escapeSelectorValue(value: string): string {
  return globalThis.CSS?.escape
    ? globalThis.CSS.escape(value)
    : value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function collectIndexedWrappersForSentenceHashes(
  state: ProcessingState,
  sentenceHashes: ReadonlySet<string>
): HTMLElement[] {
  const wrappers = new Set<HTMLElement>();
  for (const sentenceHash of sentenceHashes) {
    const indexedWrappers = state.wrappersBySentenceHash.get(sentenceHash);
    if (!indexedWrappers) {
      continue;
    }

    for (const wrapper of indexedWrappers) {
      if (wrapper.isConnected) {
        wrappers.add(wrapper);
        continue;
      }

      const nodeId = wrapper.getAttribute(IMMERSIONKIT_NODE_ATTRIBUTE);
      if (nodeId) {
        unregisterRenderedWrapper(state, nodeId);
      }
    }
  }

  return [...wrappers];
}

function rerenderAnnotatedNodesForSentenceHashes(
  state: ProcessingState,
  sentenceHashes: ReadonlySet<string>
): number {
  if (!document.body || !state.isActive) {
    return 0;
  }

  const wrappers = collectIndexedWrappersForSentenceHashes(state, sentenceHashes);
  const roots = new Set<ParentNode>();
  let rerendered = 0;
  const observer = state.observer;

  observer?.disconnect();

  for (const wrapper of wrappers) {
    if (rerendered >= FRESH_PHRASE_RERENDER_LIMIT) {
      break;
    }

    const originalText = readAnnotatedNodeOriginalText(wrapper);
    if (
      originalText === null ||
      !segmentSentences(originalText).some((sentence) =>
        sentenceHashes.has(sentence.hash)
      )
    ) {
      continue;
    }

    const parent = wrapper.parentNode;
    const nodeId = wrapper.getAttribute(IMMERSIONKIT_NODE_ATTRIBUTE);
    if (nodeId) {
      unregisterRenderedWrapper(state, nodeId);
    }
    const restoredText = restoreAnnotatedElement(wrapper);
    if (!restoredText || !parent) {
      continue;
    }

    roots.add(parent);
    rerendered += 1;
  }

  if (roots.size === 0) {
    if (state.isActive && observer && document.body) {
      observer.observe(document.body, {
        childList: true,
        characterData: true,
        subtree: true
      });
    }
    return rerendered;
  }

  processRoots(state, [...roots]);
  if (state.isActive && observer && document.body) {
    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true
    });
  }

  return rerendered;
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
  state.nodeSequence += 1;

  const seed = `${state.samplingSeed}:${state.nodeSequence}`;
  return `ikn-${state.nodeSequence.toString(36)}-${hashString(seed).slice(0, 7)}`;
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
      activeContent: state.activeWordCurriculumContent
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

  const decision = evaluateCurriculumEligibility(state.curriculumConfig, {
    unitType: "word",
    itemId: input.wordEntry.lexemeId,
    bandId: input.learningItem?.bandId ?? null,
    score: scoreWordRenderDifficulty(input.wordEntry),
    profile: state.learningProfile
  });

  state.curriculumConfigId = decision.configId;
  state.activeCurriculumBandId = decision.activeBandId;
  if (!decision.eligible) {
    return decision;
  }

  const inventoryDecision = evaluateWordCurriculumContentInventory({
    wordEntry: input.wordEntry,
    activeContent: state.activeWordCurriculumContent
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
      activeContent: state.activePhraseCurriculumContent
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

  const decision = evaluateCurriculumEligibility(state.curriculumConfig, {
    unitType: "phrase",
    itemId: input.phraseId,
    bandId: input.learningItem.bandId ?? null,
    profile: state.learningProfile
  });

  state.curriculumConfigId = decision.configId;
  state.activeCurriculumBandId = decision.activeBandId;
  if (!decision.eligible) {
    return decision;
  }

  const inventoryDecision = evaluatePhraseCurriculumContentInventory({
    sourceText: input.sourceText,
    sourceKind: input.sourceKind,
    category: input.category,
    renderUnitMinBand: input.renderUnitMinBand,
    activeContent: state.activePhraseCurriculumContent
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

  const popover = renderPopover(detail);
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
    runtimeState.processing?.cachedGrammarFeaturesBySentenceHash.get(
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

function handlePopoverCloseClick(
  runtimeState: RuntimeState,
  event: MouseEvent
): boolean {
  if (!(event.target instanceof Element)) {
    return false;
  }

  if (!event.target.closest(`[${POPOVER_CLOSE_ATTRIBUTE}]`)) {
    return false;
  }

  event.preventDefault();
  closePopover(runtimeState);
  return true;
}

function renderPopover(detail: TokenActivatedDetail): HTMLDivElement {
  const popover = createUiPopover("word");
  popover.append(
    createPopoverHeading({
      title: detail.targetToken,
      badge: wordStatusLabel(detail.status),
      icon: "volume"
    })
  );

  const pair = document.createElement("div");
  pair.className = "ik-ui-token-pair";
  pair.append(createTokenBox(detail.sourceToken));
  pair.append(createTokenArrow());
  pair.append(createTokenBox(detail.targetToken));
  popover.append(pair);

  const nativeExample = readNonEmptyString(detail.exampleSentenceNative);
  const englishExample = readNonEmptyString(detail.exampleSentenceEnglish);
  const pageSentence = readNonEmptyString(detail.sentence);

  if (nativeExample) {
    const sentence = document.createElement("div");
    sentence.className = "ik-ui-example-line";
    sentence.append(createSvgIcon("message"));
    const text = document.createElement("span");
    text.textContent = nativeExample;
    sentence.append(text);
    popover.append(sentence);
  }

  if (englishExample) {
    const sentence = document.createElement("p");
    sentence.className = nativeExample ? "ik-content-popover-muted" : "";
    sentence.textContent = englishExample;
    popover.append(sentence);
  } else if (pageSentence) {
    const sentence = document.createElement("p");
    sentence.textContent = pageSentence;
    popover.append(sentence);
  }

  const info = document.createElement("div");
  info.className = "ik-ui-info-line";
  info.append(createSvgIcon("info"));
  const infoText = document.createElement("span");
  infoText.textContent = "Opening this helps ImmersionKit adapt.";
  info.append(infoText);
  popover.append(info);

  const actions = document.createElement("div");
  actions.className = "ik-ui-quiet-actions";

  const stillNew = document.createElement("button");
  stillNew.type = "button";
  stillNew.className = "ik-ui-button ik-ui-button--secondary ik-ui-button--sm";
  stillNew.textContent = "Still new";
  stillNew.disabled = detail.status === "new";
  actions.append(stillNew);

  for (const action of STATUS_BUTTONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ik-ui-button ik-ui-button--secondary ik-ui-button--sm";
    button.setAttribute(POPOVER_ACTION_ATTRIBUTE, action.status);
    button.setAttribute(
      "aria-pressed",
      action.status === detail.status ? "true" : "false"
    );
    button.textContent = action.label;

    if (action.status === detail.status) {
      button.classList.add("is-active");
    }

    actions.append(button);
  }

  popover.append(actions);
  popover.append(createWordPopoverFooter());
  return popover;
}

function renderSentencePopover(
  noteElement: HTMLElement,
  detail: SentenceNoteMetadata
): HTMLDivElement {
  const popover = createUiPopover("sentence");
  popover.append(
    createPopoverHeading({
      title: "Sentence help",
      badge: "optional",
      icon: "book"
    })
  );

  const summary = document.createElement("p");
  summary.textContent = "Uses OpenAI only when enabled.";
  popover.append(summary);

  popover.append(createSentenceBlock("Original", [detail.sourceText]));
  popover.append(createSentenceBlock("Translation", [detail.translatedText]));
  popover.append(
    createSentenceBlock("Why this helps", [
      sentenceHelpDetail(detail.learningNote)
    ])
  );

  const actions = document.createElement("div");
  actions.className = "ik-ui-sentence-actions";
  actions.append(createSentencePopoverActionButton("show-translation"));
  actions.append(createSentencePopoverActionButton("toggle-source"));
  actions.append(createSentencePopoverActionButton("details"));
  popover.append(actions);
  popover.append(createLocalFooter("Selected sentence only"));

  syncSentencePopoverActions(popover, noteElement);

  return popover;
}

function renderPhrasePopover(detail: PhraseActivatedDetail): HTMLDivElement {
  const popover = createUiPopover("phrase");
  popover.append(
    createPopoverHeading({
      title: detail.targetText,
      badge: "phrase",
      icon: "link"
    })
  );

  const pair = document.createElement("div");
  pair.className = "ik-ui-token-pair";
  pair.append(createTokenBox(detail.sourceText));
  pair.append(createTokenArrow());
  pair.append(createTokenBox(detail.targetText));
  popover.append(pair);

  const help = document.createElement("p");
  help.textContent =
    "A reusable phrase you may see again when it fits the page.";
  popover.append(help);

  popover.append(createRule());

  const pageSentence = readNonEmptyString(detail.sentence);
  if (pageSentence) {
    const heading = document.createElement("h4");
    heading.append(createSvgIcon("spark"));
    heading.append("Example");
    popover.append(heading);

    const sentence = document.createElement("p");
    sentence.textContent = pageSentence;
    popover.append(sentence);
  }

  const info = document.createElement("div");
  info.className = "ik-ui-info-line";
  info.append(createSvgIcon("info"));
  const infoText = document.createElement("span");
  infoText.textContent = "You may see this again when it fits the page.";
  info.append(infoText);
  popover.append(info);

  const footer = document.createElement("footer");
  footer.className = "ik-ui-popover-actions";
  const hidePhrase = document.createElement("button");
  hidePhrase.type = "button";
  hidePhrase.className = "ik-ui-popover-link";
  hidePhrase.setAttribute(POPOVER_CLOSE_ATTRIBUTE, "true");
  hidePhrase.textContent = "Hide phrase";
  footer.append(hidePhrase);

  const gotIt = document.createElement("button");
  gotIt.type = "button";
  gotIt.className = "ik-ui-button ik-ui-button--secondary ik-ui-button--sm";
  gotIt.setAttribute(POPOVER_CLOSE_ATTRIBUTE, "true");
  gotIt.textContent = "Got it";
  footer.append(gotIt);
  popover.append(footer);

  return popover;
}

function createSentenceBlock(labelText: string, lines: string[]): HTMLDivElement {
  const block = document.createElement("div");
  block.className = "ik-ui-sentence-block";

  const label = document.createElement("p");
  label.textContent = labelText;
  block.append(label);

  for (const line of lines) {
    const text = document.createElement("span");
    text.textContent = line;
    block.append(text);
  }

  return block;
}

function sentenceHelpDetail(note: SentenceLearningNote): string {
  return (
    readNonEmptyString(note.grammarFocus) ??
    readNonEmptyString(note.summary) ??
    readNonEmptyString(note.canonicalUsage) ??
    readNonEmptyString(note.keyPhrase) ??
    "This sentence note gives selected context for the sentence you opened."
  );
}

function createRule(): HTMLDivElement {
  const rule = document.createElement("div");
  rule.className = "ik-ui-popover-rule";
  return rule;
}

function createLocalFooter(text: string): HTMLElement {
  const footer = document.createElement("footer");
  footer.className = "ik-ui-local-footer ik-ui-local-footer--compact";
  footer.append(createSvgIcon("lock"));
  const copy = document.createElement("span");
  copy.textContent = text;
  footer.append(copy);
  return footer;
}

function createWordPopoverFooter(): HTMLElement {
  const footer = document.createElement("footer");
  footer.className = "ik-ui-popover-footer";

  const hide = document.createElement("button");
  hide.type = "button";
  hide.className = "ik-ui-popover-link";
  hide.setAttribute(POPOVER_ACTION_ATTRIBUTE, "ignored");
  hide.append(createSvgIcon("eyeOff"));
  hide.append("Hide word");
  footer.append(hide);

  const brand = document.createElement("span");
  brand.append(createMiniLogo());
  brand.append("ImmersionKit");
  footer.append(brand);

  return footer;
}

function mountPopover(
  runtimeState: RuntimeState,
  popover: HTMLDivElement,
  anchorElement: HTMLElement,
  extraCleanup?: () => void
) {
  document.body.append(popover);
  showPopoverInTopLayer(popover);

  const monitorPopover = createPopoverViewportMonitor(
    runtimeState,
    popover,
    anchorElement
  );

  runtimeState.popover = popover;
  runtimeState.popoverCleanup = () => {
    monitorPopover.cancel();
    window.removeEventListener("scroll", monitorPopover, true);
    window.removeEventListener("resize", monitorPopover);
    extraCleanup?.();
    hidePopoverFromTopLayer(popover);
  };

  if (!positionPopover(popover, anchorElement)) {
    closePopover(runtimeState);
    return;
  }

  window.addEventListener("scroll", monitorPopover, true);
  window.addEventListener("resize", monitorPopover);
}

function createPopoverViewportMonitor(
  runtimeState: RuntimeState,
  popover: HTMLDivElement,
  anchorElement: HTMLElement
): PopoverViewportMonitor {
  let frameId: number | null = null;

  const monitorPopover = (() => {
    if (frameId !== null) {
      return;
    }

    frameId = window.requestAnimationFrame(() => {
      frameId = null;
      if (runtimeState.popover !== popover || !popover.isConnected) {
        return;
      }

      if (!anchorElement.isConnected || !positionPopover(popover, anchorElement)) {
        closePopover(runtimeState);
      }
    });
  }) as PopoverViewportMonitor;

  monitorPopover.cancel = () => {
    if (frameId === null) {
      return;
    }

    window.cancelAnimationFrame(frameId);
    frameId = null;
  };

  return monitorPopover;
}

function positionPopover(
  popover: HTMLDivElement,
  anchorElement: HTMLElement
): boolean {
  const viewportWidth = Math.max(
    window.innerWidth,
    document.documentElement.clientWidth
  );
  const viewportHeight = Math.max(
    window.innerHeight,
    document.documentElement.clientHeight
  );
  const maxLeft = viewportWidth - POPOVER_VIEWPORT_MARGIN;
  const maxTop = viewportHeight - POPOVER_VIEWPORT_MARGIN;
  const anchorRect = getPopoverAnchorRect(anchorElement);

  if (
    !anchorRect ||
    !isAnchorVisibleInViewport(anchorRect, viewportWidth, viewportHeight)
  ) {
    return false;
  }

  const popoverRect = popover.getBoundingClientRect();
  const popoverWidth = Math.ceil(popoverRect.width || popover.offsetWidth || 280);
  const popoverHeight = Math.ceil(popoverRect.height || popover.offsetHeight || 160);

  if (
    popoverWidth > viewportWidth - POPOVER_VIEWPORT_MARGIN * 2 ||
    popoverHeight > viewportHeight - POPOVER_VIEWPORT_MARGIN * 2
  ) {
    return false;
  }

  const anchorMiddleX = anchorRect.left + anchorRect.width / 2;
  const anchorMiddleY = anchorRect.top + anchorRect.height / 2;
  const candidates: Array<{
    placement: PopoverPlacement;
    left: number;
    top: number;
  }> = [
    {
      placement: "right",
      left: anchorRect.right + POPOVER_ANCHOR_OFFSET,
      top: anchorMiddleY - popoverHeight / 2
    },
    {
      placement: "left",
      left: anchorRect.left - POPOVER_ANCHOR_OFFSET - popoverWidth,
      top: anchorMiddleY - popoverHeight / 2
    },
    {
      placement: "bottom",
      left: anchorMiddleX - popoverWidth / 2,
      top: anchorRect.bottom + POPOVER_ANCHOR_OFFSET
    },
    {
      placement: "top",
      left: anchorMiddleX - popoverWidth / 2,
      top: anchorRect.top - POPOVER_ANCHOR_OFFSET - popoverHeight
    }
  ];

  for (const candidate of candidates) {
    const left =
      candidate.placement === "top" || candidate.placement === "bottom"
        ? clamp(
            candidate.left,
            POPOVER_VIEWPORT_MARGIN,
            maxLeft - popoverWidth
          )
        : candidate.left;
    const top =
      candidate.placement === "left" || candidate.placement === "right"
        ? clamp(
            candidate.top,
            POPOVER_VIEWPORT_MARGIN,
            maxTop - popoverHeight
          )
        : candidate.top;

    if (
      left < POPOVER_VIEWPORT_MARGIN ||
      top < POPOVER_VIEWPORT_MARGIN ||
      left + popoverWidth > maxLeft ||
      top + popoverHeight > maxTop
    ) {
      continue;
    }

    popover.style.position = "fixed";
    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
    popover.setAttribute("data-ik-placement", candidate.placement);
    return true;
  }

  return false;
}

function getPopoverAnchorRect(anchorElement: HTMLElement): PopoverAnchorRect | null {
  const rect = anchorElement.getBoundingClientRect();
  const hasLayoutRect =
    rect.width > 0 ||
    rect.height > 0 ||
    rect.left !== 0 ||
    rect.top !== 0 ||
    rect.right !== 0 ||
    rect.bottom !== 0;

  if (hasLayoutRect) {
    return rect;
  }

  const style = window.getComputedStyle(anchorElement);
  if (style.display === "none" || style.visibility === "hidden") {
    return null;
  }

  return {
    left: POPOVER_VIEWPORT_MARGIN,
    top: POPOVER_VIEWPORT_MARGIN,
    right: POPOVER_VIEWPORT_MARGIN,
    bottom: POPOVER_VIEWPORT_MARGIN,
    width: 0,
    height: 0
  };
}

function isAnchorVisibleInViewport(
  rect: PopoverAnchorRect,
  viewportWidth: number,
  viewportHeight: number
): boolean {
  return (
    rect.right >= 0 &&
    rect.bottom >= 0 &&
    rect.left <= viewportWidth &&
    rect.top <= viewportHeight
  );
}

function showPopoverInTopLayer(popover: HTMLDivElement) {
  const topLayerPopover = popover as TopLayerPopoverElement;
  if (typeof topLayerPopover.showPopover !== "function") {
    return;
  }

  try {
    topLayerPopover.showPopover();
    popover.setAttribute("data-ik-top-layer", "true");
  } catch {
    popover.removeAttribute("popover");
  }
}

function hidePopoverFromTopLayer(popover: HTMLDivElement) {
  const topLayerPopover = popover as TopLayerPopoverElement;
  if (typeof topLayerPopover.hidePopover !== "function") {
    return;
  }

  try {
    topLayerPopover.hidePopover();
  } catch {
    // The popover may already have been removed by the page or browser.
  }
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function closePopover(runtimeState: RuntimeState) {
  if (runtimeState.popoverCleanup) {
    runtimeState.popoverCleanup();
  }

  runtimeState.popoverCleanup = null;
  runtimeState.popover?.remove();
  runtimeState.popover = null;
  clearActiveToken(runtimeState);
}

function setActiveToken(runtimeState: RuntimeState, token: HTMLElement) {
  clearActiveToken(runtimeState);
  runtimeState.activeToken = token;
  token.setAttribute("data-ik-active", "true");
}

function clearActiveToken(runtimeState: RuntimeState) {
  if (!runtimeState.activeToken) {
    return;
  }

  runtimeState.activeToken.removeAttribute("data-ik-active");
  runtimeState.activeToken = null;
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

function createUiPopover(kind: "word" | "phrase" | "sentence"): HTMLDivElement {
  const popover = document.createElement("div");
  popover.className = "ik-ui-popover ik-content-popover";
  popover.setAttribute(POPOVER_ATTRIBUTE, "true");
  popover.setAttribute("data-ik-popover-kind", kind);
  popover.setAttribute("data-immersionkit-ignore", "true");
  popover.setAttribute("popover", "manual");
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-live", "polite");
  if (kind !== "sentence") {
    const arrow = document.createElement("span");
    arrow.className = "ik-ui-popover-arrow";
    popover.append(arrow);
  }
  return popover;
}

function createPopoverHeading(input: {
  title: string;
  badge: string;
  icon: PopoverIconName;
}): HTMLElement {
  const heading = document.createElement("header");
  heading.className = "ik-ui-popover-heading";
  heading.append(createSvgIcon(input.icon));

  const headingText = document.createElement("h3");
  headingText.textContent = input.title;
  heading.append(headingText);

  const badgeElement = document.createElement("span");
  badgeElement.className = "ik-ui-badge ik-ui-badge--accent";
  badgeElement.textContent = input.badge;
  heading.append(badgeElement);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "ik-ui-popover-close";
  closeButton.setAttribute("aria-label", "Close help");
  closeButton.setAttribute(POPOVER_CLOSE_ATTRIBUTE, "true");
  closeButton.append(createSvgIcon("close"));
  heading.append(closeButton);

  return heading;
}

function createTokenBox(text: string): HTMLSpanElement {
  const element = document.createElement("span");
  element.textContent = text;
  return element;
}

function createTokenArrow(): HTMLSpanElement {
  const element = document.createElement("span");
  element.textContent = "→";
  return element;
}

function createMiniLogo(): HTMLSpanElement {
  const logo = document.createElement("span");
  logo.className = "ik-ui-logo ik-ui-logo--sm";
  logo.setAttribute("aria-hidden", "true");
  for (let index = 0; index < 3; index += 1) {
    logo.append(document.createElement("span"));
  }

  return logo;
}

function createSvgIcon(name: PopoverIconName): SVGSVGElement {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.classList.add("ik-ui-icon", `ik-ui-icon--${name}`);
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-width", "2");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round");

  for (const pathData of iconPaths(name)) {
    if (pathData.startsWith("circle:")) {
      const [, cx, cy, r] = pathData.split(":");
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", cx ?? "12");
      circle.setAttribute("cy", cy ?? "12");
      circle.setAttribute("r", r ?? "10");
      icon.append(circle);
      continue;
    }

    if (pathData.startsWith("rect:")) {
      const [, x, y, width, height, rx] = pathData.split(":");
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", x ?? "0");
      rect.setAttribute("y", y ?? "0");
      rect.setAttribute("width", width ?? "0");
      rect.setAttribute("height", height ?? "0");
      if (rx) {
        rect.setAttribute("rx", rx);
      }
      icon.append(rect);
      continue;
    }

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathData);
    icon.append(path);
  }

  return icon;
}

function iconPaths(name: PopoverIconName): string[] {
  switch (name) {
    case "book":
      return [
        "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H7a3 3 0 0 0-3 3V5.5Z",
        "M4 19.5A2.5 2.5 0 0 1 6.5 17H20",
        "M9 7h6"
      ];
    case "check":
      return ["m5 12 4 4L19 6"];
    case "chevron":
      return ["m9 18 6-6-6-6"];
    case "close":
      return ["M18 6 6 18", "m6 6 12 12"];
    case "document":
      return [
        "M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z",
        "M14 2v5h5",
        "M9 13h6",
        "M9 17h4"
      ];
    case "eyeOff":
      return [
        "m2 2 20 20",
        "M10.58 10.58A2 2 0 0 0 12 14a2 2 0 0 0 1.42-.58",
        "M9.88 5.09A10.8 10.8 0 0 1 12 5c5 0 8 4 9 7a11.5 11.5 0 0 1-2.12 3.19",
        "M6.61 6.61C3.98 8.08 2.55 10.42 2 12c1 3 4 7 10 7a10.6 10.6 0 0 0 4.39-.91"
      ];
    case "info":
      return ["circle:12:12:10", "M12 16v-4", "M12 8h.01"];
    case "link":
      return [
        "M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L11 4.93",
        "M14 11a5 5 0 0 0-7.07 0L4.8 13.12a5 5 0 0 0 7.07 7.07L13 19.07"
      ];
    case "lock":
      return ["rect:4:10:16:10:2", "M8 10V7a4 4 0 0 1 8 0v3"];
    case "message":
      return ["M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"];
    case "spark":
      return [
        "M12 2v5",
        "M12 17v5",
        "M4.93 4.93 8.46 8.46",
        "m15.54 15.54 3.53 3.53",
        "M2 12h5",
        "M17 12h5",
        "m4.93 19.07 3.53-3.53",
        "m15.54 8.46 3.53-3.53"
      ];
    case "translate":
      return [
        "m5 8 6 6",
        "m4 14 6-6 2-3",
        "M2 5h12",
        "M7 2h1",
        "m22 22-5-10-5 10",
        "M14 18h6"
      ];
    case "volume":
      return [
        "M11 5 6 9H3v6h3l5 4V5Z",
        "M16 9.5a4 4 0 0 1 0 5",
        "M19 7a8 8 0 0 1 0 10"
      ];
  }
}

function wordStatusLabel(status: VocabStatus): string {
  if (status === "known") {
    return "comfortable";
  }

  if (status === "learning") {
    return "practicing";
  }

  if (status === "ignored") {
    return "hidden";
  }

  return "new";
}

function readInteractiveStatus(value: string | null): InteractiveVocabStatus | null {
  if (value === "known" || value === "learning" || value === "ignored") {
    return value;
  }

  return null;
}

function createSentencePopoverActionButton(
  action: SentencePopoverAction
): HTMLButtonElement {
  const metadata = {
    "show-translation": { label: "Translation", icon: "translate" },
    "toggle-source": { label: "Original", icon: "document" },
    details: { label: "Details", icon: "info" },
    close: { label: "Close", icon: "close" }
  } satisfies Record<SentencePopoverAction, { label: string; icon: PopoverIconName }>;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ik-ui-button ik-ui-button--secondary ik-ui-button--sm";
  button.setAttribute(POPOVER_SENTENCE_ACTION_ATTRIBUTE, action);
  button.append(createSvgIcon(metadata[action].icon));
  button.append(metadata[action].label);
  return button;
}

function syncSentencePopoverActions(
  popover: HTMLElement,
  noteElement: HTMLElement
) {
  const sourceVisible = noteElement.getAttribute("data-ik-source-visible") === "true";
  const translationButton = popover.querySelector<HTMLButtonElement>(
    `[${POPOVER_SENTENCE_ACTION_ATTRIBUTE}="show-translation"]`
  );
  if (translationButton) {
    translationButton.setAttribute("aria-pressed", sourceVisible ? "false" : "true");
    translationButton.classList.toggle("is-active", !sourceVisible);
  }

  const toggleButton = popover.querySelector<HTMLButtonElement>(
    `[${POPOVER_SENTENCE_ACTION_ATTRIBUTE}="toggle-source"]`
  );
  if (toggleButton) {
    toggleButton.setAttribute("aria-pressed", sourceVisible ? "true" : "false");
    toggleButton.classList.toggle("is-active", sourceVisible);
  }

  const detailsButton = popover.querySelector<HTMLButtonElement>(
    `[${POPOVER_SENTENCE_ACTION_ATTRIBUTE}="details"]`
  );
  if (detailsButton) {
    const detailsActive = popover.getAttribute("data-ik-details-active") === "true";
    detailsButton.setAttribute("aria-pressed", detailsActive ? "true" : "false");
    detailsButton.classList.toggle("is-active", detailsActive);
  }

  const closeButton = popover.querySelector<HTMLButtonElement>(
    `[${POPOVER_SENTENCE_ACTION_ATTRIBUTE}="close"]`
  );
  if (closeButton) {
    closeButton.textContent = "Close";
    closeButton.removeAttribute("aria-pressed");
  }
}

function readSentencePopoverAction(
  value: string | null
): SentencePopoverAction | null {
  if (
    value === "show-translation" ||
    value === "toggle-source" ||
    value === "details" ||
    value === "close"
  ) {
    return value;
  }

  return null;
}

function readNonEmptyString(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isWithinPopover(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(`[${POPOVER_ATTRIBUTE}]`));
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

function createDefaultDiagnostics(): PageDiagnosticsSnapshot {
  return {
    pageUrl: window.location.href,
    pageHostname: window.location.hostname,
    pagePathname: window.location.pathname,
    siteEnabled: true,
    sentenceTranslationEnabled: false,
    assetSource: "unknown",
    renderUnitCount: 0,
    renderAssetVersion: null,
    fallbackAsset: true,
    processedTextNodes: 0,
    injectedTokens: 0,
    injectedPhrases: 0,
    rejectedPhrases: 0,
    contextSkippedTokens: 0,
    analysisSuppressedTokens: 0,
    sentenceCandidatesSeen: 0,
    sentenceCandidatesQueued: 0,
    sentenceNotesRendered: 0,
    sentenceNotesVisible: countSentenceNotes(),
    mutationCacheRefreshes: 0,
    mutationCacheRefreshHits: 0,
    freshPhraseAnalysisHits: 0,
    freshPhraseRerenders: 0,
    curriculumConfigId: null,
    activeCurriculumBandId: null,
    curriculumSkippedSentences: 0,
    curriculumSkippedWords: 0,
    curriculumSkippedPhrases: 0,
    grammarDueSentenceCount: 0,
    sentenceRankingReasons: [],
    phraseDecisionSamples: collectPhraseDecisionSamples(),
    tokenDecisionSamples: collectTokenDecisionSamples(),
    updatedAt: new Date().toISOString()
  };
}

function readPageDiagnostics(runtimeState: RuntimeState): PageDiagnosticsSnapshot {
  updateDiagnostics(runtimeState);
  return { ...runtimeState.diagnostics };
}

function updateDiagnostics(runtimeState: RuntimeState) {
  const processing = runtimeState.processing;
  if (processing) {
    runtimeState.diagnostics.processedTextNodes = processing.processedTextNodes;
    runtimeState.diagnostics.injectedTokens = processing.injectedTokens;
    runtimeState.diagnostics.injectedPhrases = processing.injectedPhrases;
    runtimeState.diagnostics.rejectedPhrases = processing.rejectedPhrases;
    runtimeState.diagnostics.contextSkippedTokens = processing.contextSkippedTokens;
    runtimeState.diagnostics.analysisSuppressedTokens =
      processing.analysisSuppressedTokens;
    runtimeState.diagnostics.sentenceCandidatesSeen = processing.seenSentenceHashes.size;
    runtimeState.diagnostics.sentenceCandidatesQueued =
      processing.sentenceCandidatesQueued;
    runtimeState.diagnostics.sentenceNotesRendered = processing.sentenceNotesRendered;
    runtimeState.diagnostics.mutationCacheRefreshes =
      processing.mutationCacheRefreshes;
    runtimeState.diagnostics.mutationCacheRefreshHits =
      processing.mutationCacheRefreshHits;
    runtimeState.diagnostics.freshPhraseAnalysisHits =
      processing.freshPhraseAnalysisHits;
    runtimeState.diagnostics.freshPhraseRerenders =
      processing.freshPhraseRerenders;
    runtimeState.diagnostics.curriculumConfigId = processing.curriculumConfigId;
    runtimeState.diagnostics.activeCurriculumBandId =
      processing.activeCurriculumBandId;
    runtimeState.diagnostics.curriculumSkippedSentences =
      processing.curriculumSkippedSentences;
    runtimeState.diagnostics.curriculumSkippedWords =
      processing.curriculumSkippedWords;
    runtimeState.diagnostics.curriculumSkippedPhrases =
      processing.curriculumSkippedPhrases;
    runtimeState.diagnostics.grammarDueSentenceCount =
      countGrammarDueSentenceReasons(processing.sentenceRankingReasons);
    runtimeState.diagnostics.sentenceRankingReasons =
      processing.sentenceRankingReasons;
  }

  runtimeState.diagnostics.sentenceNotesVisible = countSentenceNotes();
  runtimeState.diagnostics.phraseDecisionSamples = collectPhraseDecisionSamples(
    runtimeState.processing
  );
  runtimeState.diagnostics.tokenDecisionSamples = collectTokenDecisionSamples();
  runtimeState.diagnostics.updatedAt = new Date().toISOString();
}

function updateCurriculumDiagnosticsFromRanking(state: ProcessingState) {
  const curriculumReasons = state.sentenceRankingReasons.flatMap((reason) =>
    reason.curriculum ? [reason.curriculum] : []
  );
  const first = curriculumReasons[0];

  state.curriculumConfigId = first?.configId ?? state.curriculumConfigId;
  state.activeCurriculumBandId =
    first?.activeBandId ?? state.activeCurriculumBandId;
  state.curriculumSkippedSentences = curriculumReasons.filter(
    (reason) => !reason.eligible
  ).length;
}

function countGrammarDueSentenceReasons(
  reasons: readonly PageDiagnosticsSentenceRankingReason[]
): number {
  return reasons.filter(
    (reason) => (reason.signals?.grammarDueValue ?? 0) > 0
  ).length;
}

function countSentenceNotes(): number {
  return document.querySelectorAll(SENTENCE_NOTE_SELECTOR).length;
}

function collectTokenDecisionSamples(): PageDiagnosticsTokenSample[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      `[${IMMERSIONKIT_TOKEN_ATTRIBUTE}]`
    )
  )
    .slice(0, TOKEN_DIAGNOSTICS_SAMPLE_LIMIT)
    .map((token) => ({
      sourceToken: token.getAttribute("data-ik-source-token"),
      targetToken: token.getAttribute("data-ik-target-token"),
      lexemeId: token.getAttribute("data-ik-lexeme-id"),
      unitKind: token.getAttribute("data-ik-unit-kind"),
      wordKind: token.getAttribute("data-ik-word-kind"),
      contextDecision: token.getAttribute("data-ik-context-decision"),
      contextRationale: token.getAttribute("data-ik-context-rationale"),
      dueStatus: token.getAttribute("data-ik-due-status"),
      schedulerReason: token.getAttribute("data-ik-scheduler-reason"),
      sentenceHash: token.getAttribute("data-ik-sentence-hash")
    }));
}

function collectPhraseDecisionSamples(
  state: ProcessingState | null = null
): PageDiagnosticsPhraseSample[] {
  const selected = Array.from(
    document.querySelectorAll<HTMLElement>("[data-ik-unit-kind='phrase']")
  ).map((phrase): PageDiagnosticsPhraseSample => ({
    phraseId: phrase.getAttribute("data-ik-phrase-id"),
    sourceText: phrase.getAttribute("data-ik-source-token"),
    targetText: phrase.getAttribute("data-ik-target-token"),
    selected: true,
    rejectedReason: null,
    sourceKind: phrase.getAttribute("data-ik-phrase-source-kind"),
    category: phrase.getAttribute("data-ik-phrase-category"),
    dueStatus: phrase.getAttribute("data-ik-due-status"),
    schedulerReason: phrase.getAttribute("data-ik-scheduler-reason"),
    sentenceHash: phrase.getAttribute("data-ik-sentence-hash"),
    exposureEligible: Boolean(phrase.getAttribute("data-ik-sentence-hash"))
  }));

  const rejected = Array.from(
    document.querySelectorAll<HTMLElement>("[data-ik-phrase-rejection-details]")
  ).flatMap(readPhraseRejectionDetails);

  return [
    ...selected,
    ...rejected,
    ...(state?.unrenderedPhraseRejections.map(toRejectedPhraseDecisionSample) ?? [])
  ].slice(0, PHRASE_DIAGNOSTICS_SAMPLE_LIMIT);
}

function toRejectedPhraseDecisionSample(
  entry: PhraseRenderRejection
): PageDiagnosticsPhraseSample {
  return {
    phraseId: entry.phraseId,
    sourceText: entry.sourceText,
    targetText: entry.targetText,
    selected: false,
    rejectedReason: entry.reason,
    sourceKind: entry.sourceKind,
    category: entry.category,
    dueStatus: null,
    schedulerReason: null,
    sentenceHash: entry.sentenceHash,
    exposureEligible: false
  };
}

function readPhraseRejectionDetails(
  wrapper: HTMLElement
): PageDiagnosticsPhraseSample[] {
  const rawDetails = wrapper.getAttribute("data-ik-phrase-rejection-details");
  if (!rawDetails) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawDetails);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((entry): PageDiagnosticsPhraseSample[] => {
      if (!isRecord(entry)) {
        return [];
      }

      const phraseId = readNullableString(entry.phraseId);
      const rejectedReason = readNullableString(entry.reason);
      if (!phraseId || !rejectedReason) {
        return [];
      }

      return [
        {
          phraseId,
          sourceText: readNullableString(entry.sourceText),
          targetText: readNullableString(entry.targetText),
          selected: false,
          rejectedReason,
          sourceKind: readNullableString(entry.sourceKind),
          category: readNullableString(entry.category),
          dueStatus: null,
          schedulerReason: null,
          sentenceHash: readNullableString(entry.sentenceHash),
          exposureEligible: false
        }
      ];
    });
  } catch {
    return [];
  }
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function applyUiTheme() {
  const theme = detectUiTheme();
  document.documentElement.setAttribute(UI_THEME_ATTRIBUTE, theme);
}

function detectUiTheme(): UiTheme {
  const bodyColor = readCssColor(
    document.body ? window.getComputedStyle(document.body).backgroundColor : null
  );
  const rootColor = readCssColor(window.getComputedStyle(document.documentElement).backgroundColor);
  const resolved = chooseBackgroundColor(bodyColor, rootColor);
  const luminance = getRelativeLuminance(resolved.r, resolved.g, resolved.b);
  return luminance < 0.42 ? "dark" : "light";
}

function chooseBackgroundColor(
  bodyColor: RgbaColor | null,
  rootColor: RgbaColor | null
): RgbaColor {
  if (bodyColor && bodyColor.a > 0.99) {
    return bodyColor;
  }

  if (rootColor && rootColor.a > 0.99) {
    return rootColor;
  }

  if (bodyColor && rootColor) {
    return blendRgba(bodyColor, rootColor);
  }

  if (bodyColor) {
    return bodyColor;
  }

  if (rootColor) {
    return rootColor;
  }

  return { r: 255, g: 255, b: 255, a: 1 };
}

type RgbaColor = {
  r: number;
  g: number;
  b: number;
  a: number;
};

function readCssColor(input: string | null): RgbaColor | null {
  if (!input || input === "transparent") {
    return null;
  }

  const rgbaMatch = input
    .trim()
    .match(
      /^rgba?\(\s*([0-9]{1,3}(?:\.[0-9]+)?)\s*,\s*([0-9]{1,3}(?:\.[0-9]+)?)\s*,\s*([0-9]{1,3}(?:\.[0-9]+)?)(?:\s*,\s*([01](?:\.[0-9]+)?|0?\.[0-9]+))?\s*\)$/i
    );

  if (rgbaMatch) {
    const r = clampChannel(Number(rgbaMatch[1]));
    const g = clampChannel(Number(rgbaMatch[2]));
    const b = clampChannel(Number(rgbaMatch[3]));
    const a = clampAlpha(rgbaMatch[4] ? Number(rgbaMatch[4]) : 1);

    return { r, g, b, a };
  }

  const hexMatch = input.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!hexMatch) {
    return null;
  }

  const hex = hexMatch[1];
  if (hex.length === 3) {
    return {
      r: Number.parseInt(hex[0] + hex[0], 16),
      g: Number.parseInt(hex[1] + hex[1], 16),
      b: Number.parseInt(hex[2] + hex[2], 16),
      a: 1
    };
  }

  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
    a: 1
  };
}

function clampChannel(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(255, Math.max(0, Math.round(value)));
}

function clampAlpha(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(1, Math.max(0, value));
}

function blendRgba(foreground: RgbaColor, background: RgbaColor): RgbaColor {
  const alpha = foreground.a + background.a * (1 - foreground.a);
  if (alpha <= 0) {
    return { r: 255, g: 255, b: 255, a: 1 };
  }

  const r =
    (foreground.r * foreground.a +
      background.r * background.a * (1 - foreground.a)) /
    alpha;
  const g =
    (foreground.g * foreground.a +
      background.g * background.a * (1 - foreground.a)) /
    alpha;
  const b =
    (foreground.b * foreground.a +
      background.b * background.a * (1 - foreground.a)) /
    alpha;

  return {
    r: clampChannel(r),
    g: clampChannel(g),
    b: clampChannel(b),
    a: clampAlpha(alpha)
  };
}

function getRelativeLuminance(r: number, g: number, b: number): number {
  const red = normalizeSrgbChannel(r);
  const green = normalizeSrgbChannel(g);
  const blue = normalizeSrgbChannel(b);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function normalizeSrgbChannel(value: number): number {
  const channel = value / 255;
  if (channel <= 0.04045) {
    return channel / 12.92;
  }

  return ((channel + 0.055) / 1.055) ** 2.4;
}
