import {
  buildCanonicalPhraseKey,
  evaluatePhraseDetectorAgainstCorpusAsync,
  findCaseResult,
  listPhraseDetectorImplementations,
  type PhraseDetector,
  type PhraseDetectorImplementationId,
  type PhraseEvaluationSummary,
  type PhraseGoldCorpus
} from "@immersionkit/shared";
import phraseDetectionCorpus from "../../../../fixtures/evals/phrase-detection/phrase-detection-gold-corpus.json";

type ValidationAssertion = {
  name: string;
  passed: boolean;
  details: string;
};

type PhraseImplementationPayload = {
  implementationId: PhraseDetectorImplementationId;
  label: string;
  inputMode: "fixture-annotated" | "library-pos-from-raw";
  runtime: {
    totalMs: number;
    averageCaseMs: number;
    casesPerSecond: number;
    repeatCount: number;
  };
  overall: PhraseEvaluationSummary["overall"];
  categoryMetrics: PhraseEvaluationSummary["categoryMetrics"];
  assertions: ValidationAssertion[];
  representativeFalsePositives: PhraseEvaluationSummary["errors"];
  representativeFalseNegatives: PhraseEvaluationSummary["errors"];
};

type PhraseValidationPayload = {
  generatedAt: string;
  browserContext: {
    userAgent: string;
    language: string;
    platform: string;
  };
  corpusVersion: string;
  assertions: ValidationAssertion[];
  implementations: PhraseImplementationPayload[];
};

type PhraseValidationFailurePayload = {
  generatedAt: string;
  error: string;
};

declare global {
  interface Window {
    __IK_PHRASE_DETECTION_VALIDATION__?: PhraseValidationPayload;
  }
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatMs(value: number): string {
  return `${value.toFixed(3)} ms`;
}

function renderReport(payload: PhraseValidationPayload) {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) {
    return;
  }

  const suiteAssertionMarkup = payload.assertions
    .map(
      (assertion) =>
        `<li><strong>${assertion.passed ? "PASS" : "FAIL"}</strong> ${assertion.name}: ${
          assertion.details
        }</li>`
    )
    .join("");

  const summaryRows = payload.implementations
    .map(
      (implementation) =>
        `<tr>
          <td>${implementation.label}</td>
          <td>${implementation.inputMode}</td>
          <td>${formatMs(implementation.runtime.totalMs)}</td>
          <td>${formatMs(implementation.runtime.averageCaseMs)}</td>
          <td>${implementation.runtime.casesPerSecond.toFixed(2)}</td>
          <td>${formatPercent(implementation.overall.precision)}</td>
          <td>${formatPercent(implementation.overall.recall)}</td>
          <td>${implementation.overall.truePositives}</td>
          <td>${implementation.overall.falsePositives}</td>
          <td>${implementation.overall.falseNegatives}</td>
        </tr>`
    )
    .join("");

  const implementationSections = payload.implementations
    .map((implementation) => renderImplementationSection(implementation))
    .join("");

  root.innerHTML = `
    <main>
      <h1>Phrase Detection Validation</h1>
      <p><strong>Generated:</strong> ${payload.generatedAt}</p>
      <p><strong>Browser:</strong> ${payload.browserContext.userAgent}</p>
      <p><strong>Language:</strong> ${payload.browserContext.language}</p>
      <p><strong>Platform:</strong> ${payload.browserContext.platform}</p>
      <p><strong>Corpus version:</strong> ${payload.corpusVersion}</p>

      <section>
        <h2>Implementation Summary</h2>
        <table>
          <thead>
            <tr>
              <th>Implementation</th>
              <th>Input mode</th>
              <th>Total runtime</th>
              <th>Avg case runtime</th>
              <th>Cases/sec</th>
              <th>Precision</th>
              <th>Recall</th>
              <th>TP</th>
              <th>FP</th>
              <th>FN</th>
            </tr>
          </thead>
          <tbody>${summaryRows}</tbody>
        </table>
      </section>

      <section>
        <h2>Harness Assertions</h2>
        <ul>${suiteAssertionMarkup}</ul>
      </section>

      ${implementationSections}

      <section>
        <h2>Machine Readable Output</h2>
        <pre id="validation-json">${JSON.stringify(payload, null, 2)}</pre>
      </section>
    </main>
  `;
}

function renderFailure(payload: PhraseValidationFailurePayload) {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) {
    return;
  }

  root.innerHTML = `
    <main>
      <h1>Phrase Detection Validation Failed</h1>
      <p><strong>Generated:</strong> ${payload.generatedAt}</p>
      <p>${payload.error}</p>
      <section>
        <h2>Machine Readable Output</h2>
        <pre id="validation-json">${JSON.stringify(payload, null, 2)}</pre>
      </section>
    </main>
  `;
}

