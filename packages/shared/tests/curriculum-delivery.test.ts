import { describe, expect, it } from "vitest";
import {
  DEFAULT_CURRICULUM_CONFIG,
  DEFAULT_CURRICULUM_CONTENT,
  CURATED_PHRASE_TARGET_LEXICON,
  FIXED_PHRASE_LEXICON,
  getCheckpointBlueprintForLevel,
  listCognatePatterns,
  listGrammarConcepts,
  matchEnglishSpanishCognatePattern,
  createCurrentFocusSummary,
  evaluateWordCurriculumContentInventory,
  getActiveCurriculumContent,
  getBandPedagogy,
  evaluateGrammarCurriculumDecision,
  resolveGrammarConcept,
  resolveSentenceGrammarCards,
  type GrammarFeatureMatch
} from "../src";

describe("curriculum delivery presentation", () => {
  it.each([
    ["level-1a", "Foundations", "First Spanish on the page"],
    ["level-2b", "Everyday Patterns", "Events and plans"],
    ["level-3b", "Narrative and Description", "Cause, time, and past habits"]
  ])("generates learner-facing current focus copy for %s", (bandId, level, title) => {
    const summary = createCurrentFocusSummary({
      profile: {
        activeVocabularyBandId: bandId,
        activePhraseBandId: bandId,
        activeGrammarBandId: bandId
      }
    });

    expect(summary).toMatchObject({
      levelLabel: level,
      bandId,
      learnerTitle: title
    });
    expect(summary?.wordFocusLabels.length).toBeGreaterThan(0);
    expect(summary?.phraseFocusExamples.length).toBeGreaterThan(0);
    expect(summary?.grammarFocusLabels.join(" ")).not.toMatch(/:/);
    expect(summary?.sentenceFocusLabel).not.toMatch(/targetPolicy|tokenRange/);
    expect(summary?.nextFocusPreview).toBeTruthy();
  });

  it("provides complete learner-facing curriculum objects for all 13 bands", () => {
    for (const content of DEFAULT_CURRICULUM_CONTENT) {
      const pedagogy = getBandPedagogy(content.bandId);

      expect(pedagogy).toBeTruthy();
      expect(pedagogy?.vocabularyExamples.length).toBeGreaterThan(0);
      expect(pedagogy?.allowedPartOfSpeechPolicy).toBeTruthy();
      expect(pedagogy?.cognatePatternIds.length).toBeGreaterThan(0);
      expect(pedagogy?.phraseInventory.length).toBeGreaterThanOrEqual(5);
      expect(content.vocabularyMaxFrequencyRank).toBeGreaterThan(0);
      expect(pedagogy?.grammarConceptIds.length).toBeGreaterThan(0);
      expect(pedagogy?.targetSpanishPatterns.length).toBeGreaterThan(0);
      expect(pedagogy?.sentenceFocusLabel).toBeTruthy();
      expect(pedagogy?.nextBandPreview).toBeTruthy();
      expect(pedagogy?.progressSignals.length).toBeGreaterThan(0);
    }
  });

  it("backs fixed phrase inventory entries with detector targets", () => {
    const backedSourceTexts = new Set([
      ...FIXED_PHRASE_LEXICON.map((entry) => entry.sourceText),
      ...CURATED_PHRASE_TARGET_LEXICON.map((entry) => entry.sourceText)
    ]);

    for (const content of DEFAULT_CURRICULUM_CONTENT) {
      for (const phrase of content.phraseInventory.exactSourceTexts) {
        expect(backedSourceTexts.has(phrase)).toBe(true);
      }
    }
  });

  it("uses band vocabulary examples as a curriculum-domain eligibility signal", () => {
    expect(
      evaluateWordCurriculumContentInventory({
        wordEntry: {
          sourceLemma: "information",
          targetLemma: "información",
          pos: "noun",
          confidence: 0.95,
          frequencyRank: 9000
        },
        activeContent: getActiveCurriculumContent({
          profile: { activeVocabularyBandId: "level-1c" }
        })
      })
    ).toMatchObject({
      eligible: true,
      matchReason: "vocabulary-domain"
    });

    expect(
      evaluateWordCurriculumContentInventory({
        wordEntry: {
          sourceLemma: "run",
          targetLemma: "correr",
          pos: "verb",
          confidence: 0.95,
          frequencyRank: 10
        },
        activeContent: getActiveCurriculumContent({
          profile: { activeVocabularyBandId: "level-1a" }
        })
      })
    ).toMatchObject({
      eligible: false,
      skipReason: "word-pos-outside-content"
    });
  });
});

