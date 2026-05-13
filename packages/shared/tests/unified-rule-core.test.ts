import { describe, expect, it } from "vitest";

import {
  BEGINNER_DIFFICULTY_PRESET,
  DEFAULT_SUITABILITY_PRESETS,
  buildRuntimePhraseId,
  buildSentenceAnalysisIdentity,
  createRuntimePhraseRegistryEntry,
  createSentenceAnalysisEntry,
  detectFixedPhrasesFromAnalyzerOutput,
  detectGrammarCarriersFromAnalyzerOutput,
  detectHighConfidenceChunksFromAnalyzerOutput,
  evaluateContextAwareDecision,
  getV1AmbiguityGroupForWord,
  normalizeAnalyzerToken,
  normalizePhraseText,
  scoreSentenceSuitability,
  tokenizeForLookup,
  type AnalyzerOutput,
  type ContextualWordCandidate
} from "../src";

describe("unified shared contracts", () => {
  it("keys sentence analysis by sentence hash and analyzer version", () => {
    const output = createAnalyzerOutput("The can rolled away.", ["DET", "NOUN", "VERB", "ADV"]);
    const entry = createSentenceAnalysisEntry(output, {
      createdAt: "2026-04-23T12:00:00.000Z"
    });

    expect(buildSentenceAnalysisIdentity(entry.sentenceHash, entry.analyzerVersion)).toBe(
      "hash-the-can:fixture-annotated@1"
    );
    expect(entry.lemmas).toEqual(["the", "can", "rolled", "away"]);
    expect(entry.lastAccessedAt).toBe(entry.createdAt);
  });

  it("canonicalizes runtime phrase identity with source kind and target text", () => {
    const first = createRuntimePhraseRegistryEntry({
      sourceText: " At least! ",
      targetText: "por lo menos",
      sourceKind: "fixed-phrase",
      category: "function-phrase",
      confidence: 0.94,
      firstSeenAt: "2026-04-23T12:00:00.000Z"
    });
    const alternateTargetId = buildRuntimePhraseId({
      normalizedSourceText: "at least",
      sourceKind: "fixed-phrase",
      normalizedTargetText: "al menos"
    });

    expect(normalizePhraseText(" At least! ")).toBe("at least");
    expect(first.phraseId).toBe("phrase:fixed-phrase:at-least:por-lo-menos");
    expect(first.phraseId).not.toBe(alternateTargetId);
  });
});

describe("unified ambiguity rules", () => {
  it("exposes the V1 lemma inventory as pure decisions", () => {
    const candidate: ContextualWordCandidate = {
      id: "can-modal",
      sentence: "Can you help?",
      tokenText: "Can",
      targetLemma: "lata",
      candidateLemma: "can",
      candidatePos: "noun",
      observedPos: "modal",
      chunkType: "verb-phrase",
      nearbyContextSignature: ["sentence-initial-modal-question"],
      ambiguityGroup: getV1AmbiguityGroupForWord("CAN") ?? "",
      confidence: 0.98
    };

    expect(candidate.ambiguityGroup).toBe("can_modal_vs_noun");
    expect(evaluateContextAwareDecision(candidate).decision).toBe("skip");
  });
});

describe("unified phrase detection helpers", () => {
  it("detects fixed phrases, grammar carriers, and high-confidence chunks from analyzer output", () => {
    const output = createAnalyzerOutput(
      "We are going to take care of the captain of the football team at least.",
      [
        "PRON",
        "VERB",
        "VERB",
        "PREP",
        "VERB",
        "NOUN",
        "PREP",
        "DET",
        "NOUN",
        "PREP",
        "DET",
        "NOUN",
        "NOUN",
        "PREP",
        "ADJ"
      ],
      {
        chunks: [
          {
            text: "the captain of the football team",
            normalized: "the captain of the football team",
            type: "noun-phrase",
            tokenStart: 7,
            tokenEnd: 13,
            confidence: 0.92
          }
        ]
      }
    );

    expect(
      detectFixedPhrasesFromAnalyzerOutput(output).map(
        (candidate) => candidate.normalizedSourceText
      )
    ).toEqual(["take care of", "at least"]);
    expect(
      detectGrammarCarriersFromAnalyzerOutput(output).map(
        (candidate) => candidate.normalizedSourceText
      )
    ).toEqual(["going to"]);
    expect(
      detectHighConfidenceChunksFromAnalyzerOutput(output).map(
        (candidate) => candidate.normalizedSourceText
      )
    ).toEqual(["the captain of the football team"]);
  });
});

describe("unified suitability scoring", () => {
  it("keeps sentence suitability presets as the default baseline", () => {
    const score = scoreSentenceSuitability(
      {
        vocabularyFit: 0.9,
        grammarFit: 0.8,
        structuralSimplicity: 0.8,
        dueTargetValue: 0.6,
        ambiguityPenalty: 0.1,
        chunkUsefulness: 0.7,
        stretchDemand: 0.25
      },
      DEFAULT_SUITABILITY_PRESETS[BEGINNER_DIFFICULTY_PRESET.id]
    );

    expect(DEFAULT_SUITABILITY_PRESETS[BEGINNER_DIFFICULTY_PRESET.id]).toBe(
      BEGINNER_DIFFICULTY_PRESET
    );
    expect(score.difficultyBand).toBe("core");
    expect(score.normalizedScore).toBeGreaterThan(0.72);
  });
});

function createAnalyzerOutput(
  sourceText: string,
  posTags: string[],
  overrides: Partial<AnalyzerOutput> = {}
): AnalyzerOutput {
  const tokens = tokenizeForLookup(sourceText).map((token, index) =>
    normalizeAnalyzerToken({
      text: token.raw,
      normalized: token.normalized,
      lemma: token.normalized,
      pos: posTags[index],
      tags: [posTags[index]],
      startOffset: token.start,
      endOffset: token.end
    })
  );

  return {
    analyzerId: "fixture-annotated",
    analyzerVersion: "fixture-annotated@1",
    sentenceHash: "hash-the-can",
    sourceText,
    tokens,
    chunks: [],
    grammarFeatures: [],
    ...overrides
  };
}
