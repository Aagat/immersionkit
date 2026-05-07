import type {
  CurriculumBand,
  PhraseCategory,
  PhraseSourceKind,
  SeedLexiconEntry
} from "../domain/models";
import {
  isBeginnerCognateBand,
  isBeginnerConfidenceCognate
} from "../text/cognates";
import { normalizePhraseText } from "../text/phrases";
import {
  DEFAULT_CURRICULUM_CONFIG,
  resolveActiveCurriculumBand,
  resolveCurriculumConfig,
  type CurriculumConfig,
  type CurriculumGateUnitType,
  type CurriculumRuntimeProfileInput
} from "./config";

type CurriculumWordEntry = Pick<
  SeedLexiconEntry,
  | "sourceLemma"
  | "targetLemma"
  | "confidence"
  | "frequencyRank"
  | "sourceLanguage"
  | "targetLanguage"
> & {
  renderUnitMinBand?: string;
};

export type SentenceComplexityPolicy = {
  tokenRange: readonly [number, number];
  clausePolicy: string;
  targetPolicy: string;
  notes: string;
};

export type CurriculumBandContent = {
  bandId: string;
  vocabularyDomains: readonly string[];
  vocabularyMaxFrequencyRank: number;
  phraseChunks: readonly string[];
  phraseInventory: {
    exactSourceTexts: readonly string[];
    allowedCategories: readonly PhraseCategory[];
    allowedSourceKinds: readonly PhraseSourceKind[];
  };
  currentGrammarKeys: readonly string[];
  plannedGrammarKeys: readonly string[];
  sentencePolicy: SentenceComplexityPolicy;
};

export type ActiveCurriculumContent = {
  band: CurriculumBand | null;
  content: CurriculumBandContent | null;
};

export type CurriculumContentInventoryDecision = {
  eligible: boolean;
  activeBandId: string | null;
  matchReason:
    | "frequency-rank"
    | "beginner-cognate"
    | "phrase-inventory"
    | "render-unit-band"
    | null;
  skipReason:
    | "unknown-active-content"
    | "word-rank-outside-content"
    | "phrase-outside-content"
    | "render-unit-band-locked"
    | null;
};

