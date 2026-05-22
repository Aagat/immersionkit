import { createDiagnosticsSnapshot, readPageDiagnostics, updateDiagnostics } from "./diagnostics";
import { closePopover } from "./popover";
import { clearSentenceTranslations } from "./sentence-renderer";
import { loadProcessingContext } from "./storage";
import { buildWordRenderIndexes } from "./word-render-index";
import { restoreAnnotatedNodes } from "./annotate";
import { diagnosticInfo } from "../shared/logger";
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
import type { ContentSupportContextSnapshot } from "../support/report";
import { readContentSupportContext } from "./support-context";
import { summarizeProcessingContext } from "./debug-trace-store";
import { RuntimeMessageType } from "@immersionkit/shared";
import { sendRuntimeMessage } from "../runtime-client";

const ASSET_PACK_LOADING_DELAY_MS = 300;
const ASSET_PACK_LOADING_INDICATOR_ID = "immersionkit-asset-pack-loading";

export function refreshProcessing(runtimeState: RuntimeState): Promise<void> {
  if (runtimeState.refreshPromise) {
    return runtimeState.refreshPromise;
  }

  runtimeState.refreshPromise = (async () => {
    applyUiTheme();
    const debugRunId = runtimeState.debugTrace?.beginRun({
      url: window.location.href,
      hostname: window.location.hostname,
      pathname: window.location.pathname,
      reason: "refresh-processing"
    });

    const initialSentenceHashes = document.body
      ? collectPageSentenceHashes(document.body)
      : [];
    let processingContext: Awaited<ReturnType<typeof loadProcessingContext>>;
    const dismissAssetPackLoadingIndicator = scheduleAssetPackLoadingIndicator();
    try {
      processingContext = await loadProcessingContext(
        window.location.hostname,
        initialSentenceHashes
      );
    } catch (error) {
      if (debugRunId) {
        runtimeState.debugTrace?.recordRunError(
          debugRunId,
          "content-context-load-failed",
          error
        );
      }
      stopProcessing(runtimeState);
      console.warn("ImmersionKit content context load failed; page processing is off.", {
        error,
        hostname: window.location.hostname
      });
      return;
    } finally {
      dismissAssetPackLoadingIndicator();
    }
    const sentenceTranslationEnabled = isSentenceTranslationEnabled(
      processingContext.settings.sentenceTranslationEnabled,
      processingContext.settings.provider
    );
    if (debugRunId) {
      runtimeState.debugTrace?.recordContext(
        debugRunId,
        summarizeProcessingContext(processingContext, sentenceTranslationEnabled)
      );
    }

    runtimeState.diagnostics = createDiagnosticsSnapshot({
      siteEnabled: processingContext.siteEnabled,
      sentenceTranslationEnabled,
      assetSource: processingContext.renderAssetInfo.source,
      renderUnitCount: processingContext.renderAssetInfo.entryCount,
      renderAssetVersion: processingContext.renderAssetInfo.assetVersion,
      fallbackAsset: processingContext.renderAssetInfo.isFallback
    });

    diagnosticInfo("ImmersionKit render units loaded for page.", {
      source: processingContext.renderAssetInfo.source,
      entryCount: processingContext.renderAssetInfo.entryCount,
      assetVersion: processingContext.renderAssetInfo.assetVersion,
      fallback: processingContext.renderAssetInfo.isFallback
    });
    if (processingContext.renderAssetInfo.isFallback) {
      runtimeState.debugTrace?.recordEvent({
        phase: "assets",
        level: "warn",
        title: "render asset fallback active",
        detail: "No cached asset packs are available for this page."
      });
      console.warn(
        "ImmersionKit has no cached asset packs available; inline pack-backed learning will stay off for this page."
      );
    }

    if (!processingContext.siteEnabled) {
      if (debugRunId) {
        runtimeState.debugTrace?.recordStopReason(debugRunId, "site-disabled");
      }
      stopProcessing(runtimeState);
      diagnosticInfo("ImmersionKit disabled for site.", {
        hostname: window.location.hostname
      });
      return;
    }

    queueActivationEvent("supported_page_seen", {
      surface: "content",
      assetSource: processingContext.renderAssetInfo.source,
      assetVersion: processingContext.renderAssetInfo.assetVersion ?? undefined
    });

    const wordRenderIndexes = buildWordRenderIndexes(processingContext.renderUnits, {
      bandPreference: getCurriculumBandPreference(processingContext.curriculumConfig)
    });
    if (
      wordRenderIndexes.wordRenderIndex.size === 0 &&
      processingContext.sentenceHintPhrases.length === 0
    ) {
      if (debugRunId) {
        runtimeState.debugTrace?.recordStopReason(debugRunId, "no-approved-render-units");
      }
      stopProcessing(runtimeState);
      diagnosticInfo("ImmersionKit has no approved render units to process.");
      return;
    }

    stopProcessing(runtimeState);
    const state = createProcessingState({
      processingContext,
      wordRenderIndex: wordRenderIndexes.wordRenderIndex,
      analyzerPatternWordRenderIndex:
        wordRenderIndexes.analyzerPatternWordRenderIndex,
      sentenceTranslationEnabled,
      debugTrace: runtimeState.debugTrace
    });

    runtimeState.processing = state;

    if (!document.body) {
      if (debugRunId) {
        runtimeState.debugTrace?.recordStopReason(debugRunId, "missing-document-body");
      }
      return;
    }

    if (debugRunId) {
      runtimeState.debugTrace?.markProcessing(debugRunId);
    }
    processRoots(state, [document.body]);
    if (
      state.diagnostics.injectedTokens > 0 ||
      state.diagnostics.injectedPhrases > 0
    ) {
      queueActivationEvent("reading_rendered", {
        surface: "content",
        count:
          state.diagnostics.injectedTokens + state.diagnostics.injectedPhrases,
        assetSource: processingContext.renderAssetInfo.source,
        assetVersion: processingContext.renderAssetInfo.assetVersion ?? undefined
      });
    }
    setupMutationObserver(state, processRoots);
    if (debugRunId) {
      runtimeState.debugTrace?.markActive(debugRunId);
    }
    updateRuntimeDiagnostics(runtimeState);
  })().finally(() => {
    runtimeState.refreshPromise = null;
  });

  return runtimeState.refreshPromise;
}

