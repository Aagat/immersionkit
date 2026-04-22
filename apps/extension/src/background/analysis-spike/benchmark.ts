import { hashSentence, hashString, normalizeToken } from "@immersionkit/shared";

import { listAvailableAnalyzerFactories } from "./analyzers";
import {
  loadNlpPerformanceFixtures,
  parseNlpBenchmarkInputProfile
} from "./fixtures";
import type {
  AnalyzerBenchmarkMetrics,
  AnalyzerBenchmarkResult,
  AnalyzerQualityMetrics,
  BenchmarkAssertion,
  BenchmarkFixtureCatalog,
  NlpBenchmarkInputProfile,
  NlpPerformanceBenchmarkRun,
  SentenceAnalysisEngine,
  SentenceAnalyzerSnapshot
} from "./types";

type BenchmarkRunOptions = {
  includeWinkNlp?: boolean;
  inputProfile?: NlpBenchmarkInputProfile | string;
};

type WorkloadConfig = {
  hotSentenceSampleCount: number;
  smallBatchSize: number;
  mediumBatchSize: number;
};

const WORKLOAD_BY_PROFILE: Record<NlpBenchmarkInputProfile, WorkloadConfig> = {
  tiny: {
    hotSentenceSampleCount: 32,
    smallBatchSize: 4,
    mediumBatchSize: 16
  },
  small: {
    hotSentenceSampleCount: 80,
    smallBatchSize: 8,
    mediumBatchSize: 32
  },
  baseline: {
    hotSentenceSampleCount: 140,
    smallBatchSize: 10,
    mediumBatchSize: 48
  },
  large: {
    hotSentenceSampleCount: 600,
    smallBatchSize: 24,
    mediumBatchSize: 180
  },
  xlarge: {
    hotSentenceSampleCount: 1800,
    smallBatchSize: 48,
    mediumBatchSize: 540
  },
  xxlarge: {
    hotSentenceSampleCount: 5000,
    smallBatchSize: 120,
    mediumBatchSize: 1500
  }
};

const SAMPLE_SNAPSHOT_COUNT = 6;
const DETERMINISM_ROUNDS = 3;
const QUALITY_SAMPLE_LIMIT = 32;

const textEncoder = new TextEncoder();

export async function runNlpPerformanceSpikeBenchmark(
  options: BenchmarkRunOptions = {}
): Promise<NlpPerformanceBenchmarkRun> {
  const includeWinkNlp = options.includeWinkNlp ?? true;
  const inputProfile = parseNlpBenchmarkInputProfile(options.inputProfile);
  const workload = resolveWorkload(inputProfile);
  const fixtures = loadNlpPerformanceFixtures({
    profile: inputProfile
  });
  const factories = listAvailableAnalyzerFactories(includeWinkNlp);

  const analyzerResults: AnalyzerBenchmarkResult[] = [];

  for (const factory of factories) {
    try {
      const engine = await factory.create();
      const metrics = await benchmarkAnalyzer(engine, fixtures, workload);
      analyzerResults.push(metrics);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      analyzerResults.push({
        analyzerId: factory.analyzerId,
        skipped: true,
        reason
      });
    }
  }

  const assertions = buildRunAssertions(fixtures, analyzerResults, includeWinkNlp);

  return {
    schemaVersion: "v1",
    generatedAt: new Date().toISOString(),
    runtime: {
      userAgent:
        typeof navigator !== "undefined"
          ? navigator.userAgent
          : "node-runtime-without-user-agent",
      language:
        typeof navigator !== "undefined"
          ? navigator.language
          : "unknown-language",
      locationHref:
        typeof location !== "undefined" ? location.href : "node-runtime-without-location",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "unknown-timezone"
    },
    runOptions: {
      includeWinkNlp,
      inputProfile
    },
    workload: {
      hotSentenceSampleCount: workload.hotSentenceSampleCount,
      smallBatchSize: workload.smallBatchSize,
      mediumBatchSize: workload.mediumBatchSize
    },
    fixtures: {
      profile: fixtures.profile,
      syntheticSentenceCount: fixtures.syntheticSentences.length,
      pageSentenceCount: fixtures.pageSentences.length,
      cacheReplaySentenceCount: fixtures.cacheReplay.sentences.length,
      cacheReplayExpectedUniqueSentenceCount: fixtures.cacheReplay.expectedUniqueSentenceCount,
      qualityCaseCount: fixtures.qualityCorpus.cases.length,
      qualityCorpusVersion: fixtures.qualityCorpus.version
    },
    analyzerResults,
    assertions
  };
}

