import {
  type CurriculumBand,
  type CurriculumTransitionDecision,
  evaluateCurriculumBandTransition,
  estimateRecentLearningItemLapseRate,
  parseCurriculumRuntimeProfile,
  resolveActiveCurriculumBand,
  resolveCurriculumConfig,
  type CurriculumConfig,
  type CurriculumRuntimeProfileInput,
  type LearningItem
} from "@immersionkit/shared";

import { pickFirstDefinedValue } from "../storage/serialization";
import {
  loadUserDataValues,
  setUserDataValues,
  USER_DATA_KEYS
} from "../storage/user-data-repository";

const LEARNING_PROFILE_STORAGE_KEYS = [USER_DATA_KEYS.learningProfile] as const;

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

class ChromeLearningProfileStore implements LearningProfileStore {
  async load(): Promise<CurriculumRuntimeProfileInput> {
    const storage = await loadUserDataValues(LEARNING_PROFILE_STORAGE_KEYS);
    const rawProfile = pickFirstDefinedValue(storage, LEARNING_PROFILE_STORAGE_KEYS);
    return parseCurriculumRuntimeProfile(rawProfile);
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

class ChromeCurriculumProgressionDiagnosticsStore
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
      recentLapseRate: estimateRecentLearningItemLapseRate(input.items, decidedAt),
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

    const recentLapseRate = estimateRecentLearningItemLapseRate(input.items, decidedAt);
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
