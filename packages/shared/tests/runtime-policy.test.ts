import { describe, expect, it } from "vitest";
import {
  CONTENT_EVIDENCE_POLICY,
  DEFAULT_CURRICULUM_CONFIG,
  buildLearningItemId,
  evaluateLearningItemDueStatus,
  evaluatePhraseRuntimeActivation,
  evaluateWordRuntimeActivation,
  parseLearningItemId,
  summarizeCheckpointEligibility,
  type LearningItem,
  type WordRenderEntry
} from "../src";

describe("learning item identity", () => {
  it("builds and parses durable learning item ids", () => {
    expect(buildLearningItemId("word", "lexeme-city")).toBe("word:lexeme-city");
    expect(buildLearningItemId("phrase", "phrase:pattern:used-to")).toBe(
      "phrase:phrase:pattern:used-to"
    );
    expect(buildLearningItemId("grammar-feature", "aspect:have-been")).toBe(
      "grammar-feature:aspect:have-been"
    );

    expect(parseLearningItemId("phrase:phrase:pattern:used-to")).toEqual({
      itemId: "phrase:phrase:pattern:used-to",
      unitType: "phrase",
      unitRefId: "phrase:pattern:used-to"
    });
    expect(parseLearningItemId("sentence:hash")).toBeNull();
    expect(parseLearningItemId("word:")).toBeNull();
  });
});

describe("content evidence policy", () => {
  it("keeps content evidence timing and confidence policy centralized", () => {
    expect(CONTENT_EVIDENCE_POLICY).toMatchObject({
      qualifiedDwellMs: 1_500,
      grammarDetailDwellMs: 2_500,
      qualifiedIntersectionRatio: 0.6,
      evidenceDedupeWindowMs: 5 * 60 * 1000,
      viewportDwellConfidence: 0.72
    });
  });
});

describe("runtime scheduler policy", () => {
  it("uses one due-status decision shape across unit types", () => {
    const phrase = createLearningItem({
      itemId: "phrase:phrase:pattern:used-to",
      unitRefId: "phrase:pattern:used-to",
      unitType: "phrase",
      nextReviewAt: "2026-04-18T10:10:00.000Z"
    });
    const grammarFeature = createLearningItem({
      itemId: "grammar-feature:aspect:have-been",
      unitRefId: "aspect:have-been",
      unitType: "grammar-feature",
      nextReviewAt: "2026-04-18T09:00:00.000Z"
    });

    expect(
      evaluateLearningItemDueStatus(phrase, "2026-04-18T10:00:00.000Z")
    ).toMatchObject({
      isDue: false,
      receivesDueBoost: true,
      reason: "near-due"
    });
    expect(
      evaluateLearningItemDueStatus(grammarFeature, "2026-04-18T10:00:00.000Z")
    ).toMatchObject({
      isDue: true,
      receivesDueBoost: true,
      reason: "due"
    });
    expect(
      evaluateLearningItemDueStatus(
        { ...grammarFeature, status: "suspended", suspended: true },
        "2026-04-18T10:00:00.000Z"
      )
    ).toMatchObject({
      isDue: false,
      receivesDueBoost: false,
      reason: "suspended"
    });
  });
});

