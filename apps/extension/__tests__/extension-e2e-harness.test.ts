import { createServer, type Server } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  chromium,
  type BrowserContext,
  type Frame,
  type Page,
  type Worker
} from "playwright";
import { startAssetPackServer } from "../../../tools/assets/asset-pack-server.mjs";
import { getExtensionLaunchOptions } from "../../../tools/browser-launch-mode.mjs";

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

  it("opens Options on fresh install and persists first-run setup", async () => {
    const { context, extensionId } = await launchBuiltExtension();
    const options = await waitForExtensionOptionsPage(context, extensionId);

    await options.waitForSelector("text=Choose your starting point", {
      timeout: 10_000
    });
    await expect
      .poll(() => readUserDataValueFromExtensionPage(options, "first-run-intro-visible"))
      .toBe(true);

    const optionsText = await options.locator("body").innerText();
    expect(optionsText).toContain("Setup");
    expect(optionsText).toContain("Starting level");
    expect(optionsText).toContain("This is only a starting point");

    await options.getByRole("radio", { name: "Intermediate" }).click();
    await options.getByRole("button", { name: "Continue" }).click();
    await options.waitForSelector("text=Choose your Spanish density", {
      timeout: 5_000
    });
    const discoveryRateInput = options.locator("#first-run-discovery-rate");
    await discoveryRateInput.focus();
    await options.keyboard.press("Home");
    for (let step = 0; step < 7; step += 1) {
      await options.keyboard.press("ArrowRight");
    }
    await options.getByRole("button", { name: "Continue" }).click();
    await options.waitForSelector("text=Setup is complete", {
      timeout: 5_000
    });
    await options.getByRole("button", { name: "Finish setup" }).click();
    await expect
      .poll(() => readUserDataValueFromExtensionPage(options, "first-run-intro-visible"))
      .toBe(false);
    const setupSettings = await readSettingsFromExtensionPage(options);
    expect(setupSettings.discoveryRate).toBe(0.07);
    expect(setupSettings.proficiencySeed).toBe("intermediate");

    await options.reload({ waitUntil: "domcontentloaded" });
    await options.waitForSelector("text=Quick status across account", {
      timeout: 10_000
    });
    expect(await options.locator("text=Setup is complete").count()).toBe(0);

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: "domcontentloaded"
    });
    await popup.waitForSelector("text=This page is not supported", {
      timeout: 10_000
    });
    const popupText = await popup.locator("body").innerText();
    expect(popupText).toContain("ImmersionKit");
    expect(popupText).toContain("does not expose a page URL");
    expect(popupText).toContain("article, blog, or docs page");
    expect(popupText).toContain("Controls unavailable");
    await expectPopupFrameWidth(popup);
    expect(await popup.getByRole("button", { name: "Open settings" }).count()).toBe(
      1
    );
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
    const phrasePopoverText = await readPopoverText(page);
    expect(phrasePopoverText).toContain("Translation not available");
    expect(phrasePopoverText).toContain("Close help");
    expect(phrasePopoverText).not.toContain("Hide phrase");
    expect(phrasePopoverText).not.toContain("A reusable phrase you may see again");
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
    await page.bringToFront();
    const overlayResponse = await serviceWorker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (typeof tab?.id !== "number") {
        return null;
      }

      return chrome.tabs.sendMessage(tab.id, {
        type: "immersionkit/popup-overlay/toggle",
        zoomFactor: 1
      });
    });
    expect(overlayResponse).toMatchObject({ ok: true, visible: true });
    const overlayFrame = await waitForPopupOverlayFrame(page);
    await overlayFrame.waitForSelector("text=Reading report", { timeout: 10_000 });
    const overlayOverflow = await overlayFrame.evaluate(() => {
      const root = document.getElementById("root");
      return Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
        root?.scrollWidth ?? 0
      ) - window.innerWidth;
    });
    expect(overlayOverflow).toBeLessThanOrEqual(0);

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: "domcontentloaded"
    });
    await popup.waitForSelector("text=This page is not supported", {
      timeout: 10_000
    });
    const popupText = await popup.locator("body").innerText();
    expect(popupText).toContain("ImmersionKit");
    expect(popupText).toContain("This page is not supported");
    expect(popupText).toContain("article, blog, or docs page");
    expect(popupText).toContain("Controls unavailable");
    expect(popupText).not.toContain("Your reading data stays on this device.");
    await expectPopupFrameWidth(popup);
    expect(await popup.getByRole("button", { name: "Open settings" }).count()).toBe(
      1
    );

    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/options.html`, {
      waitUntil: "domcontentloaded"
    });
    await options.waitForSelector("text=Quick status across account", {
      timeout: 10_000
    });
    await expect
      .poll(() => options.getByRole("button", { name: "Save changes" }).isEnabled())
      .toBe(true);
    await options.getByRole("tab", { name: "Reading" }).click();
    await options.waitForSelector("text=Density preview", { timeout: 5_000 });
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

    await options.getByRole("tab", { name: "Translation" }).click();
    await options.getByRole("combobox", { name: "Provider" }).click();
    await options.getByRole("option", { name: "OpenAI" }).click();
    await options
      .getByRole("switch", { name: "Enable sentence help" })
      .click();
    await options.waitForSelector(
      "text=Add a valid OpenAI API key before turning sentence help on.",
      { timeout: 5_000 }
    );

    expect((await readSettingsFromExtensionPage(options)).sentenceTranslationEnabled).toBe(false);
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

async function startFixtureServer(): Promise<string> {
  const server = createServer((_, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(fixtureHtml);
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
  const userDataDir = await mkdtemp(join(tmpdir(), "ik-extension-e2e-"));
  userDataDirs.push(userDataDir);

  const context = await chromium.launchPersistentContext(
    userDataDir,
    getExtensionLaunchOptions(extensionPath)
  );
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
  await writeUserData(serviceWorker, "first-run-intro-visible", false);
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

async function readPopoverText(page: Page): Promise<string> {
  return page.locator("[data-ik-popover='true']").evaluate((node) => {
    return node.shadowRoot?.textContent ?? node.textContent ?? "";
  });
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
          const request = indexedDB.open("immersionkit-extension", 8);
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
        const ttsVoices = ensureStore(database, transaction, "tts-voices", {
          keyPath: "voiceId"
        });
        ensureIndex(ttsVoices, "languagePair", "languagePair");
        ensureIndex(ttsVoices, "assetVersion", "assetVersion");
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

async function waitForPopupOverlayFrame(page: Page): Promise<Frame> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const frame = page
      .frames()
      .find((candidate) =>
        candidate.url().includes("popup.html?surface=overlay")
      );
    if (frame) {
      return frame;
    }

    await page.waitForTimeout(100);
  }

  throw new Error("Timed out waiting for ImmersionKit popup overlay frame.");
}

async function expectPopupFrameWidth(page: Page): Promise<void> {
  const frameWidth = await page.locator("[data-ik-frame='popup']").evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const styles = window.getComputedStyle(node);
    return {
      width: Math.round(rect.width),
      minWidth: styles.minWidth
    };
  });

  expect(frameWidth).toEqual({
    width: 360,
    minWidth: "360px"
  });
}