async function benchmarkAnalyzer(
  engine: SentenceAnalysisEngine,
  fixtures: BenchmarkFixtureCatalog,
  workload: WorkloadConfig
): Promise<AnalyzerBenchmarkMetrics> {
  const combinedUniqueSentences = uniqueValues([
    ...fixtures.syntheticSentences,
    ...fixtures.pageSentences.map((entry) => entry.sentence)
  ]);

  const coldStartInput = combinedUniqueSentences[0] ?? "The benchmark requires at least one sentence.";
  const coldStartTiming = timed(() => {
    engine.analyzeSentence(coldStartInput);
  });

  const hotSample = repeatToLength(
    combinedUniqueSentences,
    workload.hotSentenceSampleCount
  );
  const hotTiming = timed(() => {
    for (const sentence of hotSample) {
      engine.analyzeSentence(sentence);
    }
  });

  const smallBatchInput = combinedUniqueSentences.slice(0, workload.smallBatchSize);
  const smallBatchTiming = timed(() => {
    for (const sentence of smallBatchInput) {
      engine.analyzeSentence(sentence);
    }
  });

  const beforeHeap = readUsedHeapSize();
  const mediumBatchInput = combinedUniqueSentences.slice(0, workload.mediumBatchSize);
  const mediumBatchSnapshots: SentenceAnalyzerSnapshot[] = [];
  const mediumBatchTiming = timed(() => {
    for (const sentence of mediumBatchInput) {
      mediumBatchSnapshots.push(engine.analyzeSentence(sentence));
    }
  });
  const afterHeap = readUsedHeapSize();

  const determinism = runDeterminismCheck(engine, fixtures.cacheReplay.sentences);
  const cacheReplay = runCacheReplaySimulation(engine, fixtures.cacheReplay.sentences);
  const quality = runAnalyzerQualityBenchmark(engine, fixtures);

  const sampleSnapshots = mediumBatchSnapshots.slice(0, SAMPLE_SNAPSHOT_COUNT);
  const payloadSizes = mediumBatchSnapshots.map((snapshot) =>
    textEncoder.encode(JSON.stringify(toPortableSnapshot(snapshot))).length
  );

  const averagePayloadBytesPerSentence =
    payloadSizes.length > 0
      ? payloadSizes.reduce((sum, value) => sum + value, 0) / payloadSizes.length
      : 0;

  const assertions = buildAnalyzerAssertions(
    engine.analyzerId,
    fixtures,
    {
      comparedSentenceCount: determinism.comparedSentenceCount,
      stableRate: determinism.stableRate
    },
    {
      simulatedHitRate: cacheReplay.simulatedHitRate,
      uniqueSentenceCount: cacheReplay.uniqueSentenceCount
    },
    {
      averagePayloadBytesPerSentence,
      mediumBatchSentenceCount: mediumBatchInput.length
    },
    quality
  );

  return {
    analyzerId: engine.analyzerId,
    datasetSizes: {
      synthetic: fixtures.syntheticSentences.length,
      "fixture-pages": fixtures.pageSentences.length,
      "cache-replay": fixtures.cacheReplay.sentences.length
    },
    coldStartLatencyMs: coldStartTiming.durationMs,
    hotPerSentenceLatencyMs:
      hotSample.length === 0 ? 0 : hotTiming.durationMs / hotSample.length,
    smallBatch: {
      sentenceCount: smallBatchInput.length,
      totalLatencyMs: smallBatchTiming.durationMs,
      perSentenceLatencyMs:
        smallBatchInput.length === 0
          ? 0
          : smallBatchTiming.durationMs / smallBatchInput.length
    },
    mediumBatch: {
      sentenceCount: mediumBatchInput.length,
      totalLatencyMs: mediumBatchTiming.durationMs,
      perSentenceLatencyMs:
        mediumBatchInput.length === 0
          ? 0
          : mediumBatchTiming.durationMs / mediumBatchInput.length
    },
    payload: {
      averageBytesPerSentence: averagePayloadBytesPerSentence,
      maxBytesPerSentence: Math.max(0, ...payloadSizes),
      sampleSentenceCount: payloadSizes.length
    },
    memoryProxy: {
      beforeUsedHeapBytes: beforeHeap,
      afterUsedHeapBytes: afterHeap,
      deltaUsedHeapBytes:
        beforeHeap !== null && afterHeap !== null ? afterHeap - beforeHeap : null
    },
    determinism: {
      comparedSentenceCount: determinism.comparedSentenceCount,
      stableRate: determinism.stableRate
    },
    cacheReplay: {
      replaySentenceCount: fixtures.cacheReplay.sentences.length,
      uniqueSentenceCount: cacheReplay.uniqueSentenceCount,
      simulatedHitRate: cacheReplay.simulatedHitRate,
      noCacheLatencyMs: cacheReplay.noCacheLatencyMs,
      withCacheLatencyMs: cacheReplay.withCacheLatencyMs,
      savedLatencyMs: cacheReplay.noCacheLatencyMs - cacheReplay.withCacheLatencyMs
    },
    quality,
    assertions,
    sampleSnapshots
  };
}

