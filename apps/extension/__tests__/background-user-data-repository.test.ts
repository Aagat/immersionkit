import { describe, expect, it } from "vitest";

import {
  IndexedDbLearningItemRepository,
  type LearningItemRecord
} from "../src/background/learning-item-repository";
import { IndexedDbLearningHistoryRepository } from "../src/background/learning-history-repository";
import {
  IndexedDbUserVocabRepository,
  loadUserDataValues,
  setUserDataValues
} from "../src/background/user-data-repository";
import { installChromeStub } from "./helpers/chrome-stub";
import { installIndexedDbStub } from "./helpers/indexeddb-stub";

describe("background user data repositories", () => {
  it("stores settings and vocab state in IndexedDB without chrome storage writes", async () => {
    const indexedDbStub = installIndexedDbStub();
    const chromeStub = installChromeStub();

    try {
      await setUserDataValues({
        "immersionkit.settings": {
          discoveryRate: 0.25,
          targetLanguage: "es",
          sentenceTranslationEnabled: false,
          provider: "none"
        },
        settings: {
          discoveryRate: 0.75
        }
      });
      await new IndexedDbUserVocabRepository().setStatus({
        lemmaId: "lemma-city",
        status: "known",
        updatedAt: "2026-05-07T10:00:00.000Z"
      });

      await expect(
        loadUserDataValues(["immersionkit.settings", "settings"])
      ).resolves.toEqual({
        "immersionkit.settings": {
          discoveryRate: 0.25,
          targetLanguage: "es",
          sentenceTranslationEnabled: false,
          provider: "none"
        }
      });
      await expect(
        new IndexedDbUserVocabRepository().loadAll()
      ).resolves.toEqual(
        new Map([
          [
            "lemma-city",
            {
              lemmaId: "lemma-city",
              status: "known",
              updatedAt: "2026-05-07T10:00:00.000Z",
              createdAt: "2026-05-07T10:00:00.000Z",
              lastSeenAt: "2026-05-07T10:00:00.000Z",
              exposureCount: 1
            }
          ]
        ])
      );
      expect(chromeStub.getStorageSnapshot()).toEqual({});
    } finally {
      chromeStub.restore();
      indexedDbStub.restore();
    }
  });

  it("stores spaced-repetition learning state and history in IndexedDB", async () => {
    const indexedDbStub = installIndexedDbStub();
    const chromeStub = installChromeStub();
    const learningItems = new IndexedDbLearningItemRepository();
    const history = new IndexedDbLearningHistoryRepository();
    const items: LearningItemRecord = {
      "word:lemma-city": {
        itemId: "word:lemma-city",
        unitRefId: "lemma-city",
        unitType: "word",
        sourceText: "city",
        targetText: "ciudad",
        status: "reviewing",
        introducedAt: "2026-05-07T09:00:00.000Z",
        lastExposedAt: "2026-05-07T09:10:00.000Z",
        lastReviewedAt: "2026-05-07T09:15:00.000Z",
        nextReviewAt: "2026-05-08T09:15:00.000Z",
        interval: 86_400_000,
        ease: 2.45,
        lapses: 1,
        assistCount: 2,
        qualifiedExposureCount: 3,
        consecutiveUnassistedCount: 2,
        distinctContextCount: 2,
        suspended: false
      }
    };

    try {
      await learningItems.persistAll(items);
      await history.persistReviewEvents([
        {
          eventId: "review-1",
          itemId: "word:lemma-city",
          unitType: "word",
          eventType: "explicit-review",
          grade: "good",
          createdAt: "2026-05-07T09:15:00.000Z",
          contextSentenceHash: "sentence-1"
        }
      ]);
      await history.persistContextHistory({
        "word:lemma-city": {
          itemId: "word:lemma-city",
          contexts: [
            {
              key: "example.test:sentence-1",
              firstSeenAt: "2026-05-07T09:10:00.000Z",
              lastSeenAt: "2026-05-07T09:10:00.000Z",
              exposureCount: 1
            }
          ]
        }
      });

      await expect(learningItems.loadAll()).resolves.toMatchObject(items);
      await expect(history.loadReviewEvents()).resolves.toHaveLength(1);
      await expect(history.loadContextHistory()).resolves.toEqual({
        "word:lemma-city": {
          itemId: "word:lemma-city",
          contexts: [
            {
              key: "example.test:sentence-1",
              firstSeenAt: "2026-05-07T09:10:00.000Z",
              lastSeenAt: "2026-05-07T09:10:00.000Z",
              exposureCount: 1
            }
          ]
        }
      });
      expect(chromeStub.getStorageSnapshot()).toEqual({});
    } finally {
      chromeStub.restore();
      indexedDbStub.restore();
    }
  });
});
