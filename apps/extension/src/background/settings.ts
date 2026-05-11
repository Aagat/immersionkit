import {
  resolveCurriculumConfig,
  type ExtensionSettings,
  type CurriculumConfig,
  type CurriculumRuntimeProfileInput,
  type ResolvedExtensionSettings,
  resolveExtensionSettings
} from "@immersionkit/shared";

import { isRecord, pickFirstDefinedValue, readString } from "../storage/serialization";
import { loadUserDataValues } from "../storage/user-data-repository";
import { USER_DATA_KEYS } from "../shared/user-data-keys";
import { resolveLearningProfileFromStorage } from "../app-state/proficiency";

const SETTINGS_STORAGE_KEYS = [USER_DATA_KEYS.settings] as const;
const CURRICULUM_CONFIG_STORAGE_KEYS = [USER_DATA_KEYS.curriculumConfig] as const;
const LEARNING_PROFILE_STORAGE_KEYS = [USER_DATA_KEYS.learningProfile] as const;
const OPENAI_API_KEY_STORAGE_KEYS = [USER_DATA_KEYS.providerOpenAiApiKey] as const;

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
      profile: resolveLearningProfileFromStorage(
        rawLearningProfile,
        isRecord(rawSettings) ? rawSettings.proficiencySeed : undefined
      )
    }
  };
}
