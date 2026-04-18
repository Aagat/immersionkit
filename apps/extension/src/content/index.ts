import { RuntimeMessageType, hashString } from "@immersionkit/shared";
import type { SeedLexiconEntry, UserVocabEntry } from "@immersionkit/shared";

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
  IMMERSIONKIT_WORD_SELECTOR
} from "./constants";
import {
  collectEligibleTextNodes,
  isInImmersionNode,
  nodeToProcessRoot,
  shouldSkipDocument
} from "./dom";
import { buildLexiconLookup } from "./lexicon";
import { loadProcessingContext } from "./storage";
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
  pingBackground();

  const processingContext = await loadProcessingContext(window.location.hostname);
  if (!processingContext.siteEnabled) {
    console.info("ImmersionKit disabled for site.", {
      hostname: window.location.hostname
    });
    return;
  }

  const lexiconLookup = buildLexiconLookup(processingContext.lexicon);
  if (lexiconLookup.size === 0) {
    console.info("ImmersionKit has no safe lexicon entries to inject.");
    return;
  }

  const state: ProcessingState = {
    discoveryRate: processingContext.discoveryRate,
    samplingSeed: `${window.location.hostname}${window.location.pathname}`,
    lexiconLookup,
    vocabByLemmaId: processingContext.vocabByLemmaId,
    seenSentenceHashes: new Set<string>(),
    pendingRoots: new Set<ParentNode>(),
    flushHandle: null,
    observer: null,
    nodeSequence: 0
  };

  setupInteractionHooks();
  setupRefreshHook(state);
  processRoots(state, [document.body]);
  setupMutationObserver(state);
}

function setupInteractionHooks() {
  document.addEventListener(
    "click",
    (event) => {
      emitTokenActivatedEvent(event.target, "click");
    },
    true
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      if (!emitTokenActivatedEvent(event.target, "keyboard")) {
        return;
      }

      event.preventDefault();
    },
    true
  );

  window.addEventListener(IMMERSIONKIT_TOKEN_STATUS_EVENT, (event: Event) => {
    const detail = (event as CustomEvent<TokenStatusUpdatedDetail>).detail;
    if (!detail) {
      return;
    }

    applyTokenStatusUpdate(detail);
  });

  window.addEventListener(IMMERSIONKIT_RESTORE_EVENT, () => {
    restoreAnnotatedNodes(document);
  });
}

function setupRefreshHook(state: ProcessingState) {
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== RuntimeMessageType.RefreshActiveTab) {
      return false;
    }

    restoreAnnotatedNodes(document);
    processRoots(state, [document.body]);
    return false;
  });
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

  queueSentenceCandidates(queuedSentences);
}

function queueSentenceCandidates(sentences: string[]) {
  const uniqueSentences = [...new Set(sentences)].filter(Boolean).slice(0, 12);
  if (uniqueSentences.length === 0) {
    return;
  }

  chrome.runtime.sendMessage(
    {
      type: RuntimeMessageType.QueueSentenceCandidates,
      sentences: uniqueSentences
    },
    () => {
      void chrome.runtime.lastError;
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

  tokenElement.setAttribute("data-ik-active", "true");
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

function pingBackground() {
  chrome.runtime.sendMessage({ type: RuntimeMessageType.Ping }, () => {
    void chrome.runtime.lastError;
  });
}
