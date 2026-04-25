import {
  buildSentenceAnalysisIdentity,
  createSentenceAnalysisEntry,
  type AnalyzerChunk,
  type AnalyzerId,
  type AnalyzerToken,
  type ContextualWordCandidate,
  type GrammarFeatureMatch,
  type PhraseOccurrence,
  type SentenceAnalysisEntry,
  type SentenceScoreSummary
} from "@immersionkit/shared";

import {
  readString,
  isRecord
} from "./storage";
import {
  INDEXEDDB_STORES,
  getIndexedDbStore,
  isIndexedDbAvailable,
  requestToPromise,
  transactionDone
} from "./indexeddb";

// Temporary background-owned bridge until shared grows a durable
// SentenceAnalysisEntry repository contract.
export interface SentenceAnalysisCacheRepository {
  get(
    sentenceHash: string,
    analyzerVersion: string
  ): Promise<SentenceAnalysisEntry | null>;
  getMany(
    sentenceHashes: readonly string[],
    analyzerVersion: string
  ): Promise<SentenceAnalysisEntry[]>;
  put(entry: SentenceAnalysisEntry): Promise<void>;
  putMany(entries: readonly SentenceAnalysisEntry[]): Promise<void>;
  clear(): Promise<void>;
}

type IndexedSentenceAnalysisCacheEntry = SentenceAnalysisEntry & {
  identity: string;
};

export class IndexedDbSentenceAnalysisCacheRepository
  implements SentenceAnalysisCacheRepository
{
  async listAll(): Promise<SentenceAnalysisEntry[]> {
    if (!isIndexedDbAvailable()) {
      return [];
    }

    try {
      const store = await getIndexedDbStore(
        INDEXEDDB_STORES.sentenceAnalysisCache,
        "readonly"
      );
      return (await requestToPromise(store.getAll()))
        .map((entry) => normalizeSentenceAnalysisEntry(entry))
        .filter((entry): entry is SentenceAnalysisEntry => Boolean(entry));
    } catch (error) {
      console.warn("ImmersionKit IndexedDB analysis cache list failed.", error);
      return [];
    }
  }

  async listBySentenceHashes(
    sentenceHashes: readonly string[]
  ): Promise<SentenceAnalysisEntry[]> {
    const uniqueHashes = [...new Set(sentenceHashes.filter(Boolean))];
    if (uniqueHashes.length === 0) {
      return [];
    }

    if (!isIndexedDbAvailable()) {
      return [];
    }

    try {
      const store = await getIndexedDbStore(
        INDEXEDDB_STORES.sentenceAnalysisCache,
        "readonly"
      );
      const index = store.index("sentenceHash");
      const entries = await Promise.all(
        uniqueHashes.map(async (sentenceHash) =>
          requestToPromise(index.getAll(sentenceHash))
        )
      );
      return entries
        .flat()
        .map((entry) => normalizeSentenceAnalysisEntry(entry))
        .filter((entry): entry is SentenceAnalysisEntry => Boolean(entry));
    } catch (error) {
      console.warn("ImmersionKit IndexedDB analysis cache scoped read failed.", error);
      return [];
    }
  }

  async get(
    sentenceHash: string,
    analyzerVersion: string
  ): Promise<SentenceAnalysisEntry | null> {
    if (!sentenceHash || !analyzerVersion) {
      return null;
    }

    const [entry] = await this.getMany([sentenceHash], analyzerVersion);
    return entry ?? null;
  }

  async getMany(
    sentenceHashes: readonly string[],
    analyzerVersion: string
  ): Promise<SentenceAnalysisEntry[]> {
    if (sentenceHashes.length === 0 || !analyzerVersion) {
      return [];
    }

    if (!isIndexedDbAvailable()) {
      return [];
    }

    try {
      const store = await getIndexedDbStore(
        INDEXEDDB_STORES.sentenceAnalysisCache,
        "readonly"
      );
      const entries = await Promise.all(
        [...new Set(sentenceHashes)].map(async (sentenceHash) => {
          const identity = buildSentenceAnalysisIdentity(
            sentenceHash,
            analyzerVersion
          );
          return normalizeSentenceAnalysisEntry(
            await requestToPromise(store.get(identity))
          );
        })
      );
      const normalizedEntries = entries.filter(
        (entry): entry is SentenceAnalysisEntry => Boolean(entry)
      );
      return normalizedEntries;
    } catch (error) {
      console.warn("ImmersionKit IndexedDB analysis cache read failed.", error);
      return [];
    }
  }

  async put(entry: SentenceAnalysisEntry): Promise<void> {
    await this.putMany([entry]);
  }

  async putMany(entries: readonly SentenceAnalysisEntry[]): Promise<void> {
    const normalizedEntries = entries
      .map((entry) => normalizeSentenceAnalysisEntry(entry))
      .filter((entry): entry is SentenceAnalysisEntry => Boolean(entry));
    if (normalizedEntries.length === 0) {
      return;
    }

    if (!isIndexedDbAvailable()) {
      return;
    }

    try {
      const store = await getIndexedDbStore(
        INDEXEDDB_STORES.sentenceAnalysisCache,
        "readwrite"
      );
      const transaction = store.transaction;
      for (const entry of normalizedEntries) {
        store.put({
          ...entry,
          identity: buildSentenceAnalysisIdentity(
            entry.sentenceHash,
            entry.analyzerVersion
          )
        } satisfies IndexedSentenceAnalysisCacheEntry);
      }
      await transactionDone(transaction);
    } catch (error) {
      console.warn("ImmersionKit IndexedDB analysis cache write failed.", error);
    }
  }

  async clear(): Promise<void> {
    if (!isIndexedDbAvailable()) {
      return;
    }

    try {
      const store = await getIndexedDbStore(
        INDEXEDDB_STORES.sentenceAnalysisCache,
        "readwrite"
      );
      const transaction = store.transaction;
      store.clear();
      await transactionDone(transaction);
    } catch (error) {
      console.warn("ImmersionKit IndexedDB analysis cache clear failed.", error);
    }
  }
}

