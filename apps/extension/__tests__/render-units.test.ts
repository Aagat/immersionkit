import { describe, expect, it } from "vitest";
import {
  DEFAULT_CURRICULUM_CONFIG,
  buildRenderUnitRuntimeIndex,
  conjugateSpanishVerb,
  normalizeToken,
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

  it("preserves asset language-pair languages for lexemes and render units", () => {
    const lexemes = parseLexemeAsset({
      schemaVersion: "1.0.0",
      assetVersion: "test-fr",
      languagePair: "en-fr",
      entries: [
        {
          lexemeId: "lx:city:noun:fr",
          sourceLemma: "city",
          targetLemma: "ville",
          pos: "noun",
          frequencyRank: 10,
          confidence: 0.95
        }
      ]
    });
    const renderUnits = parseRenderUnitAsset({
      schemaVersion: "1.0.0",
      assetVersion: "test-fr",
      languagePair: "en-fr",
      entries: [
        {
          renderUnitId: "ru:city:noun:fr",
          lexemeIds: ["lx:city:noun:fr"],
          kind: "single-token",
          renderPolicy: "inline",
          sourceText: "city",
          normalizedSourceText: "city",
          targetText: "ville",
          normalizedTargetText: "ville",
          sourcePattern: {
            matchMode: "exact",
            tokens: [{ normal: "city", lemma: "city", pos: "noun" }]
          },
          minBand: "level-1a",
          confidence: 0.95,
          provenance: { source: "manual" }
        }
      ]
    });

    expect(lexemes?.languagePair).toBe("en-fr");
    expect(lexemes?.entries[0]).toMatchObject({
      sourceLanguage: "en",
      targetLanguage: "fr"
    });
    expect(renderUnits?.languagePair).toBe("en-fr");
    expect(renderUnits?.entries[0]).toMatchObject({
      sourceLanguage: "en",
      targetLanguage: "fr"
    });
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

  it("keeps bundled target normalization accent-folded and unsplit", () => {
    const renderUnits = parseRenderUnitAsset(renderUnitAsset)?.entries ?? [];
    const mismatches = renderUnits
      .filter((entry) => entry.targetText && entry.normalizedTargetText)
      .flatMap((entry) => {
        const normalizedTargetText = normalizeToken(entry.targetText ?? "");
        return normalizedTargetText === entry.normalizedTargetText
          ? []
          : [
              `${entry.renderUnitId}: ${entry.targetText} -> ${entry.normalizedTargetText}, expected ${normalizedTargetText}`
            ];
      });

    expect(mismatches).toEqual([]);
  });

  it("keeps every bundled phrase render unit banded and target-resolvable when renderable", () => {
    const renderUnits = parseRenderUnitAsset(renderUnitAsset)?.entries ?? [];
    const runtimeIndex = buildRenderUnitRuntimeIndex(renderUnits);
    const bandIds = new Set(DEFAULT_CURRICULUM_CONFIG.bands.map((band) => band.bandId));
    const failures = renderUnits
      .filter((entry) => entry.kind !== "single-token")
      .flatMap((entry) => {
        const messages: string[] = [];
        if (!bandIds.has(entry.minBand)) {
          messages.push(`${entry.renderUnitId}: unknown minBand ${entry.minBand}`);
        }
        if (entry.renderPolicy === "inline" || entry.renderPolicy === "phrase-only") {
          if (!entry.targetText?.trim() || !entry.normalizedTargetText?.trim()) {
            messages.push(`${entry.renderUnitId}: missing renderable phrase target`);
          }
          if (entry.sourcePattern.matchMode === "exact") {
            const resolved = resolveRenderUnitPhraseTarget(runtimeIndex, entry.sourceText);
            if (resolved?.targetText !== entry.targetText) {
              messages.push(`${entry.renderUnitId}: unresolved phrase target`);
            }
          }
        }
        return messages;
      });

    expect(failures).toEqual([]);
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
    expect(resolveRenderUnitPhraseTarget(runtimeIndex, "last time")).toMatchObject({
      targetText: "última vez",
      normalizedTargetText: "ultima vez"
    });
    expect(resolveRenderUnitPhraseTarget(runtimeIndex, "next time")).toMatchObject({
      targetText: "próxima vez",
      normalizedTargetText: "proxima vez"
    });
    expect(resolveRenderUnitPhraseTarget(runtimeIndex, "one more time")).toMatchObject({
      targetText: "una vez más",
      normalizedTargetText: "una vez mas"
    });
    expect(getRenderUnitSentenceHints(renderUnits)).toEqual(
      expect.arrayContaining(["first time", "one more time", "every time"])
    );
  });

  it("keeps bare use analyzer-gated so verb contexts do not pre-render as uso", () => {
    const renderUnits = parseRenderUnitAsset(renderUnitAsset)?.entries ?? [];
    const runtimeIndex = buildRenderUnitRuntimeIndex(renderUnits);
    const useRenderUnit = renderUnits.find(
      (entry) => entry.renderUnitId === "ru:use:noun:analyzer-pattern"
    );

    expect(useRenderUnit).toMatchObject({
      lexemeIds: ["lx:use:noun"],
      kind: "single-token",
      renderPolicy: "inline",
      sourceText: "use",
      targetText: "uso",
      pos: "noun",
      sourcePattern: {
        matchMode: "analyzer-pattern",
        tokens: [
          {
            normal: "use",
            lemma: "use",
            pos: "noun"
          }
        ]
      }
    });
    expect(runtimeIndex.preferredWordByNormalizedForm.get("use")).toBeUndefined();
    expect(runtimeIndex.exactSingleTokenWordEntriesByNormalizedForm.get("use")).toBeUndefined();
    expect(
      runtimeIndex.analyzerPatternWordEntriesByFirstToken
        .get("use")
        ?.map((entry) => entry.renderUnitId)
    ).toContain("ru:use:noun:analyzer-pattern");
  });

  it("keeps managed verb-frame units analyzer-gated and out of exact word indexes", () => {
    const renderUnits = parseRenderUnitAsset(renderUnitAsset)?.entries ?? [];
    const runtimeIndex = buildRenderUnitRuntimeIndex(renderUnits);
    const verbFrameIds = runtimeIndex.verbRenderEntries.map(
      (entry) => entry.renderUnitId
    );

    expect(verbFrameIds.length).toBeGreaterThanOrEqual(175);
    expect(verbFrameIds).toContain("ru:use:verb:frame");
    expect(verbFrameIds).toContain("ru:have:verb:frame");
    expect(verbFrameIds).not.toContain("ru:be:verb:frame");
    expect(runtimeIndex.preferredWordByNormalizedForm.get("use")).toBeUndefined();
    expect(runtimeIndex.exactSingleTokenWordEntriesByNormalizedForm.get("use")).toBeUndefined();
    expect(
      runtimeIndex.verbRenderEntriesByNormalizedForm
        .get("use")
        ?.map((entry) => entry.targetInfinitive)
    ).toContain("usar");
  });

  it("conjugates approved Spanish verb targets for safe verb frames", () => {
    expect(
      conjugateSpanishVerb("usar", {
        mood: "present-indicative",
        person: "first-singular"
      })
    ).toBe("uso");
    expect(
      conjugateSpanishVerb("tener", {
        mood: "present-indicative",
        person: "third-singular"
      })
    ).toBe("tiene");
    expect(
      conjugateSpanishVerb("hacer", { mood: "affirmative-tu-imperative" })
    ).toBe("haz");
    expect(
      conjugateSpanishVerb("ir", {
        mood: "present-indicative",
        person: "first-plural"
      })
    ).toBe("vamos");
    expect(
      conjugateSpanishVerb("decir", {
        mood: "present-indicative",
        person: "third-plural"
      })
    ).toBe("dicen");
    expect(conjugateSpanishVerb("dormir", { mood: "gerund" })).toBe(
      "durmiendo"
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

  it("does not keep context-sensitive discourse words as exact inline units", () => {
    const renderUnits = parseRenderUnitAsset(renderUnitAsset)?.entries ?? [];
    const runtimeIndex = buildRenderUnitRuntimeIndex(renderUnits);
    const demotedIds = renderUnits
      .filter((entry) => entry.renderPolicy === "sentence-help-only")
      .map((entry) => entry.renderUnitId);

    for (const unsafeSource of [
      "a",
      "as",
      "so",
      "that",
      "there",
      "like",
      "over",
      "party",
      "paper",
      "script"
    ]) {
      expect(runtimeIndex.preferredWordByNormalizedForm.get(unsafeSource)).toBeUndefined();
    }
    expect(demotedIds).toEqual(
      expect.arrayContaining([
        "ru:a:adjective:exact",
        "ru:that:adjective:analyzer-pattern",
        "ru:paper:noun:exact",
        "ru:script:single-token"
      ])
    );
  });
});
