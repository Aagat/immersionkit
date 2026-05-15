#!/usr/bin/env node
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

const repoRoot = resolve(args.repoRoot ?? process.cwd());
const extensionPath = resolve(repoRoot, "apps/extension/dist");
const screenshotDir = resolve(
  args.outDir ?? "/tmp/immersionkit-visual-pass/extension"
);
const assetPort = Number(args.assetPort ?? 8787);
const firstSentence =
  "The important new city has at least one small family house near the water.";

const { ensureLinuxHeadedBrowserDisplay } = await import(
  pathToFileURL(join(repoRoot, "tools/headed-browser-display.mjs")).href
);
const { startAssetPackServer } = await import(
  pathToFileURL(join(repoRoot, "tools/assets/asset-pack-server.mjs")).href
);
const require = createRequire(resolve(repoRoot, "apps/extension/package.json"));
const { chromium } = require("playwright");

if (!existsSync(join(extensionPath, "manifest.json"))) {
  throw new Error(
    "Built extension not found at apps/extension/dist. Run `pnpm build:local-assets` first."
  );
}

await mkdir(screenshotDir, { recursive: true });
const assetServer = await maybeStartAssetServer(assetPort);
const fixtureServer = await startFixtureServer(createFixtureHtml(firstSentence));
const fixtureUrl = readServerUrl(fixtureServer);

ensureLinuxHeadedBrowserDisplay();
const userDataDir = await mkdtemp(join(tmpdir(), "ik-visual-extension-"));
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  viewport: { width: 1280, height: 900 },
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`
  ]
});

try {
  const serviceWorker = await waitForServiceWorker(context);
  const extensionId = new URL(serviceWorker.url()).hostname;

  await seedExtensionState(serviceWorker);

  const page = context.pages()[0] ?? (await context.newPage());
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(fixtureUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-ik-token-id]", { timeout: 20_000 });
  await page.waitForFunction(
    () => document.querySelectorAll("[data-ik-unit-kind='phrase']").length > 0,
    null,
    { timeout: 20_000 }
  );
  await page.waitForTimeout(1_200);

  const screenshots = {};
  const counts = await countInlineUnits(page);

  screenshots.article = join(screenshotDir, "01-installed-article.png");
  await page.screenshot({ path: screenshots.article, fullPage: false });

  const popupPage = await openPopupPage(context, serviceWorker, page, extensionId);
  await popupPage.setViewportSize({ width: 390, height: 720 }).catch(() => undefined);
  await popupPage.waitForSelector("text=ImmersionKit", { timeout: 10_000 });
  await popupPage.waitForTimeout(500);
  screenshots.popup = join(screenshotDir, "02-installed-popup.png");
  await popupPage.screenshot({ path: screenshots.popup, fullPage: true });
  const popupText = await popupPage.locator("body").innerText();
  await popupPage.close().catch(() => undefined);

  const optionsScreenshots = await captureOptions(context, extensionId);
  Object.assign(screenshots, optionsScreenshots);

  screenshots.injectedWord = join(screenshotDir, "05-clicked-injected-word.png");
  const wordResult = await clickPopoverAndCapture(
    page,
    "[data-ik-unit-kind='word']",
    screenshots.injectedWord
  );

  await closePopover(page);
  screenshots.injectedPhrase = join(screenshotDir, "06-clicked-injected-phrase.png");
  const phraseResult = await clickPopoverAndCapture(
    page,
    "[data-ik-unit-kind='phrase']",
    screenshots.injectedPhrase
  );

  await closePopover(page);
  const sentenceResult = await injectSentenceHelpAndCapture({
    page,
    serviceWorker,
    fixtureUrl,
    sourceText: firstSentence,
    screenshotDir
  });
  screenshots.sentenceHelp = sentenceResult.screenshot;

  const report = {
    extensionId,
    fixtureUrl,
    counts,
    popupMode: popupText.includes("On for this site")
      ? "action-supported"
      : "direct-or-unsupported",
    interactions: {
      word: summarizePopoverResult(wordResult, /ImmersionKit|Hide word/),
      phrase: summarizePopoverResult(
        phraseResult,
        /reusable phrase|Phrase|ImmersionKit/i
      ),
      sentence: summarizePopoverResult(
        sentenceResult,
        /Translation|Why this helps|al menos/i
      )
    },
    screenshots
  };

  await writeFile(
    join(screenshotDir, "validation-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8"
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await context.close().catch(() => undefined);
  await rm(userDataDir, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 100
  }).catch(() => undefined);
  await new Promise((resolveClose) => fixtureServer.close(resolveClose));
  if (assetServer) {
    await new Promise((resolveClose) => assetServer.server.close(resolveClose));
  }
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--help" || value === "-h") {
      parsed.help = true;
      continue;
    }
    if (value === "--repo-root") {
      parsed.repoRoot = values[++index];
      continue;
    }
    if (value === "--out-dir") {
      parsed.outDir = values[++index];
      continue;
    }
    if (value === "--asset-port") {
      parsed.assetPort = values[++index];
      continue;
    }
    throw new Error(`Unknown argument: ${value}`);
  }
  return parsed;
}

function printHelp() {
  console.log(`Usage:
  node .agents/skills/extension-visual-validation/scripts/installed-extension-visual-validation.mjs [options]