function normalizeSentenceAnalysisEntry(
  value: unknown
): SentenceAnalysisEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const sentenceHash = readString(value.sentenceHash);
  const analyzerVersion = readString(value.analyzerVersion);
  const analyzerId = readAnalyzerId(value.analyzerId);
  const sourceText = readString(value.sourceText);
  const createdAt = readString(value.createdAt);
  const lastAccessedAt = readString(value.lastAccessedAt) ?? createdAt;
  const tokens = readAnalyzerTokens(value.tokens);
  const chunks = readAnalyzerChunks(value.chunks);
  const grammarFeatures = readGrammarFeatures(value.grammarFeatures);

  if (
    !sentenceHash ||
    !analyzerVersion ||
    !analyzerId ||
    !sourceText ||
    !createdAt ||
    !lastAccessedAt ||
    tokens.length === 0
  ) {
    return null;
  }

  return createSentenceAnalysisEntry(
    {
      analyzerId,
      analyzerVersion,
      sentenceHash,
      sourceText,
      tokens,
      chunks,
      grammarFeatures
    },
    {
      contextualWordCandidates: readContextualWordCandidates(
        value.contextualWordCandidates
      ),
      phraseMatches: readPhraseOccurrences(value.phraseMatches),
      grammarFeatures,
      difficultyScore: readNumber(value.difficultyScore),
      difficultyBand: readDifficultyBand(value.difficultyBand),
      vocabStats: readSentenceScoreSummary(value.vocabStats),
      createdAt,
      lastAccessedAt
    }
  );
}

function readAnalyzerId(value: unknown): AnalyzerId | null {
  return value === "wink-nlp" ||
    value === "compromise-three" ||
    value === "fixture-annotated"
    ? value
    : null;
}

