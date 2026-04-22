import {
  runSentenceShortlistingBenchmark
} from "../content/validation/shortlisting";
import type {
  SentenceShortlistingBenchmarkResult,
  SentenceShortlistingPolicySummary
} from "../content/validation/shortlisting";

import {
  SENTENCE_SHORTLISTING_DISCOVERY_RATE,
  SENTENCE_SHORTLISTING_GOLDILOCKS_THRESHOLD,
  SENTENCE_SHORTLISTING_LEXICON,
  SENTENCE_SHORTLISTING_MAX_SHORTLIST_SIZE,
  SENTENCE_SHORTLISTING_PHRASE_HINTS,
  SENTENCE_SHORTLISTING_SCENARIOS,
  SENTENCE_SHORTLISTING_VOCAB_BY_LEMMA_ID
} from "./sentence-shortlisting-data";

declare global {
  interface Window {
    __IK_SHORTLISTING_BENCHMARK__?: SentenceShortlistingBenchmarkResult;
  }
}

const runButton = requireElement<HTMLButtonElement>("#run-shortlisting-benchmark");
const policyTableBody = requireElement<HTMLTableSectionElement>(
  "#shortlisting-policy-table-body"
);
const scenarioContainer = requireElement<HTMLElement>("#shortlisting-scenarios");
const assertionList = requireElement<HTMLElement>("#shortlisting-assertions");
const jsonOutput = requireElement<HTMLElement>("#shortlisting-json-output");
const contextOutput = requireElement<HTMLElement>("#shortlisting-context");

runButton.addEventListener("click", () => {
  executeBenchmark();
});

void executeBenchmark();

function executeBenchmark() {
  runButton.disabled = true;
  runButton.textContent = "Running...";

  try {
    const result = runSentenceShortlistingBenchmark({
      document,
      scenarios: SENTENCE_SHORTLISTING_SCENARIOS,
      lexicon: SENTENCE_SHORTLISTING_LEXICON,
      vocabByLemmaId: SENTENCE_SHORTLISTING_VOCAB_BY_LEMMA_ID,
      discoveryRate: SENTENCE_SHORTLISTING_DISCOVERY_RATE,
      goldilocksThreshold: SENTENCE_SHORTLISTING_GOLDILOCKS_THRESHOLD,
      phraseHints: SENTENCE_SHORTLISTING_PHRASE_HINTS,
      maxShortlistSize: SENTENCE_SHORTLISTING_MAX_SHORTLIST_SIZE
    });

    window.__IK_SHORTLISTING_BENCHMARK__ = result;
    renderContext();
    renderPolicySummary(result);
    renderScenarioSummaries(result);
    renderAssertions(result);
    jsonOutput.textContent = JSON.stringify(result, null, 2);
  } finally {
    runButton.disabled = false;
    runButton.textContent = "Run Benchmark";
  }
}

function renderContext() {
  const contextLines = [
    `User Agent: ${window.navigator.userAgent}`,
    `Scenarios: ${SENTENCE_SHORTLISTING_SCENARIOS.length}`,
    `Discovery Rate: ${SENTENCE_SHORTLISTING_DISCOVERY_RATE}`,
    `Goldilocks Threshold: ${SENTENCE_SHORTLISTING_GOLDILOCKS_THRESHOLD}`,
    `Phrase Hints: ${SENTENCE_SHORTLISTING_PHRASE_HINTS.join(", ")}`
  ];

  contextOutput.textContent = contextLines.join("\n");
}

function renderPolicySummary(result: SentenceShortlistingBenchmarkResult) {
  policyTableBody.innerHTML = "";

  for (const policy of result.policies) {
    const row = document.createElement("tr");

    row.append(
      createCell(policy.policyLabel),
      createCell(String(policy.shortlistedCandidates), "numeric"),
      createCell(String(policy.uniqueSentenceHashes), "numeric"),
      createCell(String(policy.estimatedAnalysisCalls), "numeric"),
      createCell(`${policy.estimatedAnalysisCallsSaved} (${formatPercent(policy.estimatedAnalysisCallsSavedRatio)})`, "numeric"),
      createCell(formatPercent(policy.cacheHitRate), "numeric"),
      createCell(String(policy.falseNegativeCount), "numeric")
    );

    policyTableBody.append(row);
  }
}

