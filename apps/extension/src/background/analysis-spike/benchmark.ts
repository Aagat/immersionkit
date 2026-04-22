import { hashSentence, hashString } from "@immersionkit/shared";

import { listAvailableAnalyzerFactories } from "./analyzers";
import { loadNlpPerformanceFixtures } from "./fixtures";
import type {
  AnalyzerBenchmarkMetrics,
  AnalyzerBenchmarkResult,
  BenchmarkAssertion,
  BenchmarkFixtureCatalog,
  NlpPerformanceBenchmarkRun,
  SentenceAnalysisEngine,
  SentenceAnalyzerSnapshot
} from "./types";

type BenchmarkRunOptions = {
  includeWinkNlp?: boolean;
};

const HOT_SENTENCE_SAMPLE_COUNT = 140;
const SMALL_BATCH_SIZE = 10;
const MEDIUM_BATCH_SIZE = 48;
const SAMPLE_SNAPSHOT_COUNT = 6;
const DETERMINISM_ROUNDS = 3;

const textEncoder = new TextEncoder();

export async function runNlpPerformanceSpikeBenchmark(
  options: BenchmarkRunOptions = {}
): Promise<NlpPerformanceBenchmarkRun> {
  const includeWinkNlp = options.includeWinkNlp ?? true;
  const fixtures = loadNlpPerformanceFixtures();
  const factories = listAvailableAnalyzerFactories(includeWinkNlp);

  const analyzerResults: AnalyzerBenchmarkResult[] = [];

  for (const factory of factories) {
    try {
      const engine = await factory.create();
      const metrics = await benchmarkAnalyzer(engine, fixtures);
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

  const assertions = buildRunAssertions(fixtures, analyzerResults);

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
      includeWinkNlp
    },
    fixtures: {
      syntheticSentenceCount: fixtures.syntheticSentences.length,
      pageSentenceCount: fixtures.pageSentences.length,
      cacheReplaySentenceCount: fixtures.cacheReplay.sentences.length,
      cacheReplayExpectedUniqueSentenceCount: fixtures.cacheReplay.expectedUniqueSentenceCount
    },
    analyzerResults,
    assertions
  };
}

async function benchmarkAnalyzer(
  engine: SentenceAnalysisEngine,
  fixtures: BenchmarkFixtureCatalog
): Promise<AnalyzerBenchmarkMetrics> {
  const combinedUniqueSentences = uniqueValues([
    ...fixtures.syntheticSentences,
    ...fixtures.pageSentences.map((entry) => entry.sentence)
  ]);

  const coldStartInput = combinedUniqueSentences[0] ?? "The benchmark requires at least one sentence.";
  const coldStartTiming = timed(() => {
    engine.analyzeSentence(coldStartInput);
  });

  const hotSample = repeatToLength(combinedUniqueSentences, HOT_SENTENCE_SAMPLE_COUNT);
  const hotTiming = timed(() => {
    for (const sentence of hotSample) {
      engine.analyzeSentence(sentence);
    }
  });

  const smallBatchInput = combinedUniqueSentences.slice(0, SMALL_BATCH_SIZE);
  const smallBatchTiming = timed(() => {
    for (const sentence of smallBatchInput) {
      engine.analyzeSentence(sentence);
    }
  });

  const beforeHeap = readUsedHeapSize();
  const mediumBatchInput = combinedUniqueSentences.slice(0, MEDIUM_BATCH_SIZE);
  const mediumBatchSnapshots: SentenceAnalyzerSnapshot[] = [];
  const mediumBatchTiming = timed(() => {
    for (const sentence of mediumBatchInput) {
      mediumBatchSnapshots.push(engine.analyzeSentence(sentence));
    }
  });
  const afterHeap = readUsedHeapSize();

  const determinism = runDeterminismCheck(engine, fixtures.cacheReplay.sentences);
  const cacheReplay = runCacheReplaySimulation(engine, fixtures.cacheReplay.sentences);

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
    }
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
  }
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
    }
  ];
}

function buildRunAssertions(
  fixtures: BenchmarkFixtureCatalog,
  results: AnalyzerBenchmarkResult[]
): BenchmarkAssertion[] {
  const executedResults = results.filter(
    (result): result is AnalyzerBenchmarkMetrics => !("skipped" in result)
  );

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
      id: "run:at-least-one-analyzer-ran",
      message: "At least one analyzer completed benchmark execution.",
      pass: executedResults.length > 0
    },
    {
      id: "run:analyzers-passed-own-assertions",
      message: "Every executed analyzer passed all local benchmark assertions.",
      pass: executedResults.every((result) => result.assertions.every((assertion) => assertion.pass))
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
