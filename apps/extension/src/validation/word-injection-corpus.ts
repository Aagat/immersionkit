import type { ContextualWordCandidate } from "../../../../packages/shared/src/validation/word-injection";

import corpusFixture from "../../../../fixtures/evals/word-injection/ambiguous-candidates.v1.json";
import expectedSnapshotFixture from "../../../../fixtures/evals/word-injection/expected-browser-results.v1.json";

export type BrowserExpectedPerCaseDecision = {
  baselineDecision: "inject" | "skip";
  prototypeDecision: "inject" | "skip";
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
    prototype: {
      mustInjectCoverage: number;
      mustSkipPrecision: number;
      uncertainSkipRate: number;
      lowConfidenceSkipCount: number;
    };
  };
  expectedPerCaseDecisions: Record<string, BrowserExpectedPerCaseDecision>;
};

export const WORD_INJECTION_CORPUS_VERSION = corpusFixture.version;

export const WORD_INJECTION_CANDIDATES =
  corpusFixture.cases as unknown as ContextualWordCandidate[];

export const WORD_INJECTION_EXPECTED_BROWSER_RESULTS =
  expectedSnapshotFixture as unknown as BrowserExpectedSnapshot;
