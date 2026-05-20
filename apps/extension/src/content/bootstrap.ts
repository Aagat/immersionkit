import { RuntimeMessageType } from "@immersionkit/shared";
import { sendRuntimeMessage } from "../runtime-client";
import { isPageDiagnosticsMessage } from "../diagnostics/page-diagnostics";
import { DIAGNOSTICS_ENABLED } from "../build-profile";
import { diagnosticInfo } from "../shared/logger";
import { isSupportContextMessage } from "../support/report";
import { IMMERSIONKIT_ROOT_ATTRIBUTE } from "./constants";
import {
  readRuntimePageDiagnostics,
  readRuntimeSupportContext,
  refreshProcessing,
  updateRuntimeDiagnostics
} from "./controller";
import { setupDebugOverlayMessageHook } from "./debug-overlay";
import { createDebugTraceStore } from "./debug-trace-store";
import { shouldSkipDocument } from "./dom";
import { setupInteractionHooks } from "./interactions";
import { applyUiTheme } from "./theme";
import {
  parseSentenceTranslationResults,
  renderSentenceTranslations
} from "./sentence-renderer";
import { setupPopupOverlayMessageHook } from "./popup-overlay";
import { createRuntimeState, type RuntimeState } from "./state";

export async function bootContentRuntime() {
  setupPopupOverlayMessageHook();

  if (document.documentElement.hasAttribute(IMMERSIONKIT_ROOT_ATTRIBUTE)) {
    return;
  }

  const pageDecision = shouldSkipDocument(new URL(window.location.href), document);
  if (pageDecision.shouldSkip) {
    diagnosticInfo("ImmersionKit skipped page.", {
      reason: pageDecision.reason,
      url: window.location.href
    });
    return;
  }

  document.documentElement.setAttribute(IMMERSIONKIT_ROOT_ATTRIBUTE, "true");
  applyUiTheme();
  pingBackground();

  const runtimeState = createRuntimeState();
  if (DIAGNOSTICS_ENABLED) {
    runtimeState.debugTrace = createDebugTraceStore();
    setupDebugOverlayMessageHook(runtimeState);
  }
  setupInteractionHooks(runtimeState);
  setupRuntimeMessageHook(runtimeState);
  await refreshProcessing(runtimeState);
}

function setupRuntimeMessageHook(runtimeState: RuntimeState) {
  if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) {
    return;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (isSupportContextMessage(message)) {
      sendResponse(
        readRuntimeSupportContext(runtimeState, Boolean(message.includeExcerpts))
      );
      return false;
    }

    if (DIAGNOSTICS_ENABLED && isPageDiagnosticsMessage(message)) {
      sendResponse(readRuntimePageDiagnostics(runtimeState));
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
        runtimeState.debugTrace?.recordSentenceTranslationsRendered({
          results,
          renderedCount,
          availability: runtimeState.processing?.sentenceTranslationEnabled
            ? "ready"
            : undefined
        });
        updateRuntimeDiagnostics(runtimeState);
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

function pingBackground() {
  void sendRuntimeMessage({ type: RuntimeMessageType.Ping });
}

function isSentenceTranslationResultMessage(
  message: unknown
): message is {
  type: RuntimeMessageType.SentenceTranslationResult;
  results: unknown;
} {
  return (
    Boolean(message) &&
    typeof message === "object" &&
    !Array.isArray(message) &&
    (message as { type?: unknown }).type === RuntimeMessageType.SentenceTranslationResult
  );
}
