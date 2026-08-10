import {
  RuntimeMessageType,
  type PhraseOccurrence,
  type ReviewEvent
} from "@immersionkit/shared";
import { describe, expect, it } from "vitest";

import { BackgroundLearningItemService } from "../src/background/learning-items";
import { IndexedDbPhraseRegistryRepository } from "../src/background/phrase-registry";
import type {
  PhraseRegistryRecord,
  PhraseRegistryStore
} from "../src/background/phrase-registry";
import type {
  LearningHistoryRepository,
  LearningItemContextHistoryRecord
} from "../src/background/learning-history-repository";
import type {
  LearningItemRecord,
  LearningItemRepository
} from "../src/storage/learning-item-repository";

describe("background phrase registry", () => {
  it("creates phrase learning items after registry identity exists", async () => {
    const learningItems = new InMemoryLearningItemRepository();
    const registryStore = new InMemoryPhraseRegistryStore();
    const registry = new IndexedDbPhraseRegistryRepository(
      learningItems,
      registryStore
    );
    const occurrence = createPhraseOccurrence(
      "phrase:fixed-phrase:take-care-of:cuidar-de"
    );

    const [entry] = await registry.upsertOccurrences([
      occurrence
    ], "2026-04-25T10:00:00.000Z");
    await registry.upsertOccurrences([
      occurrence
    ], "2026-04-25T10:05:00.000Z");

    expect(await registry.get(entry.phraseId)).toMatchObject({
      phraseId: entry.phraseId,
      exposureCount: 2,
      lastSeenAt: "2026-04-25T10:05:00.000Z"
    });
    expect(learningItems.items).toMatchObject({
      [`phrase:${entry.phraseId}`]: {
        itemId: `phrase:${entry.phraseId}`,
        unitRefId: entry.phraseId,
        unitType: "phrase",
        bandId: "level-2b",
        targetText: "cuidar de",
        status: "new"
      }
    });
  });

  it("refreshes existing phrase learning item text when the registry target improves", async () => {
    const learningItems = new InMemoryLearningItemRepository();
    const registryStore = new InMemoryPhraseRegistryStore();
    const registry = new IndexedDbPhraseRegistryRepository(
      learningItems,
      registryStore
    );
    const occurrence = createPhraseOccurrence(
      "phrase:fixed-phrase:take-care-of:cuidar-de"
    );

    learningItems.items[`phrase:${occurrence.phraseId}`] = {
      itemId: `phrase:${occurrence.phraseId}`,
      unitRefId: occurrence.phraseId,
      unitType: "phrase",
      sourceText: "take care of",
      targetText: "",
      status: "new",
      introducedAt: "2026-04-25T09:00:00.000Z",
      nextReviewAt: "2026-04-25T09:00:00.000Z",
      interval: 600000,
      ease: 2.3,
      lapses: 0,
      assistCount: 0,
      qualifiedExposureCount: 0,
      consecutiveUnassistedCount: 0,
      distinctContextCount: 0,
      suspended: false
    };

    await registry.upsertOccurrences([occurrence], "2026-04-25T10:00:00.000Z");

    expect(learningItems.items[`phrase:${occurrence.phraseId}`]).toMatchObject({
      sourceText: "take care of",
      targetText: "cuidar de",
      bandId: "level-2b"
    });
  });

  it("preserves concurrent phrase occurrence batches", async () => {
    const learningItems = new InMemoryLearningItemRepository();
    const registryStore = new InMemoryPhraseRegistryStore();
    const registry = new IndexedDbPhraseRegistryRepository(
      learningItems,
      registryStore
    );

    await Promise.all(
      Array.from({ length: 4 }, (_unused, index) =>
        registry.upsertOccurrences(
          [
            createPhraseOccurrence(
              `phrase:fixed-phrase:take-care-of-${index}:cuidar-de`
            )
          ],
          "2026-04-25T10:00:00.000Z"
        )
      )
    );

    expect(Object.keys(registryStore.registry)).toHaveLength(4);
    expect(Object.keys(learningItems.items)).toHaveLength(4);
  });

  it("preserves overlapping phrase and exposure learning-item writes", async () => {
    const learningItems = new InMemoryLearningItemRepository();
    const registry = new IndexedDbPhraseRegistryRepository(
      learningItems,
      new InMemoryPhraseRegistryStore()
    );
    const learningService = new BackgroundLearningItemService(
      new InMemoryLearningHistoryRepository(),
      learningItems,
      () => Promise.resolve("level-1a")
    );
    const occurrence = createPhraseOccurrence(
      "phrase:fixed-phrase:take-care-of:cuidar-de"
    );

    await Promise.all([
      registry.upsertOccurrences([occurrence], "2026-04-25T10:00:00.000Z"),
      learningService.recordQualifiedExposure({
        type: RuntimeMessageType.QualifiedExposureEvent,
        eventId: "cross-service-exposure-1",
        itemId: "word:cross-service",
        sentenceHash: "cross-service-sentence-1",
        hostname: "fixtures.immersionkit.test",
        sessionId: "cross-service-session",
        occurredAt: "2026-04-25T10:00:00.000Z",
        wasAssisted: false,
        confidence: 0.72,
        distinctContextKey: "fixtures.immersionkit.test:cross-service-sentence-1"
      })
    ]);

    expect(learningItems.items).toHaveProperty(`phrase:${occurrence.phraseId}`);
    expect(learningItems.items).toHaveProperty("word:cross-service");
  });
});

class InMemoryLearningItemRepository implements LearningItemRepository {
  items: LearningItemRecord = {};

  async loadAll(): Promise<LearningItemRecord> {
    return { ...this.items };
  }

  async persistAll(items: LearningItemRecord): Promise<void> {
    this.items = { ...items };
  }
}

class InMemoryPhraseRegistryStore implements PhraseRegistryStore {
  registry: PhraseRegistryRecord = {};

  async loadAll(): Promise<PhraseRegistryRecord> {
    return { ...this.registry };
  }

  async persistAll(registry: PhraseRegistryRecord): Promise<void> {
    this.registry = { ...registry };
  }
}

class InMemoryLearningHistoryRepository implements LearningHistoryRepository {
  private events: ReviewEvent[] = [];
  private contextHistory: LearningItemContextHistoryRecord = {};

  async loadReviewEvents(): Promise<ReviewEvent[]> {
    return [...this.events];
  }

  async persistReviewEvents(events: readonly ReviewEvent[]): Promise<void> {
    this.events = [...events];
  }

  async loadContextHistory(): Promise<LearningItemContextHistoryRecord> {
    return { ...this.contextHistory };
  }

  async persistContextHistory(
    history: LearningItemContextHistoryRecord
  ): Promise<void> {
    this.contextHistory = { ...history };
  }

  async clear(): Promise<void> {
    this.events = [];
    this.contextHistory = {};
  }
}

function createPhraseOccurrence(phraseId: string): PhraseOccurrence {
  return {
    occurrenceId: "sentence-1:fixture-v1:0-3:fixed:take-care-of",
    phraseId,
    sentenceHash: "sentence-1",
    analyzerVersion: "fixture-v1",
    sourceText: "take care of",
    normalizedSourceText: "take care of",
    targetText: "cuidar de",
    normalizedTargetText: "cuidar de",
    phraseMinBand: "level-2b",
    sourceKind: "fixed-phrase",
    category: "fixed-idiom",
    ruleId: "fixed:take-care-of",
    span: {
      startToken: 0,
      endToken: 3,
      startChar: 0,
      endChar: 12
    },
    confidence: 0.94
  };
}
