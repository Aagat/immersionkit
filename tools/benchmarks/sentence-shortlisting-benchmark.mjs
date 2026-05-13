import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "../..");

const shortlistingInputProfile = process.env.IK_BENCHMARK_INPUT_PROFILE ?? "baseline";
const validationUrl = `http://127.0.0.1:5173/validation.html?lane=sentence-shortlisting&autorun=1&inputProfile=${encodeURIComponent(
  shortlistingInputProfile
)}`;
const playwrightSpecPath = path.join(
  workspaceRoot,
  "tools/benchmarks/sentence-shortlisting.playwright.spec.cjs"
);

const pnpmBinary = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

async function main() {
  console.log(`Sentence shortlisting input profile: ${shortlistingInputProfile}`);

  const server = spawn(
    pnpmBinary,
    [
      "--filter",
      "@immersionkit/extension",
      "exec",
      "vite",
      "--host",
      "127.0.0.1",
      "--port",
      "5173",
      "--strictPort"
    ],
    {
      cwd: workspaceRoot,
      stdio: "inherit"
    }
  );

  try {
    await waitForHttpReady(validationUrl, 30_000, server);

    await runCommand(pnpmBinary, [
      "exec",
      "playwright",
      "test",
      playwrightSpecPath,
      "--reporter=line",
      "--workers=1"
    ]);

    await runCommand(pnpmBinary, [
      "--filter",
      "@immersionkit/extension",
      "exec",
      "vitest",
      "run",
      "__tests__/sentence-shortlisting-validation.test.ts"
    ]);

    console.log("Sentence shortlisting benchmark run completed successfully.");
  } finally {
    await stopServer(server);
  }
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: workspaceRoot,
      stdio: "inherit"
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Command failed with exit code ${code}: ${command} ${args.join(" ")}`));
    });
  });
}

async function waitForHttpReady(url, timeoutMs, serverProcess) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (typeof serverProcess.exitCode === "number") {
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

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