function renderImplementationSection(payload: PhraseImplementationPayload): string {
  const categoryRows = payload.categoryMetrics
    .map(
      (metrics) =>
        `<tr>
          <td>${metrics.category}</td>
          <td>${metrics.truePositives}</td>
          <td>${metrics.falsePositives}</td>
          <td>${metrics.falseNegatives}</td>
          <td>${formatPercent(metrics.precision)}</td>
          <td>${formatPercent(metrics.recall)}</td>
        </tr>`
    )
    .join("");

  const assertionMarkup = payload.assertions
    .map(
      (assertion) =>
        `<li><strong>${assertion.passed ? "PASS" : "WARN"}</strong> ${assertion.name}: ${
          assertion.details
        }</li>`
    )
    .join("");

  const falsePositiveMarkup = payload.representativeFalsePositives
    .map((entry) => {
      if (entry.type !== "false-positive") {
        return "";
      }

      return `<li><strong>${entry.caseId}</strong> (${entry.category}): "${
        entry.candidate.sourceText
      }" via ${entry.candidate.sourceKind} / ${entry.candidate.ruleId}</li>`;
    })
    .join("");

  const falseNegativeMarkup = payload.representativeFalseNegatives
    .map((entry) => {
      if (entry.type !== "false-negative") {
        return "";
      }

      return `<li><strong>${entry.caseId}</strong> (${entry.category}): "${
        entry.expected.normalizedSourceText
      }" (${entry.expected.sourceKind})</li>`;
    })
    .join("");

  return `
    <section>
      <h2>${payload.label}</h2>
      <p><strong>Input mode:</strong> ${payload.inputMode}</p>
      <p><strong>Runtime:</strong> ${formatMs(payload.runtime.totalMs)} total, ${formatMs(
        payload.runtime.averageCaseMs
      )} per case across ${payload.runtime.repeatCount} repeated corpus passes, ${payload.runtime.casesPerSecond.toFixed(2)} cases/sec</p>
      <ul>
        <li>True positives: ${payload.overall.truePositives}</li>
        <li>False positives: ${payload.overall.falsePositives}</li>
        <li>False negatives: ${payload.overall.falseNegatives}</li>
        <li>Precision: ${formatPercent(payload.overall.precision)}</li>
        <li>Recall: ${formatPercent(payload.overall.recall)}</li>
      </ul>

      <h3>Category Metrics</h3>
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>TP</th>
            <th>FP</th>
            <th>FN</th>
            <th>Precision</th>
            <th>Recall</th>
          </tr>
        </thead>
        <tbody>${categoryRows}</tbody>
      </table>

      <h3>Implementation Checks</h3>
      <ul>${assertionMarkup}</ul>

      <h3>Representative False Positives</h3>
      <ul>${falsePositiveMarkup || "<li>None</li>"}</ul>

      <h3>Representative False Negatives</h3>
      <ul>${falseNegativeMarkup || "<li>None</li>"}</ul>
    </section>
  `;
}

function buildHarnessAssertions(
  implementations: PhraseImplementationPayload[],
  corpus: PhraseGoldCorpus
): ValidationAssertion[] {
  const implementationIds = new Set(
    implementations.map((implementation) => implementation.implementationId)
  );

  return [
    {
      name: "All configured implementations completed",
      passed: implementations.length >= 2 && implementations.every((entry) => entry.runtime.totalMs > 0),
      details: `${implementations.length} implementation runs captured for ${corpus.cases.length} cases.`
    },
    {
      name: "Shared annotated baseline is present",
      passed: implementationIds.has("shared-annotated"),
      details: implementationIds.has("shared-annotated")
        ? "Shared annotated baseline included in the comparison set."
        : "Shared annotated baseline is missing."
    },
    {
      name: "At least one library-backed implementation is present",
      passed:
        implementationIds.has("compromise-three") || implementationIds.has("wink-nlp"),
      details:
        implementationIds.has("compromise-three") || implementationIds.has("wink-nlp")
          ? "Third-party library backed detector output is present."
          : "No third-party library backed detector output was captured."
    }
  ];
}

