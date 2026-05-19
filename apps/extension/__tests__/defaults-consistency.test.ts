import { DEFAULT_EXTENSION_SETTINGS } from "@immersionkit/shared";
import { describe, expect, it } from "vitest";

import { DEFAULT_DISCOVERY_RATE, DEFAULT_SETTINGS } from "../src/content/constants";
import { loadProcessingContext } from "../src/content/storage";
import { loadSettingsState, normalizeDiscoveryRate } from "../src/app-state/settings-state";
import { installChromeStub } from "./helpers/chrome-stub";

describe("default settings consistency", () => {
  it("keeps discovery-rate defaults aligned across shared, content, and options", async () => {
    const chromeStub = installChromeStub();

    try {
      expect(DEFAULT_DISCOVERY_RATE).toBe(DEFAULT_EXTENSION_SETTINGS.discoveryRate);
      expect(DEFAULT_SETTINGS.discoveryRate).toBe(
        DEFAULT_EXTENSION_SETTINGS.discoveryRate
      );
      expect(DEFAULT_SETTINGS.ttsVoiceId).toBe(
        DEFAULT_EXTENSION_SETTINGS.ttsVoiceId
      );
      expect(DEFAULT_SETTINGS.ttsFallbackBehavior).toBe(
        DEFAULT_EXTENSION_SETTINGS.ttsFallbackBehavior
      );
      expect(DEFAULT_SETTINGS.ttsPlaybackRates).toEqual(
        DEFAULT_EXTENSION_SETTINGS.ttsPlaybackRates
      );
      expect(normalizeDiscoveryRate(Number.NaN)).toBe(
        DEFAULT_EXTENSION_SETTINGS.discoveryRate
      );

      const processingContext = await loadProcessingContext("fixtures.immersionkit.test");
      expect(processingContext.discoveryRate).toBe(
        DEFAULT_EXTENSION_SETTINGS.discoveryRate
      );

      const settingsState = await loadSettingsState();
      expect(settingsState.settings.discoveryRate).toBe(
        DEFAULT_EXTENSION_SETTINGS.discoveryRate
      );
      expect(settingsState.settings.ttsVoiceId).toBe(
        "es_ES-sharvard-medium-m"
      );
      expect(settingsState.settings.ttsFallbackBehavior).toBe(
        "piper-with-system-fallback"
      );
      expect(settingsState.settings.ttsPlaybackRates).toEqual({
        word: 0.8,
        phrase: 1,
        sentence: 1
      });
    } finally {
      chromeStub.restore();
    }
  });
});
