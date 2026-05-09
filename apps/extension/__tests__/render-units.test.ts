import { describe, expect, it } from "vitest";
import {
  buildRenderUnitRuntimeIndex,
  resolveRenderUnitPhraseTarget
} from "@immersionkit/shared";

import {
  getRenderUnitSentenceHints,
  parseLexemeAsset,
  parseRenderUnitAsset
} from "../src/render-units/render-units";
import lexemeAsset from "../src/assets/en-es.lexemes.v1.json";
import renderUnitAsset from "../src/assets/en-es.render-units.v1.json";

describe("render unit assets", () => {
  it("carries the full deck lexeme inventory without making lexemes renderable", () => {
    const lexemes = parseLexemeAsset(lexemeAsset);

    expect(lexemes?.entries.length).toBeGreaterThanOrEqual(13_000);
  });

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

  it("keeps bundled render-unit lexemeIds backed by the lexeme asset", () => {
    const renderUnits = parseRenderUnitAsset(renderUnitAsset);
    const lexemes = parseLexemeAsset(lexemeAsset);
    const lexemeIds = new Set(lexemes?.entries.map((entry) => entry.lexemeId));
    const unresolved = (renderUnits?.entries ?? []).flatMap((entry) =>
      entry.lexemeIds
        .filter((lexemeId) => !lexemeIds.has(lexemeId))
        .map((lexemeId) => `${entry.renderUnitId}:${lexemeId}`)
    );

    expect(unresolved).toEqual([]);
    expect(
      renderUnits?.entries.find((entry) => entry.renderUnitId === "ru:no:adverb:exact")
        ?.lexemeIds
    ).toContain("lx:no:adverb");
  });

  it("models time as duration by default with occurrence-specific vez phrases", () => {
    const renderUnits = parseRenderUnitAsset(renderUnitAsset)?.entries ?? [];
    const runtimeIndex = buildRenderUnitRuntimeIndex(renderUnits);
    const bareTime = runtimeIndex.preferredWordByNormalizedForm.get("time");

    expect(bareTime).toMatchObject({
      renderUnitId: "ru:time-tiempo:noun:exact",
      lexemeId: "lx:time-tiempo:noun",
      targetText: "tiempo"
    });
    expect(resolveRenderUnitPhraseTarget(runtimeIndex, "first time")).toMatchObject({
      targetText: "primera vez",
      normalizedTargetText: "primera vez"
    });
    expect(resolveRenderUnitPhraseTarget(runtimeIndex, "one more time")).toMatchObject({
      targetText: "una vez mas",
      normalizedTargetText: "una vez mas"
    });
    expect(getRenderUnitSentenceHints(renderUnits)).toEqual(
      expect.arrayContaining(["first time", "one more time", "every time"])
    );
  });

  it("does not keep unsafe bare conjugated grammar frames renderable", () => {
    const renderUnits = parseRenderUnitAsset(renderUnitAsset);
    const unsafeRenderableFrames = (renderUnits?.entries ?? [])
      .filter((entry) =>
        ["ru:going-to:grammar-phrase", "ru:used-to:grammar-phrase"].includes(
          entry.renderUnitId
        )
      )
      .filter(
        (entry) =>
          entry.renderPolicy === "inline" || entry.renderPolicy === "phrase-only"
      )
      .map((entry) => entry.renderUnitId);

    expect(unsafeRenderableFrames).toEqual([]);
  });
});