export const DEFAULT_CURRICULUM_CONTENT: readonly CurriculumBandContent[] = [
  {
    bandId: "level-1a",
    vocabularyDomains: [
      "people",
      "home",
      "food",
      "common objects",
      "colors",
      "size",
      "quality"
    ],
    vocabularyMaxFrequencyRank: 600,
    phraseChunks: ["at home", "right now", "a lot", "clear adjective+noun spans"],
    phraseInventory: phraseInventory(
      ["at home", "right now", "a lot"],
      ["adjective-noun"],
      ["fixed-phrase", "pattern-match"]
    ),
    currentGrammarKeys: [],
    plannedGrammarKeys: ["copula:be", "existential:there-is", "negation:basic-not"],
    sentencePolicy: {
      tokenRange: [5, 8],
      clausePolicy: "single clause",
      targetPolicy: "0-1 target",
      notes: "Concrete, very low ambiguity sentences."
    }
  },
  {
    bandId: "level-1b",
    vocabularyDomains: [
      "places",
      "days",
      "time words",
      "weather",
      "family",
      "frequency adverbs"
    ],
    vocabularyMaxFrequencyRank: 900,
    phraseChunks: ["in the morning", "on Monday", "at school", "literal noun chunks with connectors"],
    phraseInventory: phraseInventory(
      ["in the morning", "on Monday", "at school"],
      ["fixed-idiom", "function-phrase"],
      ["fixed-phrase"]
    ),
    currentGrammarKeys: [],
    plannedGrammarKeys: ["question:basic-wh", "present:simple", "adverb:frequency"],
    sentencePolicy: {
      tokenRange: [5, 9],
      clausePolicy: "single clause",
      targetPolicy: "0-1 target",
      notes: "Low ambiguity with clear time or place anchoring."
    }
  },
  {
    bandId: "level-1c",
    vocabularyDomains: ["routines", "descriptive contrasts", "common environments", "Level 1 review"],
    vocabularyMaxFrequencyRank: 1200,
    phraseChunks: ["of course", "for now", "simple noun chunks"],
    phraseInventory: phraseInventory(
      ["of course", "for now"],
      ["fixed-idiom", "function-phrase", "noun-chunk"],
      ["fixed-phrase", "chunk"]
    ),
    currentGrammarKeys: [],
    plannedGrammarKeys: ["negation:do-not", "imperative:basic", "determiner:quantity-basic"],
    sentencePolicy: {
      tokenRange: [6, 10],
      clausePolicy: "single clause",
      targetPolicy: "consolidation before checkpoint",
      notes: "Safe review contexts before the first level boundary."
    }
  },
  {
    bandId: "level-2a",
    vocabularyDomains: ["routine actions", "schedules", "movement", "locations", "errands"],
    vocabularyMaxFrequencyRank: 1500,
    phraseChunks: ["every day", "on the way", "next week", "safe adjective+noun spans"],
    phraseInventory: phraseInventory(
      ["every day", "on the way", "next week"],
      ["function-phrase", "adjective-noun"],
      ["fixed-phrase", "pattern-match"]
    ),
    currentGrammarKeys: ["modal:can"],
    plannedGrammarKeys: ["past:simple-regular", "future:will", "preposition:place-basic"],
    sentencePolicy: {
      tokenRange: [6, 12],
      clausePolicy: "mostly single clause",
      targetPolicy: "1-2 targets",
      notes: "Clear routine contexts with conservative modal use."
    }
  },
  {
    bandId: "level-2b",
    vocabularyDomains: ["past events", "future plans", "logistics", "social interactions"],
    vocabularyMaxFrequencyRank: 1800,
    phraseChunks: ["take care of", "make sure", "modal carriers"],
    phraseInventory: phraseInventory(
      ["take care of", "make sure", "going to"],
      ["fixed-idiom", "function-phrase", "grammar-carrier"],
      ["fixed-phrase", "pattern-match"]
    ),
    currentGrammarKeys: ["future:going-to", "modal:should"],
    plannedGrammarKeys: ["past:simple-irregular", "modal:have-to", "time:sequence-basic"],
    sentencePolicy: {
      tokenRange: [7, 12],
      clausePolicy: "event-based single clause",
      targetPolicy: "clear time anchoring",
      notes: "Past and future meanings should be locally obvious."
    }
  },
  {
    bandId: "level-2c",
    vocabularyDomains: ["comparison", "quantity", "travel-adjacent words", "community vocabulary"],
    vocabularyMaxFrequencyRank: 2100,
    phraseChunks: ["more than", "a few", "the same as"],
    phraseInventory: phraseInventory(
      ["more than", "a few", "the same as"],
      ["fixed-idiom", "function-phrase", "grammar-carrier"],
      ["fixed-phrase", "pattern-match"]
    ),
    currentGrammarKeys: ["modal:can", "modal:should"],
    plannedGrammarKeys: ["comparison:comparative", "comparison:superlative", "future:plan-basic"],
    sentencePolicy: {
      tokenRange: [8, 13],
      clausePolicy: "low subordination",
      targetPolicy: "checkpoint preparation",
      notes: "Comparison and quantity chunks can stretch the sentence slightly."
    }
  },
  {
    bandId: "level-3a",
    vocabularyDomains: [
      "ongoing activity",
      "movement/change",
      "situations",
      "descriptive verbs through context"
    ],
    vocabularyMaxFrequencyRank: 2400,
    phraseChunks: ["in the middle of", "on the way to", "progressive chunks"],
    phraseInventory: phraseInventory(
      ["in the middle of", "on the way to"],
      ["fixed-idiom", "function-phrase", "grammar-carrier"],
      ["fixed-phrase", "pattern-match"]
    ),
    currentGrammarKeys: ["future:going-to"],
    plannedGrammarKeys: ["aspect:present-progressive", "clause:when-basic"],
    sentencePolicy: {
      tokenRange: [8, 15],
      clausePolicy: "one light subordinate or time clause allowed",
      targetPolicy: "one stretch feature",
      notes: "Short connected contexts can begin to appear."
    }
  },
  {
    bandId: "level-3b",
    vocabularyDomains: ["short narratives", "cause/effect", "time sequencing", "richer collocations"],
    vocabularyMaxFrequencyRank: 2700,
    phraseChunks: ["because of", "after that", "at the end"],
    phraseInventory: phraseInventory(
      ["because of", "after that", "at the end"],
      ["fixed-idiom", "function-phrase", "noun-chunk"],
      ["fixed-phrase", "chunk"]
    ),
    currentGrammarKeys: ["aspect:used-to"],
    plannedGrammarKeys: ["aspect:past-progressive", "clause:because-basic", "clause:when-basic"],
    sentencePolicy: {
      tokenRange: [9, 16],
      clausePolicy: "short narrative flow",
      targetPolicy: "one stretch feature",
      notes: "Cause and time links are acceptable when the sentence stays scan-friendly."
    }
  },
  {
    bandId: "level-3c",
    vocabularyDomains: ["work", "media", "travel", "daily-life stories", "early abstract description"],
    vocabularyMaxFrequencyRank: 3000,
    phraseChunks: ["in order to", "as soon as", "used to"],
    phraseInventory: phraseInventory(
      ["in order to", "as soon as", "used to"],
      ["fixed-idiom", "function-phrase", "grammar-carrier", "noun-chunk"],
      ["fixed-phrase", "pattern-match", "chunk"]
    ),
    currentGrammarKeys: ["aspect:used-to", "future:going-to"],
    plannedGrammarKeys: ["gerund:subject-or-object", "infinitive:purpose", "connector:sequence"],
    sentencePolicy: {
      tokenRange: [10, 17],
      clausePolicy: "light subordination",
      targetPolicy: "Level 3 checkpoint preparation",
      notes: "Purpose and sequence chunks can carry more of the lesson."
    }
  },
  {
    bandId: "level-4a",
    vocabularyDomains: [
      "explanation",
      "process",
      "systems",
      "comparison",
      "opinion vocabulary"
    ],
    vocabularyMaxFrequencyRank: 3400,
    phraseChunks: ["for example", "as a result", "in fact"],
    phraseInventory: phraseInventory(
      ["for example", "as a result", "in fact"],
      ["fixed-idiom", "function-phrase", "adjective-noun", "noun-chunk"],
      ["fixed-phrase", "pattern-match", "chunk"]
    ),
    currentGrammarKeys: ["aspect:have-been"],
    plannedGrammarKeys: ["passive:be-plus-participle", "present-perfect:basic", "contrast:although"],
    sentencePolicy: {
      tokenRange: [10, 20],
      clausePolicy: "multi-clause allowed",
      targetPolicy: "bounded stretch",
      notes: "Explanation prose is allowed when still scan-friendly."
    }
  },
  {
    bandId: "level-4b",
    vocabularyDomains: [
      "opinion/evidence",
      "passive recognition",
      "conditional reasoning",
      "abstract nouns"
    ],
    vocabularyMaxFrequencyRank: 3800,
    phraseChunks: ["on the other hand", "at least", "as well as"],
    phraseInventory: phraseInventory(
      ["on the other hand", "at least", "as well as"],
      [
        "fixed-idiom",
        "function-phrase",
        "grammar-carrier",
        "adjective-noun",
        "noun-chunk"
      ],
      ["fixed-phrase", "pattern-match", "chunk"]
    ),
    currentGrammarKeys: ["aspect:have-been", "modal:*"],
    plannedGrammarKeys: ["conditional:if-basic", "passive:agentless", "concession:however"],
    sentencePolicy: {
      tokenRange: [12, 22],
      clausePolicy: "abstract multi-clause prose",
      targetPolicy: "Level 4 checkpoint preparation",
      notes: "Reasoning chunks and argument markers become appropriate."
    }
  },
  {
    bandId: "level-5a",
    vocabularyDomains: [
      "editorial",
      "analytical",
      "institutional",
      "cultural",
      "academic-adjacent terms"
    ],
    vocabularyMaxFrequencyRank: 4400,
    phraseChunks: ["in terms of", "with respect to", "to some extent"],
    phraseInventory: phraseInventory(
      ["in terms of", "with respect to", "to some extent"],
      [
        "fixed-idiom",
        "function-phrase",
        "grammar-carrier",
        "adjective-noun",
        "noun-chunk"
      ],
      ["fixed-phrase", "pattern-match", "chunk"]
    ),
    currentGrammarKeys: ["all current keys as review"],
    plannedGrammarKeys: ["subordination:relative-clause", "reported-speech:basic", "perfect:contrast"],
    sentencePolicy: {
      tokenRange: [12, 26],
      clausePolicy: "varied multi-clause native prose",
      targetPolicy: "adaptive review",
      notes: "Native patterns broaden while overload controls remain active."
    }
  },
  {
    bandId: "level-5b",
    vocabularyDomains: [
      "broad domain expansion",
      "specialized interests",
      "long-term weak-point review"
    ],
    vocabularyMaxFrequencyRank: 5000,
    phraseChunks: ["as opposed to", "in light of", "for the sake of"],
    phraseInventory: phraseInventory(
      ["as opposed to", "in light of", "for the sake of"],
      [
        "fixed-idiom",
        "function-phrase",
        "grammar-carrier",
        "adjective-noun",
        "noun-chunk"
      ],
      ["fixed-phrase", "pattern-match", "chunk"]
    ),
    currentGrammarKeys: ["all current keys as adaptive review"],
    plannedGrammarKeys: ["conditional:advanced", "subordination:embedded", "discourse:stance-marker"],
    sentencePolicy: {
      tokenRange: [14, 30],
      clausePolicy: "broad native reading",
      targetPolicy: "overload-controlled weak point review",
      notes: "Longer native sentences are acceptable when ranking keeps them manageable."
    }
  }
] as const;

