import { describe, expect, it } from "vitest";
import type {
  ContextualWordCandidate,
  GrammarFeatureMatch,
  PhraseOccurrence,
  SentenceAnalysisEntry
} from "@immersionkit/shared";
import {
  buildCachedSentenceAnalysisContext,
  findRuntimeWordDecision,
  mergeRuntimeAnalysisContext,
  upsertRuntimeSentenceAnalysis
} from "../src/content/runtime-analysis";

describe("content runtime analysis context", () => {
  it("indexes cached inject and skip decisions by normalized token", () => {
    const context = buildCachedSentenceAnalysisContext([
      createEntry({
        sentenceHash: "sentence:one",
        contextualWordCandidates: [
          createCandidate({
            id: "inject-city",
            tokenText: "City",
            normalizedText: "city",
            lexemeId: "lexeme-city",
            targetLemma: "ciudad",
            decision: "inject"
          }),
          createCandidate({
            id: "skip-can-generic",
            tokenText: "can",
            normalizedText: "can",
            lexemeId: "lexeme-can",
            targetLemma: "lata",
            decision: "skip"
          }),
          createCandidate({
            id: "skip-can-render-unit",
            tokenText: "can",
            normalizedText: "can",
            lexemeId: "lexeme-can",
            renderUnitId: "ru:can:noun",
            targetLemma: "lata",
            decision: "skip"
          })
        ]
      })
    ]).analysisContext;

    expect(
      findRuntimeWordDecision({
        analysisContext: context,
        sentenceHash: "sentence:one",
        sourceToken: "city",
        decision: "inject",
        lexemeId: "lexeme-city"
      })?.targetText
    ).toBe("ciudad");
    expect(
      findRuntimeWordDecision({
        analysisContext: context,
        sentenceHash: "sentence:one",
        sourceToken: "can",
        decision: "skip",
        lexemeId: "lexeme-can",
        renderUnitId: "ru:can:noun"
      })?.renderUnitId
    ).toBe("ru:can:noun");
  });

  it("maps phrase matches and grammar features from typed analysis entries", () => {
    const phrase = createPhraseOccurrence();
    const grammarFeature = createGrammarFeature();

    const context = buildCachedSentenceAnalysisContext([
      createEntry({
        sentenceHash: "sentence:phrase",
        phraseMatches: [phrase],
        grammarFeatures: [grammarFeature]
      })
    ]);

    expect(
      context.cachedPhraseMatchesBySentenceHash.get("sentence:phrase")?.[0]
    ).toMatchObject({
      phraseId: phrase.phraseId,
      sourceText: phrase.sourceText,
      category: phrase.category
    });
    expect(
      context.cachedGrammarFeaturesBySentenceHash.get("sentence:phrase")?.[0]
    ).toMatchObject({
      featureId: grammarFeature.featureId,
      featureKey: grammarFeature.featureKey,
      category: grammarFeature.category
    });
  });

  it("merges and upserts sentence analysis without losing omitted existing fields", () => {
    const target = buildCachedSentenceAnalysisContext([
      createEntry({
        sentenceHash: "sentence:target",
        phraseMatches: [createPhraseOccurrence()]
      })
    ]).analysisContext;
    const source = buildCachedSentenceAnalysisContext([
      createEntry({
        sentenceHash: "sentence:source",
        grammarFeatures: [createGrammarFeature()]
      })
    ]).analysisContext;

    mergeRuntimeAnalysisContext(target, source);
    upsertRuntimeSentenceAnalysis(target, "sentence:target", {
      wordDecisions: [
        {
          sentenceHash: "sentence:target",
          lexemeId: "lexeme-city",
          normalizedText: "city",
          targetText: "ciudad",
          decision: "inject"
        }
      ]
    });

    expect(target.bySentenceHash.has("sentence:source")).toBe(true);
    expect(target.bySentenceHash.get("sentence:target")?.wordDecisions).toHaveLength(1);
    expect(target.bySentenceHash.get("sentence:target")?.phraseMatches).toHaveLength(1);
  });
});

function createEntry(input: {
  sentenceHash: string;
  contextualWordCandidates?: ContextualWordCandidate[];
  phraseMatches?: PhraseOccurrence[];
  grammarFeatures?: GrammarFeatureMatch[];
}): SentenceAnalysisEntry {
  return {
    sentenceHash: input.sentenceHash,
    analyzerVersion: "fixture-v1",
    analyzerId: "fixture-annotated",
    sourceText: "The city can change.",
    tokens: [],
    lemmas: [],
    posTags: [],
    chunks: [],
    contextualWordCandidates: input.contextualWordCandidates ?? [],
    phraseMatches: input.phraseMatches ?? [],
    grammarFeatures: input.grammarFeatures ?? [],
    createdAt: "2026-04-18T10:00:00.000Z",
    lastAccessedAt: "2026-04-18T10:00:00.000Z"
  };
}

function createCandidate(
  input: Partial<ContextualWordCandidate> & {
    id: string;
    tokenText: string;
    lexemeId: string;
    targetLemma: string;
    decision: "inject" | "skip";
  }
): ContextualWordCandidate {
  return {
    sentenceHash: "sentence:one",
    sentence: "The city can change.",
    normalizedText: input.tokenText.toLowerCase(),
    candidateLemma: input.tokenText.toLowerCase(),
    candidatePos: "noun",
    observedPos: "noun",
    chunkType: "noun-phrase",
    nearbyContextSignature: [],
    ambiguityGroup: "fixture",
    confidence: 0.9,
    ...input
  };
}

function createPhraseOccurrence(): PhraseOccurrence {
  return {
    occurrenceId: "occurrence:used-to",
    phraseId: "phrase:used-to",
    sentenceHash: "sentence:phrase",
    analyzerVersion: "fixture-v1",
    sourceText: "used to",
    normalizedSourceText: "used to",
    sourceKind: "pattern-match",
    category: "grammar-carrier",
    ruleId: "used-to-verb",
    span: {
      startToken: 1,
      endToken: 3,
      startChar: 4,
      endChar: 11
    },
    confidence: 0.92
  };
}

function createGrammarFeature(): GrammarFeatureMatch {
  return {
    featureId: "grammar:aspect:have-been",
    featureKey: "aspect:have-been",
    label: "Have been",
    category: "tense-aspect",
    sourceText: "has been",
    normalizedSourceText: "has been",
    span: {
      startToken: 2,
      endToken: 4,
      startChar: 9,
      endChar: 17
    },
    evidence: ["fixture"],
    confidence: 0.86
  };
}
