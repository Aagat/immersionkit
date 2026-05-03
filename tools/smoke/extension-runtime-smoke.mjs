import { createServer } from "node:http";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const extensionPath = join(repoRoot, "apps/extension/dist");
const require = createRequire(join(repoRoot, "apps/extension/package.json"));
const { chromium } = require("playwright");
const userDataDir = await mkdtemp(join(tmpdir(), "ik-extension-smoke-"));

if (!existsSync(join(extensionPath, "manifest.json"))) {
  throw new Error(
    "Built extension not found. Run `pnpm build` before `pnpm smoke:extension`, or use `pnpm smoke:extension:build`."
  );
}

const serviceWorkerLoader = await readFile(
  join(extensionPath, "service-worker-loader.js"),
  "utf8"
);
if (serviceWorkerLoader.includes("localhost:")) {
  throw new Error(
    "Extension dist appears to contain a dev service worker. Run `pnpm build` before `pnpm smoke:extension`, or use `pnpm smoke:extension:build`."
  );
}

const pageHtml = await readFile(
  join(repoRoot, "fixtures/pages/article-spec-workflow.html"),
  "utf8"
);

const server = createServer((_, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(pageHtml);
});

await new Promise((resolveServer, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    server.off("error", reject);
    resolveServer();
  });
});

