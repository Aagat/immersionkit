import { normalizeToken } from "@immersionkit/shared";
import {
  evaluateContextAwareDecision,
  mapExpectedOutcomeToDecision,
  runWordInjectionLibraryComparisons,
  type ContextualWordCandidate,
  type WordInjectionLibraryComparison,
  type WordInjectionCaseEvaluation,
  type WordInjectionEvaluationSummary,
  type WordInjectionExpectedOutcome,
  type WordInjectionStrategyMetrics
} from "../../../../packages/shared/src/validation/word-injection";

import {
  WORD_INJECTION_CANDIDATES,
  WORD_INJECTION_CORPUS_VERSION,
  WORD_INJECTION_EXPECTED_BROWSER_RESULTS,
  type BrowserExpectedSnapshot
} from "./word-injection-corpus";
import {
  runContentBaseline,
  type BrowserBaselineDecision
} from "./run-word-injection-baseline";
import {
  runProductionQualityValidation,
  type ProductionQualitySummary
} from "./run-word-injection-production-quality";

export type BrowserValidationChecks = {
  pass: boolean;
  mismatches: string[];
};

export type BrowserWordInjectionValidationResult = {
  generatedAt: string;
  browserUserAgent: string;
  corpusVersion: string;
  summary: WordInjectionEvaluationSummary;
  productionQuality: ProductionQualitySummary;
  checks: BrowserValidationChecks;
  comparisons: WordInjectionLibraryComparison[];
};

export async function runWordInjectionValidation(): Promise<BrowserWordInjectionValidationResult> {
  const baselineById = new Map<string, BrowserBaselineDecision>(
    runContentBaseline(WORD_INJECTION_CANDIDATES).map((decision) => [
      decision.id,
      decision
    ])
  );

  const perCase: WordInjectionCaseEvaluation[] = WORD_INJECTION_CANDIDATES.map((candidate) => {
    const baseline = baselineById.get(candidate.id);
    if (!baseline) {
      throw new Error(`Missing baseline decision for case ${candidate.id}`);
    }

    const prototype = evaluateContextAwareDecision(candidate);
    const expectedDecision = mapExpectedOutcomeToDecision(candidate.expectedOutcome);

    return {
      candidate,
      expectedDecision,
      baseline,
      prototype,
      baselineCorrect: baseline.decision === expectedDecision,
      prototypeCorrect: prototype.decision === expectedDecision
    };
  });

  const summary = summarize(perCase, WORD_INJECTION_CANDIDATES);
  const productionQuality = await runProductionQualityValidation();
  const checks = validateAgainstExpectedSnapshot(
    summary,
    productionQuality,
    WORD_INJECTION_EXPECTED_BROWSER_RESULTS
  );
  const comparisons = await runWordInjectionLibraryComparisons(WORD_INJECTION_CANDIDATES);

  return {
    generatedAt: new Date().toISOString(),
    browserUserAgent: navigator.userAgent,
    corpusVersion: WORD_INJECTION_CORPUS_VERSION,
    summary,
    productionQuality,
    checks,
    comparisons
  };
}

function summarize(
  perCase: WordInjectionCaseEvaluation[],
  candidates: ContextualWordCandidate[]
): WordInjectionEvaluationSummary {
  const mustInjectCount = countOutcome(candidates, "must-inject");
  const mustSkipCount = countOutcome(candidates, "must-skip");
  const uncertainSkipCount = countOutcome(candidates, "uncertain-skip");

  return {
    totalCases: perCase.length,
    mustInjectCount,
    mustSkipCount,
    uncertainSkipCount,
    perCase,
    baseline: summarizeStrategy(
      "baseline",
      perCase,
      mustInjectCount,
      mustSkipCount,
      uncertainSkipCount
    ),
    prototype: summarizeStrategy(
      "prototype",
      perCase,
      mustInjectCount,
      mustSkipCount,
      uncertainSkipCount
    )
  };
}

