import { describe, expect, it } from "vitest";
import {
  evaluateWordCurriculumContentInventory,
  getActiveCurriculumContent,
  hashSentence,
  type LearningItem
} from "@immersionkit/shared";

import { processTextNode } from "../src/content/annotate";
import {
  buildWordRenderIndex,
  buildWordRenderIndexes
} from "../src/content/word-render-index";
import type {
  CachedPhraseMatch,
  CachedWordRenderDecision
} from "../src/content/storage";
import type { WordRenderEntry } from "../src/render-units/render-units";
import { withFixtureDom } from "./helpers/fixture-dom";

type TestWordUnit = {
  lexemeId: string;
  sourceLemma: string;
  targetLemma: string;
  pos: "noun" | "adjective" | "adverb";
  matchMode?: "exact" | "analyzer-pattern";
  frequencyRank?: number | null;
  confidence?: number;
  inflections?: readonly string[];
};

describe("content word render index", () => {
  it("does not register English articles as injectable render units", () => {
    const lookup = buildWordRenderIndex([
      wordUnit({
        lexemeId: "en:a:noun",
        sourceLemma: "a",
        targetLemma: "poquito",
        pos: "noun"
      }),
      wordUnit({
        lexemeId: "en:house:noun",
        sourceLemma: "house",
        targetLemma: "casa",
        pos: "noun"
      })
    ]);

    expect(lookup.has("a")).toBe(false);
    expect(lookup.get("house")?.targetLemma).toBe("casa");
  });

  it("keeps articles in English while injecting the following render unit", async () => {
    await withFixtureDom("article-basic.html", ({ document }) => {
      const textNode = document.createTextNode("I bought a house near the river.");
      document.body.append(textNode);

      processTextNode(textNode, {
        discoveryRate: 1,
        samplingSeed: "article-test",
        createNodeId: () => "ikn-article-test",
        wordRenderIndex: buildWordRenderIndex([
          wordUnit({
            lexemeId: "en:a:noun",
            sourceLemma: "a",
            targetLemma: "poquito",
            pos: "noun"
          }),
          wordUnit({
            lexemeId: "en:house:noun",
            sourceLemma: "house",
            targetLemma: "casa",
            pos: "noun"
          })
        ]),
        vocabByLexemeId: new Map(),
        isKnownWordForScoring: () => false
      });

      expect(document.body.textContent).toContain("a casa");
      expect(document.body.textContent).not.toContain("poquito casa");
    });
  });

  it("does not pre-render analyzer-pattern single-token units", async () => {
    await withFixtureDom("article-basic.html", ({ document }) => {
      const textNode = document.createTextNode(
        "Well, the team worked well. This creates zero friction. The stable number remains."
      );
      document.body.append(textNode);

      const result = processTextNode(textNode, {
        discoveryRate: 1,
        samplingSeed: "context-sensitive-word-test",
        createNodeId: () => "ikn-context-sensitive-word-test",
        wordRenderIndex: buildWordRenderIndex([
          wordUnit({
            lexemeId: "en:well:adverb",
            sourceLemma: "well",
            targetLemma: "bien",
            pos: "adverb",
            matchMode: "analyzer-pattern"
          }),
          wordUnit({
            lexemeId: "en:this:adjective",
            sourceLemma: "this",
            targetLemma: "este",
            pos: "adjective",
            matchMode: "analyzer-pattern"
          }),
          wordUnit({
            lexemeId: "en:zero:noun",
            sourceLemma: "zero",
            targetLemma: "cero",
            pos: "noun",
            matchMode: "analyzer-pattern"
          }),
          wordUnit({
            lexemeId: "en:stable:adjective",
            sourceLemma: "stable",
            targetLemma: "estable",
            pos: "adjective"
          })
        ]),
        vocabByLexemeId: new Map(),
        isKnownWordForScoring: () => false
      });

      expect(result.replaced).toBe(true);
      expect(document.body.textContent).toContain("Well, the team worked well");
      expect(document.body.textContent).toContain("This creates zero friction");
      expect(document.body.textContent).toContain("The estable number");
      expect(document.body.textContent).not.toContain("bien");
      expect(document.body.textContent).not.toContain("este creates");
      expect(document.body.textContent).not.toContain("cero friction");
    });
  });

  it("does not pre-render analyzer-gated use noun units in imperative contexts", async () => {
    await withFixtureDom("article-basic.html", ({ document }) => {
      const sourceText =
        "Use --quiet to reduce output overhead. Already have Node? Use npm instead (works on any version).";
      const textNode = document.createTextNode(sourceText);
      document.body.append(textNode);
      const renderIndexes = buildWordRenderIndexes([
        wordUnit({
          lexemeId: "lx:use:noun",
          sourceLemma: "use",
          targetLemma: "uso",
          pos: "noun",
          matchMode: "analyzer-pattern",
          frequencyRank: 240
        })
      ]);

      const result = processTextNode(textNode, {
        discoveryRate: 1,
        samplingSeed: "imperative-use-word-test",
        createNodeId: () => "ikn-imperative-use-word-test",
        wordRenderIndex: renderIndexes.wordRenderIndex,
        analyzerPatternWordRenderIndex:
          renderIndexes.analyzerPatternWordRenderIndex,
        vocabByLexemeId: new Map(),
        isKnownWordForScoring: () => false
      });

      expect(result.replaced).toBe(false);
      expect(document.body.textContent).toContain(sourceText);
      expect(document.body.textContent).not.toContain("Uso --quiet");
      expect(document.body.textContent).not.toContain("Uso npm");
    });
  });

  it("renders analyzer-pattern words after cached analyzer inject decisions", async () => {
    await withFixtureDom("article-basic.html", ({ document }) => {
      const sourceSentence = "There is a great need for clean water.";
      const textNode = document.createTextNode(sourceSentence);
      document.body.append(textNode);
      const sentenceHash = hashSentence(sourceSentence);
      const renderIndexes = buildWordRenderIndexes([
        wordUnit({
          lexemeId: "en:need:noun",
          sourceLemma: "need",
          targetLemma: "necesidad",
          pos: "noun",
          matchMode: "analyzer-pattern",
          frequencyRank: 100
        })
      ]);

      const result = processTextNode(textNode, {
        discoveryRate: 1,
        samplingSeed: "noun-need-word-test",
        createNodeId: () => "ikn-noun-need-word-test",
        wordRenderIndex: renderIndexes.wordRenderIndex,
        analyzerPatternWordRenderIndex:
          renderIndexes.analyzerPatternWordRenderIndex,
        cachedWordRenderDecisions: new Map([
          [
            sentenceHash,
            [
              cachedInjectDecision({
                sentenceHash,
                lexemeId: "en:need:noun",
                sourceLemma: "need",
                targetLemma: "cached-necesidad",
                pos: "noun",
                frequencyRank: 100
              })
            ]
          ]
        ]),
        sentenceHintPhrases: ["great need for"],
        vocabByLexemeId: new Map(),
        isKnownWordForScoring: () => false,
        shouldActivateWord: ({ wordEntry }) => {
          const decision = evaluateWordCurriculumContentInventory({
            wordEntry,
            activeContent: getActiveCurriculumContent({
              profile: { activeVocabularyBandId: "level-1a" }
            })
          });
          return {
            eligible: decision.eligible,
            activeBandId: decision.activeBandId,
            skipReason: decision.skipReason
          };
        }
      });

      expect(result.replaced).toBe(true);
      expect(document.body.textContent).toContain("great necesidad for");
      expect(document.body.textContent).not.toContain("cached-necesidad");
    });
  });

  it("renders analyzer-gated use noun units after cached noun evidence", async () => {
    await withFixtureDom("article-basic.html", ({ document }) => {
      const sourceSentence = "The use of the phone is prohibited here.";
      const textNode = document.createTextNode(sourceSentence);
      document.body.append(textNode);
      const sentenceHash = hashSentence(sourceSentence);
      const renderIndexes = buildWordRenderIndexes([
        wordUnit({
          lexemeId: "lx:use:noun",
          sourceLemma: "use",
          targetLemma: "uso",
          pos: "noun",
          matchMode: "analyzer-pattern",
          frequencyRank: 240
        })
      ]);

      const result = processTextNode(textNode, {
        discoveryRate: 1,
        samplingSeed: "noun-use-word-test",
        createNodeId: () => "ikn-noun-use-word-test",
        wordRenderIndex: renderIndexes.wordRenderIndex,
        analyzerPatternWordRenderIndex:
          renderIndexes.analyzerPatternWordRenderIndex,
        cachedWordRenderDecisions: new Map([
          [
            sentenceHash,
            [
              cachedInjectDecision({
                sentenceHash,
                lexemeId: "lx:use:noun",
                sourceLemma: "use",
                targetLemma: "uso",
                pos: "noun",
                frequencyRank: 240
              })
            ]
          ]
        ]),
        vocabByLexemeId: new Map(),
        isKnownWordForScoring: () => false
      });

      expect(result.replaced).toBe(true);
      expect(document.body.textContent).toContain(
        "The uso of the phone is prohibited here."
      );
    });
  });

  it("renders cached dynamic verb command decisions with their analyzed target", async () => {
    await withFixtureDom("article-basic.html", ({ document }) => {
      const sourceSentence = "Use --quiet to reduce output overhead.";
      const textNode = document.createTextNode(sourceSentence);
      document.body.append(textNode);
      const sentenceHash = hashSentence(sourceSentence);
      const renderIndexes = buildWordRenderIndexes([
        verbUnit({
          lexemeId: "lx:use:verb",
          sourceLemma: "use",
          targetLemma: "usar"
        })
      ]);

      const result = processTextNode(textNode, {
        discoveryRate: 1,
        samplingSeed: "verb-use-command-test",
        createNodeId: () => "ikn-verb-use-command-test",
        wordRenderIndex: renderIndexes.wordRenderIndex,
        analyzerPatternWordRenderIndex:
          renderIndexes.analyzerPatternWordRenderIndex,
        verbRenderIndex: renderIndexes.verbRenderIndex,
        cachedWordRenderDecisions: new Map([
          [
            sentenceHash,
            [
              cachedVerbDecision({
                sentenceHash,
                lexemeId: "lx:use:verb",
                sourceLemma: "use",
                sourceText: "Use",
                targetText: "usa",
                startChar: 0,
                endChar: 3
              })
            ]
          ]
        ]),
        vocabByLexemeId: new Map(),
        isKnownWordForScoring: () => false
      });

      expect(result.replaced).toBe(true);
      expect(document.body.textContent).toContain(
        "Usa --quiet to reduce output overhead."
      );
      expect(document.body.textContent).not.toContain("Uso --quiet");
    });
  });

  it("renders cached dynamic verb phrase decisions without reusing noun targets", async () => {
    await withFixtureDom("article-basic.html", ({ document }) => {
      const sourceSentence = "I use npm on every project.";
      const textNode = document.createTextNode(sourceSentence);
      document.body.append(textNode);
      const sentenceHash = hashSentence(sourceSentence);
      const renderIndexes = buildWordRenderIndexes([
        verbUnit({
          lexemeId: "lx:use:verb",
          sourceLemma: "use",
          targetLemma: "usar"
        })
      ]);

      const result = processTextNode(textNode, {
        discoveryRate: 1,
        samplingSeed: "verb-use-subject-test",
        createNodeId: () => "ikn-verb-use-subject-test",
        wordRenderIndex: renderIndexes.wordRenderIndex,
        analyzerPatternWordRenderIndex:
          renderIndexes.analyzerPatternWordRenderIndex,
        verbRenderIndex: renderIndexes.verbRenderIndex,
        cachedWordRenderDecisions: new Map([
          [
            sentenceHash,
            [
              cachedVerbDecision({
                sentenceHash,
                lexemeId: "lx:use:verb",
                sourceLemma: "use",
                sourceText: "I use",
                targetText: "yo uso",
                startChar: 0,
                endChar: 5
              })
            ]
          ]
        ]),
        vocabByLexemeId: new Map(),
        isKnownWordForScoring: () => false
      });

      expect(result.replaced).toBe(true);
      expect(document.body.textContent).toContain("Yo uso npm on every project.");
      expect(document.body.textContent).not.toContain("I usar npm");
    });
  });

  it("lets accepted phrase spans win over overlapping dynamic verb spans", async () => {
    await withFixtureDom("article-basic.html", ({ document }) => {
      const sourceSentence = "We take care of the old city.";
      const textNode = document.createTextNode(sourceSentence);
      document.body.append(textNode);
      const sentenceHash = hashSentence(sourceSentence);
      const renderIndexes = buildWordRenderIndexes([
        verbUnit({
          lexemeId: "lx:take:verb",
          sourceLemma: "take",
          targetLemma: "tomar"
        })
      ]);

      const result = processTextNode(textNode, {
        discoveryRate: 1,
        samplingSeed: "verb-phrase-overlap-test",
        createNodeId: () => "ikn-verb-phrase-overlap-test",
        wordRenderIndex: renderIndexes.wordRenderIndex,
        analyzerPatternWordRenderIndex:
          renderIndexes.analyzerPatternWordRenderIndex,
        verbRenderIndex: renderIndexes.verbRenderIndex,
        cachedWordRenderDecisions: new Map([
          [
            sentenceHash,
            [
              cachedVerbDecision({
                sentenceHash,
                lexemeId: "lx:take:verb",
                sourceLemma: "take",
                sourceText: "We take",
                targetText: "nosotros tomamos",
                startChar: 0,
                endChar: 7
              })
            ]
          ]
        ]),
        cachedPhraseMatchesBySentenceHash: phraseMatchesFor(sourceSentence, [
          createPhraseMatch(sourceSentence, {
            phraseId: "ru:test-take-care-of",
            sourceText: "take care of",
            startChar: 3,
            endChar: 15
          })
        ]),
        learningItemsByUnitRefId: new Map([
          [
            "ru:test-take-care-of",
            createPhraseLearningItem({
              phraseId: "ru:test-take-care-of",
              sourceText: "take care of",
              targetText: "cuidar de"
            })
          ]
        ]),
        vocabByLexemeId: new Map(),
        isKnownWordForScoring: () => false
      });

      expect(result.replaced).toBe(true);
      expect(result.phraseInjectedCount).toBe(1);
      expect(document.body.textContent).toContain("We cuidar de the old city.");
      expect(document.body.textContent).not.toContain("nosotros tomamos");
      expect(
        document.querySelector("[data-ik-lexeme-id='lx:take:verb']")
      ).toBeNull();
      expect(
        document.querySelector("[data-ik-phrase-id='ru:test-take-care-of']")
      ).toBeTruthy();
    });
  });

  it("does not render stale cached analyzer-pattern inject decisions missing from current render units", async () => {
    await withFixtureDom("article-basic.html", ({ document }) => {
      const sourceSentence = "So a few weeks ago, I started asking myself.";
      const textNode = document.createTextNode(sourceSentence);
      document.body.append(textNode);
      const sentenceHash = hashSentence(sourceSentence);

      const result = processTextNode(textNode, {
        discoveryRate: 1,
        samplingSeed: "stale-so-word-test",
        createNodeId: () => "ikn-stale-so-word-test",
        wordRenderIndex: new Map(),
        analyzerPatternWordRenderIndex: new Map(),
        cachedWordRenderDecisions: new Map([
          [
            sentenceHash,
            [
              cachedInjectDecision({
                sentenceHash,
                lexemeId: "en:so:adverb",
                sourceLemma: "so",
                targetLemma: "tan",
                pos: "adverb",
                frequencyRank: 50
              })
            ]
          ]
        ]),
        vocabByLexemeId: new Map(),
        isKnownWordForScoring: () => false
      });

      expect(result.replaced).toBe(false);
      expect(document.body.textContent).toContain(sourceSentence);
      expect(document.body.textContent).not.toContain("tan");
    });
  });

  it("skips new discovery words when the active curriculum gate rejects them", async () => {
    await withFixtureDom("article-basic.html", ({ document }) => {
      const textNode = document.createTextNode("The telescope watched the comet.");
      document.body.append(textNode);

      const result = processTextNode(textNode, {
        discoveryRate: 1,
        samplingSeed: "curriculum-word-test",
        createNodeId: () => "ikn-curriculum-word-test",
        wordRenderIndex: buildWordRenderIndex([telescopeUnit()]),
        vocabByLexemeId: new Map(),
        isKnownWordForScoring: () => false,
        shouldActivateWord: () => ({
          eligible: false,
          configId: "test-curriculum",
          activeBandId: "level-1a",
          skipReason: "above-active-band-difficulty"
        })
      });

      expect(result.replaced).toBe(false);
      expect(result.curriculumSkippedWordCount).toBe(1);
      expect(document.body.textContent).toContain("The telescope watched the comet.");
      expect(document.body.textContent).not.toContain("telescopio");
    });
  });

  it("does not let due discovery words bypass the active curriculum gate", async () => {
    await withFixtureDom("article-basic.html", ({ document }) => {
      const textNode = document.createTextNode("The telescope watched the comet.");
      document.body.append(textNode);

      const result = processTextNode(textNode, {
        discoveryRate: 1,
        samplingSeed: "curriculum-due-word-test",
        createNodeId: () => "ikn-curriculum-due-word-test",
        wordRenderIndex: buildWordRenderIndex([telescopeUnit()]),
        vocabByLexemeId: new Map(),
        isKnownWordForScoring: () => false,
        isDueForReview: () => true,
        shouldActivateWord: () => ({
          eligible: false,
          configId: "test-curriculum",
          activeBandId: "level-1a",
          skipReason: "above-active-band-difficulty"
        })
      });

      expect(result.replaced).toBe(false);
      expect(result.curriculumSkippedWordCount).toBe(1);
      expect(document.body.textContent).toContain("The telescope watched the comet.");
      expect(document.body.textContent).not.toContain("telescopio");
    });
  });

  it("uses activation discovery floors for beginner cognate replacements", async () => {
    await withFixtureDom("article-basic.html", ({ document }) => {
      const textNode = document.createTextNode("The telescope watched the comet.");
      document.body.append(textNode);

      const result = processTextNode(textNode, {
        discoveryRate: 0,
        samplingSeed: "beginner-cognate-word-test",
        createNodeId: () => "ikn-beginner-cognate-word-test",
        wordRenderIndex: buildWordRenderIndex([telescopeUnit()]),
        vocabByLexemeId: new Map(),
        isKnownWordForScoring: () => false,
        shouldActivateWord: () => ({
          eligible: true,
          configId: "test-curriculum",
          activeBandId: "level-1a",
          discoveryRateFloor: 1,
          activationReason: "beginner-cognate",
          skipReason: null
        })
      });

      const token = document.querySelector<HTMLElement>(
        "[data-ik-lexeme-id='en:telescope:noun']"
      );

      expect(result.replaced).toBe(true);
      expect(document.body.textContent).toContain("The telescopio watched the comet.");
      expect(token?.getAttribute("data-ik-scheduler-reason")).toBe(
        "beginner-cognate"
      );
    });
  });

  it("gates cognate curriculum explanations by the active band", async () => {
    await withFixtureDom("article-basic.html", ({ document }) => {
      const textNode = document.createTextNode("The activity starts now.");
      document.body.append(textNode);

      processTextNode(textNode, {
        discoveryRate: 1,
        samplingSeed: "band-gated-cognate-explanation-test",
        createNodeId: () => "ikn-band-gated-cognate-explanation-test",
        wordRenderIndex: buildWordRenderIndex([
          wordUnit({
            lexemeId: "en:activity:noun",
            sourceLemma: "activity",
            targetLemma: "actividad",
            pos: "noun"
          })
        ]),
        vocabByLexemeId: new Map(),
        isKnownWordForScoring: () => false,
        shouldActivateWord: () => ({
          eligible: true,
          configId: "test-curriculum",
          activeBandId: "level-1c",
          skipReason: null
        })
      });

      const token = document.querySelector<HTMLElement>(
        "[data-ik-lexeme-id='en:activity:noun']"
      );

      expect(token?.getAttribute("data-ik-curriculum-reason")).toBe(
        "This word fits your current reading band and appeared in a safe local context."
      );
    });
  });
});

