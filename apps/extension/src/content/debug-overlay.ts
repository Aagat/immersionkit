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
const DEBUG_OVERLAY_PANEL_MIN_WIDTH = 420;
const DEBUG_OVERLAY_PANEL_MIN_HEIGHT = 420;
const DEBUG_OVERLAY_VIEWPORT_HORIZONTAL_MARGIN = 32;
const DEBUG_OVERLAY_VIEWPORT_VERTICAL_MARGIN = 32;
const DEBUG_OVERLAY_COLLAPSED_SIZE = 56;

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
      width: calc(100vw - ${DEBUG_OVERLAY_VIEWPORT_HORIZONTAL_MARGIN}px);
      height: calc(100vh - ${DEBUG_OVERLAY_VIEWPORT_VERTICAL_MARGIN}px);
      min-width: ${DEBUG_OVERLAY_PANEL_MIN_WIDTH}px;
      max-width: calc(100vw - ${DEBUG_OVERLAY_VIEWPORT_HORIZONTAL_MARGIN}px);
      min-height: ${DEBUG_OVERLAY_PANEL_MIN_HEIGHT}px;
      max-height: calc(100vh - ${DEBUG_OVERLAY_VIEWPORT_VERTICAL_MARGIN}px);
      overflow: hidden;
      resize: none;
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
      width: ${DEBUG_OVERLAY_COLLAPSED_SIZE}px !important;
      min-width: ${DEBUG_OVERLAY_COLLAPSED_SIZE}px;
      height: ${DEBUG_OVERLAY_COLLAPSED_SIZE}px !important;
      min-height: ${DEBUG_OVERLAY_COLLAPSED_SIZE}px;
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

    .resize-handle {
      position: absolute;
      left: 0;
      bottom: 0;
      z-index: 2;
      width: 24px;
      height: 24px;
      cursor: nesw-resize;
      pointer-events: auto;
      touch-action: none;
    }

    .resize-handle::before {
      content: "";
      position: absolute;
      left: 6px;
      bottom: 6px;
      width: 12px;
      height: 12px;
      border-left: 1px solid rgba(215, 226, 220, 0.58);
      border-bottom: 1px solid rgba(215, 226, 220, 0.58);
      border-bottom-left-radius: 4px;
      background: repeating-linear-gradient(
        135deg,
        transparent 0,
        transparent 3px,
        rgba(215, 226, 220, 0.48) 3px,
        rgba(215, 226, 220, 0.48) 4px
      );
      opacity: 0.82;
    }

    .panel[data-collapsed='true'] .resize-handle {
      display: none;
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

  const resizeHandle = document.createElement("div");
  resizeHandle.className = "resize-handle";
  resizeHandle.setAttribute("role", "separator");
  resizeHandle.setAttribute("aria-label", "Resize debug inspector");
  resizeHandle.title = "Resize debug inspector";

  panel.append(iframe, resizeHandle);
  shadowRoot.append(style, panel);
  installOverlayListeners(runtimeState, host, panel, iframe, resizeHandle, controller);
  return host;
}

function installOverlayListeners(
  runtimeState: RuntimeState,
  host: HTMLElement,
  panel: HTMLElement,
  iframe: HTMLIFrameElement,
  resizeHandle: HTMLElement,
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
    if (event.source !== iframe.contentWindow || event.origin !== targetOrigin) {
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

  let removeResizeListeners: (() => void) | null = null;
  const stopResizeTracking = () => {
    removeResizeListeners?.();
    removeResizeListeners = null;
  };
  const handleResizePointerDown = (event: PointerEvent) => {
    if (panel.getAttribute("data-collapsed") === "true") {
      return;
    }

    event.preventDefault();
    stopResizeTracking();
    const startX = event.clientX;
    const startY = event.clientY;
    const startRect = panel.getBoundingClientRect();
    const previousIframePointerEvents = iframe.style.pointerEvents;
    iframe.style.pointerEvents = "none";

    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      const maxWidth = Math.max(
        DEBUG_OVERLAY_PANEL_MIN_WIDTH,
        window.innerWidth - DEBUG_OVERLAY_VIEWPORT_HORIZONTAL_MARGIN
      );
      const maxHeight = Math.max(
        DEBUG_OVERLAY_PANEL_MIN_HEIGHT,
        window.innerHeight - DEBUG_OVERLAY_VIEWPORT_VERTICAL_MARGIN
      );
      const nextWidth = Math.min(
        maxWidth,
        Math.max(
          DEBUG_OVERLAY_PANEL_MIN_WIDTH,
          startRect.width + startX - moveEvent.clientX
        )
      );
      const nextHeight = Math.min(
        maxHeight,
        Math.max(
          DEBUG_OVERLAY_PANEL_MIN_HEIGHT,
          startRect.height + moveEvent.clientY - startY
        )
      );

      panel.style.width = `${Math.ceil(nextWidth)}px`;
      panel.style.height = `${Math.ceil(nextHeight)}px`;
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      upEvent.preventDefault();
      if (resizeHandle.hasPointerCapture?.(upEvent.pointerId)) {
        resizeHandle.releasePointerCapture(upEvent.pointerId);
      }
      stopResizeTracking();
    };

    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerup", handlePointerUp, true);
    removeResizeListeners = () => {
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerup", handlePointerUp, true);
      iframe.style.pointerEvents = previousIframePointerEvents;
    };
    resizeHandle.setPointerCapture?.(event.pointerId);
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
  resizeHandle.addEventListener("pointerdown", handleResizePointerDown);

  removeOverlayListeners = () => {
    unsubscribe();
    stopResizeTracking();
    window.removeEventListener("message", handleMessage);
    document.removeEventListener("keydown", handleKeyDown, true);
    resizeHandle.removeEventListener("pointerdown", handleResizePointerDown);
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