describe("grammar concept delivery", () => {
  it.each([
    "modal:can",
    "modal:should",
    "modal:have-to",
    "future:going-to",
    "aspect:used-to",
    "clause:because-basic",
    "clause:when-basic",
    "aspect:have-been"
  ])("resolves %s to a learner-facing Spanish concept", (featureKey) => {
    const concept = resolveGrammarConcept(featureKey);

    expect(concept).toBeTruthy();
    expect(concept?.title).not.toContain(":");
    expect(concept?.targetPatternLabel).toBeTruthy();
    expect(concept?.examples.length).toBeGreaterThan(0);
  });

  it("keeps planned grammar concepts registered without requiring analyzer support", () => {
    const conceptIds = new Set(listGrammarConcepts().map((concept) => concept.conceptId));

    for (const conceptId of [
      "gr-101-gender-articles",
      "gr-102-adjective-agreement",
      "gr-103-ser-estar-recognition",
      "gr-104-existence-hay",
      "gr-105-basic-negation",
      "gr-106-basic-questions",
      "gr-205-present-routines",
      "gr-206-regular-preterite",
      "gr-207-simple-future",
      "gr-208-time-anchors",
      "gr-209-comparisons",
      "gr-210-quantity-determiners",
      "gr-304-purpose-in-order-to",
      "gr-305-present-progressive",
      "gr-306-past-progressive",
      "gr-307-imperfect-background",
      "gr-308-sequence-connectors",
      "gr-309-gerund-infinitive-recognition",
      "gr-310-direct-object-pronouns",
      "gr-402-present-perfect",
      "gr-403-passive-basics",
      "gr-404-basic-conditionals",
      "gr-405-contrast-concession",
      "gr-406-relative-clauses",
      "gr-407-subjunctive-recognition",
      "gr-501-embedded-clauses",
      "gr-502-reported-speech",
      "gr-503-perfect-contrasts",
      "gr-504-advanced-conditionals",
      "gr-505-broader-subjunctive",
      "gr-506-discourse-stance"
    ]) {
      expect(conceptIds.has(conceptId)).toBe(true);
    }
  });

  it("gates grammar features as focus, review, stretch, or suppress", () => {
    expect(
      evaluateGrammarCurriculumDecision({
        featureKey: "future:going-to",
        confidence: 0.84,
        config: DEFAULT_CURRICULUM_CONFIG,
        profile: { activeGrammarBandId: "level-2b" }
      })
    ).toMatchObject({
      eligible: true,
      status: "focus",
      conceptId: "gr-202-going-to-future"
    });

    expect(
      evaluateGrammarCurriculumDecision({
        featureKey: "modal:can",
        confidence: 0.86,
        profile: { activeGrammarBandId: "level-3b" }
      })
    ).toMatchObject({
      eligible: true,
      status: "review"
    });

    expect(
      evaluateGrammarCurriculumDecision({
        featureKey: "future:going-to",
        confidence: 0.84,
        profile: { activeGrammarBandId: "level-2a" }
      })
    ).toMatchObject({
      eligible: true,
      status: "stretch"
    });

    expect(
      evaluateGrammarCurriculumDecision({
        featureKey: "aspect:have-been",
        confidence: 0.84,
        profile: { activeGrammarBandId: "level-1a" }
      })
    ).toMatchObject({
      eligible: false,
      status: "suppress"
    });
  });

  it("suppresses target-side grammar concepts until translation evidence is available", () => {
    expect(
      evaluateGrammarCurriculumDecision({
        featureKey: "copula:be",
        confidence: 0.9,
        profile: { activeGrammarBandId: "level-1a" }
      })
    ).toMatchObject({
      eligible: false,
      status: "suppress",
      reason: "translation-required"
    });

    expect(
      evaluateGrammarCurriculumDecision({
        featureKey: "copula:be",
        confidence: 0.9,
        profile: { activeGrammarBandId: "level-1a" },
        translatedText: "Esta listo."
      })
    ).toMatchObject({
      eligible: true,
      status: "focus"
    });
  });

  it("resolves sentence grammar cards with source spans and Spanish target patterns", () => {
    const sentenceHash = "sentence-going-to";
    const cards = resolveSentenceGrammarCards({
      sentenceHash,
      features: [
        createGrammarFeature({
          sentenceHash,
          featureKey: "future:going-to",
          sourceText: "is going to call",
          startChar: 8,
          endChar: 24
        }),
        createGrammarFeature({
          sentenceHash,
          featureKey: "aspect:have-been",
          sourceText: "has been",
          startChar: 30,
          endChar: 38
        })
      ],
      profile: { activeGrammarBandId: "level-2b" }
    });

    expect(cards).toEqual([
      expect.objectContaining({
        conceptId: "gr-202-going-to-future",
        featureKey: "future:going-to",
        sentenceHash,
        sourceText: "is going to call",
        sourceSpan: expect.objectContaining({ startChar: 8, endChar: 24 }),
        title: "Future plans with going to",
        targetPatternLabel: "ir a + infinitive",
        exampleMapping: "is going to call -> va a llamar",
        curriculumStatus: "focus",
        exposureItemId: "grammar-feature:future:going-to"
      })
    ]);
  });

  it("keeps canned grammar example mappings paired when the detected span differs", () => {
    const sentenceHash = "sentence-should-wait";
    const cards = resolveSentenceGrammarCards({
      sentenceHash,
      features: [
        createGrammarFeature({
          sentenceHash,
          featureKey: "modal:should",
          sourceText: "should wait",
          startChar: 4,
          endChar: 15
        })
      ],
      profile: { activeGrammarBandId: "level-2b" }
    });

    expect(cards[0]).toMatchObject({
      conceptId: "gr-204-should-advice",
      sourceText: "should wait",
      exampleMapping: "should rest -> deberia descansar"
    });
  });
});

