import { describe, expect, it } from "vitest";

import { loadProcessingContext } from "../src/content/storage";
import { installChromeStub } from "./helpers/chrome-stub";

describe("extension test scaffolding", () => {
  it("supports loading processing context from render-unit runtime assets", async () => {
    const chromeStub = installChromeStub({
      "settings": {
        discoveryRate: 0.35,
        sentenceTranslationEnabled: true,
        provider: "openai"
      },
      "site-settings": [
        {
          hostname: "fixtures.immersionkit.test",
          enabled: false,
          discoveryRate: 2
        }
      ],
      "asset-render-units": {
        schemaVersion: "1.0.0",
        assetVersion: "test-render-units",
        languagePair: "en-es",
        entries: [
          createRenderUnit({
            renderUnitId: "ru:test-garden",
            lexemeId: "lexeme-safe",
            sourceText: "garden",
            targetText: "jardin"
          })
        ]
      },
      "user-vocab": [
        {
          lexemeId: "lexeme-safe",
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
      expect(context.renderUnits.map((entry) => entry.renderUnitId)).toEqual([
        "ru:test-garden"
      ]);
      expect(context.renderAssetInfo.source).toBe("cached-pack");
      expect(context.renderAssetInfo.isFallback).toBe(false);
      expect(context.vocabByLexemeId.get("lexeme-safe")?.status).toBe("known");
      expect(chromeStub.sentMessages).toContainEqual({
        type: "assets/get-context"
      });
    } finally {
      chromeStub.restore();
    }
  });

  it("keeps pack-backed rendering empty when no background asset context is available", async () => {
    const chromeStub = installChromeStub();

    try {
      const context = await loadProcessingContext("fixtures.immersionkit.test");

      expect(context.renderAssetInfo.source).toBe("empty");
      expect(context.renderAssetInfo.isFallback).toBe(true);
      expect(context.renderAssetInfo.entryCount).toBe(0);
      expect(context.renderAssetInfo.assetVersion).toBeNull();
    } finally {
      chromeStub.restore();
    }
  });

  it("loads stored render units and sentence-help hints", async () => {
    const chromeStub = installChromeStub({
      "asset-render-units": {
        schemaVersion: "1.0.0",
        assetVersion: "test-render-units",
        languagePair: "en-es",
        entries: [
          createRenderUnit({
            renderUnitId: "ru:test-city",
            lexemeId: "lx:city:noun",
            sourceText: "city",
            targetText: "ciudad"
          }),
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

      expect(context.renderAssetInfo.source).toBe("cached-pack");
      expect(context.renderAssetInfo.assetVersion).toBe("test-render-units");
      expect(context.renderUnits.map((entry) => entry.renderUnitId)).toEqual([
        "ru:test-city",
        "ru:test-need-help-only"
      ]);
      expect(context.sentenceHintPhrases).toContain("might need to");
    } finally {
      chromeStub.restore();
    }
  });
});

function createRenderUnit(input: {
  renderUnitId: string;
  lexemeId: string;
  sourceText: string;
  targetText: string;
}) {
  return {
    renderUnitId: input.renderUnitId,
    lexemeIds: [input.lexemeId],
    kind: "single-token",
    renderPolicy: "inline",
    sourceText: input.sourceText,
    normalizedSourceText: input.sourceText,
    targetText: input.targetText,
    normalizedTargetText: input.targetText,
    sourcePattern: {
      matchMode: "exact",
      tokens: [
        {
          normal: input.sourceText,
          lemma: input.sourceText,
          pos: "noun"
        }
      ]
    },
    replacement: {
      startToken: 0,
      endToken: 1,
      targetText: input.targetText
    },
    pos: "noun",
    minBand: "level-1a",
    frequencyRank: 12,
    confidence: 0.98,
    provenance: { source: "manual" }
  };
}
