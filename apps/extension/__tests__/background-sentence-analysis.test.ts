import {
  DEFAULT_CURRICULUM_CONFIG,
  hashSentence,
  normalizeAnalyzerToken,
  resolveSentenceGrammarCards,
  type AnalyzerOutput,
  type CuratedPhraseTargetEntry,
  type GrammarFeatureMatch,
  type LanguagePairDefinition,
  type PhraseOccurrence,
  type PhraseRegistryEntry,
  type RenderUnitEntry,
  type SentenceAnalysisEntry,
  type WordInventoryEntry
} from "@immersionkit/shared";
import { describe, expect, it, vi } from "vitest";

import {
  SentenceAnalysisService,
  type SentenceAnalysisCandidate
} from "../src/background/sentence-analysis-service";
import {
  mergePhraseOccurrence,
  type PhraseRegistryRepository
} from "../src/background/phrase-registry";
import type { SentenceAnalysisCacheRepository } from "../src/background/sentence-analysis-cache";
import {
  createWinkNlpSentenceAnalyzer,
  type SentenceAnalyzer
} from "../src/background/sentence-analyzers";
import { parseRenderUnitAsset } from "../src/render-units/render-units";
import renderUnitAsset from "../src/assets/en-es.render-units.v1.json";

describe("background sentence analysis service", () => {
  it("caches SentenceAnalysisEntry records by sentence hash and analyzer version", async () => {
    const sourceText = "The captain has been patient.";
    const sentenceHash = hashSentence(sourceText);
    const analyze = vi.fn((sentence: string, suppliedHash?: string) =>
      createAnalyzerOutput(sentence, suppliedHash ?? hashSentence(sentence))
    );
    const analyzer = createAnalyzer("fixture-v1", analyze);
    const cache = new InMemorySentenceAnalysisCache();
    const service = new SentenceAnalysisService({
      analyzer,
      cache,
      loadRenderUnits: () => Promise.resolve([]),
      loadVocab: () => Promise.resolve(new Map())
    });
    const candidate: SentenceAnalysisCandidate = {
      sentenceHash,
      sourceText
    };

    const first = await service.analyzeCandidates([candidate]);
    const second = await service.analyzeCandidates([candidate]);

    expect(analyze).toHaveBeenCalledTimes(1);
    expect(first[0]?.cacheHit).toBe(false);
    expect(second[0]?.cacheHit).toBe(true);
    expect(await cache.get(sentenceHash, "fixture-v1+pair:en-es")).toBeTruthy();
    expect(await cache.get(sentenceHash, "fixture-v2")).toBeNull();
  });

  it("upserts only concept-backed grammar learning items from analysis", async () => {
    const sourceText = "You might visit if you can wait.";
    const sentenceHash = hashSentence(sourceText);
    const analyzer = createAnalyzer("fixture-v1", () => ({
      analyzerId: "fixture-annotated",
      analyzerVersion: "fixture-v1",
      sentenceHash,
      sourceText,
      tokens: tokensFromSpecs(sourceText, [
        ["You", "you", "pronoun", ["PRON", "pronoun"]],
        ["might", "might", "modal", ["MD", "modal"]],
        ["visit", "visit", "verb", ["VB", "verb"]],
        ["if", "if", "conjunction", ["SCONJ", "conjunction"]],
        ["you", "you", "pronoun", ["PRON", "pronoun"]],
        ["can", "can", "modal", ["MD", "modal"]],
        ["wait", "wait", "verb", ["VB", "verb"]]
      ]),
      chunks: [],
      grammarFeatures: [
        createGrammarFeatureMatch(sentenceHash, "modal:might"),
        createGrammarFeatureMatch(sentenceHash, "modal:can"),
        createGrammarFeatureMatch(sentenceHash, "conditional:if-basic")
      ]
    }));
    const learningItems = {
      upsertGrammarFeatureItems: vi.fn(async () => [])
    };
    const service = new SentenceAnalysisService({
      analyzer,
      cache: new InMemorySentenceAnalysisCache(),
      learningItems,
      loadRenderUnits: () => Promise.resolve([]),
      loadVocab: () => Promise.resolve(new Map())
    });

    const [analysis] = await service.analyzeCandidates([{ sentenceHash, sourceText }]);

    expect(analysis?.entry.grammarFeatures.map((feature) => feature.featureKey)).toEqual([
      "modal:might",
      "modal:can",
      "conditional:if-basic"
    ]);
    expect(learningItems.upsertGrammarFeatureItems).toHaveBeenCalledWith(
      [
        expect.objectContaining({ featureKey: "modal:can" }),
        expect.objectContaining({ featureKey: "conditional:if-basic" })
      ],
      expect.any(String)
    );
  });

  it("fails closed for ambiguous words when analyzer evidence is weak or blocked", async () => {
    const sourceText = "Can you watch the plant?";
    const sentenceHash = hashSentence(sourceText);
    const analyzer = createAnalyzer("fixture-v1", () => ({
      analyzerId: "fixture-annotated",
      analyzerVersion: "fixture-v1",
      sentenceHash,
      sourceText,
      tokens: [
        token("Can", "can", "modal", 0, 3, ["MD", "modal"]),
        token("you", "you", "pronoun", 4, 7, ["PRP", "pronoun"]),
        token("watch", "watch", "verb", 8, 13, ["VB", "verb"]),
        token("the", "the", "determiner", 14, 17, ["DT", "determiner"]),
        token("plant", "plant", "noun", 18, 23, ["NN", "noun"])
      ],
      chunks: [
        {
          text: "the plant",
          normalized: "the plant",
          type: "noun-phrase",
          tokenStart: 3,
          tokenEnd: 5,
          confidence: 0.84
        }
      ],
      grammarFeatures: []
    }));
    const service = new SentenceAnalysisService({
      analyzer,
      cache: new InMemorySentenceAnalysisCache(),
      loadRenderUnits: () =>
        Promise.resolve(createRenderUnits([
          wordEntry("lexeme-can", "can", "lata", "noun"),
          wordEntry("lexeme-watch", "watch", "reloj", "noun"),
          wordEntry("lexeme-plant", "plant", "planta", "noun")
        ])),
      loadVocab: () => Promise.resolve(new Map())
    });

    const [analysis] = await service.analyzeCandidates([{ sentenceHash, sourceText }]);
    const canCandidate = analysis?.entry.contextualWordCandidates.find(
      (candidate) => candidate.candidateLemma === "can"
    );
    const watchCandidate = analysis?.entry.contextualWordCandidates.find(
      (candidate) => candidate.candidateLemma === "watch"
    );
    const plantCandidate = analysis?.entry.contextualWordCandidates.find(
      (candidate) => candidate.candidateLemma === "plant"
    );

    expect(canCandidate?.decision).toBe("skip");
    expect(canCandidate?.rationale).toContain("below");
    expect(watchCandidate?.decision).toBe("skip");
    expect(plantCandidate?.decision).toBe("inject");
  });

  it("rejects wrong-sense screenshot replacements with observed POS evidence", async () => {
    const sourceText =
      "You might not need to write specs. This creates zero friction. ACIDs rely on stable numbering. The boundary is up to you.";
    const sentenceHash = hashSentence(sourceText);
    const analyzer = createAnalyzer("fixture-v1", () => ({
      analyzerId: "fixture-annotated",
      analyzerVersion: "fixture-v1",
      sentenceHash,
      sourceText,
      tokens: tokensFromSpecs(sourceText, [
        ["You", "you", "pronoun", ["PRON", "pronoun"]],
        ["might", "might", "modal", ["AUX", "modal"]],
        ["not", "not", "particle", ["PART", "particle"]],
        ["need", "need", "verb", ["VERB", "verb"]],
        ["to", "to", "particle", ["PART", "particle"]],
        ["write", "write", "verb", ["VERB", "verb"]],
        ["specs", "spec", "noun", ["NOUN", "noun"]],
        [".", ".", "other", ["PUNCT", "other"]],
        ["This", "this", "pronoun", ["PRON", "pronoun"]],
        ["creates", "create", "verb", ["VERB", "verb"]],
        ["zero", "zero", "number", ["NUM", "number"]],
        ["friction", "friction", "noun", ["NOUN", "noun"]],
        [".", ".", "other", ["PUNCT", "other"]],
        ["ACIDs", "acids", "noun", ["PROPN", "noun"]],
        ["rely", "rely", "verb", ["VERB", "verb"]],
        ["on", "on", "preposition", ["ADP", "preposition"]],
        ["stable", "stable", "adjective", ["ADJ", "adjective"]],
        ["numbering", "numbering", "noun", ["NOUN", "noun"]],
        [".", ".", "other", ["PUNCT", "other"]],
        ["The", "the", "determiner", ["DET", "determiner"]],
        ["boundary", "boundary", "noun", ["NOUN", "noun"]],
        ["is", "be", "auxiliary", ["AUX", "auxiliary"]],
        ["up", "up", "preposition", ["ADP", "preposition"]],
        ["to", "to", "preposition", ["ADP", "preposition"]],
        ["you", "you", "pronoun", ["PRON", "pronoun"]],
        [".", ".", "other", ["PUNCT", "other"]]
      ]),
      chunks: [
        {
          text: "stable numbering",
          normalized: "stable numbering",
          type: "noun-phrase",
          tokenStart: 16,
          tokenEnd: 18,
          confidence: 0.86
        }
      ],
      grammarFeatures: []
    }));
    const service = new SentenceAnalysisService({
      analyzer,
      cache: new InMemorySentenceAnalysisCache(),
      loadRenderUnits: () =>
        Promise.resolve(createRenderUnits([
          wordEntry("lexeme-need", "need", "necesidad", "noun"),
          wordEntry("lexeme-this", "this", "este", "adjective"),
          wordEntry("lexeme-zero", "zero", "cero", "noun"),
          wordEntry("lexeme-on", "on", "encima", "adverb"),
          wordEntry("lexeme-up", "up", "arriba", "adverb"),
          wordEntry("lexeme-stable", "stable", "estable", "adjective")
        ])),
      loadVocab: () => Promise.resolve(new Map())
    });

    const [analysis] = await service.analyzeCandidates([{ sentenceHash, sourceText }]);
    const decisions = new Map(
      analysis?.entry.contextualWordCandidates.map(
        (candidate) => [candidate.candidateLemma, candidate.decision] as const
      )
    );

    expect(decisions.get("need")).toBe("skip");
    expect(decisions.get("this")).toBe("skip");
    expect(decisions.get("zero")).toBe("skip");
    expect(decisions.get("on")).toBe("skip");
    expect(decisions.get("up")).toBe("skip");
    expect(decisions.get("stable")).toBe("inject");
  });

  it("produces phrase matches, grammar features, and suitability output", async () => {
    const sourceText = "The captain of the football team has been patient.";
    const sentenceHash = hashSentence(sourceText);
    const analyzer = createAnalyzer("fixture-v1", () =>
      createAnalyzerOutput(sourceText, sentenceHash)
    );
    const learningItems = {
      upsertGrammarFeatureItems: vi.fn(async () => [])
    };
    const service = new SentenceAnalysisService({
      analyzer,
      cache: new InMemorySentenceAnalysisCache(),
      learningItems,
      loadRenderUnits: () => Promise.resolve(createRenderUnits()),
      loadVocab: () =>
        Promise.resolve(
          new Map([
            ["lexeme-captain", createVocabEntry("lexeme-captain", "known")],
            ["lexeme-team", createVocabEntry("lexeme-team", "learning")]
          ])
        )
    });

    const [analysis] = await service.analyzeCandidates([{ sentenceHash, sourceText }]);

    expect(analysis?.entry.phraseMatches.length).toBeGreaterThan(0);
    expect(analysis?.entry.grammarFeatures[0]?.featureKey).toBe("aspect:have-been");
    expect(analysis?.entry.difficultyBand).toMatch(/core|stretch|defer/);
    expect(analysis?.suitabilitySignals.chunkUsefulness).toBeGreaterThan(0);
    expect(analysis?.entry.vocabStats?.totalWordCount).toBeGreaterThan(0);
    expect(learningItems.upsertGrammarFeatureItems).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          featureKey: "aspect:have-been"
        })
      ],
      expect.any(String)
    );
  });

  it("detects in order to as purpose grammar", async () => {
    const sourceText = "The team met early in order to learn the process.";
    const sentenceHash = hashSentence(sourceText);
    const analyzer = await createWinkNlpSentenceAnalyzer();
    const output = await analyzer.analyze(sourceText, sentenceHash);

    expect(output.grammarFeatures).toContainEqual(
      expect.objectContaining({
        featureKey: "infinitive:purpose",
        label: "Purpose with in order to",
        sourceText: "in order to learn",
        normalizedSourceText: "in order to learn",
        evidence: expect.arrayContaining(["in-order-to-before-verb"])
      })
    );
    expect(
      resolveSentenceGrammarCards({
        sentenceHash,
        features: output.grammarFeatures,
        profile: { activeGrammarBandId: "level-3c" }
      })
    ).toContainEqual(
      expect.objectContaining({
        conceptId: "gr-304-purpose-in-order-to",
        featureKey: "infinitive:purpose",
        curriculumStatus: "focus"
      })
    );
  });

  it("uses the active pair fixed phrase lexicon and curated phrase targets", async () => {
    const sourceText = "We are at home near the quiet city center.";
    const sentenceHash = hashSentence(sourceText);
    const analyzer = createAnalyzer("fixture-v1", () => ({
      analyzerId: "fixture-annotated",
      analyzerVersion: "fixture-v1",
      sentenceHash,
      sourceText,
      tokens: tokensFromSpecs(sourceText, [
        ["We", "we", "pronoun", ["PRON", "pronoun"]],
        ["are", "be", "verb", ["VERB", "verb"]],
        ["at", "at", "preposition", ["ADP", "preposition"]],
        ["home", "home", "noun", ["NOUN", "noun"]],
        ["near", "near", "preposition", ["ADP", "preposition"]],
        ["the", "the", "determiner", ["DET", "determiner"]],
        ["quiet", "quiet", "adjective", ["ADJ", "adjective"]],
        ["city", "city", "noun", ["NOUN", "noun"]],
        ["center", "center", "noun", ["NOUN", "noun"]],
        [".", ".", "other", ["PUNCT", "other"]]
      ]),
      chunks: [
        {
          text: "the quiet city center",
          normalized: "the quiet city center",
          type: "noun-phrase",
          tokenStart: 5,
          tokenEnd: 9,
          confidence: 0.9
        }
      ],
      grammarFeatures: []
    }));
    const pairDefinition: LanguagePairDefinition = {
      id: "en-fr",
      sourceLanguage: "en",
      targetLanguage: "fr",
      displayNames: {
        sourceLanguage: "English",
        targetLanguage: "French"
      },
      curriculum: {
        config: {
          ...DEFAULT_CURRICULUM_CONFIG,
          targetLanguage: "fr"
        },
        content: []
      },
      fixedPhraseLexicon: []
    };
    const phraseTargets: CuratedPhraseTargetEntry[] = [
      {
        sourceText: "the quiet city center",
        targetText: "le centre-ville calme",
        sourceKind: "chunk",
        category: "noun-chunk",
        confidence: 0.92,
        normalizedSourceText: "the quiet city center",
        normalizedTargetText: "le centre ville calme"
      }
    ];
    const service = new SentenceAnalysisService({
      analyzer,
      cache: new InMemorySentenceAnalysisCache(),
      languagePair: "en-fr",
      languagePairDefinitions: new Map([["en-fr", pairDefinition]]),
      phraseTargetsByLanguagePair: new Map([["en-fr", phraseTargets]]),
      loadRenderUnits: () => Promise.resolve([]),
      loadVocab: () => Promise.resolve(new Map())
    });

    const [analysis] = await service.analyzeCandidates([{ sentenceHash, sourceText }]);
    const phraseMatches = analysis?.entry.phraseMatches ?? [];

    expect(phraseMatches.some((match) => match.sourceText === "at home")).toBe(false);
    expect(phraseMatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceText: "the quiet city center",
          targetText: "le centre-ville calme",
          normalizedTargetText: "le centre ville calme"
        })
      ])
    );
  });

  it("uses the duration sense for bare time render units", async () => {
    const sourceText =
      "The time you must contribute depends on the specific benefit.";
    const sentenceHash = hashSentence(sourceText);
    const analyzer = createAnalyzer("fixture-v1", () => ({
      analyzerId: "fixture-annotated",
      analyzerVersion: "fixture-v1",
      sentenceHash,
      sourceText,
      tokens: tokensFromSpecs(sourceText, [
        ["The", "the", "determiner", ["DET", "determiner"]],
        ["time", "time", "noun", ["NOUN", "noun"]],
        ["you", "you", "pronoun", ["PRON", "pronoun"]],
        ["must", "must", "modal", ["AUX", "modal"]],
        ["contribute", "contribute", "verb", ["VERB", "verb"]],
        ["depends", "depend", "verb", ["VERB", "verb"]],
        ["on", "on", "preposition", ["ADP", "preposition"]],
        ["the", "the", "determiner", ["DET", "determiner"]],
        ["specific", "specific", "adjective", ["ADJ", "adjective"]],
        ["benefit", "benefit", "noun", ["NOUN", "noun"]],
        [".", ".", "other", ["PUNCT", "other"]]
      ]),
      chunks: [
        {
          text: "The time",
          normalized: "the time",
          type: "noun-phrase",
          tokenStart: 0,
          tokenEnd: 2,
          confidence: 0.86
        },
        {
          text: "the specific benefit",
          normalized: "the specific benefit",
          type: "noun-phrase",
          tokenStart: 7,
          tokenEnd: 10,
          confidence: 0.88
        }
      ],
      grammarFeatures: []
    }));
    const renderUnits = parseRenderUnitAsset(renderUnitAsset)?.entries ?? [];
    const service = new SentenceAnalysisService({
      analyzer,
      cache: new InMemorySentenceAnalysisCache(),
      loadRenderUnits: () => Promise.resolve(renderUnits),
      loadVocab: () => Promise.resolve(new Map())
    });

    const [analysis] = await service.analyzeCandidates([{ sentenceHash, sourceText }]);
    const timeCandidate = analysis?.entry.contextualWordCandidates.find(
      (candidate) => candidate.normalizedText === "time"
    );

    expect(timeCandidate).toMatchObject({
      renderUnitId: "ru:time-tiempo:noun:exact",
      lexemeId: "lx:time-tiempo:noun",
      targetText: "tiempo",
      decision: "inject"
    });
  });

  it("uses vez for occurrence-oriented time phrases", async () => {
    const sourceText = "This is my first time here.";
    const sentenceHash = hashSentence(sourceText);
    const analyzer = createAnalyzer("fixture-v1", () => ({
      analyzerId: "fixture-annotated",
      analyzerVersion: "fixture-v1",
      sentenceHash,
      sourceText,
      tokens: tokensFromSpecs(sourceText, [
        ["This", "this", "pronoun", ["PRON", "pronoun"]],
        ["is", "be", "auxiliary", ["AUX", "auxiliary"]],
        ["my", "my", "determiner", ["DET", "determiner"]],
        ["first", "first", "adjective", ["ADJ", "adjective"]],
        ["time", "time", "noun", ["NOUN", "noun"]],
        ["here", "here", "adverb", ["ADV", "adverb"]],
        [".", ".", "other", ["PUNCT", "other"]]
      ]),
      chunks: [
        {
          text: "my first time",
          normalized: "my first time",
          type: "noun-phrase",
          tokenStart: 2,
          tokenEnd: 5,
          confidence: 0.9
        }
      ],
      grammarFeatures: []
    }));
    const renderUnits = parseRenderUnitAsset(renderUnitAsset)?.entries ?? [];
    const phraseRegistry = new InMemoryPhraseRegistry();
    const service = new SentenceAnalysisService({
      analyzer,
      cache: new InMemorySentenceAnalysisCache(),
      phraseRegistry,
      loadRenderUnits: () => Promise.resolve(renderUnits),
      loadVocab: () => Promise.resolve(new Map())
    });

    const [analysis] = await service.analyzeCandidates([{ sentenceHash, sourceText }]);
    const firstTime = analysis?.entry.phraseMatches.find(
      (match) => match.renderUnitId === "ru:first-time:fixed-phrase"
    );

    expect(firstTime).toMatchObject({
      phraseId: "ru:first-time:fixed-phrase",
      sourceText: "first time",
      targetText: "primera vez",
      normalizedTargetText: "primera vez",
      renderPolicy: "inline"
    });
    await expect(phraseRegistry.get("ru:first-time:fixed-phrase")).resolves.toMatchObject({
      canonicalTargetText: "primera vez",
      normalizedTargetText: "primera vez"
    });
  });

  it("resolves approved render-unit fixed phrase targets before registry persistence", async () => {
    const sourceText = "We take care of the old city.";
    const sentenceHash = hashSentence(sourceText);
    const analyzer = createAnalyzer("fixture-v1", () =>
      createFixedPhraseAnalyzerOutput(sourceText, sentenceHash)
    );
    const renderUnits: RenderUnitEntry[] = [
      {
        renderUnitId: "ru:test-take-care-of",
        lexemeIds: [],
        kind: "fixed-phrase",
        renderPolicy: "inline",
        sourceText: "take care of",
        normalizedSourceText: "take care of",
        targetText: "cuidar de",
        normalizedTargetText: "cuidar de",
        sourcePattern: {
          matchMode: "exact",
          tokens: [{ normal: "take" }, { normal: "care" }, { normal: "of" }]
        },
        replacement: {
          startToken: 0,
          endToken: 3,
          targetText: "cuidar de"
        },
        minBand: "level-1a",
        confidence: 0.98,
        provenance: { source: "manual" }
      }
    ];
    const phraseRegistry = new InMemoryPhraseRegistry();
    const service = new SentenceAnalysisService({
      analyzer,
      cache: new InMemorySentenceAnalysisCache(),
      phraseRegistry,
      loadRenderUnits: () => Promise.resolve(renderUnits),
      loadVocab: () => Promise.resolve(new Map())
    });

    const [analysis] = await service.analyzeCandidates([{ sentenceHash, sourceText }]);
    const fixedPhrase = analysis?.entry.phraseMatches.find(
      (match) => match.sourceKind === "fixed-phrase"
    );

    expect(fixedPhrase).toMatchObject({
      sourceText: "take care of",
      phraseId: "ru:test-take-care-of",
      renderUnitId: "ru:test-take-care-of",
      targetText: "cuidar de",
      normalizedTargetText: "cuidar de"
    });
    await expect(phraseRegistry.get(fixedPhrase?.phraseId ?? "")).resolves.toMatchObject({
      canonicalTargetText: "cuidar de",
      normalizedTargetText: "cuidar de"
    });
  });

  it("preserves shared fixed-phrase targets before registry persistence", async () => {
    const sourceText = "We stay at home today.";
    const sentenceHash = hashSentence(sourceText);
    const analyzer = createAnalyzer("fixture-v1", () => ({
      analyzerId: "fixture-annotated",
      analyzerVersion: "fixture-v1",
      sentenceHash,
      sourceText,
      tokens: tokensFromSpecs(sourceText, [
        ["We", "we", "pronoun", ["PRON", "pronoun"]],
        ["stay", "stay", "verb", ["VERB", "verb"]],
        ["at", "at", "preposition", ["ADP", "preposition"]],
        ["home", "home", "noun", ["NOUN", "noun"]],
        ["today", "today", "adverb", ["ADV", "adverb"]],
        [".", ".", "other", ["PUNCT", "other"]]
      ]),
      chunks: [],
      grammarFeatures: []
    }));
    const phraseRegistry = new InMemoryPhraseRegistry();
    const service = new SentenceAnalysisService({
      analyzer,
      cache: new InMemorySentenceAnalysisCache(),
      phraseRegistry,
      loadRenderUnits: () => Promise.resolve([]),
      loadVocab: () => Promise.resolve(new Map())
    });

    const [analysis] = await service.analyzeCandidates([{ sentenceHash, sourceText }]);
    const fixedPhrase = analysis?.entry.phraseMatches.find(
      (match) => match.normalizedSourceText === "at home"
    );

    expect(fixedPhrase).toMatchObject({
      sourceKind: "fixed-phrase",
      category: "function-phrase",
      targetText: "en casa",
      normalizedTargetText: "en casa",
      phraseId: "phrase:fixed-phrase:at-home:en-casa"
    });
    await expect(phraseRegistry.get(fixedPhrase?.phraseId ?? "")).resolves.toMatchObject({
      canonicalTargetText: "en casa",
      normalizedTargetText: "en casa"
    });
  });

  it("lets approved custom render units own fixed phrase identity over legacy detections", async () => {
    const sourceText = "By the way, we read today.";
    const sentenceHash = hashSentence(sourceText);
    const analyzer = createAnalyzer("fixture-v1", () => ({
      analyzerId: "fixture-annotated",
      analyzerVersion: "fixture-v1",
      sentenceHash,
      sourceText,
      tokens: tokensFromSpecs(sourceText, [
        ["By", "by", "preposition", ["ADP", "preposition"]],
        ["the", "the", "determiner", ["DET", "determiner"]],
        ["way", "way", "noun", ["NOUN", "noun"]],
        [",", ",", "other", ["PUNCT", "other"]],
        ["we", "we", "pronoun", ["PRON", "pronoun"]],
        ["read", "read", "verb", ["VERB", "verb"]],
        ["today", "today", "adverb", ["ADV", "adverb"]],
        [".", ".", "other", ["PUNCT", "other"]]
      ]),
      chunks: [],
      grammarFeatures: []
    }));
    const renderUnits: RenderUnitEntry[] = [
      {
        renderUnitId: "ru:test-by-the-way",
        lexemeIds: [],
        kind: "fixed-phrase",
        renderPolicy: "phrase-only",
        sourceText: "by the way",
        normalizedSourceText: "by the way",
        targetText: "por cierto",
        normalizedTargetText: "por cierto",
        sourcePattern: {
          matchMode: "exact",
          tokens: [{ normal: "by" }, { normal: "the" }, { normal: "way" }]
        },
        replacement: {
          startToken: 0,
          endToken: 3,
          targetText: "por cierto"
        },
        minBand: "level-1a",
        confidence: 0.99,
        provenance: { source: "manual" }
      }
    ];
    const service = new SentenceAnalysisService({
      analyzer,
      cache: new InMemorySentenceAnalysisCache(),
      loadRenderUnits: () => Promise.resolve(renderUnits),
      loadVocab: () => Promise.resolve(new Map())
    });

    const [analysis] = await service.analyzeCandidates([{ sentenceHash, sourceText }]);
    const phraseMatches = analysis?.entry.phraseMatches.filter(
      (match) => match.normalizedSourceText === "by the way"
    );

    expect(phraseMatches).toHaveLength(1);
    expect(phraseMatches?.[0]).toMatchObject({
      phraseId: "ru:test-by-the-way",
      renderUnitId: "ru:test-by-the-way",
      renderUnitMinBand: "level-1a",
      renderPolicy: "phrase-only",
      targetText: "por cierto",
      ruleId: "render-unit:ru:test-by-the-way"
    });
  });

  it("emits sentence-help-only render units as non-rendering analyzer signals", async () => {
    const sourceText = "You might not need to write specs.";
    const sentenceHash = hashSentence(sourceText);
    const analyzer = createAnalyzer("fixture-v1", () => ({
      analyzerId: "fixture-annotated",
      analyzerVersion: "fixture-v1",
      sentenceHash,
      sourceText,
      tokens: tokensFromSpecs(sourceText, [
        ["You", "you", "pronoun", ["PRON", "pronoun"]],
        ["might", "might", "modal", ["AUX", "modal"]],
        ["not", "not", "particle", ["PART", "particle"]],
        ["need", "need", "verb", ["VERB", "verb"]],
        ["to", "to", "particle", ["PART", "particle"]],
        ["write", "write", "verb", ["VERB", "verb"]],
        ["specs", "spec", "noun", ["NOUN", "noun"]],
        [".", ".", "other", ["PUNCT", "other"]]
      ]),
      chunks: [],
      grammarFeatures: []
    }));
    const renderUnits: RenderUnitEntry[] = [
      {
        renderUnitId: "ru:test-need-help-only",
        lexemeIds: ["lx:need:verb"],
        kind: "sentence-help-only",
        renderPolicy: "sentence-help-only",
        sourceText: "need",
        normalizedSourceText: "need",
        sourcePattern: {
          matchMode: "analyzer-pattern",
          tokens: [
            {
              lemma: "need",
              pos: "verb",
              role: "verb",
              features: { negated: true }
            }
          ]
        },
        minBand: "level-1a",
        confidence: 0.99,
        provenance: { source: "manual" }
      }
    ];
    const service = new SentenceAnalysisService({
      analyzer,
      cache: new InMemorySentenceAnalysisCache(),
      loadRenderUnits: () => Promise.resolve(renderUnits),
      loadVocab: () => Promise.resolve(new Map())
    });

    const [analysis] = await service.analyzeCandidates([{ sentenceHash, sourceText }]);
    const helpOnlyMatch = analysis?.entry.phraseMatches.find(
      (match) => match.renderUnitId === "ru:test-need-help-only"
    );

    expect(helpOnlyMatch).toMatchObject({
      sourceText: "need",
      targetText: undefined,
      normalizedTargetText: undefined,
      renderPolicy: "sentence-help-only",
      sourceKind: "pattern-match",
      category: "grammar-carrier"
    });
    expect(analysis?.suitabilitySignals.chunkUsefulness).toBeGreaterThan(0);
  });

  it("does not emit renderable matches for unsafe bare conjugated grammar frames", async () => {
    const sourceText = "She is going to write. They used to trade.";
    const sentenceHash = hashSentence(sourceText);
    const analyzer = createAnalyzer("fixture-v1", () =>
      createAuxiliaryFrameAnalyzerOutput(sourceText, sentenceHash)
    );
    const renderUnits = parseRenderUnitAsset(renderUnitAsset)?.entries ?? [];
    const service = new SentenceAnalysisService({
      analyzer,
      cache: new InMemorySentenceAnalysisCache(),
      loadRenderUnits: () => Promise.resolve(renderUnits),
      loadVocab: () => Promise.resolve(new Map())
    });

    const [analysis] = await service.analyzeCandidates([{ sentenceHash, sourceText }]);
    const unsafeRenderableFrames = analysis?.entry.phraseMatches.filter(
      (match) =>
        ["ru:going-to:grammar-phrase", "ru:used-to:grammar-phrase"].includes(
          match.renderUnitId ?? ""
        ) &&
        (match.renderPolicy === "inline" || match.renderPolicy === "phrase-only")
    );

    expect(unsafeRenderableFrames).toEqual([]);
  });

  it("invalidates cached analysis when render-unit pattern or replacement details change", async () => {
    const sourceText = "I need help today.";
    const sentenceHash = hashSentence(sourceText);
    const analyze = vi.fn((sentence: string, suppliedHash?: string) =>
      createNeedHelpAnalyzerOutput(sentence, suppliedHash ?? hashSentence(sentence))
    );
    const analyzer = createAnalyzer("fixture-v1", analyze);
    const cache = new InMemorySentenceAnalysisCache();
    let renderUnits = [
      createNeedHelpRenderUnit({
        replacementEndToken: 2,
        verbFeatures: undefined
      })
    ];
    const service = new SentenceAnalysisService({
      analyzer,
      cache,
      loadRenderUnits: () => Promise.resolve(renderUnits),
      loadVocab: () => Promise.resolve(new Map())
    });

    const [first] = await service.analyzeCandidates([{ sentenceHash, sourceText }]);
    renderUnits = [
      createNeedHelpRenderUnit({
        replacementEndToken: 1,
        verbFeatures: { negated: false }
      })
    ];
    const [second] = await service.analyzeCandidates([{ sentenceHash, sourceText }]);

    expect(first?.entry.phraseMatches[0]).toMatchObject({
      renderUnitId: "ru:test-need-help",
      sourceText: "need help"
    });
    expect(second?.cacheHit).toBe(false);
    expect(analyze).toHaveBeenCalledTimes(2);
    expect(second?.entry.phraseMatches[0]).toMatchObject({
      renderUnitId: "ru:test-need-help",
      sourceText: "need"
    });
  });

  it("matches a lexically pinned object role when wink tags the object as a verb", async () => {
    const sourceText = "I need help today.";
    const sentenceHash = hashSentence(sourceText);
    const analyzer = createAnalyzer("fixture-v1", (sentence: string, suppliedHash?: string) =>
      createNeedHelpAnalyzerOutput(sentence, suppliedHash ?? hashSentence(sentence), "verb")
    );
    const service = new SentenceAnalysisService({
      analyzer,
      cache: new InMemorySentenceAnalysisCache(),
      loadRenderUnits: () =>
        Promise.resolve([
          createNeedHelpRenderUnit({
            replacementEndToken: 2,
            verbFeatures: { negated: false },
            objectPos: "verb"
          })
        ]),
      loadVocab: () => Promise.resolve(new Map())
    });

    const [analysis] = await service.analyzeCandidates([{ sentenceHash, sourceText }]);

    expect(analysis?.entry.phraseMatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          renderUnitId: "ru:test-need-help",
          sourceText: "need help",
          targetText: "necesito ayuda"
        })
      ])
    );
  });

  it("resolves runtime phrase targets from exact multiword render units", async () => {
    const sourceText = "The old city center walls hold quiet memory.";
    const sentenceHash = hashSentence(sourceText);
    const analyzer = createAnalyzer("fixture-v1", () =>
      createResolvableChunkAnalyzerOutput(sourceText, sentenceHash)
    );
    const phraseRegistry = new InMemoryPhraseRegistry();
    const service = new SentenceAnalysisService({
      analyzer,
      cache: new InMemorySentenceAnalysisCache(),
      phraseRegistry,
      loadRenderUnits: () =>
        Promise.resolve(createRenderUnits([
          ...createWordInventory(),
          wordEntry(
            "phrase-old-city-center-walls",
            "old city center walls",
            "murallas del centro antiguo",
            "noun"
          )
        ])),
      loadVocab: () => Promise.resolve(new Map())
    });

    const [analysis] = await service.analyzeCandidates([{ sentenceHash, sourceText }]);
    const chunkPhrase = analysis?.entry.phraseMatches.find(
      (match) => match.sourceText === "old city center walls"
    );

    expect(chunkPhrase).toMatchObject({
      sourceKind: "chunk",
      category: "noun-chunk",
      targetText: "murallas del centro antiguo",
      normalizedTargetText: "murallas del centro antiguo",
      phraseId: "ru:phrase-old-city-center-walls"
    });
    await expect(phraseRegistry.get(chunkPhrase?.phraseId ?? "")).resolves.toMatchObject({
      canonicalTargetText: "murallas del centro antiguo",
      normalizedTargetText: "murallas del centro antiguo"
    });
  });

  it("resolves runtime phrase targets from the curated phrase target asset", async () => {
    const sourceText = "The public health care system needs support.";
    const sentenceHash = hashSentence(sourceText);
    const analyzer = createAnalyzer("fixture-v1", () =>
      createCuratedPhraseTargetAnalyzerOutput(sourceText, sentenceHash)
    );
    const phraseRegistry = new InMemoryPhraseRegistry();
    const service = new SentenceAnalysisService({
      analyzer,
      cache: new InMemorySentenceAnalysisCache(),
      phraseRegistry,
      loadRenderUnits: () => Promise.resolve(createRenderUnits()),
      loadVocab: () => Promise.resolve(new Map())
    });

    const [analysis] = await service.analyzeCandidates([{ sentenceHash, sourceText }]);
    const chunkPhrase = analysis?.entry.phraseMatches.find(
      (match) => match.sourceText === "public health care system"
    );

    expect(chunkPhrase).toMatchObject({
      sourceKind: "chunk",
      category: "noun-chunk",
      targetText: "sistema público de salud",
      normalizedTargetText: "sistema publico de salud",
      phraseId:
        "phrase:chunk:public-health-care-system:sistema-publico-de-salud"
    });
    await expect(phraseRegistry.get(chunkPhrase?.phraseId ?? "")).resolves.toMatchObject({
      canonicalTargetText: "sistema público de salud",
      normalizedTargetText: "sistema publico de salud"
    });
  });

  it("resolves runtime phrase targets from the imported phrase target asset", async () => {
    const sourceText = "The public transport system plan needs support.";
    const sentenceHash = hashSentence(sourceText);
    const analyzer = createAnalyzer("fixture-v1", () =>
      createPublicTransportPhraseTargetAnalyzerOutput(sourceText, sentenceHash)
    );
    const phraseRegistry = new InMemoryPhraseRegistry();
    const service = new SentenceAnalysisService({
      analyzer,
      cache: new InMemorySentenceAnalysisCache(),
      phraseRegistry,
      loadRenderUnits: () => Promise.resolve(createRenderUnits()),
      loadVocab: () => Promise.resolve(new Map())
    });

    const [analysis] = await service.analyzeCandidates([{ sentenceHash, sourceText }]);
    const chunkPhrase = analysis?.entry.phraseMatches.find(
      (match) => match.sourceText === "public transport system plan"
    );

    expect(chunkPhrase).toMatchObject({
      sourceKind: "chunk",
      category: "noun-chunk",
      targetText: "plan del sistema de transporte público",
      normalizedTargetText: "plan del sistema de transporte publico",
      phraseId:
        "phrase:chunk:public-transport-system-plan:plan-del-sistema-de-transporte-publico"
    });
  });

  it("resolves newly expanded curated phrase target asset entries", async () => {
    const sourceText = "The renewable energy project plan needs support.";
    const sentenceHash = hashSentence(sourceText);
    const analyzer = createAnalyzer("fixture-v1", () =>
      createRenewableEnergyPhraseTargetAnalyzerOutput(sourceText, sentenceHash)
    );
    const phraseRegistry = new InMemoryPhraseRegistry();
    const service = new SentenceAnalysisService({
      analyzer,
      cache: new InMemorySentenceAnalysisCache(),
      phraseRegistry,
      loadRenderUnits: () => Promise.resolve(createRenderUnits()),
      loadVocab: () => Promise.resolve(new Map())
    });

    const [analysis] = await service.analyzeCandidates([{ sentenceHash, sourceText }]);
    const chunkPhrase = analysis?.entry.phraseMatches.find(
      (match) => match.sourceText === "renewable energy project plan"
    );

    expect(chunkPhrase).toMatchObject({
      sourceKind: "chunk",
      category: "noun-chunk",
      targetText: "plan de proyecto de energía renovable",
      normalizedTargetText: "plan de proyecto de energia renovable",
      phraseId:
        "phrase:chunk:renewable-energy-project-plan:plan-de-proyecto-de-energia-renovable"
    });
  });

  it("resolves release-batch curated phrase target asset entries", async () => {
    const sourceText = "The school board meeting schedule needs support.";
    const sentenceHash = hashSentence(sourceText);
    const analyzer = createAnalyzer("fixture-v1", () =>
      createSchoolBoardPhraseTargetAnalyzerOutput(sourceText, sentenceHash)
    );
    const phraseRegistry = new InMemoryPhraseRegistry();
    const service = new SentenceAnalysisService({
      analyzer,
      cache: new InMemorySentenceAnalysisCache(),
      phraseRegistry,
      loadRenderUnits: () => Promise.resolve(createRenderUnits()),
      loadVocab: () => Promise.resolve(new Map())
    });

    const [analysis] = await service.analyzeCandidates([{ sentenceHash, sourceText }]);
    const chunkPhrase = analysis?.entry.phraseMatches.find(
      (match) => match.sourceText === "school board meeting schedule"
    );

    expect(chunkPhrase).toMatchObject({
      sourceKind: "chunk",
      category: "noun-chunk",
      targetText: "calendario de reuniones de la junta escolar",
      normalizedTargetText: "calendario de reuniones de la junta escolar",
      phraseId:
        "phrase:chunk:school-board-meeting-schedule:calendario-de-reuniones-de-la-junta-escolar"
    });
    await expect(phraseRegistry.get(chunkPhrase?.phraseId ?? "")).resolves.toMatchObject({
      canonicalTargetText: "calendario de reuniones de la junta escolar",
      normalizedTargetText: "calendario de reuniones de la junta escolar"
    });
  });

  it("keeps unresolved runtime phrases targetless for inline suppression", async () => {
    const sourceText = "The local garden gate design needs paint.";
    const sentenceHash = hashSentence(sourceText);
    const analyzer = createAnalyzer("fixture-v1", () =>
      createUnresolvedChunkAnalyzerOutput(sourceText, sentenceHash)
    );
    const phraseRegistry = new InMemoryPhraseRegistry();
    const service = new SentenceAnalysisService({
      analyzer,
      cache: new InMemorySentenceAnalysisCache(),
      phraseRegistry,
      loadRenderUnits: () => Promise.resolve(createRenderUnits()),
      loadVocab: () => Promise.resolve(new Map())
    });

    const [analysis] = await service.analyzeCandidates([{ sentenceHash, sourceText }]);
    const chunkPhrase = analysis?.entry.phraseMatches.find(
      (match) => match.sourceText === "local garden gate design"
    );

    expect(chunkPhrase).toMatchObject({
      sourceKind: "chunk",
      category: "noun-chunk",
      targetText: undefined,
      normalizedTargetText: undefined,
      phraseId: "phrase:chunk:local-garden-gate-design:empty"
    });
    await expect(phraseRegistry.get(chunkPhrase?.phraseId ?? "")).resolves.toMatchObject({
      canonicalTargetText: "",
      normalizedTargetText: ""
    });
  });

  it("merges repeated phrase sightings into durable registry identities", async () => {
    const sourceText = "The captain of the football team has been patient.";
    const sentenceHash = hashSentence(sourceText);
    const analyzer = createAnalyzer("fixture-v1", () =>
      createAnalyzerOutput(sourceText, sentenceHash)
    );
    const phraseRegistry = new InMemoryPhraseRegistry();
    const service = new SentenceAnalysisService({
      analyzer,
      cache: new InMemorySentenceAnalysisCache(),
      phraseRegistry,
      loadRenderUnits: () => Promise.resolve(createRenderUnits()),
      loadVocab: () => Promise.resolve(new Map())
    });

    const first = await service.analyzeCandidates([{ sentenceHash, sourceText }]);
    const second = await service.analyzeCandidates([{ sentenceHash, sourceText }]);
    const phraseId = first[0]?.entry.phraseMatches[0]?.phraseId;

    expect(second[0]?.cacheHit).toBe(true);
    expect(phraseId).toMatch(/^phrase:/);
    expect(phraseId).not.toContain(sentenceHash);
    expect(await phraseRegistry.get(phraseId ?? "")).toMatchObject({
      phraseId,
      exposureCount: 2
    });
  });
});

