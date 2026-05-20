import { hashSentence, type LearningItem } from "@immersionkit/shared";
import { describe, expect, it } from "vitest";

import { processTextNode } from "../src/content/annotate";
import type { CachedPhraseMatch } from "../src/content/storage";
import type { WordRenderEntry } from "../src/render-units/render-units";
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
        wordRenderIndex: new Map([
          [
            "visit",
            wordEntry("lexeme-visit", "visit", "visitar", 100)
          ],
          [
            "city",
            wordEntry("lexeme-city", "city", "ciudad", 101)
          ]
        ]),
        vocabByLexemeId: new Map(),
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
      expect(document.querySelector("[data-ik-lexeme-id='lexeme-visit']")).toBeNull();
      expect(document.querySelector("[data-ik-lexeme-id='lexeme-city']")).toBeTruthy();
      expect(phrase?.querySelector("[data-ik-token-id]")).toBeNull();
    });
  });

  it("maps normalized phrase spans back onto wrapped page text", async () => {
    await withFixtureDom("article-basic.html", ({ document }) => {
      const rawText =
        "As soon as we arrive at the old city, we read the important book\n          right now.";
      const normalizedSentence =
        "As soon as we arrive at the old city, we read the important book right now.";
      const textNode = document.createTextNode(rawText);
      document.body.append(textNode);

      const phraseStart = normalizedSentence.indexOf("right now");
      const result = processTextNode(textNode, {
        discoveryRate: 1,
        samplingSeed: "phrase-normalized-span-test",
        createNodeId: () => "ikn-phrase-normalized-span-test",
        wordRenderIndex: new Map(),
        vocabByLexemeId: new Map(),
        isKnownWordForScoring: () => false,
        cachedPhraseMatchesBySentenceHash: phraseMatchesFor(normalizedSentence, [
          createPhraseMatch(normalizedSentence, {
            phraseId: "ru:right-now:fixed-phrase",
            sourceText: "right now",
            startChar: phraseStart,
            endChar: phraseStart + "right now".length,
            sourceKind: "fixed-phrase",
            category: "fixed-idiom"
          })
        ]),
        learningItemsByUnitRefId: new Map([
          [
            "ru:right-now:fixed-phrase",
            createPhraseLearningItem({
              phraseId: "ru:right-now:fixed-phrase",
              sourceText: "right now",
              targetText: "ahora mismo"
            })
          ]
        ])
      });

      expect(result.phraseInjectedCount).toBe(1);
      const phrase = document.querySelector<HTMLElement>("[data-ik-unit-kind='phrase']");
      expect(phrase?.textContent).toBe("ahora mismo");
      expect(phrase?.getAttribute("data-ik-source-token")).toBe("right now");
      expect(document.body.textContent).toContain("important book\n          ahora mismo.");
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
        wordRenderIndex: new Map(),
        vocabByLexemeId: new Map(),
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
        wordRenderIndex: new Map(),
        vocabByLexemeId: new Map(),
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

  it("does not let due-review render units bypass the active curriculum gate", async () => {
    await withFixtureDom("article-basic.html", ({ document }) => {
      const sentence = "We take care of the old city.";
      const textNode = document.createTextNode(sentence);
      document.body.append(textNode);
      const gateInputs: Array<{ renderUnitMinBand?: string; isDueForReview: boolean }> = [];

      const result = processTextNode(textNode, {
        discoveryRate: 1,
        samplingSeed: "phrase-render-unit-due-gate-test",
        createNodeId: () => "ikn-phrase-render-unit-due-gate-test",
        wordRenderIndex: new Map(),
        vocabByLexemeId: new Map(),
        isKnownWordForScoring: () => false,
        cachedPhraseMatchesBySentenceHash: phraseMatchesFor(sentence, [
          createPhraseMatch(sentence, {
            phraseId: "ru:test-take-care-of",
            sourceText: "take care of",
            startChar: 3,
            endChar: 15,
            sourceKind: "fixed-phrase",
            category: "fixed-idiom",
            renderUnitMinBand: "level-2a"
          })
        ]),
        learningItemsByUnitRefId: new Map([
          [
            "ru:test-take-care-of",
            createPhraseLearningItem({
              phraseId: "ru:test-take-care-of",
              sourceText: "take care of",
              targetText: "cuidar de",
              nextReviewAt: "2000-01-01T00:00:00.000Z"
            })
          ]
        ]),
        shouldActivatePhrase: (input) => {
          gateInputs.push({
            renderUnitMinBand: input.renderUnitMinBand,
            isDueForReview: input.isDueForReview
          });
          return {
            eligible: false,
            configId: "test-curriculum",
            activeBandId: "level-1a",
            skipReason: "render-unit-outside-active-band"
          };
        }
      });

      expect(gateInputs).toEqual([
        { renderUnitMinBand: "level-2a", isDueForReview: true }
      ]);
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
        wordRenderIndex: new Map(),
        vocabByLexemeId: new Map(),
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
        wordRenderIndex: new Map(),
        vocabByLexemeId: new Map(),
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

function wordEntry(
  lexemeId: string,
  sourceText: string,
  targetText: string,
  frequencyRank: number
): WordRenderEntry {
  return {
    lexemeId,
    renderUnitId: `ru:${lexemeId}`,
    renderUnitMinBand: "level-1a",
    renderUnitMatchMode: "exact",
    normalizedSourceText: sourceText,
    targetText,
    sourceLemma: sourceText,
    targetLemma: targetText,
    pos: "noun",
    frequencyRank,
    confidence: 0.9,
    sourceLanguage: "en",
    targetLanguage: "es",
    sourceDataset: "render-units"
  };
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
    renderUnitMinBand?: CachedPhraseMatch["renderUnitMinBand"];
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
    renderUnitId: input.phraseId.startsWith("ru:") ? input.phraseId : undefined,
    renderUnitMinBand: input.renderUnitMinBand,
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