function readAnalyzerTokens(value: unknown): AnalyzerToken[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((token): AnalyzerToken[] => {
    if (!isRecord(token)) {
      return [];
    }

    const text = readString(token.text);
    const normalized = readString(token.normalized);
    const startOffset = readNumber(token.startOffset);
    const endOffset = readNumber(token.endOffset);
    if (!text || !normalized || startOffset === undefined || endOffset === undefined) {
      return [];
    }

    return [
      {
        text,
        normalized,
        lemma: readString(token.lemma) ?? undefined,
        pos: readString(token.pos) ?? undefined,
        tags: readStringArray(token.tags),
        startOffset,
        endOffset
      }
    ];
  });
}

function readAnalyzerChunks(value: unknown): AnalyzerChunk[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((chunk): AnalyzerChunk[] => {
    if (!isRecord(chunk)) {
      return [];
    }

    const text = readString(chunk.text);
    const normalized = readString(chunk.normalized);
    const tokenStart = readNumber(chunk.tokenStart);
    const tokenEnd = readNumber(chunk.tokenEnd);
    const confidence = readNumber(chunk.confidence);
    if (
      !text ||
      !normalized ||
      !isAnalyzerChunkType(chunk.type) ||
      tokenStart === undefined ||
      tokenEnd === undefined ||
      confidence === undefined
    ) {
      return [];
    }

    return [
      {
        text,
        normalized,
        type: chunk.type,
        tokenStart,
        tokenEnd,
        confidence
      }
    ];
  });
}

function readContextualWordCandidates(value: unknown): ContextualWordCandidate[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isContextualWordCandidate);
}

function readPhraseOccurrences(value: unknown): PhraseOccurrence[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isPhraseOccurrence);
}

function readGrammarFeatures(value: unknown): GrammarFeatureMatch[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isGrammarFeatureMatch);
}

function isContextualWordCandidate(
  value: unknown
): value is ContextualWordCandidate {
  return isRecord(value) && Boolean(readString(value.id)) && Boolean(readString(value.sentence));
}

function isPhraseOccurrence(value: unknown): value is PhraseOccurrence {
  return (
    isRecord(value) &&
    Boolean(readString(value.occurrenceId)) &&
    Boolean(readString(value.phraseId)) &&
    isRecord(value.span)
  );
}

function isGrammarFeatureMatch(value: unknown): value is GrammarFeatureMatch {
  return (
    isRecord(value) &&
    Boolean(readString(value.featureId)) &&
    Boolean(readString(value.featureKey)) &&
    isRecord(value.span)
  );
}

function readSentenceScoreSummary(value: unknown): SentenceScoreSummary | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const knownWordCount = readNumber(value.knownWordCount);
  const learningWordCount = readNumber(value.learningWordCount);
  const ignoredWordCount = readNumber(value.ignoredWordCount);
  const unknownWordCount = readNumber(value.unknownWordCount);
  const totalWordCount = readNumber(value.totalWordCount);
  const knownRatio = readNumber(value.knownRatio);
  const familiarRatio = readNumber(value.familiarRatio);

  if (
    knownWordCount === undefined ||
    learningWordCount === undefined ||
    ignoredWordCount === undefined ||
    unknownWordCount === undefined ||
    totalWordCount === undefined ||
    knownRatio === undefined ||
    familiarRatio === undefined
  ) {
    return undefined;
  }

  return {
    knownWordCount,
    learningWordCount,
    ignoredWordCount,
    unknownWordCount,
    totalWordCount,
    knownRatio,
    familiarRatio
  };
}

function readDifficultyBand(
  value: unknown
): SentenceAnalysisEntry["difficultyBand"] | undefined {
  return value === "core" || value === "stretch" || value === "defer"
    ? value
    : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

function isAnalyzerChunkType(value: unknown): value is AnalyzerChunk["type"] {
  return (
    value === "noun-phrase" ||
    value === "verb-phrase" ||
    value === "prepositional-phrase" ||
    value === "adjective-phrase" ||
    value === "adverb-phrase" ||
    value === "unknown"
  );
}
