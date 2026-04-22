import { hashSentence } from "@immersionkit/shared";
import { describe, expect, it } from "vitest";

import { loadNlpPerformanceFixtures } from "../src/background/analysis-spike";

describe("background NLP performance fixtures", () => {
  it("loads deterministic sentence corpora for synthetic, page, and replay sets", () => {
    const fixtures = loadNlpPerformanceFixtures();

    expect(fixtures.syntheticSentences.length).toBeGreaterThan(20);
    expect(fixtures.pageSentences.length).toBeGreaterThan(20);
    expect(fixtures.cacheReplay.sentences.length).toBeGreaterThan(40);

    const pageSources = new Set(fixtures.pageSentences.map((entry) => entry.sourceFile));
    expect(pageSources.size).toBeGreaterThanOrEqual(4);
  });

  it("keeps replay fixtures aligned with expected cache-hit assumptions", () => {
    const fixtures = loadNlpPerformanceFixtures();
    const uniqueHashes = new Set(fixtures.cacheReplay.sentences.map((sentence) => hashSentence(sentence)));

    const replayCount = fixtures.cacheReplay.sentences.length;
    const hitRate = 1 - uniqueHashes.size / replayCount;

    expect(uniqueHashes.size).toBe(fixtures.cacheReplay.expectedUniqueSentenceCount);
    expect(hitRate).toBeGreaterThanOrEqual(fixtures.cacheReplay.expectedMinimumCacheHitRate);
  });
});
