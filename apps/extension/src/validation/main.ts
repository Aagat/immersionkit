import { runWordInjectionValidation } from "./run-word-injection-validation";

type ValidationWindow = Window & {
  __IK_WORD_INJECTION_VALIDATION__?: ReturnType<typeof runWordInjectionValidation>;
};

function render() {
  const root = document.querySelector<HTMLElement>("[data-ik-validation-root='word-injection']");
  if (!root) {
    throw new Error("Validation root not found");
  }

  const result = runWordInjectionValidation();
  (window as ValidationWindow).__IK_WORD_INJECTION_VALIDATION__ = result;

  document.body.setAttribute("data-validation-status", result.checks.pass ? "pass" : "fail");

  const statusText = result.checks.pass ? "PASS" : "FAIL";
  const statusClass = result.checks.pass ? "ik-status-pass" : "ik-status-fail";

  const header = document.createElement("section");
  header.className = "ik-validation-card";
  header.innerHTML = [
    `<h1>Word Injection Validation (${statusText})</h1>`,
    `<p class='${statusClass}'>Snapshot check: ${statusText}</p>`,
    `<p><strong>Generated:</strong> ${result.generatedAt}</p>`,
    `<p><strong>Browser:</strong> ${escapeHtml(result.browserUserAgent)}</p>`,
    `<p><strong>Corpus version:</strong> ${result.corpusVersion}</p>`
  ].join("\n");

  const summary = document.createElement("section");
  summary.className = "ik-validation-card";
  summary.innerHTML = `
    <h2>Summary Metrics</h2>
    <table>
      <thead>
        <tr>
          <th>Strategy</th>
          <th>Accuracy</th>
          <th>Must-Skip Precision</th>
          <th>Must-Inject Coverage</th>
          <th>Uncertain Skip Rate</th>
          <th>Low-Confidence Skips</th>
        </tr>
      </thead>
      <tbody>
        ${renderMetricRow(result.summary.baseline)}
        ${renderMetricRow(result.summary.prototype)}
      </tbody>
    </table>
  `;

  const mismatchCard = document.createElement("section");
  mismatchCard.className = "ik-validation-card";
  mismatchCard.innerHTML = `<h2>Snapshot Mismatches</h2>`;

  if (result.checks.mismatches.length === 0) {
    const ok = document.createElement("p");
    ok.textContent = "No mismatches detected.";
    mismatchCard.append(ok);
  } else {
    const list = document.createElement("ul");
    for (const mismatch of result.checks.mismatches) {
      const item = document.createElement("li");
      item.textContent = mismatch;
      list.append(item);
    }

    mismatchCard.append(list);
  }

  const tableCard = document.createElement("section");
  tableCard.className = "ik-validation-card";
  const rows = result.summary.perCase
    .map(
      (entry) => `
      <tr>
        <td>${escapeHtml(entry.candidate.id)}</td>
        <td>${escapeHtml(entry.candidate.expectedOutcome)}</td>
        <td>${escapeHtml(entry.baseline.decision)}</td>
        <td>${escapeHtml(entry.baseline.code)}</td>
        <td>${escapeHtml(entry.prototype.decision)}</td>
        <td>${escapeHtml(entry.prototype.code)}</td>
      </tr>
    `
    )
    .join("\n");

  tableCard.innerHTML = `
    <h2>Per-Case Decisions</h2>
    <table>
      <thead>
        <tr>
          <th>Case</th>
          <th>Expected</th>
          <th>Baseline</th>
          <th>Baseline Code</th>
          <th>Prototype</th>
          <th>Prototype Code</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;

  const jsonCard = document.createElement("section");
  jsonCard.className = "ik-validation-card";
  jsonCard.innerHTML = "<h2>Machine Output</h2>";
  const pre = document.createElement("pre");
  pre.textContent = JSON.stringify(result, null, 2);
  jsonCard.append(pre);

  root.replaceChildren(header, summary, mismatchCard, tableCard, jsonCard);
}

function renderMetricRow(summary: {
  name: string;
  accuracy: number;
  mustSkipPrecision: number;
  mustInjectCoverage: number;
  uncertainSkipRate: number;
  lowConfidenceSkipCount: number;
}): string {
  return `
    <tr>
      <td>${escapeHtml(summary.name)}</td>
      <td>${formatPercent(summary.accuracy)}</td>
      <td>${formatPercent(summary.mustSkipPrecision)}</td>
      <td>${formatPercent(summary.mustInjectCoverage)}</td>
      <td>${formatPercent(summary.uncertainSkipRate)}</td>
      <td>${summary.lowConfidenceSkipCount}</td>
    </tr>
  `;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

render();
