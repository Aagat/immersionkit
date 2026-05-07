import type {
  ContextChunkType,
  ContextualWordCandidate as DomainContextualWordCandidate,
  ObservedContextPos
} from "../../domain/models";
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

export const WORD_INJECTION_DECISIONS = ["inject", "skip"] as const;

export type WordInjectionExpectedOutcome =
  (typeof WORD_INJECTION_EXPECTED_OUTCOMES)[number];
export type WordInjectionDecision = (typeof WORD_INJECTION_DECISIONS)[number];

export type ContextualWordCandidate = DomainContextualWordCandidate & {
  expectedOutcome: WordInjectionExpectedOutcome;
  rationale: string;
};

export type WordInjectionDecisionCode =
  | "content-baseline-safe-pos"
  | "content-baseline-unsafe-pos"
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
