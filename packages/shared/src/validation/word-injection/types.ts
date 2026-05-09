import type { ContextualWordCandidate as DomainContextualWordCandidate } from "../../domain/models";
import type {
  WordInjectionDecision,
  WordInjectionDecisionResult
} from "../../scoring/word-injection";
export { WORD_INJECTION_DECISIONS } from "../../scoring/word-injection";
export type {
  ContextualAmbiguityRule,
  WordInjectionDecision,
  WordInjectionDecisionCode,
  WordInjectionDecisionResult
} from "../../scoring/word-injection";
export {
  CONTEXT_CHUNK_TYPES,
  OBSERVED_CONTEXT_POS_VALUES
} from "../../domain/models";
export type { ContextChunkType, ObservedContextPos } from "../../domain/models";

export const WORD_INJECTION_EXPECTED_OUTCOMES = [
  "must-inject",
  "must-skip",
  "uncertain-skip"
] as const;

export type WordInjectionExpectedOutcome =
  (typeof WORD_INJECTION_EXPECTED_OUTCOMES)[number];

export type ContextualWordCandidate = DomainContextualWordCandidate & {
  expectedOutcome: WordInjectionExpectedOutcome;
  rationale: string;
};

export type WordInjectionCaseEvaluation = {
  candidate: ContextualWordCandidate;
  expectedDecision: WordInjectionDecision;
  baseline: WordInjectionDecisionResult;
  contextAware: WordInjectionDecisionResult;
  baselineCorrect: boolean;
  contextAwareCorrect: boolean;
};

export type WordInjectionStrategyMetrics = {
  name: "baseline" | "context-aware";
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
  contextAware: WordInjectionStrategyMetrics;
};

export type WordInjectionLibraryImplementationId =
  | "shared-annotated"
  | "compromise-three"
  | "wink-nlp";

export type WordInjectionLibraryFeatureAgreement = {
  caseCount: number;
  observedPosMatchRate: number;
  chunkTypeMatchRate: number;
  exactSignatureMatchRate: number;
};

export type WordInjectionLibraryComparison = {
  implementationId: WordInjectionLibraryImplementationId;
  label: string;
  inputMode: "fixture-annotated" | "library-derived";
  runtime: {
    totalMs: number;
    averageCaseMs: number;
    casesPerSecond: number;
    repeatCount: number;
  };
  featureAgreement: WordInjectionLibraryFeatureAgreement;
  summary: WordInjectionEvaluationSummary;
};