export function getCurriculumContentForBand(
  bandId: string | null | undefined,
  content: readonly CurriculumBandContent[] = DEFAULT_CURRICULUM_CONTENT
): CurriculumBandContent | null {
  if (!bandId) {
    return null;
  }

  return content.find((entry) => entry.bandId === bandId) ?? null;
}

export function getActiveCurriculumContent(input?: {
  config?: Partial<CurriculumConfig> | null;
  profile?: CurriculumRuntimeProfileInput | null;
  content?: readonly CurriculumBandContent[];
  unitType?: CurriculumGateUnitType;
}): ActiveCurriculumContent {
  const config = resolveCurriculumConfig(input?.config ?? DEFAULT_CURRICULUM_CONFIG);
  const band = resolveActiveCurriculumBand(
    config,
    input?.unitType ?? "word",
    input?.profile
  );

  return {
    band,
    content: getCurriculumContentForBand(band?.bandId, input?.content)
  };
}

export function evaluateWordCurriculumContentInventory(input: {
  lexiconEntry: CurriculumWordEntry;
  activeContent: ActiveCurriculumContent;
}): CurriculumContentInventoryDecision {
  const activeBandId = input.activeContent.band?.bandId ?? null;
  const content = input.activeContent.content;
  if (!activeBandId || !content) {
    return {
      eligible: false,
      activeBandId,
      matchReason: null,
      skipReason: "unknown-active-content"
    };
  }

  if (input.lexiconEntry.renderUnitMinBand) {
    if (
      isRenderUnitBandEligible(input.lexiconEntry.renderUnitMinBand, input.activeContent)
    ) {
      return {
        eligible: true,
        activeBandId,
        matchReason: "render-unit-band",
        skipReason: null
      };
    }

    return {
      eligible: false,
      activeBandId,
      matchReason: null,
      skipReason: "render-unit-band-locked"
    };
  }

  const frequencyRank = input.lexiconEntry.frequencyRank;
  const rankIsInBand =
    typeof frequencyRank === "number" &&
    Number.isFinite(frequencyRank) &&
    frequencyRank >= 1 &&
    frequencyRank <= content.vocabularyMaxFrequencyRank;
  if (rankIsInBand) {
    return {
      eligible: true,
      activeBandId,
      matchReason: "frequency-rank",
      skipReason: null
    };
  }

  if (
    isBeginnerCognateBand(activeBandId) &&
    isBeginnerConfidenceCognate(input.lexiconEntry)
  ) {
    return {
      eligible: true,
      activeBandId,
      matchReason: "beginner-cognate",
      skipReason: null
    };
  }

  return {
    eligible: false,
    activeBandId,
    matchReason: null,
    skipReason: "word-rank-outside-content"
  };
}

