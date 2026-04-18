import type {
  ExtensionSettings,
  SentenceCacheEntry,
  SiteSetting,
  UserVocabEntry
} from "../domain/models";

export interface SettingsRepository {
  getSettings(): Promise<ExtensionSettings>;
  saveSettings(settings: ExtensionSettings): Promise<void>;
}

export interface SiteSettingsRepository {
  getSiteSetting(hostname: string): Promise<SiteSetting | null>;
  saveSiteSetting(setting: SiteSetting): Promise<void>;
}

export interface VocabRepository {
  getEntries(lemmaIds: string[]): Promise<UserVocabEntry[]>;
  upsertEntry(entry: UserVocabEntry): Promise<void>;
}

export interface SentenceCacheRepository {
  getByHash(hash: string): Promise<SentenceCacheEntry | null>;
  put(entry: SentenceCacheEntry): Promise<void>;
}