function runImplementationAssertions(
  evaluation: PhraseEvaluationSummary
): ValidationAssertion[] {
  const overlapCaseIds = evaluation.caseResults
    .filter((result) =>
      result.detected.some((candidate, index) =>
        result.detected.some(
          (comparison, comparisonIndex) =>
            comparisonIndex > index &&
            candidate.span.startToken < comparison.span.endToken &&
            comparison.span.startToken < candidate.span.endToken
        )
      )
    )
    .map((result) => result.caseId);

  const assertions: ValidationAssertion[] = [
    {
      name: "Selected spans are non-overlapping",
      passed: overlapCaseIds.length === 0,
      details:
        overlapCaseIds.length === 0
          ? "No overlap collisions after resolution."
          : `Overlap remained in cases: ${overlapCaseIds.join(", ")}`
    }
  ];

  const fixedOverlapCase = findCaseResult(evaluation, "overlap-fixed-other-hand");
  const keptFixedPhrase = fixedOverlapCase?.detected.some(
    (candidate) => candidate.normalizedSourceText === "on the other hand"
  );
  const leakedSmallerPhrase = fixedOverlapCase?.detected.some(
    (candidate) => candidate.normalizedSourceText === "other hand"
  );
  assertions.push({
    name: "Long fixed phrase outranks overlapping adjective+noun span",
    passed: Boolean(keptFixedPhrase) && !Boolean(leakedSmallerPhrase),
    details:
      keptFixedPhrase && !leakedSmallerPhrase
        ? "Selected phrase is only \"on the other hand\"."
        : "Expected fixed phrase to win but overlapping smaller span leaked or fixed phrase was missed."
  });

  const chunkOverlapCase = findCaseResult(evaluation, "chunk-overlap-new-captain");
  const keptChunk = chunkOverlapCase?.detected.some(
    (candidate) => candidate.normalizedSourceText === "new captain of the football team"
  );
  const leakedAdjectiveNoun = chunkOverlapCase?.detected.some(
    (candidate) => candidate.normalizedSourceText === "new captain"
  );
  assertions.push({
    name: "Coherent noun chunk outranks nested adjective+noun",
    passed: Boolean(keptChunk) && !Boolean(leakedAdjectiveNoun),
    details:
      keptChunk && !leakedAdjectiveNoun
        ? "Nested adjective+noun span suppressed as expected."
        : "Chunk precedence failed for nested overlap case."
  });

  const atLeastKeys = evaluation.caseResults
    .flatMap((result) => result.detected)
    .filter(
      (candidate) =>
        candidate.sourceKind === "fixed-phrase" &&
        candidate.normalizedSourceText === "at least"
    )
    .map((candidate) => candidate.canonicalPhraseKey);
  const uniqueAtLeastKeys = new Set(atLeastKeys);
  const expectedAtLeastKey = buildCanonicalPhraseKey("fixed-phrase", "at least");
  assertions.push({
    name: "Canonical key is deterministic for repeated phrases",
    passed: uniqueAtLeastKeys.size === 1 && uniqueAtLeastKeys.has(expectedAtLeastKey),
    details:
      uniqueAtLeastKeys.size === 1 && uniqueAtLeastKeys.has(expectedAtLeastKey)
        ? `All repeated "at least" matches map to ${expectedAtLeastKey}.`
        : `Canonical keys diverged: ${Array.from(uniqueAtLeastKeys).join(", ")}`
  });

  return assertions;
}

function collectRepresentativeErrors(
  evaluation: PhraseEvaluationSummary
): Pick<PhraseImplementationPayload, "representativeFalsePositives" | "representativeFalseNegatives"> {
  return {
    representativeFalsePositives: evaluation.errors
      .filter((entry) => entry.type === "false-positive")
      .slice(0, 8),
    representativeFalseNegatives: evaluation.errors
      .filter((entry) => entry.type === "false-negative")
      .slice(0, 8)
  };
}

async function runValidation() {
  const corpus = phraseDetectionCorpus as PhraseGoldCorpus;
  const implementations = listPhraseDetectorImplementations(true);
  const implementationResults: PhraseImplementationPayload[] = [];

  for (const implementation of implementations) {
    const evaluation = await evaluatePhraseDetectorAgainstCorpusAsync(
      corpus,
      implementation.detect
    );
    const assertions = runImplementationAssertions(evaluation);
    const representativeErrors = collectRepresentativeErrors(evaluation);
    const runtime = await measureImplementationRuntime(corpus, implementation.detect);

    implementationResults.push({
      implementationId: implementation.implementationId,
      label: implementation.label,
      inputMode: implementation.inputMode,
      runtime,
      overall: evaluation.overall,
      categoryMetrics: evaluation.categoryMetrics,
      assertions,
      ...representativeErrors
    });
  }

  const payload: PhraseValidationPayload = {
    generatedAt: new Date().toISOString(),
    browserContext: {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform
    },
    corpusVersion: corpus.version,
    assertions: buildHarnessAssertions(implementationResults, corpus),
    implementations: implementationResults
  };

  const harnessPassed = payload.assertions.every((assertion) => assertion.passed);
  document.body.setAttribute("data-validation-status", harnessPassed ? "pass" : "fail");
  window.__IK_PHRASE_DETECTION_VALIDATION__ = payload;
  renderReport(payload);
}

async function measureImplementationRuntime(
  corpus: PhraseGoldCorpus,
  detect: PhraseDetector
): Promise<PhraseImplementationPayload["runtime"]> {
  const repeatCount = 25;
  const startedAt = Date.now();

  for (let repetition = 0; repetition < repeatCount; repetition += 1) {
    for (const phraseCase of corpus.cases) {
      await detect(phraseCase);
    }
  }

  const totalMs = Math.max(Date.now() - startedAt, 0.001);
  const totalCaseRuns = corpus.cases.length * repeatCount;

  return {
    totalMs,
    averageCaseMs: totalMs / totalCaseRuns,
    casesPerSecond: totalCaseRuns / Math.max(totalMs / 1000, 0.001),
    repeatCount
  };
}

void runValidation().catch((error) => {
  const payload: PhraseValidationFailurePayload = {
    generatedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error)
  };

  document.body.setAttribute("data-validation-status", "fail");
  renderFailure(payload);
});
