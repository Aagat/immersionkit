import {
  DEFAULT_EXTENSION_SETTINGS,
  RuntimeMessageType,
  type SentenceLearningNote,
  hashSentence,
  type SentenceCacheEntry,
  type SentenceCacheRepository
} from "@immersionkit/shared";
import { describe, expect, it, vi } from "vitest";

import type { SentenceProviderClient } from "../src/background/provider-client";
import { OPENAI_SENTENCE_PROMPT_VERSION } from "../src/background/provider-client";
import type { BackgroundRuntimeConfig } from "../src/background/settings";
import {
  SentenceQueueOrchestrator,
  type SentenceTranslationDelivery
} from "../src/background/sentence-queue";
import type {
  AnalyzedSentenceCandidate,
  SentenceAnalysisService
} from "../src/background/sentence-analysis-service";

describe("sentence queue orchestration", () => {
  it("returns cache hits immediately in queue response", async () => {
    const sourceText = "The station opens early in the morning.";
    const sentenceHash = hashSentence(sourceText);
    const learningNote = createLearningNote("Routine present tense for a recurring action.");
    const cache = new InMemorySentenceCache([
      createCacheEntry({
        sentenceHash,
        sourceText,
        translatedText: "La estacion abre temprano por la manana.",
        learningNote
      })
    ]);

    const providerCalls = vi.fn();
    const orchestrator = new SentenceQueueOrchestrator({
      sentenceCache: cache,
      loadRuntimeConfig: () => Promise.resolve(createReadyConfig()),
      createProviderClient: () => {
        providerCalls();
        return createProviderClientMock([]);
      },
      flushDelayMs: 0
    });

    const response = await orchestrator.queueMessage(
      {
        type: RuntimeMessageType.QueueSentenceCandidates,
        sentences: [sourceText]
      },
      12
    );

    expect(response.ok).toBe(true);
    expect(response.accepted).toBe(1);
    expect(response.queued).toBe(0);
    expect(response.cacheHits).toBe(1);
    expect(response.translationAvailability).toBe("ready");
    expect(response.cachedResults).toEqual([
      {
        sentenceHash,
        sourceText,
        translatedText: "La estacion abre temprano por la manana.",
        learningNote,
        grammarNote: learningNote.summary
      }
    ]);
    expect(providerCalls).not.toHaveBeenCalled();
  });

  it("delivers fresh background translations to the sender tab", async () => {
    const sourceText = "The museum offers guided tours on Sundays.";
    const sentenceHash = hashSentence(sourceText);
    const cache = new InMemorySentenceCache();

    const translatedText = "El museo ofrece visitas guiadas los domingos.";
    const learningNote = createLearningNote(
      "The reusable chunk here is \"visitas guiadas\" for guided tours.",
      {
        keyPhrase: "\"visitas guiadas\" = guided tours",
        grammarFocus: "Spanish uses the plural noun phrase for a standing offering."
      }
    );

    const providerCalls = vi.fn();
    const deliveryPromise = createDeferred<SentenceTranslationDelivery[]>();

    const orchestrator = new SentenceQueueOrchestrator({
      sentenceCache: cache,
      loadRuntimeConfig: () => Promise.resolve(createReadyConfig()),
      createProviderClient: () => {
        providerCalls();
        return createProviderClientMock([
          {
            sentenceHash,
            sourceText,
            translatedText,
            learningNote
          }
        ]);
      },
      notifyFreshTranslations: (deliveries) => {
        deliveryPromise.resolve(deliveries);
      },
      flushDelayMs: 0
    });

    const response = await orchestrator.queueMessage(
      {
        type: RuntimeMessageType.QueueSentenceCandidates,
        sentences: [sourceText]
      },
      27
    );

    expect(response.accepted).toBe(1);
    expect(response.queued).toBe(1);
    expect(response.cacheHits).toBe(0);
    expect(response.translationAvailability).toBe("ready");

    const deliveries = await withTimeout(deliveryPromise.promise, 800);
    expect(providerCalls).toHaveBeenCalledTimes(1);
    expect(deliveries).toEqual([
      {
        tabId: 27,
        results: [
          {
            sentenceHash,
            sourceText,
            translatedText,
            learningNote,
            grammarNote: learningNote.summary
          }
        ]
      }
    ]);
  });

  it("treats stale prompt-version cache entries as misses and refreshes them", async () => {
    const sourceText = "The embassy released a careful statement.";
    const sentenceHash = hashSentence(sourceText);
    const staleCache = new InMemorySentenceCache([
      {
        ...createCacheEntry({
          sentenceHash,
          sourceText,
          translatedText: "La embajada emitio una declaracion cuidadosa.",
          learningNote: createLearningNote("Old cached note.")
        }),
        promptVersion: "openai-sentence-v2"
      }
    ]);

    const refreshedNote = createLearningNote(
      "To say \"released a statement,\" Spanish often uses \"emitio una declaracion\"."
    );
    const providerCalls = vi.fn();
    const deliveryPromise = createDeferred<SentenceTranslationDelivery[]>();

    const orchestrator = new SentenceQueueOrchestrator({
      sentenceCache: staleCache,
      loadRuntimeConfig: () => Promise.resolve(createReadyConfig()),
      createProviderClient: () => {
        providerCalls();
        return createProviderClientMock([
          {
            sentenceHash,
            sourceText,
            translatedText: "La embajada emitio una declaracion cuidadosa.",
            learningNote: refreshedNote
          }
        ]);
      },
      notifyFreshTranslations: (deliveries) => {
        deliveryPromise.resolve(deliveries);
      },
      flushDelayMs: 0
    });

    const response = await orchestrator.queueMessage(
      {
        type: RuntimeMessageType.QueueSentenceCandidates,
        sentences: [sourceText]
      },
      44
    );

    expect(response.cacheHits).toBe(0);
    expect(response.queued).toBe(1);

    const deliveries = await withTimeout(deliveryPromise.promise, 800);
    expect(providerCalls).toHaveBeenCalledTimes(1);
    expect(deliveries[0]?.results[0]?.learningNote.summary).toBe(refreshedNote.summary);
    expect((await staleCache.getByHash(sentenceHash))?.promptVersion).toBe(
      OPENAI_SENTENCE_PROMPT_VERSION
    );
  });

  it("skips sentence translation work when the feature is disabled", async () => {
    const sourceText = "Neighbors gather in the square each evening.";
    const cache = new InMemorySentenceCache();
    const providerCalls = vi.fn();
    const notifyCalls = vi.fn();

    const orchestrator = new SentenceQueueOrchestrator({
      sentenceCache: cache,
      loadRuntimeConfig: () =>
        Promise.resolve(
          createReadyConfig({
            sentenceTranslationEnabled: false
          })
        ),
      createProviderClient: () => {
        providerCalls();
        return createProviderClientMock([]);
      },
      notifyFreshTranslations: notifyCalls,
      flushDelayMs: 0
    });

    const response = await orchestrator.queueMessage(
      {
        type: RuntimeMessageType.QueueSentenceCandidates,
        sentences: [sourceText]
      },
      9
    );

    expect(response.ok).toBe(true);
    expect(response.accepted).toBe(1);
    expect(response.queued).toBe(0);
    expect(response.cacheHits).toBe(0);
    expect(response.translationAvailability).toBe("feature-disabled");
    expect(providerCalls).not.toHaveBeenCalled();
    expect(notifyCalls).not.toHaveBeenCalled();
  });

  it("prioritizes higher-suitability analysis results for provider work", async () => {
    const ordinarySentence = "The museum opens early for visitors.";
    const dueTargetSentence = "The city offers guided tours on Sundays.";
    const ordinaryHash = hashSentence(ordinarySentence);
    const dueTargetHash = hashSentence(dueTargetSentence);
    const translatedDue = "La ciudad ofrece visitas guiadas los domingos.";
    const providerCandidateBatches: string[][] = [];
    const deliveryPromise = createDeferred<SentenceTranslationDelivery[]>();

    const orchestrator = new SentenceQueueOrchestrator({
      sentenceCache: new InMemorySentenceCache(),
      sentenceAnalysisService: createAnalysisServiceMock([
        createAnalysisResult(ordinaryHash, 0.31),
        createAnalysisResult(dueTargetHash, 0.86)
      ]),
      loadRuntimeConfig: () =>
        Promise.resolve(
          createReadyConfig({
            sentenceBatchSize: 1
          })
        ),
      createProviderClient: () => ({
        providerName: "openai",
        async translateSentences(input) {
          providerCandidateBatches.push(
            input.candidates.map((candidate) => candidate.sentenceHash)
          );
          return input.candidates
            .filter((candidate) => candidate.sentenceHash === dueTargetHash)
            .map((candidate) => ({
              sentenceHash: candidate.sentenceHash,
              sourceText: candidate.sourceText,
              translatedText: translatedDue,
              learningNote: createLearningNote("Due target sentence first."),
              model: "test-model",
              promptVersion: OPENAI_SENTENCE_PROMPT_VERSION
            }));
        }
      }),
      notifyFreshTranslations: (deliveries) => {
        deliveryPromise.resolve(deliveries);
      },
      flushDelayMs: 0
    });

    const response = await orchestrator.queueMessage(
      {
        type: RuntimeMessageType.QueueSentenceCandidates,
        sentences: [ordinarySentence, dueTargetSentence]
      },
      31
    );

    expect(response.queued).toBe(2);
    await withTimeout(deliveryPromise.promise, 800);
    expect(providerCandidateBatches[0]).toEqual([dueTargetHash]);
  });
});

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((onResolve) => {
    resolve = onResolve;
  });

  return {
    promise,
    resolve
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`Timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

class InMemorySentenceCache implements SentenceCacheRepository {
  private readonly entries = new Map<string, SentenceCacheEntry>();

  constructor(initialEntries: readonly SentenceCacheEntry[] = []) {
    for (const entry of initialEntries) {
      this.entries.set(entry.sentenceHash, { ...entry });
    }
  }

  async getByHash(hash: string): Promise<SentenceCacheEntry | null> {
    return this.entries.get(hash) ?? null;
  }

  async getByHashes(hashes: readonly string[]): Promise<SentenceCacheEntry[]> {
    const output: SentenceCacheEntry[] = [];

    for (const hash of hashes) {
      const entry = this.entries.get(hash);
      if (entry) {
        output.push(entry);
      }
    }

    return output;
  }

  async put(entry: SentenceCacheEntry): Promise<void> {
    this.entries.set(entry.sentenceHash, { ...entry });
  }

  async putMany(entries: readonly SentenceCacheEntry[]): Promise<void> {
    for (const entry of entries) {
      this.entries.set(entry.sentenceHash, { ...entry });
    }
  }

  async deleteByHash(hash: string): Promise<void> {
    this.entries.delete(hash);
  }

  async clear(): Promise<void> {
    this.entries.clear();
  }
}

function createAnalysisServiceMock(
  results: readonly AnalyzedSentenceCandidate[]
): SentenceAnalysisService {
  return {
    analyzeCandidates: async () => [...results]
  } as SentenceAnalysisService;
}

function createAnalysisResult(
  sentenceHash: string,
  difficultyScore: number
): AnalyzedSentenceCandidate {
  return {
    cacheHit: false,
    suitabilitySignals: {
      vocabularyFit: difficultyScore,
      grammarFit: 0,
      structuralSimplicity: 0,
      dueTargetValue: 0,
      chunkUsefulness: 0,
      ambiguityPenalty: 0,
      stretchDemand: 0
    },
    entry: {
      sentenceHash,
      analyzerVersion: "fixture-v1",
      analyzerId: "fixture-annotated",
      sourceText: sentenceHash,
      tokens: [],
      lemmas: [],
      posTags: [],
      chunks: [],
      contextualWordCandidates: [],
      phraseMatches: [],
      grammarFeatures: [],
      difficultyScore,
      createdAt: "2026-04-25T10:00:00.000Z",
      lastAccessedAt: "2026-04-25T10:00:00.000Z"
    }
  };
}

function createProviderClientMock(
  translations: {
    sentenceHash: string;
    sourceText: string;
    translatedText: string;
    learningNote: SentenceLearningNote;
  }[]
): SentenceProviderClient {
  return {
    providerName: "openai",
    async translateSentences(input) {
      const byHash = new Map(
        translations.map((translation) => [translation.sentenceHash, translation] as const)
      );
      return input.candidates.reduce<
        {
          sentenceHash: string;
          sourceText: string;
          translatedText: string;
          learningNote: SentenceLearningNote;
          model: string;
          promptVersion: string;
        }[]
      >((rows, candidate) => {
        const translation = byHash.get(candidate.sentenceHash);
        if (!translation) {
          return rows;
        }

        rows.push({
          sentenceHash: translation.sentenceHash,
          sourceText: translation.sourceText,
          translatedText: translation.translatedText,
          learningNote: translation.learningNote,
          model: "test-model",
          promptVersion: OPENAI_SENTENCE_PROMPT_VERSION
        });
        return rows;
      }, []);
    }
  };
}

function createReadyConfig(
  overrides: Partial<BackgroundRuntimeConfig["settings"]> = {}
): BackgroundRuntimeConfig {
  return {
    settings: {
      ...DEFAULT_EXTENSION_SETTINGS,
      sentenceTranslationEnabled: true,
      provider: "openai",
      ...overrides
    },
    credentials: {
      openAiApiKey: "sk-test-12345678901234567890"
    }
  };
}

function createCacheEntry(
  input: Pick<
    SentenceCacheEntry,
    "sentenceHash" | "sourceText" | "translatedText" | "learningNote"
  >
): SentenceCacheEntry {
  return {
    ...input,
    grammarNote: input.learningNote.summary,
    targetLanguage: "es",
    sourceLanguage: "en",
    model: "cached-model",
    promptVersion: OPENAI_SENTENCE_PROMPT_VERSION,
    provider: "openai",
    createdAt: "2026-04-17T10:00:00.000Z",
    lastAccessedAt: "2026-04-17T10:00:00.000Z"
  };
}

function createLearningNote(
  summary: string,
  overrides: Partial<SentenceLearningNote> = {}
): SentenceLearningNote {
  return {
    summary,
    literalGloss: "",
    keyPhrase: "",
    canonicalUsage: "",
    grammarFocus: "",
    ...overrides
  };
}
