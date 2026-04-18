import { hashSentence } from "@immersionkit/shared";
import type { QueueSentenceCandidatesMessage, SentenceCacheEntry } from "@immersionkit/shared";

import {
  createSentenceProviderClient,
  type ProviderSentenceCandidate
} from "./provider-client";
import { ChromeStorageSentenceCacheRepository } from "./sentence-cache";
import {
  loadBackgroundRuntimeConfig,
  type BackgroundRuntimeConfig
} from "./settings";

const MAX_CANDIDATES_PER_MESSAGE = 12;
const MAX_SENTENCE_QUEUE_SIZE = 150;
const MAX_SENTENCE_LENGTH = 360;
const QUEUE_FLUSH_DELAY_MS = 220;
const MAX_PROVIDER_ATTEMPTS = 2;

type QueuedSentenceCandidate = ProviderSentenceCandidate & {
  attempts: number;
  senderTabIds: Set<number>;
};

export type TranslationAvailability =
  | "ready"
  | "feature-disabled"
  | "provider-disabled"
  | "missing-credentials";

export type CachedSentenceResult = {
  sentenceHash: string;
  sourceText: string;
  translatedText: string;
  grammarNote: string;
};

export type QueueSentenceCandidatesResponse = {
  ok: boolean;
  accepted: number;
  queued: number;
  skipped: number;
  cacheHits: number;
  translationAvailability: TranslationAvailability;
  cachedResults: CachedSentenceResult[];
};

export class SentenceQueueOrchestrator {
  private readonly sentenceCache = new ChromeStorageSentenceCacheRepository();
  private readonly pendingQueue = new Map<string, QueuedSentenceCandidate>();
  private readonly inFlightHashes = new Set<string>();
  private flushTimer: number | null = null;
  private isProcessing = false;

  async queueMessage(
    message: QueueSentenceCandidatesMessage,
    senderTabId?: number
  ): Promise<QueueSentenceCandidatesResponse> {
    const candidates = normalizeSentenceCandidates(message.sentences);
    if (candidates.length === 0) {
      const config = await loadBackgroundRuntimeConfig();
      return {
        ok: true,
        accepted: 0,
        queued: 0,
        skipped: 0,
        cacheHits: 0,
        translationAvailability: resolveTranslationAvailability(config),
        cachedResults: []
      };
    }

    const config = await loadBackgroundRuntimeConfig();
    const translationAvailability = resolveTranslationAvailability(config);
    const cacheHits = await this.findCachedEntries(candidates);
    const cachedByHash = new Set(cacheHits.map((entry) => entry.sentenceHash));
    const uncachedCandidates = candidates.filter(
      (candidate) => !cachedByHash.has(candidate.sentenceHash)
    );

    let queued = 0;
    let skipped = candidates.length - uncachedCandidates.length;

    if (translationAvailability === "ready") {
      const enqueueSummary = this.enqueueCandidates(uncachedCandidates, senderTabId);
      queued = enqueueSummary.queued;
      skipped += enqueueSummary.skipped;

      if (queued > 0) {
        this.scheduleQueueFlush();
      }
    } else {
      skipped += uncachedCandidates.length;
    }

    return {
      ok: true,
      accepted: candidates.length,
      queued,
      skipped,
      cacheHits: cacheHits.length,
      translationAvailability,
      cachedResults: cacheHits.map((entry) => ({
        sentenceHash: entry.sentenceHash,
        sourceText: entry.sourceText,
        translatedText: entry.translatedText,
        grammarNote: entry.grammarNote
      }))
    };
  }

  private enqueueCandidates(
    candidates: readonly ProviderSentenceCandidate[],
    senderTabId?: number
  ): { queued: number; skipped: number } {
    let queued = 0;
    let skipped = 0;

    for (const candidate of candidates) {
      if (this.inFlightHashes.has(candidate.sentenceHash)) {
        skipped += 1;
        continue;
      }

      const existing = this.pendingQueue.get(candidate.sentenceHash);
      if (existing) {
        if (typeof senderTabId === "number") {
          existing.senderTabIds.add(senderTabId);
        }

        skipped += 1;
        continue;
      }

      if (this.pendingQueue.size >= MAX_SENTENCE_QUEUE_SIZE) {
        skipped += 1;
        continue;
      }

      this.pendingQueue.set(candidate.sentenceHash, {
        ...candidate,
        attempts: 0,
        senderTabIds: new Set(
          typeof senderTabId === "number" ? [senderTabId] : []
        )
      });
      queued += 1;
    }

    return { queued, skipped };
  }

  private scheduleQueueFlush(delayMs = QUEUE_FLUSH_DELAY_MS) {
    if (this.flushTimer !== null) {
      return;
    }

    this.flushTimer = globalThis.setTimeout(() => {
      this.flushTimer = null;
      void this.flushQueue();
    }, delayMs);
  }

