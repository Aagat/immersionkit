export const ACTION_NATIVE_POPUP_PATH = "popup.html";
export const ACTION_OVERLAY_POPUP_PATH = "";

export function canUseActionOverlayForTab(
  tab: Pick<chrome.tabs.Tab, "url">
): boolean {
  return typeof tab.url === "string" && /^https?:\/\//i.test(tab.url);
}

export function resolveActionPopupPathForTab(
  tab: Pick<chrome.tabs.Tab, "url">
): string {
  return canUseActionOverlayForTab(tab)
    ? ACTION_OVERLAY_POPUP_PATH
    : ACTION_NATIVE_POPUP_PATH;
}
