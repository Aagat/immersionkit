import {
  CONTENT_EVIDENCE_POLICY,
  RuntimeMessageType,
  type SentenceLearningNote,
  hashSentence
} from "@immersionkit/shared";
import { describe, expect, it, vi } from "vitest";

import { installChromeStub } from "./helpers/chrome-stub";
import { withFixtureDom } from "./helpers/fixture-dom";
import { CONTENT_ASSIST_EVENT_MESSAGE_TYPE } from "../src/content/evidence";
import { PAGE_DIAGNOSTICS_MESSAGE_TYPE } from "../src/diagnostics/page-diagnostics";

const HOSTNAME = "fixtures.immersionkit.test";
const FIXTURE_URL = `https://${HOSTNAME}/story`;

const BASE_SETTINGS = {
  discoveryRate: 1,
  sentenceTranslationEnabled: false,
  provider: "none"
} as const;

const SEED_LEXICON = [
  {
    lexemeId: "lexeme-city",
    sourceLemma: "city",
    targetLemma: "ciudad",
    pos: "noun",
    frequencyRank: 12,
    confidence: 0.98,
    exampleSentenceEnglish: "The city welcomes visitors every spring.",
    exampleSentenceNative: "La ciudad recibe a los visitantes cada primavera."
  },
  {
    lexemeId: "lexeme-important",
    sourceLemma: "important",
    targetLemma: "importante",
    pos: "adjective",
    frequencyRank: 22,
    confidence: 0.95
  }
] as const;

type TestSeedEntry = {
  lexemeId: string;
  sourceLemma: string;
  targetLemma: string;
  pos: "noun" | "adjective" | "adverb";
  frequencyRank: number | null;
  confidence: number;
  exampleSentenceEnglish?: string;
  exampleSentenceNative?: string;
  inflections?: readonly string[];
};

function renderUnitAsset(entries: readonly TestSeedEntry[]) {
  return {
    schemaVersion: "1.0.0",
    assetVersion: "test-render-units",
    languagePair: "en-es",
    entries: entries.map((entry) => ({
      renderUnitId: `ru:${entry.lexemeId}`,
      lexemeIds: [entry.lexemeId],
      kind: "single-token",
      renderPolicy: "inline",
      sourceText: entry.sourceLemma,
      normalizedSourceText: entry.sourceLemma,
      targetText: entry.targetLemma,
      normalizedTargetText: entry.targetLemma,
      sourcePattern: {
        matchMode: "exact",
        tokens: [
          {
            normal: entry.sourceLemma,
            lemma: entry.sourceLemma,
            pos: entry.pos
          }
        ]
      },
      replacement: {
        startToken: 0,
        endToken: 1,
        targetText: entry.targetLemma
      },
      pos: entry.pos,
      minBand: "level-1a",
      frequencyRank: entry.frequencyRank,
      confidence: entry.confidence,
      provenance: { source: "manual" },
      exampleSentenceEnglish: entry.exampleSentenceEnglish,
      exampleSentenceNative: entry.exampleSentenceNative,
      inflections: entry.inflections
    }))
  };
}

