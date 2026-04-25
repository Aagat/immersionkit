import type { PhraseOccurrence } from "@immersionkit/shared";
import { describe, expect, it } from "vitest";

import { ChromeStoragePhraseRegistryRepository } from "../src/background/phrase-registry";
import { installChromeStub } from "./helpers/chrome-stub";

describe("background phrase registry", () => {
  it("creates phrase learning items after registry identity exists", async () => {
    const chromeStub = installChromeStub();
    const registry = new ChromeStoragePhraseRegistryRepository();
    const occurrence = createPhraseOccurrence("phrase:fixed-phrase:take-care-of:empty");

    try {
      const [entry] = await registry.upsertOccurrences([
        occurrence
      ], "2026-04-25T10:00:00.000Z");
      await registry.upsertOccurrences([
        occurrence
      ], "2026-04-25T10:05:00.000Z");

      const storage = chromeStub.getStorageSnapshot();
      expect(storage["immersionkit.phraseRegistry"]).toMatchObject({
        [entry.phraseId]: {
          phraseId: entry.phraseId,
          exposureCount: 2,
          lastSeenAt: "2026-04-25T10:05:00.000Z"
        }
      });
      expect(storage["immersionkit.learningItems"]).toMatchObject({
        [`phrase:${entry.phraseId}`]: {
          itemId: `phrase:${entry.phraseId}`,
          unitRefId: entry.phraseId,
          unitType: "phrase",
          status: "new"
        }
      });
    } finally {
      chromeStub.restore();
    }
  });
});

function createPhraseOccurrence(phraseId: string): PhraseOccurrence {
  return {
    occurrenceId: "sentence-1:fixture-v1:0-3:fixed:take-care-of",
    phraseId,
    sentenceHash: "sentence-1",
    analyzerVersion: "fixture-v1",
    sourceText: "take care of",
    normalizedSourceText: "take care of",
    sourceKind: "fixed-phrase",
    category: "fixed-idiom",
    ruleId: "fixed:take-care-of",
    span: {
      startToken: 0,
      endToken: 3,
      startChar: 0,
      endChar: 12
    },
    confidence: 0.94
  };
}
