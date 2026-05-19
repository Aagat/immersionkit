#!/usr/bin/env node

import { spawn } from "node:child_process";
import http from "node:http";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { getBrowserLaunchOptions } from "../browser-launch-mode.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);
const { validateSentenceSuitabilityResults } = require("./benchmark-gates.cjs");

const host = "127.0.0.1";
const port = 5173;
const validationUrl = `http://${host}:${port}/validation.html?lane=sentence-suitability&autorun=1`;
const outputPath = path.resolve(
  workspaceRoot,
  "fixtures/evals/sentence-suitability/browser-run-results.v1.json"
);
const pnpmBinary = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

let serverProcess;

try {
  serverProcess = spawn(
    pnpmBinary,
    [
      "--filter",
      "@immersionkit/extension",
      "exec",
      "vite",
      "--host",
      host,
      "--port",
      String(port),
      "--strictPort"
    ],
    {
      cwd: workspaceRoot,
      stdio: "inherit"
    }
  );

  await waitForHttpReady(validationUrl, 45_000, serverProcess);

  const playwright = await loadPlaywright();
  const { chromium } = playwright;
  const browser = await chromium.launch(getBrowserLaunchOptions());

  const captured = await runValidationInBrowser(browser, validationUrl);
  await browser.close();

  const checks = validateRequiredLifts(captured.results);
  const benchmarkGates = validateSentenceSuitabilityResults(captured.results);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        validationUrl,
        checks,
        benchmarkGates,
        results: captured.results
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  printSummary(captured.results, checks);
  console.log(`Saved output artifact: ${path.relative(workspaceRoot, outputPath)}`);

  if (checks.failures.length > 0 || !benchmarkGates.pass) {
    const failures = [
      ...checks.failures,
      ...benchmarkGates.failures
    ];
    throw new Error(`Sentence suitability checks failed: ${failures.join("; ")}`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Sentence suitability benchmark failed: ${message}`);
  process.exitCode = 1;
} finally {
  await stopServer(serverProcess);
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    const candidate = resolvePlaywrightFallbackPath();
    if (!candidate) {
      throw new Error(
        "Unable to import playwright. Install it locally or set IK_PLAYWRIGHT_INDEX to index.mjs."
      );
    }

    return await import(pathToFileURL(candidate).href);
  }
}

function resolvePlaywrightFallbackPath() {
  const envPath = process.env.IK_PLAYWRIGHT_INDEX;
  if (envPath && existsSync(envPath)) {
    return envPath;
  }

  const home = os.homedir();
  const codexBundled = path.join(
    home,
    ".cache",
    "codex-runtimes",
    "codex-primary-runtime",
    "dependencies",
    "node",
    "node_modules",
    "playwright",
    "index.mjs"
  );

  if (existsSync(codexBundled)) {
    return codexBundled;
  }

  return null;
}

async function runValidationInBrowser(browser, url) {
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.__ikSentenceSuitabilityResults), {
      timeout: 30_000
    });

    const results = await page.evaluate(() => window.__ikSentenceSuitabilityResults ?? null);

    if (!Array.isArray(results)) {
      throw new Error("Validation page did not expose sentence suitability results.");
    }

    return { results };
  } finally {
    await page.close();
  }
}

function validateRequiredLifts(results) {
  const checks = [
    {
      profileId: "beginner_a2",
      metricLabel: "Pairwise accuracy lift",
      selector: (result) => result.deltas.pairwiseAccuracy,
      minimum: 0.08
    },
    {
      profileId: "beginner_a2",
      metricLabel: "NDCG@5 lift",
      selector: (result) => result.deltas.ndcgAt5,
      minimum: 0.05
    },
    {
      profileId: "intermediate_b1",
      metricLabel: "Pairwise accuracy lift",
      selector: (result) => result.deltas.pairwiseAccuracy,
      minimum: 0.06
    },
    {
      profileId: "intermediate_b1",
      metricLabel: "NDCG@5 lift",
      selector: (result) => result.deltas.ndcgAt5,
      minimum: 0.04
    }
  ];

  const failures = [];
  const evaluations = [];

  for (const check of checks) {
    const result = results.find((entry) => entry.profileId === check.profileId);

    if (!result) {
      const message = `Missing profile: ${check.profileId}`;
      failures.push(message);
      evaluations.push({ ...check, actual: null, pass: false, message });
      continue;
    }

    const actual = check.selector(result);
    const pass = actual >= check.minimum;
    const message = `${result.profileDisplayName} ${check.metricLabel}: ${toPercent(actual)} (min ${toPercent(check.minimum)})`;

    evaluations.push({
      profileId: check.profileId,
      metricLabel: check.metricLabel,
      minimum: check.minimum,
      actual,
      pass,
      message
    });

    if (!pass) {
      failures.push(message);
    }
  }

  return {
    evaluations,
    failures,
    pass: failures.length === 0
  };
}

function printSummary(results, checks) {
  console.log("Sentence suitability benchmark completed.");

  for (const result of results) {
    console.log(
      `- ${result.profileDisplayName}: NDCG@5 ${result.baselineMetrics.ndcgAt5.toFixed(3)} -> ${result.suitabilityMetrics.ndcgAt5.toFixed(3)} (${toPercent(result.deltas.ndcgAt5)}), pairwise ${result.baselineMetrics.pairwiseAccuracy.toFixed(3)} -> ${result.suitabilityMetrics.pairwiseAccuracy.toFixed(3)} (${toPercent(result.deltas.pairwiseAccuracy)})`
    );
  }

  if (checks.pass) {
    console.log("- Required lift checks: PASS");
    return;
  }

  console.log("- Required lift checks: FAIL");
  for (const failure of checks.failures) {
    console.log(`  - ${failure}`);
  }
}

async function waitForHttpReady(url, timeoutMs, serverProcess) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (serverProcess && typeof serverProcess.exitCode === "number") {
      throw new Error("Validation server exited before it became ready.");
    }

    const ready = await isHttpReady(url);
    if (ready) {
      return;
    }

    await sleep(250);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function isHttpReady(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(Boolean(response.statusCode) && response.statusCode < 500);
    });

    request.on("error", () => {
      resolve(false);
    });

    request.setTimeout(2_000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function stopServer(processHandle) {
  if (!processHandle || processHandle.killed) {
    return;
  }

  processHandle.kill("SIGINT");

  const exited = await Promise.race([
    onceExit(processHandle),
    sleep(5_000).then(() => false)
  ]);

  if (exited) {
    return;
  }

  processHandle.kill("SIGKILL");
  await onceExit(processHandle);
}

function onceExit(processHandle) {
  return new Promise((resolve) => {
    processHandle.once("exit", () => {
      resolve(true);
    });
  });
}

function toPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