describe("content inline learning loop", () => {
  it("restarts processing when a disabled site is re-enabled", async () => {
    await withFixtureDom(
      "article-basic.html",
      { url: FIXTURE_URL },
      async ({ document, wait }) => {
        document.body.innerHTML = "<p>The city is important for every visitor.</p>";

        const chromeStub = installChromeStub({
          "settings": BASE_SETTINGS,
          "asset-render-units": renderUnitAsset(SEED_LEXICON),
          "site-settings": {
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
            "site-settings": {
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
          "settings": BASE_SETTINGS,
          "asset-render-units": renderUnitAsset(SEED_LEXICON),
          "site-settings": {
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
            "[data-ik-lexeme-id='lexeme-city']"
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
          const textMirror = popover?.querySelector<HTMLElement>(
            "[slot='ik-popover-text-mirror']"
          );
          expect(textMirror?.hidden).toBe(true);
          expect(textMirror?.getAttribute("aria-hidden")).toBe("true");
          expect(popover?.textContent).toContain("city");
          expect(popover?.textContent).toContain("ciudad");
          expect(popover?.textContent).toContain(
            "La ciudad recibe a los visitantes cada primavera."
          );
          expect(popover?.textContent).toContain(
            "The city welcomes visitors every spring."
          );
          expect(popover?.textContent).not.toContain(
            "The city is important for every visitor."
          );
          expect(popover?.getAttribute("data-immersionkit-ignore")).toBe("true");

          window.dispatchEvent(new window.Event("scroll"));
          await wait(20);
          expect(document.querySelector("[data-ik-popover='true']")).toBe(popover);

          await wait(220);
          expect(
            popover?.querySelector("[data-ik-token-id], [data-ik-sentence-note='true']")
          ).toBeNull();
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
          "settings": BASE_SETTINGS,
          "asset-render-units": renderUnitAsset(SEED_LEXICON),
          "site-settings": {
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
            "[data-ik-lexeme-id='lexeme-city']"
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
          expect(token?.getAttribute("data-status")).toBe("muted");
          expect(token?.textContent).toBe("city");
          expect(document.querySelector("[data-ik-popover='true']")).toBeNull();

          const storageSnapshot = chromeStub.getStorageSnapshot();
          const vocabEntries = storageSnapshot["user-vocab"] as Record<
            string,
            {
              status: string;
              exposureCount: number;
            }
          >;

          expect(vocabEntries["lexeme-city"].status).toBe("ignored");
          expect(vocabEntries["lexeme-city"].exposureCount).toBe(1);
        } finally {
          chromeStub.restore();
        }
      }
    );
  });

  it("falls back to the page sentence when the render entry has no example sentence", async () => {
    await withFixtureDom(
      "article-basic.html",
      { url: FIXTURE_URL },
      async ({ document, window, wait }) => {
        document.body.innerHTML = "<p>The city is important for every visitor.</p>";

        const chromeStub = installChromeStub({
          "settings": BASE_SETTINGS,
          "asset-render-units": renderUnitAsset(SEED_LEXICON),
          "site-settings": {
            [HOSTNAME]: {
              hostname: HOSTNAME,
              enabled: true,
              discoveryRate: 1,
              updatedAt: "2026-04-18T10:11:00.000Z"
            }
          }
        });

        try {
          await bootContentScript();
          await wait(30);

          const token = document.querySelector<HTMLElement>(
            "[data-ik-lexeme-id='lexeme-important']"
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
          expect(popover?.textContent).toContain("important");
          expect(popover?.textContent).toContain("importante");
          expect(popover?.textContent).toContain(
            "The city is important for every visitor."
          );
        } finally {
          chromeStub.restore();
        }
      }
    );
  });

  it("queues compact phrase-hint sentence candidates without word injection", async () => {
    await withFixtureDom(
      "article-basic.html",
      { url: FIXTURE_URL },
      async ({ document, wait }) => {
        const sourceSentence =
          "As soon as we arrive at the station, we take care of tools before lunch.";
        document.body.innerHTML = `<p>${sourceSentence}</p>`;

        const chromeStub = installChromeStub({
          "settings": BASE_SETTINGS,
          "asset-render-units": renderUnitAsset(SEED_LEXICON),
          "site-settings": {
            [HOSTNAME]: {
              hostname: HOSTNAME,
              enabled: true,
              discoveryRate: 1,
              updatedAt: "2026-04-18T10:13:00.000Z"
            }
          }
        });

        try {
          await bootContentScript();
          await wait(30);

          expect(getInjectedTokens(document)).toHaveLength(0);

          const queueMessage = chromeStub.sentMessages.find(
            (message): message is {
              type: RuntimeMessageType.QueueSentenceCandidates;
              candidates: Array<{
                sourceText: string;
                sentenceHash: string;
                reason: string;
                phraseHints: string[];
              }>;
            } =>
              Boolean(message) &&
              typeof message === "object" &&
              (message as { type?: unknown }).type ===
                RuntimeMessageType.QueueSentenceCandidates
          );

          expect(queueMessage?.candidates[0]).toMatchObject({
            sourceText: sourceSentence,
            sentenceHash: hashSentence(sourceSentence),
            reason: "fixed-phrase-hint",
            phraseHints: ["as soon as", "take care of"]
          });
          expect(
            document.querySelector("[data-ik-render-layer='word phrase-candidate']")
          ).toBeNull();
          expect(document.body.textContent).toContain(sourceSentence);
        } finally {
          chromeStub.restore();
        }
      }
    );
  });

  it("splits oversized text nodes into processable windows", async () => {
    await withFixtureDom(
      "article-basic.html",
      { url: FIXTURE_URL },
      async ({ document, wait }) => {
        const lead = Array.from({ length: 18 }, () =>
          "Public context keeps this article node long enough to cross the old cap."
        ).join(" ");
        const sourceSentence =
          "The city team publishes short updates so new volunteers can plan a simple route.";
        document.body.innerHTML = `<p>${lead} ${sourceSentence}</p>`;

        const chromeStub = installChromeStub({
          "settings": BASE_SETTINGS,
          "asset-render-units": renderUnitAsset(SEED_LEXICON),
          "site-settings": {
            [HOSTNAME]: {
              hostname: HOSTNAME,
              enabled: true,
              discoveryRate: 1,
              updatedAt: "2026-04-18T10:13:30.000Z"
            }
          }
        });

        try {
          await bootContentScript();
          await wait(30);

          const token = document.querySelector<HTMLElement>(
            "[data-ik-lexeme-id='lexeme-city']"
          );
          expect(token).toBeTruthy();
          expect(token?.getAttribute("data-ik-sentence-hash")).toBe(
            hashSentence(sourceSentence)
          );
        } finally {
          chromeStub.restore();
        }
      }
    );
  });

  it("captures assist evidence when a word interaction opens help", async () => {
    await withFixtureDom(
      "article-basic.html",
      { url: FIXTURE_URL },
      async ({ document, window, wait }) => {
        document.body.innerHTML = "<p>The city is important for every visitor.</p>";

        const chromeStub = installChromeStub({
          "settings": BASE_SETTINGS,
          "asset-render-units": renderUnitAsset(SEED_LEXICON),
          "site-settings": {
            [HOSTNAME]: {
              hostname: HOSTNAME,
              enabled: true,
              discoveryRate: 1,
              updatedAt: "2026-04-18T10:13:45.000Z"
            }
          }
        });

        try {
          await bootContentScript();
          await wait(30);

          const token = document.querySelector<HTMLElement>(
            "[data-ik-lexeme-id='lexeme-city']"
          );
          expect(token).toBeTruthy();

          token?.dispatchEvent(
            new window.MouseEvent("click", {
              bubbles: true,
              cancelable: true
            })
          );
          await wait(20);

          const assistMessage = chromeStub.sentMessages.find(
            (message): message is {
              type: string;
              itemId: string;
              assistType: string;
              contextSentenceHash: string;
            } =>
              Boolean(message) &&
              typeof message === "object" &&
              (message as { type?: unknown }).type === CONTENT_ASSIST_EVENT_MESSAGE_TYPE
          );

          expect(assistMessage).toMatchObject({
            itemId: "word:lexeme-city",
            assistType: "manual-lookup",
            contextSentenceHash: hashSentence(
              "The city is important for every visitor."
            )
          });
        } finally {
          chromeStub.restore();
        }
      }
    );
  });

  it("opens phrase help and records phrase assist evidence only on interaction", async () => {
    await withFixtureDom(
      "article-basic.html",
      { url: FIXTURE_URL },
      async ({ document, window, wait }) => {
        const sourceSentence = "I used to visit the city.";
        const sentenceHash = hashSentence(sourceSentence);
        const phraseId = "pattern:used-to-visit";
        document.body.innerHTML = `<p>${sourceSentence}</p>`;

        const chromeStub = installChromeStub({
          "settings": BASE_SETTINGS,
          "asset-render-units": renderUnitAsset(SEED_LEXICON),
          "site-settings": {
            [HOSTNAME]: {
              hostname: HOSTNAME,
              enabled: true,
              discoveryRate: 1,
              updatedAt: "2026-04-18T10:14:15.000Z"
            }
          },
          "learning-items": [
            {
              itemId: `phrase:${phraseId}`,
              unitRefId: phraseId,
              unitType: "phrase",
              sourceText: "used to visit",
              targetText: "solia visitar",
              status: "learning",
              introducedAt: "2026-04-18T10:00:00.000Z",
              nextReviewAt: "2026-04-19T10:00:00.000Z",
              interval: 600000,
              ease: 2.3,
              lapses: 0,
              assistCount: 0,
              qualifiedExposureCount: 0,
              consecutiveUnassistedCount: 0,
              distinctContextCount: 0,
              suspended: false
            }
          ],
          "sentence-analysis-cache": [
            {
              sentenceHash,
              analyzerVersion: "fixture-v1",
              analyzerId: "fixture-annotated",
              sourceText: sourceSentence,
              tokens: [{ text: "I", normalized: "i", tags: [], startOffset: 0, endOffset: 1 }],
              chunks: [],
              grammarFeatures: [],
              phraseMatches: [
                {
                  occurrenceId: "occurrence-used-to-visit",
                  phraseId,
                  sentenceHash,
                  analyzerVersion: "fixture-v1",
                  sourceText: "used to visit",
                  normalizedSourceText: "used to visit",
                  sourceKind: "pattern-match",
                  category: "grammar-carrier",
                  ruleId: "used-to-verb",
                  span: {
                    startToken: 1,
                    endToken: 4,
                    startChar: 2,
                    endChar: 15
                  },
                  confidence: 0.91
                }
              ],
              contextualWordCandidates: [],
              createdAt: "2026-04-18T10:00:00.000Z",
              lastAccessedAt: "2026-04-18T10:00:00.000Z"
            }
          ]
        });
        chromeStub.setSendMessageHandler((message) => {
          if (
            message &&
            typeof message === "object" &&
            "type" in message &&
            message.type === RuntimeMessageType.GetLearningItems
          ) {
            return {
              ok: true,
              items: [
                {
                  itemId: `phrase:${phraseId}`,
                  unitRefId: phraseId,
                  unitType: "phrase",
                  sourceText: "used to visit",
                  targetText: "solia visitar",
                  status: "learning",
                  introducedAt: "2026-04-18T10:00:00.000Z",
                  nextReviewAt: "2026-04-19T10:00:00.000Z",
                  interval: 600000,
                  ease: 2.3,
                  lapses: 0,
                  assistCount: 0,
                  qualifiedExposureCount: 0,
                  consecutiveUnassistedCount: 0,
                  distinctContextCount: 0,
                  suspended: false
                }
              ]
            };
          }

          if (
            message &&
            typeof message === "object" &&
            "type" in message &&
            message.type === RuntimeMessageType.GetSentenceAnalysisCache
          ) {
            expect((message as { sentenceHashes?: string[] }).sentenceHashes).toContain(
              sentenceHash
            );
            return {
              ok: true,
              entries: [
                {
                  sentenceHash,
                  analyzerVersion: "fixture-v1",
                  analyzerId: "fixture-annotated",
                  sourceText: sourceSentence,
                  tokens: [{ text: "I", normalized: "i", tags: [], startOffset: 0, endOffset: 1 }],
                  chunks: [],
                  grammarFeatures: [],
                  phraseMatches: [
                    {
                      occurrenceId: "occurrence-used-to-visit",
                      phraseId,
                      sentenceHash,
                      analyzerVersion: "fixture-v1",
                      sourceText: "used to visit",
                      normalizedSourceText: "used to visit",
                      sourceKind: "pattern-match",
                      category: "grammar-carrier",
                      ruleId: "used-to-verb",
                      span: {
                        startToken: 1,
                        endToken: 4,
                        startChar: 2,
                        endChar: 15
                      },
                      confidence: 0.91
                    }
                  ],
                  contextualWordCandidates: [],
                  createdAt: "2026-04-18T10:00:00.000Z",
                  lastAccessedAt: "2026-04-18T10:00:00.000Z"
                }
              ]
            };
          }

          return undefined;
        });

        try {
          await bootContentScript();
          await wait(30);

          expect(
            chromeStub.sentMessages.find(
              (message) =>
                Boolean(message) &&
                typeof message === "object" &&
                (message as { type?: unknown }).type === CONTENT_ASSIST_EVENT_MESSAGE_TYPE
            )
          ).toBeUndefined();

          const phrase = document.querySelector<HTMLElement>(
            `[data-ik-phrase-id='${phraseId}']`
          );
          expect(phrase).toBeTruthy();

          phrase?.dispatchEvent(
            new window.MouseEvent("click", {
              bubbles: true,
              cancelable: true
            })
          );
          await wait(20);

          const popover = document.querySelector<HTMLElement>("[data-ik-popover='true']");
          expect(popover?.textContent).toContain("used to visit");
          expect(popover?.textContent).toContain("solia visitar");
          expect(popover?.textContent).toContain(
            "This phrase is due for review and still fits the current page."
          );
          expect(popover?.textContent).not.toContain("grammar carrier");
          expect(popover?.textContent).not.toContain("review due");
          expect(popover?.textContent).not.toContain("confidence");
          expect(popover?.textContent).toContain(sourceSentence);
          expect(popover?.querySelector("[data-ik-status-action]")).toBeNull();

          const assistMessage = chromeStub.sentMessages.find(
            (message): message is {
              type: string;
              itemId: string;
              assistType: string;
              contextSentenceHash: string;
              phraseId: string;
            } =>
              Boolean(message) &&
              typeof message === "object" &&
              (message as { type?: unknown }).type === CONTENT_ASSIST_EVENT_MESSAGE_TYPE
          );

          expect(assistMessage).toMatchObject({
            itemId: `phrase:${phraseId}`,
            assistType: "phrase-gloss-reveal",
            contextSentenceHash: sentenceHash,
            phraseId
          });
        } finally {
          chromeStub.restore();
        }
      }
    );
  });

  it("keeps ambiguous injected words in English after background analysis rejects them", async () => {
    await withFixtureDom(
      "article-basic.html",
      { url: FIXTURE_URL },
      async ({ document, wait }) => {
        const sourceSentence = "I can watch the city from the hill.";
        document.body.innerHTML = `<p>${sourceSentence}</p>`;
        const sentenceHash = hashSentence(sourceSentence);

        const chromeStub = installChromeStub({
          "settings": BASE_SETTINGS,
          "asset-render-units": renderUnitAsset([
            ...SEED_LEXICON,
            {
              lexemeId: "lexeme-can",
              sourceLemma: "can",
              targetLemma: "lata",
              pos: "noun",
              frequencyRank: 200,
              confidence: 0.95
            }
          ]),
          "site-settings": {
            [HOSTNAME]: {
              hostname: HOSTNAME,
              enabled: true,
              discoveryRate: 1,
              updatedAt: "2026-04-18T10:16:00.000Z"
            }
          }
        });
        chromeStub.setSendMessageHandler((message) => {
          if (
            !message ||
            typeof message !== "object" ||
            (message as { type?: unknown }).type !==
              RuntimeMessageType.QueueSentenceCandidates
          ) {
            return undefined;
          }

          return {
            ok: true,
            analysisResults: [
              {
                cacheHit: false,
                entry: {
                  sentenceHash,
                  analyzerVersion: "fixture-v1",
                  analyzerId: "fixture-annotated",
                  sourceText: sourceSentence,
                  tokens: [],
                  lemmas: [],
                  posTags: [],
                  chunks: [],
                  phraseMatches: [],
                  grammarFeatures: [],
                  createdAt: "2026-04-18T10:16:00.000Z",
                  lastAccessedAt: "2026-04-18T10:16:00.000Z",
                  contextualWordCandidates: [
                    {
                      id: "candidate-can",
                      sentenceHash,
                      sentence: sourceSentence,
                      tokenText: "can",
                      surfaceText: "can",
                      normalizedText: "can",
                      targetLemma: "lata",
                      candidateLemma: "can",
                      lexemeId: "lexeme-can",
                      candidatePos: "noun",
                      observedPos: "modal",
                      chunkType: "other",
                      nearbyContextSignature: ["modal-before-base-verb"],
                      ambiguityGroup: "can_modal_vs_noun",
                      confidence: 0.41,
                      decision: "skip",
                      rationale: "Modal use should not inject the noun sense."
                    }
                  ]
                }
              }
            ],
            cachedResults: []
          };
        });

        try {
          await bootContentScript();
          await wait(60);

          const canToken = document.querySelector<HTMLElement>(
            "[data-ik-lexeme-id='lexeme-can']"
          );
          expect(canToken).toBeNull();
          expect(document.body.textContent).toContain("I can watch");
          expect(document.body.textContent).not.toContain("lata");
        } finally {
          chromeStub.restore();
        }
      }
    );
  });

  it("renders phrase units from fresh background analysis without a page reload", async () => {
    await withFixtureDom(
      "article-basic.html",
      { url: FIXTURE_URL },
      async ({ document, wait }) => {
        const sourceSentence = "I used to visit the old city often.";
        const sentenceHash = hashSentence(sourceSentence);
        const phraseId = "phrase:pattern:used-to-visit";
        document.body.innerHTML = `<p>${sourceSentence}</p>`;

        const chromeStub = installChromeStub({
          "settings": BASE_SETTINGS,
          "asset-render-units": renderUnitAsset(SEED_LEXICON),
          "site-settings": {
            [HOSTNAME]: {
              hostname: HOSTNAME,
              enabled: true,
              discoveryRate: 1,
              updatedAt: "2026-04-18T10:14:00.000Z"
            }
          }
        });
        chromeStub.setSendMessageHandler((message) => {
          if (
            message &&
            typeof message === "object" &&
            "type" in message &&
            message.type === RuntimeMessageType.GetLearningItems
          ) {
            return {
              ok: true,
              items: [
                {
                  itemId: `phrase:${phraseId}`,
                  unitRefId: phraseId,
                  unitType: "phrase",
                  sourceText: "used to visit",
                  targetText: "solia visitar",
                  status: "learning",
                  introducedAt: "2026-04-18T10:00:00.000Z",
                  nextReviewAt: "2026-04-19T10:00:00.000Z",
                  interval: 600000,
                  ease: 2.3,
                  lapses: 0,
                  assistCount: 0,
                  qualifiedExposureCount: 0,
                  consecutiveUnassistedCount: 0,
                  distinctContextCount: 0,
                  suspended: false
                }
              ]
            };
          }

          if (
            message &&
            typeof message === "object" &&
            "type" in message &&
            message.type === RuntimeMessageType.GetSentenceAnalysisCache
          ) {
            return {
              ok: true,
              entries: []
            };
          }

          if (
            message &&
            typeof message === "object" &&
            "type" in message &&
            message.type === RuntimeMessageType.QueueSentenceCandidates
          ) {
            return {
              ok: true,
              analysisResults: [
                {
                  cacheHit: false,
                  entry: {
                    sentenceHash,
                    analyzerVersion: "fixture-v1",
                    analyzerId: "fixture-annotated",
                    sourceText: sourceSentence,
                    tokens: [],
                    lemmas: [],
                    posTags: [],
                    chunks: [],
                    grammarFeatures: [],
                    createdAt: "2026-04-18T10:14:00.000Z",
                    lastAccessedAt: "2026-04-18T10:14:00.000Z",
                    contextualWordCandidates: [],
                    phraseMatches: [
                      {
                        occurrenceId: "occurrence-used-to-visit",
                        phraseId,
                        sentenceHash,
                        analyzerVersion: "fixture-v1",
                        sourceText: "used to visit",
                        normalizedSourceText: "used to visit",
                        sourceKind: "pattern-match",
                        category: "grammar-carrier",
                        ruleId: "used-to-verb",
                        span: {
                          startToken: 1,
                          endToken: 4,
                          startChar: 2,
                          endChar: 15
                        },
                        confidence: 0.91
                      }
                    ]
                  }
                }
              ],
              cachedResults: []
            };
          }

          return undefined;
        });

        try {
          await bootContentScript();
          await wait(120);

          const phrase = document.querySelector<HTMLElement>(
            `[data-ik-phrase-id='${phraseId}']`
          );
          expect(phrase).toBeTruthy();
          expect(phrase?.textContent).toBe("solia visitar");
          expect(document.querySelector("[data-ik-lexeme-id='lexeme-city']")).toBeTruthy();

          const diagnostics = (
            await chromeStub.dispatchRuntimeMessage({
              type: PAGE_DIAGNOSTICS_MESSAGE_TYPE
            })
          )[0] as {
            freshPhraseAnalysisHits?: number;
            freshPhraseRerenders?: number;
            phraseDecisionSamples?: Array<{ phraseId: string | null; selected: boolean }>;
          };

          expect(diagnostics.freshPhraseAnalysisHits).toBe(1);
          expect(diagnostics.freshPhraseRerenders).toBe(1);
          expect(diagnostics.phraseDecisionSamples).toContainEqual(
            expect.objectContaining({
              phraseId,
              selected: true
            })
          );
        } finally {
          chromeStub.restore();
        }
      }
    );
  });

  it("refreshes newly persisted phrase learning items before fresh phrase rerender", async () => {
    await withFixtureDom(
      "article-basic.html",
      { url: FIXTURE_URL },
      async ({ document, wait }) => {
        const sourceSentence = "I used to visit the old city often.";
        const sentenceHash = hashSentence(sourceSentence);
        const phraseId = "phrase:pattern:used-to-visit";
        const phraseLearningItem = {
          itemId: `phrase:${phraseId}`,
          unitRefId: phraseId,
          unitType: "phrase",
          sourceText: "used to visit",
          targetText: "solia visitar",
          status: "learning",
          introducedAt: "2026-04-18T10:00:00.000Z",
          nextReviewAt: "2026-04-19T10:00:00.000Z",
          interval: 600000,
          ease: 2.3,
          lapses: 0,
          assistCount: 0,
          qualifiedExposureCount: 0,
          consecutiveUnassistedCount: 0,
          distinctContextCount: 0,
          suspended: false
        };
        document.body.innerHTML = `<p>${sourceSentence}</p>`;

        const chromeStub = installChromeStub({
          "settings": BASE_SETTINGS,
          "asset-render-units": renderUnitAsset(SEED_LEXICON),
          "site-settings": {
            [HOSTNAME]: {
              hostname: HOSTNAME,
              enabled: true,
              discoveryRate: 1,
              updatedAt: "2026-04-18T10:14:00.000Z"
            }
          }
        });
        chromeStub.setSendMessageHandler((message) => {
          if (
            message &&
            typeof message === "object" &&
            "type" in message &&
            message.type === RuntimeMessageType.GetLearningItems
          ) {
            if (
              "unitRefIds" in message &&
              Array.isArray(message.unitRefIds) &&
              message.unitRefIds.includes(phraseId)
            ) {
              return {
                ok: true,
                items: [phraseLearningItem]
              };
            }

            return {
              ok: true,
              items: []
            };
          }

          if (
            message &&
            typeof message === "object" &&
            "type" in message &&
            message.type === RuntimeMessageType.GetSentenceAnalysisCache
          ) {
            return {
              ok: true,
              entries: []
            };
          }

          if (
            message &&
            typeof message === "object" &&
            "type" in message &&
            message.type === RuntimeMessageType.QueueSentenceCandidates
          ) {
            return {
              ok: true,
              analysisResults: [
                {
                  cacheHit: false,
                  entry: {
                    sentenceHash,
                    analyzerVersion: "fixture-v1",
                    analyzerId: "fixture-annotated",
                    sourceText: sourceSentence,
                    tokens: [],
                    lemmas: [],
                    posTags: [],
                    chunks: [],
                    grammarFeatures: [],
                    createdAt: "2026-04-18T10:14:00.000Z",
                    lastAccessedAt: "2026-04-18T10:14:00.000Z",
                    contextualWordCandidates: [],
                    phraseMatches: [
                      {
                        occurrenceId: "occurrence-used-to-visit",
                        phraseId,
                        sentenceHash,
                        analyzerVersion: "fixture-v1",
                        sourceText: "used to visit",
                        normalizedSourceText: "used to visit",
                        sourceKind: "pattern-match",
                        category: "grammar-carrier",
                        ruleId: "used-to-verb",
                        span: {
                          startToken: 1,
                          endToken: 4,
                          startChar: 2,
                          endChar: 15
                        },
                        confidence: 0.91
                      }
                    ]
                  }
                }
              ],
              cachedResults: []
            };
          }

          return undefined;
        });

        try {
          await bootContentScript();
          await wait(160);

          expect(
            chromeStub.sentMessages.some(
              (message) =>
                Boolean(message) &&
                typeof message === "object" &&
                "type" in message &&
                message.type === RuntimeMessageType.GetLearningItems &&
                "unitRefIds" in message &&
                Array.isArray(message.unitRefIds) &&
                message.unitRefIds.includes(phraseId)
            )
          ).toBe(true);

          const phrase = document.querySelector<HTMLElement>(
            `[data-ik-phrase-id='${phraseId}']`
          );
          expect(phrase).toBeTruthy();
          expect(phrase?.textContent).toBe("solia visitar");
        } finally {
          chromeStub.restore();
        }
      }
    );
  });

  it("suppresses fresh phrase units with blank targets and reports diagnostics", async () => {
    await withFixtureDom(
      "article-basic.html",
      { url: FIXTURE_URL },
      async ({ document, wait }) => {
        const sourceSentence = "The old city holds quiet memory.";
        const sentenceHash = hashSentence(sourceSentence);
        const phraseId = "phrase:chunk:old-city:empty";
        const phraseLearningItem = {
          itemId: `phrase:${phraseId}`,
          unitRefId: phraseId,
          unitType: "phrase",
          sourceText: "old city",
          targetText: "",
          status: "learning",
          introducedAt: "2026-04-18T10:00:00.000Z",
          nextReviewAt: "2026-04-19T10:00:00.000Z",
          interval: 600000,
          ease: 2.3,
          lapses: 0,
          assistCount: 0,
          qualifiedExposureCount: 0,
          consecutiveUnassistedCount: 0,
          distinctContextCount: 0,
          suspended: false
        };
        document.body.innerHTML = `<p>${sourceSentence}</p>`;

        const chromeStub = installChromeStub({
          "settings": BASE_SETTINGS,
          "asset-render-units": renderUnitAsset(SEED_LEXICON),
          "site-settings": {
            [HOSTNAME]: {
              hostname: HOSTNAME,
              enabled: true,
              discoveryRate: 1,
              updatedAt: "2026-04-18T10:14:00.000Z"
            }
          }
        });
        chromeStub.setSendMessageHandler((message) => {
          if (
            message &&
            typeof message === "object" &&
            "type" in message &&
            message.type === RuntimeMessageType.GetLearningItems
          ) {
            return {
              ok: true,
              items: [phraseLearningItem]
            };
          }

          if (
            message &&
            typeof message === "object" &&
            "type" in message &&
            message.type === RuntimeMessageType.GetSentenceAnalysisCache
          ) {
            return {
              ok: true,
              entries: []
            };
          }

          if (
            message &&
            typeof message === "object" &&
            "type" in message &&
            message.type === RuntimeMessageType.QueueSentenceCandidates
          ) {
            return {
              ok: true,
              analysisResults: [
                {
                  cacheHit: false,
                  entry: {
                    sentenceHash,
                    analyzerVersion: "fixture-v1",
                    analyzerId: "fixture-annotated",
                    sourceText: sourceSentence,
                    tokens: [],
                    lemmas: [],
                    posTags: [],
                    chunks: [],
                    grammarFeatures: [],
                    createdAt: "2026-04-18T10:14:00.000Z",
                    lastAccessedAt: "2026-04-18T10:14:00.000Z",
                    contextualWordCandidates: [],
                    phraseMatches: [
                      {
                        occurrenceId: "occurrence-old-city",
                        phraseId,
                        sentenceHash,
                        analyzerVersion: "fixture-v1",
                        sourceText: "old city",
                        normalizedSourceText: "old city",
                        sourceKind: "chunk",
                        category: "noun-chunk",
                        ruleId: "chunk-noun-coherent-v1",
                        span: {
                          startToken: 1,
                          endToken: 3,
                          startChar: 4,
                          endChar: 12
                        },
                        confidence: 0.88
                      }
                    ]
                  }
                }
              ],
              cachedResults: []
            };
          }

          return undefined;
        });

        try {
          await bootContentScript();
          await wait(160);

          expect(
            document.querySelector(`[data-ik-phrase-id='${phraseId}']`)
          ).toBeNull();
          expect(document.body.textContent).toContain("old ciudad");

          const diagnostics = (
            await chromeStub.dispatchRuntimeMessage({
              type: PAGE_DIAGNOSTICS_MESSAGE_TYPE
            })
          )[0] as {
            rejectedPhrases?: number;
            phraseDecisionSamples?: Array<{
              phraseId: string | null;
              selected: boolean;
              rejectedReason: string | null;
              targetText: string | null;
              exposureEligible: boolean;
            }>;
          };

          expect(diagnostics.rejectedPhrases).toBe(1);
          expect(diagnostics.phraseDecisionSamples).toContainEqual(
            expect.objectContaining({
              phraseId,
              selected: false,
              rejectedReason: "blank-target",
              targetText: null,
              exposureEligible: false
            })
          );
        } finally {
          chromeStub.restore();
        }
      }
    );
  });

  it("keeps diagnostics for phrase rejections when no wrapper is rendered", async () => {
    await withFixtureDom(
      "article-basic.html",
      { url: FIXTURE_URL },
      async ({ document, wait }) => {
        const sourceSentence = "The old city holds quiet memory.";
        const sentenceHash = hashSentence(sourceSentence);
        const phraseId = "phrase:chunk:old-city:empty";
        document.body.innerHTML = `<p>${sourceSentence}</p>`;

        const chromeStub = installChromeStub({
          "settings": {
            ...BASE_SETTINGS,
            discoveryRate: 0
          },
          "asset-render-units": renderUnitAsset(SEED_LEXICON),
          "site-settings": {
            [HOSTNAME]: {
              hostname: HOSTNAME,
              enabled: true,
              discoveryRate: 0,
              updatedAt: "2026-04-18T10:14:00.000Z"
            }
          },
          "sentence-analysis-cache": [
            {
              sentenceHash,
              analyzerVersion: "fixture-v1",
              analyzerId: "fixture-annotated",
              sourceText: sourceSentence,
              tokens: [],
              lemmas: [],
              posTags: [],
              chunks: [],
              grammarFeatures: [],
              createdAt: "2026-04-18T10:14:00.000Z",
              lastAccessedAt: "2026-04-18T10:14:00.000Z",
              contextualWordCandidates: [],
              phraseMatches: [
                {
                  occurrenceId: "occurrence-old-city",
                  phraseId,
                  sentenceHash,
                  analyzerVersion: "fixture-v1",
                  sourceText: "old city",
                  normalizedSourceText: "old city",
                  sourceKind: "chunk",
                  category: "noun-chunk",
                  ruleId: "chunk-noun-coherent-v1",
                  span: {
                    startToken: 1,
                    endToken: 3,
                    startChar: 4,
                    endChar: 12
                  },
                  confidence: 0.88
                }
              ]
            }
          ]
        });
        chromeStub.setSendMessageHandler((message) => {
          if (
            message &&
            typeof message === "object" &&
            "type" in message &&
            message.type === RuntimeMessageType.GetLearningItems
          ) {
            return {
              ok: true,
              items: []
            };
          }

          if (
            message &&
            typeof message === "object" &&
            "type" in message &&
            message.type === RuntimeMessageType.GetSentenceAnalysisCache
          ) {
            return {
              ok: true,
              entries: [
                {
                  sentenceHash,
                  analyzerVersion: "fixture-v1",
                  analyzerId: "fixture-annotated",
                  sourceText: sourceSentence,
                  tokens: [],
                  lemmas: [],
                  posTags: [],
                  chunks: [],
                  grammarFeatures: [],
                  createdAt: "2026-04-18T10:14:00.000Z",
                  lastAccessedAt: "2026-04-18T10:14:00.000Z",
                  contextualWordCandidates: [],
                  phraseMatches: [
                    {
                      occurrenceId: "occurrence-old-city",
                      phraseId,
                      sentenceHash,
                      analyzerVersion: "fixture-v1",
                      sourceText: "old city",
                      normalizedSourceText: "old city",
                      sourceKind: "chunk",
                      category: "noun-chunk",
                      ruleId: "chunk-noun-coherent-v1",
                      span: {
                        startToken: 1,
                        endToken: 3,
                        startChar: 4,
                        endChar: 12
                      },
                      confidence: 0.88
                    }
                  ]
                }
              ]
            };
          }

          return undefined;
        });

        try {
          await bootContentScript();
          await wait(80);

          expect(document.querySelector("[data-ik-phrase-rejection-details]")).toBeNull();

          const diagnostics = (
            await chromeStub.dispatchRuntimeMessage({
              type: PAGE_DIAGNOSTICS_MESSAGE_TYPE
            })
          )[0] as {
            rejectedPhrases?: number;
            phraseDecisionSamples?: Array<{
              phraseId: string | null;
              selected: boolean;
              rejectedReason: string | null;
            }>;
          };

          expect(diagnostics.rejectedPhrases).toBe(1);
          expect(diagnostics.phraseDecisionSamples).toContainEqual(
            expect.objectContaining({
              phraseId,
              selected: false,
              rejectedReason: "missing-active-learning-item"
            })
          );
        } finally {
          chromeStub.restore();
        }
      }
    );
  });

  it("uses cached analysis to skip unsafe ambiguous words before initial injection", async () => {
    await withFixtureDom(
      "article-basic.html",
      { url: FIXTURE_URL },
      async ({ document, wait }) => {
        const sourceSentence = "I can watch the city from the hill.";
        const sentenceHash = hashSentence(sourceSentence);
        document.body.innerHTML = `<p>${sourceSentence}</p>`;

        const chromeStub = installChromeStub({
          "settings": BASE_SETTINGS,
          "asset-render-units": renderUnitAsset([
            ...SEED_LEXICON,
            {
              lexemeId: "lexeme-can",
              sourceLemma: "can",
              targetLemma: "lata",
              pos: "noun",
              frequencyRank: 200,
              confidence: 0.95
            }
          ]),
          "site-settings": {
            [HOSTNAME]: {
              hostname: HOSTNAME,
              enabled: true,
              discoveryRate: 1,
              updatedAt: "2026-04-18T10:15:30.000Z"
            }
          },
          "sentence-analysis-cache": [
            {
              sentenceHash,
              analyzerVersion: "fixture-v1",
              analyzerId: "fixture-annotated",
              sourceText: sourceSentence,
              createdAt: "2026-04-18T10:15:00.000Z",
              lastAccessedAt: "2026-04-18T10:15:00.000Z",
              contextualWordCandidates: [
                {
                  id: "candidate-can",
                  sentenceHash,
                  sentence: sourceSentence,
                  tokenText: "can",
                  normalizedText: "can",
                  targetLemma: "lata",
                  candidateLemma: "can",
                  lexemeId: "lexeme-can",
                  candidatePos: "noun",
                  observedPos: "modal",
                  chunkType: "other",
                  nearbyContextSignature: ["modal-before-base-verb"],
                  ambiguityGroup: "can_modal_vs_noun",
                  confidence: 0.41,
                  decision: "skip",
                  rationale: "Modal use should not inject the noun sense."
                }
              ]
            }
          ]
        });
        chromeStub.setSendMessageHandler((message) => {
          if (
            message &&
            typeof message === "object" &&
            "type" in message &&
            message.type === "sentence-analysis-cache/get"
          ) {
            return {
              ok: true,
              entries: [
                {
                  sentenceHash,
                  analyzerVersion: "fixture-v1",
                  analyzerId: "fixture-annotated",
                  sourceText: sourceSentence,
                  createdAt: "2026-04-18T10:15:00.000Z",
                  lastAccessedAt: "2026-04-18T10:15:00.000Z",
                  contextualWordCandidates: [
                    {
                      id: "candidate-can",
                      sentenceHash,
                      sentence: sourceSentence,
                      tokenText: "can",
                      normalizedText: "can",
                      targetLemma: "lata",
                      candidateLemma: "can",
                      lexemeId: "lexeme-can",
                      candidatePos: "noun",
                      observedPos: "modal",
                      chunkType: "other",
                      nearbyContextSignature: ["modal-before-base-verb"],
                      ambiguityGroup: "can_modal_vs_noun",
                      confidence: 0.41,
                      decision: "skip",
                      rationale: "Modal use should not inject the noun sense."
                    }
                  ]
                }
              ]
            };
          }

          return undefined;
        });

        try {
          await bootContentScript();
          await wait(30);

          expect(
            document.querySelector<HTMLElement>("[data-ik-lexeme-id='lexeme-can']")
          ).toBeNull();
          expect(document.body.textContent).toContain("I can watch");
          expect(document.body.textContent).not.toContain("lata");
          expect(
            document.querySelector<HTMLElement>("[data-ik-lexeme-id='lexeme-city']")
              ?.textContent
          ).toBe("ciudad");
        } finally {
          chromeStub.restore();
        }
      }
    );
  });

  it("refreshes scoped cached analysis before processing dynamic text", async () => {
    await withFixtureDom(
      "article-basic.html",
      { url: FIXTURE_URL },
      async ({ document, wait }) => {
        const sourceSentence = "I can watch the city from the hill.";
        const sentenceHash = hashSentence(sourceSentence);
        document.body.innerHTML = "<main id='feed'></main>";

        const chromeStub = installChromeStub({
          "settings": BASE_SETTINGS,
          "asset-render-units": renderUnitAsset([
            ...SEED_LEXICON,
            {
              lexemeId: "lexeme-can",
              sourceLemma: "can",
              targetLemma: "lata",
              pos: "noun",
              frequencyRank: 200,
              confidence: 0.95
            }
          ]),
          "site-settings": {
            [HOSTNAME]: {
              hostname: HOSTNAME,
              enabled: true,
              discoveryRate: 1,
              updatedAt: "2026-04-18T10:15:45.000Z"
            }
          },
          "sentence-analysis-cache": [
            {
              sentenceHash,
              analyzerVersion: "fixture-v1",
              analyzerId: "fixture-annotated",
              sourceText: sourceSentence,
              createdAt: "2026-04-18T10:15:00.000Z",
              lastAccessedAt: "2026-04-18T10:15:00.000Z",
              phraseMatches: [],
              contextualWordCandidates: [
                {
                  id: "candidate-can",
                  sentenceHash,
                  sentence: sourceSentence,
                  tokenText: "can",
                  normalizedText: "can",
                  targetLemma: "lata",
                  candidateLemma: "can",
                  lexemeId: "lexeme-can",
                  candidatePos: "noun",
                  observedPos: "modal",
                  chunkType: "other",
                  nearbyContextSignature: ["modal-before-base-verb"],
                  ambiguityGroup: "can_modal_vs_noun",
                  confidence: 0.41,
                  decision: "skip",
                  rationale: "Modal use should not inject the noun sense."
                }
              ]
            }
          ]
        });
        chromeStub.setSendMessageHandler((message) => {
          if (
            message &&
            typeof message === "object" &&
            "type" in message &&
            message.type === RuntimeMessageType.GetSentenceAnalysisCache
          ) {
            const hashes = (message as { sentenceHashes?: string[] }).sentenceHashes ?? [];
            if (!hashes.includes(sentenceHash)) {
              return {
                ok: true,
                entries: []
              };
            }

            return {
              ok: true,
              entries: [
                {
                  sentenceHash,
                  analyzerVersion: "fixture-v1",
                  analyzerId: "fixture-annotated",
                  sourceText: sourceSentence,
                  createdAt: "2026-04-18T10:15:00.000Z",
                  lastAccessedAt: "2026-04-18T10:15:00.000Z",
                  phraseMatches: [],
                  contextualWordCandidates: [
                    {
                      id: "candidate-can",
                      sentenceHash,
                      sentence: sourceSentence,
                      tokenText: "can",
                      normalizedText: "can",
                      targetLemma: "lata",
                      candidateLemma: "can",
                      lexemeId: "lexeme-can",
                      candidatePos: "noun",
                      observedPos: "modal",
                      chunkType: "other",
                      nearbyContextSignature: ["modal-before-base-verb"],
                      ambiguityGroup: "can_modal_vs_noun",
                      confidence: 0.41,
                      decision: "skip",
                      rationale: "Modal use should not inject the noun sense."
                    }
                  ]
                }
              ]
            };
          }

          return undefined;
        });

        try {
          await bootContentScript();
          await wait(30);

          const feed = document.getElementById("feed");
          expect(feed).toBeTruthy();
          const paragraph = document.createElement("p");
          paragraph.textContent = sourceSentence;
          feed?.append(paragraph);
          await wait(240);

          expect(
            document.querySelector<HTMLElement>("[data-ik-lexeme-id='lexeme-can']")
          ).toBeNull();
          expect(document.body.textContent).toContain("I can watch");
          expect(document.body.textContent).not.toContain("lata");
          expect(
            document.querySelector<HTMLElement>("[data-ik-lexeme-id='lexeme-city']")
              ?.textContent
          ).toBe("ciudad");

          const diagnostics = (
            await chromeStub.dispatchRuntimeMessage({
              type: PAGE_DIAGNOSTICS_MESSAGE_TYPE
            })
          )[0] as {
            mutationCacheRefreshes?: number;
            mutationCacheRefreshHits?: number;
          };

          expect(diagnostics.mutationCacheRefreshes).toBe(1);
          expect(diagnostics.mutationCacheRefreshHits).toBe(1);
        } finally {
          chromeStub.restore();
        }
      }
    );
  });

  it("injects due learning items even when discovery sampling would skip them", async () => {
    await withFixtureDom(
      "article-basic.html",
      { url: FIXTURE_URL },
      async ({ document, wait }) => {
        document.body.innerHTML = "<p>The city is important for every visitor.</p>";

        const chromeStub = installChromeStub({
          "settings": {
            ...BASE_SETTINGS,
            discoveryRate: 0
          },
          "asset-render-units": renderUnitAsset(SEED_LEXICON),
          "site-settings": {
            [HOSTNAME]: {
              hostname: HOSTNAME,
              enabled: true,
              discoveryRate: 0,
              updatedAt: "2026-04-18T10:17:00.000Z"
            }
          },
          "learning-items": [
            {
              itemId: "word:lexeme-city",
              unitRefId: "lexeme-city",
              unitType: "word",
              sourceText: "city",
              targetText: "ciudad",
              status: "reviewing",
              introducedAt: "2026-04-18T10:00:00.000Z",
              nextReviewAt: "2020-01-01T00:00:00.000Z",
              interval: 600000,
              ease: 2.3,
              lapses: 0,
              assistCount: 0,
              qualifiedExposureCount: 1,
              consecutiveUnassistedCount: 0,
              distinctContextCount: 1,
              suspended: false
            }
          ]
        });
        chromeStub.setSendMessageHandler((message) => {
          if (
            message &&
            typeof message === "object" &&
            "type" in message &&
            message.type === "learning-items/get"
          ) {
            return {
              ok: true,
              items: [
                {
                  itemId: "word:lexeme-city",
                  unitRefId: "lexeme-city",
                  unitType: "word",
                  sourceText: "city",
                  targetText: "ciudad",
                  status: "reviewing",
                  introducedAt: "2026-04-18T10:00:00.000Z",
                  nextReviewAt: "2020-01-01T00:00:00.000Z",
                  interval: 600000,
                  ease: 2.3,
                  lapses: 0,
                  assistCount: 0,
                  qualifiedExposureCount: 1,
                  consecutiveUnassistedCount: 0,
                  distinctContextCount: 1,
                  suspended: false
                }
              ]
            };
          }

          return undefined;
        });

        try {
          await bootContentScript();
          await wait(30);

          expect(
            document.querySelector<HTMLElement>("[data-ik-lexeme-id='lexeme-city']")
              ?.textContent
          ).toBe("ciudad");
          const cognateToken = document.querySelector<HTMLElement>(
            "[data-ik-lexeme-id='lexeme-important']"
          );
          expect(cognateToken?.textContent).toBe("importante");
          expect(cognateToken?.getAttribute("data-ik-scheduler-reason")).toBe(
            "beginner-cognate"
          );
        } finally {
          chromeStub.restore();
        }
      }
    );
  });

  it("explains accented cognate word-family patterns", async () => {
    await withFixtureDom(
      "article-basic.html",
      { url: FIXTURE_URL },
      async ({ document, wait }) => {
        document.body.innerHTML = "<p>The information is important.</p>";

        const chromeStub = installChromeStub({
          "settings": BASE_SETTINGS,
          "learning-profile": {
            activeVocabularyBandId: "level-1c",
            activePhraseBandId: "level-1c",
            activeGrammarBandId: "level-1c",
            unlockedBandIds: ["level-1a", "level-1b", "level-1c"]
          },
          "asset-render-units": renderUnitAsset([
            ...SEED_LEXICON,
            {
              lexemeId: "lexeme-information",
              sourceLemma: "information",
              targetLemma: "información",
              pos: "noun",
              frequencyRank: 120,
              confidence: 0.98
            }
          ]),
          "site-settings": {
            [HOSTNAME]: {
              hostname: HOSTNAME,
              enabled: true,
              discoveryRate: 1,
              updatedAt: "2026-04-18T10:18:00.000Z"
            }
          }
        });

        try {
          await bootContentScript();
          await wait(30);

          const token = document.querySelector<HTMLElement>(
            "[data-ik-lexeme-id='lexeme-information']"
          );
          expect(token?.textContent).toBe("información");
          expect(token?.getAttribute("data-ik-curriculum-reason")).toContain(
            "English words ending in -tion often become Spanish -ción"
          );
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
          "settings": {
            discoveryRate: 1,
            sentenceTranslationEnabled: true,
            provider: "openai"
          },
          "asset-render-units": renderUnitAsset(SEED_LEXICON),
          "site-settings": {
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
                learningNote: createLearningNote("Present tense for a general statement.")
              }
            ]
          });
          await wait(20);

          expect(document.querySelector("[data-ik-sentence-note='true']")).toBeTruthy();

          chromeStub.setStorageValues({
            "site-settings": {
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
          "settings": {
            discoveryRate: 1,
            sentenceTranslationEnabled: true,
            provider: "openai"
          },
          "asset-render-units": renderUnitAsset(SEED_LEXICON),
          "site-settings": {
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
                learningNote: createLearningNote("Present tense for a general statement.")
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

  it("opens sentence details on click and reveals original sentence on double click", async () => {
    await withFixtureDom(
      "article-basic.html",
      { url: FIXTURE_URL },
      async ({ document, window, wait }) => {
        const sourceSentence = "The city is important for every visitor.";
        const translatedSentence = "La ciudad es importante para cada visitante.";
        const learningNote = createLearningNote(
          "Spanish naturally phrases this as \"para cada visitante\".",
          {
            literalGloss:
              "\"la ciudad\" = the city\n\"es importante\" = is important\n\"para cada visitante\" = for each visitor",
            keyPhrase: "\"cada visitante\" = each visitor",
            canonicalUsage:
              "The natural Spanish phrasing keeps the same idea with \"para cada visitante\".",
            grammarFocus: "The sentence uses the present tense for a general statement."
          }
        );
        document.body.innerHTML = `<p>${sourceSentence}</p>`;

        const chromeStub = installChromeStub({
          "settings": {
            discoveryRate: 1,
            sentenceTranslationEnabled: true,
            provider: "openai"
          },
          "asset-render-units": renderUnitAsset(SEED_LEXICON),
          "site-settings": {
            [HOSTNAME]: {
              hostname: HOSTNAME,
              enabled: true,
              discoveryRate: 1,
              updatedAt: "2026-04-18T10:18:00.000Z"
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
                translatedText: translatedSentence,
                learningNote
              }
            ]
          });
          await wait(20);

          const note = document.querySelector<HTMLElement>(
            `[data-ik-sentence-note='true'][data-ik-sentence-hash='${hashSentence(
              sourceSentence
            )}']`
          );
          expect(note).toBeTruthy();
          expect(note?.textContent).toContain(translatedSentence);
          expect(note?.textContent).not.toContain("Grammar:");

          note?.dispatchEvent(
            new window.MouseEvent("click", {
              bubbles: true,
              cancelable: true
            })
          );
          await wait(20);

          const popover = document.querySelector<HTMLElement>("[data-ik-popover='true']");
          expect(popover).toBeTruthy();
          expect(popover?.getAttribute("data-immersionkit-ignore")).toBe("true");
          expect(popover?.textContent).toContain("Uses OpenAI only when enabled.");
          expect(popover?.textContent).toContain("Original");
          expect(popover?.textContent).toContain(sourceSentence);
          expect(popover?.textContent).toContain("Translation");
          expect(popover?.textContent).toContain(translatedSentence);
          expect(popover?.textContent).toContain("Why this helps");
          expect(popover?.textContent).toContain(learningNote.grammarFocus);
          expect(popover?.querySelector("[data-ik-status-action]")).toBeNull();
          expect(popover?.querySelector("[data-ik-sentence-action]")).toBeTruthy();

          const translationButton = popover?.querySelector<HTMLButtonElement>(
            "[data-ik-sentence-action='show-translation']"
          );
          expect(translationButton).toBeTruthy();
          expect(translationButton?.textContent).toContain("Translation");
          expect(translationButton?.getAttribute("aria-pressed")).toBe("true");

          const toggleButton = popover?.querySelector<HTMLButtonElement>(
            "[data-ik-sentence-action='toggle-source']"
          );
          expect(toggleButton).toBeTruthy();
          expect(toggleButton?.textContent).toContain("Original");

          toggleButton?.dispatchEvent(
            new window.MouseEvent("click", {
              bubbles: true,
              cancelable: true
            })
          );
          await wait(20);

          expect(note?.getAttribute("data-ik-source-visible")).toBe("true");

          const toggledButton = document.querySelector<HTMLButtonElement>(
            "[data-ik-sentence-action='toggle-source']"
          );
          expect(toggledButton?.getAttribute("aria-pressed")).toBe("true");

          translationButton?.dispatchEvent(
            new window.MouseEvent("click", {
              bubbles: true,
              cancelable: true
            })
          );
          await wait(20);

          expect(note?.getAttribute("data-ik-source-visible")).toBe("false");

          note?.dispatchEvent(
            new window.MouseEvent("dblclick", {
              bubbles: true,
              cancelable: true
            })
          );
          await wait(20);

          expect(note?.getAttribute("data-ik-source-visible")).toBe("true");
          expect(note?.textContent).toContain(sourceSentence);
          expect(document.querySelector("[data-ik-popover='true']")).toBeNull();
        } finally {
          chromeStub.restore();
        }
      }
    );
  });

  it("records grammar assist evidence when sentence details reveal known grammar features", async () => {
    await withFixtureDom(
      "article-basic.html",
      { url: FIXTURE_URL },
      async ({ document, window, wait }) => {
        const sourceSentence = "The city has been important for every visitor.";
        const sentenceHash = hashSentence(sourceSentence);
        document.body.innerHTML = `<p>${sourceSentence}</p>`;

        const chromeStub = installChromeStub({
          "settings": {
            discoveryRate: 1,
            sentenceTranslationEnabled: true,
            provider: "openai"
          },
          "learning-profile": {
            activeVocabularyBandId: "level-1a",
            activePhraseBandId: "level-1a",
            activeGrammarBandId: "level-4a",
            unlockedBandIds: ["level-1a", "level-4a"]
          },
          "asset-render-units": renderUnitAsset(SEED_LEXICON),
          "site-settings": {
            [HOSTNAME]: {
              hostname: HOSTNAME,
              enabled: true,
              discoveryRate: 1,
              updatedAt: "2026-04-18T10:19:00.000Z"
            }
          },
          "sentence-analysis-cache": [
            {
              sentenceHash,
              analyzerVersion: "fixture-v1",
              analyzerId: "fixture-annotated",
              sourceText: sourceSentence,
              tokens: [],
              chunks: [],
              grammarFeatures: [
                {
                  featureId: "grammar:aspect:have-been",
                  featureKey: "aspect:have-been",
                  label: "Have been",
                  category: "tense-aspect",
                  sourceText: "has been",
                  normalizedSourceText: "has been",
                  span: {
                    startToken: 2,
                    endToken: 4,
                    startChar: 9,
                    endChar: 17
                  },
                  evidence: ["fixture"],
                  confidence: 0.86
                }
              ],
              phraseMatches: [],
              contextualWordCandidates: [],
              createdAt: "2026-04-18T10:00:00.000Z",
              lastAccessedAt: "2026-04-18T10:00:00.000Z"
            }
          ]
        });
        chromeStub.setSendMessageHandler((message) => {
          if (
            message &&
            typeof message === "object" &&
            "type" in message &&
            message.type === RuntimeMessageType.GetSentenceAnalysisCache
          ) {
            return {
              ok: true,
              entries: [
                {
                  sentenceHash,
                  analyzerVersion: "fixture-v1",
                  analyzerId: "fixture-annotated",
                  sourceText: sourceSentence,
                  tokens: [],
                  chunks: [],
                  grammarFeatures: [
                    {
                      featureId: "grammar:aspect:have-been",
                      featureKey: "aspect:have-been",
                      label: "Have been",
                      category: "tense-aspect",
                      sourceText: "has been",
                      normalizedSourceText: "has been",
                      span: {
                        startToken: 2,
                        endToken: 4,
                        startChar: 9,
                        endChar: 17
                      },
                      evidence: ["fixture"],
                      confidence: 0.86
                    }
                  ],
                  phraseMatches: [],
                  contextualWordCandidates: [],
                  createdAt: "2026-04-18T10:00:00.000Z",
                  lastAccessedAt: "2026-04-18T10:00:00.000Z"
                }
              ]
            };
          }

          return undefined;
        });

        try {
          await bootContentScript();
          await wait(30);

          await chromeStub.dispatchRuntimeMessage({
            type: RuntimeMessageType.SentenceTranslationResult,
            results: [
              {
                sentenceHash,
                sourceText: sourceSentence,
                translatedText: "La ciudad ha sido importante para cada visitante.",
                learningNote: createLearningNote("Uses a perfect aspect pattern.", {
                  grammarFocus: "Has been marks a present perfect idea."
                })
              }
            ]
          });
          await wait(20);

          expect(
            chromeStub.sentMessages.find(
              (message) =>
                Boolean(message) &&
                typeof message === "object" &&
                (message as { itemId?: unknown }).itemId ===
                  "grammar-feature:aspect:have-been"
            )
          ).toBeUndefined();

          const note = document.querySelector<HTMLElement>(
            `[data-ik-sentence-note='true'][data-ik-sentence-hash='${sentenceHash}']`
          );
          expect(note).toBeTruthy();
          note?.dispatchEvent(
            new window.MouseEvent("click", {
              bubbles: true,
              cancelable: true
            })
          );
          await wait(20);

          const popover = document.querySelector<HTMLElement>("[data-ik-popover='true']");
          expect(popover?.textContent).toContain("Ongoing result with have been");
          expect(popover?.textContent).toContain("haber");

          const assistMessage = chromeStub.sentMessages.find(
            (message): message is {
              type: string;
              itemId: string;
              assistType: string;
              contextSentenceHash: string;
              source: string;
            } =>
              Boolean(message) &&
              typeof message === "object" &&
              (message as { itemId?: unknown }).itemId ===
                "grammar-feature:aspect:have-been"
          );

          expect(assistMessage).toMatchObject({
            type: CONTENT_ASSIST_EVENT_MESSAGE_TYPE,
            itemId: "grammar-feature:aspect:have-been",
            assistType: "grammar-note-reveal",
            contextSentenceHash: sentenceHash,
            source: "content-grammar-note"
          });

          await wait(CONTENT_EVIDENCE_POLICY.grammarDetailDwellMs + 100);

          const exposureMessage = chromeStub.sentMessages.find(
            (message): message is {
              type: string;
              itemId: string;
              sentenceHash: string;
              wasAssisted: boolean;
              dwellMs: number;
              source: string;
            } =>
              Boolean(message) &&
              typeof message === "object" &&
              (message as { itemId?: unknown; source?: unknown }).itemId ===
                "grammar-feature:aspect:have-been" &&
              (message as { source?: unknown }).source ===
                "content-grammar-detail-dwell"
          );

          expect(exposureMessage).toMatchObject({
            type: RuntimeMessageType.QualifiedExposureEvent,
            itemId: "grammar-feature:aspect:have-been",
            sentenceHash,
            wasAssisted: true,
            dwellMs: CONTENT_EVIDENCE_POLICY.grammarDetailDwellMs,
            source: "content-grammar-detail-dwell"
          });
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

function createLearningNote(
  summary: string,
  overrides: Partial<SentenceLearningNote> = {}
): SentenceLearningNote {
  return {
    summary,
    literalGloss: "",
    keyPhrase: "",
    canonicalUsage: "",
    grammarFocus: "",
    ...overrides
  };
}

async function bootContentScript() {
  vi.resetModules();
  await import("../src/content/index");
}
