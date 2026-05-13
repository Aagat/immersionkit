import { isInImmersionNode, nodeToProcessRoot, visitEligibleTextNodes } from "./dom";
import { segmentSentences } from "./sentences";
import {
  loadCachedSentenceAnalysisContext,
  mergeRuntimeAnalysisContext,
  type CachedGrammarFeature,
  type CachedPhraseMatch,
  type CachedWordRenderDecision,
  type RuntimeAnalysisContext
} from "./storage";

export type ContentMutationState = {
  isActive: boolean;
  mutation: {
    pendingRoots: Set<ParentNode>;
    flushHandle: number | null;
    observer: MutationObserver | null;
  };
  analysisCache: {
    analysisContext: RuntimeAnalysisContext;
    cachedWordRenderDecisions: Map<string, CachedWordRenderDecision[]>;
    cachedPhraseMatchesBySentenceHash: Map<string, CachedPhraseMatch[]>;
    cachedGrammarFeaturesBySentenceHash: Map<string, CachedGrammarFeature[]>;
  };
  diagnostics: {
    mutationCacheRefreshes: number;
    mutationCacheRefreshHits: number;
  };
};

export function setupMutationObserver<TState extends ContentMutationState>(
  state: TState,
  processRoots: (state: TState, roots: ParentNode[]) => void
): void {
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

        enqueueRootForProcessing(state, target.parentElement, processRoots);
        continue;
      }

      for (const addedNode of mutation.addedNodes) {
        if (isInImmersionNode(addedNode)) {
          continue;
        }

        enqueueRootForProcessing(
          state,
          nodeToProcessRoot(addedNode),
          processRoots
        );
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    characterData: true,
    subtree: true
  });

  state.mutation.observer = observer;
}

export function collectRootsSentenceHashes(
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

function enqueueRootForProcessing<TState extends ContentMutationState>(
  state: TState,
  root: ParentNode | null,
  processRoots: (state: TState, roots: ParentNode[]) => void
): void {
  if (!root || !document.body?.contains(root as Node)) {
    return;
  }

  if (root === document.body || state.mutation.pendingRoots.size > 40) {
    state.mutation.pendingRoots.clear();
    state.mutation.pendingRoots.add(document.body);
  } else {
    state.mutation.pendingRoots.add(root);
  }

  scheduleRootFlush(state, processRoots);
}

function scheduleRootFlush<TState extends ContentMutationState>(
  state: TState,
  processRoots: (state: TState, roots: ParentNode[]) => void
): void {
  if (state.mutation.flushHandle !== null) {
    return;
  }

  state.mutation.flushHandle = window.setTimeout(() => {
    state.mutation.flushHandle = null;

    const roots =
      state.mutation.pendingRoots.size > 0
        ? Array.from(state.mutation.pendingRoots)
        : [document.body as ParentNode];

    state.mutation.pendingRoots.clear();
    void processMutationRoots(state, roots, processRoots);
  }, 140);
}

async function processMutationRoots<TState extends ContentMutationState>(
  state: TState,
  roots: ParentNode[],
  processRoots: (state: TState, roots: ParentNode[]) => void
): Promise<void> {
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
  state: ContentMutationState,
  roots: readonly ParentNode[]
): Promise<void> {
  const sentenceHashes = collectRootsSentenceHashes(roots).filter(
    (hash) =>
      !state.analysisCache.analysisContext.bySentenceHash.has(hash) &&
      !state.analysisCache.cachedWordRenderDecisions.has(hash) &&
      !state.analysisCache.cachedPhraseMatchesBySentenceHash.has(hash) &&
      !state.analysisCache.cachedGrammarFeaturesBySentenceHash.has(hash)
  );

  if (sentenceHashes.length === 0) {
    return;
  }

  state.diagnostics.mutationCacheRefreshes += 1;

  try {
    const context = await loadCachedSentenceAnalysisContext(sentenceHashes.slice(0, 100));
    state.diagnostics.mutationCacheRefreshHits += context.entryCount;
    mergeRuntimeAnalysisContext(state.analysisCache.analysisContext, context.analysisContext);
    mergeCachedAnalysisMap(
      state.analysisCache.cachedWordRenderDecisions,
      context.cachedWordRenderDecisions
    );
    mergeCachedAnalysisMap(
      state.analysisCache.cachedPhraseMatchesBySentenceHash,
      context.cachedPhraseMatchesBySentenceHash
    );
    mergeCachedAnalysisMap(
      state.analysisCache.cachedGrammarFeaturesBySentenceHash,
      context.cachedGrammarFeaturesBySentenceHash
    );
  } catch (error) {
    console.warn("ImmersionKit failed to refresh scoped sentence analysis cache.", {
      error,
      requestedSentenceHashes: sentenceHashes.length
    });
  }
}

function mergeCachedAnalysisMap<T>(
  target: Map<string, T[]>,
  source: Map<string, T[]>
): void {
  for (const [sentenceHash, values] of source) {
    if (values.length === 0) {
      continue;
    }

    target.set(sentenceHash, values);
  }
}
