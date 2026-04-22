import {
  buildCanonicalPhraseKey,
  detectPhraseCandidates,
  evaluatePhraseDetectorAgainstCorpus,
  findCaseResult,
  type PhraseEvaluationSummary,
  type PhraseGoldCorpus
} from "@immersionkit/shared";
import phraseDetectionCorpus from "../../../../fixtures/evals/phrase-detection/phrase-detection-gold-corpus.json";

type ValidationAssertion = {
  name: string;
  passed: boolean;
  details: string;
};

type PhraseValidationPayload = {
  generatedAt: string;
  browserContext: {
    userAgent: string;
    language: string;
    platform: string;
  };
  corpusVersion: string;
  overall: PhraseEvaluationSummary["overall"];
  categoryMetrics: PhraseEvaluationSummary["categoryMetrics"];
  assertions: ValidationAssertion[];
  representativeFalsePositives: PhraseEvaluationSummary["errors"];
  representativeFalseNegatives: PhraseEvaluationSummary["errors"];
};

declare global {
  interface Window {
    __IK_PHRASE_DETECTION_VALIDATION__?: PhraseValidationPayload;
  }
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function renderReport(payload: PhraseValidationPayload) {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) {
    return;
  }

  const assertionMarkup = payload.assertions
    .map(
      (assertion) =>
        `<li><strong>${assertion.passed ? "PASS" : "FAIL"}</strong> ${assertion.name}: ${
          assertion.details
        }</li>`
    )
    .join("");

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

  root.innerHTML = `
    <main>
      <h1>Phrase Detection Validation</h1>
      <p><strong>Generated:</strong> ${payload.generatedAt}</p>
      <p><strong>Browser:</strong> ${payload.browserContext.userAgent}</p>
      <p><strong>Language:</strong> ${payload.browserContext.language}</p>
      <p><strong>Platform:</strong> ${payload.browserContext.platform}</p>
      <p><strong>Corpus version:</strong> ${payload.corpusVersion}</p>

      <section>
        <h2>Overall Metrics</h2>
        <ul>
          <li>True positives: ${payload.overall.truePositives}</li>
          <li>False positives: ${payload.overall.falsePositives}</li>
          <li>False negatives: ${payload.overall.falseNegatives}</li>
          <li>Precision: ${formatPercent(payload.overall.precision)}</li>
          <li>Recall: ${formatPercent(payload.overall.recall)}</li>
        </ul>
      </section>

      <section>
        <h2>Category Metrics</h2>
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
      </section>

      <section>
        <h2>Browser Assertions</h2>
        <ul>${assertionMarkup}</ul>
      </section>

      <section>
        <h2>Representative False Positives</h2>
        <ul>${falsePositiveMarkup || "<li>None</li>"}</ul>
      </section>

      <section>
        <h2>Representative False Negatives</h2>
        <ul>${falseNegativeMarkup || "<li>None</li>"}</ul>
      </section>

      <section>
        <h2>Machine Readable Output</h2>
        <pre id="validation-json">${JSON.stringify(payload, null, 2)}</pre>
      </section>
    </main>
  `;
}

function runAssertions(
  corpus: PhraseGoldCorpus,
  evaluation: PhraseEvaluationSummary
): ValidationAssertion[] {
  const assertions: ValidationAssertion[] = [];

  const overlapCaseIds: string[] = [];
  for (const phraseCase of corpus.cases) {
    const detection = detectPhraseCandidates(phraseCase);
    for (let index = 0; index < detection.selectedCandidates.length; index += 1) {
      const current = detection.selectedCandidates[index];
      for (
        let comparisonIndex = index + 1;
        comparisonIndex < detection.selectedCandidates.length;
        comparisonIndex += 1
      ) {
        const comparison = detection.selectedCandidates[comparisonIndex];
        const overlaps =
          current.span.startToken < comparison.span.endToken &&
          comparison.span.startToken < current.span.endToken;
        if (overlaps) {
          overlapCaseIds.push(phraseCase.id);
        }
      }
    }
  }

  assertions.push({
    name: "Selected spans are non-overlapping",
    passed: overlapCaseIds.length === 0,
    details:
      overlapCaseIds.length === 0
        ? "No overlap collisions after resolution."
        : `Overlap remained in cases: ${overlapCaseIds.join(", ")}`
  });

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
): Pick<PhraseValidationPayload, "representativeFalsePositives" | "representativeFalseNegatives"> {
  const falsePositives = evaluation.errors
    .filter((entry) => entry.type === "false-positive")
    .slice(0, 8);
  const falseNegatives = evaluation.errors
    .filter((entry) => entry.type === "false-negative")
    .slice(0, 8);

  return {
    representativeFalsePositives: falsePositives,
    representativeFalseNegatives: falseNegatives
  };
}

function runValidation() {
  const corpus = phraseDetectionCorpus as PhraseGoldCorpus;
  const evaluation = evaluatePhraseDetectorAgainstCorpus(corpus);
  const assertions = runAssertions(corpus, evaluation);
  const representativeErrors = collectRepresentativeErrors(evaluation);

  const payload: PhraseValidationPayload = {
    generatedAt: new Date().toISOString(),
    browserContext: {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform
    },
    corpusVersion: corpus.version,
    overall: evaluation.overall,
    categoryMetrics: evaluation.categoryMetrics,
    assertions,
    ...representativeErrors
  };

  window.__IK_PHRASE_DETECTION_VALIDATION__ = payload;
  renderReport(payload);
}

runValidation();
