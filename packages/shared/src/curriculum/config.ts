import type {
  CurriculumBand,
  CurriculumBandUnitType,
  LearningItem,
  SupportedTargetLanguage
} from "../domain/models";

export type CurriculumLevel = {
  levelId: string;
  label: string;
  order: number;
  bandIds: string[];
  checkpointRequired: boolean;
};

export type CurriculumTransitionPolicy = {
  stableStatuses: LearningItem["status"][];
  minimumStableItemRatio: number;
  minimumQualifiedExposures: number;
  maximumRecentLapseRate: number;
  checkpointRequired: boolean;
};

export type CurriculumConfig = {
  configId: string;
  targetLanguage: SupportedTargetLanguage;
  levels: CurriculumLevel[];
  bands: CurriculumBand[];
  defaultTransitionPolicy: CurriculumTransitionPolicy;
};

export type CurriculumTransitionInput = {
  bandId: string;
  items: readonly LearningItem[];
  recentLapseRate: number;
  checkpointPassed: boolean;
};

export type CurriculumTransitionDecision = {
  eligible: boolean;
  band: CurriculumBand | null;
  nextBand: CurriculumBand | null;
  unmetRequirements: string[];
};

export const DEFAULT_CURRICULUM_CONFIG: CurriculumConfig = {
  configId: "en-es-default-v1",
  targetLanguage: "es",
  levels: [
    {
      levelId: "level-1",
      label: "Foundations",
      order: 1,
      bandIds: ["level-1a", "level-1b", "level-1c"],
      checkpointRequired: true
    },
    {
      levelId: "level-2",
      label: "Everyday Patterns",
      order: 2,
      bandIds: ["level-2a", "level-2b", "level-2c"],
      checkpointRequired: true
    },
    {
      levelId: "level-3",
      label: "Narrative and Description",
      order: 3,
      bandIds: ["level-3a", "level-3b", "level-3c"],
      checkpointRequired: true
    },
    {
      levelId: "level-4",
      label: "Connected Expression",
      order: 4,
      bandIds: ["level-4a", "level-4b"],
      checkpointRequired: true
    },
    {
      levelId: "level-5",
      label: "Broad Native Reading",
      order: 5,
      bandIds: ["level-5a", "level-5b"],
      checkpointRequired: true
    }
  ],
  bands: [
    createDefaultBand("level-1a", "Level 1A", 1, "mixed", 0, 0.32, false),
    createDefaultBand("level-1b", "Level 1B", 2, "mixed", 0, 0.36, false),
    createDefaultBand("level-1c", "Level 1C", 3, "mixed", 0, 0.42, true),
    createDefaultBand("level-2a", "Level 2A", 4, "mixed", 0.18, 0.48, false),
    createDefaultBand("level-2b", "Level 2B", 5, "mixed", 0.22, 0.54, false),
    createDefaultBand("level-2c", "Level 2C", 6, "mixed", 0.26, 0.6, true),
    createDefaultBand("level-3a", "Level 3A", 7, "mixed", 0.34, 0.66, false),
    createDefaultBand("level-3b", "Level 3B", 8, "mixed", 0.38, 0.72, false),
    createDefaultBand("level-3c", "Level 3C", 9, "mixed", 0.42, 0.78, true),
    createDefaultBand("level-4a", "Level 4A", 10, "mixed", 0.5, 0.84, false),
    createDefaultBand("level-4b", "Level 4B", 11, "mixed", 0.54, 0.9, true),
    createDefaultBand("level-5a", "Level 5A", 12, "mixed", 0.62, 0.96, false),
    createDefaultBand("level-5b", "Level 5B", 13, "mixed", 0.66, 1, true)
  ],
  defaultTransitionPolicy: {
    stableStatuses: ["reviewing", "mastered"],
    minimumStableItemRatio: 0.72,
    minimumQualifiedExposures: 2,
    maximumRecentLapseRate: 0.18,
    checkpointRequired: false
  }
};

export function resolveCurriculumConfig(
  config: Partial<CurriculumConfig> | null | undefined
): CurriculumConfig {
  if (!config) {
    return DEFAULT_CURRICULUM_CONFIG;
  }

  return {
    ...DEFAULT_CURRICULUM_CONFIG,
    ...config,
    levels: config.levels?.length ? [...config.levels] : DEFAULT_CURRICULUM_CONFIG.levels,
    bands: config.bands?.length ? [...config.bands] : DEFAULT_CURRICULUM_CONFIG.bands,
    defaultTransitionPolicy: {
      ...DEFAULT_CURRICULUM_CONFIG.defaultTransitionPolicy,
      ...config.defaultTransitionPolicy
    }
  };
}

export function evaluateCurriculumBandTransition(
  configInput: Partial<CurriculumConfig> | null | undefined,
  input: CurriculumTransitionInput
): CurriculumTransitionDecision {
  const config = resolveCurriculumConfig(configInput);
  const orderedBands = [...config.bands].sort((left, right) => left.order - right.order);
  const bandIndex = orderedBands.findIndex((band) => band.bandId === input.bandId);
  const band = bandIndex >= 0 ? orderedBands[bandIndex] : null;
  if (!band) {
    return {
      eligible: false,
      band: null,
      nextBand: null,
      unmetRequirements: ["unknown-band"]
    };
  }

  const policy = resolveTransitionPolicy(config, band);
  const bandItems = input.items.filter((item) => item.bandId === band.bandId);
  const stableItems = bandItems.filter((item) =>
    policy.stableStatuses.includes(item.status)
  );
  const stableRatio =
    bandItems.length > 0 ? stableItems.length / bandItems.length : 0;
  const minimumExposureMet = bandItems.every(
    (item) => item.qualifiedExposureCount >= policy.minimumQualifiedExposures
  );
  const unmetRequirements: string[] = [];

  if (stableRatio < policy.minimumStableItemRatio) {
    unmetRequirements.push("stable-item-ratio");
  }

  if (!minimumExposureMet) {
    unmetRequirements.push("qualified-exposures");
  }

  if (input.recentLapseRate > policy.maximumRecentLapseRate) {
    unmetRequirements.push("recent-lapse-rate");
  }

  if (policy.checkpointRequired && !input.checkpointPassed) {
    unmetRequirements.push("checkpoint");
  }

  return {
    eligible: unmetRequirements.length === 0,
    band,
    nextBand: orderedBands[bandIndex + 1] ?? null,
    unmetRequirements
  };
}

function resolveTransitionPolicy(
  config: CurriculumConfig,
  band: CurriculumBand
): CurriculumTransitionPolicy {
  return {
    ...config.defaultTransitionPolicy,
    minimumStableItemRatio: band.unlockRequirements.stableItemRatio,
    minimumQualifiedExposures: band.unlockRequirements.minimumQualifiedExposures,
    maximumRecentLapseRate: band.unlockRequirements.maximumRecentLapseRate,
    checkpointRequired: band.unlockRequirements.checkpointRequired
  };
}

function createDefaultBand(
  bandId: string,
  label: string,
  order: number,
  unitType: CurriculumBandUnitType,
  minimumScore: number,
  maximumScore: number,
  checkpointRequired: boolean
): CurriculumBand {
  return {
    bandId,
    unitType,
    label,
    order,
    itemIds: [],
    unlockRequirements: {
      stableItemRatio: 0.72,
      minimumQualifiedExposures: 2,
      maximumRecentLapseRate: 0.18,
      checkpointRequired
    },
    difficultyLimits: {
      minimumScore,
      maximumScore
    }
  };
}
