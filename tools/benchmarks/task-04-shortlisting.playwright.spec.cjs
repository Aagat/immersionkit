const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("playwright/test");

const inputProfile = process.env.IK_BENCHMARK_INPUT_PROFILE ?? "baseline";
const validationUrl = `http://127.0.0.1:5173/validation.html?task=sentence-shortlisting&autorun=1&inputProfile=${encodeURIComponent(
  inputProfile
)}`;
const outputPath = path.resolve(
  __dirname,
  "../../fixtures/evals/sentence-shortlisting/browser-benchmark-output.json"
);

test("task-04 sentence shortlisting benchmark", async ({ page }) => {
  await page.goto(validationUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__IK_SHORTLISTING_BENCHMARK__), null, {
    timeout: 10000
  });

  const result = await page.evaluate(() => window.__IK_SHORTLISTING_BENCHMARK__);
  expect(result).toBeTruthy();

  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
});