Options:
  --repo-root <path>    Repository root. Defaults to current working directory.
  --out-dir <path>      Screenshot output directory. Defaults to /tmp/immersionkit-visual-pass/extension.
  --asset-port <port>   Local asset-pack server port. Defaults to 8787.
  --help, -h            Show this help.
`);
}

async function maybeStartAssetServer(port) {
  try {
    return await startAssetPackServer({ port });
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EADDRINUSE") {
      console.log(
        `Asset server port ${port} already in use; assuming a compatible local asset server is running.`
      );
      return null;
    }
    throw error;
  }
}

async function startFixtureServer(html) {
  const server = createServer((_, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  return server;
}

function readServerUrl(server) {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to start fixture server.");
  }
  return `http://127.0.0.1:${address.port}/`;
}

function createFixtureHtml(sentence) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>ImmersionKit installed extension visual fixture</title>
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      body { margin: 0; background: #f4f1ec; color: #27211b; }
      main { max-width: 980px; margin: 0 auto; padding: 56px 32px 96px; }
      article { background: #fffaf3; border-radius: 34px; box-shadow: 0 24px 60px rgba(41, 32, 23, 0.13); padding: 48px; }
      .kicker { color: #7d6d5d; font-size: 13px; letter-spacing: .08em; text-transform: uppercase; font-weight: 700; }
      h1 { font-size: 48px; line-height: 1; margin: 12px 0 22px; letter-spacing: 0; max-width: 760px; }
      p { font-size: 20px; line-height: 1.8; margin: 0 0 24px; }
      aside { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-top: 28px; }
      aside div { background: #efe8dd; border-radius: 22px; padding: 16px; color: #6b5f51; font-size: 14px; }
    </style>
  </head>
  <body>
    <main>
      <article>
        <div class="kicker">Local city notes</div>
        <h1>Small routines for a slower reading day</h1>
        <p>${sentence}</p>
        <p>As soon as we arrive at the old city, we read the important book right now.</p>
        <p>The public safety update includes school board schedules and weather forecasts.</p>
        <p>The local train route gives every visitor enough time to find a quiet place.</p>
        <aside>
          <div>Keep the page readable while Spanish appears in small doses.</div>
          <div>Phrase targets should stay inline and easy to inspect.</div>
          <div>Sentence help remains selected and optional.</div>
        </aside>
      </article>
    </main>
  </body>
</html>`;
}

async function waitForServiceWorker(context) {
  const serviceWorker = context.serviceWorkers()[0];
  if (serviceWorker) {
    return serviceWorker;
  }
  return context.waitForEvent("serviceworker", { timeout: 10_000 });
}

async function seedExtensionState(serviceWorker) {
  await writeUserData(serviceWorker, "settings", {
    enabled: true,
    discoveryRate: 1,
    targetLanguage: "es",
    sentenceTranslationEnabled: false,
    provider: "none",
    proficiencySeed: "beginner"
  });
  await writeUserData(serviceWorker, "first-run-intro-visible", false);
  await writeUserData(serviceWorker, "site-settings", {
    "127.0.0.1": {
      hostname: "127.0.0.1",
      enabled: true,
      discoveryRate: 1,
      sentenceTranslationEnabled: null,
      updatedAt: new Date().toISOString()
    }
  });
}

async function countInlineUnits(page) {
  return page.evaluate(() => ({
    words: document.querySelectorAll("[data-ik-unit-kind='word']").length,
    phrases: document.querySelectorAll("[data-ik-unit-kind='phrase']").length,
    sentenceNotes: document.querySelectorAll("[data-ik-sentence-note='true']").length
  }));
}

async function openPopupPage(context, serviceWorker, activePage, extensionId) {
  await activePage.bringToFront();
  const popupPromise = context.waitForEvent("page", { timeout: 5_000 }).catch(() => null);
  await serviceWorker
    .evaluate(async () => {
      if (chrome.action?.openPopup) {
        await chrome.action.openPopup();
      }
    })
    .catch(() => undefined);
  const actionPopup = await popupPromise;
  if (actionPopup) {
    await actionPopup.waitForLoadState("domcontentloaded").catch(() => undefined);
    return actionPopup;
  }

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
    waitUntil: "domcontentloaded"
  });
  return popup;
}

async function captureOptions(context, extensionId) {
  const options = await context.newPage();
  await options.setViewportSize({ width: 1280, height: 900 });
  await options.goto(`chrome-extension://${extensionId}/options.html`, {
    waitUntil: "domcontentloaded"
  });
  await options.waitForSelector("text=New word pace", { timeout: 10_000 });
  await options.waitForTimeout(500);
  const optionsGeneral = join(screenshotDir, "03-installed-options-general.png");
  await options.screenshot({ path: optionsGeneral, fullPage: false });
  await options.getByRole("tab", { name: "Translation" }).click();
  await options.waitForSelector("text=Sentence note preview", { timeout: 10_000 });
  await options.waitForTimeout(500);
  const optionsTranslation = join(
    screenshotDir,
    "04-installed-options-translation.png"
  );
  await options.screenshot({ path: optionsTranslation, fullPage: false });
  await options.close().catch(() => undefined);
  return { optionsGeneral, optionsTranslation };
}

async function injectSentenceHelpAndCapture({
  page,
  serviceWorker,
  fixtureUrl,
  sourceText,
  screenshotDir
}) {
  const sentenceHash = await page
    .locator("[data-ik-token-id][data-ik-sentence-hash]")
    .first()
    .getAttribute("data-ik-sentence-hash");
  if (!sentenceHash) {
    return {
      ok: false,
      text: "",
      screenshot: join(screenshotDir, "07-clicked-sentence-help-failed.png"),
      error: "Could not read sentence hash from injected token."
    };
  }

  await serviceWorker.evaluate(
    async ({ url, sentenceHash, sourceText }) => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find((candidate) => candidate.url === url);
      if (typeof tab?.id !== "number") {
        throw new Error("Fixture tab not found for sentence message.");
      }
      await chrome.tabs.sendMessage(tab.id, {
        type: "sentence/translation-result",
        results: [
          {
            sentenceHash,
            sourceText,
            translatedText:
              "La ciudad nueva e importante tiene al menos una pequena casa familiar cerca del agua.",
            learningNote: {
              summary:
                "Spanish keeps this sentence natural by placing descriptive words around the noun.",
              literalGloss:
                "la ciudad nueva e importante = the important new city\nal menos = at least\ncerca del agua = near the water",
              keyPhrase: "al menos = at least",
              canonicalUsage:
                "Use al menos when you want a minimum amount or threshold.",
              grammarFocus:
                "Spanish adjective order can change emphasis, so city/new/important does not map one-for-one."
            }
          }
        ]
      });
    },
    { url: fixtureUrl, sentenceHash, sourceText }
  );
  await page.waitForSelector("[data-ik-sentence-note='true']", { timeout: 10_000 });

  const screenshot = join(screenshotDir, "07-clicked-sentence-help.png");
  const result = await clickPopoverAndCapture(
    page,
    "[data-ik-sentence-note='true']",
    screenshot,
    { failScreenshot: join(screenshotDir, "07-clicked-sentence-help-failed.png") }
  );
  return result;
}

