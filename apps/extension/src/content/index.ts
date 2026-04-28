import {
  evaluateCurriculumEligibility,
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
  SeedLexiconEntry,
  SentenceAnalysisEntry,
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
  applySentenceAnalysisDecisions,
  applyTokenStatusUpdate,
  processTextNode,
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
  shouldSkipDocument
} from "./dom";
import { segmentSentences } from "./sentences";
import { ContentEvidenceTracker } from "./evidence";
import { buildLexiconLookup } from "./lexicon";
import {
  clearSentenceTranslations,
  parseSentenceTranslationResults,
  readSentenceNoteMetadata,
  renderSentenceTranslations,
  toggleSentenceSourceReveal
} from "./sentence-renderer";
import type { SentenceNoteMetadata } from "./sentence-renderer";
import {
  loadCachedSentenceAnalysisContext,
  loadProcessingContext,
  persistVocabStatus,
  refreshLearningItemsByUnitRefIds
} from "./storage";
import type { CachedContextSkipDecision, CachedPhraseMatch } from "./storage";
import "./styles.css";

type ProcessingState = {
  discoveryRate: number;
  samplingSeed: string;
  lexiconLookup: Map<string, SeedLexiconEntry>;
  vocabByLemmaId: Map<string, UserVocabEntry>;
  learningItemsByUnitRefId: Map<string, LearningItem>;
  cachedContextSkipDecisions: Map<string, CachedContextSkipDecision[]>;
  cachedPhraseMatchesBySentenceHash: Map<string, CachedPhraseMatch[]>;
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
  sentenceRankingReasons: PageDiagnosticsSentenceRankingReason[];
  pendingRoots: Set<ParentNode>;
  flushHandle: number | null;
  observer: MutationObserver | null;
  nodeSequence: number;
  sentenceTranslationEnabled: boolean;
  evidenceTracker: ContentEvidenceTracker;
  isActive: boolean;
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
type SentencePopoverAction = "toggle-source" | "close";

const POPOVER_ATTRIBUTE = "data-ik-popover";
const POPOVER_ACTION_ATTRIBUTE = "data-ik-status-action";
const POPOVER_SENTENCE_ACTION_ATTRIBUTE = "data-ik-sentence-action";
const SENTENCE_NOTE_SELECTOR = "[data-ik-sentence-note='true']";
const UI_THEME_ATTRIBUTE = "data-ik-ui-theme";
const TOKEN_DIAGNOSTICS_SAMPLE_LIMIT = 8;
const PHRASE_DIAGNOSTICS_SAMPLE_LIMIT = 8;
const FRESH_PHRASE_RERENDER_LIMIT = 20;
const STATUS_BUTTONS: readonly {
  status: InteractiveVocabStatus;
  label: string;
}[] = [
  { status: "known", label: "Known" },
  { status: "learning", label: "Learning" },
  { status: "ignored", label: "Ignored" }
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

    applyStatusToLemmaTokens(detail);
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
        const renderedCount = renderSentenceTranslations(results);
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
      lexiconSource: processingContext.lexiconInfo.source,
      lexiconEntryCount: processingContext.lexiconInfo.entryCount,
      lexiconAssetVersion: processingContext.lexiconInfo.assetVersion,
      fallbackLexicon: processingContext.lexiconInfo.isFallback,
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
      sentenceRankingReasons: [],
      phraseDecisionSamples: collectPhraseDecisionSamples(),
      tokenDecisionSamples: collectTokenDecisionSamples(),
      updatedAt: new Date().toISOString()
    };

    console.info("ImmersionKit lexicon loaded for page.", {
      source: processingContext.lexiconInfo.source,
      entryCount: processingContext.lexiconInfo.entryCount,
      assetVersion: processingContext.lexiconInfo.assetVersion,
      fallback: processingContext.lexiconInfo.isFallback
    });
    if (processingContext.lexiconInfo.isFallback) {
      console.warn(
        "ImmersionKit is using emergency fallback lexicon; check bundled/generated seed asset loading."
      );
    }

    if (!processingContext.siteEnabled) {
      stopProcessing(runtimeState);
      console.info("ImmersionKit disabled for site.", {
        hostname: window.location.hostname
      });
      return;
    }

    const lexiconLookup = buildLexiconLookup(processingContext.lexicon);
    if (lexiconLookup.size === 0) {
      stopProcessing(runtimeState);
      console.info("ImmersionKit has no safe lexicon entries to inject.");
      return;
    }

    stopProcessing(runtimeState);
    const state: ProcessingState = {
      discoveryRate: processingContext.discoveryRate,
      samplingSeed: `${window.location.hostname}${window.location.pathname}`,
      lexiconLookup,
      vocabByLemmaId: processingContext.vocabByLemmaId,
      learningItemsByUnitRefId: processingContext.learningItemsByUnitRefId,
      cachedContextSkipDecisions: processingContext.cachedContextSkipDecisions,
      cachedPhraseMatchesBySentenceHash:
        processingContext.cachedPhraseMatchesBySentenceHash,
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
      sentenceRankingReasons: [],
      pendingRoots: new Set<ParentNode>(),
      flushHandle: null,
      observer: null,
      nodeSequence: 0,
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
      !state.cachedContextSkipDecisions.has(hash) &&
      !state.cachedPhraseMatchesBySentenceHash.has(hash)
  );

  if (sentenceHashes.length === 0) {
    return;
  }

  state.mutationCacheRefreshes += 1;

  try {
    const context = await loadCachedSentenceAnalysisContext(sentenceHashes.slice(0, 100));
    state.mutationCacheRefreshHits += context.entryCount;
    mergeCachedAnalysisMap(
      state.cachedContextSkipDecisions,
      context.cachedContextSkipDecisions
    );
    mergeCachedAnalysisMap(
      state.cachedPhraseMatchesBySentenceHash,
      context.cachedPhraseMatchesBySentenceHash
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
        lexiconLookup: state.lexiconLookup,
        vocabByLemmaId: state.vocabByLemmaId,
        cachedContextSkipDecisions: state.cachedContextSkipDecisions,
        cachedPhraseMatchesBySentenceHash: state.cachedPhraseMatchesBySentenceHash,
        learningItemsByUnitRefId: state.learningItemsByUnitRefId,
        shouldActivateWord: (input) => shouldActivateWordByCurriculum(state, input),
        shouldActivatePhrase: (input) => shouldActivatePhraseByCurriculum(state, input),
        isKnownWordForScoring: (word) => isKnownWord(state, word),
        isDueForReview: (lemmaId) => isDueLearningItem(state, lemmaId),
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

      if (!result.replaced) {
        continue;
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
  }

  state.processedTextNodes += processedNodes;
  state.injectedTokens += injectedTokens;
  state.injectedPhrases += injectedPhrases;
  state.rejectedPhrases += rejectedPhrases;
  state.contextSkippedTokens += contextSkippedTokens;
  state.curriculumSkippedWords += curriculumSkippedWords;
  state.curriculumSkippedPhrases += curriculumSkippedPhrases;
  state.evidenceTracker.registerRenderedTokens(document);
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
        state.analysisSuppressedTokens += applySentenceAnalysisDecisions(analysisEntries);
        void refreshFreshPhraseMatches(state, analysisEntries);
      }

      if (state.sentenceTranslationEnabled && cachedResults.length > 0) {
        state.sentenceNotesRendered += renderSentenceTranslations(cachedResults);
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
    for (const node of collectEligibleTextNodes(root)) {
      for (const sentence of segmentSentences(node.nodeValue ?? "")) {
        hashes.add(sentence.hash);
        if (hashes.size >= limit) {
          return [...hashes];
        }
      }
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

async function refreshFreshPhraseMatches(
  state: ProcessingState,
  entries: readonly SentenceAnalysisEntry[]
) {
  if (!state.isActive) {
    return;
  }

  const sentenceHashesWithPhrases = new Set<string>();
  for (const entry of entries) {
    const skipDecisions = entry.contextualWordCandidates.flatMap(
      (candidate): CachedContextSkipDecision[] => {
        if (candidate.decision !== "skip" || !candidate.lemmaId) {
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
            lemmaId: candidate.lemmaId,
            normalizedText,
            rationale: candidate.rationale
          }
        ];
      }
    );
    if (skipDecisions.length > 0) {
      state.cachedContextSkipDecisions.set(entry.sentenceHash, skipDecisions);
    }

    const phraseMatches = entry.phraseMatches.flatMap((match): CachedPhraseMatch[] => {
      if (!match.phraseId || !match.sourceText || !match.normalizedSourceText) {
        return [];
      }

      return [
        {
          occurrenceId: match.occurrenceId,
          phraseId: match.phraseId,
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

    if (phraseMatches.length === 0) {
      continue;
    }

    state.cachedPhraseMatchesBySentenceHash.set(entry.sentenceHash, phraseMatches);
    sentenceHashesWithPhrases.add(entry.sentenceHash);
  }

  if (sentenceHashesWithPhrases.size === 0) {
    return;
  }

  await refreshPhraseLearningItemsForFreshMatches(state, entries);
  if (!state.isActive) {
    return;
  }

  state.freshPhraseAnalysisHits += sentenceHashesWithPhrases.size;
  state.freshPhraseRerenders += rerenderAnnotatedNodesForSentenceHashes(
    state,
    sentenceHashesWithPhrases
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

function rerenderAnnotatedNodesForSentenceHashes(
  state: ProcessingState,
  sentenceHashes: ReadonlySet<string>
): number {
  if (!document.body || !state.isActive) {
    return 0;
  }

  const wrappers = Array.from(
    document.querySelectorAll<HTMLElement>(
      `[${IMMERSIONKIT_NODE_ATTRIBUTE}][${IMMERSIONKIT_ORIGINAL_TEXT_ATTRIBUTE}]`
    )
  );
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
  const lexiconEntry = state.lexiconLookup.get(normalizedWord);
  if (!lexiconEntry) {
    return true;
  }

  const status = state.vocabByLemmaId.get(lexiconEntry.lemmaId)?.status ?? "new";
  return status === "known" || status === "learning";
}

function isDueLearningItem(state: ProcessingState, lemmaId: string): boolean {
  const item = state.learningItemsByUnitRefId.get(lemmaId);
  return shouldReceiveDueReviewBoost(item, Date.now());
}

function shouldActivateWordByCurriculum(
  state: ProcessingState,
  input: WordActivationInput
) {
  if (input.isDueForReview || input.status !== "new") {
    return { eligible: true };
  }

  const decision = evaluateCurriculumEligibility(state.curriculumConfig, {
    unitType: "word",
    itemId: input.lexiconEntry.lemmaId,
    bandId: input.learningItem?.bandId ?? null,
    score: scoreSeedLexiconDifficulty(input.lexiconEntry),
    profile: state.learningProfile
  });

  state.curriculumConfigId = decision.configId;
  state.activeCurriculumBandId = decision.activeBandId;
  return decision;
}

function shouldActivatePhraseByCurriculum(
  state: ProcessingState,
  input: PhraseActivationInput
) {
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
  return decision;
}

function scoreSeedLexiconDifficulty(entry: SeedLexiconEntry): number | null {
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

  document.body.append(popover);
  positionPopover(popover, tokenElement);

  const closeOnViewportChange = () => {
    closePopover(runtimeState);
  };

  window.addEventListener("scroll", closeOnViewportChange, true);
  window.addEventListener("resize", closeOnViewportChange);

  runtimeState.popover = popover;
  runtimeState.popoverCleanup = () => {
    window.removeEventListener("scroll", closeOnViewportChange, true);
    window.removeEventListener("resize", closeOnViewportChange);
  };
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

  const popover = renderSentencePopover(noteElement, detail);
  popover.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) {
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

    if (action === "toggle-source") {
      const sourceVisible = noteElement.getAttribute("data-ik-source-visible") === "true";
      noteElement.setAttribute("data-ik-source-visible", String(!sourceVisible));
      syncSentencePopoverActions(popover, noteElement);
      return;
    }

    closePopover(runtimeState);
  });

  document.body.append(popover);
  positionPopover(popover, noteElement);

  const closeOnViewportChange = () => {
    closePopover(runtimeState);
  };

  window.addEventListener("scroll", closeOnViewportChange, true);
  window.addEventListener("resize", closeOnViewportChange);

  runtimeState.popover = popover;
  runtimeState.popoverCleanup = () => {
    window.removeEventListener("scroll", closeOnViewportChange, true);
    window.removeEventListener("resize", closeOnViewportChange);
  };
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
  document.body.append(popover);
  positionPopover(popover, phraseElement);

  const closeOnViewportChange = () => {
    closePopover(runtimeState);
  };

  window.addEventListener("scroll", closeOnViewportChange, true);
  window.addEventListener("resize", closeOnViewportChange);

  runtimeState.popover = popover;
  runtimeState.popoverCleanup = () => {
    window.removeEventListener("scroll", closeOnViewportChange, true);
    window.removeEventListener("resize", closeOnViewportChange);
  };
}

async function handlePopoverStatusAction(
  runtimeState: RuntimeState,
  detail: TokenActivatedDetail,
  status: InteractiveVocabStatus
) {
  let persistedEntry: UserVocabEntry | null = null;

  try {
    persistedEntry = await persistVocabStatus({
      lemmaId: detail.lemmaId,
      status
    });
  } catch (error) {
    console.warn("ImmersionKit failed to persist vocab status update.", {
      error,
      lemmaId: detail.lemmaId,
      status
    });
  }

  const updateDetail: TokenStatusUpdatedDetail = {
    tokenId: detail.tokenId,
    lemmaId: detail.lemmaId,
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

function renderPopover(detail: TokenActivatedDetail): HTMLDivElement {
  const popover = document.createElement("div");
  popover.className = "ik-popover";
  popover.setAttribute(POPOVER_ATTRIBUTE, "true");
  popover.setAttribute("data-immersionkit-ignore", "true");
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-live", "polite");

  const pair = document.createElement("div");
  pair.className = "ik-popover__pair";
  pair.append(createTokenPill("ik-popover__source", detail.sourceToken));
  pair.append(createArrow());
  pair.append(createTokenPill("ik-popover__target", detail.targetToken));
  popover.append(pair);

  const nativeExample = readNonEmptyString(detail.exampleSentenceNative);
  const englishExample = readNonEmptyString(detail.exampleSentenceEnglish);
  const pageSentence = readNonEmptyString(detail.sentence);

  if (nativeExample) {
    const sentence = document.createElement("p");
    sentence.className = "ik-popover__sentence";
    sentence.textContent = nativeExample;
    popover.append(sentence);
  }

  if (englishExample) {
    const sentence = document.createElement("p");
    sentence.className = nativeExample ? "ik-popover__meta" : "ik-popover__sentence";
    sentence.textContent = englishExample;
    popover.append(sentence);
  } else if (pageSentence) {
    const sentence = document.createElement("p");
    sentence.className = "ik-popover__sentence";
    sentence.textContent = pageSentence;
    popover.append(sentence);
  }

  const actions = document.createElement("div");
  actions.className = "ik-popover__actions";

  for (const action of STATUS_BUTTONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ik-popover__action";
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
  return popover;
}

function renderSentencePopover(
  noteElement: HTMLElement,
  detail: SentenceNoteMetadata
): HTMLDivElement {
  const popover = document.createElement("div");
  popover.className = "ik-popover";
  popover.setAttribute(POPOVER_ATTRIBUTE, "true");
  popover.setAttribute("data-immersionkit-ignore", "true");
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-live", "polite");

  const summary = document.createElement("p");
  summary.className = "ik-popover__sentence";
  summary.textContent = detail.learningNote.summary;
  popover.append(summary);

  for (const section of collectSentencePopoverSections(detail)) {
    const block = document.createElement("section");
    block.className = "ik-popover__sentence-detail";

    const label = document.createElement("p");
    label.className = "ik-popover__sentence-detail-label";
    label.textContent = section.label;
    block.append(label);

    if (section.lines.length === 1) {
      const text = document.createElement("p");
      text.className = "ik-popover__sentence-detail-text";
      text.textContent = section.lines[0] ?? "";
      block.append(text);
    } else {
      const list = document.createElement("div");
      list.className = "ik-popover__sentence-detail-list";

      for (const line of section.lines) {
        const item = document.createElement("p");
        item.className = "ik-popover__sentence-detail-line";
        item.textContent = line;
        list.append(item);
      }

      block.append(list);
    }

    popover.append(block);
  }

  const actions = document.createElement("div");
  actions.className = "ik-popover__actions";
  actions.append(createSentencePopoverActionButton("toggle-source"));
  actions.append(createSentencePopoverActionButton("close"));
  popover.append(actions);

  syncSentencePopoverActions(popover, noteElement);

  return popover;
}

function renderPhrasePopover(detail: PhraseActivatedDetail): HTMLDivElement {
  const popover = document.createElement("div");
  popover.className = "ik-popover";
  popover.setAttribute(POPOVER_ATTRIBUTE, "true");
  popover.setAttribute("data-immersionkit-ignore", "true");
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-live", "polite");

  const pair = document.createElement("div");
  pair.className = "ik-popover__pair";
  pair.append(createTokenPill("ik-popover__source", detail.sourceText));
  pair.append(createArrow());
  pair.append(createTokenPill("ik-popover__target", detail.targetText));
  popover.append(pair);

  const meta = document.createElement("p");
  meta.className = "ik-popover__meta";
  meta.textContent = [
    formatPhraseLabel(detail.category),
    formatPhraseLabel(detail.sourceKind),
    detail.confidence === null ? null : `confidence ${detail.confidence.toFixed(2)}`
  ]
    .filter(Boolean)
    .join(" · ");
  popover.append(meta);

  const pageSentence = readNonEmptyString(detail.sentence);
  if (pageSentence) {
    const sentence = document.createElement("p");
    sentence.className = "ik-popover__sentence";
    sentence.textContent = pageSentence;
    popover.append(sentence);
  }

  return popover;
}

function formatPhraseLabel(value: string): string {
  return value.replace(/-/g, " ");
}

function collectSentencePopoverSections(
  detail: SentenceNoteMetadata
): { label: string; lines: string[] }[] {
  const summaryKey = normalizeSentencePopoverText(detail.learningNote.summary);
  const seen = new Set(summaryKey ? [summaryKey] : []);
  const sections = [
    {
      label: "Word-by-word",
      lines: splitGlossLines(detail.learningNote.literalGloss)
    },
    {
      label: "Phrase",
      lines: toSentencePopoverLines(detail.learningNote.keyPhrase)
    },
    {
      label: "Natural Spanish",
      lines: toSentencePopoverLines(detail.learningNote.canonicalUsage)
    },
    {
      label: "Grammar",
      lines: toSentencePopoverLines(detail.learningNote.grammarFocus)
    }
  ];

  return sections.filter((section) => {
    const key = normalizeSentencePopoverText(section.lines.join("\n"));
    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function normalizeSentencePopoverText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function toSentencePopoverLines(value: string): string[] {
  const text = value.trim();
  return text ? [text] : [];
}

function splitGlossLines(value: string): string[] {
  const text = value.trim();
  if (!text) {
    return [];
  }

  const newlineLines = text
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (newlineLines.length > 1) {
    return newlineLines;
  }

  return text
    .split(/\s+\/\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function positionPopover(popover: HTMLDivElement, tokenElement: HTMLElement) {
  const tokenRect = tokenElement.getBoundingClientRect();
  const margin = 10;
  const preferredOffset = 8;
  const viewportLeft = window.scrollX;
  const viewportTop = window.scrollY;
  const viewportRight = viewportLeft + window.innerWidth;

  const popoverWidth = popover.offsetWidth || 280;
  const popoverHeight = popover.offsetHeight || 160;
  const tokenMiddle = tokenRect.left + tokenRect.width / 2 + viewportLeft;
  let left = tokenMiddle - popoverWidth / 2;
  left = Math.max(viewportLeft + margin, left);
  left = Math.min(left, viewportRight - popoverWidth - margin);

  const topAbove = viewportTop + tokenRect.top - popoverHeight - preferredOffset;
  const canRenderAbove = topAbove >= viewportTop + margin;
  const top = canRenderAbove
    ? topAbove
    : viewportTop + tokenRect.bottom + preferredOffset;

  popover.style.position = "absolute";
  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
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

function applyStatusToLemmaTokens(update: TokenStatusUpdatedDetail) {
  const tokens = document.querySelectorAll<HTMLElement>(IMMERSIONKIT_WORD_SELECTOR);
  let anyUpdated = false;

  for (const token of tokens) {
    if (token.getAttribute("data-ik-lemma-id") !== update.lemmaId) {
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

  const existingEntry = processing.vocabByLemmaId.get(update.lemmaId);
  processing.vocabByLemmaId.set(
    update.lemmaId,
    update.entry ?? {
      lemmaId: update.lemmaId,
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

function createTokenPill(className: string, text: string): HTMLSpanElement {
  const element = document.createElement("span");
  element.className = `ik-popover__pill ${className}`;
  element.textContent = text;
  return element;
}

function createArrow(): HTMLSpanElement {
  const element = document.createElement("span");
  element.className = "ik-popover__arrow";
  element.textContent = "→";
  return element;
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
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ik-popover__action";
  button.setAttribute(POPOVER_SENTENCE_ACTION_ATTRIBUTE, action);
  return button;
}

function syncSentencePopoverActions(
  popover: HTMLElement,
  noteElement: HTMLElement
) {
  const toggleButton = popover.querySelector<HTMLButtonElement>(
    `[${POPOVER_SENTENCE_ACTION_ATTRIBUTE}="toggle-source"]`
  );
  if (toggleButton) {
    const sourceVisible = noteElement.getAttribute("data-ik-source-visible") === "true";
    toggleButton.textContent = sourceVisible ? "Show Translation" : "Show Original";
    toggleButton.setAttribute("aria-pressed", sourceVisible ? "true" : "false");
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
  if (value === "toggle-source" || value === "close") {
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
          signals: readRankingSignals(reason.signals)
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
  const chunkUsefulness =
    typeof value.chunkUsefulness === "number" ? value.chunkUsefulness : null;
  const ambiguityPenalty =
    typeof value.ambiguityPenalty === "number" ? value.ambiguityPenalty : null;

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
    chunkUsefulness,
    ambiguityPenalty
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
    lexiconSource: "unknown",
    lexiconEntryCount: 0,
    lexiconAssetVersion: null,
    fallbackLexicon: true,
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
    runtimeState.diagnostics.sentenceRankingReasons =
      processing.sentenceRankingReasons;
  }

  runtimeState.diagnostics.sentenceNotesVisible = countSentenceNotes();
  runtimeState.diagnostics.phraseDecisionSamples = collectPhraseDecisionSamples();
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
      lemmaId: token.getAttribute("data-ik-lemma-id"),
      unitKind: token.getAttribute("data-ik-unit-kind"),
      wordKind: token.getAttribute("data-ik-word-kind"),
      contextDecision: token.getAttribute("data-ik-context-decision"),
      contextRationale: token.getAttribute("data-ik-context-rationale"),
      dueStatus: token.getAttribute("data-ik-due-status"),
      schedulerReason: token.getAttribute("data-ik-scheduler-reason"),
      sentenceHash: token.getAttribute("data-ik-sentence-hash")
    }));
}

function collectPhraseDecisionSamples(): PageDiagnosticsPhraseSample[] {
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

  return [...selected, ...rejected].slice(0, PHRASE_DIAGNOSTICS_SAMPLE_LIMIT);
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
