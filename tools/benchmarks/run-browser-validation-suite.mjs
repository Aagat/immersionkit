#!/usr/bin/env node

import { spawn } from "node:child_process";

const pnpmBinary = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const inputProfile = resolveInputProfile(process.argv.slice(2));
const benchmarkEnv = inputProfile
  ? {
      IK_BENCHMARK_INPUT_PROFILE: inputProfile
    }
  : {};

const tasks = [
  {
    id: "task-01",
    label: "Task 01: Background NLP performance",
    command: [pnpmBinary, ["benchmark:task-01"]]
  },
  {
    id: "task-02",
    label: "Task 02: Contextual word injection",
    command: [pnpmBinary, ["benchmark:task-02"]]
  },
  {
    id: "task-03",
    label: "Task 03: Phrase detection",
    command: [pnpmBinary, ["benchmark:task-03"]]
  },
  {
    id: "task-04",
    label: "Task 04: Sentence shortlisting and cache",
    command: [pnpmBinary, ["benchmark:task-04"]]
  },
  {
    id: "task-05",
    label: "Task 05: Sentence suitability scoring",
    command: [pnpmBinary, ["benchmark:task-05"]]
  }
];

console.log("Running ImmersionKit browser validation suite...");
console.log("Canonical entrypoint: pnpm benchmark");
if (inputProfile) {
  console.log(`Input profile override: ${inputProfile}`);
}

for (const task of tasks) {
  console.log(`\n[suite] ${task.label}`);
  const [command, args] = task.command;
  await run(command, args, benchmarkEnv);
}

console.log("\nImmersionKit browser validation suite completed successfully.");

function run(command, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: {
        ...process.env,
        ...extraEnv
      }
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Command failed (${code}): ${command} ${args.join(" ")}`));
    });
  });
}

function resolveInputProfile(argv) {
  const validProfiles = new Set([
    "tiny",
    "small",
    "baseline",
    "large",
    "xlarge",
    "xxlarge"
  ]);

  for (const rawArg of argv) {
    if (!rawArg.startsWith("--input-profile=")) {
      continue;
    }

    const value = rawArg.slice("--input-profile=".length).trim().toLowerCase();
    if (validProfiles.has(value)) {
      return value;
    }
  }

  const envValue = process.env.IK_BENCHMARK_INPUT_PROFILE?.trim().toLowerCase();
  if (envValue && validProfiles.has(envValue)) {
    return envValue;
  }

  return null;
}
