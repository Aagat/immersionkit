import { DIAGNOSTICS_ENABLED } from "../build-profile";
import {
  DEBUG_INSPECTOR_EVENT_MESSAGE_TYPE,
  isDebugInspectorCommandMessage,
  isDebugOverlayResizeMessage,
  isDebugOverlayToggleMessage,
  type DebugInspectorEvent,
  type DebugOverlayToggleResponse
} from "../shared/debug-overlay";
import { refreshProcessing } from "./controller";
import {
  createDebugInspectorController,
  type DebugInspectorController
} from "./debug-inspector-controller";
import type { RuntimeState } from "./state";

const DEBUG_OVERLAY_HOST_ID = "immersionkit-debug-overlay";
const DEBUG_OVERLAY_IGNORE_ATTRIBUTE = "data-immersionkit-ignore";

let messageHookInstalled = false;
let removeOverlayListeners: (() => void) | null = null;

export function setupDebugOverlayMessageHook(runtimeState: RuntimeState): void {
  if (
    messageHookInstalled ||
    !DIAGNOSTICS_ENABLED ||
    typeof chrome === "undefined" ||
    !chrome.runtime?.onMessage
  ) {
    return;
  }

  messageHookInstalled = true;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isDebugOverlayToggleMessage(message)) {
      return false;
    }

    sendResponse(toggleDebugOverlay(runtimeState));
    return false;
  });
}

function toggleDebugOverlay(runtimeState: RuntimeState): DebugOverlayToggleResponse {
  const existing = document.getElementById(DEBUG_OVERLAY_HOST_ID);
  if (existing) {
    removeDebugOverlay(runtimeState, existing);
    return {
      ok: true,
      visible: false
    };
  }

  const mount = document.body ?? document.documentElement;
  if (!mount) {
    return {
      ok: false,
      reason: "missing-document-root"
    };
  }

  const controller = ensureDebugInspector(runtimeState);
  mount.append(createDebugOverlayHost(runtimeState, controller));
  return {
    ok: true,
    visible: true
  };
}

function ensureDebugInspector(runtimeState: RuntimeState): DebugInspectorController {
  if (!runtimeState.debugInspector) {
    runtimeState.debugInspector = createDebugInspectorController(runtimeState);
  }
  return runtimeState.debugInspector;
}