export function evaluatePhraseCurriculumContentInventory(input: {
  sourceText: string;
  sourceKind: PhraseSourceKind;
  category: PhraseCategory;
  renderUnitMinBand?: string;
  activeContent: ActiveCurriculumContent;
}): CurriculumContentInventoryDecision {
  const activeBandId = input.activeContent.band?.bandId ?? null;
  const content = input.activeContent.content;
  if (!activeBandId || !content) {
    return {
      eligible: false,
      activeBandId,
      matchReason: null,
      skipReason: "unknown-active-content"
    };
  }

  if (input.renderUnitMinBand) {
    if (isRenderUnitBandEligible(input.renderUnitMinBand, input.activeContent)) {
      return {
        eligible: true,
        activeBandId,
        matchReason: "render-unit-band",
        skipReason: null
      };
    }

    return {
      eligible: false,
      activeBandId,
      matchReason: null,
      skipReason: "render-unit-band-locked"
    };
  }

  const normalizedSourceText = normalizePhraseText(input.sourceText);
  const exactSourceTexts = new Set(
    content.phraseInventory.exactSourceTexts.map((phrase) => normalizePhraseText(phrase))
  );
  const exactMatchAllowed = exactSourceTexts.has(normalizedSourceText);
  const ruleFamilyAllowed =
    content.phraseInventory.allowedCategories.includes(input.category) &&
    content.phraseInventory.allowedSourceKinds.includes(input.sourceKind);

  if (!exactMatchAllowed && !ruleFamilyAllowed) {
    return {
      eligible: false,
      activeBandId,
      matchReason: null,
      skipReason: "phrase-outside-content"
    };
  }

  return {
    eligible: true,
    activeBandId,
    matchReason: "phrase-inventory",
    skipReason: null
  };
}

function isRenderUnitBandEligible(
  minBandId: string,
  activeContent: ActiveCurriculumContent
): boolean {
  const activeOrder = activeContent.band?.order;
  const minOrder = DEFAULT_CURRICULUM_CONFIG.bands.find(
    (band) => band.bandId === minBandId
  )?.order;

  return (
    typeof activeOrder === "number" &&
    typeof minOrder === "number" &&
    activeOrder >= minOrder
  );
}

function phraseInventory(
  exactSourceTexts: readonly string[],
  allowedCategories: readonly PhraseCategory[],
  allowedSourceKinds: readonly PhraseSourceKind[]
): CurriculumBandContent["phraseInventory"] {
  return {
    exactSourceTexts,
    allowedCategories,
    allowedSourceKinds
  };
}
