import {
  type CurriculumBand,
  type CurriculumTransitionDecision,
  evaluateCurriculumBandTransition,
  resolveActiveCurriculumBand,
  resolveCurriculumConfig,
  type CurriculumConfig,
  type CurriculumRuntimeProfileInput,
  type LearningItem
} from "@immersionkit/shared";

import {
  isRecord,
  pickFirstDefinedValue,
  readString
} from "./storage";
import {
  loadUserDataValues,
  setUserDataValues,
  USER_DATA_KEYS
} from "./user-data-repository";

const LEARNING_PROFILE_STORAGE_KEYS = [
  "immersionkit.learningProfile"
] as const;

export interface LearningProfileStore {
  load(): Promise<CurriculumRuntimeProfileInput>;
  persist(profile: CurriculumRuntimeProfileInput): Promise<void>;
}

export type CurriculumProgressionDecisionDiagnostics = {
  decidedAt: string;
  configId: string;
  previousBandId: string | null;
  nextBandId: string | null;
  eligible: boolean;
  reason: string;
  unmetRequirements: string[];
  checkpointBoundary: boolean;
  activeVocabularyBandId: string | null;
  activePhraseBandId: string | null;
  activeGrammarBandId: string | null;
  unlockedBandIds: string[];
};

export type CurriculumProgressionResult = {
  profile: CurriculumRuntimeProfileInput | null;
  diagnostics: CurriculumProgressionDecisionDiagnostics;
};

export class ChromeLearningProfileStore implements LearningProfileStore {
  async load(): Promise<CurriculumRuntimeProfileInput> {
    const storage = await loadUserDataValues(LEARNING_PROFILE_STORAGE_KEYS);
    const rawProfile = pickFirstDefinedValue(storage, LEARNING_PROFILE_STORAGE_KEYS);
    return parseLearningProfile(rawProfile);
  }

  async persist(profile: CurriculumRuntimeProfileInput): Promise<void> {
    await setUserDataValues({
      [USER_DATA_KEYS.learningProfile]: profile
    });
  }
}

export interface CurriculumProgressionDiagnosticsStore {
  persist(diagnostics: CurriculumProgressionDecisionDiagnostics): Promise<void>;
}

export class ChromeCurriculumProgressionDiagnosticsStore
  implements CurriculumProgressionDiagnosticsStore
{
  async persist(diagnostics: CurriculumProgressionDecisionDiagnostics): Promise<void> {
    await setUserDataValues({
      [USER_DATA_KEYS.curriculumProgressionDiagnostics]: diagnostics
    });
  }
}

export class CurriculumProgressionService {
  constructor(
    private readonly profileStore: LearningProfileStore =
      new ChromeLearningProfileStore(),
    private readonly diagnosticsStore: CurriculumProgressionDiagnosticsStore =
      new ChromeCurriculumProgressionDiagnosticsStore()
  ) {}

  async advanceAfterImplicitEvidence(input: {
    config: Partial<CurriculumConfig> | null | undefined;
    profile?: CurriculumRuntimeProfileInput | null;
    items: readonly LearningItem[];
    now?: string;
  }): Promise<CurriculumProgressionResult> {
    const config = resolveCurriculumConfig(input.config);
    const profile = input.profile ?? (await this.profileStore.load());
    const decidedAt = input.now ?? new Date().toISOString();
    const activeBand = resolveActiveCurriculumBand(config, "word", profile);
    if (!activeBand) {
      const diagnostics = createProgressionDiagnostics({
        decidedAt,
        configId: config.configId,
        profile,
        activeBand: null,
        decision: null,
        reason: "unknown-active-band"
      });
      await this.diagnosticsStore.persist(diagnostics);
      return { profile: null, diagnostics };
    }

    const decision = evaluateCurriculumBandTransition(config, {
      bandId: activeBand.bandId,
      items: input.items,
      recentLapseRate: estimateRecentLapseRate(input.items, decidedAt),
      checkpointPassed: false
    });

    if (!decision.eligible || !decision.nextBand) {
      const diagnostics = createProgressionDiagnostics({
        decidedAt,
        configId: config.configId,
        profile,
        activeBand,
        decision,
        reason: decision.unmetRequirements.includes("checkpoint")
          ? "checkpoint-required"
          : decision.nextBand
            ? "requirements-unmet"
            : "no-next-band"
      });
      await this.diagnosticsStore.persist(diagnostics);
      return { profile: null, diagnostics };
    }

    const nextProfile = applyActiveBand(profile, decision.nextBand.bandId);
    await this.profileStore.persist(nextProfile);
    const diagnostics = createProgressionDiagnostics({
      decidedAt,
      configId: config.configId,
      profile: nextProfile,
      activeBand,
      decision,
      reason: "advanced"
    });
    await this.diagnosticsStore.persist(diagnostics);
    return { profile: nextProfile, diagnostics };
  }

