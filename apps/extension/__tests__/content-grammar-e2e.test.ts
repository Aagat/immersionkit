import {
  RuntimeMessageType,
  createSentenceAnalysisEntry,
  hashSentence,
  type ContextualWordCandidate,
  type SentenceAnalysisEntry,
  type SentenceLearningNote
} from "@immersionkit/shared";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  createWinkNlpSentenceAnalyzer,
  type SentenceAnalyzer
} from "../src/background/sentence-analyzers";
import { installChromeStub } from "./helpers/chrome-stub";
import { withFixtureDom } from "./helpers/fixture-dom";

const HOSTNAME = "fixtures.immersionkit.test";
const FIXTURE_URL = `https://${HOSTNAME}/grammar-story`;
const TEST_NOW = "2026-04-18T11:00:00.000Z";

const BASE_SETTINGS = {
  discoveryRate: 1,
  sentenceTranslationEnabled: true,
  provider: "openai"
} as const;

type TestSeedEntry = {
  lexemeId: string;
  sourceLemma: string;
  targetLemma: string;
  pos: "noun" | "adjective" | "adverb";
  frequencyRank: number | null;
  confidence: number;
};

const BASE_LEXICON: readonly TestSeedEntry[] = [
  {
    lexemeId: "lexeme-city",
    sourceLemma: "city",
    targetLemma: "ciudad",
    pos: "noun",
    frequencyRank: 12,
    confidence: 0.98
  },
  {
    lexemeId: "lexeme-team",
    sourceLemma: "team",
    targetLemma: "equipo",
    pos: "noun",
    frequencyRank: 80,
    confidence: 0.96
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

let analyzer: SentenceAnalyzer;

describe("content grammar delivery e2e", () => {
  beforeAll(async () => {
    analyzer = await createWinkNlpSentenceAnalyzer();
  });

  it.each([
    {
      name: "Level 2A will future",
      activeBandId: "level-2a",
      sentence: "The city team will call the office tomorrow.",
      translatedText: "El equipo de la ciudad llamará a la oficina mañana.",
      featureKey: "future:will",
      title: "Simple future plans",
      sourceSpan: "will call",
      spanishPattern: "future form or ir a + infinitive",
      exampleMapping: "will call -> llamará / va a llamar"
    },
    {
      name: "Level 2B going-to plans",
      activeBandId: "level-2b",
      sentence: "The city team is going to call the office today.",
      translatedText: "El equipo de la ciudad va a llamar a la oficina hoy.",
      featureKey: "future:going-to",
      title: "Future plans with going to",
      sourceSpan: "is going to call",
      spanishPattern: "ir a + infinitive",
      exampleMapping: "is going to call -> va a llamar"
    },
    {
      name: "Level 2B should advice",
      activeBandId: "level-2b",
      sentence: "Visitors should wait near the city gate today.",
      translatedText: "Los visitantes deberían esperar cerca de la puerta de la ciudad hoy.",
      featureKey: "modal:should",
      title: "Advice with should",
      sourceSpan: "should wait",
      spanishPattern: "debería + infinitive",
      exampleMapping: "should rest -> debería descansar"
    },
    {
      name: "Level 3C purpose",
      activeBandId: "level-3c",
      sentence: "The city team met early in order to learn the process.",
      translatedText: "El equipo de la ciudad se reunió temprano para aprender el proceso.",
      featureKey: "infinitive:purpose",
      title: "Purpose with in order to",
      sourceSpan: "in order to learn",
      spanishPattern: "para + infinitive",
      exampleMapping: "in order to learn -> para aprender"
    },
    {
      name: "Level 4A have-been aspect",
      activeBandId: "level-4a",
      sentence: "The city has been important for every visitor this year.",
      translatedText: "La ciudad ha sido importante para cada visitante este año.",
      featureKey: "aspect:have-been",
      title: "Ongoing result with have been",
      sourceSpan: "has been",
      spanishPattern: "haber + participle, or haber estado + gerund",
      exampleMapping: "have been working -> he estado trabajando"
    }
  ])(
    "teaches the current grammar focus from page content: $name",
    async (scenario) => {
      await runGrammarPageScenario({
        activeBandId: scenario.activeBandId,
        sentence: scenario.sentence,
        translatedText: scenario.translatedText,
        expectedFeatureKeys: [scenario.featureKey],
        assert({ document }) {
          const card = document.querySelector<HTMLElement>(
            `[data-ik-grammar-feature-key='${scenario.featureKey}']`
          );

          expect(card).toBeTruthy();
          expect(card?.getAttribute("data-ik-grammar-status")).toBe("focus");
          expect(card?.textContent).toContain(scenario.title);
          expect(card?.textContent).toContain(scenario.sourceSpan);
          expect(card?.textContent).toContain(scenario.spanishPattern);
          expect(card?.textContent).toContain(scenario.exampleMapping);
        }
      });
    }
  );

  it("teaches modal can as grammar instead of rendering the misleading noun replacement", async () => {
    const sentence = "I can visit the city tomorrow.";
    const sentenceHash = hashSentence(sentence);
    const canSkipCandidate = skipCandidate({
      sentence,
      sentenceHash,
      tokenText: "can",
      targetLemma: "lata",
      candidateLemma: "can",
      lexemeId: "lexeme-can",
      candidatePos: "noun",
      observedPos: "modal",
      ambiguityGroup: "can_modal_vs_noun",
      nearbyContextSignature: ["modal-before-base-verb"],
      rationale: "Modal use should not inject the noun sense."
    });

    await runGrammarPageScenario({
      activeBandId: "level-2a",
      sentence,
      translatedText: "Puedo visitar la ciudad mañana.",
      expectedFeatureKeys: ["modal:can"],
      contextualWordCandidates: [canSkipCandidate],
      lexicon: [
        ...BASE_LEXICON,
        {
          lexemeId: "lexeme-can",
          sourceLemma: "can",
          targetLemma: "lata",
          pos: "noun",
          frequencyRank: 200,
          confidence: 0.95
        }
      ],
      assert({ document }) {
        const card = document.querySelector<HTMLElement>(
          "[data-ik-grammar-feature-key='modal:can']"
        );

        expect(card).toBeTruthy();
        expect(card?.getAttribute("data-ik-grammar-status")).toBe("focus");
        expect(card?.textContent).toContain("Ability with can");
        expect(card?.textContent).toContain("poder + infinitive");
        expect(document.querySelector("[data-ik-lexeme-id='lexeme-can']")).toBeNull();
        expect(document.body.textContent).toContain("I can visit");
        expect(document.body.textContent).not.toContain("lata");
      }
    });
  });

  it("reviews earlier grammar without treating it as the current focus", async () => {
    await runGrammarPageScenario({
      activeBandId: "level-4a",
      sentence: "The city used to open the market early.",
      translatedText: "La ciudad solía abrir el mercado temprano.",
      expectedFeatureKeys: ["aspect:used-to"],
      assert({ document }) {
        const card = document.querySelector<HTMLElement>(
          "[data-ik-grammar-feature-key='aspect:used-to']"
        );

        expect(card).toBeTruthy();
        expect(card?.getAttribute("data-ik-grammar-status")).toBe("review");
        expect(card?.textContent).toContain("Past habits with used to");
        expect(card?.textContent).toContain(
          "This reviews a grammar pattern from an earlier focus."
        );
      }
    });
  });

  it("suppresses out-of-band purpose grammar on earlier curriculum pages", async () => {
    await runGrammarPageScenario({
      activeBandId: "level-1c",
      sentence: "The city team met early in order to learn the process.",
      translatedText: "El equipo de la ciudad se reunió temprano para aprender el proceso.",
      expectedFeatureKeys: ["infinitive:purpose"],
      assert({ document }) {
        expect(
          document.querySelector("[data-ik-grammar-feature-key='infinitive:purpose']")
        ).toBeNull();
        expect(document.querySelector("[data-ik-grammar-card='true']")).toBeNull();
      }
    });
  });
});

async function runGrammarPageScenario(input: {
  activeBandId: string;
  sentence: string;
  translatedText: string;
  expectedFeatureKeys: readonly string[];
  contextualWordCandidates?: readonly ContextualWordCandidate[];
  lexicon?: readonly TestSeedEntry[];
  assert: (context: { document: Document; popover: HTMLElement }) => void;
}): Promise<void> {
  await withFixtureDom(
    "article-basic.html",
    { url: FIXTURE_URL },
    async ({ document, window, wait }) => {
      const sentenceHash = hashSentence(input.sentence);
      const entry = await analyzeSentence(input.sentence, [
        ...(input.contextualWordCandidates ?? [])
      ]);

      expect(entry.grammarFeatures.map((feature) => feature.featureKey)).toEqual(
        expect.arrayContaining(input.expectedFeatureKeys)
      );

      document.body.innerHTML = "";
      const article = document.createElement("article");
      const paragraph = document.createElement("p");
      paragraph.textContent = input.sentence;
      article.append(paragraph);
      document.body.append(article);

      const chromeStub = installChromeStub({
        "settings": BASE_SETTINGS,
        "learning-profile": {
          activeVocabularyBandId: "level-1b",
          activePhraseBandId: "level-1b",
          activeGrammarBandId: input.activeBandId,
          unlockedBandIds: ["level-1a", "level-1b", input.activeBandId]
        },
        "asset-render-units": renderUnitAsset(input.lexicon ?? BASE_LEXICON),
        "site-settings": {
          [HOSTNAME]: {
            hostname: HOSTNAME,
            enabled: true,
            discoveryRate: 1,
            sentenceTranslationEnabled: true,
            updatedAt: TEST_NOW
          }
        },
        "sentence-analysis-cache": [entry]
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
            entries: [entry]
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
                entry
              }
            ],
            cachedResults: []
          };
        }

        return undefined;
      });

      try {
        await bootContentScript();
        await wait(140);

        await chromeStub.dispatchRuntimeMessage({
          type: RuntimeMessageType.SentenceTranslationResult,
          results: [
            {
              sentenceHash,
              sourceText: input.sentence,
              translatedText: input.translatedText,
              learningNote: createLearningNote(
                "This sentence is useful for the current grammar focus."
              )
            }
          ]
        });
        await wait(30);

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
        await wait(30);

        const popover = document.querySelector<HTMLElement>(
          "[data-ik-popover='true']"
        );
        expect(popover).toBeTruthy();
        input.assert({ document, popover: popover as HTMLElement });
      } finally {
        chromeStub.restore();
      }
    }
  );
}

