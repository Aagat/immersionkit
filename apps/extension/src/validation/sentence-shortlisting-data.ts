import type { WordInventoryEntry, VocabStatus } from "@immersionkit/shared";
import type { SentenceShortlistingScenario } from "../content/validation/shortlisting";

import articleBasicHtml from "../../../../fixtures/pages/article-basic.html?raw";
import articleDynamicHtml from "../../../../fixtures/pages/article-dynamic.html?raw";
import articleExclusionsHtml from "../../../../fixtures/pages/article-exclusions.html?raw";
import articleLongformHtml from "../../../../fixtures/pages/article-longform.html?raw";
import articleDynamicAfterTemplatesHtml from "../../../../fixtures/evals/sentence-shortlisting/article-dynamic-after-templates.html?raw";
import longformOverflowHtml from "../../../../fixtures/evals/sentence-shortlisting/longform-overflow.html?raw";
import phraseHintBackfillHtml from "../../../../fixtures/evals/sentence-shortlisting/phrase-hint-backfill.html?raw";
import repeatedContentBlocksHtml from "../../../../fixtures/evals/sentence-shortlisting/repeated-content-blocks.html?raw";
import rerenderPass1Html from "../../../../fixtures/evals/sentence-shortlisting/rerender-pass-1.html?raw";
import rerenderPass2Html from "../../../../fixtures/evals/sentence-shortlisting/rerender-pass-2.html?raw";
import rerenderPass3Html from "../../../../fixtures/evals/sentence-shortlisting/rerender-pass-3.html?raw";

export const SENTENCE_SHORTLISTING_PHRASE_HINTS = [
  "as soon as",
  "at least",
  "take care of",
  "in order to",
  "used to",
  "going to"
] as const;

export const SENTENCE_SHORTLISTING_DISCOVERY_RATE = 1;
export const SENTENCE_SHORTLISTING_GOLDILOCKS_THRESHOLD = 0.6;
export const SENTENCE_SHORTLISTING_MAX_SHORTLIST_SIZE = 12;

export const SENTENCE_SHORTLISTING_WORD_INVENTORY: WordInventoryEntry[] = [
  createEntry("bench-city-noun", "city", "ciudad", "noun", ["cities"]),
  createEntry("bench-garden-noun", "garden", "jardin", "noun", ["gardens"]),
  createEntry("bench-volunteer-noun", "volunteer", "voluntario", "noun", ["volunteers"]),
  createEntry("bench-visitor-noun", "visitor", "visitante", "noun", ["visitors"]),
  createEntry("bench-family-noun", "family", "familia", "noun", ["families"]),
  createEntry("bench-guide-noun", "guide", "guia", "noun", ["guides"]),
  createEntry("bench-lesson-noun", "lesson", "leccion", "noun", ["lessons"]),
  createEntry("bench-market-noun", "market", "mercado", "noun", ["markets"]),
  createEntry("bench-path-noun", "path", "camino", "noun", ["paths"]),
  createEntry("bench-route-noun", "route", "ruta", "noun", ["routes"]),
  createEntry("bench-team-noun", "team", "equipo", "noun", ["teams"]),
  createEntry("bench-update-noun", "update", "actualizacion", "noun", ["updates"]),
  createEntry("bench-library-noun", "library", "biblioteca", "noun", ["libraries"]),
  createEntry("bench-workshop-noun", "workshop", "taller", "noun", ["workshops"]),
  createEntry("bench-plan-noun", "plan", "plan", "noun", ["plans"]),
  createEntry("bench-morning-noun", "morning", "manana", "noun", ["mornings"]),
  createEntry("bench-weekend-noun", "weekend", "fin de semana", "noun", ["weekends"]),
  createEntry("bench-bridge-noun", "bridge", "puente", "noun", ["bridges"]),
  createEntry("bench-local-adjective", "local", "local", "adjective"),
  createEntry("bench-new-adjective", "new", "nuevo", "adjective"),
  createEntry("bench-friendly-adjective", "friendly", "amable", "adjective"),
  createEntry("bench-simple-adjective", "simple", "simple", "adjective"),
  createEntry("bench-helpful-adjective", "helpful", "util", "adjective"),
  createEntry("bench-quiet-adjective", "quiet", "silencioso", "adjective"),
  createEntry("bench-clean-adjective", "clean", "limpio", "adjective"),
  createEntry("bench-public-adjective", "public", "publico", "adjective"),
  createEntry("bench-regional-adjective", "regional", "regional", "adjective"),
  createEntry("bench-coastal-adjective", "coastal", "costero", "adjective"),
  createEntry("bench-faster-adjective", "faster", "mas rapido", "adjective"),
  createEntry("bench-northern-adjective", "northern", "norte", "adjective"),
  createEntry("bench-long-adjective", "long", "largo", "adjective"),
  createEntry("bench-clear-adjective", "clear", "claro", "adjective", ["clearer"]),
  createEntry("bench-predictable-adjective", "predictable", "predecible", "adjective"),
  createEntry("bench-easy-adjective", "easy", "facil", "adjective", ["easier"]),
  createEntry("bench-weekly-adjective", "weekly", "semanal", "adjective"),
  createEntry("bench-early-adverb", "early", "temprano", "adverb"),
  createEntry("bench-carefully-adverb", "carefully", "cuidadosamente", "adverb"),
  createEntry("bench-bright-adjective", "bright", "brillante", "adjective"),
  createEntry("bench-peaceful-adjective", "peaceful", "tranquilo", "adjective"),
  createEntry("bench-often-adverb", "often", "a menudo", "adverb"),
  createEntry("bench-steadily-adverb", "steadily", "de forma constante", "adverb"),
  createEntry("bench-old-adjective", "old", "viejo", "adjective")
];

