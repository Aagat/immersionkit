import { describe, expect, it } from "vitest";

import {
  IndexedDbLearningItemRepository,
  type LearningItemRecord
} from "../src/storage/learning-item-repository";
import { IndexedDbLearningHistoryRepository } from "../src/background/learning-history-repository";
import {
  IndexedDbUserDataRepository,
  IndexedDbUserVocabRepository,
  loadUserDataValues,
  setUserDataValues
} from "../src/storage/user-data-repository";
import { installChromeStub } from "./helpers/chrome-stub";
import { installIndexedDbStub } from "./helpers/indexeddb-stub";

describe("background user data repositories", () => {
  it("stores settings and vocab state in IndexedDB without extension storage writes", async () => {
    const indexedDbStub = installIndexedDbStub();
    const chromeStub = installChromeStub();

    try {
      await setUserDataValues({
        "settings": {
          discoveryRate: 0.25,
          targetLanguage: "es",
          sentenceTranslationEnabled: false,
          provider: "none"
        },
        "unknown-settings": {
          discoveryRate: 0.75
        }
      });
      await new IndexedDbUserVocabRepository().setStatus({
        lexemeId: "lexeme-city",
        status: "known",
        updatedAt: "2026-05-07T10:00:00.000Z"
      });

      await expect(
        loadUserDataValues(["settings", "unknown-settings"])
      ).resolves.toEqual({
        "settings": {
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
            "lexeme-city",
            {
              lexemeId: "lexeme-city",
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
      "word:lexeme-city": {
        itemId: "word:lexeme-city",
        unitRefId: "lexeme-city",
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
          itemId: "word:lexeme-city",
          unitType: "word",
          eventType: "explicit-review",
          grade: "good",
          createdAt: "2026-05-07T09:15:00.000Z",
          contextSentenceHash: "sentence-1"
        }
      ]);
      await history.persistContextHistory({
        "word:lexeme-city": {
          itemId: "word:lexeme-city",
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
        "word:lexeme-city": {
          itemId: "word:lexeme-city",
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

  it("atomically rejects a stale user-data compare-and-set", async () => {
    const indexedDbStub = installIndexedDbStub();
    const repository = new IndexedDbUserDataRepository();
    const initialProfile = {
      activeVocabularyBandId: "level-1a",
      activePhraseBandId: "level-1a",
      activeGrammarBandId: "level-1a",
      unlockedBandIds: ["level-1a"]
    };
    const explicitProfile = {
      activeVocabularyBandId: "level-3b",
      activePhraseBandId: "level-3b",
      activeGrammarBandId: "level-3b",
      unlockedBandIds: ["level-1a", "level-3b"]
    };

    try {
      await repository.setValue("learning-profile", initialProfile);
      const initialSnapshot = await repository.getValueSnapshot(
        "learning-profile"
      );
      await repository.setValue("learning-profile", initialProfile);
      await expect(
        repository.setValueIfRevision(
          "learning-profile",
          initialSnapshot.revision,
          explicitProfile
        )
      ).resolves.toBe(false);

      const currentSnapshot = await repository.getValueSnapshot(
        "learning-profile"
      );
      await expect(
        repository.setValueIfRevision(
          "learning-profile",
          currentSnapshot.revision,
          explicitProfile
        )
      ).resolves.toBe(true);
      await expect(
        repository.setValueIfRevision(
          "learning-profile",
          currentSnapshot.revision,
          {
            ...initialProfile,
            activeVocabularyBandId: "level-1b"
          }
        )
      ).resolves.toBe(false);
      await expect(repository.getValue("learning-profile")).resolves.toEqual(
        explicitProfile
      );
    } finally {
      indexedDbStub.restore();
    }
  });
});
