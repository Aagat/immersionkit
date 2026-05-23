import { createRequire } from "node:module";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { startAssetPackServer } from "../assets/asset-pack-server.mjs";
import { getExtensionLaunchOptions } from "../browser-launch-mode.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const extensionPath = join(repoRoot, "apps/extension/dist");
const require = createRequire(join(repoRoot, "apps/extension/package.json"));
const { chromium } = require("playwright");

const OUTPUT_DIR =
  process.env.IK_PUBLIC_WEB_AUDIT_OUTPUT_DIR ??
  (existsSync("/private/tmp")
    ? "/private/tmp/immersionkit-public-web-audit"
    : join(tmpdir(), "immersionkit-public-web-audit"));

const ANALYSIS_SETTLE_MS = Number(process.env.IK_PUBLIC_WEB_AUDIT_SETTLE_MS ?? 9000);
const LLM_SETTLE_MS = Number(process.env.IK_PUBLIC_WEB_AUDIT_LLM_SETTLE_MS ?? 18000);
const NAVIGATION_TIMEOUT_MS = Number(
  process.env.IK_PUBLIC_WEB_AUDIT_NAVIGATION_TIMEOUT_MS ?? 45_000
);
const PREVIEW_DISCOVERY_RATE = 0.15;
const MAX_INLINE_DENSITY = 0.24;
const MIN_NON_SKIPPED_PAGES = 16;
const MIN_PAGES_WITH_INJECTION = 12;

const siteMatrix = [
  ["encyclopedia", "https://en.wikipedia.org/wiki/Spanish_language"],
  ["news-homepage", "https://apnews.com/"],
  ["news-editorial", "https://www.theguardian.com/us"],
  ["science-news", "https://www.nasa.gov/news/"],
  ["university-news", "https://news.mit.edu/"],
  ["magazine-category", "https://www.smithsonianmag.com/category/science-nature/"],
  ["public-health", "https://www.cdc.gov/flu/about/index.html"],
  ["government-help", "https://www.irs.gov/help/let-us-help-you"],
  ["government-guidance", "https://www.gov.uk/renew-adult-passport"],
  ["technical-docs-js", "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map"],
  ["technical-docs-python", "https://docs.python.org/3/tutorial/datastructures.html"],
  ["product-docs", "https://docs.github.com/en/get-started/start-your-journey/hello-world"],
  ["developer-platform-docs", "https://learn.microsoft.com/en-us/windows/apps/get-started/"],
  ["consumer-support", "https://support.google.com/chrome/answer/95414"],
  ["account-recovery-support", "https://support.apple.com/en-us/102656"],
  ["longform-book", "https://www.gutenberg.org/files/1342/1342-h/1342-h.htm"],
  ["academic-abstract", "https://arxiv.org/abs/1706.03762"],
  ["travel-park", "https://www.nps.gov/yell/index.htm"],
  ["recipe", "https://www.allrecipes.com/recipe/24074/alysias-basic-meat-lasagna/"],
  ["commerce-advice", "https://www.rei.com/learn/expert-advice/hiking-for-beginners.html"]
].map(([type, url]) => ({ type, url }));
const activeSiteMatrix = siteMatrix.slice(
  0,
  clampPositiveInteger(process.env.IK_PUBLIC_WEB_AUDIT_LIMIT, siteMatrix.length)
);
const minNonSkippedPagesForRun = Math.min(MIN_NON_SKIPPED_PAGES, activeSiteMatrix.length);
const minPagesWithInjectionForRun = Math.min(
  MIN_PAGES_WITH_INJECTION,
  activeSiteMatrix.length
);

if (!existsSync(join(extensionPath, "manifest.json"))) {
  throw new Error(
    "Built extension not found. Run `pnpm build:local-assets` before `pnpm smoke:public-web`."
  );
}

const serviceWorkerLoader = await readFile(
  join(extensionPath, "service-worker-loader.js"),
  "utf8"
);
if (serviceWorkerLoader.includes("localhost:")) {
  throw new Error(
    "Extension dist appears to contain a dev service worker. Run `pnpm build:local-assets` before `pnpm smoke:public-web`."
  );
}

await mkdir(OUTPUT_DIR, { recursive: true });

const openAiApiKey = await readOpenAiApiKey();
const assetServer = await startAssetPackServer({
  port: Number(process.env.IK_ASSET_PACK_PORT ?? 8787)
});
const warmupServer = await startWarmupServer();

