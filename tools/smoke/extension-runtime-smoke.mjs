import { createServer } from "node:http";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ensureLinuxHeadedBrowserDisplay } from "../headed-browser-display.mjs";
import { startAssetPackServer } from "../assets/asset-pack-server.mjs";

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

const assetServer = await startAssetPackServer({
  port: Number(process.env.IK_ASSET_PACK_PORT ?? 8787)
});

const serviceWorkerLoader = await readFile(
  join(extensionPath, "service-worker-loader.js"),
  "utf8"
);
if (serviceWorkerLoader.includes("localhost:")) {
  throw new Error(
    "Extension dist appears to contain a dev service worker. Run `pnpm build` before `pnpm smoke:extension`, or use `pnpm smoke:extension:build`."
  );
}

const smokeFixtures = [
  {
    route: "/",
    label: "spec-workflow",
    fileName: "article-spec-workflow.html",
    codeBlockNeedle: "account-export",
    requiredText: [
      "Like any workflow",
      "not need to write release maps",
      "feature boundary or slice is up to you",
      "create zero friction",
      "This supports deliberate",
      "rely on"
    ],
    forbiddenText: [
      "así any workflow",
      "asi any workflow",
      "necesidad to write",
      "arriba to you",
      "cero friction",
      "Este supports",
      "encima stable",
      "encima estable"
    ],
    forbiddenCodeText: ["cuenta"]
  },
  {
    route: "/incident-review",
    label: "incident-review",
    fileName: "article-incident-review.html",
    codeBlockNeedle: "manual_check",
    requiredText: [
      "can light up the timeline",
      "hidden right after the deploy marker",
      "plant a manual check",
      "can watch",
      "queue drain",
      "move up slowly"
    ],
    forbiddenText: [
      "lata light",
      "lata watch",
      "luz up",
      "planta a manual",
      "derecho after",
      "ahorita after",
      "arriba slowly",
      "encima-call"
    ],
    forbiddenCodeText: ["planta"]
  },
  {
    route: "/metrics-notebook",
    label: "metrics-notebook",
    fileName: "article-metrics-notebook.html",
    codeBlockNeedle: "weekly_rate",
    requiredText: [
      "Like a bug report",
      "This means zero rows can move",
      "fine for",
      "left the control chart open"
    ],
    forbiddenText: [
      "así a bug",
      "asi a bug",
      "Este means",
      "cero rows",
      "lata move",
      "multa for",
      "izquierda the control"
    ],
    forbiddenCodeText: ["período"]
  },
  {
    route: "/api-migration",
    label: "api-migration",
    fileName: "article-api-migration.html",
    codeBlockNeedle: "legacy_export_route",
    requiredText: [
      "Well,",
      "reads like a checklist",
      "left the fallback on",
      "This can sound cautious",
      "does not need a large"
    ],
    forbiddenText: [
      "Pozo,",
      "pozo,",
      "así a checklist",
      "asi a checklist",
      "izquierda the fallback",
      "encima because",
      "lata sound",
      "necesidad a large"
    ],
    forbiddenCodeText: ["encima"]
  }
];

const fixturePages = new Map(
  await Promise.all(
    smokeFixtures.map(async (fixture) => [
      fixture.route,
      await readFile(join(repoRoot, "fixtures/pages", fixture.fileName), "utf8")
    ])
  )
);

