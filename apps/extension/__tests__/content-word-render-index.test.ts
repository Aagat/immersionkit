import { describe, expect, it } from "vitest";
import { hashSentence } from "@immersionkit/shared";

import { processTextNode } from "../src/content/annotate";
import { buildWordRenderIndex } from "../src/content/word-render-index";
import type { CachedWordRenderDecision } from "../src/content/storage";
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

  it("renders analyzer-pattern words after cached analyzer inject decisions", async () => {
    await withFixtureDom("article-basic.html", ({ document }) => {
      const sourceSentence = "There is a great need for clean water.";
      const textNode = document.createTextNode(sourceSentence);
      document.body.append(textNode);
      const sentenceHash = hashSentence(sourceSentence);

      const result = processTextNode(textNode, {
        discoveryRate: 1,
        samplingSeed: "noun-need-word-test",
        createNodeId: () => "ikn-noun-need-word-test",
        wordRenderIndex: new Map(),
        cachedWordRenderDecisions: new Map([
          [
            sentenceHash,
            [
              cachedInjectDecision({
                sentenceHash,
                lexemeId: "en:need:noun",
                sourceLemma: "need",
                targetLemma: "necesidad",
                pos: "noun"
              })
            ]
          ]
        ]),
        sentenceHintPhrases: ["great need for"],
        vocabByLexemeId: new Map(),
        isKnownWordForScoring: () => false
      });

      expect(result.replaced).toBe(true);
      expect(document.body.textContent).toContain("great necesidad for");
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

function cachedInjectDecision(input: {
  sentenceHash: string;
  lexemeId: string;
  sourceLemma: string;
  targetLemma: string;
  pos: WordRenderEntry["pos"];
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
    confidence: 0.99,
    decision: "inject",
    rationale: "Analyzer pattern matched the approved render unit."
  };
}