const modes = [
  { id: "local-only", sentenceTranslationEnabled: false, provider: "none" },
  {
    id: "llm-openai",
    sentenceTranslationEnabled: true,
    provider: "openai",
    skipReason: openAiApiKey ? null : "missing-openai-api-key"
  }
];

const modeSummaries = [];

try {
  for (const mode of modes) {
    if (mode.skipReason) {
      modeSummaries.push({
        mode: mode.id,
        skipped: true,
        skipReason: mode.skipReason,
        sites: []
      });
      continue;
    }

    modeSummaries.push(await runMode(mode, openAiApiKey, warmupServer.url));
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    outputDir: OUTPUT_DIR,
    extensionPath,
    siteCount: activeSiteMatrix.length,
    qualityGate: {
      minNonSkippedPages: minNonSkippedPagesForRun,
      minPagesWithInjection: minPagesWithInjectionForRun,
      maxInlineDensity: MAX_INLINE_DENSITY,
      noProtectedRegionTokens: true,
      noBlankPhraseTargets: true,
      noRiskySingleWordSources: true,
      noKnownMissingAccentDisplays: true,
      localOnlyHasNoSentenceNotes: true,
      llmHasAtLeastOneSentenceNoteWhenKeyPresent: Boolean(openAiApiKey)
    },
    modes: modeSummaries
  };

  summary.gateResults = evaluateGateResults(summary);
  const summaryPath = join(OUTPUT_DIR, "summary.json");
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log("[public-web-audit] Summary");
  console.log(JSON.stringify(summary.gateResults, null, 2));
  console.log(`[public-web-audit] Wrote ${summaryPath}`);

  if (!summary.gateResults.passed) {
    process.exitCode = 1;
  }
} finally {
  await Promise.all([
    new Promise((resolveClose) => assetServer.server.close(resolveClose)),
    new Promise((resolveClose) => warmupServer.server.close(resolveClose))
  ]);
}

async function runMode(mode, apiKey, warmupUrl) {
  console.log(`[public-web-audit] Starting mode ${mode.id}`);
  const userDataDir = await mkdtemp(join(tmpdir(), `ik-public-web-${mode.id}-`));
  const context = await chromium.launchPersistentContext(
    userDataDir,
    getExtensionLaunchOptions(extensionPath)
  );

  const sites = [];

  try {
    let serviceWorker = context.serviceWorkers()[0];
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent("serviceworker", { timeout: 10_000 });
    }
    serviceWorker.on("console", (message) => {
      console.log(`[service-worker:${mode.id}:${message.type()}] ${message.text()}`);
    });

    const extensionId = new URL(serviceWorker.url()).host;
    const assetContext = await withTimeout(
      warmAssetPacks(context, serviceWorker, warmupUrl, mode),
      35_000,
      "asset packs"
    );
    console.log(
      `[public-web-audit] Asset context for ${mode.id}: ` +
        `source=${assetContext.source} renderUnits=${assetContext.renderUnitCount} ` +
        `assetVersion=${assetContext.assetVersion ?? "unknown"} ` +
        `warmupTokens=${assetContext.warmupInjectedTokens}`
    );
    console.log(`[public-web-audit] Seeding settings for mode ${mode.id}`);
    await withTimeout(seedSettings(context, extensionId, mode, apiKey), 15_000, "seed settings");
    console.log(`[public-web-audit] Settings seeded for mode ${mode.id}`);

    const page = await context.newPage();
    page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
    page.on("console", (message) => {
      const text = message.text();
      if (message.type() === "error" || text.includes("ImmersionKit")) {
        console.log(`[page:${mode.id}:${message.type()}] ${message.text()}`);
      }
    });

    for (const site of activeSiteMatrix) {
      sites.push(await auditSite(page, site, mode));
    }

    return {
      mode: mode.id,
      skipped: false,
      assetContext,
      sites,
      totals: summarizeSites(sites)
    };
  } finally {
    await context.close();
    await rm(userDataDir, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100
    });
  }
}

