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
});
