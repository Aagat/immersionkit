import type { ContextualWordCandidate } from "../../../../packages/shared/src/validation/word-injection";

import corpusFixture from "../../../../fixtures/evals/word-injection/ambiguous-candidates.v1.json";
import expectedSnapshotFixture from "../../../../fixtures/evals/word-injection/expected-browser-results.v1.json";
import productionQualityFixture from "../../../../fixtures/evals/word-injection/production-quality-scenarios.v1.json";

export type BrowserExpectedPerCaseDecision = {
  baselineDecision: "inject" | "skip";
  contextAwareDecision: "inject" | "skip";
};

export type BrowserExpectedSnapshot = {
  version: string;
  corpusVersion: string;
  expectedTotals: {
    totalCases: number;
    mustInjectCount: number;
    mustSkipCount: number;
    uncertainSkipCount: number;
  };
  expectedMetrics: {
    baseline: {
      mustInjectCoverage: number;
      mustSkipPrecision: number;
      uncertainSkipRate: number;
      lowConfidenceSkipCount: number;
    };
    contextAware: {
      mustInjectCoverage: number;
      mustSkipPrecision: number;
      uncertainSkipRate: number;
      lowConfidenceSkipCount: number;
    };
  };
  expectedPerCaseDecisions: Record<string, BrowserExpectedPerCaseDecision>;
  expectedProductionQuality: BrowserExpectedProductionQualitySnapshot;
};

export type BrowserExpectedProductionQualitySnapshot = {
  scenarioVersion: string;
  totalCases: number;
  expectedInjectCount: number;
  expectedSkipCount: number;
  wrongSenseRenderedCount: number;
  missedExpectedInjectCount: number;
  wrongTargetCount: number;
  expectedPerCase: Record<
    string,
    {
      decision: "inject" | "skip";
      rendered: boolean;
      targetText?: string;
    }
  >;
};

export type ProductionQualityTokenSpec = [
  text: string,
  lemma: string,
  pos: string,
  tags: string[]
];

export type ProductionQualityRenderUnitSpec = {
  lexemeId: string;
  sourceLemma: string;
  targetLemma: string;
  pos: "noun" | "adjective" | "adverb";
};

export type ProductionQualityExpectedWordDecision = {
  id: string;
  lexemeId: string;
  renderUnitId?: string;
  normalizedText: string;
  expectedDecision: "inject" | "skip";
  expectedRendered: boolean;
  expectedTargetText?: string;
  rationale: string;
};

export type ProductionQualityScenario = {
  id: string;
  sentence: string;
  tokens: ProductionQualityTokenSpec[];
  chunks: Array<{
    text: string;
    normalized: string;
    type: "noun-phrase" | "verb-phrase" | "prepositional-phrase" | "adjective-phrase" | "adverb-phrase" | "unknown";
    tokenStart: number;
    tokenEnd: number;
    confidence: number;
  }>;
  renderUnits?: ProductionQualityRenderUnitSpec[];
  assetRenderUnitIds?: string[];
  expectedWordDecisions: ProductionQualityExpectedWordDecision[];
};

export type ProductionQualityScenarioFixture = {
  version: string;
  scenarios: ProductionQualityScenario[];
};

export const WORD_INJECTION_CORPUS_VERSION = corpusFixture.version;

export const WORD_INJECTION_CANDIDATES =
  corpusFixture.cases as unknown as ContextualWordCandidate[];

export const WORD_INJECTION_EXPECTED_BROWSER_RESULTS =
  expectedSnapshotFixture as unknown as BrowserExpectedSnapshot;

export const WORD_INJECTION_PRODUCTION_QUALITY_SCENARIOS =
  productionQualityFixture as unknown as ProductionQualityScenarioFixture;
