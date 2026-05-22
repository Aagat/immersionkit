import {
  isPopupOverlayResizeMessage,
  isPopupOverlayToggleMessage,
  type PopupOverlayToggleResponse
} from "../shared/popup-overlay";
import { getInversePageZoomFactor, normalizePageZoomFactor } from "./page-zoom";

const POPUP_OVERLAY_HOST_ID = "immersionkit-popup-overlay";
const POPUP_OVERLAY_IGNORE_ATTRIBUTE = "data-immersionkit-ignore";

let messageHookInstalled = false;
let removeOverlayListeners: (() => void) | null = null;

export function setupPopupOverlayMessageHook(): void {
  if (
    messageHookInstalled ||
    typeof chrome === "undefined" ||
    !chrome.runtime?.onMessage
  ) {
    return;
  }

  messageHookInstalled = true;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isPopupOverlayToggleMessage(message)) {
      return false;
    }

    sendResponse(togglePopupOverlay(message.zoomFactor));
    return false;
  });
}

function togglePopupOverlay(zoomFactorInput: number | undefined): PopupOverlayToggleResponse {
  const existing = document.getElementById(POPUP_OVERLAY_HOST_ID);
  if (existing) {
    removePopupOverlay(existing);
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

  mount.append(createPopupOverlayHost(normalizePageZoomFactor(zoomFactorInput)));
  return {
    ok: true,
    visible: true
  };
}

function createPopupOverlayHost(zoomFactor: number): HTMLElement {
  const host = document.createElement("div");
  host.id = POPUP_OVERLAY_HOST_ID;
  host.setAttribute(POPUP_OVERLAY_IGNORE_ATTRIBUTE, "true");
  host.style.setProperty("--ik-page-zoom", `${zoomFactor}`);
  host.style.setProperty("--ik-inverse-page-zoom", `${getInversePageZoomFactor(zoomFactor)}`);
  if (isZoomCompensatedCompactViewport(zoomFactor)) {
    host.setAttribute("data-ik-compact-viewport", "true");
  }

  const shadowRoot = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    :host {
      --ik-page-zoom: 1;
      --ik-inverse-page-zoom: 1;
      all: initial;
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      pointer-events: none;
      color-scheme: light;
    }

    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 0;
      display: block;
      width: 100vw;
      height: 100vh;
      margin: 0;
      padding: 0;
      border: 0;
      background: transparent;
      cursor: default;
      pointer-events: auto;
    }

    .panel {
      position: fixed;
      top: calc(12px * var(--ik-inverse-page-zoom));
      right: calc(12px * var(--ik-inverse-page-zoom));
      z-index: 1;
      width: min(360px, calc(100vw - 24px));
      height: min(680px, calc(100vh - 24px));
      overflow: hidden;
      border-radius: 18px;
      background: transparent;
      box-shadow:
        0 28px 70px rgba(15, 23, 42, 0.24),
        0 10px 24px rgba(15, 23, 42, 0.14);
      pointer-events: auto;
      transform-origin: top right;
      transform: scale(var(--ik-inverse-page-zoom));
      animation: immersionkit-popup-enter 150ms ease-out;
    }

    iframe {
      display: block;
      width: 100%;
      height: 100%;
      border: 0;
      background: transparent;
    }

    @media (prefers-reduced-motion: reduce) {
      .panel {
        animation: none;
      }
    }

    :host([data-ik-compact-viewport="true"]) .panel {
      top: calc(8px * var(--ik-inverse-page-zoom));
      right: calc(8px * var(--ik-inverse-page-zoom));
      width: min(340px, calc(100vw - 16px));
      height: min(620px, calc(100vh - 16px));
    }

    @keyframes immersionkit-popup-enter {
      from {
        opacity: 0;
      }

      to {
        opacity: 1;
      }
    }
  `;

  const backdrop = document.createElement("button");
  backdrop.className = "backdrop";
  backdrop.type = "button";
  backdrop.setAttribute("aria-label", "Close ImmersionKit report");
  backdrop.addEventListener("click", () => removePopupOverlay(host));

  const panel = document.createElement("div");
  panel.className = "panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "ImmersionKit reading report");

  const iframe = document.createElement("iframe");
  iframe.title = "ImmersionKit reading report";
  iframe.src = chrome.runtime.getURL("popup.html?surface=overlay");
  iframe.allow = "";

  panel.append(iframe);
  shadowRoot.append(style, backdrop, panel);
  installOverlayListeners(host, panel, iframe, zoomFactor);
  return host;
}

function installOverlayListeners(
  host: HTMLElement,
  panel: HTMLElement,
  iframe: HTMLIFrameElement,
  zoomFactor: number
): void {
  removeOverlayListeners?.();

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      removePopupOverlay(host);
    }
  };

  const handleMessage = (event: MessageEvent) => {
    if (event.source !== iframe.contentWindow) {
      return;
    }

    if (!isPopupOverlayResizeMessage(event.data)) {
      return;
    }

    const maxHeight = Math.max(360, window.innerHeight * zoomFactor - 32);
    const nextHeight = Math.min(maxHeight, Math.max(360, event.data.height));
    panel.style.height = `${Math.ceil(nextHeight)}px`;
  };

  document.addEventListener("keydown", handleKeyDown, true);
  window.addEventListener("message", handleMessage);

  removeOverlayListeners = () => {
    document.removeEventListener("keydown", handleKeyDown, true);
    window.removeEventListener("message", handleMessage);
    removeOverlayListeners = null;
  };
}

function removePopupOverlay(host: Element): void {
  removeOverlayListeners?.();
  host.remove();
}

function isZoomCompensatedCompactViewport(zoomFactor: number): boolean {
  return window.innerHeight * zoomFactor <= 620 || window.innerWidth * zoomFactor <= 760;
}
