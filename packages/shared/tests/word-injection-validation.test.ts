import { describe, expect, it } from "vitest";

import ambiguousCandidatesFixture from "../../fixtures/evals/word-injection/ambiguous-candidates.v1.json";
import {
  CONTEXTUAL_AMBIGUITY_RULES,
  INITIAL_AMBIGUOUS_WORD_INVENTORY,
  evaluateContextAwareDecision,
  evaluateContentBaselineDecision,
  evaluateWordInjectionCorpus,
  mapExpectedOutcomeToDecision,
  type ContextualWordCandidate
} from "../src/validation/word-injection";

const CANDIDATES =
  ambiguousCandidatesFixture.cases as unknown as ContextualWordCandidate[];

describe("word injection ambiguity inventory", () => {
  it("covers the first-pass ambiguous word set", () => {
    expect(INITIAL_AMBIGUOUS_WORD_INVENTORY).toEqual([
      "can",
      "watch",
      "light",
      "right",
      "plant"
    ]);

    expect(Array.from(CONTEXTUAL_AMBIGUITY_RULES.keys())).toEqual([
      "can_modal_vs_noun",
      "watch_verb_vs_noun",
      "light_adjective_vs_noun",
      "right_adjective_vs_adverb_or_noun",
      "plant_verb_vs_noun"
    ]);
  });

  it("maps corpus expectation labels to evaluator decisions", () => {
    expect(mapExpectedOutcomeToDecision("must-inject")).toBe("inject");
    expect(mapExpectedOutcomeToDecision("must-skip")).toBe("skip");
    expect(mapExpectedOutcomeToDecision("uncertain-skip")).toBe("skip");
  });
});

describe("word injection decision behavior", () => {
  it("keeps baseline content behavior for ambiguous forms", () => {
    const modalCan = CANDIDATES.find((candidate) => candidate.id === "can-03");
    expect(modalCan).toBeTruthy();

    const decision = evaluateContentBaselineDecision(modalCan as ContextualWordCandidate);

    expect(decision.decision).toBe("inject");
    expect(decision.code).toBe("content-baseline-safe-pos");
  });

  it("suppresses wrong-sense cases when context or confidence is unsafe", () => {
    const modalCan = CANDIDATES.find((candidate) => candidate.id === "can-03");
    const uncertainRight = CANDIDATES.find((candidate) => candidate.id === "right-06");

    expect(modalCan).toBeTruthy();
    expect(uncertainRight).toBeTruthy();

    const modalDecision = evaluateContextAwareDecision(
      modalCan as ContextualWordCandidate
    );
    const lowConfidenceDecision = evaluateContextAwareDecision(
      uncertainRight as ContextualWordCandidate
    );

    expect(modalDecision).toMatchObject({
      decision: "skip",
      code: "blocked-observed-pos"
    });

    expect(lowConfidenceDecision).toMatchObject({
      decision: "skip",
      code: "low-confidence"
    });
  });
});

describe("word injection corpus metrics", () => {
  it("shows precision lift on must-skip cases with bounded must-inject coverage cost", () => {
    const summary = evaluateWordInjectionCorpus(CANDIDATES);

    expect(summary.totalCases).toBe(30);
    expect(summary.mustInjectCount).toBe(14);
    expect(summary.mustSkipCount).toBe(11);
    expect(summary.uncertainSkipCount).toBe(5);

    expect(summary.baseline.accuracy).toBeCloseTo(14 / 30, 6);
    expect(summary.baseline.mustInjectCoverage).toBe(1);
    expect(summary.baseline.mustSkipPrecision).toBe(0);
    expect(summary.baseline.uncertainSkipRate).toBe(0);

    expect(summary.contextAware.accuracy).toBeCloseTo(29 / 30, 6);
    expect(summary.contextAware.mustInjectCoverage).toBeCloseTo(13 / 14, 6);
    expect(summary.contextAware.mustSkipPrecision).toBe(1);
    expect(summary.contextAware.uncertainSkipRate).toBe(1);
    expect(summary.contextAware.lowConfidenceSkipCount).toBe(6);
    expect(summary.contextAware.lowConfidenceSkipRateAmongSkips).toBeCloseTo(6 / 17, 6);
    expect(summary.contextAware.lowConfidenceSkipRateOverall).toBeCloseTo(6 / 30, 6);

    expect(summary.baseline.falsePositiveCaseIds).toHaveLength(16);
    expect(summary.baseline.falseNegativeCaseIds).toHaveLength(0);
    expect(summary.contextAware.falsePositiveCaseIds).toHaveLength(0);
    expect(summary.contextAware.falseNegativeCaseIds).toEqual(["plant-06"]);
  });
});