describe("runtime curriculum activation", () => {
  it("does not let due word render units bypass active render-unit band gates", () => {
    const decision = evaluateWordRuntimeActivation({
      config: DEFAULT_CURRICULUM_CONFIG,
      profile: { activeVocabularyBandId: "level-1a" },
      wordEntry: createWordEntry({ renderUnitMinBand: "level-2a" }),
      learningItem: createLearningItem({
        itemId: "word:en:telescope:noun",
        unitRefId: "en:telescope:noun",
        unitType: "word",
        bandId: "level-2a",
        nextReviewAt: "2026-04-18T09:00:00.000Z"
      }),
      status: "new",
      isDueForReview: true
    });

    expect(decision).toMatchObject({
      eligible: false,
      activeBandId: "level-1a",
      skipReason: "render-unit-band-locked"
    });
  });

  it("does not let due phrase render units bypass active render-unit band gates", () => {
    const decision = evaluatePhraseRuntimeActivation({
      config: DEFAULT_CURRICULUM_CONFIG,
      profile: { activePhraseBandId: "level-1a" },
      phraseId: "ru:test-take-care-of",
      sourceText: "take care of",
      learningItem: createLearningItem({
        itemId: "phrase:ru:test-take-care-of",
        unitRefId: "ru:test-take-care-of",
        unitType: "phrase",
        bandId: "level-2a",
        nextReviewAt: "2026-04-18T09:00:00.000Z"
      }),
      sourceKind: "fixed-phrase",
      category: "fixed-idiom",
      renderUnitMinBand: "level-2a",
      isDueForReview: true
    });

    expect(decision).toMatchObject({
      eligible: false,
      activeBandId: "level-1a",
      skipReason: "render-unit-band-locked"
    });
  });
});

describe("checkpoint summaries", () => {
  it("summarizes checkpoint eligibility without extension app-state logic", () => {
    const summary = summarizeCheckpointEligibility({
      config: DEFAULT_CURRICULUM_CONFIG,
      profile: {
        activeVocabularyBandId: "level-1c",
        activePhraseBandId: "level-1c",
        activeGrammarBandId: "level-1c",
        unlockedBandIds: ["level-1a", "level-1b", "level-1c"]
      },
      items: [
        createLearningItem({
          itemId: "word:lexeme-city",
          unitRefId: "lexeme-city",
          unitType: "word",
          bandId: "level-1c",
          status: "reviewing",
          qualifiedExposureCount: 2
        })
      ],
      now: "2026-04-28T12:00:00.000Z"
    });

    expect(summary).toMatchObject({
      activeBandId: "level-1c",
      activeBandLabel: "Level 1C",
      nextBandId: "level-2a",
      nextBandLabel: "Level 2A",
      checkpointRequired: true,
      checkpointIsOnlyBlocker: true,
      unmetRequirements: ["checkpoint"],
      checkpointBlueprint: expect.objectContaining({
        levelId: "level-1",
        unlocksLevelId: "level-2",
        openEndedTypingRequired: false
      }),
      checkpointScopeLabels: expect.arrayContaining([
        "Level 1 fixed phrases",
        "short sentence comprehension"
      ])
    });
  });
});

function createLearningItem(input: {
  itemId: string;
  unitRefId: string;
  unitType: LearningItem["unitType"];
  bandId?: string;
  status?: LearningItem["status"];
  nextReviewAt?: string;
  qualifiedExposureCount?: number;
}): LearningItem {
  return {
    itemId: input.itemId,
    unitRefId: input.unitRefId,
    unitType: input.unitType,
    sourceText: input.unitRefId,
    targetText: "",
    status: input.status ?? "learning",
    bandId: input.bandId,
    introducedAt: "2026-04-18T09:00:00.000Z",
    nextReviewAt: input.nextReviewAt ?? "2026-04-18T09:30:00.000Z",
    interval: 10 * 60 * 1000,
    ease: 2.3,
    lapses: 0,
    assistCount: 0,
    qualifiedExposureCount: input.qualifiedExposureCount ?? 1,
    consecutiveUnassistedCount: 1,
    distinctContextCount: 1,
    suspended: false
  };
}

function createWordEntry(input: {
  renderUnitMinBand?: string;
} = {}): WordRenderEntry {
  return {
    lexemeId: "en:telescope:noun",
    renderUnitId: "ru:en:telescope:noun",
    renderUnitMinBand: input.renderUnitMinBand ?? "level-1a",
    renderUnitMatchMode: "exact",
    normalizedSourceText: "telescope",
    targetText: "telescopio",
    sourceLemma: "telescope",
    targetLemma: "telescopio",
    pos: "noun",
    frequencyRank: 2800,
    confidence: 0.91,
    sourceLanguage: "en",
    targetLanguage: "es",
    sourceDataset: "test"
  };
}
