import { describe, expect, it } from "vitest";

import { loadProcessingContext } from "../src/content/storage";
import { installChromeStub } from "./helpers/chrome-stub";

describe("extension test scaffolding", () => {
  it("supports loading processing context from stubbed chrome storage", async () => {
    const chromeStub = installChromeStub({
      "immersionkit.settings": {
        discoveryRate: 0.35,
        sentenceTranslationEnabled: true,
        provider: "openai"
      },
      "immersionkit.siteSettings": [
        {
          hostname: "fixtures.immersionkit.test",
          enabled: false,
          discoveryRate: 2
        }
      ],
      "immersionkit.seedLexicon": [
        {
          lemmaId: "lemma-safe",
          sourceLemma: "garden",
          targetLemma: "jardin",
          pos: "noun",
          frequencyRank: 21,
          confidence: 0.9
        },
        {
          lemmaId: "lemma-unsafe",
          sourceLemma: "run",
          targetLemma: "correr",
          pos: "other",
          frequencyRank: 22,
          confidence: 0.9
        }
      ],
      "immersionkit.vocab": [
        {
          lemmaId: "lemma-safe",
          status: "known",
          exposureCount: 4,
          updatedAt: "2026-04-01T10:00:00.000Z"
        }
      ]
    });

    try {
      const context = await loadProcessingContext("fixtures.immersionkit.test");

      expect(context.siteEnabled).toBe(false);
      expect(context.discoveryRate).toBe(1);
      expect(context.settings.provider).toBe("openai");
      expect(context.lexicon.map((entry) => entry.lemmaId)).toEqual(["lemma-safe"]);
      expect(context.vocabByLemmaId.get("lemma-safe")?.status).toBe("known");
    } finally {
      chromeStub.restore();
    }
  });
});
