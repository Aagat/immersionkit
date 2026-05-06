import { describe, expect, it } from "vitest";

import { processTextNode } from "../src/content/annotate";
import { buildLexiconLookup } from "../src/content/lexicon";
import { withFixtureDom } from "./helpers/fixture-dom";

describe("content lexicon lookup", () => {
  it("does not register English articles as injectable lexical units", () => {
    const lookup = buildLexiconLookup([
      {
        lemmaId: "en:a:noun",
        sourceLemma: "a",
        targetLemma: "poquito",
        pos: "noun",
        frequencyRank: 1642,
        confidence: 0.76
      },
      {
        lemmaId: "en:house:noun",
        sourceLemma: "house",
        targetLemma: "casa",
        pos: "noun",
        frequencyRank: 430,
        confidence: 0.97
      }
    ]);

    expect(lookup.has("a")).toBe(false);
    expect(lookup.get("house")?.targetLemma).toBe("casa");
  });

  it("keeps articles in English while injecting the following lexical noun", async () => {
    await withFixtureDom("article-basic.html", ({ document }) => {
      const textNode = document.createTextNode("I bought a house near the river.");
      document.body.append(textNode);

      processTextNode(textNode, {
        discoveryRate: 1,
        samplingSeed: "article-test",
        createNodeId: () => "ikn-article-test",
        lexiconLookup: buildLexiconLookup([
          {
            lemmaId: "en:a:noun",
            sourceLemma: "a",
            targetLemma: "poquito",
            pos: "noun",
            frequencyRank: 1642,
            confidence: 0.76
          },
          {
            lemmaId: "en:house:noun",
            sourceLemma: "house",
            targetLemma: "casa",
            pos: "noun",
            frequencyRank: 430,
            confidence: 0.97
          }
        ]),
        vocabByLemmaId: new Map(),
        isKnownWordForScoring: () => false
      });

      expect(document.body.textContent).toContain("a casa");
      expect(document.body.textContent).not.toContain("poquito casa");
    });
  });

  it("keeps sentence-initial discourse markers in English", async () => {
    await withFixtureDom("article-basic.html", ({ document }) => {
      const textNode = document.createTextNode("Well, the team worked well.");
      document.body.append(textNode);

      const result = processTextNode(textNode, {
        discoveryRate: 1,
        samplingSeed: "discourse-well-test",
        createNodeId: () => "ikn-discourse-well-test",
        lexiconLookup: buildLexiconLookup([
          {
            lemmaId: "en:well:adverb",
            sourceLemma: "well",
            targetLemma: "bien",
            pos: "adverb",
            frequencyRank: 48,
            confidence: 0.94
          }
        ]),
        vocabByLemmaId: new Map(),
        isKnownWordForScoring: () => false
      });

      expect(result.contextSkippedCount).toBe(1);
      expect(document.body.textContent).toContain("Well, the team worked bien.");
      expect(document.body.textContent).not.toContain("Bien,");
    });
  });

  it("keeps context-sensitive surface forms in English before analyzer confirmation", async () => {
    await withFixtureDom("article-basic.html", ({ document }) => {
      const textNode = document.createTextNode(
        "You might not need to write specs. This creates zero friction. ACIDs rely on stable numbering. The feature boundary is up to you."
      );
      document.body.append(textNode);

      const result = processTextNode(textNode, {
        discoveryRate: 1,
        samplingSeed: "context-sensitive-word-test",
        createNodeId: () => "ikn-context-sensitive-word-test",
        lexiconLookup: buildLexiconLookup([
          {
            lemmaId: "en:need:noun",
            sourceLemma: "need",
            targetLemma: "necesidad",
            pos: "noun",
            frequencyRank: 594,
            confidence: 0.97
          },
          {
            lemmaId: "en:this:adjective",
            sourceLemma: "this",
            targetLemma: "este",
            pos: "adjective",
            frequencyRank: 29,
            confidence: 0.97
          },
          {
            lemmaId: "en:zero:noun",
            sourceLemma: "zero",
            targetLemma: "cero",
            pos: "noun",
            frequencyRank: 1452,
            confidence: 0.97
          },
          {
            lemmaId: "en:on:adverb",
            sourceLemma: "on",
            targetLemma: "encima",
            pos: "adverb",
            frequencyRank: 488,
            confidence: 0.78
          },
          {
            lemmaId: "en:up:adverb",
            sourceLemma: "up",
            targetLemma: "arriba",
            pos: "adverb",
            frequencyRank: 527,
            confidence: 0.78
          },
          {
            lemmaId: "en:stable:adjective",
            sourceLemma: "stable",
            targetLemma: "estable",
            pos: "adjective",
            frequencyRank: 2632,
            confidence: 0.97
          }
        ]),
        vocabByLemmaId: new Map(),
        isKnownWordForScoring: () => false
      });

      expect(result.replaced).toBe(true);
      expect(result.contextSkippedCount).toBe(5);
      expect(document.body.textContent).toContain("not need to write");
      expect(document.body.textContent).toContain("This creates zero friction");
      expect(document.body.textContent).toContain("rely on estable numbering");
      expect(document.body.textContent).toContain("up to you");
      expect(document.body.textContent).not.toContain("necesidad");
      expect(document.body.textContent).not.toContain("Este creates");
      expect(document.body.textContent).not.toContain("cero friction");
      expect(document.body.textContent).not.toContain("encima estable");
      expect(document.body.textContent).not.toContain("arriba to you");
    });
  });

  it("still injects need when the local context supports the noun sense", async () => {
    await withFixtureDom("article-basic.html", ({ document }) => {
      const textNode = document.createTextNode(
        "There is a great need for clean water."
      );
      document.body.append(textNode);

      const result = processTextNode(textNode, {
        discoveryRate: 1,
        samplingSeed: "noun-need-word-test",
        createNodeId: () => "ikn-noun-need-word-test",
        lexiconLookup: buildLexiconLookup([
          {
            lemmaId: "en:need:noun",
            sourceLemma: "need",
            targetLemma: "necesidad",
            pos: "noun",
            frequencyRank: 594,
            confidence: 0.97
          }
        ]),
        vocabByLemmaId: new Map(),
        isKnownWordForScoring: () => false
      });

      expect(result.replaced).toBe(true);
      expect(result.contextSkippedCount).toBe(0);
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
        lexiconLookup: buildLexiconLookup([
          {
            lemmaId: "en:telescope:noun",
            sourceLemma: "telescope",
            targetLemma: "telescopio",
            pos: "noun",
            frequencyRank: 2800,
            confidence: 0.91
          }
        ]),
        vocabByLemmaId: new Map(),
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

  it("lets due discovery words bypass the active curriculum gate", async () => {
    await withFixtureDom("article-basic.html", ({ document }) => {
      const textNode = document.createTextNode("The telescope watched the comet.");
      document.body.append(textNode);

      const result = processTextNode(textNode, {
        discoveryRate: 1,
        samplingSeed: "curriculum-due-word-test",
        createNodeId: () => "ikn-curriculum-due-word-test",
        lexiconLookup: buildLexiconLookup([
          {
            lemmaId: "en:telescope:noun",
            sourceLemma: "telescope",
            targetLemma: "telescopio",
            pos: "noun",
            frequencyRank: 2800,
            confidence: 0.91
          }
        ]),
        vocabByLemmaId: new Map(),
        isKnownWordForScoring: () => false,
        isDueForReview: () => true,
        shouldActivateWord: () => ({
          eligible: false,
          configId: "test-curriculum",
          activeBandId: "level-1a",
          skipReason: "above-active-band-difficulty"
        })
      });

      expect(result.replaced).toBe(true);
      expect(result.curriculumSkippedWordCount).toBe(0);
      expect(document.body.textContent).toContain("The telescopio watched the comet.");
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
        lexiconLookup: buildLexiconLookup([
          {
            lemmaId: "en:telescope:noun",
            sourceLemma: "telescope",
            targetLemma: "telescopio",
            pos: "noun",
            frequencyRank: 2800,
            confidence: 0.91
          }
        ]),
        vocabByLemmaId: new Map(),
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
        "[data-ik-lemma-id='en:telescope:noun']"
      );

      expect(result.replaced).toBe(true);
      expect(document.body.textContent).toContain("The telescopio watched the comet.");
      expect(token?.getAttribute("data-ik-scheduler-reason")).toBe(
        "beginner-cognate"
      );
    });
  });
});
