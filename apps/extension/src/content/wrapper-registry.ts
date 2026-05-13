import {
  IMMERSIONKIT_NODE_ATTRIBUTE,
  IMMERSIONKIT_ORIGINAL_TEXT_ATTRIBUTE
} from "./constants";
import {
  readAnnotatedNodeOriginalText,
  restoreAnnotatedElement
} from "./annotate";
import { segmentSentences } from "./sentences";
import type { SentenceCandidateMetadata } from "./contracts";

const FRESH_PHRASE_RERENDER_LIMIT = 20;

export type RenderedWrapperMetadata = {
  nodeId: string;
  wrapper: HTMLElement;
  originalText: string;
  sentenceHashes: Set<string>;
};

export type ContentWrapperRegistryState = {
  nodeSequence: number;
  wrappersBySentenceHash: Map<string, Set<HTMLElement>>;
  wrapperMetadataByNodeId: Map<string, RenderedWrapperMetadata>;
};

type WrapperRerenderState = {
  isActive: boolean;
  mutation: {
    observer: MutationObserver | null;
  };
  renderRegistry: ContentWrapperRegistryState;
};

export function registerRenderedWrappersForRoot(
  registry: ContentWrapperRegistryState,
  root: ParentNode
): void {
  const wrappers = collectRenderedWrappers(root);
  for (const wrapper of wrappers) {
    const nodeId = wrapper.getAttribute(IMMERSIONKIT_NODE_ATTRIBUTE);
    const originalText = readAnnotatedNodeOriginalText(wrapper);
    if (!nodeId || originalText === null) {
      continue;
    }

    unregisterRenderedWrapper(registry, nodeId);
    const sentenceHashes = new Set(
      segmentSentences(originalText).map((sentence) => sentence.hash)
    );
    if (sentenceHashes.size === 0) {
      continue;
    }

    registry.wrapperMetadataByNodeId.set(nodeId, {
      nodeId,
      wrapper,
      originalText,
      sentenceHashes
    });
    for (const sentenceHash of sentenceHashes) {
      let wrappersForSentence = registry.wrappersBySentenceHash.get(sentenceHash);
      if (!wrappersForSentence) {
        wrappersForSentence = new Set();
        registry.wrappersBySentenceHash.set(sentenceHash, wrappersForSentence);
      }
      wrappersForSentence.add(wrapper);
    }
  }
}

function unregisterRenderedWrapper(
  registry: ContentWrapperRegistryState,
  nodeId: string
): void {
  const metadata = registry.wrapperMetadataByNodeId.get(nodeId);
  if (!metadata) {
    return;
  }

  registry.wrapperMetadataByNodeId.delete(nodeId);
  for (const sentenceHash of metadata.sentenceHashes) {
    const wrappers = registry.wrappersBySentenceHash.get(sentenceHash);
    if (!wrappers) {
      continue;
    }

    wrappers.delete(metadata.wrapper);
    if (wrappers.size === 0) {
      registry.wrappersBySentenceHash.delete(sentenceHash);
    }
  }
}

export function findRenderedWrapperForCandidates(
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

export function rerenderAnnotatedNodesForSentenceHashes<TState extends WrapperRerenderState>(
  state: TState,
  sentenceHashes: ReadonlySet<string>,
  processRoots: (state: TState, roots: ParentNode[]) => void
): number {
  if (!document.body || !state.isActive) {
    return 0;
  }

  const wrappers = collectIndexedWrappersForSentenceHashes(
    state.renderRegistry,
    sentenceHashes
  );
  const roots = new Set<ParentNode>();
  let rerendered = 0;
  const observer = state.mutation.observer;

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
      unregisterRenderedWrapper(state.renderRegistry, nodeId);
    }
    const restoredText = restoreAnnotatedElement(wrapper);
    if (!restoredText || !parent) {
      continue;
    }

    roots.add(parent);
    rerendered += 1;
  }

  if (roots.size > 0) {
    processRoots(state, [...roots]);
  }

  if (state.isActive && observer && document.body) {
    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true
    });
  }

  return rerendered;
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

function collectIndexedWrappersForSentenceHashes(
  registry: ContentWrapperRegistryState,
  sentenceHashes: ReadonlySet<string>
): HTMLElement[] {
  const wrappers = new Set<HTMLElement>();
  for (const sentenceHash of sentenceHashes) {
    const indexedWrappers = registry.wrappersBySentenceHash.get(sentenceHash);
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
        unregisterRenderedWrapper(registry, nodeId);
      }
    }
  }

  return [...wrappers];
}

function escapeSelectorValue(value: string): string {
  return globalThis.CSS?.escape
    ? globalThis.CSS.escape(value)
    : value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}