async function auditSite(page, site, mode) {
  console.log(`[public-web-audit] ${mode.id} visiting ${site.type}: ${site.url}`);
  const startedAt = Date.now();
  const result = {
    type: site.type,
    url: site.url,
    mode: mode.id,
    ok: false,
    navigationError: null,
    finalUrl: null,
    title: null,
    screenshotPath: null
  };

  try {
    await page.goto(site.url, {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS
    });
    await page.waitForTimeout(mode.id === "llm-openai" ? LLM_SETTLE_MS : ANALYSIS_SETTLE_MS);
    await page.evaluate(() => window.scrollBy(0, Math.floor(window.innerHeight * 0.8))).catch(
      () => undefined
    );
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => undefined);
    await page.waitForTimeout(500);
  } catch (error) {
    result.navigationError = error instanceof Error ? error.message : String(error);
  }

  const snapshot = await collectSnapshot(page, site, mode).catch((error) => ({
    collectionError: error instanceof Error ? error.message : String(error)
  }));
  Object.assign(result, snapshot);
  result.finalUrl = page.url();
  result.title = await page.title().catch(() => null);
  result.elapsedMs = Date.now() - startedAt;

  try {
    const safeLabel = `${mode.id}-${site.type}`.replace(/[^a-z0-9._-]+/gi, "-");
    const screenshotPath = join(OUTPUT_DIR, `${safeLabel}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    result.screenshotPath = screenshotPath;
  } catch (error) {
    result.screenshotError = error instanceof Error ? error.message : String(error);
  }

  result.ok = isSiteSnapshotPassing(result, mode);
  console.log(
    `[public-web-audit] ${mode.id} ${site.type}: ${result.ok ? "ok" : "check"} ` +
      `tokens=${result.injectedTokens ?? 0} density=${formatNumber(result.inlineDensity)} ` +
      `notes=${result.sentenceNotes ?? 0} flags=${(result.flags ?? []).length}`
  );
  return result;
}

async function collectSnapshot(page, site, mode) {
  return page.evaluate(
    ({ siteType, auditMode, maxInlineDensity }) => {
      const tokenNodes = [...document.querySelectorAll("[data-ik-token-id]")];
      const protectedSelector = [
        "pre",
        "code",
        "input",
        "textarea",
        "select",
        "button",
        "label",
        "a",
        "nav",
        "summary",
        "[contenteditable='']",
        "[contenteditable='true']",
        "[contenteditable='plaintext-only']",
        "[role='button']",
        "[role='link']",
        "[role='navigation']",
        "[role='menu']",
        "[role='menubar']",
        "[role='menuitem']",
        "[role='tab']",
        "[role='tablist']",
        "[role='listbox']",
        "[role='combobox']",
        "[role='textbox']"
      ].join(",");
      const readableRoot =
        document.querySelector("article") ??
        document.querySelector("main") ??
        document.body;
      const readableText =
        readableRoot && "innerText" in readableRoot
          ? readableRoot.innerText
          : readableRoot?.textContent ?? document.body.textContent ?? "";
      const densityText = document.body?.innerText ?? readableText;
      const englishWordCount = (
        densityText.match(/\b[A-Za-z][A-Za-z'-]*\b/g) ?? []
      ).length;
      const sourceTokenWordCount = tokenNodes.reduce((count, node) => {
        const sourceToken = node.getAttribute("data-ik-source-token") ?? "";
        return (
          count +
          (sourceToken.match(/\b[A-Za-z][A-Za-z'-]*\b/g) ?? []).length
        );
      }, 0);
      const wordCount = englishWordCount + sourceTokenWordCount;
      const renderedTokens = tokenNodes.slice(0, 120).map((node) => ({
        sourceToken: node.getAttribute("data-ik-source-token") ?? "",
        targetToken: node.getAttribute("data-ik-target-token") ?? "",
        unitKind: node.getAttribute("data-ik-unit-kind") ?? "",
        text: node.textContent ?? "",
        inProtectedRegion: Boolean(node.parentElement?.closest(protectedSelector))
      }));
      const protectedTokenCount = tokenNodes.filter(
        (node) => node.parentElement?.closest(protectedSelector)
      ).length;
      const phraseNodes = tokenNodes.filter(
        (node) => node.getAttribute("data-ik-unit-kind") === "phrase"
      );
      const blankPhraseTargetCount = phraseNodes.filter(
        (node) => !(node.getAttribute("data-ik-target-token") ?? "").trim()
      ).length;
      const injectedWords = tokenNodes.filter(
        (node) => node.getAttribute("data-ik-unit-kind") === "word"
      ).length;
      const injectedPhrases = phraseNodes.length;
      const sentenceNotes = document.querySelectorAll(
        "[data-ik-sentence-note='true']"
      ).length;
      const textContentSample = readableText.replace(/\s+/g, " ").trim().slice(0, 1200);
      const flags = collectFlags({
        auditMode,
        renderedTokens,
        protectedTokenCount,
        blankPhraseTargetCount,
        sentenceNotes,
        wordCount,
        injectedTokenCount: tokenNodes.length,
        inlineDensity: wordCount > 0 ? tokenNodes.length / wordCount : 0,
        maxInlineDensity,
        textContent: readableText
      });

      return {
        siteType,
        rootBooted: document.documentElement.hasAttribute("data-immersionkit-root"),
        injectedTokens: tokenNodes.length,
        injectedWords,
        injectedPhrases,
        sentenceNotes,
        protectedTokenCount,
        blankPhraseTargetCount,
        wordCount,
        inlineDensity: wordCount > 0 ? tokenNodes.length / wordCount : 0,
        renderedTokens,
        flags,
        textContentSample
      };

      function collectFlags(input) {
        const nextFlags = [];
        if (input.protectedTokenCount > 0) {
          nextFlags.push({
            code: "protected-region-token",
            count: input.protectedTokenCount
          });
        }
        if (input.blankPhraseTargetCount > 0) {
          nextFlags.push({
            code: "blank-phrase-target",
            count: input.blankPhraseTargetCount
          });
        }
        if (input.inlineDensity > input.maxInlineDensity) {
          nextFlags.push({
            code: "inline-density-high",
            density: input.inlineDensity
          });
        }
        if (input.wordCount >= 80 && input.injectedTokenCount === 0) {
          nextFlags.push({
            code: "zero-injected-readable-page",
            wordCount: input.wordCount
          });
        }
        if (input.auditMode === "local-only" && input.sentenceNotes > 0) {
          nextFlags.push({
            code: "local-only-sentence-notes",
            count: input.sentenceNotes
          });
        }

        const riskySingleWordSources = new Set([
          "as",
          "so",
          "can",
          "watch",
          "light",
          "right",
          "plant"
        ]);
        for (const token of input.renderedTokens) {
          if (
            token.unitKind === "word" &&
            riskySingleWordSources.has(token.sourceToken.trim().toLowerCase())
          ) {
            nextFlags.push({
              code: "risky-single-word-source",
              sourceToken: token.sourceToken,
              targetToken: token.targetToken
            });
          }
        }

        const missingAccentPattern =
          /\b(solia|publica|publico|accion|atencion|actualizacion|reunion|pronostico|meteorologico|politica|linea|lideres|energia|autobus|estacion|inspeccion|sesion|capacitacion|orientacion|pequenas|jardin|climatico|economico|decision|ultima vez|proxima vez|una vez mas)\b/i;
        for (const token of input.renderedTokens) {
          if (missingAccentPattern.test(token.text) || missingAccentPattern.test(token.targetToken)) {
            nextFlags.push({
              code: "known-missing-accent-display",
              sourceToken: token.sourceToken,
              targetToken: token.targetToken,
              text: token.text
            });
          }
        }

        return nextFlags;
      }
    },
    {
      siteType: site.type,
      auditMode: mode.id,
      maxInlineDensity: MAX_INLINE_DENSITY
    }
  );
}

function isSiteSnapshotPassing(result, mode) {
  if (result.collectionError || result.navigationError) {
    return false;
  }
  if (!result.rootBooted) {
    return false;
  }
  if ((result.flags ?? []).length > 0) {
    return false;
  }
  if (mode.id === "local-only" && (result.sentenceNotes ?? 0) > 0) {
    return false;
  }
  return true;
}

function summarizeSites(sites) {
  return {
    visited: sites.length,
    rootBooted: sites.filter((site) => site.rootBooted).length,
    passing: sites.filter((site) => site.ok).length,
    withInjection: sites.filter((site) => (site.injectedTokens ?? 0) > 0).length,
    injectedTokenTotal: sites.reduce((total, site) => total + (site.injectedTokens ?? 0), 0),
    sentenceNoteTotal: sites.reduce((total, site) => total + (site.sentenceNotes ?? 0), 0),
    flagged: sites.filter((site) => (site.flags ?? []).length > 0).length,
    navigationErrors: sites.filter((site) => site.navigationError).length
  };
}

function evaluateGateResults(summary) {
  const failures = [];
  for (const mode of summary.modes) {
    if (mode.skipped) {
      if (mode.mode === "llm-openai") {
        failures.push(`${mode.mode}: ${mode.skipReason}`);
      }
      continue;
    }

    if ((mode.totals?.rootBooted ?? 0) < summary.qualityGate.minNonSkippedPages) {
      failures.push(
        `${mode.mode}: only ${mode.totals?.rootBooted ?? 0}/${summary.siteCount} pages booted`
      );
    }
    if ((mode.totals?.withInjection ?? 0) < summary.qualityGate.minPagesWithInjection) {
      failures.push(
        `${mode.mode}: only ${mode.totals?.withInjection ?? 0}/${summary.siteCount} readable pages rendered inline tokens`
      );
    }
    if ((mode.assetContext?.renderUnitCount ?? 0) < 1) {
      failures.push(`${mode.mode}: no active asset render units loaded`);
    }
    for (const site of mode.sites) {
      for (const flag of site.flags ?? []) {
        failures.push(`${mode.mode}/${site.type}: ${flag.code}`);
      }
    }
    if (mode.mode === "local-only" && (mode.totals?.sentenceNoteTotal ?? 0) > 0) {
      failures.push("local-only: sentence notes rendered without provider");
    }
    if (
      mode.mode === "llm-openai" &&
      summary.qualityGate.llmHasAtLeastOneSentenceNoteWhenKeyPresent &&
      (mode.totals?.sentenceNoteTotal ?? 0) < 1
    ) {
      failures.push("llm-openai: no sentence notes rendered with provider key");
    }
  }

  return {
    passed: failures.length === 0,
    failures
  };
}

async function readOpenAiApiKey() {
  const envPath = join(repoRoot, ".env");
  if (!existsSync(envPath)) {
    return "";
  }
  const env = await readFile(envPath, "utf8");
  for (const line of env.split(/\r?\n/)) {
    const match = line.match(/^\s*OPENAI_API_KEY\s*=\s*(.+?)\s*$/);
    if (!match) {
      continue;
    }
    return match[1]?.replace(/^['"]|['"]$/g, "").trim() ?? "";
  }
  return "";
}

async function startWarmupServer() {
  const host = "127.0.0.1";
  const html = await readFile(
    join(repoRoot, "fixtures/pages/public-preview/news-river-morning.html"),
    "utf8"
  );
  const server = createServer((_request, response) => {
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    });
    response.end(html);
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, host, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to start public-web warmup server.");
  }

  return {
    server,
    url: `http://${host}:${address.port}/warmup`
  };
}

