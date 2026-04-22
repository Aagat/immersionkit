import {
  createPortableSnapshots,
  runNlpPerformanceSpikeBenchmark,
  type AnalyzerBenchmarkMetrics,
  type AnalyzerBenchmarkResult,
  type NlpPerformanceBenchmarkRun
} from "../background/analysis-spike";

import "./styles.css";

declare global {
  interface Window {
    __IK_NLP_PERFORMANCE_RESULT__?: NlpPerformanceBenchmarkRun;
  }
}

type RenderContext = {
  status: HTMLElement;
  results: HTMLElement;
  raw: HTMLPreElement;
  runButton: HTMLButtonElement;
  includeWinkCheckbox: HTMLInputElement;
};

const root = document.querySelector<HTMLDivElement>("#root");

if (!root) {
  throw new Error("Validation root container was not found.");
}

const context = createLayout(root);
bindActions(context);

const params = new URLSearchParams(window.location.search);
if (params.get("includeWink") === "0") {
  context.includeWinkCheckbox.checked = false;
}
if (params.get("autorun") === "1") {
  void runBenchmark(context);
}

function createLayout(container: HTMLDivElement): RenderContext {
  container.innerHTML = `
    <main class="validation-shell">
      <header class="validation-header">
        <h1>ImmersionKit Validation Harness</h1>
        <p>
          Task 1 benchmark: browser-run background NLP performance spike for compromise and winkNLP.
        </p>
      </header>

      <section class="validation-controls">
        <label class="checkbox-label">
          <input id="include-wink" type="checkbox" checked />
          Include winkNLP comparison run
        </label>
        <button id="run-benchmark" type="button">Run Browser Benchmark</button>
      </section>

      <section class="validation-status" id="status-panel" aria-live="polite">
        Waiting for a benchmark run.
      </section>

      <section class="validation-results" id="results-panel"></section>

      <section class="validation-raw">
        <h2>Raw JSON</h2>
        <pre id="raw-json">No benchmark output yet.</pre>
      </section>
    </main>
  `;

  const status = getRequiredElement<HTMLElement>(container, "#status-panel");
  const results = getRequiredElement<HTMLElement>(container, "#results-panel");
  const raw = getRequiredElement<HTMLPreElement>(container, "#raw-json");
  const runButton = getRequiredElement<HTMLButtonElement>(container, "#run-benchmark");
  const includeWinkCheckbox = getRequiredElement<HTMLInputElement>(container, "#include-wink");

  return {
    status,
    results,
    raw,
    runButton,
    includeWinkCheckbox
  };
}

function bindActions(context: RenderContext) {
  context.runButton.addEventListener("click", () => {
    void runBenchmark(context);
  });
}

async function runBenchmark(context: RenderContext) {
  context.runButton.disabled = true;
  context.status.textContent = "Running benchmark inside browser runtime...";
  context.results.innerHTML = "";

  try {
    const includeWinkNlp = context.includeWinkCheckbox.checked;
    const result = await runNlpPerformanceSpikeBenchmark({ includeWinkNlp });

    window.__IK_NLP_PERFORMANCE_RESULT__ = result;
    context.status.textContent = renderStatus(result);
    context.results.innerHTML = renderResultPanels(result);
    context.raw.textContent = JSON.stringify(
      {
        ...result,
        analyzerResults: result.analyzerResults.map((entry) => {
          if ("skipped" in entry) {
            return entry;
          }

          return {
            ...entry,
            sampleSnapshots: createPortableSnapshots(entry.sampleSnapshots)
          };
        })
      },
      null,
      2
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    context.status.textContent = `Benchmark failed: ${message}`;
    context.raw.textContent = JSON.stringify({ error: message }, null, 2);
  } finally {
    context.runButton.disabled = false;
  }
}

function renderStatus(result: NlpPerformanceBenchmarkRun): string {
  const passingAssertions = result.assertions.filter((assertion) => assertion.pass).length;
  const totalAssertions = result.assertions.length;
  const analyzerCount = result.analyzerResults.length;
  const successfulAnalyzers = result.analyzerResults.filter(
    (entry) => !("skipped" in entry)
  ).length;

  return `Completed ${analyzerCount} analyzer run(s); ${successfulAnalyzers} finished. Global assertions: ${passingAssertions}/${totalAssertions} passing.`;
}

function renderResultPanels(result: NlpPerformanceBenchmarkRun): string {
  const analyzerPanels = result.analyzerResults
    .map((entry) => renderAnalyzerPanel(entry))
    .join("\n");

  const assertionsList = result.assertions
    .map(
      (assertion) =>
        `<li class="${assertion.pass ? "assertion-pass" : "assertion-fail"}">${assertion.pass ? "PASS" : "FAIL"}: ${escapeHtml(assertion.message)}</li>`
    )
    .join("\n");

  return `
    <section>
      <h2>Run Assertions</h2>
      <ul>${assertionsList}</ul>
    </section>
    <section>
      <h2>Analyzer Results</h2>
      ${analyzerPanels}
    </section>
  `;
}

function renderAnalyzerPanel(entry: AnalyzerBenchmarkResult): string {
  if ("skipped" in entry) {
    return `
      <article class="analyzer-card">
        <h3>${escapeHtml(entry.analyzerId)}</h3>
        <p class="assertion-fail">Skipped: ${escapeHtml(entry.reason)}</p>
      </article>
    `;
  }

  return renderAnalyzerMetrics(entry);
}

function renderAnalyzerMetrics(entry: AnalyzerBenchmarkMetrics): string {
  const localAssertions = entry.assertions
    .map(
      (assertion) =>
        `<li class="${assertion.pass ? "assertion-pass" : "assertion-fail"}">${assertion.pass ? "PASS" : "FAIL"}: ${escapeHtml(assertion.message)}</li>`
    )
    .join("\n");

  return `
    <article class="analyzer-card">
      <h3>${escapeHtml(entry.analyzerId)}</h3>
      <table>
        <tbody>
          <tr><th>Cold Start (ms)</th><td>${formatMs(entry.coldStartLatencyMs)}</td></tr>
          <tr><th>Hot Per Sentence (ms)</th><td>${formatMs(entry.hotPerSentenceLatencyMs)}</td></tr>
          <tr><th>Small Batch (10) (ms)</th><td>${formatMs(entry.smallBatch.totalLatencyMs)}</td></tr>
          <tr><th>Medium Batch (48) (ms)</th><td>${formatMs(entry.mediumBatch.totalLatencyMs)}</td></tr>
          <tr><th>Payload Avg (bytes/sentence)</th><td>${entry.payload.averageBytesPerSentence.toFixed(1)}</td></tr>
          <tr><th>Cache Replay Hit Rate</th><td>${(entry.cacheReplay.simulatedHitRate * 100).toFixed(1)}%</td></tr>
          <tr><th>Determinism Stability</th><td>${(entry.determinism.stableRate * 100).toFixed(1)}%</td></tr>
          <tr><th>Heap Delta Proxy (bytes)</th><td>${formatNullableNumber(entry.memoryProxy.deltaUsedHeapBytes)}</td></tr>
        </tbody>
      </table>
      <h4>Assertions</h4>
      <ul>${localAssertions}</ul>
    </article>
  `;
}

function getRequiredElement<T extends HTMLElement>(container: HTMLElement, selector: string): T {
  const element = container.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing required element: ${selector}`);
  }

  return element as T;
}

function formatMs(value: number): string {
  return value.toFixed(3);
}

function formatNullableNumber(value: number | null): string {
  if (typeof value !== "number") {
    return "unavailable";
  }

  return value.toFixed(0);
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
