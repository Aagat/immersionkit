import type { PhraseOccurrence } from "@immersionkit/shared";
import { describe, expect, it } from "vitest";

import { IndexedDbPhraseRegistryRepository } from "../src/background/phrase-registry";
import type {
  PhraseRegistryRecord,
  PhraseRegistryStore
} from "../src/background/phrase-registry";
import type {
  LearningItemRecord,
  LearningItemRepository
} from "../src/background/learning-item-repository";

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
      targetText: "cuidar de"
    });
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
