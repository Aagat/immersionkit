import type { SafeInjectionPos } from "../../domain/models";

export const WORD_INJECTION_EXPECTED_OUTCOMES = [
  "must-inject",
  "must-skip",
  "uncertain-skip"
] as const;

export const WORD_INJECTION_DECISIONS = ["inject", "skip"] as const;

export const OBSERVED_CONTEXT_POS_VALUES = [
  "noun",
  "verb",
  "adjective",
  "adverb",
  "modal",
  "auxiliary",
  "interjection",
  "other"
] as const;

export const CONTEXT_CHUNK_TYPES = [
  "noun-phrase",
  "verb-phrase",
  "adjective-phrase",
  "adverb-phrase",
  "idiom",
  "fragment",
  "other"
] as const;

export type WordInjectionExpectedOutcome =
  (typeof WORD_INJECTION_EXPECTED_OUTCOMES)[number];
export type WordInjectionDecision = (typeof WORD_INJECTION_DECISIONS)[number];
export type ObservedContextPos = (typeof OBSERVED_CONTEXT_POS_VALUES)[number];
export type ContextChunkType = (typeof CONTEXT_CHUNK_TYPES)[number];

export type ContextualWordCandidate = {
  id: string;
  sentence: string;
  tokenText: string;
  targetLemma: string;
  candidateLemma: string;
  candidatePos: SafeInjectionPos;
  observedPos: ObservedContextPos;
  chunkType: ContextChunkType;
  nearbyContextSignature: string[];
  ambiguityGroup: string;
  confidence: number;
  expectedOutcome: WordInjectionExpectedOutcome;
  rationale: string;
};

export type WordInjectionDecisionCode =
  | "lemma-only-safe-pos"
  | "lemma-only-unsafe-pos"
  | "group-not-in-inventory"
  | "low-confidence"
  | "blocked-observed-pos"
  | "blocked-context-signature"
  | "insufficient-context-evidence"
  | "context-evidence-accepted";

export type WordInjectionDecisionResult = {
  decision: WordInjectionDecision;
  code: WordInjectionDecisionCode;
  reason: string;
};

export type ContextualAmbiguityRule = {
  ambiguityGroup: string;
  minimumConfidence: number;
  allowedObservedPos: ReadonlySet<ObservedContextPos>;
  blockedObservedPos: ReadonlySet<ObservedContextPos>;
  allowedChunkTypes: ReadonlySet<ContextChunkType>;
  requiredContextEvidence: ReadonlySet<string>;
  blockedContextEvidence: ReadonlySet<string>;
};

export type WordInjectionCaseEvaluation = {
  candidate: ContextualWordCandidate;
  expectedDecision: WordInjectionDecision;
  baseline: WordInjectionDecisionResult;
  prototype: WordInjectionDecisionResult;
  baselineCorrect: boolean;
  prototypeCorrect: boolean;
};

export type WordInjectionStrategyMetrics = {
  name: "baseline" | "prototype";
  totalCases: number;
  correctCases: number;
  accuracy: number;
  mustInjectCoverage: number;
  mustSkipPrecision: number;
  uncertainSkipRate: number;
  lowConfidenceSkipCount: number;
  lowConfidenceSkipRateAmongSkips: number;
  lowConfidenceSkipRateOverall: number;
  falsePositiveCaseIds: string[];
  falseNegativeCaseIds: string[];
};

export type WordInjectionEvaluationSummary = {
  totalCases: number;
  mustInjectCount: number;
  mustSkipCount: number;
  uncertainSkipCount: number;
  perCase: WordInjectionCaseEvaluation[];
  baseline: WordInjectionStrategyMetrics;
  prototype: WordInjectionStrategyMetrics;
};
