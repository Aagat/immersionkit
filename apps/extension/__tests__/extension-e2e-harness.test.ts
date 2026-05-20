import { createServer, type Server } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type BrowserContext, type Page, type Worker } from "playwright";
import { ensureLinuxHeadedBrowserDisplay } from "../../../tools/headed-browser-display.mjs";
import { startAssetPackServer } from "../../../tools/assets/asset-pack-server.mjs";

const execFileAsync = promisify(execFile);

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const extensionPath = join(extensionRoot, "dist");
const userDataDirs: string[] = [];
const servers: Server[] = [];
const contexts: BrowserContext[] = [];

const fixtureHtml = `<!doctype html>
<html>
  <head><title>ImmersionKit CRXJS-ready E2E fixture</title></head>
  <body>
    <main>
      <article>
        <h1>City services update</h1>
        <p>The important new city has at least one small family house near the water.</p>
        <p>As soon as we arrive at the old city, we read the important book right now.</p>
        <p>The public safety update includes school board schedules and weather forecasts.</p>
      </article>
    </main>
  </body>
</html>`;

describe("extension E2E harness", () => {
  beforeAll(async () => {
    const assetServer = await startAssetPackServer({ port: 0 });
    servers.push(assetServer.server);
    await buildExtension(assetServer.baseUrl);
  }, 60_000);

  afterAll(async () => {
    for (const context of contexts.splice(0)) {
      await context.close();
    }

    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolveClose) => {
            server.close(() => {
              resolveClose();
            });
          })
      )
    );

    await Promise.all(
      userDataDirs.splice(0).map((dir) =>
        rm(dir, {
          recursive: true,
          force: true,
          maxRetries: 3,
          retryDelay: 100
        })
      )
    );
  });

  it("opens Options on fresh install and persists first-run dismissal", async () => {
    const { context, extensionId } = await launchBuiltExtension();
    const options = await waitForExtensionOptionsPage(context, extensionId);

    await options.waitForSelector("text=Start with normal reading", {
      timeout: 10_000
    });
    await expect
      .poll(() => readUserDataValueFromExtensionPage(options, "first-run-intro-visible"))
      .toBe(true);

    const optionsText = await options.locator("body").innerText();
    expect(optionsText).toContain("small doses of Spanish");
    expect(optionsText).toContain("Progress and reading history stay on this device");
    expect(optionsText).toContain("pause any site");
    expect(optionsText).toContain("starting point and pace");
    expect(optionsText).toContain("Sentence help is optional");

    await options.getByRole("button", { name: "Got it" }).click();
    await expect
      .poll(() => readUserDataValueFromExtensionPage(options, "first-run-intro-visible"))
      .toBe(false);

    await options.reload({ waitUntil: "domcontentloaded" });
    await options.waitForSelector("text=New word pace", { timeout: 10_000 });
    expect(await options.locator("text=Start with normal reading").count()).toBe(0);

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: "domcontentloaded"
    });
    await popup.waitForSelector("text=This page is not supported", {
      timeout: 10_000
    });
    const popupText = await popup.locator("body").innerText();
    expect(popupText).toContain("does not expose a page URL");
    expect(popupText).toContain("article, blog, or docs page");
    expect(popupText).toContain("Controls unavailable");
  }, 60_000);

  it("loads the built CRXJS extension and exercises content, popup, options, and diagnostics", async () => {
    const fixtureUrl = await startFixtureServer();
    const { context, extensionId, serviceWorker } = await launchBuiltExtension();

    await seedSettings(serviceWorker);

    const page = await context.newPage();
    await page.goto(fixtureUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-ik-token-id]", { timeout: 10_000 });
    await page.waitForTimeout(8_000);

    const inlineSnapshot = await page.evaluate(() => ({
      rootBooted: document.documentElement.hasAttribute("data-immersionkit-root"),
      injectedTokens: document.querySelectorAll("[data-ik-token-id]").length,
      injectedPhrases: document.querySelectorAll("[data-ik-unit-kind='phrase']").length,
      blankPhraseTargets: [...document.querySelectorAll("[data-ik-unit-kind='phrase']")]
        .filter((node) => !(node.getAttribute("data-ik-target-token") ?? "").trim())
        .length,
      sentenceNotes: document.querySelectorAll("[data-ik-sentence-note='true']").length
    }));

    expect(inlineSnapshot.rootBooted).toBe(true);
    expect(inlineSnapshot.injectedTokens).toBeGreaterThan(0);
    expect(inlineSnapshot.injectedPhrases).toBeGreaterThan(0);
    expect(inlineSnapshot.blankPhraseTargets).toBe(0);
    expect(inlineSnapshot.sentenceNotes).toBe(0);

    const assetCache = await readAssetCacheSnapshot(serviceWorker);
    expect(assetCache.packMetadataCount).toBeGreaterThan(0);
    expect(assetCache.renderUnitRowCount).toBeGreaterThan(
      assetCache.packMetadataCount
    );
    expect(assetCache.lexemeRowCount).toBeGreaterThan(assetCache.packMetadataCount);

    await openFirstPopover(page, "[data-ik-unit-kind='word']");
    await expectPopover(page);
    const popoverLayer = await page.locator("[data-ik-popover='true']").evaluate((node) => ({
      position: getComputedStyle(node).position,
      topLayer: node.matches(":popover-open"),
      zIndex: getComputedStyle(node).zIndex
    }));
    expect(popoverLayer.position).toBe("fixed");
    expect(popoverLayer.topLayer).toBe(true);
    expect(popoverLayer.zIndex).toBe("2147483647");
    await page.evaluate(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    await expectPopover(page);

    await page.keyboard.press("Escape").catch(() => undefined);
    await openFirstPopover(page, "[data-ik-unit-kind='phrase']");
    const phrasePopoverText = await page.locator("[data-ik-popover='true']").innerText();
    expect(phrasePopoverText).toContain("A reusable phrase you may see again");
    expect(phrasePopoverText).not.toMatch(/learning queue|review due|confidence/);

    const diagnostics = await readPageDiagnostics(serviceWorker, fixtureUrl);
    expect(diagnostics.injectedPhrases).toBeGreaterThan(0);
    expect(diagnostics.freshPhraseAnalysisHits).toBeGreaterThanOrEqual(0);
    expect(diagnostics.phraseDecisionSamples.length).toBeGreaterThan(0);
    expect(diagnostics.tokenDecisionSamples.length).toBeGreaterThan(0);

    await setFixtureSiteEnabled(serviceWorker, false);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1_000);
    expect(await page.locator("[data-ik-token-id]").count()).toBe(0);

    await setFixtureSiteEnabled(serviceWorker, true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-ik-token-id]", { timeout: 10_000 });

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: "domcontentloaded"
    });
    await popup.waitForSelector("text=ImmersionKit", { timeout: 10_000 });
    const popupText = await popup.locator("body").innerText();
    expect(popupText).toContain("This page is not supported");
    expect(popupText).toContain("article, blog, or docs page");
    expect(popupText).toContain("Your reading data stays on this device.");

    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/options.html`, {
      waitUntil: "domcontentloaded"
    });
    await options.waitForSelector("text=New word pace", { timeout: 10_000 });
    await expect
      .poll(() => options.getByRole("button", { name: "Save changes" }).isEnabled())
      .toBe(true);
    const discoveryRateInput = options.locator("#settings-discovery-rate");
    await discoveryRateInput.focus();
    await options.keyboard.press("Home");
    for (let step = 0; step < 7; step += 1) {
      await options.keyboard.press("ArrowRight");
    }
    await options.getByRole("radio", { name: "Intermediate" }).click();
    await options.getByRole("button", { name: "Save changes" }).click();
    await options.waitForSelector("text=Settings saved.", { timeout: 5_000 });

    const savedSettings = await readSettingsFromExtensionPage(options);
    expect(savedSettings.discoveryRate).toBe(0.07);
    expect(savedSettings.proficiencySeed).toBe("intermediate");

    await options
      .getByLabel("Options sections")
      .getByRole("button", { name: "Translation" })
      .click();
    await options.locator(".ik-ui-field select").selectOption("openai");
    await options
      .getByRole("switch", { name: "Enable sentence help" })
      .click();
    await options.waitForSelector(
      "text=Add a valid OpenAI API key before turning sentence help on.",
      { timeout: 5_000 }
    );

    expect((await readSettingsFromExtensionPage(options)).sentenceTranslationEnabled).toBe(false);
  }, 90_000);

  it("keeps injected marks and popovers readable on light and dark pages", async () => {
    const { context, serviceWorker } = await launchBuiltExtension();
    await seedSettings(serviceWorker);

    for (const theme of ["light", "dark"] as const) {
      const fixtureUrl = await startFixtureServer(createThemedFixtureHtml(theme));
      const page = await context.newPage();
      await page.goto(fixtureUrl, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("[data-ik-token-id]", { timeout: 10_000 });
      await page.waitForTimeout(8_000);

      const pageTheme = await page.evaluate(() =>
        document.documentElement.getAttribute("data-ik-ui-theme")
      );
      expect(pageTheme).toBe(theme);

      await openFirstPopover(page, "[data-ik-unit-kind='word']");
      await expectPopover(page);
      assertReadableContentUi(await readContentUiStyles(page), theme);

      await page.keyboard.press("Escape").catch(() => undefined);
      await openFirstPopover(page, "[data-ik-unit-kind='phrase']");
      await expectPopover(page);
      assertReadableContentUi(await readContentUiStyles(page), theme);
    }
  }, 90_000);
});

async function buildExtension(assetBaseUrl: string): Promise<void> {
  await execFileAsync("pnpm", ["build"], {
    cwd: extensionRoot,
    env: {
      ...process.env,
      VITE_IMMERSIONKIT_ASSET_BASE_URL: assetBaseUrl
    },
    maxBuffer: 1024 * 1024 * 8
  });

  if (!existsSync(join(extensionPath, "manifest.json"))) {
    throw new Error("Expected CRXJS/Vite build to emit dist/manifest.json.");
  }
}

async function waitForExtensionOptionsPage(
  context: BrowserContext,
  extensionId: string
): Promise<Page> {
  const optionsUrl = `chrome-extension://${extensionId}/options.html`;
  await expect
    .poll(
      () =>
        context
          .pages()
          .map((page) => page.url())
          .find((url) => url.startsWith(optionsUrl)) ?? null,
      { timeout: 10_000 }
    )
    .not.toBeNull();

  const page = context
    .pages()
    .find((candidate) => candidate.url().startsWith(optionsUrl));
  if (!page) {
    throw new Error("Fresh install did not open the Options page.");
  }
  await page.waitForLoadState("domcontentloaded");
  return page;
}