class InMemorySentenceAnalysisCache implements SentenceAnalysisCacheRepository {
  private readonly entries = new Map<string, SentenceAnalysisEntry>();

  async get(
    sentenceHash: string,
    analyzerVersion: string
  ): Promise<SentenceAnalysisEntry | null> {
    return this.entries.get(cacheKey(sentenceHash, analyzerVersion)) ?? null;
  }

  async getMany(
    sentenceHashes: readonly string[],
    analyzerVersion: string
  ): Promise<SentenceAnalysisEntry[]> {
    return sentenceHashes.flatMap((sentenceHash) => {
      const entry = this.entries.get(cacheKey(sentenceHash, analyzerVersion));
      return entry ? [entry] : [];
    });
  }

  async put(entry: SentenceAnalysisEntry): Promise<void> {
    this.entries.set(cacheKey(entry.sentenceHash, entry.analyzerVersion), entry);
  }

  async putMany(entries: readonly SentenceAnalysisEntry[]): Promise<void> {
    for (const entry of entries) {
      await this.put(entry);
    }
  }

  async clear(): Promise<void> {
    this.entries.clear();
  }
}

class InMemoryPhraseRegistry implements PhraseRegistryRepository {
  private readonly entries = new Map<string, PhraseRegistryEntry>();

  async get(phraseId: string): Promise<PhraseRegistryEntry | null> {
    return this.entries.get(phraseId) ?? null;
  }