async function warmAssetPacks(context, serviceWorker, warmupUrl, mode) {
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" || text.includes("ImmersionKit")) {
      console.log(`[warmup:${mode.id}:${message.type()}] ${text}`);
    }
  });

  try {
    await page.goto(warmupUrl, {
      waitUntil: "domcontentloaded",
      timeout: 10_000
    });
    await page.waitForFunction(
      () => document.documentElement.hasAttribute("data-immersionkit-root"),
      null,
      { timeout: 10_000 }
    );
    const tokenWaitError = await page
      .waitForSelector("[data-ik-token-id]", { timeout: 15_000 })
      .then(() => null)
      .catch((error) => (error instanceof Error ? error.message : String(error)));
    await page.waitForTimeout(1000);
    const snapshot = await collectSnapshot(
      page,
      { type: "warmup", url: warmupUrl },
      mode
    );
    const diagnostics = await withTimeout(
      readPageDiagnosticsFromServiceWorker(serviceWorker, page.url()),
      3000,
      "warmup diagnostics"
    ).catch((error) => ({
      diagnosticError: error instanceof Error ? error.message : String(error)
    }));
    if (!snapshot.rootBooted || snapshot.injectedTokens < 1) {
      throw new Error(
        `Warmup page did not render tokens: ${JSON.stringify({
          tokenWaitError,
          snapshot,
          diagnostics
        })}`
      );
    }

    return {
      source: diagnostics?.assetSource ?? "unknown",
      renderUnitCount: diagnostics?.renderUnitCount ?? snapshot.injectedTokens,
      assetVersion: diagnostics?.renderAssetVersion ?? null,
      warmupInjectedTokens: snapshot.injectedTokens,
      warmupInjectedPhrases: snapshot.injectedPhrases,
      warmupDiagnostics: diagnostics
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function readPageDiagnosticsFromServiceWorker(serviceWorker, pageUrl) {
  const response = await serviceWorker.evaluate(
    ({ url }) =>
      new Promise((resolveDiagnostics) => {
        chrome.tabs.query({}, (tabs) => {
          const tab = tabs.find((candidate) => candidate.url === url);
          if (!tab?.id) {
            resolveDiagnostics({
              ok: false,
              error: "tab-not-found",
              diagnostics: null
            });
            return;
          }

          chrome.tabs.sendMessage(
            tab.id,
            { type: "immersionkit/content/get-page-diagnostics" },
            (diagnostics) => {
              resolveDiagnostics({
                ok: !chrome.runtime.lastError && Boolean(diagnostics),
                error: chrome.runtime.lastError?.message ?? null,
                diagnostics: diagnostics ?? null
              });
            }
          );
        });
      }),
    { url: pageUrl }
  );

  return response?.ok ? response.diagnostics : null;
}

async function seedSettings(context, extensionId, mode, apiKey) {
  const settingsPage = await context.newPage();
  try {
    await settingsPage.goto(`chrome-extension://${extensionId}/options.html`, {
      waitUntil: "domcontentloaded",
      timeout: 10_000
    });
    await settingsPage.evaluate(
    async ({ settings, openAiApiKey }) => {
      const database = await openImmersionKitDatabaseForUserData();
      try {
        const transaction = database.transaction("user-data", "readwrite");
        transaction.objectStore("user-data").put({
        key: "settings",
          value: settings,
          schemaVersion: 1,
          updatedAt: new Date().toISOString()
        });
        if (openAiApiKey) {
          transaction.objectStore("user-data").put({
            key: "provider-openai-api-key",
            value: openAiApiKey,
            schemaVersion: 1,
            updatedAt: new Date().toISOString()
          });
        }
        await transactionDone(transaction);
      } finally {
        database.close();
      }

      async function openImmersionKitDatabaseForUserData() {
        return new Promise((resolveOpen, rejectOpen) => {
          const request = indexedDB.open("immersionkit-extension", 8);
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
        ensureIndex(renderUnits, "languagePair", "languagePair");
        ensureIndex(renderUnits, "bandId", "bandId");
        ensureIndex(renderUnits, "languagePairBandId", ["languagePair", "bandId"]);
        ensureIndex(renderUnits, "assetVersion", "assetVersion");
        ensureIndex(renderUnits, "renderUnitId", "renderUnitId");
        const lexemes = ensureStore(database, transaction, "asset-pack-lexemes", {
          keyPath: "identity"
        });
        ensureIndex(lexemes, "packIdentity", "packIdentity");
        ensureIndex(lexemes, "languagePair", "languagePair");
        ensureIndex(lexemes, "bandId", "bandId");
        ensureIndex(lexemes, "languagePairBandId", ["languagePair", "bandId"]);
        ensureIndex(lexemes, "assetVersion", "assetVersion");
        ensureIndex(lexemes, "lexemeId", "lexemeId");
        const ttsVoices = ensureStore(database, transaction, "tts-voices", {
          keyPath: "voiceId"
        });
        ensureIndex(ttsVoices, "languagePair", "languagePair");
        ensureIndex(ttsVoices, "assetVersion", "assetVersion");
      }

      function ensureStore(database, transaction, name, options) {
        if (database.objectStoreNames.contains(name)) {
          return transaction.objectStore(name);
        }
        return database.createObjectStore(name, options);
      }

      function ensureIndex(store, name, keyPath) {
        if (!store.indexNames.contains(name)) {
          store.createIndex(name, keyPath);
        }
      }
    },
    {
      settings: {
        enabled: true,
        discoveryRate: PREVIEW_DISCOVERY_RATE,
        languagePair: "en-es",
        sourceLanguage: "en",
        targetLanguage: "es",
        sentenceTranslationEnabled: mode.sentenceTranslationEnabled,
        provider: mode.provider,
        sentenceBatchSize: 1,
        proficiencySeed: "false-beginner"
      },
      openAiApiKey: mode.provider === "openai" ? apiKey : ""
    }
    );
  } finally {
    await settingsPage.close().catch(() => undefined);
  }
}

function formatNumber(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(3)
    : "n/a";
}

function clampPositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, fallback);
}

async function withTimeout(promise, timeoutMs, label) {
  let timeoutId;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs
        );
      })
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}