async function analyzeSentence(
  sentence: string,
  contextualWordCandidates: readonly ContextualWordCandidate[] = []
): Promise<SentenceAnalysisEntry> {
  const sentenceHash = hashSentence(sentence);
  const output = await analyzer.analyze(sentence, sentenceHash);
  return createSentenceAnalysisEntry(output, {
    contextualWordCandidates: [...contextualWordCandidates],
    phraseMatches: [],
    createdAt: TEST_NOW
  });
}

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
      provenance: { source: "manual" }
    }))
  };
}

function skipCandidate(input: {
  sentence: string;
  sentenceHash: string;
  tokenText: string;
  targetLemma: string;
  candidateLemma: string;
  lexemeId: string;
  candidatePos: ContextualWordCandidate["candidatePos"];
  observedPos: ContextualWordCandidate["observedPos"];
  ambiguityGroup: string;
  nearbyContextSignature: string[];
  rationale: string;
}): ContextualWordCandidate {
  return {
    id: `skip-${input.lexemeId}`,
    sentenceHash: input.sentenceHash,
    sentence: input.sentence,
    tokenText: input.tokenText,
    surfaceText: input.tokenText,
    normalizedText: input.tokenText.toLowerCase(),
    targetLemma: input.targetLemma,
    candidateLemma: input.candidateLemma,
    lexemeId: input.lexemeId,
    candidatePos: input.candidatePos,
    observedPos: input.observedPos,
    chunkType: "other",
    nearbyContextSignature: input.nearbyContextSignature,
    ambiguityGroup: input.ambiguityGroup,
    confidence: 0.42,
    decision: "skip",
    rationale: input.rationale
  };
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
