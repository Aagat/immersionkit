import {
  BEGINNER_DIFFICULTY_PRESET,
  INTERMEDIATE_DIFFICULTY_PRESET
} from "../../../../../packages/shared/src/scoring/difficulty";
import {
  compareSuitabilityScorers,
  type ProfileComparisonResult,
  type SuitabilityCorpus
} from "../../../../../packages/shared/src/validation/suitability";
import sentenceSuitabilityCorpus from "../../../../../fixtures/evals/sentence-suitability/sentence-suitability-corpus.json";

declare global {
  interface Window {
    __ikSentenceSuitabilityResults?: ProfileComparisonResult[];
  }
}

const corpus = sentenceSuitabilityCorpus as SuitabilityCorpus;

const results = compareSuitabilityScorers(corpus, {
  [BEGINNER_DIFFICULTY_PRESET.id]: BEGINNER_DIFFICULTY_PRESET,
  [INTERMEDIATE_DIFFICULTY_PRESET.id]: INTERMEDIATE_DIFFICULTY_PRESET
});

window.__ikSentenceSuitabilityResults = results;

const checks = [
  {
    profileId: "beginner_a2",
    metricLabel: "Pairwise Accuracy Lift",
    valueSelector: (result: ProfileComparisonResult) => result.deltas.pairwiseAccuracy,
    minimum: 0.08
  },
  {
    profileId: "beginner_a2",
    metricLabel: "NDCG@5 Lift",
    valueSelector: (result: ProfileComparisonResult) => result.deltas.ndcgAt5,
    minimum: 0.05
  },
  {
    profileId: "intermediate_b1",
    metricLabel: "Pairwise Accuracy Lift",
    valueSelector: (result: ProfileComparisonResult) => result.deltas.pairwiseAccuracy,
    minimum: 0.06
  },
  {
    profileId: "intermediate_b1",
    metricLabel: "NDCG@5 Lift",
    valueSelector: (result: ProfileComparisonResult) => result.deltas.ndcgAt5,
    minimum: 0.04
  }
];

const failedChecks: string[] = [];

for (const check of checks) {
  const profileResult = results.find((result) => result.profileId === check.profileId);

  if (!profileResult) {
    failedChecks.push(`Missing profile: ${check.profileId}`);
    continue;
  }

  const value = check.valueSelector(profileResult);
  if (value < check.minimum) {
    failedChecks.push(
      `${profileResult.profileDisplayName} ${check.metricLabel} ${formatPercent(value)} < ${formatPercent(check.minimum)}`
    );
  }
}

renderSummary(results, failedChecks);
renderProfileCards(results);

if (failedChecks.length > 0) {
  throw new Error(
    `Sentence suitability validation failed:\n${failedChecks.join("\n")}`
  );
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatScore(value: number): string {
  return value.toFixed(3);
}

function renderSummary(resultsToRender: ProfileComparisonResult[], failures: string[]): void {
  const statusNode = requireNode("validation-status");
  const summaryNode = requireNode("validation-summary");

  statusNode.textContent =
    failures.length === 0
      ? "PASS: Prototype ranking beats known-ratio baseline on all required checks."
      : `FAIL: ${failures.length} check(s) below thresholds.`;
  statusNode.className = failures.length === 0 ? "status pass" : "status fail";

  const rows = resultsToRender
    .map((result) => {
      return `<tr>
        <td>${result.profileDisplayName}</td>
        <td>${formatScore(result.baselineMetrics.ndcgAt5)}</td>
        <td>${formatScore(result.prototypeMetrics.ndcgAt5)}</td>
        <td>${formatPercent(result.deltas.ndcgAt5)}</td>
        <td>${formatScore(result.baselineMetrics.pairwiseAccuracy)}</td>
        <td>${formatScore(result.prototypeMetrics.pairwiseAccuracy)}</td>
        <td>${formatPercent(result.deltas.pairwiseAccuracy)}</td>
      </tr>`;
    })
    .join("\n");

  const failureBlock =
    failures.length === 0
      ? ""
      : `<p><strong>Failed checks:</strong> ${failures
          .map((failure) => `<code>${escapeHtml(failure)}</code>`)
          .join("<br />")}</p>`;

  summaryNode.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Profile</th>
          <th>Baseline NDCG@5</th>
          <th>Prototype NDCG@5</th>
          <th>Delta</th>
          <th>Baseline Pairwise</th>
          <th>Prototype Pairwise</th>
          <th>Delta</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    ${failureBlock}
  `;
}

function renderProfileCards(resultsToRender: ProfileComparisonResult[]): void {
  const container = requireNode("validation-profiles");

  container.innerHTML = resultsToRender
    .map((result) => {
      const prototypeTop = result.prototypeOrder
        .slice(0, 5)
        .map((id) => lookupSentence(result, id))
        .map((entry, index) => `<li>${index + 1}. ${escapeHtml(entry.sentence)} <small>(${entry.category})</small></li>`)
        .join("\n");

      const baselineTop = result.baselineOrder
        .slice(0, 5)
        .map((id) => lookupSentence(result, id))
        .map((entry, index) => `<li>${index + 1}. ${escapeHtml(entry.sentence)} <small>(${entry.category})</small></li>`)
        .join("\n");

      const improvements = result.strongestImprovements
        .map((entry) => `<li>${escapeHtml(entry.id)} (${entry.category}) error delta ${entry.deltaAbsoluteError.toFixed(2)}</li>`)
        .join("\n");
      const regressions = result.strongestRegressions
        .map((entry) => `<li>${escapeHtml(entry.id)} (${entry.category}) error delta ${entry.deltaAbsoluteError.toFixed(2)}</li>`)
        .join("\n");

      return `<article class="profile-card">
        <h2>${result.profileDisplayName}</h2>
        <p><strong>Spearman:</strong> baseline ${formatScore(result.baselineMetrics.spearmanRho)} → prototype ${formatScore(result.prototypeMetrics.spearmanRho)} (${formatPercent(result.deltas.spearmanRho)})</p>
        <p><strong>Precision@5:</strong> baseline ${formatScore(result.baselineMetrics.precisionAt5)} → prototype ${formatScore(result.prototypeMetrics.precisionAt5)} (${formatPercent(result.deltas.precisionAt5)})</p>
        <div class="columns">
          <section>
            <h3>Top 5 Baseline</h3>
            <ol>${baselineTop}</ol>
          </section>
          <section>
            <h3>Top 5 Prototype</h3>
            <ol>${prototypeTop}</ol>
          </section>
        </div>
        <div class="columns">
          <section>
            <h3>Biggest Improvements</h3>
            <ul>${improvements || "<li>None</li>"}</ul>
          </section>
          <section>
            <h3>Biggest Regressions</h3>
            <ul>${regressions || "<li>None</li>"}</ul>
          </section>
        </div>
      </article>`;
    })
    .join("\n");
}

function lookupSentence(result: ProfileComparisonResult, id: string): { sentence: string; category: string } {
  const row = result.rows.find((candidate) => candidate.id === id);

  if (!row) {
    return {
      sentence: id,
      category: "missing"
    };
  }

  return {
    sentence: row.sentence,
    category: row.category
  };
}

function requireNode(id: string): HTMLElement {
  const node = document.getElementById(id);

  if (!node) {
    throw new Error(`Missing required node #${id}.`);
  }

  return node;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
