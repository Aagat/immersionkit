import { describe, expect, it } from "vitest";

import {
  getRenderUnitSentenceHints,
  parseRenderUnitAsset
} from "../src/render-units/render-units";

describe("render unit assets", () => {
  it("accepts canonical analyzer-pattern rows and derives sentence-help hints", () => {
    const parsed = parseRenderUnitAsset({
      schemaVersion: "1.0.0",
      assetVersion: "test",
      entries: [
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
              { lemma: "need", pos: "verb", role: "verb", features: { negated: true } },
              { normal: "to" }
            ]
          },
          minBand: "level-1a",
          confidence: 0.99,
          provenance: { source: "manual" }
        }
      ]
    });

    expect(parsed?.entries[0]?.sourcePattern.matchMode).toBe("analyzer-pattern");
    expect(parsed?.entries[0]?.sourcePattern.tokens[1]).toMatchObject({
      role: "verb",
      features: { negated: true }
    });
    expect(getRenderUnitSentenceHints(parsed?.entries ?? [])).toContain("might need to");
  });

  it("normalizes legacy token-pattern rows to analyzer-pattern", () => {
    const parsed = parseRenderUnitAsset({
      schemaVersion: "1.0.0",
      assetVersion: "test",
      entries: [
        {
          renderUnitId: "ru:test-going-to",
          lexemeIds: ["lx:go:verb"],
          kind: "grammar-phrase",
          renderPolicy: "phrase-only",
          sourceText: "going to",
          normalizedSourceText: "going to",
          targetText: "ir a",
          normalizedTargetText: "ir a",
          sourcePattern: {
            matchMode: "token-pattern",
            tokens: [{ lemma: "go", pos: "verb" }, { normal: "to" }]
          },
          replacement: {
            startToken: 0,
            endToken: 2,
            targetText: "ir a"
          },
          minBand: "level-1c",
          confidence: 0.86,
          provenance: { source: "manual" }
        }
      ]
    });

    expect(parsed?.entries[0]?.sourcePattern.matchMode).toBe("analyzer-pattern");
  });
});