  async upsertOccurrences(
    occurrences: readonly PhraseOccurrence[],
    now: string
  ): Promise<PhraseRegistryEntry[]> {
    return occurrences.map((occurrence) => {
      const entry = mergePhraseOccurrence(
        this.entries.get(occurrence.phraseId),
        occurrence,
        now
      );
      this.entries.set(entry.phraseId, entry);
      return entry;
    });
  }
}

function createAnalyzer(
  analyzerVersion: string,
  analyze: SentenceAnalyzer["analyze"]
): SentenceAnalyzer {
  return {
    analyzerId: "fixture-annotated",
    analyzerVersion,
    analyze
  };
}

function createAnalyzerOutput(
  sourceText: string,
  sentenceHash: string
): AnalyzerOutput {
  return {
    analyzerId: "fixture-annotated",
    analyzerVersion: "fixture-v1",
    sentenceHash,
    sourceText,
    tokens: [
      token("The", "the", "determiner", 0, 3, ["DT", "determiner"]),
      token("captain", "captain", "noun", 4, 11, ["NN", "noun"]),
      token("of", "of", "preposition", 12, 14, ["IN", "preposition"]),
      token("the", "the", "determiner", 15, 18, ["DT", "determiner"]),
      token("football", "football", "noun", 19, 27, ["NN", "noun"]),
      token("team", "team", "noun", 28, 32, ["NN", "noun"]),
      token("has", "has", "verb", 33, 36, ["VBZ", "verb"]),
      token("been", "been", "verb", 37, 41, ["VBN", "verb"]),
      token("patient", "patient", "adjective", 42, 49, ["JJ", "adjective"])
    ],
    chunks: [
      {
        text: "The captain of the football team",
        normalized: "the captain of the football team",
        type: "noun-phrase",
        tokenStart: 0,
        tokenEnd: 6,
        confidence: 0.88
      }
    ],
    grammarFeatures: [
      {
        featureId: "grammar:aspect:have-been",
        featureKey: "aspect:have-been",
        label: "Have been",
        category: "tense-aspect",
        sourceText: "has been",
        normalizedSourceText: "has been",
        span: {
          startToken: 6,
          endToken: 8,
          startChar: 33,
          endChar: 41
        },
        evidence: ["fixture"],
        confidence: 0.86
      }
    ]
  };
}

