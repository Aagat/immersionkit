import { RuntimeMessageType, hashSentence } from "@immersionkit/shared";
import { describe, expect, it, vi } from "vitest";

import { installChromeStub } from "./helpers/chrome-stub";
import { withFixtureDom } from "./helpers/fixture-dom";

const HOSTNAME = "fixtures.immersionkit.test";
const FIXTURE_URL = `https://${HOSTNAME}/story`;

const BASE_SETTINGS = {
  discoveryRate: 1,
  sentenceTranslationEnabled: false,
  provider: "none"
} as const;

const SEED_LEXICON = [
  {
    lemmaId: "lemma-city",
    sourceLemma: "city",
    targetLemma: "ciudad",
    pos: "noun",
    frequencyRank: 12,
    confidence: 0.98
  },
  {
    lemmaId: "lemma-important",
    sourceLemma: "important",
    targetLemma: "importante",
    pos: "adjective",
    frequencyRank: 22,
    confidence: 0.95
  }
] as const;

describe("content inline learning loop", () => {
  it("restarts processing when a disabled site is re-enabled", async () => {
    await withFixtureDom(
      "article-basic.html",
      { url: FIXTURE_URL },
      async ({ document, wait }) => {
        document.body.innerHTML = "<p>The city is important for every visitor.</p>";

        const chromeStub = installChromeStub({
          "immersionkit.settings": BASE_SETTINGS,
          "immersionkit.seedLexicon": SEED_LEXICON,
          "immersionkit.siteSettings": {
            [HOSTNAME]: {
              hostname: HOSTNAME,
              enabled: false,
              discoveryRate: 1,
              updatedAt: "2026-04-18T10:00:00.000Z"
            }
          }
        });

        try {
          await bootContentScript();
          await wait(30);
          expect(getInjectedTokens(document).length).toBe(0);

          chromeStub.setStorageValues({
            "immersionkit.siteSettings": {
              [HOSTNAME]: {
                hostname: HOSTNAME,
                enabled: true,
                discoveryRate: 1,
                updatedAt: "2026-04-18T10:05:00.000Z"
              }
            }
          });

          await chromeStub.dispatchRuntimeMessage({
            type: RuntimeMessageType.RefreshActiveTab
          });
          await wait(30);

          expect(getInjectedTokens(document).length).toBeGreaterThan(0);
        } finally {
          chromeStub.restore();
        }
      }
    );
  });

  it("opens an inline popover when a token is clicked", async () => {
    await withFixtureDom(
      "article-basic.html",
      { url: FIXTURE_URL },
      async ({ document, window, wait }) => {
        document.body.innerHTML = "<p>The city is important for every visitor.</p>";

        const chromeStub = installChromeStub({
          "immersionkit.settings": BASE_SETTINGS,
          "immersionkit.seedLexicon": SEED_LEXICON,
          "immersionkit.siteSettings": {
            [HOSTNAME]: {
              hostname: HOSTNAME,
              enabled: true,
              discoveryRate: 1,
              updatedAt: "2026-04-18T10:10:00.000Z"
            }
          }
        });

        try {
          await bootContentScript();
          await wait(30);

          const token = document.querySelector<HTMLElement>(
            "[data-ik-lemma-id='lemma-city']"
          );
          expect(token).toBeTruthy();

          token?.dispatchEvent(
            new window.MouseEvent("click", {
              bubbles: true,
              cancelable: true
            })
          );
          await wait(20);

          const popover = document.querySelector<HTMLElement>("[data-ik-popover='true']");
          expect(popover).toBeTruthy();
          expect(popover?.textContent).toContain("city");
          expect(popover?.textContent).toContain("ciudad");
          expect(popover?.textContent).toContain("Lemma: city");
        } finally {
          chromeStub.restore();
        }
      }
    );
  });

  it("persists vocab actions and rerenders tokens immediately", async () => {
    await withFixtureDom(
      "article-basic.html",
      { url: FIXTURE_URL },
      async ({ document, window, wait }) => {
        document.body.innerHTML = "<p>The city is important for every visitor.</p>";

        const chromeStub = installChromeStub({
          "immersionkit.settings": BASE_SETTINGS,
          "immersionkit.seedLexicon": SEED_LEXICON,
          "immersionkit.siteSettings": {
            [HOSTNAME]: {
              hostname: HOSTNAME,
              enabled: true,
              discoveryRate: 1,
              updatedAt: "2026-04-18T10:12:00.000Z"
            }
          }
        });

        try {
          await bootContentScript();
          await wait(30);

          const token = document.querySelector<HTMLElement>(
            "[data-ik-lemma-id='lemma-city']"
          );
          expect(token).toBeTruthy();

          token?.dispatchEvent(
            new window.MouseEvent("click", {
              bubbles: true,
              cancelable: true
            })
          );
          await wait(20);

          const ignoredButton = document.querySelector<HTMLButtonElement>(
            "[data-ik-status-action='ignored']"
          );
          expect(ignoredButton).toBeTruthy();

          ignoredButton?.dispatchEvent(
            new window.MouseEvent("click", {
              bubbles: true,
              cancelable: true
            })
          );
          await wait(30);

          expect(token?.getAttribute("data-ik-status")).toBe("ignored");
          expect(token?.classList.contains("ik-word--ignored")).toBe(true);
          expect(token?.textContent).toBe("city");
          expect(document.querySelector("[data-ik-popover='true']")).toBeNull();

          const storageSnapshot = chromeStub.getStorageSnapshot();
          const vocabEntries = storageSnapshot["immersionkit.vocab"] as Record<
            string,
            {
              status: string;
              exposureCount: number;
            }
          >;

          expect(vocabEntries["lemma-city"].status).toBe("ignored");
          expect(vocabEntries["lemma-city"].exposureCount).toBe(1);
        } finally {
          chromeStub.restore();
        }
      }
    );
  });

  it("removes sentence notes when processing is disabled on refresh", async () => {
    await withFixtureDom(
      "article-basic.html",
      { url: FIXTURE_URL },
      async ({ document, wait }) => {
        document.body.innerHTML = "<p>The city is important for every visitor.</p>";

        const chromeStub = installChromeStub({
          "immersionkit.settings": {
            discoveryRate: 1,
            sentenceTranslationEnabled: true,
            provider: "openai"
          },
          "immersionkit.seedLexicon": SEED_LEXICON,
          "immersionkit.siteSettings": {
            [HOSTNAME]: {
              hostname: HOSTNAME,
              enabled: true,
              discoveryRate: 1,
              updatedAt: "2026-04-18T10:14:00.000Z"
            }
          }
        });

        try {
          await bootContentScript();
          await wait(30);

          const token = document.querySelector<HTMLElement>("[data-ik-token-id]");
          expect(token).toBeTruthy();

          await chromeStub.dispatchRuntimeMessage({
            type: RuntimeMessageType.SentenceTranslationResult,
            results: [
              {
                sentenceHash: token?.getAttribute("data-ik-sentence-hash"),
                sourceText: "The city is important for every visitor.",
                translatedText: "La ciudad es importante para cada visitante.",
                grammarNote: "Present tense for a general statement."
              }
            ]
          });
          await wait(20);

          expect(document.querySelector("[data-ik-sentence-note='true']")).toBeTruthy();

          chromeStub.setStorageValues({
            "immersionkit.siteSettings": {
              [HOSTNAME]: {
                hostname: HOSTNAME,
                enabled: false,
                discoveryRate: 1,
                updatedAt: "2026-04-18T10:15:00.000Z"
              }
            }
          });

          await chromeStub.dispatchRuntimeMessage({
            type: RuntimeMessageType.RefreshActiveTab
          });
          await wait(30);

          expect(document.querySelector("[data-ik-sentence-note='true']")).toBeNull();
          expect(getInjectedTokens(document).length).toBe(0);
        } finally {
          chromeStub.restore();
        }
      }
    );
  });

  it("renders sentence notes for canonical sentence hashes from background delivery", async () => {
    await withFixtureDom(
      "article-basic.html",
      { url: FIXTURE_URL },
      async ({ document, wait }) => {
        const sourceSentence = "The city is important for every visitor.";
        document.body.innerHTML = `<p>${sourceSentence}</p>`;

        const chromeStub = installChromeStub({
          "immersionkit.settings": {
            discoveryRate: 1,
            sentenceTranslationEnabled: true,
            provider: "openai"
          },
          "immersionkit.seedLexicon": SEED_LEXICON,
          "immersionkit.siteSettings": {
            [HOSTNAME]: {
              hostname: HOSTNAME,
              enabled: true,
              discoveryRate: 1,
              updatedAt: "2026-04-18T10:17:00.000Z"
            }
          }
        });

        try {
          await bootContentScript();
          await wait(30);

          await chromeStub.dispatchRuntimeMessage({
            type: RuntimeMessageType.SentenceTranslationResult,
            results: [
              {
                sentenceHash: hashSentence(sourceSentence),
                sourceText: sourceSentence,
                translatedText: "La ciudad es importante para cada visitante.",
                grammarNote: "Present tense for a general statement."
              }
            ]
          });
          await wait(20);

          const renderedNote = document.querySelector(
            `[data-ik-sentence-note='true'][data-ik-sentence-hash='${hashSentence(
              sourceSentence
            )}']`
          );
          expect(renderedNote).toBeTruthy();
        } finally {
          chromeStub.restore();
        }
      }
    );
  });
});

function getInjectedTokens(document: Document): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-ik-token-id]"));
}

async function bootContentScript() {
  vi.resetModules();
  await import("../src/content/index");
}
