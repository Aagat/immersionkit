export const POPUP_OVERLAY_TOGGLE_MESSAGE_TYPE =
  "immersionkit/popup-overlay/toggle" as const;

export type PopupOverlayToggleMessage = {
  type: typeof POPUP_OVERLAY_TOGGLE_MESSAGE_TYPE;
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
    (message as { type?: unknown }).type === POPUP_OVERLAY_TOGGLE_MESSAGE_TYPE
  );
}