const server = createServer((request, response) => {
  const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  const pageHtml = fixturePages.get(path);
  if (!pageHtml) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

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

ensureLinuxHeadedBrowserDisplay();

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
    const database = await openImmersionKitDatabaseForUserData();
    try {
      const transaction = database.transaction("user-data", "readwrite");
      transaction.objectStore("user-data").put({
        key: "settings",
        value: {
          enabled: true,
          discoveryRate: 1,
          targetLanguage: "es",
          sentenceTranslationEnabled: false,
          provider: "none"
        },
        schemaVersion: 1,
        updatedAt: new Date().toISOString()
      });
      await transactionDone(transaction);
    } finally {
      database.close();
    }

    async function openImmersionKitDatabaseForUserData() {
      return new Promise((resolveOpen, rejectOpen) => {
        const request = indexedDB.open("immersionkit-extension", 7);
        request.onupgradeneeded = () => {
          ensureExtensionStores(request.result, request.transaction);
        };
        request.onsuccess = () => resolveOpen(request.result);
        request.onerror = () =>
          rejectOpen(request.error ?? new Error("IndexedDB open failed."));
      });
    }

    function transactionDone(transaction) {
      return new Promise((resolveDone, rejectDone) => {
        transaction.oncomplete = () => resolveDone();
        transaction.onabort = () =>
          rejectDone(transaction.error ?? new Error("IndexedDB transaction aborted."));
        transaction.onerror = () =>
          rejectDone(transaction.error ?? new Error("IndexedDB transaction failed."));
      });
    }

    function ensureExtensionStores(database, transaction) {
      ensureStore(database, transaction, "sentence-cache", { keyPath: "sentenceHash" });
      const analysis = ensureStore(database, transaction, "sentence-analysis-cache", {
        keyPath: "identity"
      });
      ensureIndex(analysis, "sentenceHash", "sentenceHash");
      ensureStore(database, transaction, "review-events", { keyPath: "eventId" });
      ensureStore(database, transaction, "learning-items", { keyPath: "itemId" });
      ensureStore(database, transaction, "phrase-registry", { keyPath: "phraseId" });
      ensureStore(database, transaction, "learning-item-context-history", {
        keyPath: "itemId"
      });
      ensureStore(database, transaction, "user-data", { keyPath: "key" });
      ensureStore(database, transaction, "user-vocab", { keyPath: "lexemeId" });
      const packs = ensureStore(database, transaction, "asset-packs", {
        keyPath: "identity"
      });
      ensureIndex(packs, "languagePair", "languagePair");
      ensureIndex(packs, "bandId", "bandId");
      ensureIndex(packs, "assetVersion", "assetVersion");
      const renderUnits = ensureStore(database, transaction, "asset-pack-render-units", {
        keyPath: "identity"
      });
      ensureIndex(renderUnits, "packIdentity", "packIdentity");
      ensureIndex(renderUnits, "bandId", "bandId");
      ensureIndex(renderUnits, "languagePairBandId", ["languagePair", "bandId"]);
      ensureIndex(renderUnits, "assetVersion", "assetVersion");
      ensureIndex(renderUnits, "renderUnitId", "renderUnitId");
      const lexemes = ensureStore(database, transaction, "asset-pack-lexemes", {
        keyPath: "identity"
      });
      ensureIndex(lexemes, "packIdentity", "packIdentity");
      ensureIndex(lexemes, "bandId", "bandId");
      ensureIndex(lexemes, "languagePairBandId", ["languagePair", "bandId"]);
      ensureIndex(lexemes, "assetVersion", "assetVersion");
      ensureIndex(lexemes, "lexemeId", "lexemeId");
    }

    function ensureStore(database, transaction, storeName, options) {
      return database.objectStoreNames.contains(storeName)
        ? transaction.objectStore(storeName)
        : database.createObjectStore(storeName, options);
    }

    function ensureIndex(store, indexName, keyPath) {
      if (!store.indexNames.contains(indexName)) {
        store.createIndex(indexName, keyPath, { unique: false });
      }
    }
  });

  const page = await context.newPage();
  page.on("console", (message) => {
    console.log(`[page:${message.type()}] ${message.text()}`);
  });

  const baseUrl = `http://127.0.0.1:${address.port}`;
  const contentSnapshots = [];
  for (const fixture of smokeFixtures) {
    contentSnapshots.push(await runSmokeFixture(page, baseUrl, fixture));
  }

  const storageSnapshot = await serviceWorker.evaluate(async () => {
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

    const userDataSettings = await new Promise((resolveSettings) => {
      const request = indexedDB.open("immersionkit-extension");
      request.onsuccess = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("user-data")) {
          database.close();
          resolveSettings(null);
          return;
        }

        const readRequest = database
          .transaction("user-data", "readonly")
          .objectStore("user-data")
          .get("settings");
        readRequest.onsuccess = () => {
          database.close();
          resolveSettings(readRequest.result?.value ?? null);
        };
        readRequest.onerror = () => {
          database.close();
          resolveSettings(null);
        };
      };
      request.onerror = () => resolveSettings(null);
    });

    return {
      analysisCacheEntries: indexedDbSnapshot.analysisCacheEntries,
      translationCacheEntries: indexedDbSnapshot.translationCacheEntries,
      settings: userDataSettings,
      firstAnalysisEntry: indexedDbSnapshot.firstAnalysisEntry ?? null
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
    contentSnapshots: contentSnapshots.map((snapshot) => ({
      label: snapshot.label,
      injectedTokens: snapshot.injectedTokens,
      sentenceCandidateWrappers: snapshot.sentenceCandidateWrappers,
      phraseHintWrappers: snapshot.phraseHintWrappers,
      rootBooted: snapshot.rootBooted,
      codeBlockPresent: snapshot.codeBlockPresent
    })),
    storageSnapshot: {
      analysisCacheEntries: storageSnapshot.analysisCacheEntries,
      translationCacheEntries: storageSnapshot.translationCacheEntries,
      settings: storageSnapshot.settings,
      analysisShape
    }
  };

  console.log(JSON.stringify(summary, null, 2));

  if (storageSnapshot.analysisCacheEntries < 1) {
    throw new Error("No background sentence analysis cache entries were written.");
  }
  if (!analysisShape || analysisShape.analyzerId !== "wink-nlp") {
    throw new Error("Background analysis did not use wink-nlp.");
  }
} finally {
  await context.close();
  await new Promise((resolveServer) => server.close(resolveServer));
  await new Promise((resolveServer) => assetServer.server.close(resolveServer));
  await rm(userDataDir, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 100
  });
}

