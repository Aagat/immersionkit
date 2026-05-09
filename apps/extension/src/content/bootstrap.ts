import { RuntimeMessageType } from "@immersionkit/shared";
import { sendRuntimeMessage } from "../runtime-client";
import { isPageDiagnosticsMessage } from "../diagnostics/page-diagnostics";
import { DIAGNOSTICS_ENABLED } from "../build-profile";
import { diagnosticInfo } from "../shared/logger";
import { IMMERSIONKIT_ROOT_ATTRIBUTE } from "./constants";
import {
  readRuntimePageDiagnostics,
  refreshProcessing,
  updateRuntimeDiagnostics
} from "./controller";
import { shouldSkipDocument } from "./dom";
import { setupInteractionHooks } from "./interactions";
import { applyUiTheme } from "./theme";
import {
  parseSentenceTranslationResults,
  renderSentenceTranslations
} from "./sentence-renderer";
import { createRuntimeState, type RuntimeState } from "./state";

export async function bootContentRuntime() {
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
  setupInteractionHooks(runtimeState);
  setupRuntimeMessageHook(runtimeState);
  await refreshProcessing(runtimeState);
}

function setupRuntimeMessageHook(runtimeState: RuntimeState) {
  if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) {
    return;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
