import {
  DEFAULT_CURRICULUM_CONFIG,
  REVIEW_INTERVALS_MS,
  RuntimeMessageType,
  scheduleQualifiedExposure,
  type CurriculumRuntimeProfileInput,
  type LearningItem
} from "@immersionkit/shared";
import { describe, expect, it } from "vitest";

import {
  CurriculumProgressionService,
  type CurriculumProgressionDecisionDiagnostics,
  type CurriculumProgressionDiagnosticsStore,
  type LearningProfileStore
} from "../src/background/curriculum-progression";
import {
  BackgroundRuntimeCoordinator,
  refreshTabsAfterCurriculumProgression
} from "../src/background/runtime";
import { IndexedDbLearningHistoryRepository } from "../src/background/learning-history-repository";
import { IndexedDbLearningItemRepository } from "../src/storage/learning-item-repository";
import {
  loadUserDataValues,
  setUserDataValues,
  USER_DATA_KEYS
} from "../src/storage/user-data-repository";
import { installChromeStub } from "./helpers/chrome-stub";
import { installIndexedDbStub } from "./helpers/indexeddb-stub";

describe("background curriculum progression", () => {
  it("advances mixed active bands after implicit evidence meets band requirements", async () => {
    const profileStore = new InMemoryLearningProfileStore({
      activeVocabularyBandId: "level-1a",
      activePhraseBandId: "level-1a",
      activeGrammarBandId: "level-1a",
      unlockedBandIds: ["level-1a"]
    });
    const diagnosticsStore = new InMemoryCurriculumProgressionDiagnosticsStore();
    const service = new CurriculumProgressionService(
      profileStore,
      diagnosticsStore
    );

    const result = await service.advanceAfterImplicitEvidence({
      config: DEFAULT_CURRICULUM_CONFIG,
      items: createProgressionReadyItems("level-1a"),
      now: "2026-04-28T12:00:00.000Z"
    });

    expect(result.profile).toMatchObject({
      activeVocabularyBandId: "level-1b",
      activePhraseBandId: "level-1b",
      activeGrammarBandId: "level-1b",
      unlockedBandIds: ["level-1a", "level-1b"]
    });
    expect(result.diagnostics).toMatchObject({
      previousBandId: "level-1a",
      nextBandId: "level-1b",
      eligible: true,
      reason: "advanced"
    });
    expect(diagnosticsStore.diagnostics).toMatchObject(result.diagnostics);
    await expect(profileStore.load()).resolves.toMatchObject({
      activeVocabularyBandId: "level-1b"
    });
  });

  it("does not let auto-created no-exposure items block implicit advancement", async () => {
    const profileStore = new InMemoryLearningProfileStore({
      activeVocabularyBandId: "level-1a",
      activePhraseBandId: "level-1a",
      activeGrammarBandId: "level-1a",
      unlockedBandIds: ["level-1a"]
    });
    const diagnosticsStore = new InMemoryCurriculumProgressionDiagnosticsStore();
    const service = new CurriculumProgressionService(
      profileStore,
      diagnosticsStore
    );

    const result = await service.advanceAfterImplicitEvidence({
      config: DEFAULT_CURRICULUM_CONFIG,
      items: [
        ...createProgressionReadyItems("level-1a"),
        createLearningItem("phrase:auto-created", "phrase", "level-1a", {
          status: "new",
          qualifiedExposureCount: 0,
          consecutiveUnassistedCount: 0,
          distinctContextCount: 0
        }),
        createLearningItem(
          "grammar-feature:future:will",
          "grammar-feature",
          "level-1a",
          {
            status: "new",
            qualifiedExposureCount: 0,
            consecutiveUnassistedCount: 0,
            distinctContextCount: 0
          }
        )
      ],
      now: "2026-04-28T12:00:00.000Z"
    });

    expect(result.diagnostics).toMatchObject({
      previousBandId: "level-1a",
      nextBandId: "level-1b",
      eligible: true,
      reason: "advanced",
      unmetRequirements: []
    });
  });

  it("does not advance across checkpoint-gated band boundaries implicitly", async () => {
    const profileStore = new InMemoryLearningProfileStore({
      activeVocabularyBandId: "level-1c",
      activePhraseBandId: "level-1c",
      activeGrammarBandId: "level-1c",
      unlockedBandIds: ["level-1a", "level-1b", "level-1c"]
    });
    const diagnosticsStore = new InMemoryCurriculumProgressionDiagnosticsStore();
    const service = new CurriculumProgressionService(
      profileStore,
      diagnosticsStore
    );

    const result = await service.advanceAfterImplicitEvidence({
      config: DEFAULT_CURRICULUM_CONFIG,
      items: createProgressionReadyItems("level-1c"),
      now: "2026-04-28T12:00:00.000Z"
    });

    expect(result.profile).toBeNull();
    expect(result.diagnostics).toMatchObject({
      previousBandId: "level-1c",
      nextBandId: "level-2a",
      eligible: false,
      reason: "checkpoint-required",
      unmetRequirements: ["checkpoint"],
      checkpointBoundary: true
    });
    expect(diagnosticsStore.diagnostics).toMatchObject(result.diagnostics);
    await expect(profileStore.load()).resolves.toMatchObject({
      activeVocabularyBandId: "level-1c"
    });
  });

  it("advances checkpoint-gated boundaries after explicit checkpoint when evidence gates are met", async () => {
    const profileStore = new InMemoryLearningProfileStore({
      activeVocabularyBandId: "level-1c",
      activePhraseBandId: "level-1c",
      activeGrammarBandId: "level-1c",
      unlockedBandIds: ["level-1a", "level-1b", "level-1c"]
    });
    const diagnosticsStore = new InMemoryCurriculumProgressionDiagnosticsStore();
    const service = new CurriculumProgressionService(
      profileStore,
      diagnosticsStore
    );

    const result = await service.advanceAfterExplicitCheckpoint({
      config: DEFAULT_CURRICULUM_CONFIG,
      items: createProgressionReadyItems("level-1c"),
      now: "2026-04-28T12:00:00.000Z"
    });

    expect(result.profile).toMatchObject({
      activeVocabularyBandId: "level-2a",
      activePhraseBandId: "level-2a",
      activeGrammarBandId: "level-2a",
      unlockedBandIds: ["level-1a", "level-1b", "level-1c", "level-2a"]
    });
    expect(result.diagnostics).toMatchObject({
      previousBandId: "level-1c",
      nextBandId: "level-2a",
      eligible: true,
      reason: "checkpoint-advanced",
      unmetRequirements: []
    });
    expect(diagnosticsStore.diagnostics).toMatchObject(result.diagnostics);
  });

  it("keeps explicit checkpoint graduation blocked until non-checkpoint evidence gates are met", async () => {
    const profileStore = new InMemoryLearningProfileStore({
      activeVocabularyBandId: "level-1c",
      activePhraseBandId: "level-1c",
      activeGrammarBandId: "level-1c",
      unlockedBandIds: ["level-1a", "level-1b", "level-1c"]
    });
    const diagnosticsStore = new InMemoryCurriculumProgressionDiagnosticsStore();
    const service = new CurriculumProgressionService(
      profileStore,
      diagnosticsStore
    );

    const result = await service.advanceAfterExplicitCheckpoint({
      config: DEFAULT_CURRICULUM_CONFIG,
      items: [
        createLearningItem("word:lexeme-city", "word", "level-1c", {
          status: "new",
          qualifiedExposureCount: 0,
          consecutiveUnassistedCount: 0,
          distinctContextCount: 0
        })
      ],
      now: "2026-04-28T12:00:00.000Z"
    });

    expect(result.profile).toBeNull();
    expect(result.diagnostics).toMatchObject({
      previousBandId: "level-1c",
      nextBandId: "level-2a",
      eligible: false,
      reason: "checkpoint-requirements-unmet",
      unmetRequirements: [
        "stable-item-ratio",
        "evidence-breadth",
        "distinct-context-breadth",
        "unassisted-breadth",
        "checkpoint"
      ]
    });
    await expect(profileStore.load()).resolves.toMatchObject({
      activeVocabularyBandId: "level-1c"
    });
  });

  it("drives the progression service through every default band with scheduler-qualified evidence", async () => {
    const orderedBands = [...DEFAULT_CURRICULUM_CONFIG.bands].sort(
      (left, right) => left.order - right.order
    );
    const profileStore = new InMemoryLearningProfileStore({
      activeVocabularyBandId: "level-1a",
      activePhraseBandId: "level-1a",
      activeGrammarBandId: "level-1a",
      unlockedBandIds: ["level-1a"]
    });
    const diagnosticsStore = new InMemoryCurriculumProgressionDiagnosticsStore();
    const service = new CurriculumProgressionService(
      profileStore,
      diagnosticsStore
    );
    let allItems: LearningItem[] = [];
    const expectedUnlocked = ["level-1a"];

    for (const [bandIndex, band] of orderedBands.entries()) {
      const trainedItems = createSchedulerProgressionItems({
        bandId: band.bandId,
        startAtMs: Date.parse("2026-04-01T12:00:00.000Z") + bandIndex * 3 * DAY_MS
      });
      allItems = [
        ...allItems.filter((item) => item.bandId !== band.bandId),
        ...trainedItems
      ];

      const implicitResult = await service.advanceAfterImplicitEvidence({
        config: DEFAULT_CURRICULUM_CONFIG,
        items: allItems,
        now: new Date(Date.parse("2026-05-01T12:00:00.000Z") + bandIndex * DAY_MS)
          .toISOString()
      });

      if (!implicitResult.diagnostics.nextBandId) {
        expect(band.bandId).toBe("level-5b");
        expect(implicitResult.profile).toBeNull();
        expect(implicitResult.diagnostics).toMatchObject({
          previousBandId: "level-5b",
          nextBandId: null,
          eligible: false,
          reason: "no-next-band",
          unmetRequirements: []
        });
        await expect(profileStore.load()).resolves.toMatchObject({
          activeVocabularyBandId: "level-5b",
          activePhraseBandId: "level-5b",
          activeGrammarBandId: "level-5b",
          unlockedBandIds: expectedUnlocked
        });
        continue;
      }

      if (band.unlockRequirements.checkpointRequired) {
        expect(implicitResult.profile).toBeNull();
        expect(implicitResult.diagnostics).toMatchObject({
          previousBandId: band.bandId,
          eligible: false,
          reason: "checkpoint-required",
          unmetRequirements: ["checkpoint"]
        });

        const explicitResult = await service.advanceAfterExplicitCheckpoint({
          config: DEFAULT_CURRICULUM_CONFIG,
          items: allItems,
          now: new Date(
            Date.parse("2026-05-01T18:00:00.000Z") + bandIndex * DAY_MS
          ).toISOString()
        });

        expectedUnlocked.push(explicitResult.diagnostics.nextBandId!);
        expect(explicitResult.profile).toMatchObject({
          activeVocabularyBandId: explicitResult.diagnostics.nextBandId,
          activePhraseBandId: explicitResult.diagnostics.nextBandId,
          activeGrammarBandId: explicitResult.diagnostics.nextBandId,
          unlockedBandIds: expectedUnlocked
        });
        expect(explicitResult.diagnostics).toMatchObject({
          previousBandId: band.bandId,
          eligible: true,
          reason: "checkpoint-advanced",
          unmetRequirements: []
        });
        continue;
      }

      expectedUnlocked.push(implicitResult.diagnostics.nextBandId);
      expect(implicitResult.profile).toMatchObject({
        activeVocabularyBandId: implicitResult.diagnostics.nextBandId,
        activePhraseBandId: implicitResult.diagnostics.nextBandId,
        activeGrammarBandId: implicitResult.diagnostics.nextBandId,
        unlockedBandIds: expectedUnlocked
      });
      expect(implicitResult.diagnostics).toMatchObject({
        previousBandId: band.bandId,
        eligible: true,
        reason: "advanced",
        unmetRequirements: []
      });
    }

    await expect(profileStore.load()).resolves.toMatchObject({
      activeVocabularyBandId: "level-5b",
      activePhraseBandId: "level-5b",
      activeGrammarBandId: "level-5b",
      unlockedBandIds: orderedBands.map((band) => band.bandId)
    });
  });

  it("delivers progression refreshes to the source tab and active HTTP tabs", async () => {
    const chromeStub = installChromeStub();
    chromeStub.setTabs([
      { id: 11, active: true, url: "https://example.test/article" },
      { id: 12, active: true, url: "chrome://extensions" },
      { id: 13, active: false, url: "https://inactive.test/article" }
    ] as chrome.tabs.Tab[]);

    try {
      await expect(refreshTabsAfterCurriculumProgression(10)).resolves.toEqual([
        10,
        11
      ]);
      expect(chromeStub.sentTabMessages).toEqual([
        {
          tabId: 10,
          message: { type: "settings/refresh-active-tab" }
        },
        {
          tabId: 11,
          message: { type: "settings/refresh-active-tab" }
        }
      ]);
    } finally {
      chromeStub.restore();
    }
  });

  it("advances profile and refreshes tabs when a runtime exposure completes a band", async () => {
    const indexedDbStub = installIndexedDbStub();
    const chromeStub = installChromeStub();
    const itemRepository = new IndexedDbLearningItemRepository();
    const historyRepository = new IndexedDbLearningHistoryRepository();
    const triggerItemId = "word:runtime-trigger";

    try {
      await setUserDataValues({
        [USER_DATA_KEYS.learningProfile]: {
          activeVocabularyBandId: "level-1a",
          activePhraseBandId: "level-1a",
          activeGrammarBandId: "level-1a",
          unlockedBandIds: ["level-1a"]
        }
      });
      await itemRepository.persistAll(
        learningItemRecord([
          ...createSchedulerProgressionItems({
            bandId: "level-1a",
            count: 3,
            startAtMs: Date.parse("2026-04-10T09:00:00.000Z")
          }),
          createOneExposureLearningItem({
            itemId: triggerItemId,
            bandId: "level-1a",
            startAtMs: Date.parse("2026-04-12T09:00:00.000Z")
          })
        ])
      );
      chromeStub.setTabs([
        { id: 42, active: true, url: "https://reader.example/article" },
        { id: 43, active: true, url: "chrome://extensions" }
      ] as chrome.tabs.Tab[]);

      const coordinator = new BackgroundRuntimeCoordinator();
      coordinator.boot();

      await expect(
        chromeStub.dispatchRuntimeMessage(
          {
            type: RuntimeMessageType.QualifiedExposureEvent,
            eventId: "runtime-exposure-1",
            itemId: triggerItemId,
            sentenceHash: "runtime-sentence-2",
            hostname: "reader.example",
            sessionId: "session-runtime",
            occurredAt: "2026-04-13T09:00:00.000Z",
            wasAssisted: false,
            confidence: 0.72,
            distinctContextKey: "reader.example:runtime-sentence-2"
          },
          { tab: { id: 41, url: "https://source.example/article" } as chrome.tabs.Tab }
        )
      ).resolves.toEqual([{ ok: true, stored: true }]);
      await waitForAsyncRefresh();

      const items = await itemRepository.loadAll();
      expect(items[triggerItemId]).toMatchObject({
        status: "reviewing",
        qualifiedExposureCount: 2,
        consecutiveUnassistedCount: 2,
        distinctContextCount: 2,
        nextReviewAt: "2026-04-16T09:00:00.000Z"
      });
      await expect(historyRepository.loadReviewEvents()).resolves.toEqual([
        expect.objectContaining({
          eventId: "runtime-exposure-1:review",
          itemId: triggerItemId,
          grade: "good",
          contextSentenceHash: "runtime-sentence-2"
        })
      ]);
      await expect(historyRepository.loadContextHistory()).resolves.toMatchObject({
        [triggerItemId]: {
          contexts: [
            expect.objectContaining({
              key: "reader.example:runtime-sentence-2",
              exposureCount: 1
            })
          ]
        }
      });
      await expect(
        loadUserDataValues([
          USER_DATA_KEYS.learningProfile,
          USER_DATA_KEYS.curriculumProgressionDiagnostics
        ])
      ).resolves.toMatchObject({
        [USER_DATA_KEYS.learningProfile]: {
          activeVocabularyBandId: "level-1b",
          activePhraseBandId: "level-1b",
          activeGrammarBandId: "level-1b",
          unlockedBandIds: ["level-1a", "level-1b"]
        },
        [USER_DATA_KEYS.curriculumProgressionDiagnostics]: {
          previousBandId: "level-1a",
          nextBandId: "level-1b",
          eligible: true,
          reason: "advanced",
          unmetRequirements: []
        }
      });
      expect(chromeStub.sentTabMessages).toEqual([
        { tabId: 41, message: { type: RuntimeMessageType.RefreshActiveTab } },
        { tabId: 42, message: { type: RuntimeMessageType.RefreshActiveTab } }
      ]);
    } finally {
      chromeStub.restore();
      indexedDbStub.restore();
    }
  });

  it("keeps runtime exposure from crossing checkpoint boundaries implicitly", async () => {
    const indexedDbStub = installIndexedDbStub();
    const chromeStub = installChromeStub();
    const itemRepository = new IndexedDbLearningItemRepository();
    const triggerItemId = "word:runtime-checkpoint-trigger";

    try {
      await setUserDataValues({
        [USER_DATA_KEYS.learningProfile]: {
          activeVocabularyBandId: "level-1c",
          activePhraseBandId: "level-1c",
          activeGrammarBandId: "level-1c",
          unlockedBandIds: ["level-1a", "level-1b", "level-1c"]
        }
      });
      await itemRepository.persistAll(
        learningItemRecord([
          ...createSchedulerProgressionItems({
            bandId: "level-1c",
            count: 3,
            startAtMs: Date.parse("2026-04-10T09:00:00.000Z")
          }),
          createOneExposureLearningItem({
            itemId: triggerItemId,
            bandId: "level-1c",
            startAtMs: Date.parse("2026-04-12T09:00:00.000Z")
          })
        ])
      );

      const coordinator = new BackgroundRuntimeCoordinator();
      coordinator.boot();

      await expect(
        chromeStub.dispatchRuntimeMessage(
          {
            type: RuntimeMessageType.QualifiedExposureEvent,
            eventId: "runtime-checkpoint-exposure-1",
            itemId: triggerItemId,
            sentenceHash: "runtime-checkpoint-sentence-2",
            hostname: "reader.example",
            sessionId: "session-runtime",
            occurredAt: "2026-04-13T09:00:00.000Z",
            wasAssisted: false,
            confidence: 0.72,
            distinctContextKey: "reader.example:runtime-checkpoint-sentence-2"
          },
          { tab: { id: 51, url: "https://source.example/article" } as chrome.tabs.Tab }
        )
      ).resolves.toEqual([{ ok: true, stored: true }]);
      await waitForAsyncRefresh();

      await expect(
        loadUserDataValues([
          USER_DATA_KEYS.learningProfile,
          USER_DATA_KEYS.curriculumProgressionDiagnostics
        ])
      ).resolves.toMatchObject({
        [USER_DATA_KEYS.learningProfile]: {
          activeVocabularyBandId: "level-1c",
          activePhraseBandId: "level-1c",
          activeGrammarBandId: "level-1c",
          unlockedBandIds: ["level-1a", "level-1b", "level-1c"]
        },
        [USER_DATA_KEYS.curriculumProgressionDiagnostics]: {
          previousBandId: "level-1c",
          nextBandId: "level-2a",
          eligible: false,
          reason: "checkpoint-required",
          unmetRequirements: ["checkpoint"],
          checkpointBoundary: true
        }
      });
      expect(chromeStub.sentTabMessages).toEqual([]);
    } finally {
      chromeStub.restore();
      indexedDbStub.restore();
    }
  });
});