function createThemedFixtureHtml(theme: "light" | "dark"): string {
  const dark = theme === "dark";
  return `<!doctype html>
<html>
  <head>
    <title>ImmersionKit ${theme} visual fixture</title>
    <style>
      html, body {
        margin: 0;
        background: ${dark ? "#1d2330" : "#f8f6ee"};
        color: ${dark ? "#eef4ff" : "#111827"};
      }
      main {
        max-width: 760px;
        margin: 0 auto;
        padding: 80px 32px;
        font: 18px/1.7 Georgia, serif;
      }
      h1 {
        font: 700 40px/1.15 system-ui, sans-serif;
      }
    </style>
  </head>
  <body>
    <main>
      <article>
        <h1>City services update</h1>
        <p>The important new city has at least one small family house near the water.</p>
        <p>As soon as we arrive at the old city, we read the important book right now.</p>
        <p>The public safety update includes school board schedules and weather forecasts.</p>
      </article>
    </main>
  </body>
</html>`;
}

async function startFixtureServer(html = fixtureHtml): Promise<string> {
  const server = createServer((_, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
  });
  servers.push(server);

  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolveListen();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to start local E2E fixture server.");
  }

  return `http://127.0.0.1:${address.port}/`;
}

async function launchBuiltExtension(): Promise<{
  context: BrowserContext;
  extensionId: string;
  serviceWorker: Worker;
}> {
  ensureLinuxHeadedBrowserDisplay();

  const userDataDir = await mkdtemp(join(tmpdir(), "ik-extension-e2e-"));
  userDataDirs.push(userDataDir);

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });
  contexts.push(context);

  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker", {
      timeout: 10_000
    });
  }

  return {
    context,
    extensionId: new URL(serviceWorker.url()).hostname,
    serviceWorker
  };
}

