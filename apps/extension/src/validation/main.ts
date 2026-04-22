import {
  createPortableSnapshots,
  runNlpPerformanceSpikeBenchmark,
  type AnalyzerBenchmarkMetrics,
  type AnalyzerBenchmarkResult,
  type NlpPerformanceBenchmarkRun
} from "../background/analysis-spike";

import {
  runWordInjectionValidation,
  type BrowserWordInjectionValidationResult
} from "./run-word-injection-validation";

import "./styles.css";

type ValidationTaskId =
  | "dashboard"
  | "nlp-performance"
  | "contextual-word-injection"
  | "phrase-detection"
  | "sentence-shortlisting"
  | "sentence-suitability";

type RenderContext = {
  status: HTMLElement;
  results: HTMLElement;
  raw: HTMLPreElement;
  runButton: HTMLButtonElement;
  includeWinkCheckbox: HTMLInputElement;
};

declare global {
  interface Window {
    __IK_NLP_PERFORMANCE_RESULT__?: NlpPerformanceBenchmarkRun;
    __IK_WORD_INJECTION_VALIDATION__?: BrowserWordInjectionValidationResult;
  }
}

const rootElement = document.querySelector<HTMLDivElement>("#root");
if (!rootElement) {
  throw new Error("Validation root container was not found.");
}
const root = rootElement;

const params = new URLSearchParams(window.location.search);
const task = resolveTask(params.get("task"));

void initializeTask(task, params);

async function initializeTask(taskId: ValidationTaskId, searchParams: URLSearchParams) {
  switch (taskId) {
    case "dashboard": {
      document.title = "ImmersionKit Validation Harness";
      root.innerHTML = renderDashboard();
      break;
    }
    case "nlp-performance": {
      document.title = "ImmersionKit Validation - Task 01 NLP Performance";
      const context = createNlpLayout(root);
      bindNlpActions(context);

      if (searchParams.get("includeWink") === "0") {
        context.includeWinkCheckbox.checked = false;
      }

      if (searchParams.get("autorun") === "1") {
        await runNlpBenchmark(context);
      }
      break;
    }
    case "contextual-word-injection": {
      document.title = "ImmersionKit Validation - Task 02 Contextual Word Injection";
      root.innerHTML = renderWordInjectionLayout();
      await runWordInjectionBenchmark();
      break;
    }
    case "phrase-detection": {
      document.title = "ImmersionKit Validation - Task 03 Phrase Detection";
      root.innerHTML = renderTaskModuleHost(
        "Task 03: Phrase Detection Validation",
        "Two-lane phrase detection benchmark (fixed phrases + grammar/chunk extraction).",
        "app"
      );

      await import("./phrase-detection-page");
      break;
    }
    case "sentence-shortlisting": {
      document.title = "ImmersionKit Validation - Task 04 Sentence Shortlisting";
      root.innerHTML = renderSentenceShortlistingLayout();
      await import("./sentence-shortlisting");
      break;
    }
    case "sentence-suitability": {
      document.title = "ImmersionKit Validation - Task 05 Sentence Suitability";
      root.innerHTML = renderSentenceSuitabilityLayout();

      try {
        await import("./sentence-suitability/index");
        document.body.setAttribute("data-validation-status", "pass");
      } catch (error) {
        document.body.setAttribute("data-validation-status", "fail");
        throw error;
      }
      break;
    }
    default: {
      const exhaustiveCheck: never = taskId;
      throw new Error(`Unsupported task: ${String(exhaustiveCheck)}`);
    }
  }
}

function resolveTask(rawValue: string | null): ValidationTaskId {
  if (!rawValue) {
    return "dashboard";
  }

  const value = rawValue.trim().toLowerCase();

  if (value === "task-01" || value === "nlp" || value === "nlp-performance") {
    return "nlp-performance";
  }

  if (
    value === "task-02" ||
    value === "word-injection" ||
    value === "contextual-word-injection"
  ) {
    return "contextual-word-injection";
  }

  if (value === "task-03" || value === "phrase-detection") {
    return "phrase-detection";
  }

  if (
    value === "task-04" ||
    value === "sentence-cache" ||
    value === "sentence-shortlisting"
  ) {
    return "sentence-shortlisting";
  }

  if (
    value === "task-05" ||
    value === "sentence-suitability" ||
    value === "sentence-suitability-score"
  ) {
    return "sentence-suitability";
  }

  return "dashboard";
}

