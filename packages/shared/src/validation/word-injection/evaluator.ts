import {
  evaluateContentBaselineDecision,
  evaluateContextAwareDecision
} from "../../scoring/word-injection";
import type {
  ContextualWordCandidate,
  WordInjectionCaseEvaluation,
  WordInjectionDecision,
  WordInjectionEvaluationSummary,
  WordInjectionExpectedOutcome,
  WordInjectionStrategyMetrics
} from "./types";

export { evaluateContentBaselineDecision, evaluateContextAwareDecision };

export function evaluateWordInjectionCorpus(
  candidates: ContextualWordCandidate[]
): WordInjectionEvaluationSummary {
  const perCase: WordInjectionCaseEvaluation[] = candidates.map((candidate) => {
    const baseline = evaluateContentBaselineDecision(candidate);
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

  const mustInjectCount = countOutcome(candidates, "must-inject");
  const mustSkipCount = countOutcome(candidates, "must-skip");
  const uncertainSkipCount = countOutcome(candidates, "uncertain-skip");

  return {
    totalCases: candidates.length,
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

    const expectedDecision = entry.expectedDecision;
    const isCorrect = decision.decision === expectedDecision;
    if (isCorrect) {
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

    if (expectedDecision === "skip" && decision.decision === "inject") {
      falsePositiveCaseIds.push(entry.candidate.id);
    }

    if (expectedDecision === "inject" && decision.decision === "skip") {
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

function countOutcome(
  candidates: ContextualWordCandidate[],
  expectedOutcome: WordInjectionExpectedOutcome
): number {
  return candidates.reduce(
    (count, candidate) => count + (candidate.expectedOutcome === expectedOutcome ? 1 : 0),
    0
  );
}

export function mapExpectedOutcomeToDecision(
  outcome: WordInjectionExpectedOutcome
): WordInjectionDecision {
  if (outcome === "must-inject") {
    return "inject";
  }

  return "skip";
}

function safeDivide(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }

  return numerator / denominator;
}
