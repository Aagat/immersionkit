export const POPUP_OVERLAY_TOGGLE_MESSAGE_TYPE =
  "immersionkit/popup-overlay/toggle" as const;
export const POPUP_OVERLAY_RESIZE_MESSAGE_TYPE =
  "immersionkit/popup-overlay/resize" as const;

export type PopupOverlayToggleMessage = {
  type: typeof POPUP_OVERLAY_TOGGLE_MESSAGE_TYPE;
  zoomFactor?: number;
};

export type PopupOverlayResizeMessage = {
  type: typeof POPUP_OVERLAY_RESIZE_MESSAGE_TYPE;
  height: number;
};

export type PopupOverlayToggleResponse =
  | {
      ok: true;
      visible: boolean;
    }
  | {
      ok: false;
      reason: string;
    };

export function isPopupOverlayToggleMessage(
  message: unknown
): message is PopupOverlayToggleMessage {
  return (
    Boolean(message) &&
    typeof message === "object" &&
    !Array.isArray(message) &&
    (message as { type?: unknown }).type === POPUP_OVERLAY_TOGGLE_MESSAGE_TYPE &&
    isOptionalZoomFactor((message as { zoomFactor?: unknown }).zoomFactor)
  );
}

export function isPopupOverlayResizeMessage(
  message: unknown
): message is PopupOverlayResizeMessage {
  return (
    Boolean(message) &&
    typeof message === "object" &&
    !Array.isArray(message) &&
    (message as { type?: unknown }).type === POPUP_OVERLAY_RESIZE_MESSAGE_TYPE &&
    typeof (message as { height?: unknown }).height === "number"
  );
}

function isOptionalZoomFactor(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}
