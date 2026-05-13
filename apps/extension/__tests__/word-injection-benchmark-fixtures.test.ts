import { describe, expect, it } from "vitest";

import { runProductionQualityValidation } from "../src/validation/run-word-injection-production-quality";

describe("word injection benchmark production quality fixtures", () => {
  it("matches the refactor-aligned production decision and rendering expectations", async () => {
    const summary = await runProductionQualityValidation();

    expect(summary.totalScenarios).toBe(5);
    expect(summary.totalCases).toBe(7);
    expect(summary.expectedInjectCount).toBe(2);
    expect(summary.expectedSkipCount).toBe(5);
    expect(summary.decisionAccuracy).toBe(1);
    expect(summary.wrongSenseRenderedCaseIds).toEqual([]);
    expect(summary.missedExpectedInjectCaseIds).toEqual([]);
    expect(summary.wrongTargetCaseIds).toEqual([]);
    expect(summary.perCase).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "stable-adjective-safe",
          actualDecision: "inject",
          rendered: true,
          renderedTargetText: "estable"
        }),
        expect.objectContaining({
          id: "time-duration-tiempo",
          actualDecision: "inject",
          rendered: true,
          renderedTargetText: "tiempo"
        })
      ])
    );
  });
});