export function scheduleAssetPackLoadingIndicator(): () => void {
  let host: HTMLElement | null = null;
  const timeoutId = window.setTimeout(() => {
    if (!document.body) {
      return;
    }

    document.getElementById(ASSET_PACK_LOADING_INDICATOR_ID)?.remove();
    host = document.createElement("div");
    host.id = ASSET_PACK_LOADING_INDICATOR_ID;
    host.setAttribute("data-immersionkit-ignore", "true");
    host.setAttribute("data-ik-asset-pack-loading", "true");

    const shadowRoot = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      :host {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 2147483647;
        pointer-events: none;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .indicator {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        max-width: min(280px, calc(100vw - 32px));
        border: 1px solid rgba(23, 63, 54, 0.16);
        border-radius: 8px;
        padding: 8px 10px;
        background: rgba(255, 255, 255, 0.96);
        color: #173f36;
        box-shadow: 0 10px 30px rgba(23, 63, 54, 0.14);
        font-size: 12px;
        line-height: 1.2;
      }

      .spinner {
        width: 14px;
        height: 14px;
        border: 2px solid rgba(23, 63, 54, 0.22);
        border-top-color: #173f36;
        border-radius: 999px;
        animation: ik-spin 0.8s linear infinite;
        flex: 0 0 auto;
      }

      .label {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      @keyframes ik-spin {
        to {
          transform: rotate(360deg);
        }
      }
    `;

    const indicator = document.createElement("div");
    indicator.className = "indicator";
    indicator.setAttribute("role", "status");
    indicator.setAttribute("aria-live", "polite");

    const spinner = document.createElement("span");
    spinner.className = "spinner";
    spinner.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "label";
    label.textContent = "Getting ImmersionKit assets...";

    indicator.append(spinner, label);
    shadowRoot.append(style, indicator);
    document.body.append(host);
  }, ASSET_PACK_LOADING_DELAY_MS);

  return () => {
    window.clearTimeout(timeoutId);
    const indicator =
      host ?? document.getElementById(ASSET_PACK_LOADING_INDICATOR_ID);
    indicator?.remove();
    host = null;
  };
}

function queueActivationEvent(
  eventName: "supported_page_seen" | "reading_rendered",
  properties: {
    surface: "content";
    count?: number;
    assetSource: "remote-pack" | "cached-pack" | "empty";
    assetVersion?: string;
  }
): void {
  void sendRuntimeMessage({
    type: RuntimeMessageType.QueueActivationEvent,
    eventName,
    properties
  });
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

export function readRuntimeSupportContext(
  runtimeState: RuntimeState,
  includeExcerpts: boolean
): ContentSupportContextSnapshot {
  return readContentSupportContext(
    {
      diagnostics: runtimeState.diagnostics,
      processing: runtimeState.processing?.diagnostics ?? null
    },
    includeExcerpts
  );
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
