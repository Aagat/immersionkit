import { RuntimeMessageType } from "@immersionkit/shared";
import { describe, expect, it } from "vitest";

import { BackgroundLearningItemService } from "../src/background/learning-items";
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
});
