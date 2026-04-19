import { RuntimeMessageType, hashString } from "@immersionkit/shared";
import type {
  SeedLexiconEntry,
  SentenceTranslationResult,
  UserVocabEntry,
  VocabStatus
} from "@immersionkit/shared";
import type { PageDiagnosticsSnapshot } from "../diagnostics/page-diagnostics";
import {
  isPageDiagnosticsMessage
} from "../diagnostics/page-diagnostics";

import {
  applyTokenStatusUpdate,
  processTextNode,
  readTokenMetadata,
  restoreAnnotatedNodes
} from "./annotate";
import {
  IMMERSIONKIT_RESTORE_EVENT,
  IMMERSIONKIT_TOKEN_ACTIVATED_EVENT,
  IMMERSIONKIT_TOKEN_STATUS_EVENT
} from "./contracts";
import type { TokenActivatedDetail, TokenStatusUpdatedDetail } from "./contracts";
import {
  IMMERSIONKIT_ROOT_ATTRIBUTE,
  IMMERSIONKIT_TOKEN_ATTRIBUTE,
  IMMERSIONKIT_WORD_SELECTOR
} from "./constants";
import {
  collectEligibleTextNodes,
  isInImmersionNode,
  nodeToProcessRoot,
  shouldSkipDocument
} from "./dom";
import { buildLexiconLookup } from "./lexicon";
import {
  clearSentenceTranslations,
  parseSentenceTranslationResults,
  readSentenceNoteMetadata,
  renderSentenceTranslations,
  toggleSentenceSourceReveal
} from "./sentence-renderer";
import type { SentenceNoteMetadata } from "./sentence-renderer";
import { loadProcessingContext, persistVocabStatus } from "./storage";
import "./styles.css";

type ProcessingState = {
  discoveryRate: number;
  samplingSeed: string;
  lexiconLookup: Map<string, SeedLexiconEntry>;
  vocabByLemmaId: Map<string, UserVocabEntry>;
  seenSentenceHashes: Set<string>;
  processedTextNodes: number;
  injectedTokens: number;
  sentenceCandidatesQueued: number;
  sentenceNotesRendered: number;
  pendingRoots: Set<ParentNode>;
  flushHandle: number | null;
  observer: MutationObserver | null;
  nodeSequence: number;
  sentenceTranslationEnabled: boolean;
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

      const activated = emitTokenActivatedEvent(event.target, "click");
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

      if (!emitTokenActivatedEvent(event.target, "keyboard")) {
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

    const processingContext = await loadProcessingContext(window.location.hostname);
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
      sentenceCandidatesSeen: 0,
      sentenceCandidatesQueued: 0,
      sentenceNotesRendered: 0,
      sentenceNotesVisible: countSentenceNotes(),
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
      seenSentenceHashes: new Set<string>(),
      processedTextNodes: 0,
      injectedTokens: 0,
      sentenceCandidatesQueued: 0,
      sentenceNotesRendered: 0,
      pendingRoots: new Set<ParentNode>(),
      flushHandle: null,
      observer: null,
      nodeSequence: 0,
      sentenceTranslationEnabled
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
    processRoots(state, roots);
  }, 140);
}

function processRoots(state: ProcessingState, roots: ParentNode[]) {
  if (!document.body) {
    return;
  }

  const queuedSentences: string[] = [];
  let processedNodes = 0;
  let injectedTokens = 0;

  for (const root of roots) {
    const nodes = collectEligibleTextNodes(root);

    for (const node of nodes) {
      const result = processTextNode(node, {
        discoveryRate: state.discoveryRate,
        samplingSeed: state.samplingSeed,
        createNodeId: () => createNodeId(state),
        lexiconLookup: state.lexiconLookup,
        vocabByLemmaId: state.vocabByLemmaId,
        isKnownWordForScoring: (word) => isKnownWord(state, word)
      });

      if (!result.replaced) {
        continue;
      }

      processedNodes += 1;
      injectedTokens += result.injectedCount;

      if (!state.sentenceTranslationEnabled) {
        continue;
      }

      for (const candidate of result.sentenceCandidates) {
        if (state.seenSentenceHashes.has(candidate.sentenceHash)) {
          continue;
        }

        state.seenSentenceHashes.add(candidate.sentenceHash);
        queuedSentences.push(candidate.sentence);

        if (queuedSentences.length >= 12) {
          break;
        }
      }
    }
  }

  state.processedTextNodes += processedNodes;
  state.injectedTokens += injectedTokens;
  queueSentenceCandidates(state, queuedSentences);
}

function queueSentenceCandidates(state: ProcessingState, sentences: string[]) {
  if (!state.sentenceTranslationEnabled) {
    return;
  }

  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    return;
  }

  const uniqueSentences = [...new Set(sentences)].filter(Boolean).slice(0, 12);
  if (uniqueSentences.length === 0) {
    return;
  }

  state.sentenceCandidatesQueued += uniqueSentences.length;

  chrome.runtime.sendMessage(
    {
      type: RuntimeMessageType.QueueSentenceCandidates,
      sentences: uniqueSentences
    },
    (response: unknown) => {
      if (chrome.runtime.lastError) {
        return;
      }

      const cachedResults = readCachedResultsFromQueueResponse(response);
      if (cachedResults.length > 0) {
        state.sentenceNotesRendered += renderSentenceTranslations(cachedResults);
      }
    }
  );
}

function emitTokenActivatedEvent(
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
  if (!metadata) {
    return false;
  }

  const detail: TokenActivatedDetail = {
    ...metadata,
    sourceEvent
  };

  window.dispatchEvent(
    new CustomEvent<TokenActivatedDetail>(IMMERSIONKIT_TOKEN_ACTIVATED_EVENT, {
      detail
    })
  );

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

  if (detail.sentence) {
    const sentence = document.createElement("p");
    sentence.className = "ik-popover__sentence";
    sentence.textContent = detail.sentence;
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

  const grammar = document.createElement("p");
  grammar.className = "ik-popover__sentence";
  grammar.textContent = detail.grammarNote;
  popover.append(grammar);

  const actions = document.createElement("div");
  actions.className = "ik-popover__actions";
  actions.append(createSentencePopoverActionButton("toggle-source"));
  actions.append(createSentencePopoverActionButton("close"));
  popover.append(actions);

  syncSentencePopoverActions(popover, noteElement);

  return popover;
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
    sentenceCandidatesSeen: 0,
    sentenceCandidatesQueued: 0,
    sentenceNotesRendered: 0,
    sentenceNotesVisible: countSentenceNotes(),
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
    runtimeState.diagnostics.sentenceCandidatesSeen = processing.seenSentenceHashes.size;
    runtimeState.diagnostics.sentenceCandidatesQueued =
      processing.sentenceCandidatesQueued;
    runtimeState.diagnostics.sentenceNotesRendered = processing.sentenceNotesRendered;
  }

  runtimeState.diagnostics.sentenceNotesVisible = countSentenceNotes();
  runtimeState.diagnostics.updatedAt = new Date().toISOString();
}

function countSentenceNotes(): number {
  return document.querySelectorAll(SENTENCE_NOTE_SELECTOR).length;
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
