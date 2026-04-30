import { hashSentence, type LearningItem } from "@immersionkit/shared";
import { describe, expect, it } from "vitest";

import { processTextNode } from "../src/content/annotate";
import type { CachedPhraseMatch } from "../src/content/storage";
import { withFixtureDom } from "./helpers/fixture-dom";

describe("content phrase-unit rendering", () => {
  it("lets a coherent cached phrase unit win over child word units", async () => {
    await withFixtureDom("article-basic.html", ({ document }) => {
      const sentence = "I used to visit the old city often.";
      const textNode = document.createTextNode(sentence);
      document.body.append(textNode);

      const result = processTextNode(textNode, {
        discoveryRate: 1,
        samplingSeed: "phrase-test",
        createNodeId: () => "ikn-phrase-test",
        lexiconLookup: new Map([
          [
            "visit",
            {
              lemmaId: "lemma-visit",
              sourceLemma: "visit",
              targetLemma: "visitar",
              pos: "noun",
              frequencyRank: 100,
              confidence: 0.9
            }
          ],
          [
            "city",
            {
              lemmaId: "lemma-city",
              sourceLemma: "city",
              targetLemma: "ciudad",
              pos: "noun",
              frequencyRank: 101,
              confidence: 0.9
            }
          ]
        ]),
        vocabByLemmaId: new Map(),
        isKnownWordForScoring: () => false,
        cachedPhraseMatchesBySentenceHash: phraseMatchesFor(sentence, [
          createPhraseMatch(sentence, {
            phraseId: "phrase:pattern:used-to-visit",
            sourceText: "used to visit",
            startChar: 2,
            endChar: 15
          })
        ]),
        learningItemsByUnitRefId: new Map([
          [
            "phrase:pattern:used-to-visit",
            createPhraseLearningItem({
              phraseId: "phrase:pattern:used-to-visit",
              sourceText: "used to visit",
              targetText: "solia visitar"
            })
          ]
        ])
      });

      expect(result.phraseInjectedCount).toBe(1);
      const phrase = document.querySelector<HTMLElement>("[data-ik-unit-kind='phrase']");
      expect(phrase?.textContent).toBe("solia visitar");
      expect(phrase?.getAttribute("data-ik-source-token")).toBe("used to visit");
      expect(document.querySelector("[data-ik-lemma-id='lemma-visit']")).toBeNull();
      expect(document.querySelector("[data-ik-lemma-id='lemma-city']")).toBeTruthy();
      expect(phrase?.querySelector("[data-ik-token-id]")).toBeNull();
    });
  });

  it("rejects overlapping phrase spans deterministically", async () => {
    await withFixtureDom("article-basic.html", ({ document }) => {
      const sentence = "I used to visit the old city often.";
      const textNode = document.createTextNode(sentence);
      document.body.append(textNode);

      const result = processTextNode(textNode, {
        discoveryRate: 1,
        samplingSeed: "phrase-overlap-test",
        createNodeId: () => "ikn-phrase-overlap-test",
        lexiconLookup: new Map(),
        vocabByLemmaId: new Map(),
        isKnownWordForScoring: () => false,
        cachedPhraseMatchesBySentenceHash: phraseMatchesFor(sentence, [
          createPhraseMatch(sentence, {
            phraseId: "phrase:pattern:used-to",
            sourceText: "used to",
            startChar: 2,
            endChar: 9
          }),
          createPhraseMatch(sentence, {
            phraseId: "phrase:pattern:used-to-visit",
            sourceText: "used to visit",
            startChar: 2,
            endChar: 15
          })
        ]),
        learningItemsByUnitRefId: new Map([
          [
            "phrase:pattern:used-to",
            createPhraseLearningItem({
              phraseId: "phrase:pattern:used-to",
              sourceText: "used to",
              targetText: "solia"
            })
          ],
          [
            "phrase:pattern:used-to-visit",
            createPhraseLearningItem({
              phraseId: "phrase:pattern:used-to-visit",
              sourceText: "used to visit",
              targetText: "solia visitar"
            })
          ]
        ])
      });

      expect(result.phraseInjectedCount).toBe(1);
      expect(result.phraseRejectedCount).toBe(1);
      expect(document.querySelectorAll("[data-ik-unit-kind='phrase']")).toHaveLength(1);
      expect(document.querySelector("[data-ik-phrase-id='phrase:pattern:used-to-visit']")).toBeTruthy();
      expect(document.querySelector("[data-ik-phrase-id='phrase:pattern:used-to']")).toBeNull();

      const wrapper = document.querySelector<HTMLElement>(
        "[data-ik-phrase-rejection-details]"
      );
      const details = JSON.parse(
        wrapper?.getAttribute("data-ik-phrase-rejection-details") ?? "[]"
      ) as Array<Record<string, unknown>>;
      expect(details[0]).toMatchObject({
        phraseId: "phrase:pattern:used-to",
        reason: "overlap",
        sourceText: "used to",
        targetText: "solia",
        sourceKind: "pattern-match",
        category: "grammar-carrier",
        sentenceHash: hashSentence(sentence)
      });
    });
  });

  it("skips cached phrase units when the active curriculum gate rejects them", async () => {
    await withFixtureDom("article-basic.html", ({ document }) => {
      const sentence = "I used to visit the old city often.";
      const textNode = document.createTextNode(sentence);
      document.body.append(textNode);

      const result = processTextNode(textNode, {
        discoveryRate: 1,
        samplingSeed: "phrase-curriculum-test",
        createNodeId: () => "ikn-phrase-curriculum-test",
        lexiconLookup: new Map(),
        vocabByLemmaId: new Map(),
        isKnownWordForScoring: () => false,
        cachedPhraseMatchesBySentenceHash: phraseMatchesFor(sentence, [
          createPhraseMatch(sentence, {
            phraseId: "phrase:pattern:used-to-visit",
            sourceText: "used to visit",
            startChar: 2,
            endChar: 15
          })
        ]),
        learningItemsByUnitRefId: new Map([
          [
            "phrase:pattern:used-to-visit",
            createPhraseLearningItem({
              phraseId: "phrase:pattern:used-to-visit",
              sourceText: "used to visit",
              targetText: "solia visitar",
              nextReviewAt: "2099-04-26T10:00:00.000Z"
            })
          ]
        ]),
        shouldActivatePhrase: () => ({
          eligible: false,
          configId: "test-curriculum",
          activeBandId: "level-1a",
          skipReason: "outside-active-band-items"
        })
      });

      expect(result.phraseInjectedCount).toBe(0);
      expect(result.curriculumSkippedPhraseCount).toBe(1);
      expect(result.phraseRejectedCount).toBe(1);
      expect(document.querySelector("[data-ik-unit-kind='phrase']")).toBeNull();
      expect(document.body.textContent).toContain(sentence);
    });
  });

  it("passes phrase source text into the active curriculum inventory gate", async () => {
    await withFixtureDom("article-basic.html", ({ document }) => {
      const sentence = "The public health care system needs support.";
      const textNode = document.createTextNode(sentence);
      document.body.append(textNode);
      const gateInputs: string[] = [];

      const result = processTextNode(textNode, {
        discoveryRate: 1,
        samplingSeed: "phrase-content-inventory-test",
        createNodeId: () => "ikn-phrase-content-inventory-test",
        lexiconLookup: new Map(),
        vocabByLemmaId: new Map(),
        isKnownWordForScoring: () => false,
        cachedPhraseMatchesBySentenceHash: phraseMatchesFor(sentence, [
          createPhraseMatch(sentence, {
            phraseId: "phrase:chunk:public-health-care-system:sistema-de-salud-publica",
            sourceText: "public health care system",
            startChar: 4,
            endChar: 29,
            sourceKind: "chunk",
            category: "noun-chunk"
          })
        ]),
        learningItemsByUnitRefId: new Map([
          [
            "phrase:chunk:public-health-care-system:sistema-de-salud-publica",
            createPhraseLearningItem({
              phraseId: "phrase:chunk:public-health-care-system:sistema-de-salud-publica",
              sourceText: "public health care system",
              targetText: "sistema de salud publica",
              nextReviewAt: "2099-04-26T10:00:00.000Z"
            })
          ]
        ]),
        shouldActivatePhrase: (input) => {
          gateInputs.push(input.sourceText);
          return {
            eligible: false,
            configId: "test-curriculum",
            activeBandId: "level-1a",
            skipReason: "phrase-outside-content"
          };
        }
      });

      expect(gateInputs).toEqual(["public health care system"]);
      expect(result.phraseInjectedCount).toBe(0);
      expect(result.curriculumSkippedPhraseCount).toBe(1);
      expect(result.phraseRejectedCount).toBe(1);
    });
  });

  it("rejects cached phrase units with blank targets", async () => {
    await withFixtureDom("article-basic.html", ({ document }) => {
      const sentence = "The old city holds quiet memory.";
      const textNode = document.createTextNode(sentence);
      document.body.append(textNode);

      const result = processTextNode(textNode, {
        discoveryRate: 0,
        samplingSeed: "phrase-blank-target-test",
        createNodeId: () => "ikn-phrase-blank-target-test",
        lexiconLookup: new Map(),
        vocabByLemmaId: new Map(),
        isKnownWordForScoring: () => false,
        cachedPhraseMatchesBySentenceHash: phraseMatchesFor(sentence, [
          createPhraseMatch(sentence, {
            phraseId: "phrase:chunk:old-city:empty",
            sourceText: "old city",
            startChar: 4,
            endChar: 12
          })
        ]),
        learningItemsByUnitRefId: new Map([
          [
            "phrase:chunk:old-city:empty",
            createPhraseLearningItem({
              phraseId: "phrase:chunk:old-city:empty",
              sourceText: "old city",
              targetText: "   "
            })
          ]
        ])
      });

      expect(result.phraseInjectedCount).toBe(0);
      expect(result.phraseRejectedCount).toBe(1);
      expect(document.querySelector("[data-ik-unit-kind='phrase']")).toBeNull();
      expect(document.body.textContent).toContain(sentence);
      expect(result.unrenderedPhraseRejections[0]).toMatchObject({
        phraseId: "phrase:chunk:old-city:empty",
        reason: "blank-target",
        sourceText: "old city",
        targetText: "   ",
        sentenceHash: hashSentence(sentence)
      });
    });
  });
});

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
    sourceKind?: CachedPhraseMatch["sourceKind"];
    category?: CachedPhraseMatch["category"];
  }
): CachedPhraseMatch {
  return {
    occurrenceId: `${input.phraseId}:occurrence`,
    phraseId: input.phraseId,
    sentenceHash: hashSentence(sentence),
    sourceText: input.sourceText,
    normalizedSourceText: input.sourceText.toLowerCase(),
    sourceKind: input.sourceKind ?? "pattern-match",
    category: input.category ?? "grammar-carrier",
    ruleId: "used-to",
    span: {
      startToken: 1,
      endToken: 3,
      startChar: input.startChar,
      endChar: input.endChar
    },
    confidence: 0.92
  };
}

function createPhraseLearningItem(input: {
  phraseId: string;
  sourceText: string;
  targetText: string;
  nextReviewAt?: string;
}): LearningItem {
  return {
    itemId: `phrase:${input.phraseId}`,
    unitRefId: input.phraseId,
    unitType: "phrase",
    sourceText: input.sourceText,
    targetText: input.targetText,
    status: "new",
    introducedAt: "2026-04-25T10:00:00.000Z",
    nextReviewAt: input.nextReviewAt ?? "2026-04-25T10:00:00.000Z",
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
