import { RuntimeMessageType, hashString } from "@immersionkit/shared";
import type {
  SeedLexiconEntry,
  SentenceTranslationResult,
  UserVocabEntry,
  VocabStatus
} from "@immersionkit/shared";

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
  parseSentenceTranslationResults,
  renderSentenceTranslations,
  toggleSentenceSourceReveal
} from "./sentence-renderer";
import { loadProcessingContext, persistVocabStatus } from "./storage";
import "./styles.css";

type ProcessingState = {
  discoveryRate: number;
  samplingSeed: string;
  lexiconLookup: Map<string, SeedLexiconEntry>;
  vocabByLemmaId: Map<string, UserVocabEntry>;
  seenSentenceHashes: Set<string>;
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
};

type InteractiveVocabStatus = Exclude<VocabStatus, "new">;

const POPOVER_ATTRIBUTE = "data-ik-popover";
const POPOVER_ACTION_ATTRIBUTE = "data-ik-status-action";
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
  pingBackground();

  const runtimeState: RuntimeState = {
    processing: null,
    refreshPromise: null,
    activeToken: null,
    popover: null,
    popoverCleanup: null
  };

  setupInteractionHooks(runtimeState);
  setupRefreshHook(runtimeState);
  await refreshProcessing(runtimeState);
}

function setupInteractionHooks(runtimeState: RuntimeState) {
  document.addEventListener(
    "click",
    (event) => {
      if (toggleSentenceSourceReveal(event.target)) {
        event.preventDefault();
        return;
      }

      if (isWithinPopover(event.target)) {
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

      if (toggleSentenceSourceReveal(event.target)) {
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
    restoreAnnotatedNodes(document);
  });
}

function setupRefreshHook(runtimeState: RuntimeState) {
  if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) {
    return;
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (isSentenceTranslationResultMessage(message)) {
      const results = parseSentenceTranslationResults(message.results);
      if (results.length > 0) {
        renderSentenceTranslations(results);
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
    const processingContext = await loadProcessingContext(window.location.hostname);
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
      pendingRoots: new Set<ParentNode>(),
      flushHandle: null,
      observer: null,
      nodeSequence: 0,
      sentenceTranslationEnabled: isSentenceTranslationEnabled(
        processingContext.settings.sentenceTranslationEnabled,
        processingContext.settings.provider
      )
    };

    runtimeState.processing = state;

    if (!document.body) {
      return;
    }

    processRoots(state, [document.body]);
    setupMutationObserver(state);
  })().finally(() => {
    runtimeState.refreshPromise = null;
  });

  return runtimeState.refreshPromise;
}

function stopProcessing(runtimeState: RuntimeState) {
  const state = runtimeState.processing;
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
        renderSentenceTranslations(cachedResults);
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
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-live", "polite");

  const pair = document.createElement("div");
  pair.className = "ik-popover__pair";
  pair.append(createTokenPill("ik-popover__source", detail.sourceToken));
  pair.append(createArrow());
  pair.append(createTokenPill("ik-popover__target", detail.targetToken));
  popover.append(pair);

  const lemma = document.createElement("p");
  lemma.className = "ik-popover__meta";
  lemma.textContent = `Lemma: ${detail.sourceLemma}`;
  popover.append(lemma);

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
