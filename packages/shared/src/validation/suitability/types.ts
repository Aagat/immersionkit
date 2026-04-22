export type SuitabilitySignals = {
  vocabularyFit: number;
  grammarFit: number;
  structuralSimplicity: number;
  dueTargetValue: number;
  ambiguityPenalty: number;
  chunkUsefulness: number;
  stretchDemand: number;
};

export type ProfileLabel = {
  knownWordCount: number;
  totalWordCount: number;
  label: number;
  rationale: string;
};

export type SuitabilitySentenceExample = {
  id: string;
  sentence: string;
  category: string;
  tags: string[];
  signals: SuitabilitySignals;
  profiles: Record<string, ProfileLabel>;
};

export type SuitabilityProfile = {
  id: string;
  displayName: string;
  description: string;
  stretchTolerance: number;
};

export type SuitabilityCorpus = {
  version: number;
  description: string;
  profiles: SuitabilityProfile[];
  sentences: SuitabilitySentenceExample[];
};

export type DifficultyBand = "core" | "stretch" | "defer";

export type PrototypeSignalContributions = {
  vocabularyFit: number;
  grammarFit: number;
  structuralSimplicity: number;
  dueTargetValue: number;
  chunkUsefulness: number;
  stretchAlignment: number;
  ambiguityPenalty: number;
};

export type PrototypeSuitabilityScore = {
  score: number;
  normalizedScore: number;
  stretchAlignment: number;
  difficultyBand: DifficultyBand;
  contributions: PrototypeSignalContributions;
};

export type SuitabilityRow = {
  id: string;
  sentence: string;
  category: string;
  goldLabel: number;
  rationale: string;
  baselineKnownRatio: number;
  prototypeScore: PrototypeSuitabilityScore;
};

export type RankingMetrics = {
  ndcgAt5: number;
  ndcgAt10: number;
  pairwiseAccuracy: number;
  spearmanRho: number;
  precisionAt5: number;
};

export type RankErrorDelta = {
  id: string;
  sentence: string;
  category: string;
  goldLabel: number;
  baselineRank: number;
  prototypeRank: number;
  deltaAbsoluteError: number;
};

export type ProfileComparisonResult = {
  profileId: string;
  profileDisplayName: string;
  baselineMetrics: RankingMetrics;
  prototypeMetrics: RankingMetrics;
  deltas: RankingMetrics;
  rows: SuitabilityRow[];
  baselineOrder: string[];
  prototypeOrder: string[];
  strongestImprovements: RankErrorDelta[];
  strongestRegressions: RankErrorDelta[];
};