export const SENTENCE_SHORTLISTING_VOCAB_BY_LEXEME_ID: Record<string, VocabStatus> = {
  "bench-city-noun": "known",
  "bench-garden-noun": "known",
  "bench-guide-noun": "known",
  "bench-simple-adjective": "known",
  "bench-new-adjective": "known",
  "bench-clean-adjective": "known",
  "bench-quiet-adjective": "known",
  "bench-team-noun": "known",
  "bench-update-noun": "known",
  "bench-friendly-adjective": "learning",
  "bench-helpful-adjective": "learning",
  "bench-weekly-adjective": "learning",
  "bench-predictable-adjective": "learning",
  "bench-old-adjective": "ignored"
};

export const SENTENCE_SHORTLISTING_SCENARIOS: SentenceShortlistingScenario[] = [
  {
    id: "fixture-article-basic",
    label: "Fixture: article-basic.html",
    source: "fixtures/pages/article-basic.html",
    urlPath: "/fixtures/pages/article-basic.html",
    passes: [
      {
        id: "initial",
        label: "Initial article",
        html: articleBasicHtml,
        usefulSentences: [
          "The local garden opens early on Saturday morning when volunteers bring tools, water the plants, and prepare fresh soil for new seeds.",
          "Families often visit the garden because the peaceful path, bright flowers, and friendly guide make the place easy to enjoy."
        ]
      }
    ]
  },
  {
    id: "fixture-article-exclusions",
    label: "Fixture: article-exclusions.html",
    source: "fixtures/pages/article-exclusions.html",
    urlPath: "/fixtures/pages/article-exclusions.html",
    passes: [
      {
        id: "initial",
        label: "Visibility and exclusion controls",
        html: articleExclusionsHtml,
        usefulSentences: [
          "Organizers shared practical tips so first-time volunteers can bring simple tools, move carefully, and coordinate with local teams.",
          "Public summary: teams meet at sunrise, sort supplies, and leave each path cleaner than before."
        ]
      }
    ]
  },
  {
    id: "fixture-article-longform",
    label: "Fixture: article-longform.html",
    source: "fixtures/pages/article-longform.html",
    urlPath: "/fixtures/pages/article-longform.html",
    passes: [
      {
        id: "initial",
        label: "Longform article",
        html: articleLongformHtml,
        usefulSentences: [
          "Officials added early departures, reduced long transfer waits, and posted clearer signs in stations that were often confusing for visitors.",
          "Riders said the updated routes feel more predictable because trains arrive steadily and announcements are easier to follow."
        ]
      }
    ]
  },
  {
    id: "fixture-article-dynamic",
    label: "Fixture: article-dynamic.html",
    source: "fixtures/pages/article-dynamic.html",
    urlPath: "/fixtures/pages/article-dynamic.html",
    passes: [
      {
        id: "before-template-render",
        label: "Before template render",
        html: articleDynamicHtml,
        usefulSentences: [
          "Residents began the morning with simple updates about weather, traffic, and cleanup plans near the old bridge."
        ]
      },
      {
        id: "after-template-render",
        label: "After template render",
        html: articleDynamicAfterTemplatesHtml,
        usefulSentences: [
          "Neighbors shared helpful updates about the clean park, the quiet library, and the weekly market downtown."
        ]
      }
    ]
  },
  {
    id: "repeated-content-blocks",
    label: "Eval: repeated content blocks",
    source: "fixtures/evals/sentence-shortlisting/repeated-content-blocks.html",
    urlPath: "/fixtures/evals/sentence-shortlisting/repeated-content-blocks.html",
    passes: [
      {
        id: "initial",
        label: "Repeated copy blocks",
        html: repeatedContentBlocksHtml,
        usefulSentences: [
          "At least one volunteer checks the city garden before sunrise so every visitor finds clean paths.",
          "As soon as we arrive at the station, we take care of tools before lunch.",
          "The friendly guide shares simple notes and helpful maps for new families each weekend."
        ]
      }
    ]
  },
  {
    id: "phrase-hint-backfill",
    label: "Eval: phrase hint backfill",
    source: "fixtures/evals/sentence-shortlisting/phrase-hint-backfill.html",
    urlPath: "/fixtures/evals/sentence-shortlisting/phrase-hint-backfill.html",
    passes: [
      {
        id: "initial",
        label: "Phrase-only shortlist recovery",
        html: phraseHintBackfillHtml,
        usefulSentences: [
          "In order to avoid delays, mentors explain the checklist before sunrise."
        ]
      }
    ]
  },
  {
    id: "longform-overflow-nodes",
    label: "Eval: longform overflow nodes",
    source: "fixtures/evals/sentence-shortlisting/longform-overflow.html",
    urlPath: "/fixtures/evals/sentence-shortlisting/longform-overflow.html",
    passes: [
      {
        id: "initial",
        label: "Long node skip stress",
        html: longformOverflowHtml,
        usefulSentences: [
          "As soon as the market opens, neighbors take care of old signs and share clear directions with every visitor while mentors explain safe meeting points, public pickup windows, and fallback contacts for late arrivals who miss the first orientation message.",
          "The city team publishes short updates so new volunteers can plan a simple route."
        ]
      }
    ]
  },
  {
    id: "dynamic-rerender-same-hash",
    label: "Eval: dynamic rerender same hash",
    source: "fixtures/evals/sentence-shortlisting/rerender-pass-*.html",
    urlPath: "/fixtures/evals/sentence-shortlisting/rerender-sequence.html",
    passes: [
      {
        id: "pass-1",
        label: "Initial render",
        html: rerenderPass1Html,
        usefulSentences: [
          "The quiet library opens early and the friendly guide shares simple lessons each morning."
        ]
      },
      {
        id: "pass-2",
        label: "Rerender with repeated hash",
        html: rerenderPass2Html,
        usefulSentences: [
          "The quiet library opens early and the friendly guide shares simple lessons each morning.",
          "At least one mentor reviews each plan before the weekly workshop begins."
        ]
      },
      {
        id: "pass-3",
        label: "Rerender after teardown",
        html: rerenderPass3Html,
        usefulSentences: [
          "The quiet library opens early and the friendly guide shares simple lessons each morning."
        ]
      }
    ]
  }
];

