import {
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
    lemmaId: "lemma-city",
    sourceLemma: "city",
    targetLemma: "ciudad",
    pos: "noun",
    frequencyRank: 12,
    confidence: 0.98,
    exampleSentenceEnglish: "The city welcomes visitors every spring.",
    exampleSentenceNative: "La ciudad recibe a los visitantes cada primavera."
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

  it("falls back to the page sentence when the lexicon has no example sentence", async () => {
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
              updatedAt: "2026-04-18T10:11:00.000Z"
            }
          }
        });

        try {
          await bootContentScript();
          await wait(30);

          const token = document.querySelector<HTMLElement>(
            "[data-ik-lemma-id='lemma-important']"
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
          "immersionkit.settings": BASE_SETTINGS,
          "immersionkit.seedLexicon": SEED_LEXICON,
          "immersionkit.siteSettings": {
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
              sentences: string[];
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

          expect(queueMessage?.sentences).toEqual([sourceSentence]);
          expect(queueMessage?.candidates[0]).toMatchObject({
            sourceText: sourceSentence,
            sentenceHash: hashSentence(sourceSentence),
            reason: "fixed-phrase-hint",
            phraseHints: ["as soon as", "take care of"]
          });
          expect(
            document.querySelector("[data-ik-render-layer='word phrase-candidate']")
          ).toBeTruthy();
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
          "immersionkit.settings": BASE_SETTINGS,
          "immersionkit.seedLexicon": SEED_LEXICON,
          "immersionkit.siteSettings": {
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
            "[data-ik-lemma-id='lemma-city']"
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
          "immersionkit.settings": BASE_SETTINGS,
          "immersionkit.seedLexicon": SEED_LEXICON,
          "immersionkit.siteSettings": {
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
            itemId: "word:lemma-city",
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
          "immersionkit.settings": BASE_SETTINGS,
          "immersionkit.seedLexicon": SEED_LEXICON,
          "immersionkit.siteSettings": {
            [HOSTNAME]: {
              hostname: HOSTNAME,
              enabled: true,
              discoveryRate: 1,
              updatedAt: "2026-04-18T10:14:15.000Z"
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
          expect(popover?.textContent).toContain("grammar carrier");
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
          "immersionkit.settings": BASE_SETTINGS,
          "immersionkit.seedLexicon": [
            ...SEED_LEXICON,
            {
              lemmaId: "lemma-can",
              sourceLemma: "can",
              targetLemma: "lata",
              pos: "noun",
              frequencyRank: 200,
              confidence: 0.95
            }
          ],
          "immersionkit.siteSettings": {
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
                      lemmaId: "lemma-can",
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
            "[data-ik-lemma-id='lemma-can']"
          );
          expect(canToken).toBeTruthy();
          expect(canToken?.textContent).toBe("can");
          expect(canToken?.getAttribute("data-ik-context-decision")).toBe("skip");
          expect(canToken?.classList.contains("ik-word--suppressed")).toBe(true);
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
          "immersionkit.settings": BASE_SETTINGS,
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
          expect(document.querySelector("[data-ik-lemma-id='lemma-city']")).toBeTruthy();

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
          "immersionkit.settings": BASE_SETTINGS,
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

  it("uses cached analysis to skip unsafe ambiguous words before initial injection", async () => {
    await withFixtureDom(
      "article-basic.html",
      { url: FIXTURE_URL },
      async ({ document, wait }) => {
        const sourceSentence = "I can watch the city from the hill.";
        const sentenceHash = hashSentence(sourceSentence);
        document.body.innerHTML = `<p>${sourceSentence}</p>`;

        const chromeStub = installChromeStub({
          "immersionkit.settings": BASE_SETTINGS,
          "immersionkit.seedLexicon": [
            ...SEED_LEXICON,
            {
              lemmaId: "lemma-can",
              sourceLemma: "can",
              targetLemma: "lata",
              pos: "noun",
              frequencyRank: 200,
              confidence: 0.95
            }
          ],
          "immersionkit.siteSettings": {
            [HOSTNAME]: {
              hostname: HOSTNAME,
              enabled: true,
              discoveryRate: 1,
              updatedAt: "2026-04-18T10:15:30.000Z"
            }
          }
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
                      lemmaId: "lemma-can",
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
            document.querySelector<HTMLElement>("[data-ik-lemma-id='lemma-can']")
          ).toBeNull();
          expect(document.body.textContent).toContain("I can watch");
          expect(document.body.textContent).not.toContain("lata");
          expect(
            document.querySelector<HTMLElement>("[data-ik-lemma-id='lemma-city']")
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
          "immersionkit.settings": BASE_SETTINGS,
          "immersionkit.seedLexicon": [
            ...SEED_LEXICON,
            {
              lemmaId: "lemma-can",
              sourceLemma: "can",
              targetLemma: "lata",
              pos: "noun",
              frequencyRank: 200,
              confidence: 0.95
            }
          ],
          "immersionkit.siteSettings": {
            [HOSTNAME]: {
              hostname: HOSTNAME,
              enabled: true,
              discoveryRate: 1,
              updatedAt: "2026-04-18T10:15:45.000Z"
            }
          }
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
                      lemmaId: "lemma-can",
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
            document.querySelector<HTMLElement>("[data-ik-lemma-id='lemma-can']")
          ).toBeNull();
          expect(document.body.textContent).toContain("I can watch");
          expect(document.body.textContent).not.toContain("lata");
          expect(
            document.querySelector<HTMLElement>("[data-ik-lemma-id='lemma-city']")
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
          "immersionkit.settings": {
            ...BASE_SETTINGS,
            discoveryRate: 0
          },
          "immersionkit.seedLexicon": SEED_LEXICON,
          "immersionkit.siteSettings": {
            [HOSTNAME]: {
              hostname: HOSTNAME,
              enabled: true,
              discoveryRate: 0,
              updatedAt: "2026-04-18T10:17:00.000Z"
            }
          }
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
                  itemId: "word:lemma-city",
                  unitRefId: "lemma-city",
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
            document.querySelector<HTMLElement>("[data-ik-lemma-id='lemma-city']")
              ?.textContent
          ).toBe("ciudad");
          expect(
            document.querySelector<HTMLElement>(
              "[data-ik-lemma-id='lemma-important']"
            )
          ).toBeNull();
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
                learningNote: createLearningNote("Present tense for a general statement.")
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
          expect(popover?.textContent).toContain(learningNote.summary);
          expect(popover?.textContent).toContain("Word-by-word");
          const glossLines = [
            ...document.querySelectorAll<HTMLElement>(".ik-popover__sentence-detail-line")
          ].map((node) => node.textContent);
          expect(glossLines).toEqual([
            "\"la ciudad\" = the city",
            "\"es importante\" = is important",
            "\"para cada visitante\" = for each visitor"
          ]);
          expect(popover?.textContent).toContain("Phrase");
          expect(popover?.textContent).toContain(learningNote.keyPhrase);
          expect(popover?.textContent).toContain("Natural Spanish");
          expect(popover?.textContent).toContain(learningNote.canonicalUsage);
          expect(popover?.textContent).toContain("Grammar");
          expect(popover?.textContent).toContain(learningNote.grammarFocus);
          expect(popover?.textContent).not.toContain(translatedSentence);
          expect(popover?.textContent).not.toContain(sourceSentence);
          expect(popover?.querySelector("[data-ik-status-action]")).toBeNull();
          expect(popover?.querySelector("[data-ik-sentence-action]")).toBeTruthy();

          const toggleButton = popover?.querySelector<HTMLButtonElement>(
            "[data-ik-sentence-action='toggle-source']"
          );
          expect(toggleButton).toBeTruthy();
          expect(toggleButton?.textContent).toBe("Show Original");

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
          expect(toggledButton?.textContent).toBe("Show Translation");

          note?.dispatchEvent(
            new window.MouseEvent("dblclick", {
              bubbles: true,
              cancelable: true
            })
          );
          await wait(20);

          expect(note?.getAttribute("data-ik-source-visible")).toBe("false");
          expect(note?.textContent).toContain(translatedSentence);
          expect(document.querySelector("[data-ik-popover='true']")).toBeNull();
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