function telescopeUnit() {
  return wordUnit({
    lexemeId: "en:telescope:noun",
    sourceLemma: "telescope",
    targetLemma: "telescopio",
    pos: "noun",
    frequencyRank: 2800,
    confidence: 0.91
  });
}

function wordUnit(input: TestWordUnit) {
  const matchMode = input.matchMode ?? "exact";
  return {
    renderUnitId: `ru:${input.lexemeId}:${matchMode}`,
    lexemeIds: [input.lexemeId],
    kind: "single-token",
    renderPolicy: "inline",
    sourceText: input.sourceLemma,
    normalizedSourceText: input.sourceLemma,
    targetText: input.targetLemma,
    normalizedTargetText: input.targetLemma,
    sourcePattern: {
      matchMode,
      tokens: [
        {
          normal: input.sourceLemma,
          lemma: input.sourceLemma,
          pos: input.pos
        }
      ]
    },
    replacement: {
      startToken: 0,
      endToken: 1,
      targetText: input.targetLemma
    },
    pos: input.pos,
    minBand: "level-1a",
    frequencyRank: input.frequencyRank ?? 100,
    confidence: input.confidence ?? 0.97,
    provenance: { source: "manual" },
    inflections: input.inflections
  } as const;
}

function verbUnit(input: {
  lexemeId: string;
  sourceLemma: string;
  targetLemma: string;
  frequencyRank?: number | null;
}) {
  return {
    renderUnitId: `ru:${input.sourceLemma}:verb:frame`,
    lexemeIds: [input.lexemeId],
    kind: "verb-frame",
    renderPolicy: "inline",
    sourceText: input.sourceLemma,
    normalizedSourceText: input.sourceLemma,
    targetText: input.targetLemma,
    normalizedTargetText: input.targetLemma,
    sourcePattern: {
      matchMode: "analyzer-pattern",
      tokens: [
        {
          normal: input.sourceLemma,
          lemma: input.sourceLemma,
          pos: "verb",
          role: "verb"
        }
      ]
    },
    replacement: {
      startToken: 0,
      endToken: 1,
      targetText: input.targetLemma
    },
    pos: "verb",
    minBand: "level-1a",
    frequencyRank: input.frequencyRank ?? 100,
    confidence: 0.94,
    provenance: { source: "manual" }
  } as const;
}

