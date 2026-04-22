export type BenchmarkDatasetId = "synthetic" | "fixture-pages" | "cache-replay";

export type AnalyzerId = "compromise-two" | "compromise-three" | "wink-nlp";

export type NlpBenchmarkInputProfile =
  | "tiny"
  | "small"
  | "baseline"
  | "large"
  | "xlarge"
  | "xxlarge";

export type AnalyzerTokenSnapshot = {
  text: string;
  normalized: string;
  pos: string;
  tags: string[];
};

export type SentenceAnalyzerSnapshot = {
  analyzerId: AnalyzerId;
  sentence: string;
  sentenceHash: string;
  tokenCount: number;
  tokens: AnalyzerTokenSnapshot[];
  phraseCandidates: string[];
};

export type SentenceAnalysisEngine = {
  readonly analyzerId: AnalyzerId;
  analyzeSentence: (sentence: string) => SentenceAnalyzerSnapshot;
};

export type AnalyzerEngineFactory = {
  analyzerId: AnalyzerId;
  create: () => Promise<SentenceAnalysisEngine>;
};

export type BenchmarkFixtureCatalog = {
  profile: NlpBenchmarkInputProfile;
  syntheticSentences: string[];
  pageSentences: {
    sourceFile: string;
    sentence: string;
  }[];
  cacheReplay: {
    sentences: string[];
    expectedUniqueSentenceCount: number;
    expectedMinimumCacheHitRate: number;
  };
  qualityCorpus: {
    version: string;
    cases: AnalyzerQualityCase[];
  };
};

export type AnalyzerQualityCase = {
  id: string;
  sentence: string;
  expectedNormalizedTokens: string[];
  expectedNormalizedPhrases: string[];
};

export type AnalyzerQualityCaseMetrics = {
  caseId: string;
  expectedTokenCount: number;
  matchedTokenCount: number;
  tokenCoverage: number;
  expectedPhraseCount: number;
  predictedPhraseCount: number;
  truePositivePhraseCount: number;
  falsePositivePhraseCount: number;
  falseNegativePhraseCount: number;
  phrasePrecision: number;
  phraseRecall: number;
  phraseF1: number;
};

export type AnalyzerQualityMetrics = {
  corpusVersion: string;
  caseCount: number;
  averageTokenCoverage: number;
  phraseTruePositiveCount: number;
  phraseFalsePositiveCount: number;
  phraseFalseNegativeCount: number;
  phrasePrecision: number;
  averagePhraseRecall: number;
  phraseF1: number;
  evaluatedPhraseCaseCount: number;
  matchedPhraseCaseCount: number;
  sampledCaseMetrics: AnalyzerQualityCaseMetrics[];
};

export type BenchmarkAssertion = {
  id: string;
  message: string;
  pass: boolean;
};

export type AnalyzerBenchmarkMetrics = {
  analyzerId: AnalyzerId;
  datasetSizes: Record<BenchmarkDatasetId, number>;
  coldStartLatencyMs: number;
  hotPerSentenceLatencyMs: number;
  smallBatch: {
    sentenceCount: number;
    totalLatencyMs: number;
    perSentenceLatencyMs: number;
  };
  mediumBatch: {
    sentenceCount: number;
    totalLatencyMs: number;
    perSentenceLatencyMs: number;
  };
  payload: {
    averageBytesPerSentence: number;
    maxBytesPerSentence: number;
    sampleSentenceCount: number;
  };
  memoryProxy: {
    beforeUsedHeapBytes: number | null;
    afterUsedHeapBytes: number | null;
    deltaUsedHeapBytes: number | null;
  };
  determinism: {
    comparedSentenceCount: number;
    stableRate: number;
  };
  cacheReplay: {
    replaySentenceCount: number;
    uniqueSentenceCount: number;
    simulatedHitRate: number;
    noCacheLatencyMs: number;
    withCacheLatencyMs: number;
    savedLatencyMs: number;
  };
  quality: AnalyzerQualityMetrics;
  assertions: BenchmarkAssertion[];
  sampleSnapshots: SentenceAnalyzerSnapshot[];
};

export type AnalyzerBenchmarkSkipped = {
  analyzerId: AnalyzerId;
  skipped: true;
  reason: string;
};

export type AnalyzerBenchmarkResult =
  | AnalyzerBenchmarkMetrics
  | AnalyzerBenchmarkSkipped;

export type NlpPerformanceBenchmarkRun = {
  schemaVersion: "v1";
  generatedAt: string;
  runtime: {
    userAgent: string;
    language: string;
    locationHref: string;
    timezone: string;
  };
  runOptions: {
    includeWinkNlp: boolean;
    inputProfile: NlpBenchmarkInputProfile;
  };
  workload: {
    hotSentenceSampleCount: number;
    smallBatchSize: number;
    mediumBatchSize: number;
  };
  fixtures: {
    profile: NlpBenchmarkInputProfile;
    syntheticSentenceCount: number;
    pageSentenceCount: number;
    cacheReplaySentenceCount: number;
    cacheReplayExpectedUniqueSentenceCount: number;
    qualityCaseCount: number;
    qualityCorpusVersion: string;
  };
  analyzerResults: AnalyzerBenchmarkResult[];
  assertions: BenchmarkAssertion[];
};