function renderScenarioSummaries(result: SentenceShortlistingBenchmarkResult) {
  scenarioContainer.innerHTML = "";

  for (const scenario of result.scenarios) {
    const card = document.createElement("article");
    card.className = "scenario-card";

    const title = document.createElement("h3");
    title.textContent = scenario.scenarioLabel;

    const source = document.createElement("p");
    source.className = "scenario-source";
    source.textContent = scenario.source;

    const stats = document.createElement("p");
    stats.className = "scenario-stats";
    stats.textContent =
      `Eligible Nodes: ${scenario.eligibleTextNodes} | ` +
      `Segmented Sentences: ${scenario.segmentedSentences} | ` +
      `Length-Filtered Sentences: ${scenario.segmentedSentencesLengthFiltered} | ` +
      `Unique Hashes: ${scenario.uniqueSegmentedSentenceHashes} | ` +
      `Useful Sentences: ${scenario.usefulSentenceCount}`;

    const table = document.createElement("table");
    table.className = "scenario-table";

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    headRow.append(
      createCell("Policy", undefined, "th"),
      createCell("Shortlisted", "numeric", "th"),
      createCell("Unique Hashes", "numeric", "th"),
      createCell("Analysis Calls", "numeric", "th"),
      createCell("Cache Hit Rate", "numeric", "th"),
      createCell("False Negatives", "numeric", "th")
    );
    thead.append(headRow);

    const tbody = document.createElement("tbody");
    for (const policy of scenario.policySummaries) {
      const row = document.createElement("tr");
      row.append(
        createCell(policy.policyLabel),
        createCell(String(policy.shortlistedCandidates), "numeric"),
        createCell(String(policy.uniqueSentenceHashes), "numeric"),
        createCell(String(policy.estimatedAnalysisCalls), "numeric"),
        createCell(formatPercent(policy.cacheHitRate), "numeric"),
        createCell(String(policy.falseNegativeCount), "numeric")
      );
      tbody.append(row);

      if (policy.falseNegatives.length > 0) {
        const falseNegativeRow = document.createElement("tr");
        const falseNegativeCell = document.createElement("td");
        falseNegativeCell.colSpan = 6;
        falseNegativeCell.className = "false-negative-cell";
        falseNegativeCell.textContent = `Missed useful sentences: ${policy.falseNegatives.join(" | ")}`;
        falseNegativeRow.append(falseNegativeCell);
        tbody.append(falseNegativeRow);
      }
    }

    table.append(thead, tbody);
    card.append(title, source, stats, table);
    scenarioContainer.append(card);
  }
}

function renderAssertions(result: SentenceShortlistingBenchmarkResult) {
  assertionList.innerHTML = "";

  for (const assertion of result.assertions) {
    const item = document.createElement("li");
    item.className = assertion.passed ? "assertion-pass" : "assertion-fail";
    item.textContent = `${assertion.passed ? "PASS" : "FAIL"}: ${assertion.message}`;
    assertionList.append(item);
  }
}

function createCell(
  value: string,
  className?: "numeric",
  element: "td" | "th" = "td"
): HTMLTableCellElement {
  const cell = document.createElement(element);
  cell.textContent = value;

  if (className) {
    cell.classList.add(className);
  }

  return cell;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Sentence shortlisting validation UI is missing ${selector}.`);
  }

  return element;
}

export function serializePolicySummary(
  policy: SentenceShortlistingPolicySummary
): Record<string, unknown> {
  return {
    policyId: policy.policyId,
    shortlistedCandidates: policy.shortlistedCandidates,
    uniqueSentenceHashes: policy.uniqueSentenceHashes,
    estimatedAnalysisCalls: policy.estimatedAnalysisCalls,
    estimatedAnalysisCallsSaved: policy.estimatedAnalysisCallsSaved,
    cacheHitRate: Number((policy.cacheHitRate * 100).toFixed(2)),
    falseNegativeCount: policy.falseNegativeCount
  };
}