function phraseMatchesFor(
  sentence: string,
  matches: CachedPhraseMatch[]
): Map<string, CachedPhraseMatch[]> {
  return new Map([[hashSentence(sentence), matches]]);
}

function createPhraseMatch(
  sentence: string,
  input: {
    phraseId: string;
    sourceText: string;
    startChar: number;
    endChar: number;
  }
): CachedPhraseMatch {
  return {
    occurrenceId: `${input.phraseId}:occurrence`,
    phraseId: input.phraseId,
    renderUnitId: input.phraseId.startsWith("ru:") ? input.phraseId : undefined,
    sentenceHash: hashSentence(sentence),
    sourceText: input.sourceText,
    normalizedSourceText: input.sourceText.toLowerCase(),
    sourceKind: "fixed-phrase",
    category: "fixed-idiom",
    ruleId: "take-care-of",
    span: {
      startToken: 1,
      endToken: 4,
      startChar: input.startChar,
      endChar: input.endChar
    },
    confidence: 0.94
  };
}

function createPhraseLearningItem(input: {
  phraseId: string;
  sourceText: string;
  targetText: string;
}): LearningItem {
  return {
    itemId: `phrase:${input.phraseId}`,
    unitRefId: input.phraseId,
    unitType: "phrase",
    sourceText: input.sourceText,
    targetText: input.targetText,
    status: "new",
    introducedAt: "2026-04-25T10:00:00.000Z",
    nextReviewAt: "2026-04-25T10:00:00.000Z",
    interval: 600000,
    ease: 2.3,
    lapses: 0,
    assistCount: 0,
    qualifiedExposureCount: 0,
    consecutiveUnassistedCount: 0,
    distinctContextCount: 0,
    suspended: false
  };
}