async function runSmokeFixture(page, baseUrl, fixture) {
  await page.goto(`${baseUrl}${fixture.route}`, {
    waitUntil: "domcontentloaded"
  });
  await page.waitForSelector("[data-ik-token-id]", { timeout: 10_000 });
  await page.waitForTimeout(5_000);

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

  if (!contentSnapshot.rootBooted) {
    throw new Error(`Content script did not boot for ${fixture.label}.`);
  }
  if (contentSnapshot.injectedTokens < 1) {
    throw new Error(`No injected tokens rendered for ${fixture.label}.`);
  }
  if (contentSnapshot.sentenceCandidateWrappers < 1) {
    throw new Error(`No sentence candidates were marked for ${fixture.label}.`);
  }

  assertFixtureReplacementQuality(fixture, contentSnapshot);

  return {
    label: fixture.label,
    injectedTokens: contentSnapshot.injectedTokens,
    sentenceCandidateWrappers: contentSnapshot.sentenceCandidateWrappers,
    phraseHintWrappers: contentSnapshot.phraseHintWrappers,
    rootBooted: contentSnapshot.rootBooted,
    codeBlockPresent: contentSnapshot.codeBlockText.includes(fixture.codeBlockNeedle)
  };
}

function assertFixtureReplacementQuality(fixture, contentSnapshot) {
  const text = contentSnapshot.textContent;
  const codeBlockText = contentSnapshot.codeBlockText;

  for (const snippet of fixture.requiredText) {
    if (!text.includes(snippet)) {
      throw new Error(
        `${fixture.label} lost expected safe English text: ${snippet}`
      );
    }
  }

  for (const snippet of fixture.forbiddenText) {
    if (text.includes(snippet)) {
      throw new Error(
        `${fixture.label} rendered a wrong-sense replacement: ${snippet}`
      );
    }
  }

  if (!codeBlockText.includes(fixture.codeBlockNeedle)) {
    throw new Error(`${fixture.label} code block was not present.`);
  }

  for (const snippet of fixture.forbiddenCodeText) {
    if (codeBlockText.includes(snippet)) {
      throw new Error(`${fixture.label} translated inside a code block.`);
    }
  }
}
