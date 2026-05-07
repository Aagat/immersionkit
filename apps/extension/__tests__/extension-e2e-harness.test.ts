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
    expect(popupText).toContain("Read normally. We add a little Spanish.");
    expect(popupText).toContain("This page is not supported");
    expect(popupText).toContain("Your reading data stays on this device.");

    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/options.html`, {
      waitUntil: "domcontentloaded"
    });
    await options.waitForSelector("text=New word pace", { timeout: 10_000 });
    await options.locator("#settings-discovery-rate").fill("7");
    await options.getByRole("radio", { name: "Intermediate" }).click();
    await options.getByRole("button", { name: "Save changes" }).click();
    await options.waitForSelector("text=Settings saved.", { timeout: 5_000 });

    const savedSettings = await readSettings(serviceWorker);
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

    expect((await readSettings(serviceWorker)).sentenceTranslationEnabled).toBe(false);
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
  await serviceWorker.evaluate(async () => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set({
      "immersionkit.settings": {
        enabled: true,
        discoveryRate: 1,
        targetLanguage: "es",
        sentenceTranslationEnabled: false,
        provider: "none",
        proficiencySeed: "beginner"
      }
    });
  });
}

async function openFirstPopover(page: Page, selector: string): Promise<void> {
  await page.locator(selector).first().click();
}

async function expectPopover(page: Page): Promise<void> {
  await page.waitForSelector("[data-ik-popover='true']", { timeout: 5_000 });
  await expect.poll(() => page.locator("[data-ik-popover='true']").isVisible()).toBe(true);
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
  await serviceWorker.evaluate(async (nextEnabled) => {
    await chrome.storage.local.set({
      "immersionkit.siteSettings": {
        "127.0.0.1": {
          hostname: "127.0.0.1",
          enabled: nextEnabled,
          discoveryRate: null,
          sentenceTranslationEnabled: null,
          updatedAt: new Date().toISOString()
        }
      }
    });
  }, enabled);
}

async function readSettings(serviceWorker: Worker): Promise<Record<string, unknown>> {
  return serviceWorker.evaluate(async () => {
    return (await chrome.storage.local.get("immersionkit.settings"))[
      "immersionkit.settings"
    ];
  });
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