function renderDashboard(): string {
  return `
    <main class="validation-shell">
      <header class="validation-header">
        <h1>ImmersionKit Browser Validation Harness</h1>
        <p>
          Use one shared validation page for all benchmark lanes. Select a task below or pass
          <code>?task=&lt;task-id&gt;&amp;autorun=1</code> from automation.
        </p>
      </header>

      <section class="validation-results">
        <article class="task-card">
          <h2>Task 01: Background NLP Performance</h2>
          <p>Runtime and deterministic-cache metrics for compromise and winkNLP analyzers.</p>
          <a class="task-link" href="/validation.html?task=nlp-performance">Open Task 01</a>
        </article>
        <article class="task-card">
          <h2>Task 02: Contextual Word Injection</h2>
          <p>Accuracy and decision-quality metrics for ambiguity suppression in browser context.</p>
          <a class="task-link" href="/validation.html?task=contextual-word-injection&amp;autorun=1">Open Task 02</a>
        </article>
        <article class="task-card">
          <h2>Task 03: Phrase Detection</h2>
          <p>Precision/recall validation for fixed-phrase + chunk/grammar phrase extraction.</p>
          <a class="task-link" href="/validation.html?task=phrase-detection&amp;autorun=1">Open Task 03</a>
        </article>
        <article class="task-card">
          <h2>Task 04: Sentence Shortlisting and Cache</h2>
          <p>Content-side shortlist policies, cache-hit behavior, and false-negative tradeoffs.</p>
          <a class="task-link" href="/validation.html?task=sentence-shortlisting&amp;autorun=1">Open Task 04</a>
        </article>
        <article class="task-card">
          <h2>Task 05: Sentence Suitability Scoring</h2>
          <p>Ranking-quality metrics comparing known-ratio baseline and prototype scorer.</p>
          <a class="task-link" href="/validation.html?task=sentence-suitability&amp;autorun=1">Open Task 05</a>
        </article>
      </section>
    </main>
  `;
}