export type SentenceShortlistingInputProfile =
  | "tiny"
  | "small"
  | "baseline"
  | "large"
  | "xlarge"
  | "xxlarge";

const SHORTLISTING_STRESS_SIZE: Record<
  Exclude<SentenceShortlistingInputProfile, "baseline" | "tiny" | "small">,
  number
> = {
  large: 280,
  xlarge: 1200,
  xxlarge: 4200
};

const TINY_SCENARIO_IDS = new Set([
  "fixture-article-basic",
  "repeated-content-blocks",
  "dynamic-rerender-same-hash"
]);

const SMALL_SCENARIO_IDS = new Set([
  "fixture-article-basic",
  "fixture-article-dynamic",
  "repeated-content-blocks",
  "phrase-hint-backfill",
  "longform-overflow-nodes",
  "dynamic-rerender-same-hash"
]);

export function resolveSentenceShortlistingInputProfile(
  value: string | null | undefined
): SentenceShortlistingInputProfile {
  const normalized = value?.trim().toLowerCase();

  if (
    normalized === "tiny" ||
    normalized === "small" ||
    normalized === "baseline" ||
    normalized === "large" ||
    normalized === "xlarge" ||
    normalized === "xxlarge"
  ) {
    return normalized;
  }

  return "baseline";
}

