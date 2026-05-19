import {
  DEFAULT_CURRICULUM_CONFIG,
  DEFAULT_CURRICULUM_CONTENT,
  CURATED_PHRASE_TARGET_LEXICON,
  FIXED_PHRASE_LEXICON,
  evaluateCurriculumBandTransition,
  evaluateCurriculumEligibility,
  evaluatePhraseCurriculumContentInventory,
  evaluateWordCurriculumContentInventory,
  getActiveCurriculumContent,
  getCurriculumContentForBand,
  normalizePhraseText,
  resolveActiveCurriculumBand,
  resolveCurriculumConfig,
  type CurriculumDefinition,
  type CurriculumConfig,
  type LearningItem
} from "../src";
import { describe, expect, it } from "vitest";

const BASE_ITEM: LearningItem = {
  itemId: "word:lexeme-city",
  unitRefId: "lexeme-city",
  unitType: "word",
  sourceText: "city",
  targetText: "ciudad",
  status: "reviewing",
  bandId: "level-1a",
  introducedAt: "2026-04-18T09:00:00.000Z",
  nextReviewAt: "2026-04-19T09:00:00.000Z",
  interval: 24 * 60 * 60 * 1000,
  ease: 2.3,
  lapses: 0,
  assistCount: 0,
  qualifiedExposureCount: 2,
  consecutiveUnassistedCount: 2,
  distinctContextCount: 2,
  suspended: false
};

