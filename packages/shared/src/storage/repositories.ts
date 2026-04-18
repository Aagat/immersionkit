import type {
  ExtensionSettings,
  IsoTimestamp,
  ResolvedExtensionSettings,
  SeedLexiconEntry,
  SentenceCacheEntry,
  SiteSetting,
  SupportedPos,
  UserVocabEntry,
  VocabStatus
} from "../domain/models";

export type RepositoryReadOptions = {
  signal?: AbortSignal;
};

export type SeedLexiconQuery = {
  sourceLemma?: string;
  pos?: SupportedPos;
  limit?: number;
};

export interface SeedLexiconRepository {
  getByLemmaId(lemmaId: string, options?: RepositoryReadOptions): Promise<SeedLexiconEntry | null>;
  findEntries(query: SeedLexiconQuery, options?: RepositoryReadOptions): Promise<SeedLexiconEntry[]>;
}

export interface SettingsRepository {
  getSettings(options?: RepositoryReadOptions): Promise<ResolvedExtensionSettings>;
  saveSettings(settings: ExtensionSettings): Promise<ResolvedExtensionSettings>;
  patchSettings(patch: Partial<ExtensionSettings>): Promise<ResolvedExtensionSettings>;
}

export interface SiteSettingsRepository {
  getSiteSetting(hostname: string, options?: RepositoryReadOptions): Promise<SiteSetting | null>;
  listSiteSettings(options?: RepositoryReadOptions): Promise<SiteSetting[]>;
  saveSiteSetting(setting: SiteSetting): Promise<void>;
  deleteSiteSetting(hostname: string): Promise<void>;
}

export type VocabStatusUpdate = {
  lemmaId: string;
  status: VocabStatus;
  updatedAt: IsoTimestamp;
  lastSeenAt?: IsoTimestamp | null;
};

export type VocabExposureIncrement = {
  lemmaId: string;
  seenAt: IsoTimestamp;
  incrementBy?: number;
};

export interface VocabRepository {
  getEntry(lemmaId: string, options?: RepositoryReadOptions): Promise<UserVocabEntry | null>;
  getEntries(lemmaIds: readonly string[], options?: RepositoryReadOptions): Promise<UserVocabEntry[]>;
  upsertEntry(entry: UserVocabEntry): Promise<void>;
  upsertEntries(entries: readonly UserVocabEntry[]): Promise<void>;
  setStatus(update: VocabStatusUpdate): Promise<void>;
  incrementExposure(update: VocabExposureIncrement): Promise<void>;
  deleteEntry(lemmaId: string): Promise<void>;
}

export interface SentenceCacheRepository {
  getByHash(hash: string, options?: RepositoryReadOptions): Promise<SentenceCacheEntry | null>;
  getByHashes(
    hashes: readonly string[],
    options?: RepositoryReadOptions
  ): Promise<SentenceCacheEntry[]>;
  put(entry: SentenceCacheEntry): Promise<void>;
  putMany(entries: readonly SentenceCacheEntry[]): Promise<void>;
  deleteByHash(hash: string): Promise<void>;
  clear(): Promise<void>;
}
