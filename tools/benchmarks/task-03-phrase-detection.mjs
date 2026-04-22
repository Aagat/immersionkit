#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFilePath);
const projectRoot = path.resolve(currentDirectory, "../..");

const host = process.env.IK_VALIDATION_HOST ?? "127.0.0.1";
const configuredPort = process.env.IK_VALIDATION_PORT
  ? Number.parseInt(process.env.IK_VALIDATION_PORT, 10)
  : undefined;
const basePort = configuredPort ?? 5173;
const validationPath = process.env.IK_VALIDATION_PATH ?? "/validation.html";
const outputPath = path.resolve(
  projectRoot,
  "fixtures/evals/phrase-detection/last-run.browser.json"
);

let devServerProcess;
let chromeProfileDirectory = "";
let shuttingDown = false;

registerSignalHandlers();

try {
  const selectedPort = await choosePort(host, basePort, configuredPort !== undefined);
  const validationUrl = `http://${host}:${selectedPort}${validationPath}`;

  log(`Starting extension dev server for Task 03 benchmark on ${host}:${selectedPort}...`);
  devServerProcess = startDevServer(host, selectedPort);
  await waitForHttpReady(validationUrl, 45_000);

  const chromeBinary = resolveChromeBinary();
  chromeProfileDirectory = mkdtempSync(path.join(tmpdir(), "ik-task03-chrome-"));

  log(`Running headless browser validation via ${chromeBinary}...`);
  const htmlOutput = runHeadlessBrowserDump(chromeBinary, validationUrl, chromeProfileDirectory);
  const payload = extractValidationPayload(htmlOutput);

  ensureDirectory(path.dirname(outputPath));
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

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

function startDevServer(serverHost, serverPort) {
  const child = spawn(
    "pnpm",
    [
      "--filter",
      "@immersionkit/extension",
      "dev",
      "--host",
      serverHost,
      "--port",
      String(serverPort)
    ],
    {
      cwd: projectRoot,
      stdio: "pipe",
      env: {
        ...process.env,
        FORCE_COLOR: "0"
      }
    }
  );

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

function resolveChromeBinary() {
  const configuredBinary = process.env.IK_CHROME_BIN ?? process.env.CHROME_BIN;
  if (configuredBinary && configuredBinary.trim().length > 0) {
    if (isExecutablePath(configuredBinary) || canResolveCommand(configuredBinary)) {
      return configuredBinary;
    }

    throw new Error(
      `IK_CHROME_BIN/CHROME_BIN was set to "${configuredBinary}" but no executable was found.`
    );
  }

  const absoluteCandidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium"
  ];
  for (const candidate of absoluteCandidates) {
    if (isExecutablePath(candidate)) {
      return candidate;
    }
  }

  const commandCandidates = [
    "google-chrome",
    "google-chrome-stable",
    "chromium-browser",
    "chromium",
    "chrome"
  ];
  for (const candidate of commandCandidates) {
    if (canResolveCommand(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    "Could not find Chrome/Chromium. Install Chrome or set IK_CHROME_BIN to a browser executable."
  );
}

function isExecutablePath(candidatePath) {
  return existsSync(candidatePath);
}

function canResolveCommand(commandName) {
  const resolution = spawnSync("which", [commandName], {
    cwd: projectRoot,
    encoding: "utf8"
  });
  return resolution.status === 0;
}

function runHeadlessBrowserDump(browserBinary, url, userDataDirectory) {
  const browserRun = spawnSync(
    browserBinary,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-sync",
      "--metrics-recording-only",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${userDataDirectory}`,
      "--virtual-time-budget=10000",
      "--dump-dom",
      url
    ],
    {
      cwd: projectRoot,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      timeout: 30_000,
      killSignal: "SIGKILL"
    }
  );

  const stdout = browserRun.stdout ?? "";
  if (browserRun.error && browserRun.error.name === "Error") {
    const timedOut = "code" in browserRun.error && browserRun.error.code === "ETIMEDOUT";
    if (timedOut && stdout.includes('id="validation-json"')) {
      log("Headless browser timed out after DOM dump; continuing with captured output.");
      return stdout;
    }

    throw new Error(
      `Headless browser execution error: ${browserRun.error.message}${
        timedOut ? " (timed out before a usable DOM payload was captured)" : ""
      }`
    );
  }

  if (browserRun.status !== 0) {
    const stderr = browserRun.stderr?.trim() ?? "";
    throw new Error(
      `Headless browser execution failed with code ${browserRun.status}. ${stderr}`
    );
  }

  return stdout;
}

function extractValidationPayload(htmlOutput) {
  const preTagPattern = /<pre id="validation-json">([\s\S]*?)<\/pre>/;
  const match = htmlOutput.match(preTagPattern);
  if (!match || !match[1]) {
    throw new Error(
      "Could not locate <pre id=\"validation-json\"> in validation page output."
    );
  }

  const jsonText = decodeHtmlEntities(match[1]).trim();
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new Error(
      `Failed to parse validation JSON payload. ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function decodeHtmlEntities(input) {
  return input
    .replaceAll("&quot;", "\"")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&#39;", "'");
}

function printSummary(payload) {
  const overall = payload?.overall ?? {};
  console.log("");
  console.log("[task-03] Browser benchmark summary");
  console.log(`  precision: ${formatPercent(overall.precision)} (${overall.truePositives} TP / ${overall.falsePositives} FP)`);
  console.log(`  recall:    ${formatPercent(overall.recall)} (${overall.truePositives} TP / ${overall.falseNegatives} FN)`);

  const metrics = Array.isArray(payload?.categoryMetrics) ? payload.categoryMetrics : [];
  if (metrics.length > 0) {
    console.log("  category metrics:");
    for (const categoryMetric of metrics) {
      console.log(
        `    - ${categoryMetric.category}: precision ${formatPercent(
          categoryMetric.precision
        )}, recall ${formatPercent(categoryMetric.recall)}`
      );
    }
  }
}

function formatPercent(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "0.0%";
  }

  return `${(value * 100).toFixed(1)}%`;
}

function ensureDirectory(directoryPath) {
  if (!existsSync(directoryPath)) {
    mkdirSync(directoryPath, { recursive: true });
  }
}

async function shutdown() {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  await stopDevServer();
  cleanupChromeProfile();
}

async function stopDevServer() {
  if (!devServerProcess || devServerProcess.killed) {
    return;
  }

  const child = devServerProcess;
  await new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };

    child.once("exit", finish);
    child.kill("SIGTERM");

    setTimeout(() => {
      if (!done) {
        child.kill("SIGKILL");
      }
    }, 3_000);

    setTimeout(finish, 4_000);
  });
}

function cleanupChromeProfile() {
  if (!chromeProfileDirectory) {
    return;
  }

  rmSync(chromeProfileDirectory, {
    recursive: true,
    force: true
  });
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function log(message) {
  console.log(`[task-03] ${message}`);
}
