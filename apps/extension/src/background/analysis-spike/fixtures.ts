import syntheticFixture from "../../../../../fixtures/evals/nlp-performance/synthetic-sentences.v1.json";
import pageFixture from "../../../../../fixtures/evals/nlp-performance/page-sentences.v1.json";
import replayFixture from "../../../../../fixtures/evals/nlp-performance/cache-replay-sentences.v1.json";

import type { BenchmarkFixtureCatalog } from "./types";

type SyntheticFixtureJson = {
  fixtureVersion: string;
  sentences: string[];
};

type PageFixtureJson = {
  fixtureVersion: string;
  sentences: {
    sourceFile: string;
    sentence: string;
  }[];
};

type ReplayFixtureJson = {
  fixtureVersion: string;
  sentences: string[];
  expectedUniqueSentenceCount: number;
  expectedMinimumCacheHitRate: number;
};

function normalizeSentenceList(sentences: string[]): string[] {
  return sentences
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter((sentence) => sentence.length > 0);
}

export function loadNlpPerformanceFixtures(): BenchmarkFixtureCatalog {
  const synthetic = syntheticFixture as SyntheticFixtureJson;
  const page = pageFixture as PageFixtureJson;
  const replay = replayFixture as ReplayFixtureJson;

  return {
    syntheticSentences: normalizeSentenceList(synthetic.sentences),
    pageSentences: page.sentences
      .map((entry) => ({
        sourceFile: entry.sourceFile,
        sentence: entry.sentence.replace(/\s+/g, " ").trim()
      }))
      .filter((entry) => entry.sentence.length > 0),
    cacheReplay: {
      sentences: normalizeSentenceList(replay.sentences),
      expectedUniqueSentenceCount: replay.expectedUniqueSentenceCount,
      expectedMinimumCacheHitRate: replay.expectedMinimumCacheHitRate
    }
  };
}
