import { describe, expect, it } from "vitest";
import {
  createLegacySentenceLearningNote,
  createSentenceLearningNote,
  DEFAULT_EXTENSION_SETTINGS,
  clampSentenceBatchSize,
  clampUnitInterval,
  hasSentenceLearningNoteContent,
  resolveExtensionSettings
} from "../src/domain/models";

describe("settings model helpers", () => {
  it("clamps unit-interval numbers safely", () => {
    expect(clampUnitInterval(undefined, 0.5)).toBe(0.5);
    expect(clampUnitInterval(Number.NaN, 0.5)).toBe(0.5);
    expect(clampUnitInterval(Number.POSITIVE_INFINITY, 0.5)).toBe(0.5);
    expect(clampUnitInterval(-2, 0.5)).toBe(0);
    expect(clampUnitInterval(2, 0.5)).toBe(1);
  });

  it("clamps sentence batch size into MVP bounds", () => {
    expect(clampSentenceBatchSize(undefined)).toBe(
      DEFAULT_EXTENSION_SETTINGS.sentenceBatchSize
    );
    expect(clampSentenceBatchSize(0)).toBe(1);
    expect(clampSentenceBatchSize(3.2)).toBe(3);
    expect(clampSentenceBatchSize(99)).toBe(5);
  });

  it("resolves partial settings with defaults and clamped values", () => {
    expect(
      resolveExtensionSettings({
        provider: "openai",
        discoveryRate: 3,
        goldilocksThreshold: -1,
        sentenceBatchSize: 9
      })
    ).toEqual({
      ...DEFAULT_EXTENSION_SETTINGS,
      provider: "openai",
      discoveryRate: 1,
      goldilocksThreshold: 0,
      sentenceBatchSize: 5
    });
  });

  it("falls back to defaults when settings are null", () => {
    expect(resolveExtensionSettings(null)).toEqual(DEFAULT_EXTENSION_SETTINGS);
  });

  it("retains explicit flags while clamping noisy numeric inputs", () => {
    expect(
      resolveExtensionSettings({
        enabled: false,
        provider: "openai",
        sourceLanguage: "en",
        sentenceTranslationEnabled: true,
        discoveryRate: Number.NaN,
        goldilocksThreshold: Number.POSITIVE_INFINITY,
        sentenceBatchSize: 1.2
      })
    ).toEqual({
      ...DEFAULT_EXTENSION_SETTINGS,
      enabled: false,
      provider: "openai",
      sourceLanguage: "en",
      sentenceTranslationEnabled: true,
      discoveryRate: DEFAULT_EXTENSION_SETTINGS.discoveryRate,
      goldilocksThreshold: DEFAULT_EXTENSION_SETTINGS.goldilocksThreshold,
      sentenceBatchSize: 1
    });
  });

  it("backfills learning note summaries from more specific fields", () => {
    expect(
      createSentenceLearningNote({
        keyPhrase: "\"darse cuenta de\" = to realize"
      })
    ).toEqual({
      summary: "\"darse cuenta de\" = to realize",
      literalGloss: "",
      keyPhrase: "\"darse cuenta de\" = to realize",
      canonicalUsage: "",
      grammarFocus: ""
    });
  });

  it("wraps legacy grammar notes into the structured learning-note shape", () => {
    const legacy = createLegacySentenceLearningNote("Present tense for habitual actions.");

    expect(legacy).toEqual({
      summary: "Present tense for habitual actions.",
      literalGloss: "",
      keyPhrase: "",
      canonicalUsage: "",
      grammarFocus: ""
    });
    expect(hasSentenceLearningNoteContent(legacy)).toBe(true);
  });
});
