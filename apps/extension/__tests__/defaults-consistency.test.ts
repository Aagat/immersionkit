import { DEFAULT_EXTENSION_SETTINGS } from "@immersionkit/shared";
import { describe, expect, it } from "vitest";

import { DEFAULT_DISCOVERY_RATE, DEFAULT_SETTINGS } from "../src/content/constants";
import { loadProcessingContext } from "../src/content/storage";
import { loadSettingsState, normalizeDiscoveryRate } from "../src/options/state";
import { installChromeStub } from "./helpers/chrome-stub";

describe("default settings consistency", () => {
  it("keeps discovery-rate defaults aligned across shared, content, and options", async () => {
    const chromeStub = installChromeStub();

    try {
      expect(DEFAULT_DISCOVERY_RATE).toBe(DEFAULT_EXTENSION_SETTINGS.discoveryRate);
      expect(DEFAULT_SETTINGS.discoveryRate).toBe(
        DEFAULT_EXTENSION_SETTINGS.discoveryRate
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
    } finally {
      chromeStub.restore();
    }
  });
});