async function seedSettings(serviceWorker: Worker): Promise<void> {
  await writeUserData(serviceWorker, "settings", {
    enabled: true,
    discoveryRate: 1,
    targetLanguage: "es",
    sentenceTranslationEnabled: false,
    provider: "none",
    proficiencySeed: "beginner"
  });
}

async function openFirstPopover(page: Page, selector: string): Promise<void> {
  await page.locator(selector).first().click();
}

async function expectPopover(page: Page): Promise<void> {
  await page.waitForSelector("[data-ik-popover='true']", { timeout: 5_000 });
  await expect.poll(() => page.locator("[data-ik-popover='true']").isVisible()).toBe(true);
}

async function readContentUiStyles(page: Page): Promise<ContentUiStyleSnapshot> {
  return page.evaluate(() => {
    const read = (selector: string) => {
      const node = document.querySelector(selector);
      if (!node) {
        return null;
      }

      const styles = getComputedStyle(node);
      return {
        backgroundColor: styles.backgroundColor,
        color: styles.color,
        borderColor: styles.borderColor,
        textDecorationColor: styles.textDecorationColor
      };
    };

    return {
      body: read("body"),
      activeToken: read("[data-ik-active='true']"),
      popover: read("[data-ik-popover='true']"),
      tokenBox: read(".ik-ui-token-pair span"),
      exampleLine: read(".ik-ui-example-line"),
      button: read(".ik-content-popover .ik-ui-button")
    };
  });
}

