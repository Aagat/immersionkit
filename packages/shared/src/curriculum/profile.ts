import type { CurriculumRuntimeProfileInput } from "./config";

type StorageRecord = Record<string, unknown>;

export function parseCurriculumRuntimeProfile(
  input: unknown
): CurriculumRuntimeProfileInput {
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

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function isRecord(value: unknown): value is StorageRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
