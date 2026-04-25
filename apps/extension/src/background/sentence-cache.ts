import type {
  SentenceCacheEntry,
  SentenceCacheRepository,
  SentenceLearningNote
} from "@immersionkit/shared";
import {
  createLegacySentenceLearningNote,
  createSentenceLearningNote,
  hasSentenceLearningNoteContent
} from "@immersionkit/shared";

import {
  isRecord,
  pickFirstDefinedValue,
  readStorageValues,
  readString,
  removeStorageValues,
  writeStorageValues
} from "./storage";
import {
  INDEXEDDB_STORES,
  getIndexedDbStore,
  isIndexedDbAvailable,
  requestToPromise,
  transactionDone
} from "./indexeddb";

const SENTENCE_CACHE_STORAGE_KEYS = [
  "immersionkit.sentenceCache",
  "sentenceCache"
] as const;
const SENTENCE_CACHE_PRIMARY_KEY = SENTENCE_CACHE_STORAGE_KEYS[0];

type SentenceCacheRecord = Record<string, SentenceCacheEntry>;

export class IndexedDbSentenceCacheRepository implements SentenceCacheRepository {
  private readonly fallback = new ChromeStorageSentenceCacheRepository();

  async getByHash(hash: string): Promise<SentenceCacheEntry | null> {
    if (!hash) {
      return null;
    }

    if (!isIndexedDbAvailable()) {
      return this.fallback.getByHash(hash);
    }

    try {
      const store = await getIndexedDbStore(INDEXEDDB_STORES.sentenceCache, "readonly");
      const entry = normalizeSentenceCacheEntry(
        await requestToPromise(store.get(hash)),
        hash
      );
      if (entry) {
        return entry;
      }

      const legacyEntry = await this.fallback.getByHash(hash);
      if (legacyEntry) {
        await this.put(legacyEntry);
      }
      return legacyEntry;
    } catch (error) {
      console.warn("ImmersionKit IndexedDB sentence cache read failed.", error);
      return this.fallback.getByHash(hash);
    }
  }

  async getByHashes(hashes: readonly string[]): Promise<SentenceCacheEntry[]> {
    if (hashes.length === 0) {
      return [];
    }

    if (!isIndexedDbAvailable()) {
      return this.fallback.getByHashes(hashes);
    }

    try {
      const store = await getIndexedDbStore(INDEXEDDB_STORES.sentenceCache, "readonly");
      const entries = await Promise.all(
        [...new Set(hashes)].map(async (hash) =>
          normalizeSentenceCacheEntry(await requestToPromise(store.get(hash)), hash)
        )
      );
      const normalizedEntries = entries.filter(
        (entry): entry is SentenceCacheEntry => Boolean(entry)
      );
      const missingHashes = hashes.filter(
        (hash) => !normalizedEntries.some((entry) => entry.sentenceHash === hash)
      );

      if (missingHashes.length === 0) {
        return normalizedEntries;
      }

      const legacyEntries = await this.fallback.getByHashes(missingHashes);
      if (legacyEntries.length > 0) {
        await this.putMany(legacyEntries);
      }

      return [...normalizedEntries, ...legacyEntries];
    } catch (error) {
      console.warn("ImmersionKit IndexedDB sentence cache read failed.", error);
      return this.fallback.getByHashes(hashes);
    }
  }

  async put(entry: SentenceCacheEntry): Promise<void> {
    await this.putMany([entry]);
  }

  async putMany(entries: readonly SentenceCacheEntry[]): Promise<void> {
    const normalizedEntries = entries
      .map((entry) => normalizeSentenceCacheEntry(entry, entry.sentenceHash))
      .filter((entry): entry is SentenceCacheEntry => Boolean(entry));
    if (normalizedEntries.length === 0) {
      return;
    }

    if (!isIndexedDbAvailable()) {
      await this.fallback.putMany(normalizedEntries);
      return;
    }

    try {
      const store = await getIndexedDbStore(
        INDEXEDDB_STORES.sentenceCache,
        "readwrite"
      );
      const transaction = store.transaction;
      for (const entry of normalizedEntries) {
        store.put(entry);
      }
      await transactionDone(transaction);
    } catch (error) {
      console.warn("ImmersionKit IndexedDB sentence cache write failed.", error);
      await this.fallback.putMany(normalizedEntries);
    }
  }

  async deleteByHash(hash: string): Promise<void> {
    if (!hash) {
      return;
    }

    if (!isIndexedDbAvailable()) {
      await this.fallback.deleteByHash(hash);
      return;
    }

    try {
      const store = await getIndexedDbStore(
        INDEXEDDB_STORES.sentenceCache,
        "readwrite"
      );
      const transaction = store.transaction;
      store.delete(hash);
      await transactionDone(transaction);
    } catch (error) {
      console.warn("ImmersionKit IndexedDB sentence cache delete failed.", error);
      await this.fallback.deleteByHash(hash);
    }
  }

  async clear(): Promise<void> {
    if (!isIndexedDbAvailable()) {
      await this.fallback.clear();
      return;
    }

    try {
      const store = await getIndexedDbStore(
        INDEXEDDB_STORES.sentenceCache,
        "readwrite"
      );
      const transaction = store.transaction;
      store.clear();
      await transactionDone(transaction);
    } catch (error) {
      console.warn("ImmersionKit IndexedDB sentence cache clear failed.", error);
      await this.fallback.clear();
    }
  }
}

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
  const learningNote = normalizeSentenceLearningNote(value.learningNote, grammarNote);
  const model = readString(value.model);
  const promptVersion = readString(value.promptVersion);
  const createdAt = readString(value.createdAt);

  if (
    !sentenceHash ||
    !sourceText ||
    !translatedText ||
    !learningNote ||
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
    learningNote,
    model,
    promptVersion,
    createdAt,
    targetLanguage,
    grammarNote: learningNote.summary,
    sourceLanguage: value.sourceLanguage === "en" ? "en" : undefined,
    provider:
      value.provider === "openai" || value.provider === "none"
        ? value.provider
        : undefined,
    lastAccessedAt: readString(value.lastAccessedAt) ?? undefined
  };
}

function normalizeSentenceLearningNote(
  value: unknown,
  legacyGrammarNote: string | undefined | null
): SentenceLearningNote | null {
  if (isRecord(value)) {
    const learningNote = createSentenceLearningNote({
      summary: readString(value.summary) ?? undefined,
      literalGloss: readString(value.literalGloss) ?? undefined,
      keyPhrase: readString(value.keyPhrase) ?? undefined,
      canonicalUsage: readString(value.canonicalUsage) ?? undefined,
      grammarFocus: readString(value.grammarFocus) ?? undefined
    });

    if (hasSentenceLearningNoteContent(learningNote)) {
      return learningNote;
    }
  }

  if (legacyGrammarNote) {
    return createLegacySentenceLearningNote(legacyGrammarNote);
  }

  return null;
}
