import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { createServer } from "vite";

const scriptFile = fileURLToPath(import.meta.url);
const validationDirectory = path.dirname(scriptFile);
const extensionDirectory = path.resolve(validationDirectory, "../..");
const repositoryRoot = path.resolve(extensionDirectory, "../..");
const outputDirectory = path.resolve(
  repositoryRoot,
  "fixtures/evals/nlp-performance"
);

const includeWinkNlp = process.env.IK_INCLUDE_WINK_NLP !== "0";
const inputProfile = process.env.IK_BENCHMARK_INPUT_PROFILE ?? "baseline";
const port = Number.parseInt(process.env.IK_VALIDATION_PORT ?? "4173", 10);
const outputProfileSuffix = resolveProfileSuffix(inputProfile);

async function run() {
  const server = await createServer({
    root: extensionDirectory,
    configFile: path.resolve(extensionDirectory, "vite.config.ts"),
    logLevel: "error",
    server: {
      host: "127.0.0.1",
      port,
      strictPort: true
    }
  });

  await server.listen();

  const browser = await chromium.launch({
    headless: true
  });

  try {
    const page = await browser.newPage();
    const benchmarkUrl = `http://127.0.0.1:${port}/validation.html?lane=nlp-performance&autorun=1&inputProfile=${encodeURIComponent(
      inputProfile
    )}${includeWinkNlp ? "" : "&includeWink=0"}`;

    await page.goto(benchmarkUrl, {
      waitUntil: "domcontentloaded"
    });

    await page.waitForFunction(() => Boolean(window.__IK_NLP_PERFORMANCE_RESULT__), {
      timeout: 180000
    });

    const benchmarkResult = await page.evaluate(() =>
      window.__IK_NLP_PERFORMANCE_RESULT__
    );

    if (!benchmarkResult) {
      throw new Error("Benchmark page did not produce a result payload.");
    }

    const summaryPath = path.resolve(
      outputDirectory,
      `browser-benchmark-results.v1${outputProfileSuffix}.json`
    );
    await writeFile(summaryPath, JSON.stringify(benchmarkResult, null, 2), "utf8");

    const compromiseThree = benchmarkResult.analyzerResults.find(
      (entry) => entry.analyzerId === "compromise-three" && !entry.skipped
    );

    const sampleSnapshots = compromiseThree?.sampleSnapshots ?? [];
    const snapshotsPath = path.resolve(
      outputDirectory,
      `sample-analysis-snapshots.v1${outputProfileSuffix}.json`
    );

    await writeFile(
      snapshotsPath,
      JSON.stringify(
        {
          schemaVersion: "v1",
          generatedAt: benchmarkResult.generatedAt,
          sourceAnalyzer: compromiseThree?.analyzerId ?? "unavailable",
          sentenceCount: sampleSnapshots.length,
          snapshots: sampleSnapshots
        },
        null,
        2
      ),
      "utf8"
    );

    printSummary(benchmarkResult, summaryPath, snapshotsPath);

    const failingAssertions = [
      ...benchmarkResult.assertions.filter((assertion) => !assertion.pass),
      ...benchmarkResult.analyzerResults.flatMap((entry) => {
        if (entry.skipped) {
          return [];
        }

        return entry.assertions.filter((assertion) => !assertion.pass);
      })
    ];

    if (failingAssertions.length > 0) {
      throw new Error(
        `Benchmark assertions failed: ${failingAssertions
          .map((assertion) => assertion.id)
          .join(", ")}`
      );
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

function resolveProfileSuffix(profile) {
  const normalized = String(profile).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  return normalized === "baseline" ? "" : `.${normalized}`;
}

function printSummary(result, summaryPath, snapshotsPath) {
  console.log("ImmersionKit NLP benchmark completed.");
  console.log(`Generated at: ${result.generatedAt}`);
  console.log(`Input profile: ${result.runOptions.inputProfile}`);
  console.log(`Summary JSON: ${summaryPath}`);
  console.log(`Sample snapshots: ${snapshotsPath}`);

  for (const entry of result.analyzerResults) {
    if (entry.skipped) {
      console.log(`- ${entry.analyzerId}: SKIPPED (${entry.reason})`);
      continue;
    }

    console.log(
      `- ${entry.analyzerId}: cold=${entry.coldStartLatencyMs.toFixed(
        2
      )}ms, hot=${entry.hotPerSentenceLatencyMs.toFixed(
        4
      )}ms, medium=${entry.mediumBatch.totalLatencyMs.toFixed(
        2
      )}ms, payload=${entry.payload.averageBytesPerSentence.toFixed(
        1
      )}B, cache-hit=${(entry.cacheReplay.simulatedHitRate * 100).toFixed(
        1
      )}%, deterministic=${(entry.determinism.stableRate * 100).toFixed(
        1
      )}%, quality-token=${(entry.quality.averageTokenCoverage * 100).toFixed(
        1
      )}%, quality-precision=${(entry.quality.phrasePrecision * 100).toFixed(
        1
      )}%, quality-recall=${(entry.quality.averagePhraseRecall * 100).toFixed(
        1
      )}%, quality-f1=${(entry.quality.phraseF1 * 100).toFixed(1)}%`
    );
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
