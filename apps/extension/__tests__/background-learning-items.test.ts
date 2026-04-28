import { RuntimeMessageType } from "@immersionkit/shared";
import type {
  GrammarFeatureMatch,
  LearningItem,
  LearningUnitType,
  ReviewEvent
} from "@immersionkit/shared";
import { describe, expect, it } from "vitest";

import { BackgroundLearningItemService } from "../src/background/learning-items";
import type {
  LearningItemRecord,
  LearningItemRepository
} from "../src/background/learning-item-repository";
import type {
  LearningHistoryRepository,
  LearningItemContextHistoryRecord
} from "../src/background/learning-history-repository";

describe("background learning item service", () => {
  it("persists assist evidence as a word learning item and review event", async () => {
    const history = new InMemoryLearningHistoryRepository();
    const items = new InMemoryLearningItemRepository();
    const service = new BackgroundLearningItemService(history, items);

    const item = await service.recordAssist({
      type: RuntimeMessageType.AssistEvent,
      eventId: "assist-1",
      itemId: "word:lemma-city",
      assistType: "manual-lookup",
      contextSentenceHash: "sentence-1",
      hostname: "fixtures.immersionkit.test",
      sessionId: "session-1",
      createdAt: "2026-04-18T10:00:00.000Z"
    });

    expect(item?.status).toBe("learning");
    expect(item?.assistCount).toBe(1);
    expect(items.items["word:lemma-city"]).toMatchObject({
      itemId: "word:lemma-city",
      status: "learning",
      assistCount: 1
    });
    expect(history.reviewEvents).toEqual([
      expect.objectContaining({
        itemId: "word:lemma-city",
        grade: "hard",
        contextSentenceHash: "sentence-1"
      })
    ]);
  });

  it("persists assist evidence for existing phrase learning items", async () => {
    const history = new InMemoryLearningHistoryRepository();
    const items = new InMemoryLearningItemRepository({
      "phrase:pattern:used-to-visit": createLearningItem({
        itemId: "phrase:pattern:used-to-visit",
        unitRefId: "pattern:used-to-visit",
        unitType: "phrase",
        sourceText: "used to visit",
        targetText: "solia visitar"
      })
    });
    const service = new BackgroundLearningItemService(history, items);

    const item = await service.recordAssist({
      type: RuntimeMessageType.AssistEvent,
      eventId: "assist-phrase-1",
      itemId: "phrase:pattern:used-to-visit",
      assistType: "phrase-gloss-reveal",
      contextSentenceHash: "sentence-1",
      hostname: "fixtures.immersionkit.test",
      sessionId: "session-1",
      createdAt: "2026-04-18T10:00:00.000Z"
    });

    expect(item).toMatchObject({
      itemId: "phrase:pattern:used-to-visit",
      unitType: "phrase",
      assistCount: 1,
      consecutiveUnassistedCount: 0
    });
    expect(history.reviewEvents).toEqual([
      expect.objectContaining({
        itemId: "phrase:pattern:used-to-visit",
        unitType: "phrase",
        grade: "hard",
        contextSentenceHash: "sentence-1"
      })
    ]);
  });

  it("assigns the active curriculum band when evidence creates a learning item", async () => {
    const history = new InMemoryLearningHistoryRepository();
    const items = new InMemoryLearningItemRepository();
    const service = new BackgroundLearningItemService(
      history,
      items,
      createBandResolver("level-1a")
    );

    const item = await service.recordAssist({
      type: RuntimeMessageType.AssistEvent,
      eventId: "assist-band-1",
      itemId: "word:lemma-city",
      assistType: "manual-lookup",
      contextSentenceHash: "sentence-1",
      hostname: "fixtures.immersionkit.test",
      sessionId: "session-1",
      createdAt: "2026-04-18T10:00:00.000Z"
    });

    expect(item?.bandId).toBe("level-1a");
    expect(items.items["word:lemma-city"]?.bandId).toBe("level-1a");
  });

  it("preserves existing learning item bands when evidence is recorded", async () => {
    const history = new InMemoryLearningHistoryRepository();
    const items = new InMemoryLearningItemRepository({
      "phrase:pattern:used-to-visit": createLearningItem({
        itemId: "phrase:pattern:used-to-visit",
        unitRefId: "pattern:used-to-visit",
        unitType: "phrase",
        sourceText: "used to visit",
        targetText: "solia visitar",
        bandId: "level-1b"
      })
    });
    const service = new BackgroundLearningItemService(
      history,
      items,
      createBandResolver("level-2a")
    );

    const item = await service.recordAssist({
      type: RuntimeMessageType.AssistEvent,
      eventId: "assist-band-phrase-1",
      itemId: "phrase:pattern:used-to-visit",
      assistType: "phrase-gloss-reveal",
      contextSentenceHash: "sentence-1",
      hostname: "fixtures.immersionkit.test",
      sessionId: "session-1",
      createdAt: "2026-04-18T10:00:00.000Z"
    });

    expect(item?.bandId).toBe("level-1b");
    expect(items.items["phrase:pattern:used-to-visit"]?.bandId).toBe("level-1b");
  });

  it("backfills missing learning item bands without changing item identity", async () => {
    const items = new InMemoryLearningItemRepository({
      "word:lemma-city": createLearningItem({
        itemId: "word:lemma-city",
        unitRefId: "lemma-city",
        unitType: "word",
        bandId: undefined
      }),
      "phrase:pattern:used-to-visit": createLearningItem({
        itemId: "phrase:pattern:used-to-visit",
        unitRefId: "pattern:used-to-visit",
        unitType: "phrase",
        sourceText: "used to visit",
        targetText: "solia visitar",
        bandId: undefined
      }),
      "word:lemma-town": createLearningItem({
        itemId: "word:lemma-town",
        unitRefId: "lemma-town",
        bandId: "level-1b"
      })
    });
    const service = new BackgroundLearningItemService(
      new InMemoryLearningHistoryRepository(),
      items,
      createUnitBandResolver({
        word: "level-1a",
        phrase: "level-2a",
        "grammar-feature": "level-3a"
      })
    );

    await expect(service.backfillMissingBands()).resolves.toEqual({
      scanned: 2,
      updated: 2,
      remaining: 0
    });
    expect(Object.keys(items.items).sort()).toEqual([
      "phrase:pattern:used-to-visit",
      "word:lemma-city",
      "word:lemma-town"
    ]);
    expect(items.items["word:lemma-city"]?.bandId).toBe("level-1a");
    expect(items.items["phrase:pattern:used-to-visit"]?.bandId).toBe("level-2a");
    expect(items.items["word:lemma-town"]?.bandId).toBe("level-1b");
  });

  it("creates durable grammar feature learning items with active grammar bands", async () => {
    const items = new InMemoryLearningItemRepository();
    const service = new BackgroundLearningItemService(
      new InMemoryLearningHistoryRepository(),
      items,
      createUnitBandResolver({
        word: "level-1a",
        phrase: "level-2a",
        "grammar-feature": "level-3a"
      })
    );

    const created = await service.upsertGrammarFeatureItems(
      [
        createGrammarFeature({
          featureKey: "aspect:have-been",
          label: "Have been"
        }),
        createGrammarFeature({
          featureKey: "aspect:have-been",
          label: "Have been"
        })
      ],
      "2026-04-18T10:00:00.000Z"
    );

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      itemId: "grammar-feature:aspect:have-been",
      unitRefId: "aspect:have-been",
      unitType: "grammar-feature",
      sourceText: "Have been",
      targetText: "",
      bandId: "level-3a",
      status: "new"
    });
    expect(items.items["grammar-feature:aspect:have-been"]).toMatchObject({
      itemId: "grammar-feature:aspect:have-been",
      unitRefId: "aspect:have-been",
      bandId: "level-3a"
    });
  });

  it("persists grammar assist evidence for existing grammar feature learning items", async () => {
    const history = new InMemoryLearningHistoryRepository();
    const items = new InMemoryLearningItemRepository({
      "grammar-feature:aspect:have-been": createLearningItem({
        itemId: "grammar-feature:aspect:have-been",
        unitRefId: "aspect:have-been",
        unitType: "grammar-feature",
        sourceText: "Have been",
        targetText: "",
        bandId: "level-3a"
      })
    });
    const service = new BackgroundLearningItemService(history, items);

    const item = await service.recordAssist({
      type: RuntimeMessageType.AssistEvent,
      eventId: "assist-grammar-1",
      itemId: "grammar-feature:aspect:have-been",
      assistType: "grammar-note-reveal",
      contextSentenceHash: "sentence-grammar-1",
      hostname: "fixtures.immersionkit.test",
      sessionId: "session-1",
      createdAt: "2026-04-18T10:00:00.000Z"
    });

    expect(item).toMatchObject({
      itemId: "grammar-feature:aspect:have-been",
      unitType: "grammar-feature",
      assistCount: 1,
      bandId: "level-3a"
    });
    expect(history.reviewEvents).toEqual([
      expect.objectContaining({
        itemId: "grammar-feature:aspect:have-been",
        unitType: "grammar-feature",
        grade: "hard",
        contextSentenceHash: "sentence-grammar-1"
      })
    ]);
  });

  it("persists grammar qualified exposure for existing grammar feature learning items", async () => {
    const history = new InMemoryLearningHistoryRepository();
    const items = new InMemoryLearningItemRepository({
      "grammar-feature:aspect:have-been": createLearningItem({
        itemId: "grammar-feature:aspect:have-been",
        unitRefId: "aspect:have-been",
        unitType: "grammar-feature",
        sourceText: "Have been",
        targetText: "",
        bandId: "level-3a",
        nextReviewAt: "2026-04-18T09:00:00.000Z"
      })
    });
    const service = new BackgroundLearningItemService(history, items);

    const item = await service.recordQualifiedExposure({
      type: RuntimeMessageType.QualifiedExposureEvent,
      eventId: "exposure-grammar-1",
      itemId: "grammar-feature:aspect:have-been",
      sentenceHash: "sentence-grammar-1",
      hostname: "fixtures.immersionkit.test",
      sessionId: "session-1",
      occurredAt: "2026-04-18T10:00:00.000Z",
      wasAssisted: true,
      confidence: 0.72,
      distinctContextKey:
        "fixtures.immersionkit.test:sentence-grammar-1:grammar:aspect:have-been"
    });

    expect(item).toMatchObject({
      itemId: "grammar-feature:aspect:have-been",
      unitType: "grammar-feature",
      qualifiedExposureCount: 2,
      consecutiveUnassistedCount: 0,
      bandId: "level-3a"
    });
    expect(history.reviewEvents).toEqual([
      expect.objectContaining({
        itemId: "grammar-feature:aspect:have-been",
        unitType: "grammar-feature",
        grade: "hard",
        contextSentenceHash: "sentence-grammar-1"
      })
    ]);
  });

  it("bounds learning item band backfills", async () => {
    const items = new InMemoryLearningItemRepository({
      "word:lemma-city": createLearningItem({
        itemId: "word:lemma-city",
        unitRefId: "lemma-city",
        bandId: undefined
      }),
      "word:lemma-town": createLearningItem({
        itemId: "word:lemma-town",
        unitRefId: "lemma-town",
        bandId: undefined
      })
    });
    const service = new BackgroundLearningItemService(
      new InMemoryLearningHistoryRepository(),
      items,
      createBandResolver("level-1a")
    );

    await expect(service.backfillMissingBands(1)).resolves.toEqual({
      scanned: 1,
      updated: 1,
      remaining: 1
    });
    expect(
      Object.values(items.items).filter((item) => item.bandId === "level-1a")
    ).toHaveLength(1);
  });

  it("lists learning items by durable unit ref ids", async () => {
    const service = new BackgroundLearningItemService(
      new InMemoryLearningHistoryRepository(),
      new InMemoryLearningItemRepository({
        "word:lemma-city": createLearningItem(),
        "phrase:pattern:used-to-visit": createLearningItem({
          itemId: "phrase:pattern:used-to-visit",
          unitRefId: "pattern:used-to-visit",
          unitType: "phrase",
          sourceText: "used to visit",
          targetText: "solia visitar"
        })
      })
    );

    await expect(
      service.listItemsByUnitRefIds(["pattern:used-to-visit", "missing"])
    ).resolves.toEqual([
      expect.objectContaining({
        itemId: "phrase:pattern:used-to-visit",
        unitRefId: "pattern:used-to-visit",
        unitType: "phrase"
      })
    ]);
  });

  it("does not create missing phrase items from loose assist evidence", async () => {
    const history = new InMemoryLearningHistoryRepository();
    const items = new InMemoryLearningItemRepository();
    const service = new BackgroundLearningItemService(history, items);

    const item = await service.recordAssist({
      type: RuntimeMessageType.AssistEvent,
      eventId: "assist-phrase-missing",
      itemId: "phrase:missing",
      assistType: "phrase-gloss-reveal",
      contextSentenceHash: "sentence-1",
      hostname: "fixtures.immersionkit.test",
      sessionId: "session-1",
      createdAt: "2026-04-18T10:00:00.000Z"
    });

    expect(item).toBeNull();
    expect(history.reviewEvents).toHaveLength(0);
    expect(items.items).toEqual({});
  });

  it("advances due qualified exposures on the interval ladder", async () => {
    const history = new InMemoryLearningHistoryRepository();
    const items = new InMemoryLearningItemRepository({
      "word:lemma-city": createLearningItem({
        qualifiedExposureCount: 0,
        consecutiveUnassistedCount: 0,
        distinctContextCount: 0
      })
    });
    const service = new BackgroundLearningItemService(history, items);

    const item = await service.recordQualifiedExposure({
      type: RuntimeMessageType.QualifiedExposureEvent,
      eventId: "exposure-1",
      itemId: "word:lemma-city",
      sentenceHash: "sentence-2",
      hostname: "fixtures.immersionkit.test",
      sessionId: "session-1",
      occurredAt: "2026-04-18T10:00:00.000Z",
      wasAssisted: false,
      confidence: 0.72,
      distinctContextKey: "fixtures.immersionkit.test:sentence-2"
    });

    expect(item?.qualifiedExposureCount).toBe(1);
    expect(item?.consecutiveUnassistedCount).toBe(1);
    expect(item?.distinctContextCount).toBe(1);
    expect(item?.status).toBe("learning");
    expect(item?.nextReviewAt).toBe("2026-04-19T10:00:00.000Z");
    expect(history.reviewEvents).toEqual([
      expect.objectContaining({
        itemId: "word:lemma-city",
        grade: "good",
        contextSentenceHash: "sentence-2"
      })
    ]);
  });

  it("dedupes repeated qualified exposures in the same context window", async () => {
    const history = new InMemoryLearningHistoryRepository({
      contextHistory: createContextHistory("2026-04-18T10:00:00.000Z"),
      reviewEvents: [createReviewEvent()]
    });
    const items = new InMemoryLearningItemRepository({
      "word:lemma-city": createLearningItem()
    });
    const service = new BackgroundLearningItemService(history, items);

    const item = await service.recordQualifiedExposure({
      type: RuntimeMessageType.QualifiedExposureEvent,
      eventId: "exposure-duplicate",
      itemId: "word:lemma-city",
      sentenceHash: "sentence-2",
      hostname: "fixtures.immersionkit.test",
      sessionId: "session-1",
      occurredAt: "2026-04-18T10:03:00.000Z",
      wasAssisted: false,
      confidence: 0.72,
      distinctContextKey: "fixtures.immersionkit.test:sentence-2"
    });

    expect(item?.qualifiedExposureCount).toBe(1);
    expect(item?.distinctContextCount).toBe(1);
    expect(item?.nextReviewAt).toBe("2026-04-18T09:30:00.000Z");
    expect(history.reviewEvents).toHaveLength(1);
    expect(
      history.contextHistory["word:lemma-city"]?.contexts[0]?.exposureCount
    ).toBe(1);
  });

  it("records repeated contexts after the dedupe window without inflating distinct contexts", async () => {
    const history = new InMemoryLearningHistoryRepository({
      contextHistory: createContextHistory("2026-04-18T10:00:00.000Z")
    });
    const items = new InMemoryLearningItemRepository({
      "word:lemma-city": createLearningItem()
    });
    const service = new BackgroundLearningItemService(history, items);

    const item = await service.recordQualifiedExposure({
      type: RuntimeMessageType.QualifiedExposureEvent,
      eventId: "exposure-repeat-later",
      itemId: "word:lemma-city",
      sentenceHash: "sentence-2",
      hostname: "fixtures.immersionkit.test",
      sessionId: "session-1",
      occurredAt: "2026-04-18T10:08:00.000Z",
      wasAssisted: false,
      confidence: 0.72,
      distinctContextKey: "fixtures.immersionkit.test:sentence-2"
    });

    expect(item?.qualifiedExposureCount).toBe(2);
    expect(item?.distinctContextCount).toBe(1);
    expect(history.contextHistory["word:lemma-city"]?.contexts[0]).toMatchObject({
      exposureCount: 2,
      lastSeenAt: "2026-04-18T10:08:00.000Z"
    });
  });

  it("keeps all learning state behind repositories", async () => {
    const history = new InMemoryLearningHistoryRepository();
    const items = new InMemoryLearningItemRepository();
    const service = new BackgroundLearningItemService(history, items);

    await service.recordAssist({
      type: RuntimeMessageType.AssistEvent,
      eventId: "assist-1",
      itemId: "word:lemma-city",
      assistType: "manual-lookup",
      contextSentenceHash: "sentence-1",
      hostname: "fixtures.immersionkit.test",
      sessionId: "session-1",
      createdAt: "2026-04-18T10:00:00.000Z"
    });
    await service.recordQualifiedExposure({
      type: RuntimeMessageType.QualifiedExposureEvent,
      eventId: "exposure-1",
      itemId: "word:lemma-city",
      sentenceHash: "sentence-2",
      hostname: "fixtures.immersionkit.test",
      sessionId: "session-1",
      occurredAt: "2026-04-18T10:45:00.000Z",
      wasAssisted: false,
      confidence: 0.72,
      distinctContextKey: "fixtures.immersionkit.test:sentence-2"
    });

    expect(items.items["word:lemma-city"]).toMatchObject({
      itemId: "word:lemma-city",
      qualifiedExposureCount: 1
    });
    expect(history.reviewEvents).toEqual([
      expect.objectContaining({ eventId: "assist-1:review", unitType: "word" }),
      expect.objectContaining({ eventId: "exposure-1:review", unitType: "word" })
    ]);
    expect(history.contextHistory["word:lemma-city"]?.contexts).toEqual([
      expect.objectContaining({
        key: "fixtures.immersionkit.test:sentence-2"
      })
    ]);
  });

  it("reads prior review and context history through the repository boundary", async () => {
    const history = new InMemoryLearningHistoryRepository({
      contextHistory: createContextHistory("2026-04-18T10:00:00.000Z"),
      reviewEvents: [createReviewEvent()]
    });
    const items = new InMemoryLearningItemRepository({
      "word:lemma-city": createLearningItem()
    });
    const service = new BackgroundLearningItemService(history, items);

    const item = await service.recordQualifiedExposure({
      type: RuntimeMessageType.QualifiedExposureEvent,
      eventId: "exposure-repeat-later",
      itemId: "word:lemma-city",
      sentenceHash: "sentence-2",
      hostname: "fixtures.immersionkit.test",
      sessionId: "session-1",
      occurredAt: "2026-04-18T10:08:00.000Z",
      wasAssisted: false,
      confidence: 0.72,
      distinctContextKey: "fixtures.immersionkit.test:sentence-2"
    });

    expect(item?.qualifiedExposureCount).toBe(2);
    expect(item?.distinctContextCount).toBe(1);
    expect(history.reviewEvents).toHaveLength(2);
    expect(history.contextHistory["word:lemma-city"]?.contexts[0]).toMatchObject({
      exposureCount: 2,
      lastSeenAt: "2026-04-18T10:08:00.000Z"
    });
  });
});

