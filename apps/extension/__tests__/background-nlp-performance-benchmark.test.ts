import { describe, expect, it } from "vitest";

import { runNlpAnalyzerPerformanceBenchmark } from "../src/background/analyzer-performance";

describe("background NLP performance benchmark runner", () => {
  it("produces benchmark metrics with passing integrity assertions", async () => {
    const result = await runNlpAnalyzerPerformanceBenchmark({
      includeWinkNlp: false,
      inputProfile: "tiny"
    });

    expect(result.schemaVersion).toBe("v1");
    expect(result.runOptions.inputProfile).toBe("tiny");
    expect(result.workload.hotSentenceSampleCount).toBeGreaterThan(0);
    expect(result.assertions.every((assertion) => assertion.pass)).toBe(true);

    const compromiseThreeResult = result.analyzerResults.find(
      (entry) => entry.analyzerId === "compromise-three"
    );

    expect(compromiseThreeResult).toBeDefined();

    if (!compromiseThreeResult || "skipped" in compromiseThreeResult) {
      throw new Error("Expected compromise-three benchmark result to execute.");
    }

    expect(compromiseThreeResult.coldStartLatencyMs).toBeGreaterThan(0);
    expect(compromiseThreeResult.hotPerSentenceLatencyMs).toBeGreaterThan(0);
    expect(compromiseThreeResult.payload.averageBytesPerSentence).toBeGreaterThan(50);
    expect(compromiseThreeResult.sampleSnapshots.length).toBeGreaterThan(0);
    expect(compromiseThreeResult.quality.caseCount).toBeGreaterThan(0);
    expect(compromiseThreeResult.quality.averageTokenCoverage).toBeGreaterThan(0.4);
    expect(compromiseThreeResult.quality.evaluatedPhraseCaseCount).toBeGreaterThan(0);
    expect(compromiseThreeResult.assertions.every((assertion) => assertion.pass)).toBe(
      true
    );
  });

  it("evaluates compromise and wink analyzers against labeled truth when wink is enabled", async () => {
    const result = await runNlpAnalyzerPerformanceBenchmark({
      includeWinkNlp: true,
      inputProfile: "tiny"
    });

    expect(result.assertions.every((assertion) => assertion.pass)).toBe(true);

    const compromiseResult = result.analyzerResults.find(
      (entry) => entry.analyzerId === "compromise-three"
    );
    const winkResult = result.analyzerResults.find(
      (entry) => entry.analyzerId === "wink-nlp"
    );

    if (!compromiseResult || "skipped" in compromiseResult) {
      throw new Error("Expected compromise analyzer benchmark result to execute.");
    }

    if (!winkResult || "skipped" in winkResult) {
      throw new Error("Expected wink benchmark result to execute.");
    }

    expect(compromiseResult.quality.caseCount).toBeGreaterThan(0);
    expect(winkResult.quality.caseCount).toBeGreaterThan(0);
    expect(compromiseResult.quality.phraseTruePositiveCount).toBeGreaterThanOrEqual(0);
    expect(winkResult.quality.phraseTruePositiveCount).toBeGreaterThanOrEqual(0);
  });
});
