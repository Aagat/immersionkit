import type { LearningItem } from "../domain/models";
import {
  evaluateCurriculumBandTransition,
  resolveActiveCurriculumBand,
  resolveCurriculumConfig,
  selectCurriculumTransitionEvidenceItems,
  type CurriculumConfig,
  type CurriculumLevel,
  type CurriculumRuntimeProfileInput
} from "./config";

export type CheckpointContentCategory =
  | "word-meaning"
  | "phrase-meaning"
  | "cloze-in-context"
  | "sentence-comprehension"
  | "grammar-discrimination";

export type CheckpointBlueprint = {
  levelId: string;
  validates: readonly string[];
  unlocksLevelId: string | null;
  itemMix: readonly {
    category: CheckpointContentCategory;
    minimumCount: number;
    maximumCount: number;
  }[];
  openEndedTypingRequired: boolean;
};

export type CheckpointEligibilitySummary = {
  activeBandId: string | null;
  activeBandLabel: string | null;
  nextBandId: string | null;
  nextBandLabel: string | null;
  checkpointBlueprint: CheckpointBlueprint | null;
  checkpointScopeLabels: readonly string[];
  checkpointRequired: boolean;
  checkpointIsOnlyBlocker: boolean;
  unmetRequirements: string[];
};

export const DEFAULT_CHECKPOINT_BLUEPRINTS: readonly CheckpointBlueprint[] = [
  checkpointBlueprint("level-1", "level-2", [
    "concrete nouns, adjectives, and adverbs",
    "Level 1 cognate patterns",
    "Level 1 fixed phrases",
    "articles and gender recognition",
    "simple negation and question words",
    "short sentence comprehension"
  ]),
  checkpointBlueprint("level-2", "level-3", [
    "routine and event vocabulary",
    "comparison and quantity phrases",
    "can, going to, have to, and should",
    "simple past and future recognition",
    "event-based sentence comprehension"
  ]),
  checkpointBlueprint("level-3", "level-4", [
    "narrative vocabulary",
    "cause, time, and purpose phrases",
    "used to, because, when, and para + infinitive",
    "progressive recognition",
    "short article or story comprehension"
  ]),
  checkpointBlueprint("level-4", "level-5", [
    "abstract explanation, opinion, and evidence terms",
    "discourse chunks",
    "present perfect, passive recognition, conditionals, and concession",
    "medium-length explanation or argument comprehension"
  ])
] as const;

export function listCheckpointBlueprints(): readonly CheckpointBlueprint[] {
  return DEFAULT_CHECKPOINT_BLUEPRINTS;
}

export function getCheckpointBlueprintForLevel(
  levelId: string | null | undefined
): CheckpointBlueprint | null {
  return levelId
    ? DEFAULT_CHECKPOINT_BLUEPRINTS.find((blueprint) => blueprint.levelId === levelId) ??
        null
    : null;
}

export function summarizeCheckpointEligibility(input: {
  config?: Partial<CurriculumConfig> | null;
  profile?: CurriculumRuntimeProfileInput | null;
  items: readonly LearningItem[];
  now?: string;
}): CheckpointEligibilitySummary {
  const config = resolveCurriculumConfig(input.config);
  const activeBand = resolveActiveCurriculumBand(config, "word", input.profile);
  if (!activeBand) {
    return {
      activeBandId: null,
      activeBandLabel: null,
      nextBandId: null,
      nextBandLabel: null,
      checkpointBlueprint: null,
      checkpointScopeLabels: [],
      checkpointRequired: false,
      checkpointIsOnlyBlocker: false,
      unmetRequirements: ["unknown-active-band"]
    };
  }

  const evidenceItems = selectCurriculumTransitionEvidenceItems(
    activeBand.bandId,
    input.items
  );
  const recentLapseRate = estimateRecentLearningItemLapseRate(
    evidenceItems,
    input.now ?? new Date().toISOString()
  );
  const blockedDecision = evaluateCurriculumBandTransition(config, {
    bandId: activeBand.bandId,
    items: input.items,
    recentLapseRate,
    checkpointPassed: false
  });
  const afterCheckpointDecision = evaluateCurriculumBandTransition(config, {
    bandId: activeBand.bandId,
    items: input.items,
    recentLapseRate,
    checkpointPassed: true
  });
  const level = findLevelForBand(config.levels, activeBand.bandId);
  const checkpointBlueprint = getCheckpointBlueprintForLevel(level?.levelId);

  return {
    activeBandId: activeBand.bandId,
    activeBandLabel: activeBand.label,
    nextBandId: blockedDecision.nextBand?.bandId ?? null,
    nextBandLabel: blockedDecision.nextBand?.label ?? null,
    checkpointBlueprint,
    checkpointScopeLabels: checkpointBlueprint?.validates ?? [],
    checkpointRequired: activeBand.unlockRequirements.checkpointRequired,
    checkpointIsOnlyBlocker:
      blockedDecision.unmetRequirements.includes("checkpoint") &&
      afterCheckpointDecision.eligible &&
      Boolean(afterCheckpointDecision.nextBand),
    unmetRequirements: blockedDecision.unmetRequirements
  };
}

function checkpointBlueprint(
  levelId: string,
  unlocksLevelId: string,
  validates: readonly string[]
): CheckpointBlueprint {
  return {
    levelId,
    unlocksLevelId,
    validates,
    itemMix: [
      { category: "word-meaning", minimumCount: 4, maximumCount: 5 },
      { category: "phrase-meaning", minimumCount: 3, maximumCount: 4 },
      { category: "cloze-in-context", minimumCount: 5, maximumCount: 7 },
      { category: "sentence-comprehension", minimumCount: 2, maximumCount: 3 },
      { category: "grammar-discrimination", minimumCount: 1, maximumCount: 2 }
    ],
    openEndedTypingRequired: false
  };
}

function findLevelForBand(
  levels: readonly CurriculumLevel[],
  bandId: string
): CurriculumLevel | null {
  return levels.find((level) => level.bandIds.includes(bandId)) ?? null;
}

export function estimateRecentLearningItemLapseRate(
  items: readonly LearningItem[],
  now: string = new Date().toISOString()
): number {
  const nowMs = Date.parse(now);
  const recentItems = items.filter((item) => {
    const introducedAt = Date.parse(item.introducedAt);
    return (
      Number.isFinite(nowMs) &&
      Number.isFinite(introducedAt) &&
      nowMs - introducedAt <= 14 * 24 * 60 * 60 * 1000
    );
  });
  const evaluatedItems = recentItems.length > 0 ? recentItems : items;
  if (evaluatedItems.length === 0) {
    return 0;
  }

  return evaluatedItems.filter((item) => item.lapses > 0).length / evaluatedItems.length;
}
