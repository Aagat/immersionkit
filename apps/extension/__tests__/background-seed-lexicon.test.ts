import { describe, expect, it } from "vitest";

import { ensureSeedLexiconReady } from "../src/background/seed-lexicon";
import { installChromeStub } from "./helpers/chrome-stub";

describe("background seed lexicon compatibility wrapper", () => {
  it("delegates readiness to asset packs without writing generated assets to chrome storage", async () => {
    const chromeStub = installChromeStub();

    try {
      const result = await ensureSeedLexiconReady();
      const storageSnapshot = chromeStub.getStorageSnapshot();

      expect(["empty", "remote-pack", "cached-pack"]).toContain(result.source);
      expect(result.entryCount).toBeGreaterThanOrEqual(0);
      expect(storageSnapshot["immersionkit.seedLexicon"]).toBeUndefined();
      expect(storageSnapshot["immersionkit.renderUnits"]).toBeUndefined();
      expect(storageSnapshot["immersionkit.lexemes"]).toBeUndefined();
    } finally {
      chromeStub.restore();
    }
  });
});
