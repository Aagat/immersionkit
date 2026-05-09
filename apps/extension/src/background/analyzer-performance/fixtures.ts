import { normalizeToken } from "@immersionkit/shared";

import syntheticFixture from "../../../../../fixtures/evals/nlp-performance/synthetic-sentences.v1.json";
import pageFixture from "../../../../../fixtures/evals/nlp-performance/page-sentences.v1.json";
import replayFixture from "../../../../../fixtures/evals/nlp-performance/cache-replay-sentences.v1.json";
import qualityCorpusFixture from "../../../../../fixtures/evals/phrase-detection/phrase-detection-gold-corpus.json";

import type {
  AnalyzerQualityCase,
  BenchmarkFixtureCatalog,
  NlpBenchmarkInputProfile
} from "./types";

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
  baseSentences?: string[];
  repetitions?: number;
  sentences: string[];
  expectedUniqueSentenceCount: number;
  expectedMinimumCacheHitRate: number;
};

type QualityCorpusFixtureJson = {
  version: string;
  cases: {
    id: string;
    sourceText: string;
    tokens?: {
      surface?: string;
    }[];
    expectedPhrases?: {
      normalizedSourceText?: string;
    }[];
  }[];
};

type FixtureLoadOptions = {
  profile?: NlpBenchmarkInputProfile;
};

type FixtureProfileConfig = {
  syntheticTarget: number;
  pageTarget: number;
  replayUniqueTarget: number;
  replayRepetitions: number;
  qualityTarget: number;
};

const PROFILE_CONFIGS: Record<Exclude<NlpBenchmarkInputProfile, "baseline">, FixtureProfileConfig> = {
  tiny: {
    syntheticTarget: 8,
    pageTarget: 8,
    replayUniqueTarget: 6,
    replayRepetitions: 2,
    qualityTarget: 8
  },
  small: {
    syntheticTarget: 20,
    pageTarget: 20,
    replayUniqueTarget: 10,
    replayRepetitions: 3,
    qualityTarget: 16
  },
  large: {
    syntheticTarget: 180,
    pageTarget: 180,
    replayUniqueTarget: 12,
    replayRepetitions: 20,
    qualityTarget: 96
  },
  xlarge: {
    syntheticTarget: 720,
    pageTarget: 720,
    replayUniqueTarget: 12,
    replayRepetitions: 80,
    qualityTarget: 320
  },
  xxlarge: {
    syntheticTarget: 2400,
    pageTarget: 2400,
    replayUniqueTarget: 12,
    replayRepetitions: 240,
    qualityTarget: 1200
  }
};

const VARIANT_SUFFIXES = [
  "under noisy commuter conditions",
  "after a delayed morning transfer",
  "during a weekend volunteer cleanup",
  "while route guidance remains constrained",
  "with mixed beginner and intermediate vocabulary",
  "amid overlapping phrase candidates in context",
  "before cached sentence hashes are reused",
  "as sentence ranking priorities shift subtly"
] as const;

function normalizeSentenceList(sentences: string[]): string[] {
  return sentences
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter((sentence) => sentence.length > 0);
}

export function parseNlpBenchmarkInputProfile(
  value: string | null | undefined
): NlpBenchmarkInputProfile {
  const normalized = value?.trim().toLowerCase();

  if (
    normalized === "tiny" ||
    normalized === "small" ||
    normalized === "baseline" ||
    normalized === "large" ||
    normalized === "xlarge" ||
    normalized === "xxlarge"
  ) {
    return normalized;
  }

  return "baseline";
}

export function loadNlpPerformanceFixtures(
  options: FixtureLoadOptions = {}
): BenchmarkFixtureCatalog {
  const profile = options.profile ?? "baseline";
  const synthetic = syntheticFixture as SyntheticFixtureJson;
  const page = pageFixture as PageFixtureJson;
  const replay = replayFixture as ReplayFixtureJson;
  const qualityCorpus = qualityCorpusFixture as QualityCorpusFixtureJson;

  const baselineSynthetic = normalizeSentenceList(synthetic.sentences);
  const baselinePage = page.sentences
    .map((entry) => ({
      sourceFile: entry.sourceFile,
      sentence: entry.sentence.replace(/\s+/g, " ").trim()
    }))
    .filter((entry) => entry.sentence.length > 0);
  const baselineReplaySentences = normalizeSentenceList(replay.sentences);
  const baselineQualityCases = toAnalyzerQualityCases(qualityCorpus);

  if (profile === "baseline") {
    return {
      profile,
      syntheticSentences: baselineSynthetic,
      pageSentences: baselinePage,
      cacheReplay: {
        sentences: baselineReplaySentences,
        expectedUniqueSentenceCount: replay.expectedUniqueSentenceCount,
        expectedMinimumCacheHitRate: replay.expectedMinimumCacheHitRate
      },
      qualityCorpus: {
        version: qualityCorpus.version,
        cases: baselineQualityCases
      }
    };
  }

  const profileConfig = PROFILE_CONFIGS[profile];
  const syntheticSentences = expandSentenceList(
    baselineSynthetic,
    profileConfig.syntheticTarget
  );
  const pageSentences = expandPageSentenceList(
    baselinePage,
    profileConfig.pageTarget
  );
  const replayBaseCandidates = normalizeSentenceList(
    replay.baseSentences && replay.baseSentences.length > 0
      ? replay.baseSentences
      : uniqueValues(baselineReplaySentences)
  );
  const replayUniqueSentences = expandSentenceList(
    replayBaseCandidates,
    profileConfig.replayUniqueTarget
  );
  const replaySentences = repeatSentences(
    replayUniqueSentences,
    profileConfig.replayRepetitions
  );
  const replayHitRateFloor = calculateReplayHitRateFloor(
    replayUniqueSentences.length,
    replaySentences.length
  );
  const qualityCases = expandQualityCases(
    baselineQualityCases,
    profileConfig.qualityTarget
  );

  return {
    profile,
    syntheticSentences,
    pageSentences,
    cacheReplay: {
      sentences: replaySentences,
      expectedUniqueSentenceCount: replayUniqueSentences.length,
      expectedMinimumCacheHitRate: replayHitRateFloor
    },
    qualityCorpus: {
      version: qualityCorpus.version,
      cases: qualityCases
    }
  };
}