const address = server.address();
if (!address || typeof address === "string") {
  throw new Error("Failed to start local smoke server.");
}

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`
  ]
});

try {
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker", { timeout: 10_000 });
  }

  serviceWorker.on("console", (message) => {
    console.log(`[service-worker:${message.type()}] ${message.text()}`);
  });

  await serviceWorker.evaluate(async () => {
    await chrome.storage.local.set({
      "immersionkit.settings": {
        enabled: true,
        discoveryRate: 1,
        targetLanguage: "es",
        sentenceTranslationEnabled: false,
        provider: "none"
      }
    });
  });

  const page = await context.newPage();
  page.on("console", (message) => {
    console.log(`[page:${message.type()}] ${message.text()}`);
  });

  await page.goto(`http://127.0.0.1:${address.port}/`, {
    waitUntil: "domcontentloaded"
  });
  await page.waitForSelector("[data-ik-token-id]", { timeout: 10_000 });
  await page.waitForTimeout(8_000);

  const contentSnapshot = await page.evaluate(() => ({
    injectedTokens: document.querySelectorAll("[data-ik-token-id]").length,
    sentenceCandidateWrappers: document.querySelectorAll(
      "[data-ik-sentence-candidate-hashes]"
    ).length,
    phraseHintWrappers: document.querySelectorAll("[data-ik-phrase-hints]").length,
    rootBooted: document.documentElement.hasAttribute("data-immersionkit-root"),
    textContent: document.body.textContent ?? "",
    codeBlockText: document.querySelector("pre code")?.textContent ?? ""
  }));

  const storageSnapshot = await serviceWorker.evaluate(async () => {
    const values = await chrome.storage.local.get([
      "immersionkit.sentenceAnalysisCache",
      "immersionkit.sentenceCache",
      "immersionkit.settings"
    ]);
    const legacyAnalysisCache = values["immersionkit.sentenceAnalysisCache"] ?? {};
    const legacyTranslationCache = values["immersionkit.sentenceCache"] ?? {};
    const indexedDbSnapshot = await new Promise((resolve) => {
      const request = indexedDB.open("immersionkit-extension");

      request.onerror = () => {
        resolve({
          analysisCacheEntries: 0,
          translationCacheEntries: 0,
          firstAnalysisEntry: null
        });
      };

      request.onsuccess = () => {
        const database = request.result;
        const readStore = (storeName) =>
          new Promise((resolveStore) => {
            if (!database.objectStoreNames.contains(storeName)) {
              resolveStore([]);
              return;
            }

            const store = database.transaction(storeName, "readonly").objectStore(storeName);
            const allRequest = store.getAll();
            allRequest.onsuccess = () => {
              resolveStore(allRequest.result ?? []);
            };
            allRequest.onerror = () => {
              resolveStore([]);
            };
          });

        Promise.all([
          readStore("sentence-analysis-cache"),
          readStore("sentence-cache")
        ]).then(([analysisEntries, translationEntries]) => {
          database.close();
          resolve({
            analysisCacheEntries: analysisEntries.length,
            translationCacheEntries: translationEntries.length,
            firstAnalysisEntry: analysisEntries[0] ?? null
          });
        });
      };
    });

    return {
      analysisCacheEntries:
        indexedDbSnapshot.analysisCacheEntries +
        Object.keys(legacyAnalysisCache).length,
      translationCacheEntries:
        indexedDbSnapshot.translationCacheEntries +
        Object.keys(legacyTranslationCache).length,
      settings: values["immersionkit.settings"] ?? null,
      firstAnalysisEntry:
        indexedDbSnapshot.firstAnalysisEntry ??
        Object.values(legacyAnalysisCache)[0] ??
        null
    };
  });

  const firstEntry = storageSnapshot.firstAnalysisEntry;
  const analysisShape =
    firstEntry && typeof firstEntry === "object"
      ? {
          analyzerId: firstEntry.analyzerId,
          tokenCount: Array.isArray(firstEntry.tokens) ? firstEntry.tokens.length : 0,
          phraseMatches: Array.isArray(firstEntry.phraseMatches)
            ? firstEntry.phraseMatches.length
            : 0,
          contextualWordCandidates: Array.isArray(
            firstEntry.contextualWordCandidates
          )
            ? firstEntry.contextualWordCandidates.length
            : 0
        }
      : null;

  const summary = {
    contentSnapshot: {
      injectedTokens: contentSnapshot.injectedTokens,
      sentenceCandidateWrappers: contentSnapshot.sentenceCandidateWrappers,
      phraseHintWrappers: contentSnapshot.phraseHintWrappers,
      rootBooted: contentSnapshot.rootBooted,
      codeBlockPresent: contentSnapshot.codeBlockText.includes("account-export")
    },
    storageSnapshot: {
      analysisCacheEntries: storageSnapshot.analysisCacheEntries,
      translationCacheEntries: storageSnapshot.translationCacheEntries,
      settings: storageSnapshot.settings,
      analysisShape
    }
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!contentSnapshot.rootBooted) {
    throw new Error("Content script did not boot.");
  }
  if (contentSnapshot.injectedTokens < 1) {
    throw new Error("No injected tokens rendered.");
  }
  if (contentSnapshot.sentenceCandidateWrappers < 1) {
    throw new Error("No sentence candidates were marked.");
  }
  assertSpecWorkflowReplacementQuality(contentSnapshot);
  if (storageSnapshot.analysisCacheEntries < 1) {
    throw new Error("No background sentence analysis cache entries were written.");
  }
  if (!analysisShape || analysisShape.analyzerId !== "wink-nlp") {
    throw new Error("Background analysis did not use wink-nlp.");
  }
} finally {
  await context.close();
  await new Promise((resolveServer) => server.close(resolveServer));
  await rm(userDataDir, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 100
  });
}

function assertSpecWorkflowReplacementQuality(contentSnapshot) {
  const text = contentSnapshot.textContent;
  const codeBlockText = contentSnapshot.codeBlockText;
  const requiredOriginalSnippets = [
    "Like any workflow",
    "not need to write release maps",
    "feature boundary or slice is up to you",
    "create zero friction",
    "This supports deliberate",
    "rely on"
  ];
  const wrongReplacementSnippets = [
    "así any workflow",
    "asi any workflow",
    "necesidad to write",
    "arriba to you",
    "cero friction",
    "Este supports",
    "encima stable",
    "encima estable"
  ];

  for (const snippet of requiredOriginalSnippets) {
    if (!text.includes(snippet)) {
      throw new Error(`Smoke fixture lost expected safe English text: ${snippet}`);
    }
  }

  for (const snippet of wrongReplacementSnippets) {
    if (text.includes(snippet)) {
      throw new Error(`Smoke fixture rendered a wrong-sense replacement: ${snippet}`);
    }
  }

  if (!codeBlockText.includes("account-export")) {
    throw new Error("Smoke fixture code block was not present.");
  }

  if (codeBlockText.includes("cuenta")) {
    throw new Error("Smoke fixture translated inside a code block.");
  }
}
