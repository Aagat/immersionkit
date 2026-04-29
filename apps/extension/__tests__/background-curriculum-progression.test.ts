import {
  DEFAULT_CURRICULUM_CONFIG,
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
import { refreshTabsAfterCurriculumProgression } from "../src/background/runtime";
import { installChromeStub } from "./helpers/chrome-stub";

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
      items: [
        createLearningItem("word:lemma-city", "word", "level-1a"),
        createLearningItem("phrase:fixed-as-soon-as", "phrase", "level-1a")
      ],
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
      items: [createLearningItem("word:lemma-city", "word", "level-1c")],
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
      items: [createLearningItem("word:lemma-city", "word", "level-1c")],
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
        createLearningItem("word:lemma-city", "word", "level-1c", {
          status: "new",
          qualifiedExposureCount: 0
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
        "qualified-exposures",
        "checkpoint"
      ]
    });
    await expect(profileStore.load()).resolves.toMatchObject({
      activeVocabularyBandId: "level-1c"
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
    consecutiveUnassistedCount: 2,
    distinctContextCount: 2,
    suspended: false
  };
}