function createFixedPhraseAnalyzerOutput(
  sourceText: string,
  sentenceHash: string
): AnalyzerOutput {
  return {
    analyzerId: "fixture-annotated",
    analyzerVersion: "fixture-v1",
    sentenceHash,
    sourceText,
    tokens: [
      token("We", "we", "pronoun", 0, 2, ["PRP", "pronoun"]),
      token("take", "take", "verb", 3, 7, ["VB", "verb"]),
      token("care", "care", "noun", 8, 12, ["NN", "noun"]),
      token("of", "of", "preposition", 13, 15, ["IN", "preposition"]),
      token("the", "the", "determiner", 16, 19, ["DT", "determiner"]),
      token("old", "old", "adjective", 20, 23, ["JJ", "adjective"]),
      token("city", "city", "noun", 24, 28, ["NN", "noun"])
    ],
    chunks: [],
    grammarFeatures: []
  };
}

function createAuxiliaryFrameAnalyzerOutput(
  sourceText: string,
  sentenceHash: string
): AnalyzerOutput {
  return {
    analyzerId: "fixture-annotated",
    analyzerVersion: "fixture-v1",
    sentenceHash,
    sourceText,
    tokens: tokensFromSpecs(sourceText, [
      ["She", "she", "pronoun", ["PRON", "pronoun"]],
      ["is", "be", "auxiliary", ["AUX", "auxiliary"]],
      ["going", "going", "verb", ["VERB", "verb"]],
      ["to", "to", "particle", ["PART", "particle"]],
      ["write", "write", "verb", ["VERB", "verb"]],
      [".", ".", "other", ["PUNCT", "other"]],
      ["They", "they", "pronoun", ["PRON", "pronoun"]],
      ["used", "used", "verb", ["VERB", "verb"]],
      ["to", "to", "particle", ["PART", "particle"]],
      ["trade", "trade", "verb", ["VERB", "verb"]],
      [".", ".", "other", ["PUNCT", "other"]]
    ]),
    chunks: [],
    grammarFeatures: []
  };
}

