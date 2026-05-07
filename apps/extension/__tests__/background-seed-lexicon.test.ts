import { describe, expect, it } from "vitest";

import { ensureSeedLexiconReady } from "../src/background/seed-lexicon";
import { installChromeStub } from "./helpers/chrome-stub";

describe("background seed lexicon compatibility wrapper", () => {
  it("delegates readiness to asset packs without writing generated asset copies", async () => {
    const chromeStub = installChromeStub();

    try {
      const result = await ensureSeedLexiconReady();
      const storageSnapshot = chromeStub.getStorageSnapshot();

      expect(["empty", "remote-pack", "cached-pack"]).toContain(result.source);
      expect(result.renderUnitCount).toBeGreaterThanOrEqual(0);
      expect(storageSnapshot["asset-seed-lexicon"]).toBeUndefined();
      expect(storageSnapshot["asset-render-units"]).toBeUndefined();
      expect(storageSnapshot["asset-lexemes"]).toBeUndefined();
    } finally {
      chromeStub.restore();
    }
  });
});
