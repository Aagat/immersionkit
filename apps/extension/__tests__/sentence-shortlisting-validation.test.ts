import { describe, expect, it } from "vitest";

import {
  runSentenceShortlistingBenchmark
} from "../src/content/validation/shortlisting";
import {
  getSentenceShortlistingScenarios,
  resolveSentenceShortlistingInputProfile,
  SENTENCE_SHORTLISTING_DISCOVERY_RATE,
  SENTENCE_SHORTLISTING_GOLDILOCKS_THRESHOLD,
  SENTENCE_SHORTLISTING_WORD_INVENTORY,
  SENTENCE_SHORTLISTING_MAX_SHORTLIST_SIZE,
  SENTENCE_SHORTLISTING_PHRASE_HINTS,
  SENTENCE_SHORTLISTING_SCENARIOS,
  SENTENCE_SHORTLISTING_VOCAB_BY_LEXEME_ID
} from "../src/validation/sentence-shortlisting-data";
import { withFixtureDom } from "./helpers/fixture-dom";
import browserBenchmarkOutput from "../../../fixtures/evals/sentence-shortlisting/browser-benchmark-output.json";

describe("sentence shortlisting benchmark harness", () => {
  const benchmarkInputProfile = resolveSentenceShortlistingInputProfile(
    process.env.IK_BENCHMARK_INPUT_PROFILE ?? "baseline"
  );
  const benchmarkScenarios =
    benchmarkInputProfile === "baseline"
      ? SENTENCE_SHORTLISTING_SCENARIOS
      : getSentenceShortlistingScenarios(benchmarkInputProfile);

  it("builds profile-specific scenario sets from tiny to xxlarge", () => {
    const tiny = getSentenceShortlistingScenarios("tiny");
    const baseline = getSentenceShortlistingScenarios("baseline");
    const xxlarge = getSentenceShortlistingScenarios("xxlarge");

    expect(resolveSentenceShortlistingInputProfile("SMALL")).toBe("small");
    expect(resolveSentenceShortlistingInputProfile("not-a-profile")).toBe("baseline");
    expect(tiny.length).toBeLessThan(baseline.length);
    expect(xxlarge.length).toBeGreaterThan(baseline.length);
    expect(
      tiny.some((scenario) => scenario.id === "dynamic-rerender-same-hash")
    ).toBe(true);
    expect(
      xxlarge.some((scenario) => scenario.id === "generated-stress-xxlarge")
    ).toBe(true);
  });

  it("reports deterministic shortlist economics across validation scenarios", async () => {
    await withFixtureDom("article-basic.html", ({ document }) => {
      const result = runSentenceShortlistingBenchmark({
        document,
        scenarios: benchmarkScenarios,
        wordInventory: SENTENCE_SHORTLISTING_WORD_INVENTORY,
        vocabByLexemeId: SENTENCE_SHORTLISTING_VOCAB_BY_LEXEME_ID,
        discoveryRate: SENTENCE_SHORTLISTING_DISCOVERY_RATE,
        goldilocksThreshold: SENTENCE_SHORTLISTING_GOLDILOCKS_THRESHOLD,
        phraseHints: SENTENCE_SHORTLISTING_PHRASE_HINTS,
        maxShortlistSize: SENTENCE_SHORTLISTING_MAX_SHORTLIST_SIZE
      });

      const policyById = new Map(result.policies.map((policy) => [policy.policyId, policy]));
      const baseline = policyById.get("analyze-every-segmented");
      const legacyInjectedToken = policyById.get("legacy-injected-token-gated");
      const injectedLengthDedupe = policyById.get("injected-token-length-dedupe");
      const phraseAware = policyById.get("phrase-aware-shortlist");

      expect(result.scenarios.length).toBe(benchmarkScenarios.length);
      expect(baseline?.estimatedAnalysisCalls).toBeGreaterThan(0);
      expect(legacyInjectedToken?.estimatedAnalysisCalls).toBeLessThanOrEqual(
        baseline?.estimatedAnalysisCalls ?? Number.MAX_SAFE_INTEGER
      );
      expect(injectedLengthDedupe?.estimatedAnalysisCalls).toBeLessThanOrEqual(
        legacyInjectedToken?.estimatedAnalysisCalls ?? Number.MAX_SAFE_INTEGER
      );
      expect(phraseAware?.falseNegativeCount).toBeLessThanOrEqual(
        injectedLengthDedupe?.falseNegativeCount ?? Number.MAX_SAFE_INTEGER
      );

      const rerenderScenario = result.scenarios.find(
        (scenario) => scenario.scenarioId === "dynamic-rerender-same-hash"
      );
      const rerenderCurrent = rerenderScenario?.policySummaries.find(
        (policy) => policy.policyId === "legacy-injected-token-gated"
      );

      expect(rerenderCurrent?.cacheHits).toBeGreaterThan(0);
      expect(result.assertions.every((assertion) => assertion.passed)).toBe(true);

      if (benchmarkInputProfile === "baseline") {
        expect(result.policies).toEqual(browserBenchmarkOutput.policies);
        expect(result.scenarios).toEqual(browserBenchmarkOutput.scenarios);
        expect(result.assertions).toEqual(browserBenchmarkOutput.assertions);
      }
    });
  });
});
