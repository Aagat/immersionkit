import { describe, expect, it } from "vitest";

import { ensureRenderAssetsReady } from "../src/background/render-assets";
import { installChromeStub } from "./helpers/chrome-stub";

describe("background render asset readiness", () => {
  it("delegates readiness to asset packs without writing generated asset copies", async () => {
    const chromeStub = installChromeStub();

    try {
      const result = await ensureRenderAssetsReady();
      const storageSnapshot = chromeStub.getStorageSnapshot();

      expect(["empty", "remote-pack", "cached-pack"]).toContain(result.source);
      expect(result.renderUnitCount).toBeGreaterThanOrEqual(0);
      expect(storageSnapshot["asset-render-units"]).toBeUndefined();
      expect(storageSnapshot["asset-lexemes"]).toBeUndefined();
    } finally {
      chromeStub.restore();
    }
  });
});