async function clickPopoverAndCapture(page, selector, path, options = {}) {
  await page.bringToFront();
  const target = page.locator(selector).first();
  await target.scrollIntoViewIfNeeded();

  for (const action of [
    () => clickVisibleClientRect(page, target),
    () => target.click({ force: true }),
    () => dispatchDomClick(page, selector),
    async () => {
      await target.focus();
      await page.keyboard.press("Enter");
    }
  ]) {
    await action();
    const opened = await waitForPopover(page, 2_500);
    if (opened) {
      await page.waitForTimeout(500);
      await page.screenshot({ path, fullPage: false });
      return {
        ok: true,
        text: await readPopoverText(page),
        screenshot: path,
        error: null
      };
    }
  }

  const failScreenshot = options.failScreenshot ?? path;
  await page.screenshot({ path: failScreenshot, fullPage: false });
  return {
    ok: false,
    text: "",
    screenshot: failScreenshot,
    error: `Popover did not open for selector ${selector}.`
  };
}

async function readPopoverText(page) {
  return page.locator("[data-ik-popover='true']").first().evaluate((popover) => {
    const lightDomText = popover.textContent ?? "";
    const shadowText = popover.shadowRoot?.textContent ?? "";
    return `${shadowText} ${lightDomText}`.replace(/\s+/g, " ").trim();
  });
}

