import type { LearningItem } from "../domain/models";
import {
  evaluateCurriculumBandTransition,
  resolveActiveCurriculumBand,
  resolveCurriculumConfig,
  type CurriculumConfig,
  type CurriculumRuntimeProfileInput
} from "./config";

export type CheckpointEligibilitySummary = {
  activeBandId: string | null;
  activeBandLabel: string | null;
  nextBandId: string | null;
  nextBandLabel: string | null;
  checkpointRequired: boolean;
  checkpointIsOnlyBlocker: boolean;
  unmetRequirements: string[];
};

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
      checkpointRequired: false,
      checkpointIsOnlyBlocker: false,
      unmetRequirements: ["unknown-active-band"]
    };
  }

  const recentLapseRate = estimateRecentLearningItemLapseRate(
    input.items,
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

  return {
    activeBandId: activeBand.bandId,
    activeBandLabel: activeBand.label,
    nextBandId: blockedDecision.nextBand?.bandId ?? null,
    nextBandLabel: blockedDecision.nextBand?.label ?? null,
    checkpointRequired: activeBand.unlockRequirements.checkpointRequired,
    checkpointIsOnlyBlocker:
      blockedDecision.unmetRequirements.includes("checkpoint") &&
      afterCheckpointDecision.eligible &&
      Boolean(afterCheckpointDecision.nextBand),
    unmetRequirements: blockedDecision.unmetRequirements
  };
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