function createNeedHelpAnalyzerOutput(
  sourceText: string,
  sentenceHash: string,
  helpPos: "noun" | "verb" = "noun"
): AnalyzerOutput {
  return {
    analyzerId: "fixture-annotated",
    analyzerVersion: "fixture-v1",
    sentenceHash,
    sourceText,
    tokens: tokensFromSpecs(sourceText, [
      ["I", "i", "pronoun", ["PRON", "pronoun"]],
      ["need", "need", "verb", ["VERB", "verb"]],
      ["help", "help", helpPos, [helpPos === "verb" ? "VERB" : "NOUN", helpPos]],
      ["today", "today", "adverb", ["ADV", "adverb"]],
      [".", ".", "other", ["PUNCT", "other"]]
    ]),
    chunks: [],
    grammarFeatures: []
  };
}

function createNeedHelpRenderUnit(input: {
  replacementEndToken: number;
  verbFeatures:
    | RenderUnitEntry["sourcePattern"]["tokens"][number]["features"]
    | undefined;
  objectPos?: "noun" | "verb";
}): RenderUnitEntry {
  return {
    renderUnitId: "ru:test-need-help",
    lexemeIds: ["lx:need:verb", "lx:help:noun"],
    kind: "verb-object-phrase",
    renderPolicy: "phrase-only",
    sourceText: "need help",
    normalizedSourceText: "need help",
    targetText: "necesito ayuda",
    normalizedTargetText: "necesito ayuda",
    sourcePattern: {
      matchMode: "analyzer-pattern",
      tokens: [
        {
          normal: "need",
          lemma: "need",
          pos: "verb",
          role: "verb",
          ...(input.verbFeatures ? { features: input.verbFeatures } : {})
        },
        {
          normal: "help",
          lemma: "help",
          pos: input.objectPos ?? "noun",
          role: "object"
        }
      ]
    },
    replacement: {
      startToken: 0,
      endToken: input.replacementEndToken,
      targetText: "necesito ayuda"
    },
    minBand: "level-1b",
    frequencyRank: null,
    confidence: 0.91,
    provenance: {
      source: "manual"
    },
    sourceLanguage: "en",
    targetLanguage: "es"
  };
}

