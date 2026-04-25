import {
  resolveCurriculumConfig,
  type ExtensionSettings,
  type CurriculumConfig,
  type CurriculumRuntimeProfileInput,
  type ResolvedExtensionSettings,
  resolveExtensionSettings
} from "@immersionkit/shared";

import { isRecord, pickFirstDefinedValue, readStorageValues, readString } from "./storage";

const SETTINGS_STORAGE_KEYS = ["immersionkit.settings", "settings"] as const;
const CURRICULUM_CONFIG_STORAGE_KEYS = [
  "immersionkit.curriculum.config",
  "curriculumConfig"
] as const;
const LEARNING_PROFILE_STORAGE_KEYS = [
  "immersionkit.learningProfile",
  "learningProfile"
] as const;
const OPENAI_API_KEY_STORAGE_KEYS = [
  "immersionkit.provider.openai.apiKey",
  "immersionkit.providers.openai.apiKey",
  "immersionkit.openai.apiKey",
  "openaiApiKey",
  "providerApiKey",
  "apiKey"
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
  const storage = await readStorageValues([
    ...SETTINGS_STORAGE_KEYS,
    ...CURRICULUM_CONFIG_STORAGE_KEYS,
    ...LEARNING_PROFILE_STORAGE_KEYS,
    ...OPENAI_API_KEY_STORAGE_KEYS
  ]);

  const rawSettings = pickFirstDefinedValue(storage, SETTINGS_STORAGE_KEYS);
  const rawCurriculumConfig =
    pickFirstDefinedValue(storage, CURRICULUM_CONFIG_STORAGE_KEYS) ??
    (isRecord(rawSettings) ? rawSettings.curriculumConfig : null);
  const rawLearningProfile =
    pickFirstDefinedValue(storage, LEARNING_PROFILE_STORAGE_KEYS) ??
    (isRecord(rawSettings) ? rawSettings.learningProfile : null);
  const resolvedSettings = isRecord(rawSettings)
    ? resolveExtensionSettings(rawSettings as Partial<ExtensionSettings>)
    : resolveExtensionSettings(null);

  const openAiApiKey =
    readString(pickFirstDefinedValue(storage, OPENAI_API_KEY_STORAGE_KEYS)) ??
    readOpenAiKeyFromSettings(rawSettings);

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

function readOpenAiKeyFromSettings(rawSettings: unknown): string | null {
  if (!isRecord(rawSettings)) {
    return null;
  }

  const credentials = isRecord(rawSettings.credentials) ? rawSettings.credentials : null;
  const provider = isRecord(rawSettings.provider) ? rawSettings.provider : null;

  return (
    readString(rawSettings.openaiApiKey) ??
    readString(rawSettings.providerApiKey) ??
    readString(credentials?.openaiApiKey) ??
    readString(credentials?.providerApiKey) ??
    readString(provider?.openaiApiKey) ??
    readString(provider?.apiKey)
  );
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