function runDeterminismCheck(engine: SentenceAnalysisEngine, replaySentences: string[]) {
  const uniqueReplaySentences = uniqueValues(replaySentences);
  const baselineFingerprints = new Map<string, string>();

  let comparedSentenceCount = 0;
  let stableSentenceCount = 0;

  for (let round = 0; round < DETERMINISM_ROUNDS; round += 1) {
    for (const sentence of uniqueReplaySentences) {
      const snapshot = engine.analyzeSentence(sentence);
      const fingerprint = hashString(JSON.stringify(toPortableSnapshot(snapshot)));
      const sentenceHash = hashSentence(sentence);
      const baseline = baselineFingerprints.get(sentenceHash);

      if (!baseline) {
        baselineFingerprints.set(sentenceHash, fingerprint);
        continue;
      }

      comparedSentenceCount += 1;
      if (baseline === fingerprint) {
        stableSentenceCount += 1;
      }
    }
  }

  return {
    comparedSentenceCount,
    stableRate:
      comparedSentenceCount === 0 ? 1 : stableSentenceCount / comparedSentenceCount
  };
}

function runCacheReplaySimulation(engine: SentenceAnalysisEngine, replaySentences: string[]) {
  const cache = new Map<string, SentenceAnalyzerSnapshot>();
  let hits = 0;
  let misses = 0;

  const noCacheTiming = timed(() => {
    for (const sentence of replaySentences) {
      engine.analyzeSentence(sentence);
    }
  });

  const withCacheTiming = timed(() => {
    for (const sentence of replaySentences) {
      const sentenceHash = hashSentence(sentence);
      const cached = cache.get(sentenceHash);
      if (cached) {
        hits += 1;
        continue;
      }

      cache.set(sentenceHash, engine.analyzeSentence(sentence));
      misses += 1;
    }
  });

  return {
    replaySentenceCount: replaySentences.length,
    uniqueSentenceCount: misses,
    simulatedHitRate: replaySentences.length === 0 ? 0 : hits / replaySentences.length,
    noCacheLatencyMs: noCacheTiming.durationMs,
    withCacheLatencyMs: withCacheTiming.durationMs
  };
}

