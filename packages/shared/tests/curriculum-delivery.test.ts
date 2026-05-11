import { describe, expect, it } from "vitest";
import {
  DEFAULT_CURRICULUM_CONFIG,
  createCurrentFocusSummary,
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
        curriculumStatus: "focus",
        exposureItemId: "grammar-feature:future:going-to"
      })
    ]);
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