function createDebugOverlayHost(
  runtimeState: RuntimeState,
  controller: DebugInspectorController
): HTMLElement {
  const host = document.createElement("div");
  host.id = DEBUG_OVERLAY_HOST_ID;
  host.setAttribute(DEBUG_OVERLAY_IGNORE_ATTRIBUTE, "true");

  const shadowRoot = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    :host {
      all: initial;
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      pointer-events: none;
      color-scheme: light dark;
    }

    .panel {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 1;
      width: min(980px, calc(100vw - 48px));
      height: min(860px, calc(100vh - 32px));
      min-width: 420px;
      max-width: calc(100vw - 48px);
      min-height: 420px;
      max-height: calc(100vh - 32px);
      overflow: hidden;
      resize: horizontal;
      border: 1px solid rgba(215, 226, 220, 0.22);
      border-radius: 18px;
      background: #101816;
      box-shadow:
        0 30px 90px rgba(2, 8, 7, 0.42),
        0 8px 24px rgba(2, 8, 7, 0.28);
      pointer-events: auto;
      transform-origin: top right;
      animation: immersionkit-debug-enter 150ms ease-out;
    }

    .panel[data-collapsed='true'] {
      top: auto;
      right: 16px;
      bottom: 16px;
      width: 56px;
      min-width: 56px;
      height: 56px;
      min-height: 56px;
      border-radius: 16px;
      resize: none;
    }

    iframe {
      display: block;
      width: 100%;
      height: 100%;
      border: 0;
      background: #101816;
    }

    @media (prefers-reduced-motion: reduce) {
      .panel {
        animation: none;
      }
    }

    @keyframes immersionkit-debug-enter {
      from {
        opacity: 0;
        transform: translateX(10px) scale(0.985);
      }

      to {
        opacity: 1;
        transform: translateX(0) scale(1);
      }
    }
  `;

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "ImmersionKit debug inspector");
  panel.setAttribute("data-collapsed", "false");

  const iframe = document.createElement("iframe");
  iframe.title = "ImmersionKit debug inspector";
  iframe.src = chrome.runtime.getURL("debug.html?surface=overlay");
  iframe.allow = "";

  panel.append(iframe);
  shadowRoot.append(style, panel);
  installOverlayListeners(runtimeState, host, panel, iframe, controller);
  return host;
}

function installOverlayListeners(
  runtimeState: RuntimeState,
  host: HTMLElement,
  panel: HTMLElement,
  iframe: HTMLIFrameElement,
  controller: DebugInspectorController
): void {
  removeOverlayListeners?.();

  const targetOrigin = new URL(chrome.runtime.getURL("debug.html")).origin;
  const sendEvent = (event: DebugInspectorEvent) => {
    iframe.contentWindow?.postMessage(
      {
        type: DEBUG_INSPECTOR_EVENT_MESSAGE_TYPE,
        event
      },
      targetOrigin
    );
  };
  const unsubscribe = controller.subscribe(sendEvent);

  const handleMessage = (event: MessageEvent) => {
    if (event.source !== iframe.contentWindow) {
      return;
    }

    if (isDebugOverlayResizeMessage(event.data)) {
      if (typeof event.data.width === "number") {
        panel.style.width = `${Math.max(64, Math.ceil(event.data.width))}px`;
      }
      if (typeof event.data.height === "number") {
        panel.style.height = `${Math.max(360, Math.ceil(event.data.height))}px`;
      }
      if (typeof event.data.collapsed === "boolean") {
        panel.setAttribute("data-collapsed", String(event.data.collapsed));
      }
      return;
    }

    if (!isDebugInspectorCommandMessage(event.data)) {
      return;
    }

    const command = event.data.command;
    switch (command.type) {
      case "set-inspect-mode":
        controller.setInspectMode(command.enabled);
        break;
      case "request-snapshot":
        sendEvent({ type: "snapshot", snapshot: controller.readSnapshot() });
        sendEvent({
          type: "inspect-mode",
          enabled: controller.isInspectModeEnabled()
        });
        break;
      case "select-token":
        if (!controller.selectTokenId(command.tokenId)) {
          sendEvent({
            type: "error",
            reason: "token-not-found",
            detail: command.tokenId
          });
        }
        break;
      case "select-sentence":
        if (!controller.selectSentenceHash(command.sentenceHash)) {
          sendEvent({
            type: "error",
            reason: "sentence-not-found",
            detail: command.sentenceHash
          });
        }
        break;
      case "clear-selection":
        controller.clearSelection();
        controller.emitSnapshot();
        break;
      case "refresh-page":
        void refreshProcessing(runtimeState).then(() => {
          controller.emitSnapshot();
        });
        break;
      case "export-trace":
        sendEvent({
          type: "export",
          fileName: createExportFileName(controller.readSnapshot().runId),
          payload: controller.exportTrace()
        });
        break;
      case "collapse":
        panel.setAttribute("data-collapsed", String(command.collapsed));
        break;
      case "close":
        removeDebugOverlay(runtimeState, host);
        break;
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !controller.isInspectModeEnabled()) {
      return;
    }
    controller.setInspectMode(false);
  };

  iframe.addEventListener("load", () => {
    sendEvent({ type: "snapshot", snapshot: controller.readSnapshot() });
    sendEvent({
      type: "inspect-mode",
      enabled: controller.isInspectModeEnabled()
    });
  });
  window.addEventListener("message", handleMessage);
  document.addEventListener("keydown", handleKeyDown, true);

  removeOverlayListeners = () => {
    unsubscribe();
    window.removeEventListener("message", handleMessage);
    document.removeEventListener("keydown", handleKeyDown, true);
    removeOverlayListeners = null;
  };
}

function removeDebugOverlay(runtimeState: RuntimeState, host: Element): void {
  removeOverlayListeners?.();
  runtimeState.debugInspector?.setInspectMode(false);
  host.remove();
}

function createExportFileName(runId: string): string {
  return `immersionkit-debug-${runId}.json`;
}