function expandSentenceList(baseSentences: string[], targetCount: number): string[] {
  if (targetCount <= 0 || baseSentences.length === 0) {
    return [];
  }

  if (targetCount <= baseSentences.length) {
    return baseSentences.slice(0, targetCount);
  }

  const output = [...baseSentences];
  for (let index = baseSentences.length; index < targetCount; index += 1) {
    const sentence = baseSentences[index % baseSentences.length];
    const variantIteration = Math.floor(index / baseSentences.length);
    output.push(withVariantSuffix(sentence, variantIteration));
  }

  return output;
}

function expandPageSentenceList(
  pageSentences: { sourceFile: string; sentence: string }[],
  targetCount: number
) {
  if (targetCount <= 0 || pageSentences.length === 0) {
    return [];
  }

  if (targetCount <= pageSentences.length) {
    return pageSentences.slice(0, targetCount);
  }

  const output = [...pageSentences];
  for (let index = pageSentences.length; index < targetCount; index += 1) {
    const base = pageSentences[index % pageSentences.length];
    const variantIteration = Math.floor(index / pageSentences.length);
    output.push({
      sourceFile: `${base.sourceFile}#expanded-${variantIteration}`,
      sentence: withVariantSuffix(base.sentence, variantIteration)
    });
  }

  return output;
}

function expandQualityCases(
  qualityCases: AnalyzerQualityCase[],
  targetCount: number
): AnalyzerQualityCase[] {
  if (targetCount <= 0 || qualityCases.length === 0) {
    return [];
  }

  if (targetCount <= qualityCases.length) {
    return qualityCases.slice(0, targetCount);
  }

  const output = [...qualityCases];
  for (let index = qualityCases.length; index < targetCount; index += 1) {
    const base = qualityCases[index % qualityCases.length];
    const variantIteration = Math.floor(index / qualityCases.length);
    output.push({
      id: `${base.id}#expanded-${variantIteration + 1}`,
      sentence: withVariantSuffix(base.sentence, variantIteration),
      expectedNormalizedTokens: [...base.expectedNormalizedTokens],
      expectedNormalizedPhrases: [...base.expectedNormalizedPhrases]
    });
  }

  return output;
}

function toAnalyzerQualityCases(corpus: QualityCorpusFixtureJson): AnalyzerQualityCase[] {
  return corpus.cases.map((entry) => {
    const expectedNormalizedTokens = uniqueValues(
      (entry.tokens ?? [])
        .map((token) => normalizeToken(token.surface ?? ""))
        .filter((token) => token.length > 0)
    );
    const expectedNormalizedPhrases = uniqueValues(
      (entry.expectedPhrases ?? [])
        .map((phrase) => normalizeComparablePhrase(phrase.normalizedSourceText ?? ""))
        .filter((phrase) => phrase.length > 0)
    );

    return {
      id: entry.id,
      sentence: entry.sourceText.replace(/\s+/g, " ").trim(),
      expectedNormalizedTokens,
      expectedNormalizedPhrases
    };
  });
}

function withVariantSuffix(sentence: string, variantIteration: number): string {
  const suffix = VARIANT_SUFFIXES[variantIteration % VARIANT_SUFFIXES.length];
  const sentenceBody = sentence.replace(/[.!?]+$/g, "");
  return `${sentenceBody} (${suffix} ${variantIteration + 1}).`;
}

function normalizeComparablePhrase(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function repeatSentences(sentences: string[], repetitions: number): string[] {
  if (sentences.length === 0 || repetitions <= 0) {
    return [];
  }

  const output: string[] = [];
  for (let round = 0; round < repetitions; round += 1) {
    for (const sentence of sentences) {
      output.push(sentence);
    }
  }

  return output;
}

function calculateReplayHitRateFloor(uniqueCount: number, totalCount: number): number {
  if (totalCount <= 0) {
    return 0;
  }

  const idealHitRate = Math.max(0, 1 - uniqueCount / totalCount);
  return Math.max(0, idealHitRate - 0.02);
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values));
}
