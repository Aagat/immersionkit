import {
  DEFAULT_CURRICULUM_CONFIG,
  parseCurriculumRuntimeProfile,
  type CurriculumRuntimeProfileInput
} from "@immersionkit/shared";

export type ProficiencySeed = "beginner" | "false-beginner" | "intermediate";
export type LegacyProficiencySeed = ProficiencySeed | "advanced";

const DEFAULT_PROFICIENCY_SEED: ProficiencySeed = "false-beginner";

export const PROFICIENCY_SEED_OPTIONS: readonly {
  id: ProficiencySeed;
  label: string;
  description: string;
}[] = [
  {
    id: "beginner",
    label: "Beginner",
    description: "Start with the safest foundation words and phrases."
  },
  {
    id: "false-beginner",
    label: "False beginner",
    description: "Start after the first foundation band with familiar basics."
  },
  {
    id: "intermediate",
    label: "Intermediate",
    description: "Start with everyday patterns and routine reading."
  }
] as const;

export const CURRICULUM_BAND_OPTIONS = [...DEFAULT_CURRICULUM_CONFIG.bands]
  .sort((left, right) => left.order - right.order)
  .map((band) => ({
    id: band.bandId,
    label: band.label
  }));

const PROFICIENCY_SEED_SET: ReadonlySet<ProficiencySeed> = new Set(
  PROFICIENCY_SEED_OPTIONS.map((option) => option.id)
);

export function parseProficiencySeed(value: unknown): ProficiencySeed {
  if (value === "advanced") {
    return "intermediate";
  }

  if (typeof value !== "string") {
    return DEFAULT_PROFICIENCY_SEED;
  }

  return PROFICIENCY_SEED_SET.has(value as ProficiencySeed)
    ? (value as ProficiencySeed)
    : DEFAULT_PROFICIENCY_SEED;
}

export function proficiencySeedToBandId(seed: ProficiencySeed): string {
  if (seed === "beginner") {
    return "level-1a";
  }

  if (seed === "intermediate") {
    return "level-2a";
  }

  return "level-1b";
}

export function createLearningProfileForProficiencySeed(
  seed: ProficiencySeed
): CurriculumRuntimeProfileInput {
  return createLearningProfileForBand(proficiencySeedToBandId(seed));
}

export function createLearningProfileForBand(
  bandId: string
): CurriculumRuntimeProfileInput {
  const selectedBand = DEFAULT_CURRICULUM_CONFIG.bands.find(
    (band) => band.bandId === bandId
  );
  const unlockedBandIds = selectedBand
    ? DEFAULT_CURRICULUM_CONFIG.bands
        .filter((band) => band.order <= selectedBand.order)
        .sort((left, right) => left.order - right.order)
        .map((band) => band.bandId)
    : [bandId];

  return {
    activeVocabularyBandId: bandId,
    activePhraseBandId: bandId,
    activeGrammarBandId: bandId,
    unlockedBandIds
  };
}

export function resolveLearningProfileFromStorage(
  rawProfile: unknown,
  rawSeed: unknown
): CurriculumRuntimeProfileInput {
  const parsedProfile = parseCurriculumRuntimeProfile(rawProfile);
  if (hasActiveLearningProfile(parsedProfile)) {
    return parsedProfile;
  }

  return createLearningProfileForProficiencySeed(parseProficiencySeed(rawSeed));
}

function hasActiveLearningProfile(
  profile: CurriculumRuntimeProfileInput | null | undefined
): boolean {
  return Boolean(
    profile?.activeVocabularyBandId ||
      profile?.activePhraseBandId ||
      profile?.activeGrammarBandId
  );
}

export function getExactActiveBandId(
  profile: CurriculumRuntimeProfileInput | null | undefined
): string | null {
  if (!profile) {
    return null;
  }

  const activeBandId =
    profile.activeVocabularyBandId ??
    profile.activePhraseBandId ??
    profile.activeGrammarBandId ??
    null;
  if (!activeBandId) {
    return null;
  }

  if (
    (profile.activeVocabularyBandId &&
      profile.activeVocabularyBandId !== activeBandId) ||
    (profile.activePhraseBandId && profile.activePhraseBandId !== activeBandId) ||
    (profile.activeGrammarBandId && profile.activeGrammarBandId !== activeBandId)
  ) {
    return null;
  }

  return activeBandId;
}