type ContentUiStyleSnapshot = {
  body: CssStyleSnapshot | null;
  activeToken: CssStyleSnapshot | null;
  popover: CssStyleSnapshot | null;
  tokenBox: CssStyleSnapshot | null;
  exampleLine: CssStyleSnapshot | null;
  button: CssStyleSnapshot | null;
};

type CssStyleSnapshot = {
  backgroundColor: string;
  color: string;
  borderColor: string;
  textDecorationColor: string;
};

function assertReadableContentUi(
  styles: ContentUiStyleSnapshot,
  theme: "light" | "dark"
): void {
  expect(styles.body).not.toBeNull();
  expect(styles.activeToken).not.toBeNull();
  expect(styles.popover).not.toBeNull();
  expect(styles.tokenBox).not.toBeNull();
  expect(styles.button).not.toBeNull();

  const bodyBackground = parseRgb(styles.body!.backgroundColor);
  const tokenColor = parseRgb(styles.activeToken!.color);
  const popoverBackground = parseRgb(styles.popover!.backgroundColor);
  const popoverText = parseRgb(styles.popover!.color);
  const tokenBoxBackground = parseRgb(styles.tokenBox!.backgroundColor);
  const tokenBoxText = parseRgb(styles.tokenBox!.color);
  const buttonBackground = parseRgb(styles.button!.backgroundColor);
  const buttonText = parseRgb(styles.button!.color);

  expect(contrastRatio(tokenColor, bodyBackground)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(popoverText, popoverBackground)).toBeGreaterThanOrEqual(7);
  expect(contrastRatio(tokenBoxText, tokenBoxBackground)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(buttonText, buttonBackground)).toBeGreaterThanOrEqual(4.5);

  if (theme === "dark") {
    expect(relativeLuminance(popoverBackground)).toBeLessThan(0.08);
    expect(relativeLuminance(tokenBoxBackground)).toBeLessThan(0.1);
    return;
  }

  expect(relativeLuminance(popoverBackground)).toBeGreaterThan(0.9);
  expect(relativeLuminance(tokenBoxBackground)).toBeGreaterThan(0.85);
}

