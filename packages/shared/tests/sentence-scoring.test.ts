import { describe, expect, it } from "vitest";
import {
  isGoldilocksSentence,
  scoreSentence,
  scoreSentenceByKnownWords,
  scoreSentenceByVocabStatuses
} from "../src/scoring/sentence";

describe("sentence scoring", () => {
  it("scores known-word counts", () => {
    expect(scoreSentenceByKnownWords(3, 5)).toEqual({
      knownWordCount: 3,
      learningWordCount: 0,
      ignoredWordCount: 0,
      unknownWordCount: 2,
      totalWordCount: 5,
      knownRatio: 0.6,
      familiarRatio: 0.6
    });
  });

  it("guards against invalid totals by inferring minimum total count", () => {
    expect(
      scoreSentence({
        knownWordCount: 2,
        learningWordCount: 2,
        ignoredWordCount: 1,
        totalWordCount: 2
      })
    ).toEqual({
      knownWordCount: 2,
      learningWordCount: 2,
      ignoredWordCount: 1,
      unknownWordCount: 0,
      totalWordCount: 5,
      knownRatio: 0.4,
      familiarRatio: 0.8
    });
  });

  it("scores sentences directly from vocab statuses", () => {
    expect(
      scoreSentenceByVocabStatuses(["known", "learning", "new", "ignored", "known"])
    ).toEqual({
      knownWordCount: 2,
      learningWordCount: 1,
      ignoredWordCount: 1,
      unknownWordCount: 1,
      totalWordCount: 5,
      knownRatio: 0.4,
      familiarRatio: 0.6
    });
  });
});

describe("goldilocks selection", () => {
  it("supports threshold-only checks for backwards compatibility", () => {
    expect(isGoldilocksSentence(scoreSentenceByKnownWords(3, 5))).toBe(true);
    expect(isGoldilocksSentence(scoreSentenceByKnownWords(2, 5))).toBe(false);
  });

  it("supports richer options for difficulty tuning", () => {
    const score = scoreSentenceByKnownWords(3, 4);
    expect(
      isGoldilocksSentence(score, {
        minimumKnownRatio: 0.7,
        maximumKnownRatio: 0.9,
        minimumWordCount: 4
      })
    ).toBe(true);
  });

  it("can require at least one unknown word", () => {
    const allKnown = scoreSentenceByKnownWords(4, 4);
    expect(
      isGoldilocksSentence(allKnown, {
        minimumKnownRatio: 0.6,
        requireUnknownWords: true
      })
    ).toBe(false);
  });
});
