import type { SentenceCacheEntry, SentenceCacheRepository } from "@immersionkit/shared";

import {
  isRecord,
  pickFirstDefinedValue,
  readStorageValues,
  readString,
  removeStorageValues,
  writeStorageValues
} from "./storage";

const SENTENCE_CACHE_STORAGE_KEYS = [
  "immersionkit.sentenceCache",
  "sentenceCache"
] as const;
const SENTENCE_CACHE_PRIMARY_KEY = SENTENCE_CACHE_STORAGE_KEYS[0];

type SentenceCacheRecord = Record<string, SentenceCacheEntry>;

export class ChromeStorageSentenceCacheRepository implements SentenceCacheRepository {
  async getByHash(hash: string): Promise<SentenceCacheEntry | null> {
    if (!hash) {
      return null;
    }

    const cacheRecord = await this.loadCacheRecord();
    return cacheRecord[hash] ?? null;
  }

  async getByHashes(hashes: readonly string[]): Promise<SentenceCacheEntry[]> {
    if (hashes.length === 0) {
      return [];
    }

    const cacheRecord = await this.loadCacheRecord();
    const entries: SentenceCacheEntry[] = [];

    for (const hash of hashes) {
      const entry = cacheRecord[hash];
      if (entry) {
        entries.push(entry);
      }
    }

    return entries;
  }

  async put(entry: SentenceCacheEntry): Promise<void> {
    await this.putMany([entry]);
  }

  async putMany(entries: readonly SentenceCacheEntry[]): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    const cacheRecord = await this.loadCacheRecord();
    for (const entry of entries) {
      const normalized = normalizeSentenceCacheEntry(entry, entry.sentenceHash);
      if (!normalized) {
        continue;
      }

      cacheRecord[normalized.sentenceHash] = normalized;
    }

    await this.persistCacheRecord(cacheRecord);
  }

  async deleteByHash(hash: string): Promise<void> {
    if (!hash) {
      return;
    }

    const cacheRecord = await this.loadCacheRecord();
    if (!(hash in cacheRecord)) {
      return;
    }

    delete cacheRecord[hash];
    await this.persistCacheRecord(cacheRecord);
  }

  async clear(): Promise<void> {
    await removeStorageValues(SENTENCE_CACHE_STORAGE_KEYS);
  }

  private async loadCacheRecord(): Promise<SentenceCacheRecord> {
    const storage = await readStorageValues(SENTENCE_CACHE_STORAGE_KEYS);
    const rawRecord = pickFirstDefinedValue(storage, SENTENCE_CACHE_STORAGE_KEYS);

    if (!isRecord(rawRecord)) {
      return {};
    }

    const record: SentenceCacheRecord = {};
    for (const [hash, value] of Object.entries(rawRecord)) {
      const normalized = normalizeSentenceCacheEntry(value, hash);
      if (!normalized) {
        continue;
      }

      record[normalized.sentenceHash] = normalized;
    }

    return record;
  }

  private async persistCacheRecord(record: SentenceCacheRecord): Promise<void> {
    await writeStorageValues({
      [SENTENCE_CACHE_PRIMARY_KEY]: record
    });
  }
}

function normalizeSentenceCacheEntry(
  value: unknown,
  fallbackHash?: string
): SentenceCacheEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const sentenceHash = readString(value.sentenceHash) ?? readString(fallbackHash);
  const sourceText = readString(value.sourceText);
  const translatedText = readString(value.translatedText);
  const grammarNote = readString(value.grammarNote);
  const model = readString(value.model);
  const promptVersion = readString(value.promptVersion);
  const createdAt = readString(value.createdAt);

  if (
    !sentenceHash ||
    !sourceText ||
    !translatedText ||
    !grammarNote ||
    !model ||
    !promptVersion ||
    !createdAt
  ) {
    return null;
  }

  const targetLanguage = value.targetLanguage === "es" ? "es" : null;
  if (!targetLanguage) {
    return null;
  }

  return {
    sentenceHash,
    sourceText,
    translatedText,
    grammarNote,
    model,
    promptVersion,
    createdAt,
    targetLanguage,
    sourceLanguage: value.sourceLanguage === "en" ? "en" : undefined,
    provider:
      value.provider === "openai" || value.provider === "none"
        ? value.provider
        : undefined,
    lastAccessedAt: readString(value.lastAccessedAt) ?? undefined
  };
}

