import { describe, expect, it } from "vitest";
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

  it("normalizes tokens for lexicon lookup", () => {
    expect(normalizeToken(" \u201cRunner\u2019s,\u201d ")).toBe("runner's");
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
    expect(normalizeAndTokenize("Don\u2019t stop-believing")).toEqual([
      "don't",
      "stop-believing"
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