function createResolvableChunkAnalyzerOutput(
  sourceText: string,
  sentenceHash: string
): AnalyzerOutput {
  return {
    analyzerId: "fixture-annotated",
    analyzerVersion: "fixture-v1",
    sentenceHash,
    sourceText,
    tokens: [
      token("The", "the", "determiner", 0, 3, ["DT", "determiner"]),
      token("old", "old", "adjective", 4, 7, ["JJ", "adjective"]),
      token("city", "city", "noun", 8, 12, ["NN", "noun"]),
      token("center", "center", "noun", 13, 19, ["NN", "noun"]),
      token("walls", "walls", "noun", 20, 25, ["NNS", "noun"]),
      token("hold", "hold", "verb", 26, 30, ["VBP", "verb"]),
      token("quiet", "quiet", "adjective", 31, 36, ["JJ", "adjective"]),
      token("memory", "memory", "noun", 37, 43, ["NN", "noun"])
    ],
    chunks: [
      {
        text: "old city center walls",
        normalized: "old city center walls",
        type: "noun-phrase",
        tokenStart: 1,
        tokenEnd: 5,
        confidence: 0.9
      }
    ],
    grammarFeatures: []
  };
}

function createCuratedPhraseTargetAnalyzerOutput(
  sourceText: string,
  sentenceHash: string
): AnalyzerOutput {
  return {
    analyzerId: "fixture-annotated",
    analyzerVersion: "fixture-v1",
    sentenceHash,
    sourceText,
    tokens: [
      token("The", "the", "determiner", 0, 3, ["DT", "determiner"]),
      token("public", "public", "adjective", 4, 10, ["JJ", "adjective"]),
      token("health", "health", "noun", 11, 17, ["NN", "noun"]),
      token("care", "care", "noun", 18, 22, ["NN", "noun"]),
      token("system", "system", "noun", 23, 29, ["NN", "noun"]),
      token("needs", "needs", "verb", 30, 35, ["VBZ", "verb"]),
      token("support", "support", "noun", 36, 43, ["NN", "noun"])
    ],
    chunks: [
      {
        text: "public health care system",
        normalized: "public health care system",
        type: "noun-phrase",
        tokenStart: 1,
        tokenEnd: 5,
        confidence: 0.9
      }
    ],
    grammarFeatures: []
  };
}

