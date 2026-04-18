import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXTENSION_SETTINGS,
  clampSentenceBatchSize,
  clampUnitInterval,
  resolveExtensionSettings
} from "../src/domain/models";

describe("settings model helpers", () => {
  it("clamps unit-interval numbers safely", () => {
    expect(clampUnitInterval(undefined, 0.5)).toBe(0.5);
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
});
