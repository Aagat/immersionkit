export type SupportedTargetLanguage = "es";

export type SupportedPos = "noun" | "adjective" | "adverb" | "other";

export type VocabStatus = "new" | "learning" | "known" | "ignored";

export type SeedLexiconEntry = {
  lemmaId: string;
  sourceLemma: string;
  targetLemma: string;
  pos: SupportedPos;
  frequencyRank: number | null;
  confidence: number;
  inflections?: string[];
};

export type UserVocabEntry = {
  lemmaId: string;
  status: VocabStatus;
  lastSeenAt: string | null;
  exposureCount: number;
  updatedAt: string;
};

export type SentenceCacheEntry = {
  sentenceHash: string;
  sourceText: string;
  translatedText: string;
  grammarNote: string;
  targetLanguage: SupportedTargetLanguage;
  model: string;
  promptVersion: string;
  createdAt: string;
};

export type SiteSetting = {
  hostname: string;
  enabled: boolean;
  discoveryRate: number | null;
  updatedAt: string;
};

export type ExtensionSettings = {
  discoveryRate: number;
  targetLanguage: SupportedTargetLanguage;
  sentenceTranslationEnabled: boolean;
  provider: "openai" | "none";
};