function createPublicTransportPhraseTargetAnalyzerOutput(
  sourceText: string,
  sentenceHash: string
): AnalyzerOutput {
  return {
    analyzerId: "fixture-annotated",
    analyzerVersion: "fixture-v1",
    sentenceHash,
    sourceText,
    tokens: [
      token("The", "the", "determiner", 0, 3, ["DT", "determiner"]),
      token("public", "public", "adjective", 4, 10, ["JJ", "adjective"]),
      token("transport", "transport", "noun", 11, 20, ["NN", "noun"]),
      token("system", "system", "noun", 21, 27, ["NN", "noun"]),
      token("plan", "plan", "noun", 28, 32, ["NN", "noun"]),
      token("needs", "needs", "verb", 33, 38, ["VBZ", "verb"]),
      token("support", "support", "noun", 39, 46, ["NN", "noun"])
    ],
    chunks: [
      {
        text: "public transport system plan",
        normalized: "public transport system plan",
        type: "noun-phrase",
        tokenStart: 1,
        tokenEnd: 5,
        confidence: 0.9
      }
    ],
    grammarFeatures: []
  };
}

function createRenewableEnergyPhraseTargetAnalyzerOutput(
  sourceText: string,
  sentenceHash: string
): AnalyzerOutput {
  return {
    analyzerId: "fixture-annotated",
    analyzerVersion: "fixture-v1",
    sentenceHash,
    sourceText,
    tokens: [
      token("The", "the", "determiner", 0, 3, ["DT", "determiner"]),
      token("renewable", "renewable", "adjective", 4, 13, ["JJ", "adjective"]),
      token("energy", "energy", "noun", 14, 20, ["NN", "noun"]),
      token("project", "project", "noun", 21, 28, ["NN", "noun"]),
      token("plan", "plan", "noun", 29, 33, ["NN", "noun"]),
      token("needs", "needs", "verb", 34, 39, ["VBZ", "verb"]),
      token("support", "support", "noun", 40, 47, ["NN", "noun"])
    ],
    chunks: [
      {
        text: "renewable energy project plan",
        normalized: "renewable energy project plan",
        type: "noun-phrase",
        tokenStart: 1,
        tokenEnd: 5,
        confidence: 0.9
      }
    ],
    grammarFeatures: []
  };
}

