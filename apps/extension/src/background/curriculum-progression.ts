import {
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
  readStorageValues,
  readString,
  writeStorageValues
} from "./storage";

const LEARNING_PROFILE_STORAGE_KEYS = [
  "immersionkit.learningProfile",
  "learningProfile"
] as const;

export interface LearningProfileStore {
  load(): Promise<CurriculumRuntimeProfileInput>;
  persist(profile: CurriculumRuntimeProfileInput): Promise<void>;
}

export class ChromeLearningProfileStore implements LearningProfileStore {
  async load(): Promise<CurriculumRuntimeProfileInput> {
    const storage = await readStorageValues(LEARNING_PROFILE_STORAGE_KEYS);
    const rawProfile = pickFirstDefinedValue(storage, LEARNING_PROFILE_STORAGE_KEYS);
    return parseLearningProfile(rawProfile);
  }

  async persist(profile: CurriculumRuntimeProfileInput): Promise<void> {
    await writeStorageValues({
      "immersionkit.learningProfile": profile
    });
  }
}

export class CurriculumProgressionService {
  constructor(
    private readonly profileStore: LearningProfileStore =
      new ChromeLearningProfileStore()
  ) {}

  async advanceAfterImplicitEvidence(input: {
    config: Partial<CurriculumConfig> | null | undefined;
    profile?: CurriculumRuntimeProfileInput | null;
    items: readonly LearningItem[];
    now?: string;
  }): Promise<CurriculumRuntimeProfileInput | null> {
    const config = resolveCurriculumConfig(input.config);
    const profile = input.profile ?? (await this.profileStore.load());
    const activeBand = resolveActiveCurriculumBand(config, "word", profile);
    if (!activeBand) {
      return null;
    }

    const decision = evaluateCurriculumBandTransition(config, {
      bandId: activeBand.bandId,
      items: input.items,
      recentLapseRate: estimateRecentLapseRate(input.items, input.now),
      checkpointPassed: false
    });

    if (!decision.eligible || !decision.nextBand) {
      return null;
    }

    const nextProfile = applyActiveBand(profile, decision.nextBand.bandId);
    await this.profileStore.persist(nextProfile);
    return nextProfile;
  }
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