async function clickVisibleClientRect(page, target) {
  const point = await target.evaluate((element) => {
    const rects = [...element.getClientRects()].filter(
      (rect) => rect.width > 0 && rect.height > 0
    );
    const rect = rects[0] ?? element.getBoundingClientRect();
    return {
      x: rect.left + Math.min(rect.width / 2, 24),
      y: rect.top + rect.height / 2
    };
  });
  await page.mouse.click(point.x, point.y);
}

async function dispatchDomClick(page, selector) {
  await page.evaluate((selector) => {
    const element = document.querySelector(selector);
    element?.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window
      })
    );
  }, selector);
}

async function waitForPopover(page, timeout) {
  return page
    .waitForSelector("[data-ik-popover='true']", { timeout })
    .then(() => true)
    .catch(() => false);
}

async function closePopover(page) {
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.waitForTimeout(250);
  await page
    .evaluate(() => {
      for (const popover of document.querySelectorAll("[data-ik-popover='true']")) {
        if (typeof popover.hidePopover === "function") {
          popover.hidePopover();
        } else {
          popover.remove();
        }
      }
    })
    .catch(() => undefined);
  await page.waitForTimeout(250);
}

function summarizePopoverResult(result, expectedPattern) {
  return {
    ok: result.ok,
    textCheck: result.ok ? expectedPattern.test(result.text) : false,
    screenshot: result.screenshot,
    error: result.error
  };
}

async function writeUserData(serviceWorker, key, value) {
  await serviceWorker.evaluate(
    async ({ key, value }) => {
      const database = await openDatabase();
      try {
        const transaction = database.transaction("user-data", "readwrite");
        transaction.objectStore("user-data").put({
          key,
          value,
          schemaVersion: 1,
          updatedAt: new Date().toISOString()
        });
        await transactionDone(transaction);
      } finally {
        database.close();
      }

      function openDatabase() {
        return new Promise((resolveOpen, rejectOpen) => {
          const request = indexedDB.open("immersionkit-extension", 7);
          request.onupgradeneeded = () => ensureStores(request.result, request.transaction);
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

      function ensureStores(database, transaction) {
        ensureStore(database, transaction, "sentence-cache", {
          keyPath: "sentenceHash"
        });
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
    },
    { key, value }
  );
}