function runAnalyzerQualityBenchmark(
  engine: SentenceAnalysisEngine,
  fixtures: BenchmarkFixtureCatalog
): AnalyzerQualityMetrics {
  const sampledCaseMetrics: AnalyzerQualityMetrics["sampledCaseMetrics"] = [];
  let tokenCoverageTotal = 0;
  let phraseRecallTotal = 0;
  let evaluatedPhraseCaseCount = 0;
  let matchedPhraseCaseCount = 0;
  let phraseTruePositiveCount = 0;
  let phraseFalsePositiveCount = 0;
  let phraseFalseNegativeCount = 0;

  for (const qualityCase of fixtures.qualityCorpus.cases) {
    const snapshot = engine.analyzeSentence(qualityCase.sentence);
    const tokenSet = new Set(
      snapshot.tokens
        .map((token) => normalizeToken(token.normalized || token.text))
        .filter((token) => token.length > 0)
    );
    const phraseSet = new Set(
      snapshot.phraseCandidates
        .map((candidate) => normalizeComparablePhrase(candidate))
        .filter((candidate) => candidate.length > 0)
    );

    const expectedTokens = uniqueValues(qualityCase.expectedNormalizedTokens)
      .map((token) => normalizeToken(token))
      .filter((token) => token.length > 0);
    const expectedPhrases = uniqueValues(qualityCase.expectedNormalizedPhrases)
      .map((phrase) => normalizeComparablePhrase(phrase))
      .filter((phrase) => phrase.length > 0);

    const matchedTokenCount = expectedTokens.filter((token) => tokenSet.has(token)).length;
    const predictedPhrases = [...phraseSet];
    const matchedPairs = matchExpectedPhrases(expectedPhrases, predictedPhrases);
    const truePositivePhraseCount = matchedPairs;
    const falseNegativePhraseCount = Math.max(0, expectedPhrases.length - truePositivePhraseCount);
    const falsePositivePhraseCount = Math.max(0, predictedPhrases.length - truePositivePhraseCount);
    const phrasePrecision = ratioOrOne(
      truePositivePhraseCount,
      truePositivePhraseCount + falsePositivePhraseCount
    );

    const tokenCoverage = ratio(matchedTokenCount, expectedTokens.length);
    const phraseRecall = ratio(
      truePositivePhraseCount,
      truePositivePhraseCount + falseNegativePhraseCount
    );
    const phraseF1 = ratioOrZero(
      2 * phrasePrecision * phraseRecall,
      phrasePrecision + phraseRecall
    );

    tokenCoverageTotal += tokenCoverage;
    phraseTruePositiveCount += truePositivePhraseCount;
    phraseFalsePositiveCount += falsePositivePhraseCount;
    phraseFalseNegativeCount += falseNegativePhraseCount;

    if (expectedPhrases.length > 0) {
      evaluatedPhraseCaseCount += 1;
      phraseRecallTotal += phraseRecall;
      if (truePositivePhraseCount > 0) {
        matchedPhraseCaseCount += 1;
      }
    }

    if (sampledCaseMetrics.length < QUALITY_SAMPLE_LIMIT) {
      sampledCaseMetrics.push({
        caseId: qualityCase.id,
        expectedTokenCount: expectedTokens.length,
        matchedTokenCount,
        tokenCoverage,
        expectedPhraseCount: expectedPhrases.length,
        predictedPhraseCount: predictedPhrases.length,
        truePositivePhraseCount,
        falsePositivePhraseCount,
        falseNegativePhraseCount,
        phrasePrecision,
        phraseRecall,
        phraseF1
      });
    }
  }

  const phrasePrecision = ratioOrZero(
    phraseTruePositiveCount,
    phraseTruePositiveCount + phraseFalsePositiveCount
  );
  const phraseRecall = ratio(
    phraseTruePositiveCount,
    phraseTruePositiveCount + phraseFalseNegativeCount
  );
  const phraseF1 = ratioOrZero(
    2 * phrasePrecision * phraseRecall,
    phrasePrecision + phraseRecall
  );

  return {
    corpusVersion: fixtures.qualityCorpus.version,
    caseCount: fixtures.qualityCorpus.cases.length,
    averageTokenCoverage: ratio(tokenCoverageTotal, fixtures.qualityCorpus.cases.length),
    phraseTruePositiveCount,
    phraseFalsePositiveCount,
    phraseFalseNegativeCount,
    phrasePrecision,
    averagePhraseRecall: ratio(phraseRecallTotal, evaluatedPhraseCaseCount),
    phraseF1,
    evaluatedPhraseCaseCount,
    matchedPhraseCaseCount,
    sampledCaseMetrics
  };
}

