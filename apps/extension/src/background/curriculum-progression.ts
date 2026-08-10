import {
  type CurriculumBand,
  type CurriculumTransitionDecision,
  evaluateCurriculumBandTransition,
  estimateRecentLearningItemLapseRate,
  parseCurriculumRuntimeProfile,
  resolveActiveCurriculumBand,
  resolveCurriculumConfig,
  selectCurriculumTransitionProgressionCohort,
  type CurriculumConfig,
  type CurriculumRuntimeProfileInput,
  type LearningItem
} from "@immersionkit/shared";

import {
  IndexedDbUserDataRepository,
  setUserDataValues,
  USER_DATA_KEYS
} from "../storage/user-data-repository";

export type LearningProfileSnapshot = {
  profile: CurriculumRuntimeProfileInput;
  revision: string | null;
};

export interface LearningProfileStore {
  load(): Promise<CurriculumRuntimeProfileInput>;
  loadSnapshot(
    fallbackProfile?: CurriculumRuntimeProfileInput | null
  ): Promise<LearningProfileSnapshot>;
  persistIfUnchanged(
    expectedSnapshot: LearningProfileSnapshot,
    profile: CurriculumRuntimeProfileInput
  ): Promise<boolean>;
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
    return (await this.loadSnapshot()).profile;
  }

  async loadSnapshot(
    fallbackProfile?: CurriculumRuntimeProfileInput | null
  ): Promise<LearningProfileSnapshot> {
    const snapshot = await new IndexedDbUserDataRepository().getValueSnapshot(
      USER_DATA_KEYS.learningProfile
    );
    return {
      profile:
        snapshot.revision === null && fallbackProfile
          ? fallbackProfile
          : parseCurriculumRuntimeProfile(snapshot.value),
      revision: snapshot.revision
    };
  }

  async persistIfUnchanged(
    expectedSnapshot: LearningProfileSnapshot,
    profile: CurriculumRuntimeProfileInput
  ): Promise<boolean> {
    return new IndexedDbUserDataRepository().setValueIfRevision(
      USER_DATA_KEYS.learningProfile,
      expectedSnapshot.revision,
      profile
    );
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
    const profileSnapshot = await this.profileStore.loadSnapshot(input.profile);
    const profile = profileSnapshot.profile;
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

    const progressionCohort = selectCurriculumTransitionProgressionCohort(
      config,
      activeBand.bandId,
      input.items
    );
    const decision = evaluateCurriculumBandTransition(config, {
      bandId: activeBand.bandId,
      items: input.items,
      recentLapseRate: estimateRecentLearningItemLapseRate(
        progressionCohort,
        decidedAt
      ),
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
    if (
      !(await this.profileStore.persistIfUnchanged(
        profileSnapshot,
        nextProfile
      ))
    ) {
      return this.createProfileChangedResult(config, decidedAt);
    }
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
    const profileSnapshot = await this.profileStore.loadSnapshot(input.profile);
    const profile = profileSnapshot.profile;
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

    const progressionCohort = selectCurriculumTransitionProgressionCohort(
      config,
      activeBand.bandId,
      input.items
    );
    const recentLapseRate = estimateRecentLearningItemLapseRate(
      progressionCohort,
      decidedAt
    );
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
    if (
      !(await this.profileStore.persistIfUnchanged(
        profileSnapshot,
        nextProfile
      ))
    ) {
      return this.createProfileChangedResult(config, decidedAt);
    }
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

  private async createProfileChangedResult(
    config: CurriculumConfig,
    decidedAt: string
  ): Promise<CurriculumProgressionResult> {
    const currentProfile = (await this.profileStore.loadSnapshot()).profile;
    const diagnostics = createProgressionDiagnostics({
      decidedAt,
      configId: config.configId,
      profile: currentProfile,
      activeBand: resolveActiveCurriculumBand(config, "word", currentProfile),
      decision: null,
      reason: "profile-changed"
    });
    await this.diagnosticsStore.persist(diagnostics);
    return { profile: null, diagnostics };
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