  private async flushQueue() {
    if (this.isProcessing || this.pendingQueue.size === 0) {
      return;
    }

    this.isProcessing = true;
    let batch: QueuedSentenceCandidate[] = [];

    try {
      const config = await loadBackgroundRuntimeConfig();
      if (resolveTranslationAvailability(config) !== "ready") {
        this.pendingQueue.clear();
        return;
      }

      const providerClient = createSentenceProviderClient(
        config.settings.provider,
        config.credentials
      );
      if (!providerClient) {
        this.pendingQueue.clear();
        return;
      }

      batch = this.takeBatch(config.settings.sentenceBatchSize);
      if (batch.length === 0) {
        return;
      }

      for (const candidate of batch) {
        this.inFlightHashes.add(candidate.sentenceHash);
      }

      const cachedEntries = await this.sentenceCache.getByHashes(
        batch.map((candidate) => candidate.sentenceHash)
      );
      const cachedHashes = new Set(cachedEntries.map((entry) => entry.sentenceHash));
      const uncachedBatch = batch.filter(
        (candidate) => !cachedHashes.has(candidate.sentenceHash)
      );

      if (uncachedBatch.length === 0) {
        return;
      }

      const translations = await providerClient.translateSentences({
        sourceLanguage: config.settings.sourceLanguage,
        targetLanguage: config.settings.targetLanguage,
        candidates: uncachedBatch.map((candidate) => ({
          sentenceHash: candidate.sentenceHash,
          sourceText: candidate.sourceText
        }))
      });

      if (translations.length === 0) {
        return;
      }

      const now = new Date().toISOString();
      const entries: SentenceCacheEntry[] = translations.map((translation) => ({
        sentenceHash: translation.sentenceHash,
        sourceText: translation.sourceText,
        translatedText: translation.translatedText,
        grammarNote: translation.grammarNote,
        targetLanguage: config.settings.targetLanguage,
        sourceLanguage: config.settings.sourceLanguage,
        model: translation.model,
        promptVersion: translation.promptVersion,
        createdAt: now,
        lastAccessedAt: now,
        provider: providerClient.providerName
      }));

      await this.sentenceCache.putMany(entries);
    } catch (error) {
      this.requeueBatch(batch);
      console.warn("ImmersionKit sentence queue flush failed.", error);
    } finally {
      for (const candidate of batch) {
        this.inFlightHashes.delete(candidate.sentenceHash);
      }

      this.isProcessing = false;
      if (this.pendingQueue.size > 0) {
        this.scheduleQueueFlush();
      }
    }
  }

  private takeBatch(size: number): QueuedSentenceCandidate[] {
    const batch: QueuedSentenceCandidate[] = [];
    const safeSize = Math.min(5, Math.max(1, Math.round(size)));

    for (const [hash, candidate] of this.pendingQueue.entries()) {
      batch.push(candidate);
      this.pendingQueue.delete(hash);

      if (batch.length >= safeSize) {
        break;
      }
    }

    return batch;
  }

  private requeueBatch(batch: readonly QueuedSentenceCandidate[]) {
    for (const candidate of batch) {
      if (candidate.attempts + 1 >= MAX_PROVIDER_ATTEMPTS) {
        continue;
      }

      this.pendingQueue.set(candidate.sentenceHash, {
        ...candidate,
        attempts: candidate.attempts + 1
      });
    }
  }

  private async findCachedEntries(
    candidates: readonly ProviderSentenceCandidate[]
  ): Promise<SentenceCacheEntry[]> {
    if (candidates.length === 0) {
      return [];
    }

    const hashes = candidates.map((candidate) => candidate.sentenceHash);
    const hits = await this.sentenceCache.getByHashes(hashes);
    if (hits.length === 0) {
      return hits;
    }

    // Cache lookups update access metadata so follow-on cleanup policies can use recency.
    const now = new Date().toISOString();
    await this.sentenceCache.putMany(
      hits.map((entry) => ({
        ...entry,
        lastAccessedAt: now
      }))
    );

    return hits;
  }
}

function normalizeSentenceCandidates(
  sentences: readonly string[] | undefined
): ProviderSentenceCandidate[] {
  if (!Array.isArray(sentences)) {
    return [];
  }

  const candidatesByHash = new Map<string, ProviderSentenceCandidate>();
  for (const sentence of sentences.slice(0, MAX_CANDIDATES_PER_MESSAGE)) {
    if (typeof sentence !== "string") {
      continue;
    }

    const normalizedText = sentence.replace(/\s+/g, " ").trim();
    if (!normalizedText) {
      continue;
    }

    const sourceText = normalizedText.slice(0, MAX_SENTENCE_LENGTH);
    const sentenceHash = hashSentence(sourceText);
    if (candidatesByHash.has(sentenceHash)) {
      continue;
    }

    candidatesByHash.set(sentenceHash, {
      sentenceHash,
      sourceText
    });
  }

  return [...candidatesByHash.values()];
}

function resolveTranslationAvailability(
  config: BackgroundRuntimeConfig
): TranslationAvailability {
  if (!config.settings.sentenceTranslationEnabled) {
    return "feature-disabled";
  }

  if (config.settings.provider !== "openai") {
    return "provider-disabled";
  }

  if (!config.credentials.openAiApiKey) {
    return "missing-credentials";
  }

  return "ready";
}

