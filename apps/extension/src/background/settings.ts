import {
  resolveCurriculumConfig,
  type ExtensionSettings,
  type CurriculumConfig,
  type CurriculumRuntimeProfileInput,
  type ResolvedExtensionSettings,
  resolveExtensionSettings
} from "@immersionkit/shared";

import { isRecord, pickFirstDefinedValue, readString } from "./storage";
import { loadUserDataValues } from "./user-data-repository";

const SETTINGS_STORAGE_KEYS = ["immersionkit.settings"] as const;
const CURRICULUM_CONFIG_STORAGE_KEYS = [
  "immersionkit.curriculum.config"
] as const;
const LEARNING_PROFILE_STORAGE_KEYS = [
  "immersionkit.learningProfile"
] as const;
const OPENAI_API_KEY_STORAGE_KEYS = [
  "immersionkit.provider.openai.apiKey"
] as const;

export type ProviderCredentials = {
  openAiApiKey: string | null;
};

export type BackgroundRuntimeConfig = {
  settings: ResolvedExtensionSettings;
  credentials: ProviderCredentials;
  curriculum: {
    config: CurriculumConfig;
    profile: CurriculumRuntimeProfileInput;
  };
};

export async function loadBackgroundRuntimeConfig(): Promise<BackgroundRuntimeConfig> {
  const storage = await loadUserDataValues([
    ...SETTINGS_STORAGE_KEYS,
    ...CURRICULUM_CONFIG_STORAGE_KEYS,
    ...LEARNING_PROFILE_STORAGE_KEYS,
    ...OPENAI_API_KEY_STORAGE_KEYS
  ]);

  const rawSettings = pickFirstDefinedValue(storage, SETTINGS_STORAGE_KEYS);
  const rawCurriculumConfig = pickFirstDefinedValue(
    storage,
    CURRICULUM_CONFIG_STORAGE_KEYS
  );
  const rawLearningProfile = pickFirstDefinedValue(
    storage,
    LEARNING_PROFILE_STORAGE_KEYS
  );
  const resolvedSettings = isRecord(rawSettings)
    ? resolveExtensionSettings(rawSettings as Partial<ExtensionSettings>)
    : resolveExtensionSettings(null);

  const openAiApiKey =
    readString(pickFirstDefinedValue(storage, OPENAI_API_KEY_STORAGE_KEYS));

  return {
    settings: resolvedSettings,
    credentials: {
      openAiApiKey
    },
    curriculum: {
      config: resolveCurriculumConfig(
        isRecord(rawCurriculumConfig)
          ? (rawCurriculumConfig as Partial<CurriculumConfig>)
          : null
      ),
      profile: parseLearningProfile(rawLearningProfile)
    }
  };
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
