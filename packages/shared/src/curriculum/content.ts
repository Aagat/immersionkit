import type {
  CurriculumBand,
  PhraseCategory,
  PhraseSourceKind,
  SupportedPos,
  WordInventoryEntry
} from "../domain/models";
import {
  ENGLISH_SPANISH_COGNATE_POLICY,
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
import type { BeginnerCognatePolicy } from "../text/cognates";
import type { CurriculumDefinition } from "../language-pairs/types";
import { normalizeToken } from "../text/normalize";

type CurriculumWordEntry = Pick<
  WordInventoryEntry,
  | "sourceLemma"
  | "targetLemma"
  | "confidence"
  | "frequencyRank"
  | "pos"
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
  vocabularyExamples: readonly string[];
  allowedPartsOfSpeech: readonly SupportedPos[];
  cognatePatternIds: readonly string[];
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
  config: CurriculumConfig;
  definition?: CurriculumDefinition | null;
  beginnerCognatePolicy?: BeginnerCognatePolicy | null;
};

export type CurriculumContentInventoryDecision = {
  eligible: boolean;
  activeBandId: string | null;
  matchReason:
    | "frequency-rank"
    | "vocabulary-domain"
    | "beginner-cognate"
    | "phrase-inventory"
    | "render-unit-band"
    | "phrase-target-band"
    | null;
  skipReason:
    | "unknown-active-content"
    | "word-pos-outside-content"
    | "word-rank-outside-content"
    | "phrase-outside-content"
    | "render-unit-band-locked"
    | "phrase-target-band-locked"
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
    vocabularyExamples: [
      "person -> persona",
      "house -> casa",
      "water -> agua",
      "food -> comida",
      "friend -> amigo/amiga",
      "color -> color",
      "big -> grande",
      "good -> bueno/buena"
    ],
    allowedPartsOfSpeech: ["noun", "adjective", "adverb", "verb"],
    cognatePatternIds: ["cog-01-near-identical", "cog-02-final-e-descriptors"],
    vocabularyMaxFrequencyRank: 600,
    phraseChunks: ["at home", "right now", "a lot", "very good", "good idea", "clear adjective+noun spans"],
    phraseInventory: phraseInventory(
      ["at home", "right now", "a lot", "very good", "good idea"],
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
    vocabularyExamples: [
      "school -> escuela",
      "city -> ciudad",
      "morning -> mañana",
      "week -> semana",
      "mother -> madre",
      "sometimes -> a veces"
    ],
    allowedPartsOfSpeech: ["noun", "adjective", "adverb", "verb"],
    cognatePatternIds: ["cog-01-near-identical", "cog-02-final-e-descriptors"],
    vocabularyMaxFrequencyRank: 900,
    phraseChunks: ["in the morning", "on Monday", "at school", "this week", "sometimes", "every week", "literal noun chunks with connectors"],
    phraseInventory: phraseInventory(
      ["in the morning", "on Monday", "at school", "this week", "sometimes", "every week"],
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
    vocabularyExamples: [
      "activity -> actividad",
      "information -> información",
      "action -> acción",
      "pharmacy -> farmacia",
      "easy -> fácil",
      "much -> mucho/mucha"
    ],
    allowedPartsOfSpeech: ["noun", "adjective", "adverb", "verb"],
    cognatePatternIds: [
      "cog-01-near-identical",
      "cog-02-final-e-descriptors",
      "cog-03-tion-sion",
      "cog-06-ph-f"
    ],
    vocabularyMaxFrequencyRank: 1200,
    phraseChunks: ["of course", "for now", "not now", "little by little", "more or less", "simple noun chunks"],
    phraseInventory: phraseInventory(
      ["of course", "for now", "not now", "little by little", "more or less"],
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
    vocabularyDomains: ["routine contexts", "schedules", "movement", "locations", "errands"],
    vocabularyExamples: [
      "work -> trabajo",
      "routine -> rutina",
      "schedule -> horario",
      "store -> tienda",
      "appointment -> cita",
      "train -> tren"
    ],
    allowedPartsOfSpeech: ["noun", "adjective", "adverb", "verb"],
    cognatePatternIds: [
      "cog-01-near-identical",
      "cog-02-final-e-descriptors",
      "cog-03-tion-sion",
      "cog-06-ph-f"
    ],
    vocabularyMaxFrequencyRank: 1500,
    phraseChunks: ["every day", "on the way", "next week", "go to", "come from", "at work", "safe adjective+noun spans"],
    phraseInventory: phraseInventory(
      ["every day", "on the way", "next week", "go to", "come from", "at work"],
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
    vocabularyExamples: [
      "plan -> plan",
      "event -> evento",
      "message -> mensaje",
      "meeting -> reunión",
      "problem -> problema",
      "solution -> solución"
    ],
    allowedPartsOfSpeech: ["noun", "adjective", "adverb", "verb"],
    cognatePatternIds: [
      "cog-01-near-identical",
      "cog-02-final-e-descriptors",
      "cog-03-tion-sion",
      "cog-06-ph-f"
    ],
    vocabularyMaxFrequencyRank: 1800,
    phraseChunks: ["going to", "have to", "take care of", "make sure", "last night", "this afternoon", "modal carriers"],
    phraseInventory: phraseInventory(
      ["going to", "have to", "take care of", "make sure", "last night", "this afternoon"],
      ["fixed-idiom", "function-phrase", "grammar-carrier"],
      ["fixed-phrase", "pattern-match"]
    ),
    currentGrammarKeys: ["future:going-to", "modal:have-to", "modal:should"],
    plannedGrammarKeys: ["past:preterite-irregular", "time:sequence-basic"],
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
    vocabularyExamples: [
      "community -> comunidad",
      "activity -> actividad",
      "responsibility -> responsabilidad",
      "more -> más",
      "same -> mismo/misma",
      "hospital -> hospital"
    ],
    allowedPartsOfSpeech: ["noun", "adjective", "adverb", "verb"],
    cognatePatternIds: [
      "cog-01-near-identical",
      "cog-02-final-e-descriptors",
      "cog-03-tion-sion",
      "cog-04-ty-dad"
    ],
    vocabularyMaxFrequencyRank: 2100,
    phraseChunks: ["more than", "less than", "a few", "the same as", "the most", "as much as"],
    phraseInventory: phraseInventory(
      ["more than", "less than", "a few", "the same as", "the most", "as much as"],
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
      "descriptive language through context"
    ],
    vocabularyExamples: [
      "situation -> situación",
      "change -> cambio",
      "moment -> momento",
      "currently -> actualmente",
      "clearly -> claramente",
      "movement -> movimiento"
    ],
    allowedPartsOfSpeech: ["noun", "adjective", "adverb", "verb"],
    cognatePatternIds: [
      "cog-01-near-identical",
      "cog-03-tion-sion",
      "cog-04-ty-dad",
      "cog-05-ly-mente"
    ],
    vocabularyMaxFrequencyRank: 2400,
    phraseChunks: ["in the middle of", "on the way to", "right before", "while", "at the moment", "progressive chunks"],
    phraseInventory: phraseInventory(
      ["in the middle of", "on the way to", "right before", "while", "at the moment"],
      ["fixed-idiom", "function-phrase", "grammar-carrier"],
      ["fixed-phrase", "pattern-match"]
    ),
    currentGrammarKeys: ["clause:when-basic", "future:going-to"],
    plannedGrammarKeys: ["aspect:present-progressive"],
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
    vocabularyExamples: [
      "reason -> razón",
      "cause -> causa",
      "effect -> efecto",
      "story -> historia",
      "habit -> hábito",
      "experience -> experiencia"
    ],
    allowedPartsOfSpeech: ["noun", "adjective", "adverb", "verb"],
    cognatePatternIds: [
      "cog-03-tion-sion",
      "cog-04-ty-dad",
      "cog-05-ly-mente",
      "cog-10-false-friend-contrast"
    ],
    vocabularyMaxFrequencyRank: 2700,
    phraseChunks: ["because of", "after that", "at the end", "before that", "from time to time"],
    phraseInventory: phraseInventory(
      ["because of", "after that", "at the end", "before that", "from time to time"],
      ["fixed-idiom", "function-phrase", "noun-chunk"],
      ["fixed-phrase", "chunk"]
    ),
    currentGrammarKeys: ["aspect:used-to", "clause:because-basic", "clause:when-basic"],
    plannedGrammarKeys: ["aspect:past-progressive", "aspect:imperfect-background"],
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
    vocabularyExamples: [
      "article -> artículo",
      "project -> proyecto",
      "specialist -> especialista",
      "tourism -> turismo",
      "economic -> económico/económica",
      "purpose -> propósito"
    ],
    allowedPartsOfSpeech: ["noun", "adjective", "adverb", "verb"],
    cognatePatternIds: [
      "cog-03-tion-sion",
      "cog-05-ly-mente",
      "cog-07-ist-ism",
      "cog-08-ic-ical"
    ],
    vocabularyMaxFrequencyRank: 3000,
    phraseChunks: ["in order to", "as soon as", "used to", "according to", "in the same way"],
    phraseInventory: phraseInventory(
      ["in order to", "as soon as", "used to", "according to", "in the same way"],
      ["fixed-idiom", "function-phrase", "grammar-carrier", "noun-chunk"],
      ["fixed-phrase", "pattern-match", "chunk"]
    ),
    currentGrammarKeys: ["infinitive:purpose", "aspect:used-to", "future:going-to"],
    plannedGrammarKeys: ["gerund:recognition", "connector:sequence", "object-pronoun:direct-recognition"],
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
    vocabularyExamples: [
      "process -> proceso",
      "system -> sistema",
      "result -> resultado",
      "analysis -> análisis",
      "organization -> organización",
      "participation -> participación"
    ],
    allowedPartsOfSpeech: ["noun", "adjective", "adverb", "verb"],
    cognatePatternIds: [
      "cog-03-tion-sion",
      "cog-04-ty-dad",
      "cog-08-ic-ical",
      "cog-09-verb-families"
    ],
    vocabularyMaxFrequencyRank: 3400,
    phraseChunks: ["for example", "as a result", "in fact", "although", "in general", "for this reason"],
    phraseInventory: phraseInventory(
      ["for example", "as a result", "in fact", "although", "in general", "for this reason"],
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
    vocabularyExamples: [
      "opinion -> opinion",
      "argument -> argumento",
      "condition -> condición",
      "possibility -> posibilidad",
      "responsibility -> responsabilidad",
      "conclusion -> conclusión"
    ],
    allowedPartsOfSpeech: ["noun", "adjective", "adverb", "verb"],
    cognatePatternIds: [
      "cog-03-tion-sion",
      "cog-04-ty-dad",
      "cog-08-ic-ical",
      "cog-09-verb-families",
      "cog-10-false-friend-contrast"
    ],
    vocabularyMaxFrequencyRank: 3800,
    phraseChunks: ["on the other hand", "at least", "as well as", "however", "if possible", "in that case"],
    phraseInventory: phraseInventory(
      ["on the other hand", "at least", "as well as", "however", "if possible", "in that case"],
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
    plannedGrammarKeys: ["conditional:if-basic", "passive:agentless", "concession:contrast"],
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
    vocabularyExamples: [
      "institution -> institución",
      "culture -> cultura",
      "perspective -> perspectiva",
      "phenomenon -> fenómeno",
      "regulation -> regulación",
      "tendency -> tendencia"
    ],
    allowedPartsOfSpeech: ["noun", "adjective", "adverb", "verb"],
    cognatePatternIds: [
      "cog-03-tion-sion",
      "cog-04-ty-dad",
      "cog-07-ist-ism",
      "cog-08-ic-ical",
      "cog-09-verb-families"
    ],
    vocabularyMaxFrequencyRank: 4400,
    phraseChunks: ["in terms of", "with respect to", "to some extent", "given that", "despite this", "in practice"],
    phraseInventory: phraseInventory(
      ["in terms of", "with respect to", "to some extent", "given that", "despite this", "in practice"],
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
    vocabularyExamples: [
      "methodology -> metodología",
      "infrastructure -> infraestructura",
      "sustainability -> sostenibilidad",
      "hypothesis -> hipótesis",
      "interpretation -> interpretación",
      "criterion -> criterio"
    ],
    allowedPartsOfSpeech: ["noun", "adjective", "adverb", "verb"],
    cognatePatternIds: [
      "cog-03-tion-sion",
      "cog-04-ty-dad",
      "cog-07-ist-ism",
      "cog-08-ic-ical",
      "cog-09-verb-families",
      "cog-10-false-friend-contrast"
    ],
    vocabularyMaxFrequencyRank: 5000,
    phraseChunks: ["as opposed to", "in light of", "for the sake of", "nevertheless", "provided that", "in retrospect"],
    phraseInventory: phraseInventory(
      ["as opposed to", "in light of", "for the sake of", "nevertheless", "provided that", "in retrospect"],
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
  definition?: CurriculumDefinition | null;
  beginnerCognatePolicy?: BeginnerCognatePolicy | null;
  unitType?: CurriculumGateUnitType;
}): ActiveCurriculumContent {
  const definition = input?.definition ?? null;
  const config = resolveCurriculumConfig(
    input?.config ?? definition?.config ?? DEFAULT_CURRICULUM_CONFIG
  );
  const band = resolveActiveCurriculumBand(
    config,
    input?.unitType ?? "word",
    input?.profile
  );

  return {
    band,
    content: getCurriculumContentForBand(
      band?.bandId,
      input?.content ?? definition?.content
    ),
    config,
    definition,
    beginnerCognatePolicy:
      input && "beginnerCognatePolicy" in input
        ? input.beginnerCognatePolicy
        : definition
          ? null
          : ENGLISH_SPANISH_COGNATE_POLICY
  };
}

export function evaluateWordCurriculumContentInventory(input: {
  wordEntry: CurriculumWordEntry;
  activeContent: ActiveCurriculumContent;
  beginnerCognatePolicy?: BeginnerCognatePolicy | null;
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

  if (!content.allowedPartsOfSpeech.includes(input.wordEntry.pos)) {
    return {
      eligible: false,
      activeBandId,
      matchReason: null,
      skipReason: "word-pos-outside-content"
    };
  }

  if (input.wordEntry.renderUnitMinBand) {
    if (
      !isRenderUnitBandEligible(input.wordEntry.renderUnitMinBand, input.activeContent)
    ) {
      return {
        eligible: false,
        activeBandId,
        matchReason: null,
        skipReason: "render-unit-band-locked"
      };
    }
  }

  if (wordMatchesVocabularyExamples(input.wordEntry, content)) {
    return {
      eligible: true,
      activeBandId,
      matchReason: "vocabulary-domain",
      skipReason: null
    };
  }

  const frequencyRank = input.wordEntry.frequencyRank;
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

  const beginnerCognatePolicy =
    input.beginnerCognatePolicy === undefined
      ? input.activeContent.beginnerCognatePolicy === undefined
        ? ENGLISH_SPANISH_COGNATE_POLICY
        : input.activeContent.beginnerCognatePolicy
      : input.beginnerCognatePolicy;

  if (
    beginnerCognatePolicy &&
    beginnerCognatePolicy.isEligibleBand(activeBandId) &&
    isBeginnerConfidenceCognate(input.wordEntry, beginnerCognatePolicy)
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
  phraseMinBand?: string;
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

  if (input.phraseMinBand) {
    if (isRenderUnitBandEligible(input.phraseMinBand, input.activeContent)) {
      return {
        eligible: true,
        activeBandId,
        matchReason: "phrase-target-band",
        skipReason: null
      };
    }

    return {
      eligible: false,
      activeBandId,
      matchReason: null,
      skipReason: "phrase-target-band-locked"
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

function wordMatchesVocabularyExamples(
  wordEntry: CurriculumWordEntry,
  content: CurriculumBandContent
): boolean {
  const source = normalizeToken(wordEntry.sourceLemma);
  const target = normalizeToken(wordEntry.targetLemma);
  if (!source && !target) {
    return false;
  }

  return content.vocabularyExamples.some((example) => {
    const [exampleSource, exampleTarget = ""] = example.split("->", 2);
    const normalizedSource = normalizeToken(exampleSource ?? "");
    const normalizedTarget = normalizeToken(exampleTarget.split("/")[0] ?? "");
    return (
      (source.length > 0 && source === normalizedSource) ||
      (target.length > 0 && target === normalizedTarget)
    );
  });
}

function isRenderUnitBandEligible(
  minBandId: string,
  activeContent: ActiveCurriculumContent
): boolean {
  const activeOrder = activeContent.band?.order;
  const minOrder = activeContent.config.bands.find(
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
