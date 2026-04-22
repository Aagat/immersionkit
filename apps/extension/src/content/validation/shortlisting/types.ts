import type { SeedLexiconEntry, VocabStatus } from "@immersionkit/shared";

export type ShortlistingPolicyId =
  | "analyze-every-segmented"
  | "current-injected-token-gated"
  | "injected-token-length-dedupe"
  | "phrase-aware-shortlist";

export type SentenceShortlistingPolicySummary = {
  policyId: ShortlistingPolicyId;
  policyLabel: string;
  shortlistedCandidates: number;
  uniqueSentenceHashes: number;
  estimatedAnalysisCalls: number;
  estimatedAnalysisCallsSaved: number;
  estimatedAnalysisCallsSavedRatio: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
  falseNegativeCount: number;
  falseNegatives: string[];
};

export type SentenceShortlistingScenarioPass = {
  id: string;
  label: string;
  html: string;
  usefulSentences?: readonly string[];
};

export type SentenceShortlistingScenario = {
  id: string;
  label: string;
  source: string;
  urlPath: string;
  passes: readonly SentenceShortlistingScenarioPass[];
};

export type SentenceShortlistingScenarioSummary = {
  scenarioId: string;
  scenarioLabel: string;
  source: string;
  eligibleTextNodes: number;
  segmentedSentences: number;
  segmentedSentencesLengthFiltered: number;
  uniqueSegmentedSentenceHashes: number;
  usefulSentenceCount: number;
  policySummaries: SentenceShortlistingPolicySummary[];
};

export type SentenceShortlistingAssertion = {
  id: string;
  passed: boolean;
  message: string;
};

export type SentenceShortlistingBenchmarkResult = {
  policies: SentenceShortlistingPolicySummary[];
  scenarios: SentenceShortlistingScenarioSummary[];
  assertions: SentenceShortlistingAssertion[];
};

export type SentenceShortlistingBenchmarkInput = {
  document: Document;
  scenarios: readonly SentenceShortlistingScenario[];
  lexicon: readonly SeedLexiconEntry[];
  vocabByLemmaId: ReadonlyMap<string, VocabStatus> | Record<string, VocabStatus>;
  discoveryRate: number;
  goldilocksThreshold: number;
  phraseHints: readonly string[];
  maxShortlistSize?: number;
};

export type SentenceObservation = {
  text: string;
  hash: string;
  wordCount: number;
  words: string[];
  start: number;
  end: number;
  containsPhraseHint: boolean;
};
