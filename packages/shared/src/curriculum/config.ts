import type {
  CurriculumBand,
  CurriculumBandUnitType,
  LearningItem,
  LearningUnitType,
  SupportedTargetLanguage,
  UserLearningProfile
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
  minimumEvidenceBearingItems?: number;
  minimumDistinctContextItems?: number;
  minimumDistinctContextItemRatio?: number;
  minimumUnassistedItems?: number;
  minimumUnassistedItemRatio?: number;
  checkpointRequired: boolean;
};

type ResolvedCurriculumTransitionPolicy = CurriculumTransitionPolicy & {
  minimumEvidenceBearingItems: number;
  minimumDistinctContextItems: number;
  minimumDistinctContextItemRatio: number;
  minimumUnassistedItems: number;
  minimumUnassistedItemRatio: number;
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

export type CurriculumRuntimeProfileInput = Partial<
  Pick<
    UserLearningProfile,
    | "activeVocabularyBandId"
    | "activePhraseBandId"
    | "activeGrammarBandId"
    | "unlockedBandIds"
  >
>;

export type CurriculumGateUnitType = LearningUnitType | "sentence";

export type CurriculumEligibilitySkipReason =
  | "unknown-active-band"
  | "unit-type-outside-active-band"
  | "outside-active-band-items"
  | "below-active-band-difficulty"
  | "above-active-band-difficulty";

export type CurriculumEligibilityInput = {
  unitType: CurriculumGateUnitType;
  score?: number | null;
  itemId?: string | null;
  bandId?: string | null;
  profile?: CurriculumRuntimeProfileInput | null;
};

export type CurriculumEligibilityDecision = {
  eligible: boolean;
  configId: string;
  activeBand: CurriculumBand | null;
  activeBandId: string | null;
  skipReason: CurriculumEligibilitySkipReason | null;
};

const DEFAULT_MINIMUM_EVIDENCE_BEARING_ITEMS = 4;
const DEFAULT_MINIMUM_DISTINCT_CONTEXT_ITEMS = 3;
const DEFAULT_MINIMUM_DISTINCT_CONTEXT_ITEM_RATIO = 0.75;
const DEFAULT_MINIMUM_UNASSISTED_ITEMS = 2;
const DEFAULT_MINIMUM_UNASSISTED_ITEM_RATIO = 0.5;
const MINIMUM_DISTINCT_CONTEXT_COUNT_FOR_PROGRESSION = 2;
const MINIMUM_CONSECUTIVE_UNASSISTED_COUNT_FOR_PROGRESSION = 2;

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
    createDefaultBand("level-5b", "Level 5B", 13, "mixed", 0.66, 1, false)
  ],
  defaultTransitionPolicy: {
    stableStatuses: ["reviewing", "mastered"],
    minimumStableItemRatio: 0.72,
    minimumQualifiedExposures: 2,
    maximumRecentLapseRate: 0.18,
    minimumEvidenceBearingItems: DEFAULT_MINIMUM_EVIDENCE_BEARING_ITEMS,
    minimumDistinctContextItems: DEFAULT_MINIMUM_DISTINCT_CONTEXT_ITEMS,
    minimumDistinctContextItemRatio: DEFAULT_MINIMUM_DISTINCT_CONTEXT_ITEM_RATIO,
    minimumUnassistedItems: DEFAULT_MINIMUM_UNASSISTED_ITEMS,
    minimumUnassistedItemRatio: DEFAULT_MINIMUM_UNASSISTED_ITEM_RATIO,
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
  const nextBand = bandIndex >= 0 ? orderedBands[bandIndex + 1] ?? null : null;
  if (!band) {
    return {
      eligible: false,
      band: null,
      nextBand: null,
      unmetRequirements: ["unknown-band"]
    };
  }

  const policy = resolveTransitionPolicy(config, band);
  const evidenceBearingItems = selectCurriculumTransitionEvidenceItems(
    band.bandId,
    input.items
  );
  const stableItems = evidenceBearingItems.filter((item) =>
    policy.stableStatuses.includes(item.status)
  );
  const stableRatio =
    evidenceBearingItems.length > 0
      ? stableItems.length / evidenceBearingItems.length
      : 0;
  const minimumExposureMet = evidenceBearingItems.every(
    (item) => item.qualifiedExposureCount >= policy.minimumQualifiedExposures
  );
  const distinctContextReadyItems = evidenceBearingItems.filter(
    hasEnoughDistinctContextForProgression
  );
  const unassistedReadyItems = evidenceBearingItems.filter(
    hasEnoughUnassistedEvidenceForProgression
  );
  const requiredDistinctContextItems = resolveRequiredItemCount({
    totalItems: evidenceBearingItems.length,
    minimumItems: policy.minimumDistinctContextItems,
    minimumRatio: policy.minimumDistinctContextItemRatio
  });
  const requiredUnassistedItems = resolveRequiredItemCount({
    totalItems: evidenceBearingItems.length,
    minimumItems: policy.minimumUnassistedItems,
    minimumRatio: policy.minimumUnassistedItemRatio
  });
  const unmetRequirements: string[] = [];

  if (stableRatio < policy.minimumStableItemRatio) {
    unmetRequirements.push("stable-item-ratio");
  }

  if (!minimumExposureMet) {
    unmetRequirements.push("qualified-exposures");
  }

  if (evidenceBearingItems.length < policy.minimumEvidenceBearingItems) {
    unmetRequirements.push("evidence-breadth");
  }

  if (distinctContextReadyItems.length < requiredDistinctContextItems) {
    unmetRequirements.push("distinct-context-breadth");
  }

  if (unassistedReadyItems.length < requiredUnassistedItems) {
    unmetRequirements.push("unassisted-breadth");
  }

  if (input.recentLapseRate > policy.maximumRecentLapseRate) {
    unmetRequirements.push("recent-lapse-rate");
  }

  if (nextBand && policy.checkpointRequired && !input.checkpointPassed) {
    unmetRequirements.push("checkpoint");
  }

  return {
    eligible: unmetRequirements.length === 0,
    band,
    nextBand,
    unmetRequirements
  };
}