describe("cognate and checkpoint curriculum", () => {
  it("registers required cognate pattern examples and safe false-friend handling", () => {
    const patterns = listCognatePatterns();
    const examplePairs = patterns.flatMap((pattern) =>
      pattern.examples.map((example) => `${example.source}->${example.target}`)
    );

    expect(examplePairs).toContain("captain->capitán");
    expect(examplePairs).toContain("pharmacy->farmacia");
    expect(examplePairs).toContain("important->importante");
    expect(examplePairs).toContain("information->información");
    expect(
      matchEnglishSpanishCognatePattern({
        source: "information",
        target: "información",
        activeBandId: "level-1c"
      })?.pattern.patternId
    ).toBe("cog-03-tion-sion");
    expect(
      matchEnglishSpanishCognatePattern({
        source: "actual",
        target: "actual",
        activeBandId: "level-3b"
      })
    ).toBeNull();
  });

  it("backs level-boundary checkpoints with content categories", () => {
    for (const levelId of ["level-1", "level-2", "level-3", "level-4"]) {
      const blueprint = getCheckpointBlueprintForLevel(levelId);

      expect(blueprint?.openEndedTypingRequired).toBe(false);
      expect(blueprint?.validates.length).toBeGreaterThan(0);
      expect(blueprint?.itemMix.map((item) => item.category)).toEqual(
        expect.arrayContaining([
          "word-meaning",
          "phrase-meaning",
          "cloze-in-context",
          "sentence-comprehension",
          "grammar-discrimination"
        ])
      );
    }
  });
});

function createGrammarFeature(
  input: Partial<GrammarFeatureMatch> & {
    sentenceHash: string;
    featureKey: string;
    sourceText: string;
    startChar?: number;
    endChar?: number;
  }
): GrammarFeatureMatch {
  return {
    featureId: `grammar:${input.featureKey}`,
    featureKey: input.featureKey,
    label: input.label ?? input.featureKey,
    category: input.category ?? "tense-aspect",
    sourceText: input.sourceText,
    normalizedSourceText: input.sourceText.toLowerCase(),
    span: {
      startToken: input.span?.startToken ?? 0,
      endToken: input.span?.endToken ?? 2,
      startChar: input.startChar ?? input.span?.startChar ?? 0,
      endChar:
        input.endChar ??
        input.span?.endChar ??
        (input.startChar ?? 0) + input.sourceText.length
    },
    evidence: input.evidence ?? ["test"],
    confidence: input.confidence ?? 0.84
  };
}