function buildAnalyzerAssertions(
  analyzerId: string,
  fixtures: BenchmarkFixtureCatalog,
  determinism: {
    comparedSentenceCount: number;
    stableRate: number;
  },
  cacheReplay: {
    simulatedHitRate: number;
    uniqueSentenceCount: number;
  },
  payload: {
    averagePayloadBytesPerSentence: number;
    mediumBatchSentenceCount: number;
  },
  quality: AnalyzerQualityMetrics
): BenchmarkAssertion[] {
  return [
    {
      id: `${analyzerId}:determinism-check`,
      message: `${analyzerId} keeps deterministic snapshots across repeated runs.`,
      pass:
        determinism.comparedSentenceCount > 0 &&
        determinism.stableRate >= 0.98
    },
    {
      id: `${analyzerId}:cache-replay-shape`,
      message: `${analyzerId} replay set contains enough duplicates to validate cache hits.`,
      pass:
        cacheReplay.uniqueSentenceCount <= fixtures.cacheReplay.expectedUniqueSentenceCount &&
        cacheReplay.simulatedHitRate >= fixtures.cacheReplay.expectedMinimumCacheHitRate
    },
    {
      id: `${analyzerId}:payload-emits`,
      message: `${analyzerId} emits non-empty snapshot payloads for medium batches.`,
      pass:
        payload.mediumBatchSentenceCount > 0 &&
        payload.averagePayloadBytesPerSentence > 80
    },
    {
      id: `${analyzerId}:quality-corpus-loaded`,
      message: `${analyzerId} quality evaluation consumed labeled benchmark cases.`,
      pass:
        quality.caseCount > 0 &&
        quality.caseCount === fixtures.qualityCorpus.cases.length
    },
    {
      id: `${analyzerId}:quality-token-coverage`,
      message: `${analyzerId} preserves expected token surfaces across the quality corpus.`,
      pass: quality.caseCount > 0 && quality.averageTokenCoverage >= 0.4
    },
    {
      id: `${analyzerId}:quality-phrase-cases-present`,
      message: `${analyzerId} quality corpus includes expected-phrase recall probes.`,
      pass: quality.evaluatedPhraseCaseCount > 0
    },
    {
      id: `${analyzerId}:quality-phrase-truth-scored`,
      message: `${analyzerId} quality run produced phrase-level TP/FP/FN counts.`,
      pass:
        quality.phraseTruePositiveCount +
          quality.phraseFalsePositiveCount +
          quality.phraseFalseNegativeCount >
        0
    }
  ];
}

