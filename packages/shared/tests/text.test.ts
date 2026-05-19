import { describe, expect, it } from "vitest";
import {
  beginnerCognateDiscoveryRateFloor,
  evaluateEnglishSpanishCognate,
  scoreOrthographicSimilarity
} from "../src/text/cognates";
import { hashSentence, hashString, normalizeSentenceForHash } from "../src/text/hash";
import {
  normalizeSentenceText,
  normalizeToken,
  normalizeWhitespace
} from "../src/text/normalize";
import {
  normalizeAndTokenize,
  tokenizeForLookup,
  tokenizePlainText
} from "../src/text/tokenize";

describe("text normalization", () => {
  it("normalizes whitespace into single spaces", () => {
    expect(normalizeWhitespace("  Hello \n   world\tfrom\tImmersionKit  ")).toBe(
      "Hello world from ImmersionKit"
    );
  });

  it("normalizes smart punctuation for sentence text", () => {
    expect(normalizeSentenceText("Don\u2019t \u2014 stop")).toBe("Don't - stop");
  });

  it("normalizes tokens for render lookup", () => {
    expect(normalizeToken(" \u201cRunner\u2019s,\u201d ")).toBe("runner's");
    expect(normalizeToken("¡Móvil!")).toBe("movil");
    expect(normalizeToken("...")).toBe("");
  });
});

describe("tokenization helpers", () => {
  it("extracts raw words in reading order", () => {
    expect(tokenizePlainText("Hello, world! It's 2026.")).toEqual([
      "Hello",
      "world",
      "It's",
      "2026"
    ]);
  });

  it("returns lookup tokens with offsets and normalized forms", () => {
    expect(tokenizeForLookup("Hi, all.")).toEqual([
      { raw: "Hi", normalized: "hi", start: 0, end: 2 },
      { raw: "all", normalized: "all", start: 4, end: 7 }
    ]);
  });

  it("returns normalized token stream for lookup hashing and matching", () => {
    expect(normalizeAndTokenize("Don\u2019t stop-believing rápido")).toEqual([
      "don't",
      "stop-believing",
      "rapido"
    ]);
  });
});

describe("sentence hashing", () => {
  it("hashes a string deterministically", () => {
    const hash = hashString("immersion-kit");
    expect(hash).toHaveLength(8);
    expect(hashString("immersion-kit")).toBe(hash);
  });

  it("normalizes sentence text into a tokenized hash input", () => {
    expect(normalizeSentenceForHash("  The   QUICK, brown fox! ")).toBe(
      "the quick brown fox"
    );
  });

  it("generates equivalent sentence hashes for spacing/punctuation variants", () => {
    const baseline = hashSentence("The quick brown fox");
    const variant = hashSentence("  The QUICK,  brown fox!!");

    expect(baseline).toBe(variant);
    expect(baseline.startsWith("v1:")).toBe(true);
  });
});

describe("English-Spanish cognate scoring", () => {
  it("scores close translation pairs as beginner confidence cognates", () => {
    const result = evaluateEnglishSpanishCognate({
      sourceLemma: "important",
      targetLemma: "importante",
      confidence: 0.95
    });

    expect(result).toMatchObject({
      isCognate: true,
      reason: "cognate"
    });
    expect(result.similarity).toBeGreaterThanOrEqual(0.85);
  });

  it("does not treat meaning-backed but visually distant translations as cognates", () => {
    expect(
      evaluateEnglishSpanishCognate({
        sourceLemma: "city",
        targetLemma: "ciudad",
        confidence: 0.98
      })
    ).toMatchObject({
      isCognate: false,
      reason: "low-similarity"
    });
  });

  it("normalizes Spanish accents before measuring distance", () => {
    expect(scoreOrthographicSimilarity("information", "información")).toBeGreaterThan(
      0.7
    );
  });

  it("only boosts cognates in beginner bands", () => {
    const entry = {
      sourceLemma: "telescope",
      targetLemma: "telescopio",
      confidence: 0.91,
      frequencyRank: 2800
    };

    expect(beginnerCognateDiscoveryRateFloor(entry, "level-1a")).toBeGreaterThan(0);
    expect(beginnerCognateDiscoveryRateFloor(entry, "level-2a")).toBeNull();
  });
});
