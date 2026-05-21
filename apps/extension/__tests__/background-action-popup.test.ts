import { describe, expect, it } from "vitest";

import {
  ACTION_NATIVE_POPUP_PATH,
  ACTION_OVERLAY_POPUP_PATH,
  canUseActionOverlayForTab,
  resolveActionPopupPathForTab
} from "../src/background/action-popup";

describe("extension action popup routing", () => {
  it("keeps the overlay click path for HTTP(S) tabs", () => {
    expect(canUseActionOverlayForTab({ url: "https://example.com/article" })).toBe(
      true
    );
    expect(resolveActionPopupPathForTab({ url: "http://example.com/post" })).toBe(
      ACTION_OVERLAY_POPUP_PATH
    );
  });

  it("uses the native popup for browser and extension pages", () => {
    expect(resolveActionPopupPathForTab({ url: "chrome://extensions" })).toBe(
      ACTION_NATIVE_POPUP_PATH
    );
    expect(
      resolveActionPopupPathForTab({
        url: "chrome-extension://abcdefghijklmnop/options.html"
      })
    ).toBe(ACTION_NATIVE_POPUP_PATH);
  });

  it("uses the native popup when a tab URL is unavailable", () => {
    expect(resolveActionPopupPathForTab({ url: undefined })).toBe(
      ACTION_NATIVE_POPUP_PATH
    );
  });
});
