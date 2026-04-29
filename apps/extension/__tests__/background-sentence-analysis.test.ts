import {
  hashSentence,
  normalizeAnalyzerToken,
  type AnalyzerOutput,
  type PhraseOccurrence,
  type PhraseRegistryEntry,
  type SentenceAnalysisEntry,
  type SeedLexiconEntry
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
import type { SentenceAnalyzer } from "../src/background/sentence-analyzers";

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
      loadLexicon: () => Promise.resolve(createLexicon()),
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
    expect(await cache.get(sentenceHash, "fixture-v1")).toBeTruthy();
    expect(await cache.get(sentenceHash, "fixture-v2")).toBeNull();
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
      loadLexicon: () =>
        Promise.resolve([
          lexiconEntry("lemma-can", "can", "lata", "noun"),
          lexiconEntry("lemma-watch", "watch", "reloj", "noun"),
          lexiconEntry("lemma-plant", "plant", "planta", "noun")
        ]),
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
      loadLexicon: () => Promise.resolve(createLexicon()),
      loadVocab: () =>
        Promise.resolve(
          new Map([
            ["lemma-captain", createVocabEntry("lemma-captain", "known")],
            ["lemma-team", createVocabEntry("lemma-team", "learning")]
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

  it("resolves fixed phrase targets before registry persistence", async () => {
    const sourceText = "We take care of the old city.";
    const sentenceHash = hashSentence(sourceText);
    const analyzer = createAnalyzer("fixture-v1", () =>
      createFixedPhraseAnalyzerOutput(sourceText, sentenceHash)
    );
    const phraseRegistry = new InMemoryPhraseRegistry();
    const service = new SentenceAnalysisService({
      analyzer,
      cache: new InMemorySentenceAnalysisCache(),
      phraseRegistry,
      loadLexicon: () => Promise.resolve(createLexicon()),
      loadVocab: () => Promise.resolve(new Map())
    });

    const [analysis] = await service.analyzeCandidates([{ sentenceHash, sourceText }]);
    const fixedPhrase = analysis?.entry.phraseMatches.find(
      (match) => match.sourceKind === "fixed-phrase"
    );

    expect(fixedPhrase).toMatchObject({
      sourceText: "take care of",
      targetText: "cuidar de",
      normalizedTargetText: "cuidar de",
      phraseId: "phrase:fixed-phrase:take-care-of:cuidar-de"
    });
    await expect(phraseRegistry.get(fixedPhrase?.phraseId ?? "")).resolves.toMatchObject({
      canonicalTargetText: "cuidar de",
      normalizedTargetText: "cuidar de"
    });
  });

  it("resolves runtime phrase targets from exact multiword seed entries", async () => {
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
      loadLexicon: () =>
        Promise.resolve([
          ...createLexicon(),
          lexiconEntry(
            "phrase-old-city-center-walls",
            "old city center walls",
            "murallas del centro antiguo",
            "noun"
          )
        ]),
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
      phraseId:
        "phrase:chunk:old-city-center-walls:murallas-del-centro-antiguo"
    });
    await expect(phraseRegistry.get(chunkPhrase?.phraseId ?? "")).resolves.toMatchObject({
      canonicalTargetText: "murallas del centro antiguo",
      normalizedTargetText: "murallas del centro antiguo"
    });
  });

  it("resolves runtime phrase targets from the curated phrase target lexicon", async () => {
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
      loadLexicon: () => Promise.resolve(createLexicon()),
      loadVocab: () => Promise.resolve(new Map())
    });

    const [analysis] = await service.analyzeCandidates([{ sentenceHash, sourceText }]);
    const chunkPhrase = analysis?.entry.phraseMatches.find(
      (match) => match.sourceText === "public health care system"
    );

    expect(chunkPhrase).toMatchObject({
      sourceKind: "chunk",
      category: "noun-chunk",
      targetText: "sistema de salud publica",
      normalizedTargetText: "sistema de salud publica",
      phraseId:
        "phrase:chunk:public-health-care-system:sistema-de-salud-publica"
    });
    await expect(phraseRegistry.get(chunkPhrase?.phraseId ?? "")).resolves.toMatchObject({
      canonicalTargetText: "sistema de salud publica",
      normalizedTargetText: "sistema de salud publica"
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
      loadLexicon: () => Promise.resolve(createLexicon()),
      loadVocab: () => Promise.resolve(new Map())
    });

    const [analysis] = await service.analyzeCandidates([{ sentenceHash, sourceText }]);
    const chunkPhrase = analysis?.entry.phraseMatches.find(
      (match) => match.sourceText === "public transport system plan"
    );

    expect(chunkPhrase).toMatchObject({
      sourceKind: "chunk",
      category: "noun-chunk",
      targetText: "plan del sistema de transporte publico",
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
      loadLexicon: () => Promise.resolve(createLexicon()),
      loadVocab: () => Promise.resolve(new Map())
    });

    const [analysis] = await service.analyzeCandidates([{ sentenceHash, sourceText }]);
    const chunkPhrase = analysis?.entry.phraseMatches.find(
      (match) => match.sourceText === "renewable energy project plan"
    );

    expect(chunkPhrase).toMatchObject({
      sourceKind: "chunk",
      category: "noun-chunk",
      targetText: "plan de proyectos de energia renovable",
      normalizedTargetText: "plan de proyectos de energia renovable",
      phraseId:
        "phrase:chunk:renewable-energy-project-plan:plan-de-proyectos-de-energia-renovable"
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
      loadLexicon: () => Promise.resolve(createLexicon()),
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
      loadLexicon: () => Promise.resolve(createLexicon()),
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
      loadLexicon: () => Promise.resolve(createLexicon()),
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

  async cleanupLegacyBlankTargetDuplicates() {
    return {
      scanned: this.entries.size,
      removedRegistryEntries: 0,
      removedLearningItems: 0
    };
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

function createLexicon(): SeedLexiconEntry[] {
  return [
    lexiconEntry("lemma-captain", "captain", "capitan", "noun"),
    lexiconEntry("lemma-football", "football", "futbol", "noun"),
    lexiconEntry("lemma-team", "team", "equipo", "noun"),
    lexiconEntry("lemma-patient", "patient", "paciente", "adjective")
  ];
}

function lexiconEntry(
  lemmaId: string,
  sourceLemma: string,
  targetLemma: string,
  pos: SeedLexiconEntry["pos"]
): SeedLexiconEntry {
  return {
    lemmaId,
    sourceLemma,
    targetLemma,
    pos,
    frequencyRank: null,
    confidence: 0.9
  };
}

function createVocabEntry(
  lemmaId: string,
  status: "new" | "learning" | "known" | "ignored"
) {
  return {
    lemmaId,
    status,
    lastSeenAt: null,
    exposureCount: 0,
    updatedAt: "2026-04-23T10:00:00.000Z"
  };
}

function cacheKey(sentenceHash: string, analyzerVersion: string): string {
  return `${sentenceHash}:${analyzerVersion}`;
}
