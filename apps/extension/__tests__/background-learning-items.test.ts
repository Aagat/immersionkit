import { RuntimeMessageType } from "@immersionkit/shared";
import type { ReviewEvent } from "@immersionkit/shared";
import { describe, expect, it } from "vitest";

import { BackgroundLearningItemService } from "../src/background/learning-items";
import type {
  LearningHistoryRepository,
  LearningItemContextHistoryRecord
} from "../src/background/learning-history-repository";
import { installChromeStub } from "./helpers/chrome-stub";

describe("background learning item service", () => {
  it("persists assist evidence as a word learning item and review event", async () => {
    const chromeStub = installChromeStub();
    const service = new BackgroundLearningItemService();

    try {
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

      const storage = chromeStub.getStorageSnapshot();
      expect(item?.status).toBe("learning");
      expect(item?.assistCount).toBe(1);
      expect(storage["immersionkit.learningItems"]).toMatchObject({
        "word:lemma-city": {
          itemId: "word:lemma-city",
          status: "learning",
          assistCount: 1
        }
      });
      expect(storage["immersionkit.reviewEvents"]).toEqual([
        expect.objectContaining({
          itemId: "word:lemma-city",
          grade: "hard",
          contextSentenceHash: "sentence-1"
        })
      ]);
    } finally {
      chromeStub.restore();
    }
  });

  it("advances due qualified exposures on the interval ladder", async () => {
    const chromeStub = installChromeStub({
      "immersionkit.learningItems": {
        "word:lemma-city": {
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
          qualifiedExposureCount: 0,
          consecutiveUnassistedCount: 0,
          distinctContextCount: 0,
          suspended: false
        }
      }
    });
    const service = new BackgroundLearningItemService();

    try {
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
      expect(chromeStub.getStorageSnapshot()["immersionkit.reviewEvents"]).toEqual([
        expect.objectContaining({
          itemId: "word:lemma-city",
          grade: "good",
          contextSentenceHash: "sentence-2"
        })
      ]);
    } finally {
      chromeStub.restore();
    }
  });

  it("dedupes repeated qualified exposures in the same context window", async () => {
    const chromeStub = installChromeStub({
      "immersionkit.learningItems": {
        "word:lemma-city": {
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
          suspended: false
        }
      },
      "immersionkit.learningItemContextHistory": {
        "word:lemma-city": {
          itemId: "word:lemma-city",
          contexts: [
            {
              key: "fixtures.immersionkit.test:sentence-2",
              firstSeenAt: "2026-04-18T10:00:00.000Z",
              lastSeenAt: "2026-04-18T10:00:00.000Z",
              exposureCount: 1
            }
          ]
        }
      },
      "immersionkit.reviewEvents": [
        {
          eventId: "exposure-1:review",
          itemId: "word:lemma-city",
          eventType: "implicit-exposure",
          grade: "good",
          contextSentenceHash: "sentence-2",
          hostname: "fixtures.immersionkit.test",
          sessionId: "session-1",
          createdAt: "2026-04-18T10:00:00.000Z"
        }
      ]
    });
    const service = new BackgroundLearningItemService();

    try {
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
      expect(chromeStub.getStorageSnapshot()["immersionkit.reviewEvents"]).toHaveLength(1);
      expect(
        (
          chromeStub.getStorageSnapshot()["immersionkit.learningItemContextHistory"] as {
            "word:lemma-city": { contexts: Array<{ exposureCount: number }> };
          }
        )["word:lemma-city"].contexts[0].exposureCount
      ).toBe(1);
    } finally {
      chromeStub.restore();
    }
  });

  it("records repeated contexts after the dedupe window without inflating distinct contexts", async () => {
    const chromeStub = installChromeStub({
      "immersionkit.learningItems": {
        "word:lemma-city": {
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
          suspended: false
        }
      },
      "immersionkit.learningItemContextHistory": {
        "word:lemma-city": {
          itemId: "word:lemma-city",
          contexts: [
            {
              key: "fixtures.immersionkit.test:sentence-2",
              firstSeenAt: "2026-04-18T10:00:00.000Z",
              lastSeenAt: "2026-04-18T10:00:00.000Z",
              exposureCount: 1
            }
          ]
        }
      }
    });
    const service = new BackgroundLearningItemService();

    try {
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
      expect(
        (
          chromeStub.getStorageSnapshot()["immersionkit.learningItemContextHistory"] as {
            "word:lemma-city": { contexts: Array<{ exposureCount: number; lastSeenAt: string }> };
          }
        )["word:lemma-city"].contexts[0]
      ).toMatchObject({
        exposureCount: 2,
        lastSeenAt: "2026-04-18T10:08:00.000Z"
      });
    } finally {
      chromeStub.restore();
    }
  });

  it("can persist high-growth review and context history outside chrome storage", async () => {
    const chromeStub = installChromeStub();
    const repository = new InMemoryLearningHistoryRepository();
    const service = new BackgroundLearningItemService(repository);

    try {
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

      const storage = chromeStub.getStorageSnapshot();
      expect(storage["immersionkit.learningItems"]).toMatchObject({
        "word:lemma-city": {
          itemId: "word:lemma-city",
          qualifiedExposureCount: 1
        }
      });
      expect(storage["immersionkit.reviewEvents"]).toBeUndefined();
      expect(storage["immersionkit.learningItemContextHistory"]).toBeUndefined();
      expect(repository.reviewEvents).toEqual([
        expect.objectContaining({ eventId: "assist-1:review" }),
        expect.objectContaining({ eventId: "exposure-1:review" })
      ]);
      expect(repository.contextHistory["word:lemma-city"]?.contexts).toEqual([
        expect.objectContaining({
          key: "fixtures.immersionkit.test:sentence-2"
        })
      ]);
    } finally {
      chromeStub.restore();
    }
  });

  it("reads migrated review and context history through the repository boundary", async () => {
    const chromeStub = installChromeStub({
      "immersionkit.learningItems": {
        "word:lemma-city": {
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
          suspended: false
        }
      }
    });
    const repository = new InMemoryLearningHistoryRepository({
      contextHistory: {
        "word:lemma-city": {
          itemId: "word:lemma-city",
          contexts: [
            {
              key: "fixtures.immersionkit.test:sentence-2",
              firstSeenAt: "2026-04-18T10:00:00.000Z",
              lastSeenAt: "2026-04-18T10:00:00.000Z",
              exposureCount: 1
            }
          ]
        }
      },
      reviewEvents: [
        {
          eventId: "exposure-1:review",
          itemId: "word:lemma-city",
          eventType: "implicit-exposure",
          grade: "good",
          contextSentenceHash: "sentence-2",
          hostname: "fixtures.immersionkit.test",
          sessionId: "session-1",
          createdAt: "2026-04-18T10:00:00.000Z"
        }
      ]
    });
    const service = new BackgroundLearningItemService(repository);

    try {
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
      expect(repository.reviewEvents).toHaveLength(2);
      expect(
        repository.contextHistory["word:lemma-city"]?.contexts[0]
      ).toMatchObject({
        exposureCount: 2,
        lastSeenAt: "2026-04-18T10:08:00.000Z"
      });
    } finally {
      chromeStub.restore();
    }
  });
});

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