function buildRunAssertions(
  fixtures: BenchmarkFixtureCatalog,
  results: AnalyzerBenchmarkResult[],
  includeWinkNlp: boolean
): BenchmarkAssertion[] {
  const executedResults = results.filter(
    (result): result is AnalyzerBenchmarkMetrics => !("skipped" in result)
  );
  const executedAnalyzerIds = new Set(executedResults.map((result) => result.analyzerId));
  const compromiseRan = executedResults.some((result) =>
    result.analyzerId.startsWith("compromise")
  );
  const winkRan = executedAnalyzerIds.has("wink-nlp");
  const qualityCoverageForAllRan = executedResults.every((result) => result.quality.caseCount > 0);

  return [
    {
      id: "fixtures:synthetic-non-empty",
      message: "Synthetic fixtures are present.",
      pass: fixtures.syntheticSentences.length > 0
    },
    {
      id: "fixtures:page-non-empty",
      message: "Fixture-derived page sentences are present.",
      pass: fixtures.pageSentences.length > 0
    },
    {
      id: "fixtures:replay-non-empty",
      message: "Replay sentence fixtures are present.",
      pass: fixtures.cacheReplay.sentences.length > 0
    },
    {
      id: "fixtures:quality-cases-non-empty",
      message: "Labeled quality corpus cases are present.",
      pass: fixtures.qualityCorpus.cases.length > 0
    },
    {
      id: "run:at-least-one-analyzer-ran",
      message: "At least one analyzer completed benchmark execution.",
      pass: executedResults.length > 0
    },
    {
      id: "run:analyzers-passed-own-assertions",
      message: "Every executed analyzer passed all local benchmark assertions.",
      pass: executedResults.every((result) => result.assertions.every((assertion) => assertion.pass))
    },
    {
      id: "run:labeled-truth-compares-both-libraries",
      message:
        "When wink comparison is enabled, both compromise and wink analyzers are evaluated on labeled truth cases.",
      pass: includeWinkNlp ? compromiseRan && winkRan && qualityCoverageForAllRan : compromiseRan
    }
  ];
}

function timed(run: () => void): { durationMs: number } {
  const start = nowMs();
  run();
  return {
    durationMs: nowMs() - start
  };
}

function readUsedHeapSize(): number | null {
  const maybePerformance = performance as Performance & {
    memory?: {
      usedJSHeapSize?: number;
    };
  };

  const usedHeap = maybePerformance.memory?.usedJSHeapSize;
  return typeof usedHeap === "number" ? usedHeap : null;
}

function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }

  return Date.now();
}

function resolveWorkload(profile: NlpBenchmarkInputProfile): WorkloadConfig {
  return WORKLOAD_BY_PROFILE[profile] ?? WORKLOAD_BY_PROFILE.baseline;
}

function repeatToLength(values: string[], targetLength: number): string[] {
  if (values.length === 0 || targetLength <= 0) {
    return [];
  }

  const output: string[] = [];
  for (let index = 0; index < targetLength; index += 1) {
    output.push(values[index % values.length]);
  }

  return output;
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values));
}

function normalizeComparablePhrase(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchExpectedPhrases(expectedPhrases: string[], predictedPhrases: string[]): number {
  if (expectedPhrases.length === 0 || predictedPhrases.length === 0) {
    return 0;
  }

  const consumedPredictedIndexes = new Set<number>();
  let matchCount = 0;

  for (const expected of expectedPhrases) {
    const matchedIndex = predictedPhrases.findIndex((candidate, index) => {
      if (consumedPredictedIndexes.has(index)) {
        return false;
      }

      if (candidate === expected) {
        return true;
      }

      return candidate.length > expected.length && candidate.includes(expected);
    });

    if (matchedIndex >= 0) {
      consumedPredictedIndexes.add(matchedIndex);
      matchCount += 1;
    }
  }

  return matchCount;
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 1;
  }

  return numerator / denominator;
}

function ratioOrOne(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 1;
  }

  return numerator / denominator;
}

function ratioOrZero(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }

  return numerator / denominator;
}

function toPortableSnapshot(snapshot: SentenceAnalyzerSnapshot) {
  return {
    analyzerId: snapshot.analyzerId,
    sentenceHash: snapshot.sentenceHash,
    sentence: snapshot.sentence,
    tokenCount: snapshot.tokenCount,
    tokens: snapshot.tokens.map((token) => ({
      text: token.text,
      normalized: token.normalized,
      pos: token.pos,
      tags: [...token.tags].sort()
    })),
    phraseCandidates: [...snapshot.phraseCandidates].sort()
  };
}

export function createPortableSnapshots(
  snapshots: SentenceAnalyzerSnapshot[]
): ReturnType<typeof toPortableSnapshot>[] {
  return snapshots.map((snapshot) => toPortableSnapshot(snapshot));
}