function parseRgb(value: string): [number, number, number] {
  const match = value.match(
    /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*[0-9.]+)?\s*\)$/i
  );
  if (!match) {
    throw new Error(`Expected an rgb/rgba color, got ${value}`);
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function contrastRatio(
  left: [number, number, number],
  right: [number, number, number]
): number {
  const leftLuminance = relativeLuminance(left);
  const rightLuminance = relativeLuminance(right);
  const lighter = Math.max(leftLuminance, rightLuminance);
  const darker = Math.min(leftLuminance, rightLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance([red, green, blue]: [number, number, number]): number {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

async function readPageDiagnostics(
  serviceWorker: Worker,
  fixtureUrl: string
): Promise<{
  injectedPhrases: number;
  freshPhraseAnalysisHits: number;
  phraseDecisionSamples: unknown[];
  tokenDecisionSamples: unknown[];
}> {
  return serviceWorker.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({});
    const tabId = tabs.find((tab) => tab.url === url)?.id;
    if (typeof tabId !== "number") {
      throw new Error("Fixture tab not found.");
    }

    return chrome.tabs.sendMessage(tabId, {
      type: "immersionkit/content/get-page-diagnostics"
    });
  }, fixtureUrl);
}

async function setFixtureSiteEnabled(
  serviceWorker: Worker,
  enabled: boolean
): Promise<void> {
  await writeUserData(serviceWorker, "site-settings", {
    "127.0.0.1": {
      hostname: "127.0.0.1",
      enabled,
      discoveryRate: null,
      sentenceTranslationEnabled: null,
      updatedAt: new Date().toISOString()
    }
  });
}

async function readSettingsFromExtensionPage(
  page: Page
): Promise<Record<string, unknown>> {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown>>((resolveRead, rejectRead) => {
        chrome.runtime.sendMessage(
          {
            type: "user-data/get",
            keys: ["settings"]
          },
          (response?: unknown) => {
            if (chrome.runtime.lastError) {
              rejectRead(new Error(chrome.runtime.lastError.message));
              return;
            }

            const values =
              response && typeof response === "object" && "values" in response
                ? (response as { values?: Record<string, unknown> }).values
                : null;
            resolveRead(
              (values?.["settings"] as Record<string, unknown>) ?? {}
            );
          }
        );
      })
  );
}

async function readUserDataValueFromExtensionPage(
  page: Page,
  key: string
): Promise<unknown> {
  return page.evaluate(
    (userDataKey) =>
      new Promise<unknown>((resolveRead, rejectRead) => {
        chrome.runtime.sendMessage(
          {
            type: "user-data/get",
            keys: [userDataKey]
          },
          (response?: unknown) => {
            if (chrome.runtime.lastError) {
              rejectRead(new Error(chrome.runtime.lastError.message));
              return;
            }

            const values =
              response && typeof response === "object" && "values" in response
                ? (response as { values?: Record<string, unknown> }).values
                : null;
            resolveRead(values?.[userDataKey]);
          }
        );
      }),
    key
  );
}

async function writeUserData(
  serviceWorker: Worker,
  key: string,
  value: unknown
): Promise<void> {
  await serviceWorker.evaluate(
    async ({ key: userDataKey, value: userDataValue }) => {
      const database = await openImmersionKitDatabaseForUserData();
      try {
        const transaction = database.transaction("user-data", "readwrite");
        transaction.objectStore("user-data").put({
          key: userDataKey,
          value: userDataValue,
          schemaVersion: 1,
          updatedAt: new Date().toISOString()
        });
        await transactionDone(transaction);
      } finally {
        database.close();
      }

      async function openImmersionKitDatabaseForUserData(): Promise<IDBDatabase> {
        return new Promise((resolveOpen, rejectOpen) => {
          const request = indexedDB.open("immersionkit-extension", 7);
          request.onupgradeneeded = () => {
            ensureExtensionStores(request.result, request.transaction!);
          };
          request.onsuccess = () => resolveOpen(request.result);
          request.onerror = () =>
            rejectOpen(request.error ?? new Error("IndexedDB open failed."));
        });
      }

      function transactionDone(transaction: IDBTransaction): Promise<void> {
        return new Promise((resolveDone, rejectDone) => {
          transaction.oncomplete = () => resolveDone();
          transaction.onabort = () =>
            rejectDone(transaction.error ?? new Error("IndexedDB transaction aborted."));
          transaction.onerror = () =>
            rejectDone(transaction.error ?? new Error("IndexedDB transaction failed."));
        });
      }

      function ensureExtensionStores(
        database: IDBDatabase,
        transaction: IDBTransaction
      ): void {
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

      function ensureStore(
        database: IDBDatabase,
        transaction: IDBTransaction,
        storeName: string,
        options: IDBObjectStoreParameters
      ): IDBObjectStore {
        return database.objectStoreNames.contains(storeName)
          ? transaction.objectStore(storeName)
          : database.createObjectStore(storeName, options);
      }

      function ensureIndex(
        store: IDBObjectStore,
        indexName: string,
        keyPath: string | string[]
      ): void {
        if (!store.indexNames.contains(indexName)) {
          store.createIndex(indexName, keyPath, { unique: false });
        }
      }
    },
    { key, value }
  );
}

async function readAssetCacheSnapshot(serviceWorker: Worker): Promise<{
  packMetadataCount: number;
  renderUnitRowCount: number;
  lexemeRowCount: number;
}> {
  return serviceWorker.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolveOpen, rejectOpen) => {
      const request = indexedDB.open("immersionkit-extension");
      request.onsuccess = () => resolveOpen(request.result);
      request.onerror = () =>
        rejectOpen(request.error ?? new Error("IndexedDB open failed."));
    });

    try {
      const transaction = database.transaction(
        ["asset-packs", "asset-pack-render-units", "asset-pack-lexemes"],
        "readonly"
      );
      const countStore = (storeName: string) =>
        new Promise<number>((resolveCount, rejectCount) => {
          const request = transaction.objectStore(storeName).count();
          request.onsuccess = () => resolveCount(request.result);
          request.onerror = () =>
            rejectCount(request.error ?? new Error("IndexedDB count failed."));
        });

      const [packMetadataCount, renderUnitRowCount, lexemeRowCount] =
        await Promise.all([
          countStore("asset-packs"),
          countStore("asset-pack-render-units"),
          countStore("asset-pack-lexemes")
        ]);

      return {
        packMetadataCount,
        renderUnitRowCount,
        lexemeRowCount
      };
    } finally {
      database.close();
    }
  });
}
