import { createServer } from "node:http";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
const userDataDir = await mkdtempForRun();
const ANALYSIS_SETTLE_MS = 8_000;
const outputDir =
  process.env.IK_PUBLIC_PREVIEW_OUTPUT_DIR ??
  (existsSync("/private/tmp")
    ? "/private/tmp/immersionkit-public-preview-acceptance"
    : join(tmpdir(), "immersionkit-public-preview-acceptance"));

const normalFixtures = [
  {
    route: "/news/river-morning",
    label: "news-river-morning",
    fileName: "public-preview/news-river-morning.html",
    minInjectedTokens: 1,
    maxInlineDensity: 0.24,
    forbiddenText: [
      "lata watch",
      "lata stay",
      "derecho bank",
      "planta a temporary",
      "luz rain",
      "arriba the street"
    ],
    forbiddenRenderedTokens: [
      { source: "can", target: "lata" },
      { source: "right", target: "derecho" },
      { source: "plant", target: "planta" },
      { source: "light", target: "luz" }
    ]
  },
  {
    route: "/blog/reading-week",
    label: "blog-reading-week",
    fileName: "public-preview/blog-reading-week.html",
    minInjectedTokens: 1,
    maxInlineDensity: 0.24,
    forbiddenText: [
      "lata be enough",
      "derecho answer",
      "mirar my pace",
      "mirar pace",
      "necesidad to translate"
    ],
    forbiddenRenderedTokens: [
      { source: "can", target: "lata" },
      { source: "right", target: "derecho" },
      { source: "watch", target: "mirar" }
    ]
  },
  {
    route: "/docs/cache-playbook",
    label: "docs-cache-playbook",
    fileName: "public-preview/docs-cache-playbook.html",
    minInjectedTokens: 1,
    maxInlineDensity: 0.24,
    codeBlockNeedle: "max_wait_seconds",
    forbiddenText: [
      "lata watch",
      "derecho place",
      "planta a manual",
      "luz chart",
      "arriba to the next"
    ],
    forbiddenRenderedTokens: [
      { source: "can", target: "lata" },
      { source: "right", target: "derecho" },
      { source: "plant", target: "planta" },
      { source: "light", target: "luz" }
    ],
    forbiddenCodeText: ["calentar", "manual cheque", "segundos"]
  }
];

const sensitiveFixture = {
  route: "/account/billing",
  label: "sensitive-account",
  fileName: "public-preview/sensitive-account.html"
};

const phraseInteractionFixture = {
  route: "/preview/phrase-popover",
  label: "phrase-popover-seeded",
  fileName: "public-preview/phrase-popover-seeded.html"
};

const phraseInteractionFixtures = [phraseInteractionFixture, ...normalFixtures];
const allFixtures = [...normalFixtures, sensitiveFixture, phraseInteractionFixture];
const fixturePages = new Map(
  await Promise.all(
    allFixtures.map(async (fixture) => [
      fixture.route,
      await readFile(join(repoRoot, "fixtures/pages", fixture.fileName), "utf8")
    ])
  )
);

if (!existsSync(join(extensionPath, "manifest.json"))) {
  throw new Error(
    "Built extension not found. Run `pnpm build` before `pnpm smoke:preview`, or use `pnpm smoke:preview:build`."
  );
}

const serviceWorkerLoader = await readFile(
  join(extensionPath, "service-worker-loader.js"),
  "utf8"
);
if (serviceWorkerLoader.includes("localhost:")) {
  throw new Error(
    "Extension dist appears to contain a dev service worker. Run `pnpm build` before `pnpm smoke:preview`, or use `pnpm smoke:preview:build`."
  );
}

await mkdir(outputDir, { recursive: true });

const assetServer = await startAssetPackServer({
  port: Number(process.env.IK_ASSET_PACK_PORT ?? 8787)
});

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
  throw new Error("Failed to start local public-preview fixture server.");
}

const context = await chromium.launchPersistentContext(
  userDataDir,
  getExtensionLaunchOptions(extensionPath)
);

const screenshots = [];
const fixtureSummaries = [];
const checks = {
  desktopWordPopover: false,
  desktopPhrasePopover: false,
  narrowWordPopover: false,
  narrowPhrasePopover: false,
  sentenceNotes: false,
  pauseResume: false,
  sensitiveSkip: false
};