function createLearningItem(overrides: Partial<LearningItem> = {}): LearningItem {
  return {
    itemId: "word:lemma-city",
    unitRefId: "lemma-city",
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

function createGrammarFeature(
  overrides: Partial<GrammarFeatureMatch> = {}
): GrammarFeatureMatch {
  return {
    featureId: "grammar:aspect:have-been",
    featureKey: "aspect:have-been",
    label: "Have been",
    category: "tense-aspect",
    sourceText: "has been",
    normalizedSourceText: "has been",
    span: {
      startToken: 0,
      endToken: 2,
      startChar: 0,
      endChar: 8
    },
    evidence: ["fixture"],
    confidence: 0.86,
    ...overrides
  };
}

function createContextHistory(
  lastSeenAt: string
): LearningItemContextHistoryRecord {
  return {
    "word:lemma-city": {
      itemId: "word:lemma-city",
      contexts: [
        {
          key: "fixtures.immersionkit.test:sentence-2",
          firstSeenAt: "2026-04-18T10:00:00.000Z",
          lastSeenAt,
          exposureCount: 1
        }
      ]
    }
  };
}

function createReviewEvent(): ReviewEvent {
  return {
    eventId: "exposure-1:review",
    itemId: "word:lemma-city",
    eventType: "implicit-exposure",
    grade: "good",
    contextSentenceHash: "sentence-2",
    hostname: "fixtures.immersionkit.test",
    sessionId: "session-1",
    createdAt: "2026-04-18T10:00:00.000Z"
  };
}

function createBandResolver(bandId: string) {
  return (_unitType: LearningUnitType) => Promise.resolve(bandId);
}

function createUnitBandResolver(bands: Record<LearningUnitType, string | null>) {
  return (unitType: LearningUnitType) => Promise.resolve(bands[unitType] ?? null);
}

class InMemoryLearningItemRepository implements LearningItemRepository {
  items: LearningItemRecord;

  constructor(initial: LearningItemRecord = {}) {
    this.items = { ...initial };
  }

  async loadAll(): Promise<LearningItemRecord> {
    return { ...this.items };
  }

  async persistAll(items: LearningItemRecord): Promise<void> {
    this.items = { ...items };
  }
}

class InMemoryLearningHistoryRepository implements LearningHistoryRepository {
  reviewEvents: ReviewEvent[];
  contextHistory: LearningItemContextHistoryRecord;

  constructor(initial?: {
    reviewEvents?: ReviewEvent[];
    contextHistory?: LearningItemContextHistoryRecord;
  }) {
    this.reviewEvents = [...(initial?.reviewEvents ?? [])];
    this.contextHistory = { ...(initial?.contextHistory ?? {}) };
  }

  async loadReviewEvents(): Promise<ReviewEvent[]> {
    return [...this.reviewEvents];
  }

  async persistReviewEvents(events: readonly ReviewEvent[]): Promise<void> {
    this.reviewEvents = [...events];
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
    this.reviewEvents = [];
    this.contextHistory = {};
  }
}
