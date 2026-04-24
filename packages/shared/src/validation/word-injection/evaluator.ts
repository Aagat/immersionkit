import { SAFE_INJECTION_POS_VALUES } from "../../domain/models";
import type { ContextualWordCandidate as DomainContextualWordCandidate } from "../../domain/models";
import { CONTEXTUAL_AMBIGUITY_RULES } from "./rules";
import type {
  ContextualWordCandidate,
  WordInjectionCaseEvaluation,
  WordInjectionDecision,
  WordInjectionDecisionResult,
  WordInjectionEvaluationSummary,
  WordInjectionExpectedOutcome,
  WordInjectionStrategyMetrics
} from "./types";

const SAFE_INJECTABLE_POS = new Set(SAFE_INJECTION_POS_VALUES);

export function evaluateLemmaOnlyDecision(
  candidate: DomainContextualWordCandidate
): WordInjectionDecisionResult {
  if (!SAFE_INJECTABLE_POS.has(candidate.candidatePos)) {
    return {
      decision: "skip",
      code: "lemma-only-unsafe-pos",
      reason: `Lemma-only lookup rejects ${candidate.candidatePos} outside the safe POS set.`
    };
  }

  return {
    decision: "inject",
    code: "lemma-only-safe-pos",
    reason: `Lemma-only lookup injects ${candidate.candidateLemma} because ${candidate.candidatePos} is in the safe POS set.`
  };
}

export function evaluateContextAwareDecision(
  candidate: DomainContextualWordCandidate
): WordInjectionDecisionResult {
  const rule = CONTEXTUAL_AMBIGUITY_RULES.get(candidate.ambiguityGroup);
  if (!rule) {
    return {
      decision: "skip",
      code: "group-not-in-inventory",
      reason: `No ambiguity rule exists for ${candidate.ambiguityGroup}, so the candidate is skipped by default.`
    };
  }

  const confidence = clampUnitInterval(candidate.confidence);
  if (confidence < rule.minimumConfidence) {
    return {
      decision: "skip",
      code: "low-confidence",
      reason: `Confidence ${confidence.toFixed(2)} is below ${rule.minimumConfidence.toFixed(2)}.`
    };
  }

  if (rule.blockedObservedPos.has(candidate.observedPos)) {
    return {
      decision: "skip",
      code: "blocked-observed-pos",
      reason: `Observed POS ${candidate.observedPos} is blocked for ${candidate.ambiguityGroup}.`
    };
  }

  const blockedSignature = candidate.nearbyContextSignature.find((signature) =>
    rule.blockedContextEvidence.has(signature)
  );
  if (blockedSignature) {
    return {
      decision: "skip",
      code: "blocked-context-signature",
      reason: `Context signature ${blockedSignature} is blocked for ${candidate.ambiguityGroup}.`
    };
  }

  if (!rule.allowedObservedPos.has(candidate.observedPos)) {
    return {
      decision: "skip",
      code: "insufficient-context-evidence",
      reason: `Observed POS ${candidate.observedPos} is not in the allowed set for ${candidate.ambiguityGroup}.`
    };
  }

  if (!rule.allowedChunkTypes.has(candidate.chunkType)) {
    return {
      decision: "skip",
      code: "insufficient-context-evidence",
      reason: `Chunk type ${candidate.chunkType} is not allowed for ${candidate.ambiguityGroup}.`
    };
  }

  const hasRequiredEvidence = candidate.nearbyContextSignature.some((signature) =>
    rule.requiredContextEvidence.has(signature)
  );

  if (!hasRequiredEvidence) {
    return {
      decision: "skip",
      code: "insufficient-context-evidence",
      reason: `No required context signature was present for ${candidate.ambiguityGroup}.`
    };
  }

  return {
    decision: "inject",
    code: "context-evidence-accepted",
    reason: `Context evidence and confidence meet the ${candidate.ambiguityGroup} injection rule.`
  };
}

export function evaluateWordInjectionCorpus(
  candidates: ContextualWordCandidate[]
): WordInjectionEvaluationSummary {
  const perCase: WordInjectionCaseEvaluation[] = candidates.map((candidate) => {
    const baseline = evaluateLemmaOnlyDecision(candidate);
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

function clampUnitInterval(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}
