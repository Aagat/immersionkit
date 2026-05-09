import { createDiagnosticsSnapshot, readPageDiagnostics, updateDiagnostics } from "./diagnostics";
import { closePopover } from "./popover";
import { clearSentenceTranslations } from "./sentence-renderer";
import { loadProcessingContext } from "./storage";
import { buildWordRenderIndex } from "./word-render-index";
import { restoreAnnotatedNodes } from "./annotate";
import {
  createProcessingState,
  getCurriculumBandPreference,
  isSentenceTranslationEnabled,
  type RuntimeState
} from "./state";
import { collectRootsSentenceHashes, setupMutationObserver } from "./mutations";
import { processRoots } from "./processor";
import { applyUiTheme } from "./theme";
import type { PageDiagnosticsSnapshot } from "../diagnostics/page-diagnostics";

export function refreshProcessing(runtimeState: RuntimeState): Promise<void> {
  if (runtimeState.refreshPromise) {
    return runtimeState.refreshPromise;
  }

  runtimeState.refreshPromise = (async () => {
    applyUiTheme();

    const initialSentenceHashes = document.body
      ? collectPageSentenceHashes(document.body)
      : [];
    let processingContext: Awaited<ReturnType<typeof loadProcessingContext>>;
    try {
      processingContext = await loadProcessingContext(
        window.location.hostname,
        initialSentenceHashes
      );
    } catch (error) {
      stopProcessing(runtimeState);
      console.warn("ImmersionKit content context load failed; page processing is off.", {
        error,
        hostname: window.location.hostname
      });
      return;
    }
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
    const state = createProcessingState({
      processingContext,
      wordRenderIndex,
      sentenceTranslationEnabled
    });

    runtimeState.processing = state;

    if (!document.body) {
      return;
    }

    processRoots(state, [document.body]);
    setupMutationObserver(state, processRoots);
    updateRuntimeDiagnostics(runtimeState);
  })().finally(() => {
    runtimeState.refreshPromise = null;
  });

  return runtimeState.refreshPromise;
}

function stopProcessing(runtimeState: RuntimeState) {
  const state = runtimeState.processing;
  clearSentenceTranslations(document);
  updateRuntimeDiagnostics(runtimeState);

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
  updateRuntimeDiagnostics(runtimeState);
}

export function readRuntimePageDiagnostics(
  runtimeState: RuntimeState
): PageDiagnosticsSnapshot {
  return readPageDiagnostics({
    diagnostics: runtimeState.diagnostics,
    processing: runtimeState.processing?.diagnostics ?? null
  });
}

export function updateRuntimeDiagnostics(runtimeState: RuntimeState): void {
  updateDiagnostics({
    diagnostics: runtimeState.diagnostics,
    processing: runtimeState.processing?.diagnostics ?? null
  });
}

function collectPageSentenceHashes(root: ParentNode): string[] {
  return collectRootsSentenceHashes([root], 500);
}