  async advanceAfterExplicitCheckpoint(input: {
    config: Partial<CurriculumConfig> | null | undefined;
    profile?: CurriculumRuntimeProfileInput | null;
    items: readonly LearningItem[];
    now?: string;
  }): Promise<CurriculumProgressionResult> {
    const config = resolveCurriculumConfig(input.config);
    const profile = input.profile ?? (await this.profileStore.load());
    const decidedAt = input.now ?? new Date().toISOString();
    const activeBand = resolveActiveCurriculumBand(config, "word", profile);
    if (!activeBand) {
      const diagnostics = createProgressionDiagnostics({
        decidedAt,
        configId: config.configId,
        profile,
        activeBand: null,
        decision: null,
        reason: "unknown-active-band"
      });
      await this.diagnosticsStore.persist(diagnostics);
      return { profile: null, diagnostics };
    }

    const recentLapseRate = estimateRecentLapseRate(input.items, decidedAt);
    const blockedDecision = evaluateCurriculumBandTransition(config, {
      bandId: activeBand.bandId,
      items: input.items,
      recentLapseRate,
      checkpointPassed: false
    });
    const checkpointDecision = evaluateCurriculumBandTransition(config, {
      bandId: activeBand.bandId,
      items: input.items,
      recentLapseRate,
      checkpointPassed: true
    });
    const checkpointIsOnlyBlocker =
      blockedDecision.unmetRequirements.length === 1 &&
      blockedDecision.unmetRequirements[0] === "checkpoint" &&
      checkpointDecision.eligible &&
      Boolean(checkpointDecision.nextBand);

    if (!checkpointIsOnlyBlocker || !checkpointDecision.nextBand) {
      const diagnostics = createProgressionDiagnostics({
        decidedAt,
        configId: config.configId,
        profile,
        activeBand,
        decision: blockedDecision,
        reason: blockedDecision.unmetRequirements.includes("checkpoint")
          ? "checkpoint-requirements-unmet"
          : blockedDecision.nextBand
            ? "no-checkpoint-boundary"
            : "no-next-band"
      });
      await this.diagnosticsStore.persist(diagnostics);
      return { profile: null, diagnostics };
    }

    const nextProfile = applyActiveBand(
      profile,
      checkpointDecision.nextBand.bandId
    );
    await this.profileStore.persist(nextProfile);
    const diagnostics = createProgressionDiagnostics({
      decidedAt,
      configId: config.configId,
      profile: nextProfile,
      activeBand,
      decision: checkpointDecision,
      reason: "checkpoint-advanced"
    });
    await this.diagnosticsStore.persist(diagnostics);
    return { profile: nextProfile, diagnostics };
  }
}

function createProgressionDiagnostics(input: {
  decidedAt: string;
  configId: string;
  profile: CurriculumRuntimeProfileInput;
  activeBand: CurriculumBand | null;
  decision: CurriculumTransitionDecision | null;
  reason: string;
}): CurriculumProgressionDecisionDiagnostics {
  return {
    decidedAt: input.decidedAt,
    configId: input.configId,
    previousBandId: input.activeBand?.bandId ?? null,
    nextBandId: input.decision?.nextBand?.bandId ?? null,
    eligible: Boolean(input.decision?.eligible && input.decision.nextBand),
    reason: input.reason,
    unmetRequirements: input.decision?.unmetRequirements ?? [],
    checkpointBoundary:
      input.decision?.unmetRequirements.includes("checkpoint") ??
      Boolean(input.activeBand?.unlockRequirements.checkpointRequired),
    activeVocabularyBandId: input.profile.activeVocabularyBandId ?? null,
    activePhraseBandId: input.profile.activePhraseBandId ?? null,
    activeGrammarBandId: input.profile.activeGrammarBandId ?? null,
    unlockedBandIds: [...(input.profile.unlockedBandIds ?? [])]
  };
}

function applyActiveBand(
  profile: CurriculumRuntimeProfileInput,
  bandId: string
): CurriculumRuntimeProfileInput {
  return {
    ...profile,
    activeVocabularyBandId: bandId,
    activePhraseBandId: bandId,
    activeGrammarBandId: bandId,
    unlockedBandIds: [...new Set([...(profile.unlockedBandIds ?? []), bandId])]
  };
}

function estimateRecentLapseRate(
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
  const denominator = recentItems.length > 0 ? recentItems.length : items.length;
  if (denominator === 0) {
    return 0;
  }

  const lapses = (recentItems.length > 0 ? recentItems : items).filter(
    (item) => item.lapses > 0
  ).length;
  return lapses / denominator;
}

function parseLearningProfile(input: unknown): CurriculumRuntimeProfileInput {
  if (!isRecord(input)) {
    return {};
  }

  const activeVocabularyBandId = readString(input.activeVocabularyBandId);
  const activePhraseBandId = readString(input.activePhraseBandId);
  const activeGrammarBandId = readString(input.activeGrammarBandId);
  const unlockedBandIds = Array.isArray(input.unlockedBandIds)
    ? input.unlockedBandIds.flatMap((value): string[] => {
        const bandId = readString(value);
        return bandId ? [bandId] : [];
      })
    : undefined;

  return {
    ...(activeVocabularyBandId ? { activeVocabularyBandId } : {}),
    ...(activePhraseBandId ? { activePhraseBandId } : {}),
    ...(activeGrammarBandId ? { activeGrammarBandId } : {}),
    ...(unlockedBandIds ? { unlockedBandIds } : {})
  };
}
