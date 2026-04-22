#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");
const VALIDATION_URL =
  "http://127.0.0.1:5174/validation.html?task=contextual-word-injection&autorun=1";
const OUTPUT_PATH = path.resolve(
  REPO_ROOT,
  "fixtures/evals/word-injection/browser-run-results.v1.json"
);
const SERVER_READY_TIMEOUT_MS = 45_000;

let serverProcess;

try {
  serverProcess = startValidationServer();
  await waitForServer(serverProcess, VALIDATION_URL, SERVER_READY_TIMEOUT_MS);

  const playwright = await loadPlaywright();
  const runPayload = await runBrowserValidation(playwright);

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(runPayload, null, 2)}\n`, "utf8");

  const summary = runPayload.result?.summary;
  const checks = runPayload.result?.checks;

  console.log("Task 02 benchmark completed.");
  console.log(`Validation URL: ${VALIDATION_URL}`);
  console.log(`Output artifact: ${OUTPUT_PATH}`);
  if (summary) {
    console.log(`Cases: ${summary.totalCases}`);
    console.log(
      `Baseline must-skip precision: ${formatPercent(summary.baseline.mustSkipPrecision)}`
    );
    console.log(
      `Prototype must-skip precision: ${formatPercent(summary.prototype.mustSkipPrecision)}`
    );
    console.log(
      `Prototype must-inject coverage: ${formatPercent(summary.prototype.mustInjectCoverage)}`
    );
  }

  if (!checks?.pass || runPayload.status !== "pass") {
    console.error("Validation snapshot checks failed. See output artifact for mismatches.");
    process.exitCode = 1;
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Task 02 benchmark failed: ${message}`);
  process.exitCode = 1;
} finally {
  await stopValidationServer(serverProcess);
}

function startValidationServer() {
  const child = spawn(
    "pnpm",
    [
      "--filter",
      "@immersionkit/extension",
      "exec",
      "vite",
      "--config",
      "src/validation/vite.validation.config.mjs"
    ],
    {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env
    }
  );

  child.stdout?.on("data", (chunk) => {
    const text = String(chunk);
    if (text.includes("ready in") || text.includes("Local:")) {
      process.stdout.write(`[task-02:vite] ${text}`);
    }
  });

  child.stderr?.on("data", (chunk) => {
    process.stderr.write(`[task-02:vite] ${String(chunk)}`);
  });

  child.on("exit", (code, signal) => {
    if (code !== null && code !== 0) {
      process.stderr.write(
        `[task-02:vite] exited unexpectedly with code ${code}.\n`
      );
    }

    if (signal) {
      process.stderr.write(`[task-02:vite] exited with signal ${signal}.\n`);
    }
  });

  return child;
}

async function waitForServer(child, url, timeoutMs) {
  const start = Date.now();
  let lastError;

  while (Date.now() - start < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(
        `Validation server exited before becoming ready (exit code ${child.exitCode}).`
      );
    }

    try {
      const response = await fetch(url, {
        method: "GET"
      });

      if (response.ok) {
        return;
      }

      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(250);
  }

  throw new Error(
    `Timed out waiting for validation server at ${url}. Last error: ${String(lastError)}`
  );
}

async function runBrowserValidation(playwrightModule) {
  const { chromium } = playwrightModule;
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.goto(VALIDATION_URL, {
      waitUntil: "networkidle"
    });
    await page.waitForSelector("body[data-validation-status]", {
      timeout: 20_000
    });

    const status = await page.getAttribute("body", "data-validation-status");
    const result = await page.evaluate(
      () => window.__IK_WORD_INJECTION_VALIDATION__ ?? null
    );

    if (!result) {
      throw new Error("Validation page loaded but returned no benchmark payload.");
    }

    return {
      capturedAt: new Date().toISOString(),
      status,
      result
    };
  } finally {
    await browser.close();
  }
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

async function stopValidationServer(child) {
  if (!child || child.killed || child.exitCode !== null) {
    return;
  }

  child.kill("SIGTERM");

  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    sleep(5_000)
  ]);

  if (child.exitCode === null && !child.killed) {
    child.kill("SIGKILL");
  }
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
