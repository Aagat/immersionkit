import {
  DEFAULT_CURRICULUM_CONFIG,
  DEFAULT_EXTENSION_SETTINGS,
  RuntimeMessageType,
  type LearningItem,
  type AnalyzerToken,
  type SentenceLearningNote,
  hashSentence,
  type SentenceCacheEntry,
  type SentenceCacheRepository
} from "@immersionkit/shared";
import { describe, expect, it, vi } from "vitest";

import type { SentenceProviderClient } from "../src/background/provider-client";
import {
  OPENAI_SENTENCE_PROMPT_VERSION,
  buildOpenAiSentenceSystemPrompt
} from "../src/background/provider-client";
import type { BackgroundRuntimeConfig } from "../src/background/settings";
import {
  SentenceQueueOrchestrator,
  rankCandidatesByAnalysis,
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
      sentenceAnalysisService: createAnalysisServiceMock([
        createAnalysisResult(sentenceHash, 0.82)
      ]),
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
        candidates: [{ sentenceHash, sourceText }]
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
        learningNote
      }
    ]);
    expect(providerCalls).not.toHaveBeenCalled();
  });

  it("does not reuse en-es sentence cache rows for another active pair", async () => {
    const sourceText = "The station opens early in the morning.";
    const sentenceHash = hashSentence(sourceText);
    const cache = new InMemorySentenceCache([
      createCacheEntry({
        sentenceHash,
        sourceText,
        translatedText: "La estacion abre temprano por la manana.",
        learningNote: createLearningNote("Spanish cached row.")
      })
    ]);

    const orchestrator = new SentenceQueueOrchestrator({
      sentenceCache: cache,
      sentenceAnalysisService: createAnalysisServiceMock([
        createAnalysisResult(sentenceHash, 0.82)
      ]),
      loadRuntimeConfig: () =>
        Promise.resolve(
          createReadyConfig({
            languagePair: "en-fr",
            sourceLanguage: "en",
            targetLanguage: "fr"
          })
        ),
      createProviderClient: () => createProviderClientMock([]),
      flushDelayMs: 0
    });

    const response = await orchestrator.queueMessage({
      type: RuntimeMessageType.QueueSentenceCandidates,
      candidates: [{ sentenceHash, sourceText }]
    });

    expect(response.cacheHits).toBe(0);
    expect(response.queued).toBe(1);
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
      sentenceAnalysisService: createAnalysisServiceMock([
        createAnalysisResult(sentenceHash, 0.82)
      ]),
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
        candidates: [{ sentenceHash, sourceText }]
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
            learningNote
          }
        ]
      }
    ]);
  });

  it("passes the active language pair into provider translation requests", async () => {
    const sourceText = "The city is quiet today.";
    const sentenceHash = hashSentence(sourceText);
    const providerInputs: { sourceLanguage: string; targetLanguage: string }[] = [];
    const orchestrator = new SentenceQueueOrchestrator({
      sentenceCache: new InMemorySentenceCache(),
      sentenceAnalysisService: createAnalysisServiceMock([
        createAnalysisResult(sentenceHash, 0.82)
      ]),
      loadRuntimeConfig: () =>
        Promise.resolve(
          createReadyConfig({
            languagePair: "en-fr",
            sourceLanguage: "en",
            targetLanguage: "fr"
          })
        ),
      createProviderClient: () => ({
        providerName: "openai",
        async translateSentences(input) {
          providerInputs.push({
            sourceLanguage: input.sourceLanguage,
            targetLanguage: input.targetLanguage
          });
          return [];
        }
      }),
      flushDelayMs: 0
    });

    await orchestrator.queueMessage({
      type: RuntimeMessageType.QueueSentenceCandidates,
      candidates: [{ sentenceHash, sourceText }]
    });
    await waitForMicrotasks();

    expect(providerInputs).toEqual([{ sourceLanguage: "en", targetLanguage: "fr" }]);
    expect(
      buildOpenAiSentenceSystemPrompt({
        sourceLanguage: "en",
        targetLanguage: "fr"
      })
    ).toContain("learner-friendly fr");
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
      sentenceAnalysisService: createAnalysisServiceMock([
        createAnalysisResult(sentenceHash, 0.82)
      ]),
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
        candidates: [{ sentenceHash, sourceText }]
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
    const sentenceHash = hashSentence(sourceText);
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
        candidates: [{ sentenceHash, sourceText }]
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
        createAnalysisResult(ordinaryHash, 0.78),
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
        candidates: [
          { sentenceHash: ordinaryHash, sourceText: ordinarySentence },
          { sentenceHash: dueTargetHash, sourceText: dueTargetSentence }
        ]
      },
      31
    );

    expect(response.queued).toBe(2);
    expect(response.rankingReasons).toEqual([
      expect.objectContaining({
        sentenceHash: dueTargetHash,
        rank: 1,
        score: 0.86,
        primaryReason: "difficulty-score",
        curriculum: expect.objectContaining({
          activeBandId: "level-1a",
          eligible: true
        })
      }),
      expect.objectContaining({
        sentenceHash: ordinaryHash,
        rank: 2,
        score: 0.78,
        primaryReason: "difficulty-score"
      })
    ]);
    await withTimeout(deliveryPromise.promise, 800);
    expect(providerCandidateBatches[0]).toEqual([dueTargetHash]);
  });

  it("returns deterministic ranking reasons from suitability signals", () => {
    const first = {
      sentenceHash: "sentence-a",
      sourceText: "The museum opens early."
    };
    const second = {
      sentenceHash: "sentence-b",
      sourceText: "The city offers guided tours."
    };

    const ranked = rankCandidatesByAnalysis([first, second], [
      createSignalOnlyAnalysisResult(first.sentenceHash, {
        vocabularyFit: 0.2,
        grammarFit: 0.1,
        dueTargetValue: 0,
        chunkUsefulness: 0.1,
        ambiguityPenalty: 0,
        stretchDemand: 0
      }),
      createSignalOnlyAnalysisResult(second.sentenceHash, {
        vocabularyFit: 0.45,
        grammarFit: 0.2,
        dueTargetValue: 0.9,
        chunkUsefulness: 0.2,
        ambiguityPenalty: 0.1,
        stretchDemand: 0
      })
    ]);

    expect(ranked.candidates.map((candidate) => candidate.sentenceHash)).toEqual([
      second.sentenceHash,
      first.sentenceHash
    ]);
    expect(ranked.reasons[0]).toMatchObject({
      sentenceHash: second.sentenceHash,
      rank: 1,
      primaryReason: "due-target-value",
      signals: {
        dueTargetValue: 0.9,
        ambiguityPenalty: 0.1
      }
    });
  });

  it("boosts sentence ranking for due grammar feature items", () => {
    const grammarSentence = {
      sentenceHash: "sentence-grammar-due",
      sourceText: "The city has been important."
    };
    const ordinarySentence = {
      sentenceHash: "sentence-ordinary",
      sourceText: "The city is important."
    };
    const dueGrammarItem = createLearningItem({
      itemId: "grammar-feature:aspect:have-been",
      unitRefId: "aspect:have-been",
      unitType: "grammar-feature",
      nextReviewAt: "2026-04-18T09:00:00.000Z"
    });

    const ranked = rankCandidatesByAnalysis(
      [ordinarySentence, grammarSentence],
      [
        createSignalOnlyAnalysisResult(ordinarySentence.sentenceHash, {
          vocabularyFit: 0.35,
          grammarFit: 0.2,
          dueTargetValue: 0,
          chunkUsefulness: 0,
          ambiguityPenalty: 0,
          stretchDemand: 0
        }),
        {
          ...createSignalOnlyAnalysisResult(grammarSentence.sentenceHash, {
            vocabularyFit: 0.35,
            grammarFit: 0.2,
            dueTargetValue: 0,
            chunkUsefulness: 0,
            ambiguityPenalty: 0,
            stretchDemand: 0
          }),
          entry: {
            ...createSignalOnlyAnalysisResult(grammarSentence.sentenceHash, {
              vocabularyFit: 0.35,
              grammarFit: 0.2,
              dueTargetValue: 0,
              chunkUsefulness: 0,
              ambiguityPenalty: 0,
              stretchDemand: 0
            }).entry,
            grammarFeatures: [createGrammarFeature("aspect:have-been")]
          }
        }
      ],
      null,
      [dueGrammarItem]
    );

    expect(ranked.candidates.map((candidate) => candidate.sentenceHash)).toEqual([
      grammarSentence.sentenceHash,
      ordinarySentence.sentenceHash
    ]);
    expect(ranked.reasons).toEqual([
      expect.objectContaining({
        sentenceHash: grammarSentence.sentenceHash,
        rank: 1,
        primaryReason: "grammar-due-value",
        signals: expect.objectContaining({
          grammarDueValue: 0.86
        })
      }),
      expect.objectContaining({
        sentenceHash: ordinarySentence.sentenceHash,
        rank: 2,
        primaryReason: "vocab-fit",
        signals: expect.objectContaining({
          grammarDueValue: 0
        })
      })
    ]);
  });

  it("boosts sentence ranking for active curriculum grammar features", () => {
    const grammarSentence = {
      sentenceHash: "sentence-grammar-focus",
      sourceText: "She is going to call today."
    };
    const ordinarySentence = {
      sentenceHash: "sentence-ordinary-focus",
      sourceText: "She calls today."
    };

    const ranked = rankCandidatesByAnalysis(
      [ordinarySentence, grammarSentence],
      [
        createAnalysisResult(ordinarySentence.sentenceHash, 0.5),
        {
          ...createAnalysisResult(grammarSentence.sentenceHash, 0.5),
          entry: {
            ...createAnalysisResult(grammarSentence.sentenceHash, 0.5).entry,
            grammarFeatures: [createGrammarFeature("future:going-to")]
          }
        }
      ],
      {
        config: DEFAULT_CURRICULUM_CONFIG,
        profile: {
          activeVocabularyBandId: "level-2b",
          activePhraseBandId: "level-2b",
          activeGrammarBandId: "level-2b"
        }
      }
    );

    expect(ranked.candidates.map((candidate) => candidate.sentenceHash)).toEqual([
      grammarSentence.sentenceHash,
      ordinarySentence.sentenceHash
    ]);
    expect(ranked.reasons[0]).toMatchObject({
      sentenceHash: grammarSentence.sentenceHash,
      rank: 1,
      primaryReason: "curriculum-grammar-focus",
      signals: expect.objectContaining({
        grammarCurriculumValue: 0.86
      })
    });
  });

  it("penalizes overloaded grammar examples in early bands", () => {
    const cleanSentence = {
      sentenceHash: "sentence-clean-grammar",
      sourceText: "She is going to call today."
    };
    const denseSentence = {
      sentenceHash: "sentence-dense-grammar",
      sourceText: "She is going to call because they should wait."
    };
    const cleanAnalysis = createAnalysisResult(cleanSentence.sentenceHash, 0.5);
    const denseAnalysis = createAnalysisResult(denseSentence.sentenceHash, 0.5);

    const ranked = rankCandidatesByAnalysis(
      [denseSentence, cleanSentence],
      [
        {
          ...denseAnalysis,
          entry: {
            ...denseAnalysis.entry,
            grammarFeatures: [
              createGrammarFeature("future:going-to"),
              createGrammarFeature("modal:should"),
              createGrammarFeature("modal:have-to")
            ]
          }
        },
        {
          ...cleanAnalysis,
          entry: {
            ...cleanAnalysis.entry,
            grammarFeatures: [createGrammarFeature("future:going-to")]
          }
        }
      ],
      {
        config: DEFAULT_CURRICULUM_CONFIG,
        profile: {
          activeVocabularyBandId: "level-2b",
          activePhraseBandId: "level-2b",
          activeGrammarBandId: "level-2b"
        }
      }
    );

    expect(ranked.candidates.map((candidate) => candidate.sentenceHash)).toEqual([
      cleanSentence.sentenceHash
    ]);
    expect(ranked.reasons.find((reason) => reason.sentenceHash === denseSentence.sentenceHash)).toMatchObject({
      sentenceHash: denseSentence.sentenceHash,
      rank: 0,
      signals: expect.objectContaining({
        grammarOverloadPenalty: 0.28
      })
    });
  });

  it("skips out-of-band sentence candidates through curriculum policy", () => {
    const easier = {
      sentenceHash: "sentence-easy",
      sourceText: "The city is quiet."
    };
    const tooHard = {
      sentenceHash: "sentence-hard",
      sourceText: "The diplomatic delegation negotiated procedural amendments."
    };
    const dueGrammarItem = createLearningItem({
      itemId: "grammar-feature:aspect:have-been",
      unitRefId: "aspect:have-been",
      unitType: "grammar-feature",
      nextReviewAt: "2026-04-18T09:00:00.000Z"
    });

    const ranked = rankCandidatesByAnalysis(
      [tooHard, easier],
      [
        {
          ...createAnalysisResult(tooHard.sentenceHash, 0.4),
          entry: {
            ...createAnalysisResult(tooHard.sentenceHash, 0.4).entry,
            grammarFeatures: [createGrammarFeature("aspect:have-been")]
          }
        },
        createAnalysisResult(easier.sentenceHash, 0.8)
      ],
      {
        config: DEFAULT_CURRICULUM_CONFIG,
        profile: {}
      },
      [dueGrammarItem]
    );

    expect(ranked.candidates.map((candidate) => candidate.sentenceHash)).toEqual([
      easier.sentenceHash
    ]);
    expect(ranked.reasons).toEqual([
      expect.objectContaining({
        sentenceHash: easier.sentenceHash,
        rank: 1,
        primaryReason: "difficulty-score",
        curriculum: expect.objectContaining({
          activeBandId: "level-1a",
          eligible: true,
          skipReason: null
        })
      }),
      expect.objectContaining({
        sentenceHash: tooHard.sentenceHash,
        rank: 0,
        primaryReason: "curriculum-gate",
        signals: expect.objectContaining({
          grammarDueValue: 0.86
        }),
        curriculum: expect.objectContaining({
          activeBandId: "level-1a",
          eligible: false,
          skipReason: "above-active-band-difficulty"
        })
      })
    ]);
  });

  it("applies active curriculum sentence policy to ranking diagnostics", () => {
    const inBand = {
      sentenceHash: "sentence-in-band",
      sourceText: "The city is quiet today."
    };
    const outOfBand = {
      sentenceHash: "sentence-too-long",
      sourceText: "The quiet city center opened several public gardens for local families today."
    };

    const ranked = rankCandidatesByAnalysis(
      [outOfBand, inBand],
      [
        withTokenCount(
          createSignalOnlyAnalysisResult(outOfBand.sentenceHash, {
            vocabularyFit: 0.4,
            grammarFit: 0.4,
            dueTargetValue: 0.4,
            chunkUsefulness: 0.4,
            ambiguityPenalty: 0,
            stretchDemand: 0
          }),
          11
        ),
        withTokenCount(
          createSignalOnlyAnalysisResult(inBand.sentenceHash, {
            vocabularyFit: 0.4,
            grammarFit: 0.4,
            dueTargetValue: 0.4,
            chunkUsefulness: 0.4,
            ambiguityPenalty: 0,
            stretchDemand: 0
          }),
          5
        )
      ],
      {
        config: {
          ...DEFAULT_CURRICULUM_CONFIG,
          bands: DEFAULT_CURRICULUM_CONFIG.bands.map((band) =>
            band.bandId === "level-1a"
              ? {
                  ...band,
                  difficultyLimits: {
                    minimumScore: 0,
                    maximumScore: 1
                  }
                }
              : band
          )
        },
        profile: {}
      }
    );

    expect(ranked.candidates.map((candidate) => candidate.sentenceHash)).toEqual([
      inBand.sentenceHash,
      outOfBand.sentenceHash
    ]);
    expect(ranked.reasons).toEqual([
      expect.objectContaining({
        sentenceHash: inBand.sentenceHash,
        sentencePolicy: expect.objectContaining({
          activeBandId: "level-1a",
          tokenCount: 5,
          tokenRange: [5, 8],
          outsideRange: false
        })
      }),
      expect.objectContaining({
        sentenceHash: outOfBand.sentenceHash,
        primaryReason: "curriculum-sentence-policy",
        sentencePolicy: expect.objectContaining({
          activeBandId: "level-1a",
          tokenCount: 11,
          tokenRange: [5, 8],
          outsideRange: true
        }),
        signals: expect.objectContaining({
          sentencePolicyFit: 0.625
        })
      })
    ]);
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

function waitForMicrotasks(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
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

function createSignalOnlyAnalysisResult(
  sentenceHash: string,
  signals: AnalyzedSentenceCandidate["suitabilitySignals"]
): AnalyzedSentenceCandidate {
  return {
    ...createAnalysisResult(sentenceHash, 0),
    suitabilitySignals: signals,
    entry: {
      ...createAnalysisResult(sentenceHash, 0).entry,
      difficultyScore: undefined
    }
  };
}

function createGrammarFeature(featureKey: string) {
  return {
    featureId: `grammar:${featureKey}`,
    featureKey,
    label: "Have been",
    category: "tense-aspect" as const,
    sourceText: "has been",
    normalizedSourceText: "has been",
    span: {
      startToken: 2,
      endToken: 4,
      startChar: 9,
      endChar: 17
    },
    evidence: ["fixture"],
    confidence: 0.86
  };
}

function withTokenCount(
  result: AnalyzedSentenceCandidate,
  tokenCount: number
): AnalyzedSentenceCandidate {
  return {
    ...result,
    entry: {
      ...result.entry,
      tokens: Array.from({ length: tokenCount }, (_, index) => createToken(index))
    }
  };
}

function createToken(index: number): AnalyzerToken {
  return {
    text: `token-${index}`,
    normalized: `token-${index}`,
    lemma: `token-${index}`,
    pos: "NOUN",
    tags: ["NOUN"],
    startOffset: index * 2,
    endOffset: index * 2 + 1
  };
}

function createLearningItem(overrides: Partial<LearningItem> = {}): LearningItem {
  return {
    itemId: "word:lexeme-city",
    unitRefId: "lexeme-city",
    unitType: "word",
    sourceText: "city",
    targetText: "ciudad",
    status: "learning",
    introducedAt: "2026-04-18T09:00:00.000Z",
    nextReviewAt: "2026-04-18T09:30:00.000Z",
    interval: 600000,
    ease: 2.3,
    lapses: 0,
    assistCount: 0,
    qualifiedExposureCount: 1,
    consecutiveUnassistedCount: 1,
    distinctContextCount: 1,
    suspended: false,
    ...overrides
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
    },
    curriculum: {
      config: DEFAULT_CURRICULUM_CONFIG,
      profile: {}
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
