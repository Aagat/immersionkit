import { describe, expect, it } from "vitest";

import { runNlpPerformanceSpikeBenchmark } from "../src/background/analysis-spike";

describe("background NLP performance benchmark runner", () => {
  it("produces benchmark metrics with passing integrity assertions", async () => {
    const result = await runNlpPerformanceSpikeBenchmark({
      includeWinkNlp: false
    });

    expect(result.schemaVersion).toBe("v1");
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
    expect(compromiseThreeResult.assertions.every((assertion) => assertion.pass)).toBe(
      true
    );
  });
});
