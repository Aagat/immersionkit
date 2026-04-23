import {
  hashSentence,
  normalizeAnalyzerToken,
  type AnalyzerOutput,
  type SentenceAnalysisEntry,
  type SeedLexiconEntry
} from "@immersionkit/shared";
import { describe, expect, it, vi } from "vitest";

import {
  SentenceAnalysisService,
  type SentenceAnalysisCandidate
} from "../src/background/sentence-analysis-service";
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
    const service = new SentenceAnalysisService({
      analyzer,
      cache: new InMemorySentenceAnalysisCache(),
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