function summarizeStrategy(
  name: "baseline" | "prototype",
  perCase: WordInjectionCaseEvaluation[],
  mustInjectCount: number,
  mustSkipCount: number,
  uncertainSkipCount: number
): WordInjectionStrategyMetrics {
  const decisions = perCase.map((entry) =>
    name === "baseline" ? entry.baseline : entry.prototype
  );

  let correctCases = 0;
  let mustInjectCorrect = 0;
  let mustSkipCorrect = 0;
  let uncertainSkipCorrect = 0;
  let totalSkips = 0;
  let lowConfidenceSkipCount = 0;

  const falsePositiveCaseIds: string[] = [];
  const falseNegativeCaseIds: string[] = [];

  perCase.forEach((entry, index) => {
    const decision = decisions[index];

    if (decision.decision === "skip") {
      totalSkips += 1;
      if (decision.code === "low-confidence") {
        lowConfidenceSkipCount += 1;
      }
    }

    const expected = entry.expectedDecision;
    if (decision.decision === expected) {
      correctCases += 1;
    }

    if (entry.candidate.expectedOutcome === "must-inject" && decision.decision === "inject") {
      mustInjectCorrect += 1;
    }

    if (entry.candidate.expectedOutcome === "must-skip" && decision.decision === "skip") {
      mustSkipCorrect += 1;
    }

    if (
      entry.candidate.expectedOutcome === "uncertain-skip" &&
      decision.decision === "skip"
    ) {
      uncertainSkipCorrect += 1;
    }

    if (expected === "skip" && decision.decision === "inject") {
      falsePositiveCaseIds.push(entry.candidate.id);
    }

    if (expected === "inject" && decision.decision === "skip") {
      falseNegativeCaseIds.push(entry.candidate.id);
    }
  });

  return {
    name,
    totalCases: perCase.length,
    correctCases,
    accuracy: safeDivide(correctCases, perCase.length),
    mustInjectCoverage: safeDivide(mustInjectCorrect, mustInjectCount),
    mustSkipPrecision: safeDivide(mustSkipCorrect, mustSkipCount),
    uncertainSkipRate: safeDivide(uncertainSkipCorrect, uncertainSkipCount),
    lowConfidenceSkipCount,
    lowConfidenceSkipRateAmongSkips: safeDivide(lowConfidenceSkipCount, totalSkips),
    lowConfidenceSkipRateOverall: safeDivide(lowConfidenceSkipCount, perCase.length),
    falsePositiveCaseIds,
    falseNegativeCaseIds
  };
}

function validateAgainstExpectedSnapshot(
  summary: WordInjectionEvaluationSummary,
  productionQuality: ProductionQualitySummary,
  expected: BrowserExpectedSnapshot
): BrowserValidationChecks {
  const mismatches: string[] = [];

  if (summary.totalCases !== expected.expectedTotals.totalCases) {
    mismatches.push(
      `totalCases expected ${expected.expectedTotals.totalCases}, got ${summary.totalCases}`
    );
  }

  if (summary.mustInjectCount !== expected.expectedTotals.mustInjectCount) {
    mismatches.push(
      `mustInjectCount expected ${expected.expectedTotals.mustInjectCount}, got ${summary.mustInjectCount}`
    );
  }

  if (summary.mustSkipCount !== expected.expectedTotals.mustSkipCount) {
    mismatches.push(
      `mustSkipCount expected ${expected.expectedTotals.mustSkipCount}, got ${summary.mustSkipCount}`
    );
  }

  if (summary.uncertainSkipCount !== expected.expectedTotals.uncertainSkipCount) {
    mismatches.push(
      `uncertainSkipCount expected ${expected.expectedTotals.uncertainSkipCount}, got ${summary.uncertainSkipCount}`
    );
  }

  assertMetric(
    mismatches,
    "baseline.mustInjectCoverage",
    summary.baseline.mustInjectCoverage,
    expected.expectedMetrics.baseline.mustInjectCoverage
  );
  assertMetric(
    mismatches,
    "baseline.mustSkipPrecision",
    summary.baseline.mustSkipPrecision,
    expected.expectedMetrics.baseline.mustSkipPrecision
  );
  assertMetric(
    mismatches,
    "baseline.uncertainSkipRate",
    summary.baseline.uncertainSkipRate,
    expected.expectedMetrics.baseline.uncertainSkipRate
  );
  assertMetric(
    mismatches,
    "prototype.mustInjectCoverage",
    summary.prototype.mustInjectCoverage,
    expected.expectedMetrics.prototype.mustInjectCoverage
  );
  assertMetric(
    mismatches,
    "prototype.mustSkipPrecision",
    summary.prototype.mustSkipPrecision,
    expected.expectedMetrics.prototype.mustSkipPrecision
  );
  assertMetric(
    mismatches,
    "prototype.uncertainSkipRate",
    summary.prototype.uncertainSkipRate,
    expected.expectedMetrics.prototype.uncertainSkipRate
  );

  if (
    summary.baseline.lowConfidenceSkipCount !==
    expected.expectedMetrics.baseline.lowConfidenceSkipCount
  ) {
    mismatches.push(
      `baseline.lowConfidenceSkipCount expected ${expected.expectedMetrics.baseline.lowConfidenceSkipCount}, got ${summary.baseline.lowConfidenceSkipCount}`
    );
  }

  if (
    summary.prototype.lowConfidenceSkipCount !==
    expected.expectedMetrics.prototype.lowConfidenceSkipCount
  ) {
    mismatches.push(
      `prototype.lowConfidenceSkipCount expected ${expected.expectedMetrics.prototype.lowConfidenceSkipCount}, got ${summary.prototype.lowConfidenceSkipCount}`
    );
  }

  for (const entry of summary.perCase) {
    const expectedCase = expected.expectedPerCaseDecisions[entry.candidate.id];
    if (!expectedCase) {
      mismatches.push(`Missing expected snapshot for case ${entry.candidate.id}`);
      continue;
    }

    if (entry.baseline.decision !== expectedCase.baselineDecision) {
      mismatches.push(
        `${entry.candidate.id} baseline expected ${expectedCase.baselineDecision}, got ${entry.baseline.decision}`
      );
    }

    if (entry.prototype.decision !== expectedCase.prototypeDecision) {
      mismatches.push(
        `${entry.candidate.id} prototype expected ${expectedCase.prototypeDecision}, got ${entry.prototype.decision}`
      );
    }
  }

  validateProductionQualityAgainstExpectedSnapshot(
    mismatches,
    productionQuality,
    expected
  );

  return {
    pass: mismatches.length === 0,
    mismatches
  };
}