function createSchoolBoardPhraseTargetAnalyzerOutput(
  sourceText: string,
  sentenceHash: string
): AnalyzerOutput {
  return {
    analyzerId: "fixture-annotated",
    analyzerVersion: "fixture-v1",
    sentenceHash,
    sourceText,
    tokens: [
      token("The", "the", "determiner", 0, 3, ["DT", "determiner"]),
      token("school", "school", "noun", 4, 10, ["NN", "noun"]),
      token("board", "board", "noun", 11, 16, ["NN", "noun"]),
      token("meeting", "meeting", "noun", 17, 24, ["NN", "noun"]),
      token("schedule", "schedule", "noun", 25, 33, ["NN", "noun"]),
      token("needs", "needs", "verb", 34, 39, ["VBZ", "verb"]),
      token("support", "support", "noun", 40, 47, ["NN", "noun"])
    ],
    chunks: [
      {
        text: "school board meeting schedule",
        normalized: "school board meeting schedule",
        type: "noun-phrase",
        tokenStart: 1,
        tokenEnd: 5,
        confidence: 0.9
      }
    ],
    grammarFeatures: []
  };
}

function createUnresolvedChunkAnalyzerOutput(
  sourceText: string,
  sentenceHash: string
): AnalyzerOutput {
  return {
    analyzerId: "fixture-annotated",
    analyzerVersion: "fixture-v1",
    sentenceHash,
    sourceText,
    tokens: [
      token("The", "the", "determiner", 0, 3, ["DT", "determiner"]),
      token("local", "local", "adjective", 4, 9, ["JJ", "adjective"]),
      token("garden", "garden", "noun", 10, 16, ["NN", "noun"]),
      token("gate", "gate", "noun", 17, 21, ["NN", "noun"]),
      token("design", "design", "noun", 22, 28, ["NN", "noun"]),
      token("needs", "needs", "verb", 29, 34, ["VBZ", "verb"]),
      token("paint", "paint", "noun", 35, 40, ["NN", "noun"])
    ],
    chunks: [
      {
        text: "local garden gate design",
        normalized: "local garden gate design",
        type: "noun-phrase",
        tokenStart: 1,
        tokenEnd: 5,
        confidence: 0.9
      }
    ],
    grammarFeatures: []
  };
}

function createGrammarFeatureMatch(
  sentenceHash: string,
  featureKey: string
): GrammarFeatureMatch {
  return {
    featureId: `grammar:${featureKey}`,
    featureKey,
    label: featureKey,
    category: "syntax",
    sourceText: featureKey,
    normalizedSourceText: featureKey,
    span: {
      startToken: 0,
      endToken: 1,
      startChar: 0,
      endChar: featureKey.length
    },
    evidence: [`fixture:${sentenceHash}`],
    confidence: 0.84
  };
}

function token(
  text: string,
  normalized: string,
  pos: string,
  startOffset: number,
  endOffset: number,
  tags: string[]
) {
  return normalizeAnalyzerToken({
    text,
    normalized,
    lemma: normalized,
    pos,
    tags,
    startOffset,
    endOffset
  });
}

function tokensFromSpecs(
  sourceText: string,
  specs: readonly (readonly [string, string, string, readonly string[]])[]
) {
  let searchStart = 0;

  return specs.map(([text, normalized, pos, tags]) => {
    const startOffset = sourceText.indexOf(text, searchStart);
    if (startOffset < 0) {
      throw new Error(`Token ${text} was not found in fixture sentence.`);
    }

    const endOffset = startOffset + text.length;
    searchStart = endOffset;
    return token(text, normalized, pos, startOffset, endOffset, [...tags]);
  });
}

function createWordInventory(): WordInventoryEntry[] {
  return [
    wordEntry("lexeme-captain", "captain", "capitan", "noun"),
    wordEntry("lexeme-football", "football", "futbol", "noun"),
    wordEntry("lexeme-team", "team", "equipo", "noun"),
    wordEntry("lexeme-patient", "patient", "paciente", "adjective")
  ];
}

function createRenderUnits(entries: readonly WordInventoryEntry[] = createWordInventory()): RenderUnitEntry[] {
  return entries.map((entry) => {
    const sourceTokens = entry.sourceLemma.split(/\s+/).filter(Boolean);
    const normalizedSourceText = entry.sourceLemma.toLowerCase();
    const normalizedTargetText = entry.targetLemma.toLowerCase();
    return {
      renderUnitId: `ru:${entry.lexemeId}`,
      lexemeIds: [entry.lexemeId],
      kind: sourceTokens.length === 1 ? "single-token" : "noun-phrase",
      renderPolicy: "inline",
      sourceText: entry.sourceLemma,
      normalizedSourceText,
      targetText: entry.targetLemma,
      normalizedTargetText,
      sourcePattern: {
        matchMode: "exact",
        tokens: sourceTokens.map((normal) => ({ normal }))
      },
      replacement: {
        startToken: 0,
        endToken: sourceTokens.length,
        targetText: entry.targetLemma
      },
      pos: entry.pos,
      minBand: "level-1a",
      frequencyRank: entry.frequencyRank,
      confidence: entry.confidence,
      provenance: { source: "manual" }
    } satisfies RenderUnitEntry;
  });
}

function wordEntry(
  lexemeId: string,
  sourceLemma: string,
  targetLemma: string,
  pos: WordInventoryEntry["pos"]
): WordInventoryEntry {
  return {
    lexemeId,
    sourceLemma,
    targetLemma,
    pos,
    frequencyRank: null,
    confidence: 0.9
  };
}

function createVocabEntry(
  lexemeId: string,
  status: "new" | "learning" | "known" | "ignored"
) {
  return {
    lexemeId,
    status,
    lastSeenAt: null,
    exposureCount: 0,
    updatedAt: "2026-04-23T10:00:00.000Z"
  };
}

function cacheKey(sentenceHash: string, analyzerVersion: string): string {
  return `${sentenceHash}:${analyzerVersion}`;
}