export function getSentenceShortlistingScenarios(
  profile: SentenceShortlistingInputProfile
): SentenceShortlistingScenario[] {
  if (profile === "baseline") {
    return SENTENCE_SHORTLISTING_SCENARIOS;
  }

  if (profile === "tiny") {
    return SENTENCE_SHORTLISTING_SCENARIOS.filter((scenario) =>
      TINY_SCENARIO_IDS.has(scenario.id)
    );
  }

  if (profile === "small") {
    return SENTENCE_SHORTLISTING_SCENARIOS.filter((scenario) =>
      SMALL_SCENARIO_IDS.has(scenario.id)
    );
  }

  const stressSentenceCount = SHORTLISTING_STRESS_SIZE[profile];
  const stressScenario = createGeneratedStressScenario(profile, stressSentenceCount);

  return [...SENTENCE_SHORTLISTING_SCENARIOS, stressScenario];
}

function createGeneratedStressScenario(
  profile: "large" | "xlarge" | "xxlarge",
  sentenceCount: number
): SentenceShortlistingScenario {
  const stressSentences = buildStressSentences(sentenceCount);
  const stressHtml = `<main>${stressSentences
    .map((sentence) => `<p>${sentence}</p>`)
    .join("")}</main>`;

  return {
    id: `generated-stress-${profile}`,
    label: `Generated stress scenario (${profile})`,
    source: `generated://sentence-shortlisting/${profile}`,
    urlPath: `/generated/sentence-shortlisting/${profile}.html`,
    passes: [
      {
        id: "generated-pass-1",
        label: "Generated stress corpus",
        html: stressHtml,
        usefulSentences: stressSentences.slice(0, Math.min(5, stressSentences.length))
      }
    ]
  };
}

function buildStressSentences(count: number): string[] {
  const baseSentences = [
    "As soon as we arrive at the station, we take care of tools before lunch.",
    "The quiet library opens early and the friendly guide shares simple lessons each morning.",
    "At least one volunteer reviews each route update before the weekly workshop begins.",
    "Neighbors shared helpful updates about the clean park and the local market downtown.",
    "The city team publishes short updates so new volunteers can plan a simple route.",
    "Officials added clearer signs and reduced long transfer waits for visitors."
  ];

  const output: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const sentence = baseSentences[index % baseSentences.length];
    const iteration = Math.floor(index / baseSentences.length) + 1;
    output.push(
      `${sentence.replace(/[.!?]+$/g, "")} (generated stress sample ${iteration}).`
    );
  }

  return output;
}

function createEntry(
  lexemeId: string,
  sourceLemma: string,
  targetLemma: string,
  pos: WordInventoryEntry["pos"],
  inflections?: string[]
): WordInventoryEntry {
  return {
    lexemeId,
    sourceLemma,
    targetLemma,
    pos,
    frequencyRank: 1000,
    confidence: 0.92,
    inflections
  };
}