class InMemoryLearningProfileStore implements LearningProfileStore {
  constructor(private profile: CurriculumRuntimeProfileInput = {}) {}

  async load(): Promise<CurriculumRuntimeProfileInput> {
    return this.profile;
  }

  async persist(profile: CurriculumRuntimeProfileInput): Promise<void> {
    this.profile = profile;
  }
}

class InMemoryCurriculumProgressionDiagnosticsStore
  implements CurriculumProgressionDiagnosticsStore
{
  diagnostics: CurriculumProgressionDecisionDiagnostics | null = null;

  async persist(diagnostics: CurriculumProgressionDecisionDiagnostics): Promise<void> {
    this.diagnostics = diagnostics;
  }
}

function createProgressionReadyItems(bandId: string): LearningItem[] {
  return [
    createLearningItem("word:lexeme-city", "word", bandId),
    createLearningItem("phrase:fixed-as-soon-as", "phrase", bandId, {
      status: "mastered",
      qualifiedExposureCount: 3,
      consecutiveUnassistedCount: 3
    }),
    createLearningItem("grammar-feature:negation:do-not", "grammar-feature", bandId),
    createLearningItem("word:lexeme-home", "word", bandId)
  ];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function createSchedulerProgressionItems(input: {
  bandId: string;
  startAtMs: number;
  count?: number;
}): LearningItem[] {
  return Array.from({ length: input.count ?? 4 }, (_unused, index) => {
    const itemStartAtMs = input.startAtMs + index * 60_000;
    let item = createNewLearningItem({
      itemId: `word:sim-${input.bandId}-${index}`,
      bandId: input.bandId,
      startAtMs: itemStartAtMs
    });
    item = scheduleQualifiedExposure(item, {
      now: new Date(itemStartAtMs).toISOString(),
      wasAssisted: false,
      isDistinctContext: true
    }).item;
    item = scheduleQualifiedExposure(item, {
      now: new Date(itemStartAtMs + DAY_MS).toISOString(),
      wasAssisted: false,
      isDistinctContext: true
    }).item;
    return item;
  });
}

function createOneExposureLearningItem(input: {
  itemId: string;
  bandId: string;
  startAtMs: number;
}): LearningItem {
  return scheduleQualifiedExposure(
    createNewLearningItem({
      itemId: input.itemId,
      bandId: input.bandId,
      startAtMs: input.startAtMs
    }),
    {
      now: new Date(input.startAtMs).toISOString(),
      wasAssisted: false,
      isDistinctContext: true
    }
  ).item;
}

function createNewLearningItem(input: {
  itemId: string;
  bandId: string;
  startAtMs: number;
}): LearningItem {
  const introducedAt = new Date(input.startAtMs).toISOString();
  const unitRefId = input.itemId.replace(/^word:/, "");
  return {
    itemId: input.itemId,
    unitRefId,
    unitType: "word",
    sourceText: unitRefId,
    targetText: "target",
    status: "new",
    bandId: input.bandId,
    introducedAt,
    nextReviewAt: introducedAt,
    interval: REVIEW_INTERVALS_MS[0],
    ease: 2.3,
    lapses: 0,
    assistCount: 0,
    qualifiedExposureCount: 0,
    consecutiveUnassistedCount: 0,
    distinctContextCount: 0,
    suspended: false
  };
}

function learningItemRecord(items: readonly LearningItem[]): Record<string, LearningItem> {
  return items.reduce<Record<string, LearningItem>>((output, item) => {
    output[item.itemId] = item;
    return output;
  }, {});
}

async function waitForAsyncRefresh(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function createLearningItem(
  itemId: string,
  unitType: LearningItem["unitType"],
  bandId: string,
  overrides: Partial<LearningItem> = {}
): LearningItem {
  return {
    itemId,
    unitRefId: itemId.replace(/^(word|phrase|grammar-feature):/, ""),
    unitType,
    sourceText: itemId,
    targetText: "target",
    status: overrides.status ?? "reviewing",
    bandId,
    introducedAt: "2026-04-20T12:00:00.000Z",
    nextReviewAt: "2026-04-29T12:00:00.000Z",
    interval: 24 * 60 * 60 * 1000,
    ease: 2.3,
    lapses: 0,
    assistCount: 0,
    qualifiedExposureCount: overrides.qualifiedExposureCount ?? 2,
    consecutiveUnassistedCount: overrides.consecutiveUnassistedCount ?? 2,
    distinctContextCount: overrides.distinctContextCount ?? 2,
    suspended: overrides.suspended ?? false
  };
}