try {
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker", { timeout: 10_000 });
  }

  serviceWorker.on("console", (message) => {
    console.log(`[service-worker:${message.type()}] ${message.text()}`);
  });

  const page = await context.newPage();
  page.on("console", (message) => {
    console.log(`[page:${message.type()}] ${message.text()}`);
  });

  const baseUrl = `http://127.0.0.1:${address.port}`;

  await page.setViewportSize({ width: 1280, height: 900 });
  for (const fixture of normalFixtures) {
    const snapshot = await runNormalFixture(page, baseUrl, fixture);
    fixtureSummaries.push(snapshot);

    if (!checks.desktopWordPopover && snapshot.injectedWords > 0) {
      await exercisePopover(page, {
        label: `${fixture.label}-desktop-word`,
        selector: "[data-ik-unit-kind='word']",
        expectedKind: "word"
      });
      checks.desktopWordPopover = true;
    }

    if (!checks.desktopPhrasePopover && snapshot.injectedPhrases > 0) {
      await exercisePopover(page, {
        label: `${fixture.label}-desktop-phrase`,
        selector: "[data-ik-unit-kind='phrase']",
        expectedKind: "phrase"
      });
      checks.desktopPhrasePopover = true;
    }
  }

  await setPreviewSettings(serviceWorker, {
    discoveryRate: 1,
    proficiencySeed: "beginner"
  });
  if (!checks.desktopPhrasePopover) {
    await exercisePopoverAcrossFixtures(page, baseUrl, {
      viewport: { width: 1280, height: 900 },
      label: "desktop-phrase-seeded",
      selector: "[data-ik-unit-kind='phrase']",
      expectedKind: "phrase"
    });
    checks.desktopPhrasePopover = true;
  }

  await runNarrowPopoverChecks(page, baseUrl);
  checks.narrowWordPopover = true;
  checks.narrowPhrasePopover = true;

  await simulateSentenceNotes(page, serviceWorker, `${baseUrl}${normalFixtures[0].route}`);
  checks.sentenceNotes = true;

  await verifyPauseResume(page, serviceWorker, baseUrl);
  checks.pauseResume = true;

  const sensitiveSnapshot = await runSensitiveFixture(
    page,
    `${baseUrl}${sensitiveFixture.route}`
  );
  fixtureSummaries.push(sensitiveSnapshot);
  checks.sensitiveSkip = true;

  assertAllChecksCompleted(checks);

  const summary = {
    generatedAt: new Date().toISOString(),
    outputDir,
    fixtures: fixtureSummaries,
    checks,
    screenshots
  };
  const summaryPath = join(outputDir, "summary.json");
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log("[public-preview] Acceptance summary");
  console.log(JSON.stringify(summary, null, 2));
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

async function mkdtempForRun() {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(join(tmpdir(), "ik-public-preview-"));
}

async function runNormalFixture(page, baseUrl, fixture) {
  await page.goto(`${baseUrl}${fixture.route}`, {
    waitUntil: "domcontentloaded"
  });
  await page.waitForFunction(
    () => document.documentElement.hasAttribute("data-immersionkit-root"),
    null,
    { timeout: 10_000 }
  );
  await page.waitForSelector("[data-ik-token-id]", { timeout: 12_000 });
  await page.waitForTimeout(ANALYSIS_SETTLE_MS);

  const screenshotPath = await captureScreenshot(page, `${fixture.label}-desktop`);
  const snapshot = await collectPageSnapshot(page, fixture.label);
  assertNormalFixtureSnapshot(fixture, snapshot);

  return {
    ...snapshot,
    screenshotPath
  };
}

async function runSensitiveFixture(page, fixtureUrl) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(fixtureUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1_000);
  const screenshotPath = await captureScreenshot(page, "sensitive-account-skip");
  const snapshot = await collectPageSnapshot(page, sensitiveFixture.label);

  if (snapshot.rootBooted) {
    throw new Error("Sensitive account fixture booted the content runtime.");
  }
  if (snapshot.injectedTokens !== 0) {
    throw new Error("Sensitive account fixture rendered inline learning UI.");
  }
  if (!snapshot.textContent.includes("Account and billing review")) {
    throw new Error("Sensitive account fixture did not load expected content.");
  }

  return {
    ...snapshot,
    screenshotPath
  };
}