function createNlpLayout(container: HTMLDivElement): RenderContext {
  container.innerHTML = `
    <main class="validation-shell">
      <header class="validation-header">
        <h1>Task 01: Background NLP Performance Benchmark</h1>
        <p>
          Browser-run benchmark for compromise and winkNLP under extension-bundle constraints.
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

function bindNlpActions(context: RenderContext) {
  context.runButton.addEventListener("click", () => {
    void runNlpBenchmark(context);
  });
}

async function runNlpBenchmark(context: RenderContext) {
  context.runButton.disabled = true;
  context.status.textContent = "Running benchmark inside browser runtime...";
  context.results.innerHTML = "";

  try {
    const includeWinkNlp = context.includeWinkCheckbox.checked;
    const result = await runNlpPerformanceSpikeBenchmark({ includeWinkNlp });

    window.__IK_NLP_PERFORMANCE_RESULT__ = result;
    document.body.setAttribute("data-validation-status", "pass");
    context.status.textContent = renderNlpStatus(result);
    context.results.innerHTML = renderNlpResultPanels(result);
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

    const failingAssertions = [
      ...result.assertions.filter((assertion) => !assertion.pass),
      ...result.analyzerResults.flatMap((entry) => {
        if ("skipped" in entry) {
          return [];
        }

        return entry.assertions.filter((assertion) => !assertion.pass);
      })
    ];

    if (failingAssertions.length > 0) {
      document.body.setAttribute("data-validation-status", "fail");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    document.body.setAttribute("data-validation-status", "fail");
    context.status.textContent = `Benchmark failed: ${message}`;
    context.raw.textContent = JSON.stringify({ error: message }, null, 2);
  } finally {
    context.runButton.disabled = false;
  }
}

function renderNlpStatus(result: NlpPerformanceBenchmarkRun): string {
  const passingAssertions = result.assertions.filter((assertion) => assertion.pass).length;
  const totalAssertions = result.assertions.length;
  const analyzerCount = result.analyzerResults.length;
  const successfulAnalyzers = result.analyzerResults.filter(
    (entry) => !("skipped" in entry)
  ).length;

  return `Completed ${analyzerCount} analyzer run(s); ${successfulAnalyzers} finished. Global assertions: ${passingAssertions}/${totalAssertions} passing.`;
}

function renderNlpResultPanels(result: NlpPerformanceBenchmarkRun): string {
  const analyzerPanels = result.analyzerResults
    .map((entry) => renderNlpAnalyzerPanel(entry))
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

function renderNlpAnalyzerPanel(entry: AnalyzerBenchmarkResult): string {
  if ("skipped" in entry) {
    return `
      <article class="analyzer-card">
        <h3>${escapeHtml(entry.analyzerId)}</h3>
        <p class="assertion-fail">Skipped: ${escapeHtml(entry.reason)}</p>
      </article>
    `;
  }

  return renderNlpAnalyzerMetrics(entry);
}

function renderNlpAnalyzerMetrics(entry: AnalyzerBenchmarkMetrics): string {
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

function renderWordInjectionLayout(): string {
  return `
    <main class="validation-shell">
      <header class="validation-header">
        <h1>Task 02: Contextual Word Injection Validation</h1>
        <p>
          Browser-run validation for ambiguity suppression in inline word injection decisions.
        </p>
      </header>

      <section class="validation-controls">
        <button id="run-word-injection" type="button">Run Validation</button>
      </section>

      <section class="validation-status" id="word-injection-status" aria-live="polite">
        Waiting for a validation run.
      </section>

      <section class="validation-results" id="word-injection-results"></section>

      <section class="validation-raw">
        <h2>Raw JSON</h2>
        <pre id="word-injection-raw">No output yet.</pre>
      </section>
    </main>
  `;
}

async function runWordInjectionBenchmark() {
  const runButton = getRequiredElement<HTMLButtonElement>(root, "#run-word-injection");
  const status = getRequiredElement<HTMLElement>(root, "#word-injection-status");
  const results = getRequiredElement<HTMLElement>(root, "#word-injection-results");
  const raw = getRequiredElement<HTMLPreElement>(root, "#word-injection-raw");

  const run = () => {
    try {
      runButton.disabled = true;
      status.textContent = "Running browser validation...";
      results.innerHTML = "";

      const result = runWordInjectionValidation();
      window.__IK_WORD_INJECTION_VALIDATION__ = result;

      const statusText = result.checks.pass ? "pass" : "fail";
      document.body.setAttribute("data-validation-status", statusText);
      status.textContent = result.checks.pass
        ? "Snapshot checks passed."
        : `Snapshot checks failed (${result.checks.mismatches.length} mismatch(es)).`;
      status.className = result.checks.pass
        ? "validation-status assertion-pass"
        : "validation-status assertion-fail";

      results.innerHTML = renderWordInjectionResults(result);
      raw.textContent = JSON.stringify(result, null, 2);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      document.body.setAttribute("data-validation-status", "fail");
      status.textContent = `Validation failed: ${message}`;
      status.className = "validation-status assertion-fail";
      raw.textContent = JSON.stringify({ error: message }, null, 2);
      throw error;
    } finally {
      runButton.disabled = false;
    }
  };

  runButton.addEventListener("click", () => {
    run();
  });

  run();
}

function renderWordInjectionResults(result: BrowserWordInjectionValidationResult): string {
  const baseline = result.summary.baseline;
  const prototype = result.summary.prototype;
  const mismatches = result.checks.mismatches
    .map((mismatch) => `<li class="assertion-fail">${escapeHtml(mismatch)}</li>`)
    .join("\n");

  return `
    <section>
      <h2>Corpus Summary</h2>
      <ul>
        <li>Total cases: ${result.summary.totalCases}</li>
        <li>Must-inject: ${result.summary.mustInjectCount}</li>
        <li>Must-skip: ${result.summary.mustSkipCount}</li>
        <li>Uncertain-skip: ${result.summary.uncertainSkipCount}</li>
      </ul>
    </section>

    <section>
      <h2>Baseline vs Prototype</h2>
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Baseline</th>
            <th>Prototype</th>
          </tr>
        </thead>
        <tbody>
          <tr><th>Accuracy</th><td>${formatPercent(baseline.accuracy)}</td><td>${formatPercent(prototype.accuracy)}</td></tr>
          <tr><th>Must-inject coverage</th><td>${formatPercent(baseline.mustInjectCoverage)}</td><td>${formatPercent(prototype.mustInjectCoverage)}</td></tr>
          <tr><th>Must-skip precision</th><td>${formatPercent(baseline.mustSkipPrecision)}</td><td>${formatPercent(prototype.mustSkipPrecision)}</td></tr>
          <tr><th>Uncertain-skip rate</th><td>${formatPercent(baseline.uncertainSkipRate)}</td><td>${formatPercent(prototype.uncertainSkipRate)}</td></tr>
          <tr><th>Low-confidence skips</th><td>${baseline.lowConfidenceSkipCount}</td><td>${prototype.lowConfidenceSkipCount}</td></tr>
        </tbody>
      </table>
    </section>

    <section>
      <h2>Snapshot Checks</h2>
      ${
        result.checks.pass
          ? "<p class=\"assertion-pass\">PASS: Browser snapshot matches expected output.</p>"
          : `<ul>${mismatches}</ul>`
      }
    </section>
  `;
}

function renderTaskModuleHost(title: string, description: string, mountId: string): string {
  return `
    <main class="validation-shell">
      <header class="validation-header">
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(description)}</p>
      </header>
      <section class="validation-results">
        <div id="${escapeHtml(mountId)}"></div>
      </section>
    </main>
  `;
}

function renderSentenceShortlistingLayout(): string {
  return `
    <main class="validation-shell">
      <header class="validation-header">
        <h1>Task 04: Sentence Shortlisting and Cache Validation</h1>
        <p>
          Browser benchmark harness for shortlist policy tradeoffs across fixtures and rerender cache replay.
        </p>
      </header>

      <section class="validation-controls">
        <button id="run-shortlisting-benchmark" type="button">Run Benchmark</button>
      </section>

      <section class="validation-results">
        <h2>Policy Summary</h2>
        <table>
          <thead>
            <tr>
              <th>Policy</th>
              <th class="numeric">Shortlisted</th>
              <th class="numeric">Unique Hashes</th>
              <th class="numeric">Analysis Calls</th>
              <th class="numeric">Calls Saved</th>
              <th class="numeric">Cache Hit Rate</th>
              <th class="numeric">False Negatives</th>
            </tr>
          </thead>
          <tbody id="shortlisting-policy-table-body"></tbody>
        </table>
      </section>

      <section class="validation-results">
        <h2>Scenario Breakdown</h2>
        <div id="shortlisting-scenarios"></div>
      </section>

      <section class="validation-results">
        <h2>Benchmark Assertions</h2>
        <ul id="shortlisting-assertions"></ul>
      </section>

      <section class="validation-raw">
        <h2>Context</h2>
        <pre id="shortlisting-context"></pre>
      </section>

      <section class="validation-raw">
        <h2>Raw JSON Output</h2>
        <pre id="shortlisting-json-output"></pre>
      </section>
    </main>
  `;
}

function renderSentenceSuitabilityLayout(): string {
  return `
    <main class="validation-shell">
      <header class="validation-header">
        <h1>Task 05: Sentence Suitability Validation</h1>
        <p>
          Browser harness comparing known-ratio baseline ranking and prototype multi-signal scoring.
        </p>
      </header>
      <section id="validation-status" class="status">Running validation...</section>
      <section id="validation-summary"></section>
      <section id="validation-profiles"></section>
    </main>
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

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
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
