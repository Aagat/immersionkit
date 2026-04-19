import { describe, expect, it } from "vitest";

import { ensureSeedLexiconReady } from "../src/background/seed-lexicon";
import { parseSeedLexiconInput } from "../src/seed/seed-lexicon";
import { installChromeStub } from "./helpers/chrome-stub";

describe("background seed lexicon bootstrap", () => {
  it("seeds the canonical storage key from the bundled generated asset", async () => {
    const chromeStub = installChromeStub();

    try {
      const result = await ensureSeedLexiconReady();
      expect(result.source).toBe("seeded");
      expect(result.entryCount).toBeGreaterThan(100);

      const storageSnapshot = chromeStub.getStorageSnapshot();
      const seededValue = storageSnapshot["immersionkit.seedLexicon"];
      const parsedSeed = parseSeedLexiconInput(seededValue);

      expect(parsedSeed).toBeTruthy();
      expect(parsedSeed?.entries.length).toBeGreaterThan(100);
      expect(parsedSeed?.entries.some((entry) => entry.lemmaId.startsWith("seed-"))).toBe(
        false
      );
    } finally {
      chromeStub.restore();
    }
  });

  it("keeps an existing sufficiently-sized storage lexicon", async () => {
    const existingAsset = createAssetWithRows(120);
    const chromeStub = installChromeStub({
      "immersionkit.seedLexicon": existingAsset
    });

    try {
      const result = await ensureSeedLexiconReady();
      expect(result.source).toBe("existing");
      expect(result.entryCount).toBe(120);

      const storageSnapshot = chromeStub.getStorageSnapshot();
      expect(storageSnapshot["immersionkit.seedLexicon"]).toEqual(existingAsset);
    } finally {
      chromeStub.restore();
    }
  });

  it("refreshes an older same-sized storage lexicon when the bundled asset version changes", async () => {
    const existingAsset = createAssetWithRows(3000, {
      assetVersion: "2026.04.18-seed2"
    });
    const chromeStub = installChromeStub({
      "immersionkit.seedLexicon": existingAsset
    });

    try {
      const result = await ensureSeedLexiconReady();
      expect(result.source).toBe("seeded");
      expect(result.entryCount).toBeGreaterThan(100);

      const storageSnapshot = chromeStub.getStorageSnapshot();
      expect(storageSnapshot["immersionkit.seedLexicon"]).not.toEqual(existingAsset);
    } finally {
      chromeStub.restore();
    }
  });
});

function createAssetWithRows(count: number): {
  schemaVersion: string;
  assetVersion?: string;
  entryEncoding: string;
  columns: string[];
  entries: [string, string, string, string, number, number][];
};

function createAssetWithRows(
  count: number,
  options: {
    assetVersion?: string;
  } = {}
): {
  schemaVersion: string;
  assetVersion?: string;
  entryEncoding: string;
  columns: string[];
  entries: [string, string, string, string, number, number][];
} {
  const entries: [string, string, string, string, number, number][] = [];
  for (let index = 0; index < count; index += 1) {
    entries.push([
      `en:word-${index}:noun`,
      `word-${index}`,
      `palabra-${index}`,
      "noun",
      index + 1,
      0.9
    ]);
  }

  return {
    schemaVersion: "1.0.0",
    assetVersion: options.assetVersion,
    entryEncoding: "array",
    columns: [
      "lemmaId",
      "sourceLemma",
      "targetLemma",
      "pos",
      "frequencyRank",
      "confidence"
    ],
    entries
  };
}