async function runNarrowPopoverChecks(page, baseUrl) {
  await page.setViewportSize({ width: 390, height: 760 });
  let wordChecked = false;
  let phraseChecked = false;

  for (const fixture of phraseInteractionFixtures) {
    await page.goto(`${baseUrl}${fixture.route}`, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForFunction(
      () => document.documentElement.hasAttribute("data-immersionkit-root"),
      null,
      { timeout: 10_000 }
    );
    await page.waitForSelector("[data-ik-token-id]", { timeout: 12_000 });
    await page.waitForTimeout(ANALYSIS_SETTLE_MS);

    if (!wordChecked && (await page.locator("[data-ik-unit-kind='word']").count()) > 0) {
      await exercisePopover(page, {
        label: "narrow-word",
        selector: "[data-ik-unit-kind='word']",
        expectedKind: "word"
      });
      wordChecked = true;
    }

    if (
      !phraseChecked &&
      (await page.locator("[data-ik-unit-kind='phrase']").count()) > 0
    ) {
      await exercisePopover(page, {
        label: "narrow-phrase",
        selector: "[data-ik-unit-kind='phrase']",
        expectedKind: "phrase"
      });
      phraseChecked = true;
    }

    if (wordChecked && phraseChecked) {
      return;
    }
  }

  if (!wordChecked || !phraseChecked) {
    throw new Error(
      `Narrow popover checks incomplete: word=${wordChecked}, phrase=${phraseChecked}.`
    );
  }
}

async function exercisePopoverAcrossFixtures(page, baseUrl, input) {
  await page.setViewportSize(input.viewport);
  const attemptedFixtures = [];

  for (const fixture of phraseInteractionFixtures) {
    await page.goto(`${baseUrl}${fixture.route}`, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForFunction(
      () => document.documentElement.hasAttribute("data-immersionkit-root"),
      null,
      { timeout: 10_000 }
    );
    await page.waitForSelector("[data-ik-token-id]", { timeout: 12_000 });
    await page.waitForTimeout(ANALYSIS_SETTLE_MS);

    if ((await page.locator(input.selector).count()) > 0) {
      await exercisePopover(page, {
        label: `${input.label}-${fixture.label}`,
        selector: input.selector,
        expectedKind: input.expectedKind
      });
      return;
    }

    attemptedFixtures.push({
      label: fixture.label,
      ...(await collectInteractionDiagnostics(page))
    });
  }

  throw new Error(
    `No ${input.expectedKind} target found for ${input.label}. Attempted fixture diagnostics: ${JSON.stringify(attemptedFixtures)}`
  );
}

async function simulateSentenceNotes(page, serviceWorker, fixtureUrl) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(fixtureUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-ik-token-id]", { timeout: 12_000 });
  await page.waitForTimeout(ANALYSIS_SETTLE_MS);

  const candidates = await page.evaluate(() => {
    const byHash = new Map();
    for (const node of document.querySelectorAll("[data-ik-sentence-hash]")) {
      const sentenceHash = node.getAttribute("data-ik-sentence-hash");
      const sourceText = node.getAttribute("data-ik-sentence");
      if (sentenceHash && sourceText && !byHash.has(sentenceHash)) {
        byHash.set(sentenceHash, sourceText);
      }
    }

    return [...byHash.entries()].slice(0, 2).map(([sentenceHash, sourceText]) => ({
      sentenceHash,
      sourceText
    }));
  });

  if (candidates.length === 0) {
    throw new Error("No sentence candidates were available for simulated notes.");
  }

  const results = candidates.map((candidate, index) => ({
    sentenceHash: candidate.sentenceHash,
    sourceText: candidate.sourceText,
    translatedText:
      index === 0
        ? "La vista previa mantiene la lectura tranquila."
        : "La ayuda de frase aparece solo cuando hace falta.",
    learningNote: {
      summary: "Simulated public-preview sentence help.",
      literalGloss: "",
      keyPhrase: "",
      canonicalUsage: "",
      grammarFocus: ""
    }
  }));

  await sendSentenceTranslationResults(serviceWorker, fixtureUrl, results);
  await page.waitForSelector("[data-ik-sentence-note='true']", { timeout: 5_000 });
  await page.waitForTimeout(500);

  const noteCount = await page.locator("[data-ik-sentence-note='true']").count();
  if (noteCount < 1 || noteCount > 2) {
    throw new Error(
      `Expected sparse simulated sentence notes, found ${noteCount}.`
    );
  }

  await captureScreenshot(page, "sentence-notes-simulated");
  await exercisePopover(page, {
    label: "sentence-note-popover",
    selector: "[data-ik-sentence-note='true']",
    expectedKind: "sentence"
  });
}

async function verifyPauseResume(page, serviceWorker, baseUrl) {
  const fixture = normalFixtures[1];

  await setSiteEnabled(serviceWorker, false);
  await page.goto(`${baseUrl}${fixture.route}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1_500);
  const pausedTokenCount = await page.locator("[data-ik-token-id]").count();
  if (pausedTokenCount !== 0) {
    throw new Error(`Paused site still rendered ${pausedTokenCount} inline tokens.`);
  }
  await captureScreenshot(page, "site-paused");

  await setSiteEnabled(serviceWorker, true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-ik-token-id]", { timeout: 12_000 });
  await page.waitForTimeout(2_000);
  const resumedTokenCount = await page.locator("[data-ik-token-id]").count();
  if (resumedTokenCount < 1) {
    throw new Error("Resumed site did not render inline learning UI.");
  }
  await captureScreenshot(page, "site-resumed");
}

async function exercisePopover(page, input) {
  const locator = page.locator(input.selector).first();
  const count = await page.locator(input.selector).count();
  if (count < 1) {
    throw new Error(`No ${input.expectedKind} target found for ${input.label}.`);
  }

  await locator.scrollIntoViewIfNeeded();
  await locator.click({ force: true });
  await page.waitForSelector("[data-ik-popover='true']", { timeout: 5_000 });
  await page.waitForTimeout(250);

  const popover = page.locator("[data-ik-popover='true']").first();
  const isVisible = await popover.isVisible();
  if (!isVisible) {
    throw new Error(`Popover for ${input.label} was not visible.`);
  }

  const geometry = await popover.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    };
  });
  assertPopoverInsideViewport(input.label, geometry);

  const text = await popover.evaluate((node) => {
    const lightDomText = (node.textContent ?? "").trim();
    if (lightDomText) {
      return lightDomText;
    }

    const root = node.shadowRoot;
    if (!root) {
      return "";
    }

    const textParts = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(textNode) {
        const parent =
          textNode.parentElement ??
          (textNode.parentNode instanceof Element ? textNode.parentNode : null);
        return parent?.closest("style, script")
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      }
    });
    let current = walker.nextNode();
    while (current) {
      const value = current.textContent?.trim();
      if (value) {
        textParts.push(value);
      }
      current = walker.nextNode();
    }

    return textParts.join(" ");
  });
  assertLearnerFacingPopoverText(input.label, input.expectedKind, text);

  await captureScreenshot(page, `${input.label}-popover`);
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.waitForTimeout(150);
}

async function collectPageSnapshot(page, label) {
  return page.evaluate((fixtureLabel) => {
    const tokenNodes = [
      ...document.querySelectorAll("[data-ik-token-id]")
    ];
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
      "[contenteditable='']",
      "[contenteditable='true']",
      "[contenteditable='plaintext-only']",
      "[role='textbox']"
    ].join(",");
    const articleText =
      document.querySelector("article")?.textContent ?? document.body.textContent ?? "";
    const wordCount = (articleText.match(/\b[A-Za-z][A-Za-z'-]*\b/g) ?? [])
      .length;
    const phraseNodes = tokenNodes.filter(
      (node) => node.getAttribute("data-ik-unit-kind") === "phrase"
    );
    const wordNodes = tokenNodes.filter(
      (node) => node.getAttribute("data-ik-unit-kind") === "word"
    );
    const protectedTokenCount = tokenNodes.filter((node) =>
      node.closest(protectedSelector)
    ).length;
    const blankPhraseTargetCount = phraseNodes.filter(
      (node) => !(node.getAttribute("data-ik-target-token") ?? "").trim()
    ).length;
    const codeText = [
      ...document.querySelectorAll("pre, code")
    ].map((node) => node.textContent ?? "").join("\n");
    const renderedTokens = tokenNodes.map((node) => ({
      sourceToken: node.getAttribute("data-ik-source-token") ?? "",
      targetToken: node.getAttribute("data-ik-target-token") ?? "",
      unitKind: node.getAttribute("data-ik-unit-kind") ?? "",
      text: node.textContent ?? ""
    }));

    return {
      label: fixtureLabel,
      rootBooted: document.documentElement.hasAttribute("data-immersionkit-root"),
      injectedTokens: tokenNodes.length,
      injectedWords: wordNodes.length,
      injectedPhrases: phraseNodes.length,
      inlineDensity: wordCount > 0 ? tokenNodes.length / wordCount : 0,
      wordCount,
      protectedTokenCount,
      blankPhraseTargetCount,
      sentenceNotes: document.querySelectorAll("[data-ik-sentence-note='true']").length,
      renderedTokens,
      textContent: document.body.textContent ?? "",
      codeText
    };
  }, label);
}

function assertNormalFixtureSnapshot(fixture, snapshot) {
  if (!snapshot.rootBooted) {
    throw new Error(`${fixture.label} did not boot the content runtime.`);
  }
  if (snapshot.injectedTokens < fixture.minInjectedTokens) {
    throw new Error(
      `${fixture.label} rendered ${snapshot.injectedTokens} inline tokens; expected at least ${fixture.minInjectedTokens}.`
    );
  }
  if (snapshot.inlineDensity > fixture.maxInlineDensity) {
    throw new Error(
      `${fixture.label} inline density ${snapshot.inlineDensity.toFixed(3)} exceeded ${fixture.maxInlineDensity}.`
    );
  }
  if (snapshot.blankPhraseTargetCount !== 0) {
    throw new Error(`${fixture.label} rendered blank-target phrase tokens.`);
  }
  if (snapshot.sentenceNotes !== 0) {
    throw new Error(
      `${fixture.label} rendered sentence notes while sentence help was off.`
    );
  }
  if (snapshot.protectedTokenCount !== 0) {
    throw new Error(
      `${fixture.label} rendered ${snapshot.protectedTokenCount} tokens inside protected page UI.`
    );
  }

  for (const snippet of fixture.requiredText ?? []) {
    if (!snapshot.textContent.includes(snippet)) {
      throw new Error(`${fixture.label} lost expected safe text: ${snippet}`);
    }
  }
  for (const snippet of fixture.forbiddenText ?? []) {
    if (snapshot.textContent.includes(snippet)) {
      throw new Error(`${fixture.label} rendered wrong-sense text: ${snippet}`);
    }
  }
  for (const forbidden of fixture.forbiddenRenderedTokens ?? []) {
    const rendered = snapshot.renderedTokens.find(
      (token) =>
        normalizeForComparison(token.sourceToken) === forbidden.source &&
        normalizeForComparison(token.targetToken) === forbidden.target
    );
    if (rendered) {
      throw new Error(
        `${fixture.label} rendered wrong-sense token ${forbidden.source} -> ${forbidden.target}.`
      );
    }
  }

  if (fixture.codeBlockNeedle && !snapshot.codeText.includes(fixture.codeBlockNeedle)) {
    throw new Error(`${fixture.label} code block was not present.`);
  }
  for (const snippet of fixture.forbiddenCodeText ?? []) {
    if (snapshot.codeText.includes(snippet)) {
      throw new Error(`${fixture.label} rendered inline learning text in code.`);
    }
  }
}

function normalizeForComparison(value) {
  return String(value).trim().toLowerCase();
}

function assertPopoverInsideViewport(label, geometry) {
  const tolerance = 2;
  if (
    geometry.width <= 0 ||
    geometry.height <= 0 ||
    geometry.left < -tolerance ||
    geometry.top < -tolerance ||
    geometry.right > geometry.viewportWidth + tolerance ||
    geometry.bottom > geometry.viewportHeight + tolerance
  ) {
    throw new Error(
      `${label} popover escaped viewport: ${JSON.stringify(geometry)}`
    );
  }
}

function assertLearnerFacingPopoverText(label, expectedKind, text) {
  if (!text.trim()) {
    throw new Error(`${label} popover was empty.`);
  }

  const diagnosticPattern =
    /confidence|source kind|scheduler|learning queue|review due|data-ik|diagnostic/i;
  if (diagnosticPattern.test(text)) {
    throw new Error(`${label} popover exposed diagnostic copy: ${text}`);
  }

  if (expectedKind === "phrase" && /hide phrase|phrase memory/i.test(text)) {
    throw new Error(`${label} phrase popover exposed phrase-management copy.`);
  }

  if (
    expectedKind === "sentence" &&
    (!text.includes("Translation") ||
      !text.includes("Original") ||
      !text.includes("Details"))
  ) {
    throw new Error(
      `${label} sentence popover did not expose Translation, Original, and Details controls.`
    );
  }
}

async function captureScreenshot(page, name) {
  const path = join(outputDir, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  screenshots.push(path);
  return path;
}

async function sendSentenceTranslationResults(serviceWorker, fixtureUrl, results) {
  const sent = await serviceWorker.evaluate(
    async ({ url, payload }) => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find((candidate) => candidate.url === url);
      if (typeof tab?.id !== "number") {
        return false;
      }

      await chrome.tabs.sendMessage(tab.id, {
        type: "sentence/translation-result",
        results: payload
      });
      return true;
    },
    {
      url: fixtureUrl,
      payload: results
    }
  );

  if (!sent) {
    throw new Error("Could not deliver simulated sentence translation results.");
  }
}

async function setSiteEnabled(serviceWorker, enabled) {
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

async function setPreviewSettings(serviceWorker, input) {
  await writeUserData(serviceWorker, "settings", {
    enabled: true,
    discoveryRate: input.discoveryRate,
    targetLanguage: "es",
    sourceLanguage: "en",
    sentenceTranslationEnabled: false,
    provider: "none",
    proficiencySeed: input.proficiencySeed ?? "false-beginner"
  });
}

async function collectInteractionDiagnostics(page) {
  return page.evaluate(() => ({
    url: location.href,
    tokenCount: document.querySelectorAll("[data-ik-token-id]").length,
    wordCount: document.querySelectorAll("[data-ik-unit-kind='word']").length,
    phraseCount: document.querySelectorAll("[data-ik-unit-kind='phrase']").length,
    sentenceCandidateCount: document.querySelectorAll("[data-ik-sentence-hash]").length,
    phraseHints: [
      ...document.querySelectorAll("[data-ik-phrase-hints]")
    ].map((node) => node.getAttribute("data-ik-phrase-hints") ?? ""),
    phraseRejections: [
      ...document.querySelectorAll("[data-ik-phrase-rejection-details]")
    ].map((node) => node.getAttribute("data-ik-phrase-rejection-details") ?? ""),
    firstTokens: [...document.querySelectorAll("[data-ik-token-id]")]
      .slice(0, 12)
      .map((node) => ({
        text: node.textContent ?? "",
        source: node.getAttribute("data-ik-source-token") ?? "",
        target: node.getAttribute("data-ik-target-token") ?? "",
        kind: node.getAttribute("data-ik-unit-kind") ?? ""
      }))
  }));
}

async function writeUserData(serviceWorker, key, value) {
  await serviceWorker.evaluate(
    async ({ userDataKey, userDataValue }) => {
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
            rejectDone(
              transaction.error ?? new Error("IndexedDB transaction aborted.")
            );
          transaction.onerror = () =>
            rejectDone(
              transaction.error ?? new Error("IndexedDB transaction failed.")
            );
        });
      }

      function ensureExtensionStores(database, transaction) {
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
        const renderUnits = ensureStore(
          database,
          transaction,
          "asset-pack-render-units",
          {
            keyPath: "identity"
          }
        );
        ensureIndex(renderUnits, "packIdentity", "packIdentity");
        ensureIndex(renderUnits, "bandId", "bandId");
        ensureIndex(renderUnits, "languagePairBandId", [
          "languagePair",
          "bandId"
        ]);
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
    {
      userDataKey: key,
      userDataValue: value
    }
  );
}

function assertAllChecksCompleted(input) {
  const missing = Object.entries(input)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`Public-preview checks did not complete: ${missing.join(", ")}`);
  }
}
