import {
  DEFAULT_EXTENSION_SETTINGS,
  RuntimeMessageType,
  hashSentence,
  type SentenceCacheEntry,
  type SentenceCacheRepository
} from "@immersionkit/shared";
import { describe, expect, it, vi } from "vitest";

import type { SentenceProviderClient } from "../src/background/provider-client";
import type { BackgroundRuntimeConfig } from "../src/background/settings";
import {
  SentenceQueueOrchestrator,
  type SentenceTranslationDelivery
} from "../src/background/sentence-queue";

describe("sentence queue orchestration", () => {
  it("returns cache hits immediately in queue response", async () => {
    const sourceText = "The station opens early in the morning.";
    const sentenceHash = hashSentence(sourceText);
    const cache = new InMemorySentenceCache([
      createCacheEntry({
        sentenceHash,
        sourceText,
        translatedText: "La estacion abre temprano por la manana.",
        grammarNote: "Present tense states a routine action."
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
        grammarNote: "Present tense states a routine action."
      }
    ]);
    expect(providerCalls).not.toHaveBeenCalled();
  });

  it("delivers fresh background translations to the sender tab", async () => {
    const sourceText = "The museum offers guided tours on Sundays.";
    const sentenceHash = hashSentence(sourceText);
    const cache = new InMemorySentenceCache();

    const translatedText = "El museo ofrece visitas guiadas los domingos.";
    const grammarNote = "Present tense and plural noun agreement.";

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
            grammarNote
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
            grammarNote
          }
        ]
      }
    ]);
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

function createProviderClientMock(
  translations: {
    sentenceHash: string;
    sourceText: string;
    translatedText: string;
    grammarNote: string;
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
          grammarNote: string;
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
          grammarNote: translation.grammarNote,
          model: "test-model",
          promptVersion: "test-prompt-v1"
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
    "sentenceHash" | "sourceText" | "translatedText" | "grammarNote"
  >
): SentenceCacheEntry {
  return {
    ...input,
    targetLanguage: "es",
    sourceLanguage: "en",
    model: "cached-model",
    promptVersion: "cached-prompt-v1",
    provider: "openai",
    createdAt: "2026-04-17T10:00:00.000Z",
    lastAccessedAt: "2026-04-17T10:00:00.000Z"
  };
}
