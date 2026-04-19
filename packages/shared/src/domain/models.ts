export const SUPPORTED_SOURCE_LANGUAGES = ["en"] as const;
export const SUPPORTED_TARGET_LANGUAGES = ["es"] as const;
export const SUPPORTED_POS_VALUES = [
  "noun",
  "adjective",
  "adverb",
  "other"
] as const;
export const SAFE_INJECTION_POS_VALUES = ["noun", "adjective", "adverb"] as const;
export const VOCAB_STATUS_VALUES = [
  "new",
  "learning",
  "known",
  "ignored"
] as const;
export const PROVIDER_VALUES = ["openai", "none"] as const;

export type SupportedSourceLanguage = (typeof SUPPORTED_SOURCE_LANGUAGES)[number];
export type SupportedTargetLanguage = (typeof SUPPORTED_TARGET_LANGUAGES)[number];
export type SupportedPos = (typeof SUPPORTED_POS_VALUES)[number];
export type SafeInjectionPos = (typeof SAFE_INJECTION_POS_VALUES)[number];
export type VocabStatus = (typeof VOCAB_STATUS_VALUES)[number];
export type ProviderName = (typeof PROVIDER_VALUES)[number];
export type IsoTimestamp = string;

export type SeedLexiconEntry = {
  lemmaId: string;
  sourceLemma: string;
  targetLemma: string;
  pos: SupportedPos;
  frequencyRank: number | null;
  confidence: number;
  exampleSentenceEnglish?: string;
  exampleSentenceNative?: string;
  inflections?: string[];
  sourceLanguage?: SupportedSourceLanguage;
  targetLanguage?: SupportedTargetLanguage;
  sourceDataset?: string;
};

export type SeedLexiconAsset = {
  version: string;
  sourceLanguage: SupportedSourceLanguage;
  targetLanguage: SupportedTargetLanguage;
  createdAt: IsoTimestamp;
  entries: SeedLexiconEntry[];
};

export type UserVocabEntry = {
  lemmaId: string;
  status: VocabStatus;
  lastSeenAt: IsoTimestamp | null;
  exposureCount: number;
  updatedAt: IsoTimestamp;
  createdAt?: IsoTimestamp;
};

export type SentenceCacheEntry = {
  sentenceHash: string;
  sourceText: string;
  translatedText: string;
  grammarNote: string;
  targetLanguage: SupportedTargetLanguage;
  model: string;
  promptVersion: string;
  createdAt: IsoTimestamp;
  sourceLanguage?: SupportedSourceLanguage;
  provider?: ProviderName;
  lastAccessedAt?: IsoTimestamp;
};

export type SiteSetting = {
  hostname: string;
  enabled: boolean;
  discoveryRate: number | null;
  sentenceTranslationEnabled?: boolean | null;
  updatedAt: IsoTimestamp;
};

export type ExtensionSettings = {
  discoveryRate: number;
  targetLanguage: SupportedTargetLanguage;
  sentenceTranslationEnabled: boolean;
  provider: ProviderName;
  enabled?: boolean;
  sourceLanguage?: SupportedSourceLanguage;
  goldilocksThreshold?: number;
  sentenceBatchSize?: number;
};

export type ResolvedExtensionSettings = Omit<
  ExtensionSettings,
  "enabled" | "sourceLanguage" | "goldilocksThreshold" | "sentenceBatchSize"
> & {
  enabled: boolean;
  sourceLanguage: SupportedSourceLanguage;
  goldilocksThreshold: number;
  sentenceBatchSize: number;
};

export const DEFAULT_EXTENSION_SETTINGS: ResolvedExtensionSettings = {
  enabled: true,
  discoveryRate: 0.15,
  targetLanguage: "es",
  sourceLanguage: "en",
  sentenceTranslationEnabled: false,
  provider: "none",
  goldilocksThreshold: 0.6,
  sentenceBatchSize: 3
};

export function clampUnitInterval(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, value));
}

export function clampSentenceBatchSize(
  value: number | undefined,
  fallback = DEFAULT_EXTENSION_SETTINGS.sentenceBatchSize
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(5, Math.max(1, Math.round(value)));
}

export function resolveExtensionSettings(
  settings: Partial<ExtensionSettings> | null | undefined
): ResolvedExtensionSettings {
  const draft = settings ?? {};

  return {
    enabled: draft.enabled ?? DEFAULT_EXTENSION_SETTINGS.enabled,
    discoveryRate: clampUnitInterval(
      draft.discoveryRate,
      DEFAULT_EXTENSION_SETTINGS.discoveryRate
    ),
    targetLanguage: draft.targetLanguage ?? DEFAULT_EXTENSION_SETTINGS.targetLanguage,
    sourceLanguage: draft.sourceLanguage ?? DEFAULT_EXTENSION_SETTINGS.sourceLanguage,
    sentenceTranslationEnabled:
      draft.sentenceTranslationEnabled ??
      DEFAULT_EXTENSION_SETTINGS.sentenceTranslationEnabled,
    provider: draft.provider ?? DEFAULT_EXTENSION_SETTINGS.provider,
    goldilocksThreshold: clampUnitInterval(
      draft.goldilocksThreshold,
      DEFAULT_EXTENSION_SETTINGS.goldilocksThreshold
    ),
    sentenceBatchSize: clampSentenceBatchSize(draft.sentenceBatchSize)
  };
}
