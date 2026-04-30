import { normalizeToken } from "@immersionkit/shared";
import { describe, expect, it } from "vitest";

import phraseTargetAsset from "../src/assets/en-es.phrase-targets.v1.json";

describe("phrase target asset", () => {
  it("contains only supported exact-match phrase target entries", () => {
    expect(phraseTargetAsset.schemaVersion).toBe("1.0.0");
    expect(phraseTargetAsset.languagePair).toBe("en-es");
    expect(phraseTargetAsset.entries.length).toBeGreaterThan(12);

    const keys = new Set<string>();
    for (const entry of phraseTargetAsset.entries) {
      expect(entry.sourceText.trim()).toBe(entry.sourceText);
      expect(entry.targetText.trim()).toBe(entry.targetText);
      expect(["chunk", "pattern-match"]).toContain(entry.sourceKind);
      expect(["noun-chunk", "adjective-noun", "grammar-carrier"]).toContain(
        entry.category
      );
      expect(entry.confidence).toBeGreaterThanOrEqual(0);
      expect(entry.confidence).toBeLessThanOrEqual(1);

      const key = [
        entry.sourceKind,
        entry.category,
        normalizeToken(entry.sourceText)
      ].join(":");
      expect(keys.has(key)).toBe(false);
      keys.add(key);
    }
  });

  it("includes expanded high-value noun chunks for runtime phrase rendering", () => {
    expect(phraseTargetAsset.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceText: "renewable energy project plan",
          targetText: "plan de proyectos de energia renovable",
          sourceKind: "chunk",
          category: "noun-chunk"
        }),
        expect.objectContaining({
          sourceText: "local government officials meeting",
          targetText: "reunion de funcionarios del gobierno local",
          sourceKind: "chunk",
          category: "noun-chunk"
        }),
        expect.objectContaining({
          sourceText: "emergency response plan update",
          targetText: "actualizacion del plan de respuesta de emergencia",
          sourceKind: "chunk",
          category: "noun-chunk"
        }),
        expect.objectContaining({
          sourceText: "school board meeting schedule",
          targetText: "calendario de reuniones de la junta escolar",
          sourceKind: "chunk",
          category: "noun-chunk"
        }),
        expect.objectContaining({
          sourceText: "morning routine",
          targetText: "rutina matutina",
          sourceKind: "chunk",
          category: "adjective-noun"
        }),
        expect.objectContaining({
          sourceText: "neighborhood safety meeting",
          targetText: "reunion de seguridad del vecindario",
          sourceKind: "chunk",
          category: "noun-chunk"
        }),
        expect.objectContaining({
          sourceText: "public health guidance",
          targetText: "orientacion de salud publica",
          sourceKind: "chunk",
          category: "noun-chunk"
        })
      ])
    );
  });
});
