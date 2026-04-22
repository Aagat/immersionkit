#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFilePath);
const projectRoot = path.resolve(currentDirectory, "../..");

const host = process.env.IK_VALIDATION_HOST ?? "127.0.0.1";
const configuredPort = process.env.IK_VALIDATION_PORT
  ? Number.parseInt(process.env.IK_VALIDATION_PORT, 10)
  : undefined;
const basePort = configuredPort ?? 5173;
const validationPath =
  process.env.IK_VALIDATION_PATH ??
  "/validation.html?task=phrase-detection&autorun=1";
const outputPath = path.resolve(
  projectRoot,
  "fixtures/evals/phrase-detection/browser-run-results.v1.json"
);
const pnpmBinary = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

let devServerProcess;
let shuttingDown = false;

registerSignalHandlers();

try {
  const selectedPort = await choosePort(host, basePort, configuredPort !== undefined);
  const validationUrl = `http://${host}:${selectedPort}${validationPath}`;

  log(`Starting extension dev server for Task 03 benchmark on ${host}:${selectedPort}...`);
  devServerProcess = startDevServer(host, selectedPort, configuredPort !== undefined);
  await waitForHttpReady(validationUrl, 45_000);

  const playwright = await loadPlaywright();
  const payload = await runBrowserValidation(playwright, validationUrl);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  printSummary(payload);
  log(`Saved machine-readable output to ${path.relative(projectRoot, outputPath)}`);

  const failedAssertions = (payload.assertions ?? []).filter(
    (assertion) => !assertion.passed
  );
  if (failedAssertions.length > 0) {
    throw new Error(
      `Browser assertions failed: ${failedAssertions
        .map((assertion) => assertion.name)
        .join(", ")}`
    );
  }

  log("Task 03 benchmark finished successfully.");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n[task-03] Benchmark failed: ${message}`);
  process.exitCode = 1;
} finally {
  await shutdown();
}

async function choosePort(serverHost, preferredPort, requireExact) {
  if (requireExact) {
    return preferredPort;
  }

  for (let offset = 0; offset < 20; offset += 1) {
    const candidatePort = preferredPort + offset;
    const available = await canBindPort(serverHost, candidatePort);
    if (available) {
      if (offset > 0) {
        log(`Port ${preferredPort} is in use. Using available port ${candidatePort} instead.`);
      }
      return candidatePort;
    }
  }

  throw new Error(`Could not find an available port near ${preferredPort}.`);
}

function canBindPort(serverHost, serverPort) {
  return new Promise((resolve) => {
    const testServer = net.createServer();

    testServer.once("error", () => {
      resolve(false);
    });

    testServer.listen(serverPort, serverHost, () => {
      testServer.close(() => resolve(true));
    });
  });
}

function registerSignalHandlers() {
  const handleSignal = async (signal) => {
    if (shuttingDown) {
      return;
    }

    log(`Received ${signal}, shutting down...`);
    process.exitCode = 1;
    await shutdown();
    process.exit();
  };

  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);
}

function startDevServer(serverHost, serverPort, strictPort) {
  const args = [
    "--filter",
    "@immersionkit/extension",
    "exec",
    "vite",
    "--host",
    serverHost,
    "--port",
    String(serverPort)
  ];

  if (strictPort) {
    args.push("--strictPort");
  }

  const child = spawn(pnpmBinary, args, {
    cwd: projectRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      FORCE_COLOR: "0"
    }
  });

  child.stdout.on("data", (chunk) => {
    if (shuttingDown) {
      return;
    }

    const output = String(chunk).trim();
    if (output.length > 0) {
      console.log(`[task-03][dev] ${output}`);
    }
  });

  child.stderr.on("data", (chunk) => {
    if (shuttingDown) {
      return;
    }

    const output = String(chunk).trim();
    if (output.length > 0) {
      console.error(`[task-03][dev] ${output}`);
    }
  });

  child.on("exit", (code) => {
    if (!shuttingDown && code !== 0) {
      console.error(`[task-03] Dev server exited unexpectedly with code ${code}.`);
    }
  });

  return child;
}

async function waitForHttpReady(url, timeoutMs) {
  const start = Date.now();
  let lastError = null;

  while (Date.now() - start < timeoutMs) {
    if (devServerProcess?.exitCode !== null) {
      throw new Error(
        `Validation server exited before becoming ready (exit code ${devServerProcess.exitCode}).`
      );
    }

    try {
      const statusCode = await requestStatusCode(url);
      if (typeof statusCode === "number" && statusCode >= 200 && statusCode < 500) {
        log(`Validation page is reachable at ${url}`);
        return;
      }

      lastError = new Error(`Received HTTP ${statusCode}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(500);
  }

  throw new Error(
    `Timed out waiting for ${url}. Last error: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

function requestStatusCode(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    });

    request.on("error", reject);
    request.setTimeout(4_000, () => {
      request.destroy(new Error("HTTP readiness request timed out"));
    });
  });
}

async function runBrowserValidation(playwrightModule, url) {
  const { chromium } = playwrightModule;
  const launchOptions = {
    headless: true
  };

  const executablePath = resolveBrowserExecutable();
  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }

  const browser = await chromium.launch(launchOptions);

  try {
    const page = await browser.newPage();
    await page.goto(url, {
      waitUntil: "networkidle"
    });

    await page.waitForSelector("body[data-validation-status]", {
      timeout: 180_000
    });

    const status = await page.getAttribute("body", "data-validation-status");
    if (status !== "pass") {
      const errorPayload = await page.evaluate(
        () => window.__IK_PHRASE_DETECTION_VALIDATION__ ?? null
      );
      if (!errorPayload) {
        throw new Error("Validation page completed with a failing status and no payload.");
      }
    }

    const payload = await page.evaluate(
      () => window.__IK_PHRASE_DETECTION_VALIDATION__ ?? null
    );

    if (!payload) {
      throw new Error("Validation page loaded but returned no phrase detection payload.");
    }

    return payload;
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

function resolveBrowserExecutable() {
  const configuredBinary = process.env.IK_CHROME_BIN ?? process.env.CHROME_BIN;
  if (configuredBinary && configuredBinary.trim().length > 0) {
    return configuredBinary;
  }

  return undefined;
}

function printSummary(payload) {
  console.log("");
  console.log("[task-03] Browser benchmark summary");

  const implementations = Array.isArray(payload?.implementations)
    ? payload.implementations
    : [];

  for (const implementation of implementations) {
    const overall = implementation?.overall ?? {};
    const runtime = implementation?.runtime ?? {};
    console.log(`  ${implementation.label} (${implementation.inputMode})`);
    console.log(
      `    precision: ${formatPercent(overall.precision)} (${overall.truePositives} TP / ${overall.falsePositives} FP)`
    );
    console.log(
      `    recall:    ${formatPercent(overall.recall)} (${overall.truePositives} TP / ${overall.falseNegatives} FN)`
    );
    console.log(
      `    runtime:   ${formatMilliseconds(runtime.totalMs)} total / ${formatMilliseconds(
        runtime.averageCaseMs
      )} avg per case across ${runtime.repeatCount ?? 1} passes`
    );
  }
}

function formatPercent(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "0.0%";
  }

  return `${(value * 100).toFixed(1)}%`;
}

function formatMilliseconds(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "0.000 ms";
  }

  return `${value.toFixed(3)} ms`;
}

async function shutdown() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  await stopDevServer(devServerProcess);
}

async function stopDevServer(child) {
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

function log(message) {
  console.log(`[task-03] ${message}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
