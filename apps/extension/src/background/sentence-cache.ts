import type {
  SentenceCacheEntry,
  SentenceCacheRepository,
  SentenceLearningNote
} from "@immersionkit/shared";
import {
  createSentenceLearningNote,
  hasSentenceLearningNoteContent
} from "@immersionkit/shared";

import {
  readString,
  isRecord
} from "../storage/serialization";
import {
  INDEXEDDB_STORES,
  getIndexedDbStore,
  isIndexedDbAvailable,
  requestToPromise,
  transactionDone
} from "../storage/indexeddb";

export class IndexedDbSentenceCacheRepository implements SentenceCacheRepository {
  async getByHash(hash: string): Promise<SentenceCacheEntry | null> {
    if (!hash) {
      return null;
    }

    if (!isIndexedDbAvailable()) {
      return null;
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
      return null;
    } catch (error) {
      console.warn("ImmersionKit IndexedDB sentence cache read failed.", error);
      return null;
    }
  }

  async getByHashes(hashes: readonly string[]): Promise<SentenceCacheEntry[]> {
    if (hashes.length === 0) {
      return [];
    }

    if (!isIndexedDbAvailable()) {
      return [];
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
      return normalizedEntries;
    } catch (error) {
      console.warn("ImmersionKit IndexedDB sentence cache read failed.", error);
      return [];
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
    }
  }

  async deleteByHash(hash: string): Promise<void> {
    if (!hash) {
      return;
    }

    if (!isIndexedDbAvailable()) {
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
    }
  }

  async clear(): Promise<void> {
    if (!isIndexedDbAvailable()) {
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
    }
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
  const learningNote = normalizeSentenceLearningNote(value.learningNote);
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
    sourceLanguage: value.sourceLanguage === "en" ? "en" : undefined,
    provider:
      value.provider === "openai" || value.provider === "none"
        ? value.provider
        : undefined,
    lastAccessedAt: readString(value.lastAccessedAt) ?? undefined
  };
}

function normalizeSentenceLearningNote(
  value: unknown
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

  return null;
}