export function selectCurriculumTransitionEvidenceItems(
  bandId: string,
  items: readonly LearningItem[]
): LearningItem[] {
  return items.filter(
    (item) =>
      item.bandId === bandId &&
      !item.suspended &&
      item.status !== "suspended" &&
      item.consecutiveUnassistedCount > 0
  );
}

export function resolveActiveCurriculumBand(
  configInput: Partial<CurriculumConfig> | null | undefined,
  unitType: CurriculumGateUnitType,
  profile?: CurriculumRuntimeProfileInput | null
): CurriculumBand | null {
  const config = resolveCurriculumConfig(configInput);
  const activeBandId = readActiveBandId(unitType, profile);
  const orderedBands = [...config.bands].sort((left, right) => left.order - right.order);

  if (activeBandId) {
    return orderedBands.find((band) => band.bandId === activeBandId) ?? null;
  }

  return (
    orderedBands.find((band) => bandMatchesUnitType(band, unitType)) ??
    orderedBands[0] ??
    null
  );
}

export function evaluateCurriculumEligibility(
  configInput: Partial<CurriculumConfig> | null | undefined,
  input: CurriculumEligibilityInput
): CurriculumEligibilityDecision {
  const config = resolveCurriculumConfig(configInput);
  const activeBand = resolveActiveCurriculumBand(
    config,
    input.unitType,
    input.profile
  );

  if (!activeBand) {
    return createEligibilityDecision(config.configId, null, "unknown-active-band");
  }

  if (!bandMatchesUnitType(activeBand, input.unitType)) {
    return createEligibilityDecision(
      config.configId,
      activeBand,
      "unit-type-outside-active-band"
    );
  }

  if (input.bandId && input.bandId !== activeBand.bandId) {
    return createEligibilityDecision(
      config.configId,
      activeBand,
      "outside-active-band-items"
    );
  }

  if (
    input.itemId &&
    activeBand.itemIds.length > 0 &&
    !activeBand.itemIds.includes(input.itemId)
  ) {
    return createEligibilityDecision(
      config.configId,
      activeBand,
      "outside-active-band-items"
    );
  }

  if (typeof input.score === "number" && Number.isFinite(input.score)) {
    if (input.score < activeBand.difficultyLimits.minimumScore) {
      if (input.unitType !== "word") {
        return createEligibilityDecision(
          config.configId,
          activeBand,
          "below-active-band-difficulty"
        );
      }
    }

    if (input.score > activeBand.difficultyLimits.maximumScore) {
      return createEligibilityDecision(
        config.configId,
        activeBand,
        "above-active-band-difficulty"
      );
    }
  }

  return createEligibilityDecision(config.configId, activeBand, null);
}