function validateProductionQualityAgainstExpectedSnapshot(
  mismatches: string[],
  productionQuality: ProductionQualitySummary,
  expected: BrowserExpectedSnapshot
) {
  const expectedQuality = expected.expectedProductionQuality;
  if (productionQuality.scenarioVersion !== expectedQuality.scenarioVersion) {
    mismatches.push(
      `productionQuality.scenarioVersion expected ${expectedQuality.scenarioVersion}, got ${productionQuality.scenarioVersion}`
    );
  }

  if (productionQuality.totalCases !== expectedQuality.totalCases) {
    mismatches.push(
      `productionQuality.totalCases expected ${expectedQuality.totalCases}, got ${productionQuality.totalCases}`
    );
  }

  if (productionQuality.expectedInjectCount !== expectedQuality.expectedInjectCount) {
    mismatches.push(
      `productionQuality.expectedInjectCount expected ${expectedQuality.expectedInjectCount}, got ${productionQuality.expectedInjectCount}`
    );
  }

  if (productionQuality.expectedSkipCount !== expectedQuality.expectedSkipCount) {
    mismatches.push(
      `productionQuality.expectedSkipCount expected ${expectedQuality.expectedSkipCount}, got ${productionQuality.expectedSkipCount}`
    );
  }

  if (
    productionQuality.wrongSenseRenderedCaseIds.length !==
    expectedQuality.wrongSenseRenderedCount
  ) {
    mismatches.push(
      `productionQuality.wrongSenseRenderedCount expected ${expectedQuality.wrongSenseRenderedCount}, got ${productionQuality.wrongSenseRenderedCaseIds.length}`
    );
  }

  if (
    productionQuality.missedExpectedInjectCaseIds.length !==
    expectedQuality.missedExpectedInjectCount
  ) {
    mismatches.push(
      `productionQuality.missedExpectedInjectCount expected ${expectedQuality.missedExpectedInjectCount}, got ${productionQuality.missedExpectedInjectCaseIds.length}`
    );
  }

  if (productionQuality.wrongTargetCaseIds.length !== expectedQuality.wrongTargetCount) {
    mismatches.push(
      `productionQuality.wrongTargetCount expected ${expectedQuality.wrongTargetCount}, got ${productionQuality.wrongTargetCaseIds.length}`
    );
  }

  for (const entry of productionQuality.perCase) {
    const expectedCase = expectedQuality.expectedPerCase[entry.id];
    if (!expectedCase) {
      mismatches.push(`Missing production quality snapshot for case ${entry.id}`);
      continue;
    }

    if (entry.actualDecision !== expectedCase.decision) {
      mismatches.push(
        `${entry.id} production decision expected ${expectedCase.decision}, got ${entry.actualDecision}`
      );
    }

    if (entry.rendered !== expectedCase.rendered) {
      mismatches.push(
        `${entry.id} production render expected ${String(expectedCase.rendered)}, got ${String(entry.rendered)}`
      );
    }

    if (
      expectedCase.targetText &&
      normalizeToken(entry.renderedTargetText ?? "") !== normalizeToken(expectedCase.targetText)
    ) {
      mismatches.push(
        `${entry.id} production target expected ${expectedCase.targetText}, got ${entry.renderedTargetText ?? "(none)"}`
      );
    }
  }
}

function assertMetric(
  mismatches: string[],
  label: string,
  actual: number,
  expected: number
) {
  const delta = Math.abs(actual - expected);
  if (delta > 0.000001) {
    mismatches.push(`${label} expected ${expected.toFixed(6)}, got ${actual.toFixed(6)}`);
  }
}

function countOutcome(
  candidates: ContextualWordCandidate[],
  expectedOutcome: WordInjectionExpectedOutcome
): number {
  return candidates.reduce(
    (count, candidate) => count + (candidate.expectedOutcome === expectedOutcome ? 1 : 0),
    0
  );
}

function safeDivide(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }

  return numerator / denominator;
}
