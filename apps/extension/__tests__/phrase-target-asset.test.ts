import {
  DEFAULT_CURRICULUM_CONFIG,
  FIXED_PHRASE_LEXICON,
  evaluatePhraseCurriculumContentInventory,
  getActiveCurriculumContent,
  normalizePhraseText,
  normalizeToken
} from "@immersionkit/shared";
import { describe, expect, it } from "vitest";

import phraseTargetAsset from "../src/assets/en-es.phrase-targets.v1.json";
import renderUnitAsset from "../src/assets/en-es.render-units.v1.json";

describe("phrase target asset", () => {
  it("contains only supported exact-match phrase target entries", () => {
    expect(phraseTargetAsset.schemaVersion).toBe("1.0.0");
    expect(phraseTargetAsset.languagePair).toBe("en-es");
    expect(phraseTargetAsset.entries.length).toBeGreaterThanOrEqual(1100);

    const keys = new Set<string>();
    const bandIds = new Set(DEFAULT_CURRICULUM_CONFIG.bands.map((band) => band.bandId));
    for (const entry of phraseTargetAsset.entries) {
      expect(entry.sourceText.trim()).toBe(entry.sourceText);
      expect(entry.targetText.trim()).toBe(entry.targetText);
      expect(bandIds.has(entry.minBand)).toBe(true);
      expect(["chunk", "pattern-match"]).toContain(entry.sourceKind);
      expect(["noun-chunk", "adjective-noun", "grammar-carrier"]).toContain(
        entry.category
      );
      expect(entry.confidence).toBeGreaterThanOrEqual(0);
      expect(entry.confidence).toBeLessThanOrEqual(1);
      expect(normalizeToken(entry.sourceText)).toBeTruthy();
      expect(normalizeToken(entry.targetText)).toBeTruthy();

      const key = [
        entry.sourceKind,
        entry.category,
        normalizeToken(entry.sourceText)
      ].join(":");
      expect(keys.has(key)).toBe(false);
      keys.add(key);
    }
  });

  it("covers every default phrase band with explicit curated target metadata", () => {
    const countsByBand = new Map<string, number>();
    for (const entry of phraseTargetAsset.entries) {
      countsByBand.set(entry.minBand, (countsByBand.get(entry.minBand) ?? 0) + 1);
    }

    for (const band of DEFAULT_CURRICULUM_CONFIG.bands) {
      expect(countsByBand.get(band.bandId) ?? 0).toBeGreaterThan(0);
    }
  });

  it("uses curated phrase target minBand as the curriculum gate", () => {
    const orderedBands = DEFAULT_CURRICULUM_CONFIG.bands
      .slice()
      .sort((left, right) => left.order - right.order);

    for (const entry of phraseTargetAsset.entries) {
      const minBandIndex = orderedBands.findIndex((band) => band.bandId === entry.minBand);
      expect(minBandIndex).toBeGreaterThanOrEqual(0);

      const activeContent = getActiveCurriculumContent({
        profile: { activePhraseBandId: entry.minBand },
        unitType: "phrase"
      });
      expect(
        evaluatePhraseCurriculumContentInventory({
          activeContent,
          sourceText: entry.sourceText,
          sourceKind: entry.sourceKind,
          category: entry.category,
          phraseMinBand: entry.minBand
        })
      ).toMatchObject({
        eligible: true,
        matchReason: "phrase-target-band",
        skipReason: null
      });

      const previousBand = orderedBands[minBandIndex - 1];
      if (previousBand) {
        const previousContent = getActiveCurriculumContent({
          profile: { activePhraseBandId: previousBand.bandId },
          unitType: "phrase"
        });
        expect(
          evaluatePhraseCurriculumContentInventory({
            activeContent: previousContent,
            sourceText: entry.sourceText,
            sourceKind: entry.sourceKind,
            category: entry.category,
            phraseMinBand: entry.minBand
          })
        ).toMatchObject({
          eligible: false,
          skipReason: "phrase-target-band-locked"
        });
      }
    }
  });

  it("includes expanded high-value noun chunks for runtime phrase rendering", () => {
    expect(phraseTargetAsset.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceText: "renewable energy project plan",
          targetText: "plan de proyecto de energía renovable",
          sourceKind: "chunk",
          category: "noun-chunk"
        }),
        expect.objectContaining({
          sourceText: "local government officials meeting",
          targetText: "reunión de funcionarios del gobierno local",
          sourceKind: "chunk",
          category: "noun-chunk"
        }),
        expect.objectContaining({
          sourceText: "emergency response plan update",
          targetText: "actualización del plan de respuesta de emergencia",
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
          targetText: "reunión de seguridad del vecindario",
          sourceKind: "chunk",
          category: "noun-chunk"
        }),
        expect.objectContaining({
          sourceText: "public health guidance",
          targetText: "orientación de salud pública",
          sourceKind: "chunk",
          category: "noun-chunk"
        }),
        expect.objectContaining({
          sourceText: "public library card",
          targetText: "tarjeta de la biblioteca pública",
          sourceKind: "chunk",
          category: "noun-chunk",
          minBand: "level-2a"
        }),
        expect.objectContaining({
          sourceText: "data privacy regulation",
          targetText: "normativa de privacidad de datos",
          sourceKind: "chunk",
          category: "noun-chunk",
          minBand: "level-5a"
        }),
        expect.objectContaining({
          sourceText: "birth certificate",
          targetText: "certificado de nacimiento",
          sourceKind: "chunk",
          category: "noun-chunk",
          minBand: "level-2c"
        }),
        expect.objectContaining({
          sourceText: "password reset link",
          targetText: "enlace de restablecimiento de contraseña",
          sourceKind: "chunk",
          category: "noun-chunk",
          minBand: "level-3a"
        }),
        expect.objectContaining({
          sourceText: "research paper abstract",
          targetText: "resumen de artículo de investigación",
          sourceKind: "chunk",
          category: "noun-chunk",
          minBand: "level-5a"
        })
      ])
    );
  });

  it("ships at least two thousand reviewed production phrase triggers", () => {
    const reviewedSourceTexts = new Set<string>();
    for (const entry of FIXED_PHRASE_LEXICON) {
      reviewedSourceTexts.add(normalizePhraseText(entry.sourceText));
    }
    for (const entry of phraseTargetAsset.entries) {
      reviewedSourceTexts.add(normalizePhraseText(entry.sourceText));
    }
    for (const entry of renderUnitAsset.entries) {
      if (
        entry.kind.includes("phrase") ||
        entry.kind === "sentence-help-only" ||
        entry.sourcePattern.tokens.length > 1 ||
        entry.sourceText.includes(" ")
      ) {
        reviewedSourceTexts.add(normalizePhraseText(entry.sourceText));
      }
    }

    expect(reviewedSourceTexts.size).toBeGreaterThanOrEqual(2000);
  });
});
