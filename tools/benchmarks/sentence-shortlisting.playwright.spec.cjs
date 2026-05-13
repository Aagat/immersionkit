const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("playwright/test");
const { validateSentenceShortlistingPayload } = require("./benchmark-gates.cjs");

const inputProfile = process.env.IK_BENCHMARK_INPUT_PROFILE ?? "baseline";
const validationUrl = `http://127.0.0.1:5173/validation.html?lane=sentence-shortlisting&autorun=1&inputProfile=${encodeURIComponent(
  inputProfile
)}`;
const outputPath = resolveOutputPath(inputProfile);

test("sentence shortlisting benchmark", async ({ page }) => {
  await page.goto(validationUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__IK_SHORTLISTING_BENCHMARK__), null, {
    timeout: 10000
  });

  const result = await page.evaluate(() => window.__IK_SHORTLISTING_BENCHMARK__);
  expect(result).toBeTruthy();

  const benchmarkGates = validateSentenceShortlistingPayload(result);
  result.benchmarkGates = benchmarkGates;

  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  expect(benchmarkGates.failures).toEqual([]);
});

function resolveOutputPath(profile) {
  const normalized = String(profile).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  const suffix = normalized === "baseline" ? "" : `.${normalized}`;

  return path.resolve(
    __dirname,
    `../../fixtures/evals/sentence-shortlisting/browser-benchmark-output${suffix}.json`
  );
}