function resolveTransitionPolicy(
  config: CurriculumConfig,
  band: CurriculumBand
): ResolvedCurriculumTransitionPolicy {
  return {
    ...config.defaultTransitionPolicy,
    minimumStableItemRatio: band.unlockRequirements.stableItemRatio,
    minimumQualifiedExposures: band.unlockRequirements.minimumQualifiedExposures,
    maximumRecentLapseRate: band.unlockRequirements.maximumRecentLapseRate,
    minimumEvidenceBearingItems:
      band.unlockRequirements.minimumEvidenceBearingItems ??
      config.defaultTransitionPolicy.minimumEvidenceBearingItems ??
      DEFAULT_MINIMUM_EVIDENCE_BEARING_ITEMS,
    minimumDistinctContextItems:
      band.unlockRequirements.minimumDistinctContextItems ??
      config.defaultTransitionPolicy.minimumDistinctContextItems ??
      DEFAULT_MINIMUM_DISTINCT_CONTEXT_ITEMS,
    minimumDistinctContextItemRatio:
      band.unlockRequirements.minimumDistinctContextItemRatio ??
      config.defaultTransitionPolicy.minimumDistinctContextItemRatio ??
      DEFAULT_MINIMUM_DISTINCT_CONTEXT_ITEM_RATIO,
    minimumUnassistedItems:
      band.unlockRequirements.minimumUnassistedItems ??
      config.defaultTransitionPolicy.minimumUnassistedItems ??
      DEFAULT_MINIMUM_UNASSISTED_ITEMS,
    minimumUnassistedItemRatio:
      band.unlockRequirements.minimumUnassistedItemRatio ??
      config.defaultTransitionPolicy.minimumUnassistedItemRatio ??
      DEFAULT_MINIMUM_UNASSISTED_ITEM_RATIO,
    checkpointRequired: band.unlockRequirements.checkpointRequired
  };
}

function readActiveBandId(
  unitType: CurriculumGateUnitType,
  profile?: CurriculumRuntimeProfileInput | null
): string | undefined {
  if (!profile) {
    return undefined;
  }

  if (unitType === "phrase") {
    return profile.activePhraseBandId;
  }

  if (unitType === "grammar-feature") {
    return profile.activeGrammarBandId;
  }

  return profile.activeVocabularyBandId;
}

function bandMatchesUnitType(
  band: CurriculumBand,
  unitType: CurriculumGateUnitType
): boolean {
  if (unitType === "sentence") {
    return band.unitType === "mixed";
  }

  return band.unitType === "mixed" || band.unitType === unitType;
}

function createEligibilityDecision(
  configId: string,
  activeBand: CurriculumBand | null,
  skipReason: CurriculumEligibilitySkipReason | null
): CurriculumEligibilityDecision {
  return {
    eligible: !skipReason,
    configId,
    activeBand,
    activeBandId: activeBand?.bandId ?? null,
    skipReason
  };
}

function hasEnoughDistinctContextForProgression(item: LearningItem): boolean {
  return item.distinctContextCount >= MINIMUM_DISTINCT_CONTEXT_COUNT_FOR_PROGRESSION;
}

function hasEnoughUnassistedEvidenceForProgression(item: LearningItem): boolean {
  return (
    item.consecutiveUnassistedCount >=
    MINIMUM_CONSECUTIVE_UNASSISTED_COUNT_FOR_PROGRESSION
  );
}

function resolveRequiredItemCount(input: {
  totalItems: number;
  minimumItems: number;
  minimumRatio: number;
}): number {
  const ratioCount = Math.ceil(input.totalItems * input.minimumRatio);
  return Math.max(input.minimumItems, ratioCount);
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
      minimumEvidenceBearingItems: DEFAULT_MINIMUM_EVIDENCE_BEARING_ITEMS,
      minimumDistinctContextItems: DEFAULT_MINIMUM_DISTINCT_CONTEXT_ITEMS,
      minimumDistinctContextItemRatio: DEFAULT_MINIMUM_DISTINCT_CONTEXT_ITEM_RATIO,
      minimumUnassistedItems: DEFAULT_MINIMUM_UNASSISTED_ITEMS,
      minimumUnassistedItemRatio: DEFAULT_MINIMUM_UNASSISTED_ITEM_RATIO,
      checkpointRequired
    },
    difficultyLimits: {
      minimumScore,
      maximumScore
    }
  };
}
