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
      expect(context.lexiconInfo.source).toBe("storage-legacy-array");
      expect(context.lexiconInfo.isFallback).toBe(false);
      expect(context.vocabByLemmaId.get("lemma-safe")?.status).toBe("known");
    } finally {
      chromeStub.restore();
    }
  });

  it("parses wrapped compact seed assets from storage", async () => {
    const chromeStub = installChromeStub({
      "immersionkit.seedLexicon": {
        schemaVersion: "1.0.0",
        assetVersion: "2026.04.18-seed2",
        entryEncoding: "array",
        columns: [
          "lemmaId",
          "sourceLemma",
          "targetLemma",
          "pos",
          "frequencyRank",
          "confidence"
        ],
        entries: [
          ["en:city:noun", "city", "ciudad", "noun", 12, 0.98],
          ["en:important:adjective", "important", "importante", "adjective", 30, 0.95]
        ]
      }
    });

    try {
      const context = await loadProcessingContext("fixtures.immersionkit.test");

      expect(context.lexiconInfo.source).toBe("storage-wrapped-asset");
      expect(context.lexiconInfo.assetVersion).toBe("2026.04.18-seed2");
      expect(context.lexiconInfo.entryCount).toBe(2);
      expect(context.lexicon[0]?.lemmaId).toBe("en:city:noun");
      expect(context.lexicon[1]?.lemmaId).toBe("en:important:adjective");
    } finally {
      chromeStub.restore();
    }
  });

  it("uses bundled generated lexicon when storage is missing", async () => {
    const chromeStub = installChromeStub();

    try {
      const context = await loadProcessingContext("fixtures.immersionkit.test");

      expect(context.lexiconInfo.source).toBe("bundled-asset");
      expect(context.lexiconInfo.isFallback).toBe(false);
      expect(context.lexiconInfo.entryCount).toBeGreaterThan(100);
      expect(context.lexiconInfo.assetVersion).toBeTruthy();
      expect(context.lexicon.some((entry) => entry.lemmaId.startsWith("seed-"))).toBe(
        false
      );
    } finally {
      chromeStub.restore();
    }
  });

  it("adapts stored render units into lexeme-backed words and sentence-help hints", async () => {
    const chromeStub = installChromeStub({
      "immersionkit.lexemes": {
        schemaVersion: "1.0.0",
        assetVersion: "test-lexemes",
        languagePair: "en-es",
        entries: [
          {
            lexemeId: "lx:city:noun",
            sourceLemma: "city",
            targetLemma: "ciudad",
            pos: "noun",
            frequencyRank: 12,
            confidence: 0.98
          }
        ]
      },
      "immersionkit.renderUnits": {
        schemaVersion: "1.0.0",
        assetVersion: "test-render-units",
        languagePair: "en-es",
        entries: [
          {
            renderUnitId: "ru:test-city",
            lexemeIds: ["lx:city:noun"],
            kind: "single-token",
            renderPolicy: "inline",
            sourceText: "city",
            normalizedSourceText: "city",
            targetText: "ciudad",
            normalizedTargetText: "ciudad",
            sourcePattern: {
              matchMode: "exact",
              tokens: [{ normal: "city", lemma: "city", pos: "noun" }]
            },
            replacement: {
              startToken: 0,
              endToken: 1,
              targetText: "ciudad"
            },
            pos: "noun",
            minBand: "level-1a",
            frequencyRank: 12,
            confidence: 0.98,
            provenance: { source: "manual" }
          },
          {
            renderUnitId: "ru:test-need-help-only",
            lexemeIds: ["lx:need:verb"],
            kind: "sentence-help-only",
            renderPolicy: "sentence-help-only",
            sourceText: "might need to",
            normalizedSourceText: "might need to",
            sourcePattern: {
              matchMode: "analyzer-pattern",
              tokens: [
                { normal: "might" },
                { lemma: "need", pos: "verb" },
                { normal: "to" }
              ]
            },
            minBand: "level-1a",
            confidence: 0.99,
            provenance: { source: "manual" }
          }
        ]
      }
    });

    try {
      const context = await loadProcessingContext("fixtures.immersionkit.test");

      expect(context.lexiconInfo.source).toBe("storage-wrapped-asset");
      expect(context.lexiconInfo.assetVersion).toBe("test-render-units");
      expect(context.lexicon).toEqual([
        expect.objectContaining({
          lemmaId: "lx:city:noun",
          lexemeId: "lx:city:noun",
          renderUnitId: "ru:test-city",
          renderUnitMinBand: "level-1a"
        })
      ]);
      expect(context.sentenceHintPhrases).toContain("might need to");
    } finally {
      chromeStub.restore();
    }
  });
});
