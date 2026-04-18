import {
  type ExtensionSettings,
  type ResolvedExtensionSettings,
  resolveExtensionSettings
} from "@immersionkit/shared";

import { isRecord, pickFirstDefinedValue, readStorageValues, readString } from "./storage";

const SETTINGS_STORAGE_KEYS = ["immersionkit.settings", "settings"] as const;
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
};

export async function loadBackgroundRuntimeConfig(): Promise<BackgroundRuntimeConfig> {
  const storage = await readStorageValues([
    ...SETTINGS_STORAGE_KEYS,
    ...OPENAI_API_KEY_STORAGE_KEYS
  ]);

  const rawSettings = pickFirstDefinedValue(storage, SETTINGS_STORAGE_KEYS);
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