describe("curriculum configuration", () => {
  it("provides configurable default levels and ordered bands", () => {
    const config = resolveCurriculumConfig(null);

    expect(config.levels).toHaveLength(5);
    expect(config.bands).toHaveLength(13);
    expect(config.levels[0]?.bandIds).toEqual(["level-1a", "level-1b", "level-1c"]);
  });

  it("ships a typed content map for every runtime band", () => {
    const config = resolveCurriculumConfig(null);
    const contentBandIds = new Set(DEFAULT_CURRICULUM_CONTENT.map((entry) => entry.bandId));

    expect(DEFAULT_CURRICULUM_CONTENT).toHaveLength(config.bands.length);
    for (const band of config.bands) {
      const content = getCurriculumContentForBand(band.bandId);
      expect(contentBandIds.has(band.bandId)).toBe(true);
      expect(content?.vocabularyDomains.length).toBeGreaterThan(0);
      expect(content?.vocabularyMaxFrequencyRank).toBeGreaterThan(0);
      expect(content?.phraseChunks.length).toBeGreaterThan(0);
      expect(content?.phraseInventory.exactSourceTexts.length).toBeGreaterThan(0);
      expect(content?.sentencePolicy.tokenRange[0]).toBeLessThanOrEqual(
        content?.sentencePolicy.tokenRange[1] ?? 0
      );
    }
  });

  it("resolves active curriculum content from the runtime profile", () => {
    expect(
      getActiveCurriculumContent({
        profile: {
          activeVocabularyBandId: "level-3b"
        }
      })
    ).toMatchObject({
      band: expect.objectContaining({ bandId: "level-3b" }),
      content: expect.objectContaining({
        vocabularyDomains: expect.arrayContaining(["short narratives"]),
        currentGrammarKeys: expect.arrayContaining(["aspect:used-to"])
      })
    });
  });

  it("backs every default curriculum exact phrase with a curated detector target", () => {
    const backedTargets = new Set([
      ...FIXED_PHRASE_LEXICON.map((entry) => normalizePhraseText(entry.sourceText)),
      ...CURATED_PHRASE_TARGET_LEXICON.map((entry) => normalizePhraseText(entry.sourceText))
    ]);

    for (const content of DEFAULT_CURRICULUM_CONTENT) {
      expect(content.phraseInventory.exactSourceTexts.length).toBeGreaterThanOrEqual(5);
      for (const phrase of content.phraseInventory.exactSourceTexts) {
        expect(backedTargets.has(normalizePhraseText(phrase))).toBe(true);
      }
    }
  });

  it("assigns curated and fixed phrase targets to real curriculum bands", () => {
    const bandIds = new Set(DEFAULT_CURRICULUM_CONFIG.bands.map((band) => band.bandId));

    for (const entry of CURATED_PHRASE_TARGET_LEXICON) {
      expect(bandIds.has(entry.minBand)).toBe(true);
    }

    expect(FIXED_PHRASE_LEXICON.length).toBeGreaterThanOrEqual(700);
    for (const entry of FIXED_PHRASE_LEXICON) {
      expect(bandIds.has(entry.minBand)).toBe(true);
    }

    const fixedCountsByBand = new Map<string, number>();
    for (const entry of FIXED_PHRASE_LEXICON) {
      fixedCountsByBand.set(
        entry.minBand,
        (fixedCountsByBand.get(entry.minBand) ?? 0) + 1
      );
    }
    for (const band of DEFAULT_CURRICULUM_CONFIG.bands) {
      expect(fixedCountsByBand.get(band.bandId) ?? 0).toBeGreaterThanOrEqual(15);
    }
  });

  it("evaluates band transitions from config instead of hardcoded thresholds", () => {
    const decision = evaluateCurriculumBandTransition(DEFAULT_CURRICULUM_CONFIG, {
      bandId: "level-1a",
      items: createTransitionItems(4),
      recentLapseRate: 0,
      checkpointPassed: false
    });

    expect(decision).toMatchObject({
      eligible: true,
      nextBand: expect.objectContaining({ bandId: "level-1b" }),
      unmetRequirements: []
    });
  });

  it("does not require a checkpoint when there is no next band", () => {
    const terminalConfig: CurriculumConfig = {
      ...DEFAULT_CURRICULUM_CONFIG,
      bands: DEFAULT_CURRICULUM_CONFIG.bands.map((band) =>
        band.bandId === "level-5b"
          ? {
              ...band,
              unlockRequirements: {
                ...band.unlockRequirements,
                checkpointRequired: true
              }
            }
          : band
      )
    };

    const decision = evaluateCurriculumBandTransition(terminalConfig, {
      bandId: "level-5b",
      items: createTransitionItems(4, { bandId: "level-5b" }),
      recentLapseRate: 0,
      checkpointPassed: false
    });

    expect(decision).toMatchObject({
      nextBand: null,
      unmetRequirements: []
    });
  });

  it("does not advance from one or two mastered items alone", () => {
    const decision = evaluateCurriculumBandTransition(DEFAULT_CURRICULUM_CONFIG, {
      bandId: "level-1a",
      items: createTransitionItems(2, { status: "mastered" }),
      recentLapseRate: 0,
      checkpointPassed: false
    });

    expect(decision.eligible).toBe(false);
    expect(decision.unmetRequirements).toEqual([
      "evidence-breadth",
      "distinct-context-breadth"
    ]);
  });

  it("lets external curriculum data tune transition requirements", () => {
    const strictConfig: CurriculumConfig = {
      ...DEFAULT_CURRICULUM_CONFIG,
      bands: DEFAULT_CURRICULUM_CONFIG.bands.map((band) =>
        band.bandId === "level-1a"
          ? {
              ...band,
              unlockRequirements: {
                ...band.unlockRequirements,
                stableItemRatio: 1,
                minimumQualifiedExposures: 3,
                checkpointRequired: true
              }
            }
          : band
      )
    };

    const decision = evaluateCurriculumBandTransition(strictConfig, {
      bandId: "level-1a",
      items: createTransitionItems(4),
      recentLapseRate: 0,
      checkpointPassed: false
    });

    expect(decision.eligible).toBe(false);
    expect(decision.unmetRequirements).toEqual([
      "qualified-exposures",
      "checkpoint"
    ]);
  });

  it("lets external curriculum data tune percentage breadth requirements", () => {
    const percentageConfig: CurriculumConfig = {
      ...DEFAULT_CURRICULUM_CONFIG,
      bands: DEFAULT_CURRICULUM_CONFIG.bands.map((band) =>
        band.bandId === "level-1a"
          ? {
              ...band,
              unlockRequirements: {
                ...band.unlockRequirements,
                minimumDistinctContextItemRatio: 1,
                minimumUnassistedItemRatio: 0.75
              }
            }
          : band
      )
    };

    const decision = evaluateCurriculumBandTransition(percentageConfig, {
      bandId: "level-1a",
      items: createTransitionItems(4, (index) => ({
        consecutiveUnassistedCount: index < 2 ? 2 : 1,
        distinctContextCount: index < 3 ? 2 : 1
      })),
      recentLapseRate: 0,
      checkpointPassed: false
    });

    expect(decision.eligible).toBe(false);
    expect(decision.unmetRequirements).toEqual([
      "distinct-context-breadth",
      "unassisted-breadth"
    ]);
  });

  it("does not let auto-created no-exposure items block progression", () => {
    const decision = evaluateCurriculumBandTransition(DEFAULT_CURRICULUM_CONFIG, {
      bandId: "level-1a",
      items: [
        ...createTransitionItems(4),
        createTransitionItem(99, {
          itemId: "phrase:auto-created",
          unitRefId: "auto-created",
          unitType: "phrase",
          sourceText: "for now",
          status: "new",
          qualifiedExposureCount: 0,
          consecutiveUnassistedCount: 0,
          distinctContextCount: 0
        }),
        createTransitionItem(100, {
          itemId: "grammar-feature:future:will",
          unitRefId: "future:will",
          unitType: "grammar-feature",
          sourceText: "will",
          targetText: "",
          status: "new",
          qualifiedExposureCount: 0,
          consecutiveUnassistedCount: 0,
          distinctContextCount: 0
        })
      ],
      recentLapseRate: 0,
      checkpointPassed: false
    });

    expect(decision).toMatchObject({
      eligible: true,
      unmetRequirements: []
    });
  });

  it("does not count assisted-only exposures as progression readiness", () => {
    const decision = evaluateCurriculumBandTransition(DEFAULT_CURRICULUM_CONFIG, {
      bandId: "level-1a",
      items: createTransitionItems(4, {
        assistCount: 2,
        qualifiedExposureCount: 2,
        consecutiveUnassistedCount: 0,
        distinctContextCount: 2
      }),
      recentLapseRate: 0,
      checkpointPassed: false
    });

    expect(decision.eligible).toBe(false);
    expect(decision.unmetRequirements).toEqual([
      "stable-item-ratio",
      "evidence-breadth",
      "distinct-context-breadth",
      "unassisted-breadth"
    ]);
  });

  it("requires four evidence-bearing items", () => {
    const decision = evaluateCurriculumBandTransition(DEFAULT_CURRICULUM_CONFIG, {
      bandId: "level-1a",
      items: createTransitionItems(3),
      recentLapseRate: 0,
      checkpointPassed: false
    });

    expect(decision.eligible).toBe(false);
    expect(decision.unmetRequirements).toEqual(["evidence-breadth"]);
  });

  it("requires three distinct-context-ready items", () => {
    const decision = evaluateCurriculumBandTransition(DEFAULT_CURRICULUM_CONFIG, {
      bandId: "level-1a",
      items: createTransitionItems(4, (_index) => ({
        distinctContextCount: _index < 2 ? 2 : 1
      })),
      recentLapseRate: 0,
      checkpointPassed: false
    });

    expect(decision.eligible).toBe(false);
    expect(decision.unmetRequirements).toEqual(["distinct-context-breadth"]);
  });

  it("scales distinct-context readiness by evidence-bearing percentage", () => {
    const decision = evaluateCurriculumBandTransition(DEFAULT_CURRICULUM_CONFIG, {
      bandId: "level-1a",
      items: createTransitionItems(6, (index) => ({
        distinctContextCount: index < 4 ? 2 : 1
      })),
      recentLapseRate: 0,
      checkpointPassed: false
    });

    expect(decision.eligible).toBe(false);
    expect(decision.unmetRequirements).toEqual(["distinct-context-breadth"]);
  });

  it("requires two unassisted-ready items", () => {
    const decision = evaluateCurriculumBandTransition(DEFAULT_CURRICULUM_CONFIG, {
      bandId: "level-1a",
      items: createTransitionItems(4, (_index) => ({
        consecutiveUnassistedCount: _index === 0 ? 2 : 1
      })),
      recentLapseRate: 0,
      checkpointPassed: false
    });

    expect(decision.eligible).toBe(false);
    expect(decision.unmetRequirements).toEqual(["unassisted-breadth"]);
  });

  it("scales unassisted readiness by evidence-bearing percentage", () => {
    const decision = evaluateCurriculumBandTransition(DEFAULT_CURRICULUM_CONFIG, {
      bandId: "level-1a",
      items: createTransitionItems(8, (index) => ({
        consecutiveUnassistedCount: index < 3 ? 2 : 1
      })),
      recentLapseRate: 0,
      checkpointPassed: false
    });

    expect(decision.eligible).toBe(false);
    expect(decision.unmetRequirements).toEqual(["unassisted-breadth"]);
  });

  it("resolves active runtime bands from profile data with default fallback", () => {
    expect(resolveActiveCurriculumBand(null, "word")?.bandId).toBe("level-1a");
    expect(
      resolveActiveCurriculumBand(null, "phrase", {
        activePhraseBandId: "level-2b"
      })?.bandId
    ).toBe("level-2b");
  });

  it("gates runtime eligibility through active band difficulty limits", () => {
    const allowed = evaluateCurriculumEligibility(DEFAULT_CURRICULUM_CONFIG, {
      unitType: "sentence",
      score: 0.3
    });
    const skipped = evaluateCurriculumEligibility(DEFAULT_CURRICULUM_CONFIG, {
      unitType: "sentence",
      score: 0.8
    });

    expect(allowed).toMatchObject({
      eligible: true,
      configId: "en-es-default-v1",
      activeBandId: "level-1a",
      skipReason: null
    });
    expect(skipped).toMatchObject({
      eligible: false,
      activeBandId: "level-1a",
      skipReason: "above-active-band-difficulty"
    });
  });

  it("uses active curriculum content as a stricter word inventory gate", () => {
    const activeContent = getActiveCurriculumContent({
      profile: {
        activeVocabularyBandId: "level-1a"
      }
    });

    expect(
      evaluateWordCurriculumContentInventory({
        activeContent,
        wordEntry: {
          lexemeId: "en:house:noun",
          sourceLemma: "house",
          targetLemma: "casa",
          pos: "noun",
          frequencyRank: 430,
          confidence: 0.97
        }
      })
    ).toMatchObject({
      eligible: true,
      activeBandId: "level-1a",
      skipReason: null
    });

    expect(
      evaluateWordCurriculumContentInventory({
        activeContent,
        wordEntry: {
          lexemeId: "en:river:noun",
          sourceLemma: "river",
          targetLemma: "rio",
          pos: "noun",
          frequencyRank: 2800,
          confidence: 0.91
        }
      })
    ).toMatchObject({
      eligible: false,
      activeBandId: "level-1a",
      skipReason: "word-rank-outside-content"
    });

    expect(
      evaluateWordCurriculumContentInventory({
        activeContent,
        wordEntry: {
          lexemeId: "en:river:noun",
          sourceLemma: "river",
          targetLemma: "rio",
          pos: "noun",
          frequencyRank: 2800,
          confidence: 0.91,
          renderUnitMinBand: "level-1a"
        }
      })
    ).toMatchObject({
      eligible: false,
      activeBandId: "level-1a",
      skipReason: "word-rank-outside-content"
    });
  });

  it("lets high-confidence beginner cognates through the early inventory gate", () => {
    const activeContent = getActiveCurriculumContent({
      profile: {
        activeVocabularyBandId: "level-1a"
      }
    });

    expect(
      evaluateWordCurriculumContentInventory({
        activeContent,
        wordEntry: {
          lexemeId: "en:telescope:noun",
          sourceLemma: "telescope",
          targetLemma: "telescopio",
          pos: "noun",
          frequencyRank: 2800,
          confidence: 0.91
        }
      })
    ).toMatchObject({
      eligible: true,
      activeBandId: "level-1a",
      matchReason: "beginner-cognate",
      skipReason: null
    });
  });

  it("resolves custom pair curriculum content without falling back to en-es gates", () => {
    const customDefinition: CurriculumDefinition = {
      config: {
        ...DEFAULT_CURRICULUM_CONFIG,
        configId: "en-test-default-v1",
        targetLanguage: "test",
        bands: [
          {
            ...DEFAULT_CURRICULUM_CONFIG.bands[0]!,
            bandId: "test-1",
            label: "Test 1",
            difficultyLimits: {
              minimumScore: 0,
              maximumScore: 0.2
            }
          }
        ],
        levels: [
          {
            levelId: "test-level-1",
            label: "Test Level 1",
            order: 1,
            bandIds: ["test-1"],
            checkpointRequired: false
          }
        ]
      },
      content: [
        {
          ...DEFAULT_CURRICULUM_CONTENT[0]!,
          bandId: "test-1",
          vocabularyDomains: ["synthetic"],
          vocabularyExamples: ["synthetic -> sintetico"],
          vocabularyMaxFrequencyRank: 10,
          phraseChunks: ["synthetic chunk"],
          phraseInventory: {
            exactSourceTexts: ["synthetic chunk"],
            allowedCategories: ["fixed-idiom"],
            allowedSourceKinds: ["fixed-phrase"]
          },
          sentencePolicy: {
            tokenRange: [2, 4],
            clausePolicy: "synthetic",
            targetPolicy: "synthetic target",
            notes: "Synthetic pair content."
          }
        }
      ]
    };
    const activeContent = getActiveCurriculumContent({
      definition: customDefinition
    });

    expect(activeContent).toMatchObject({
      band: expect.objectContaining({ bandId: "test-1" }),
      config: expect.objectContaining({
        bands: [expect.objectContaining({ bandId: "test-1" })]
      }),
      content: expect.objectContaining({
        vocabularyDomains: ["synthetic"],
        vocabularyMaxFrequencyRank: 10
      })
    });
    expect(
      evaluateWordCurriculumContentInventory({
        activeContent,
        wordEntry: {
          lexemeId: "en:synthetic:noun",
          sourceLemma: "synthetic",
          targetLemma: "sintetico",
          pos: "noun",
          frequencyRank: 2800,
          confidence: 0.91,
          renderUnitMinBand: "test-1"
        }
      })
    ).toMatchObject({
      eligible: true,
      activeBandId: "test-1",
      matchReason: "vocabulary-domain",
      skipReason: null
    });
    expect(
      evaluatePhraseCurriculumContentInventory({
        activeContent,
        sourceText: "unknown synthetic chunk",
        sourceKind: "chunk",
        category: "noun-chunk",
        renderUnitMinBand: "test-1"
      })
    ).toMatchObject({
      eligible: true,
      activeBandId: "test-1",
      matchReason: "render-unit-band",
      skipReason: null
    });
    expect(
      evaluateWordCurriculumContentInventory({
        activeContent,
        wordEntry: {
          lexemeId: "en:telescope:noun",
          sourceLemma: "telescope",
          targetLemma: "telescopio",
          pos: "noun",
          frequencyRank: 2800,
          confidence: 0.91
        }
      })
    ).toMatchObject({
      eligible: false,
      skipReason: "word-rank-outside-content"
    });
  });

  it("uses active curriculum content as a phrase inventory gate", () => {
    const level1a = getActiveCurriculumContent({
      profile: {
        activePhraseBandId: "level-1a"
      },
      unitType: "phrase"
    });
    const level4a = getActiveCurriculumContent({
      profile: {
        activePhraseBandId: "level-4a"
      },
      unitType: "phrase"
    });

    expect(
      evaluatePhraseCurriculumContentInventory({
        activeContent: level1a,
        sourceText: "right now",
        sourceKind: "fixed-phrase",
        category: "fixed-idiom"
      })
    ).toMatchObject({
      eligible: true,
      activeBandId: "level-1a",
      skipReason: null
    });

    expect(
      evaluatePhraseCurriculumContentInventory({
        activeContent: level1a,
        sourceText: "public health care system",
        sourceKind: "chunk",
        category: "noun-chunk"
      })
    ).toMatchObject({
      eligible: false,
      activeBandId: "level-1a",
      skipReason: "phrase-outside-content"
    });

    expect(
      evaluatePhraseCurriculumContentInventory({
        activeContent: level4a,
        sourceText: "public health care system",
        sourceKind: "chunk",
        category: "noun-chunk"
      })
    ).toMatchObject({
      eligible: true,
      activeBandId: "level-4a",
      skipReason: null
    });
  });

  it("lets a custom active band change runtime gates without changing callers", () => {
    const customConfig: CurriculumConfig = {
      ...DEFAULT_CURRICULUM_CONFIG,
      bands: DEFAULT_CURRICULUM_CONFIG.bands.map((band) =>
        band.bandId === "level-1a"
          ? {
              ...band,
              difficultyLimits: {
                minimumScore: 0,
                maximumScore: 0.2
              }
            }
          : band
      )
    };

    expect(
      evaluateCurriculumEligibility(customConfig, {
        unitType: "word",
        score: 0.3
      })
    ).toMatchObject({
      eligible: false,
      skipReason: "above-active-band-difficulty"
    });
  });
});

function createTransitionItems(
  count: number,
  overrides:
    | Partial<LearningItem>
    | ((index: number) => Partial<LearningItem>) = {}
): LearningItem[] {
  return Array.from({ length: count }, (_unused, index) =>
    createTransitionItem(
      index,
      typeof overrides === "function" ? overrides(index) : overrides
    )
  );
}

function createTransitionItem(
  index: number,
  overrides: Partial<LearningItem> = {}
): LearningItem {
  return {
    ...BASE_ITEM,
    itemId: `word:lexeme-city-${index}`,
    unitRefId: `lexeme-city-${index}`,
    sourceText: `city ${index}`,
    ...overrides
  };
}