function cachedInjectDecision(input: {
  sentenceHash: string;
  lexemeId: string;
  sourceLemma: string;
  targetLemma: string;
  pos: WordRenderEntry["pos"];
  frequencyRank?: number | null;
}): CachedWordRenderDecision {
  return {
    sentenceHash: input.sentenceHash,
    lexemeId: input.lexemeId,
    renderUnitId: `ru:${input.lexemeId}:analyzer-pattern`,
    renderUnitMinBand: "level-1a",
    normalizedSourceText: input.sourceLemma,
    normalizedText: input.sourceLemma,
    targetText: input.targetLemma,
    candidateLemma: input.sourceLemma,
    candidatePos: input.pos,
    frequencyRank: input.frequencyRank,
    confidence: 0.99,
    decision: "inject",
    rationale: "Analyzer pattern matched the approved render unit."
  };
}

function cachedVerbDecision(input: {
  sentenceHash: string;
  lexemeId: string;
  sourceLemma: string;
  sourceText: string;
  targetText: string;
  startChar: number;
  endChar: number;
}): CachedWordRenderDecision {
  return {
    sentenceHash: input.sentenceHash,
    lexemeId: input.lexemeId,
    renderUnitId: `ru:${input.sourceLemma}:verb:frame`,
    renderUnitMinBand: "level-1a",
    normalizedSourceText: input.sourceLemma,
    normalizedText: input.sourceText.toLowerCase(),
    sourceText: input.sourceText,
    targetText: input.targetText,
    candidateLemma: input.sourceLemma,
    candidatePos: "verb",
    frequencyRank: 100,
    confidence: 0.91,
    tokenStart: 0,
    tokenEnd: 1,
    startChar: input.startChar,
    endChar: input.endChar,
    decision: "inject",
    rationale: "Clear local verb frame matched the approved verb unit."
  };
}
