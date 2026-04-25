import {
  DEFAULT_CURRICULUM_CONFIG,
  evaluateCurriculumBandTransition,
  resolveCurriculumConfig,
  type CurriculumConfig,
  type LearningItem
} from "../src";
import { describe, expect, it } from "vitest";

const BASE_ITEM: LearningItem = {
  itemId: "word:lemma-city",
  unitRefId: "lemma-city",
  unitType: "word",
  sourceText: "city",
  targetText: "ciudad",
  status: "reviewing",
  bandId: "level-1a",
  introducedAt: "2026-04-18T09:00:00.000Z",
  nextReviewAt: "2026-04-19T09:00:00.000Z",
  interval: 24 * 60 * 60 * 1000,
  ease: 2.3,
  lapses: 0,
  assistCount: 0,
  qualifiedExposureCount: 2,
  consecutiveUnassistedCount: 2,
  distinctContextCount: 2,
  suspended: false
};

describe("curriculum configuration", () => {
  it("provides configurable default levels and ordered bands", () => {
    const config = resolveCurriculumConfig(null);

    expect(config.levels).toHaveLength(5);
    expect(config.bands).toHaveLength(13);
    expect(config.levels[0]?.bandIds).toEqual(["level-1a", "level-1b", "level-1c"]);
  });

  it("evaluates band transitions from config instead of hardcoded thresholds", () => {
    const decision = evaluateCurriculumBandTransition(DEFAULT_CURRICULUM_CONFIG, {
      bandId: "level-1a",
      items: [BASE_ITEM],
      recentLapseRate: 0,
      checkpointPassed: false
    });

    expect(decision).toMatchObject({
      eligible: true,
      nextBand: expect.objectContaining({ bandId: "level-1b" }),
      unmetRequirements: []
    });
  });

  it("lets external curriculum data tune transition requirements", () => {
    const strictConfig: CurriculumConfig = {
      ...DEFAULT_CURRICULUM_CONFIG,
      bands: DEFAULT_CURRICULUM_CONFIG.bands.map((band) =>
        band.bandId === "level-1a"
          ? {
              ...band,
              unlockRequirements: {
                ...band.unlockRequirements,
                stableItemRatio: 1,
                minimumQualifiedExposures: 3,
                checkpointRequired: true
              }
            }
          : band
      )
    };

    const decision = evaluateCurriculumBandTransition(strictConfig, {
      bandId: "level-1a",
      items: [BASE_ITEM],
      recentLapseRate: 0,
      checkpointPassed: false
    });

    expect(decision.eligible).toBe(false);
    expect(decision.unmetRequirements).toEqual([
      "qualified-exposures",
      "checkpoint"
    ]);
  });
});
