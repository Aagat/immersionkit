import { buildLearningItemId } from "../domain/learning-items";
import type {
  CurriculumBand,
  GrammarFeatureMatch,
  LearningItem,
  SentenceAnalysisEntry,
  TokenSpan
} from "../domain/models";
import { shouldReceiveDueReviewBoost } from "../scoring/scheduler";
import {
  getActiveCurriculumContent,
  type CurriculumBandContent
} from "./content";
import {
  resolveActiveCurriculumBand,
  resolveCurriculumConfig,
  type CurriculumConfig,
  type CurriculumRuntimeProfileInput
} from "./config";

export type GrammarCurriculumStatus = "focus" | "review" | "stretch" | "suppress";

export type GrammarConceptExample = {
  source: string;
  target: string;
};

export type GrammarConcept = {
  conceptId: string;
  featureKeys: readonly string[];
  minBand: string;
  reviewBands?: readonly string[];
  title: string;
  learnerSummary: string;
  sourcePatternLabel: string;
  targetPatternLabel: string;
  examples: readonly GrammarConceptExample[];
  displayPolicy: {
    allowStretch: boolean;
    maxCardsPerSentence?: number;
  };
  exposurePolicy: {
    itemType: "grammar-feature";
    countOnCardOpen: boolean;
    countOnDwell: boolean;
  };
  prerequisites?: readonly string[];
  suppressUntilTranslation?: boolean;
};

export type GrammarCurriculumDecision = {
  eligible: boolean;
  status: GrammarCurriculumStatus;
  reason:
    | "current-band-focus"
    | "minimum-band-focus"
    | "earlier-band-review"
    | "listed-review-band"
    | "near-future-stretch"
    | "unknown-concept"
    | "below-confidence"
    | "translation-required"
    | "above-stretch-band"
    | "inactive-band";
  configId: string;
  activeBand: CurriculumBand | null;
  activeBandId: string | null;
  concept: GrammarConcept | null;
  conceptId: string | null;
  featureKey: string;
  confidence: number;
};

export type GrammarFeatureForCard = Pick<
  GrammarFeatureMatch,
  "featureKey" | "label" | "sourceText" | "span" | "confidence"
> &
  Partial<
    Pick<
      GrammarFeatureMatch,
      "featureId" | "category" | "normalizedSourceText" | "evidence"
    >
  >;

export type SentenceGrammarCard = {
  conceptId: string;
  featureKey: string;
  sentenceHash: string;
  sourceSpan: TokenSpan;
  sourceText: string;
  title: string;
  explanation: string;
  sourcePatternLabel: string;
  targetPatternLabel: string;
  exampleMapping: string | null;
  curriculumReason: string;
  bandId: string;
  curriculumStatus: Exclude<GrammarCurriculumStatus, "suppress">;
  exposureItemId: string;
  confidence: number;
};

export type ResolveSentenceGrammarCardsInput = {
  entry?: Pick<
    SentenceAnalysisEntry,
    "sentenceHash" | "grammarFeatures" | "sourceText"
  > | null;
  sentenceHash?: string | null;
  features?: readonly GrammarFeatureForCard[] | null;
  config?: Partial<CurriculumConfig> | null;
  profile?: CurriculumRuntimeProfileInput | null;
  learningItemsByUnitRefId?: ReadonlyMap<string, LearningItem> | null;
  translatedText?: string | null;
};

export const DEFAULT_GRAMMAR_CONCEPTS: readonly GrammarConcept[] = [
  {
    conceptId: "gr-201-can-ability",
    featureKeys: ["modal:can"],
    minBand: "level-2a",
    title: "Ability with can",
    learnerSummary:
      "English can + verb often maps to Spanish poder + infinitive.",
    sourcePatternLabel: "can + verb",
    targetPatternLabel: "poder + infinitive",
    examples: [
      { source: "can go", target: "puede ir" },
      { source: "can help", target: "puede ayudar" }
    ],
    displayPolicy: { allowStretch: true },
    exposurePolicy: {
      itemType: "grammar-feature",
      countOnCardOpen: true,
      countOnDwell: true
    }
  },
  {
    conceptId: "gr-202-going-to-future",
    featureKeys: ["future:going-to"],
    minBand: "level-2b",
    title: "Future plans with going to",
    learnerSummary:
      "English uses going to for future plans. Spanish often uses ir a + infinitive.",
    sourcePatternLabel: "be + going to + verb",
    targetPatternLabel: "ir a + infinitive",
    examples: [
      { source: "is going to call", target: "va a llamar" },
      { source: "am going to leave", target: "voy a salir" }
    ],
    displayPolicy: { allowStretch: true },
    exposurePolicy: {
      itemType: "grammar-feature",
      countOnCardOpen: true,
      countOnDwell: true
    }
  },
  {
    conceptId: "gr-203-have-to-obligation",
    featureKeys: ["modal:have-to"],
    minBand: "level-2b",
    title: "Obligation with have to",
    learnerSummary:
      "Have to + verb expresses obligation. Spanish often uses tener que + infinitive.",
    sourcePatternLabel: "have to + verb",
    targetPatternLabel: "tener que + infinitive",
    examples: [
      { source: "have to work", target: "tengo que trabajar" },
      { source: "has to wait", target: "tiene que esperar" }
    ],
    displayPolicy: { allowStretch: true },
    exposurePolicy: {
      itemType: "grammar-feature",
      countOnCardOpen: true,
      countOnDwell: true
    }
  },
  {
    conceptId: "gr-204-should-advice",
    featureKeys: ["modal:should"],
    minBand: "level-2b",
    title: "Advice with should",
    learnerSummary:
      "Should + verb often maps to deberia + infinitive for advice or expectation.",
    sourcePatternLabel: "should + verb",
    targetPatternLabel: "deberia + infinitive",
    examples: [
      { source: "should rest", target: "deberia descansar" },
      { source: "should know", target: "deberia saber" }
    ],
    displayPolicy: { allowStretch: true },
    exposurePolicy: {
      itemType: "grammar-feature",
      countOnCardOpen: true,
      countOnDwell: true
    }
  },
  {
    conceptId: "gr-301-when-clauses",
    featureKeys: ["clause:when-basic"],
    minBand: "level-3a",
    title: "Time clauses with when",
    learnerSummary:
      "When often maps to cuando. It links an action to a time or condition.",
    sourcePatternLabel: "when + clause",
    targetPatternLabel: "cuando + clause",
    examples: [
      { source: "when I arrive", target: "cuando llegue" },
      { source: "when she speaks", target: "cuando ella habla" }
    ],
    displayPolicy: { allowStretch: true },
    exposurePolicy: {
      itemType: "grammar-feature",
      countOnCardOpen: true,
      countOnDwell: true
    }
  },
  {
    conceptId: "gr-302-used-to-habit",
    featureKeys: ["aspect:used-to"],
    minBand: "level-3b",
    title: "Past habits with used to",
    learnerSummary:
      "English used to describes a past habit. Spanish often uses the imperfect tense or solia + infinitive.",
    sourcePatternLabel: "used to + verb",
    targetPatternLabel: "imperfect tense or solia + infinitive",
    examples: [
      { source: "used to live", target: "vivia / solia vivir" },
      { source: "used to play", target: "jugaba / solia jugar" }
    ],
    displayPolicy: { allowStretch: true },
    exposurePolicy: {
      itemType: "grammar-feature",
      countOnCardOpen: true,
      countOnDwell: true
    }
  },
  {
    conceptId: "gr-303-because-cause",
    featureKeys: ["clause:because-basic"],
    minBand: "level-3b",
    title: "Cause with because",
    learnerSummary:
      "Because gives a reason. Spanish often uses porque for this link.",
    sourcePatternLabel: "because + clause",
    targetPatternLabel: "porque + clause",
    examples: [
      { source: "because I was tired", target: "porque estaba cansado" },
      { source: "because it rained", target: "porque llovio" }
    ],
    displayPolicy: { allowStretch: true },
    exposurePolicy: {
      itemType: "grammar-feature",
      countOnCardOpen: true,
      countOnDwell: true
    }
  },
  {
    conceptId: "gr-304-purpose-in-order-to",
    featureKeys: ["infinitive:purpose", "phrase:in-order-to"],
    minBand: "level-3c",
    title: "Purpose with in order to",
    learnerSummary:
      "English in order to usually shows purpose. Spanish often uses para + infinitive.",
    sourcePatternLabel: "in order to + verb",
    targetPatternLabel: "para + infinitive",
    examples: [
      { source: "in order to learn", target: "para aprender" },
      { source: "to ask", target: "para preguntar" }
    ],
    displayPolicy: { allowStretch: true },
    exposurePolicy: {
      itemType: "grammar-feature",
      countOnCardOpen: true,
      countOnDwell: true
    }
  },
  {
    conceptId: "gr-401-have-been-perfect",
    featureKeys: ["aspect:have-been"],
    minBand: "level-4a",
    title: "Ongoing result with have been",
    learnerSummary:
      "Have been connects the past to the present. Spanish often uses haber forms, or haber estado + gerund, depending on context.",
    sourcePatternLabel: "have/has been + phrase",
    targetPatternLabel: "haber + participle, or haber estado + gerund",
    examples: [
      { source: "have been working", target: "he estado trabajando" },
      { source: "has been here", target: "ha estado aqui" }
    ],
    displayPolicy: { allowStretch: false, maxCardsPerSentence: 1 },
    exposurePolicy: {
      itemType: "grammar-feature",
      countOnCardOpen: true,
      countOnDwell: true
    }
  },
  plannedGrammarConcept({
    conceptId: "gr-101-gender-articles",
    featureKeys: ["article:gender-basic", "determiner:article-gender"],
    minBand: "level-1a",
    title: "Noun gender and articles",
    learnerSummary:
      "Spanish nouns often appear with articles like el, la, un, and una.",
    sourcePatternLabel: "English noun with a/an/the",
    targetPatternLabel: "el/la/un/una + noun",
    examples: [{ source: "the house", target: "la casa" }],
    suppressUntilTranslation: true
  }),
  plannedGrammarConcept({
    conceptId: "gr-102-adjective-agreement",
    featureKeys: ["adjective:agreement-basic"],
    minBand: "level-1a",
    title: "Basic adjective agreement",
    learnerSummary:
      "Spanish adjectives can change form to match the noun they describe.",
    sourcePatternLabel: "adjective + noun",
    targetPatternLabel: "noun + adjective ending",
    examples: [{ source: "red book", target: "libro rojo" }],
    suppressUntilTranslation: true
  }),
  plannedGrammarConcept({
    conceptId: "gr-103-ser-estar-recognition",
    featureKeys: ["copula:be", "copula:ser-estar-recognition"],
    minBand: "level-1a",
    title: "Identity and description with to be",
    learnerSummary:
      "Spanish has more than one common way to translate forms of to be.",
    sourcePatternLabel: "be + description",
    targetPatternLabel: "ser or estar + description",
    examples: [{ source: "is ready", target: "esta listo" }],
    suppressUntilTranslation: true
  }),
  plannedGrammarConcept({
    conceptId: "gr-104-existence-hay",
    featureKeys: ["existential:there-is", "existential:hay"],
    minBand: "level-1a",
    title: "Existence with hay",
    learnerSummary:
      "There is and there are often map to hay in Spanish.",
    sourcePatternLabel: "there is / there are",
    targetPatternLabel: "hay",
    examples: [{ source: "there is a table", target: "hay una mesa" }]
  }),
  plannedGrammarConcept({
    conceptId: "gr-105-basic-negation",
    featureKeys: ["negation:basic-not", "negation:basic-no", "negation:do-not"],
    minBand: "level-1c",
    title: "Basic negation with no",
    learnerSummary:
      "Spanish often places no before the verb to make a sentence negative.",
    sourcePatternLabel: "not / do not + verb",
    targetPatternLabel: "no + verb",
    examples: [{ source: "do not go", target: "no va" }]
  }),
  plannedGrammarConcept({
    conceptId: "gr-106-basic-questions",
    featureKeys: ["question:basic-wh"],
    minBand: "level-1b",
    title: "Basic question words",
    learnerSummary:
      "Question words like what, who, where, and when map to Spanish words such as que, quien, donde, and cuando.",
    sourcePatternLabel: "wh-question word",
    targetPatternLabel: "que/quien/donde/cuando",
    examples: [{ source: "where is it", target: "donde esta" }]
  }),
  plannedGrammarConcept({
    conceptId: "gr-205-present-routines",
    featureKeys: ["present:routine-verbs", "present:simple"],
    minBand: "level-2a",
    title: "Present-tense routines",
    learnerSummary:
      "Routine actions often use present-tense verb forms in Spanish.",
    sourcePatternLabel: "present verb",
    targetPatternLabel: "present-tense verb",
    examples: [{ source: "she works", target: "ella trabaja" }]
  }),
  plannedGrammarConcept({
    conceptId: "gr-206-regular-preterite",
    featureKeys: ["past:preterite-regular", "past:simple-regular"],
    minBand: "level-2a",
    title: "Regular past events",
    learnerSummary:
      "Spanish regular past forms often use endings like -e, -aste, -o, -amos, and -aron.",
    sourcePatternLabel: "simple past verb",
    targetPatternLabel: "regular preterite ending",
    examples: [{ source: "visited", target: "visito" }],
    suppressUntilTranslation: true
  }),
  plannedGrammarConcept({
    conceptId: "gr-207-simple-future",
    featureKeys: ["future:will", "future:plan-basic"],
    minBand: "level-2a",
    title: "Simple future plans",
    learnerSummary:
      "English will can map to Spanish future forms or an ir a paraphrase.",
    sourcePatternLabel: "will + verb",
    targetPatternLabel: "future form or ir a + infinitive",
    examples: [{ source: "will call", target: "llamara / va a llamar" }]
  }),
  plannedGrammarConcept({
    conceptId: "gr-208-time-anchors",
    featureKeys: ["time:anchor-basic", "time:sequence-basic"],
    minBand: "level-2b",
    title: "Time anchors",
    learnerSummary:
      "Words like yesterday, today, tomorrow, last week, and next week anchor when an event happens.",
    sourcePatternLabel: "time phrase",
    targetPatternLabel: "Spanish time phrase",
    examples: [{ source: "next week", target: "la proxima semana" }]
  }),
  plannedGrammarConcept({
    conceptId: "gr-209-comparisons",
    featureKeys: ["comparison:comparative", "comparison:superlative"],
    minBand: "level-2c",
    title: "Basic comparisons",
    learnerSummary:
      "Spanish comparison chunks include mas que, menos que, and tan...como.",
    sourcePatternLabel: "more/less/as + comparison",
    targetPatternLabel: "mas que / menos que / tan...como",
    examples: [{ source: "more than", target: "mas que" }]
  }),
  plannedGrammarConcept({
    conceptId: "gr-210-quantity-determiners",
    featureKeys: ["determiner:quantity-basic"],
    minBand: "level-2c",
    title: "Quantity words",
    learnerSummary:
      "Spanish quantity words include mucho, poco, algunos, and varios.",
    sourcePatternLabel: "quantity word + noun",
    targetPatternLabel: "Spanish quantity word + noun",
    examples: [{ source: "a few days", target: "unos pocos dias" }]
  }),
  plannedGrammarConcept({
    conceptId: "gr-305-present-progressive",
    featureKeys: ["aspect:present-progressive"],
    minBand: "level-3a",
    title: "Present progressive",
    learnerSummary:
      "Ongoing actions can use estar plus an -ando or -iendo form in Spanish.",
    sourcePatternLabel: "be + verb-ing",
    targetPatternLabel: "estar + gerund",
    examples: [{ source: "is working", target: "esta trabajando" }],
    suppressUntilTranslation: true
  }),
  plannedGrammarConcept({
    conceptId: "gr-306-past-progressive",
    featureKeys: ["aspect:past-progressive"],
    minBand: "level-3b",
    title: "Past progressive",
    learnerSummary:
      "Was or were doing something can map to estaba plus a gerund.",
    sourcePatternLabel: "was/were + verb-ing",
    targetPatternLabel: "estaba + gerund",
    examples: [{ source: "was working", target: "estaba trabajando" }],
    suppressUntilTranslation: true
  }),
  plannedGrammarConcept({
    conceptId: "gr-307-imperfect-background",
    featureKeys: ["aspect:imperfect-background"],
    minBand: "level-3b",
    title: "Imperfect background",
    learnerSummary:
      "Spanish imperfect forms often describe background or repeated past actions.",
    sourcePatternLabel: "background or repeated past action",
    targetPatternLabel: "imperfect tense",
    examples: [{ source: "lived there", target: "vivia alli" }],
    suppressUntilTranslation: true
  }),
  plannedGrammarConcept({
    conceptId: "gr-308-sequence-connectors",
    featureKeys: ["connector:sequence"],
    minBand: "level-3c",
    title: "Sequence connectors",
    learnerSummary:
      "Sequence words such as before, after, then, and finally help connect events.",
    sourcePatternLabel: "sequence connector",
    targetPatternLabel: "despues / antes / luego / al final",
    examples: [{ source: "after that", target: "despues de eso" }]
  }),
  plannedGrammarConcept({
    conceptId: "gr-309-gerund-infinitive-recognition",
    featureKeys: ["gerund:recognition", "gerund:subject-or-object"],
    minBand: "level-3c",
    title: "Gerund and infinitive recognition",
    learnerSummary:
      "Spanish often uses infinitives and gerunds in places that do not map word for word from English.",
    sourcePatternLabel: "verb-ing or to + verb",
    targetPatternLabel: "infinitive or gerund",
    examples: [{ source: "to learn", target: "aprender" }],
    suppressUntilTranslation: true
  }),
  plannedGrammarConcept({
    conceptId: "gr-310-direct-object-pronouns",
    featureKeys: ["object-pronoun:direct-recognition"],
    minBand: "level-3c",
    title: "Direct object pronouns",
    learnerSummary:
      "Spanish words like lo, la, los, and las can stand in for direct objects.",
    sourcePatternLabel: "it/them as an object",
    targetPatternLabel: "lo/la/los/las",
    examples: [{ source: "I see it", target: "lo veo" }],
    suppressUntilTranslation: true
  }),
  plannedGrammarConcept({
    conceptId: "gr-402-present-perfect",
    featureKeys: ["present-perfect:basic"],
    minBand: "level-4a",
    title: "Present perfect",
    learnerSummary:
      "Spanish present perfect uses haber plus a participle.",
    sourcePatternLabel: "have/has + participle",
    targetPatternLabel: "haber + participle",
    examples: [{ source: "has changed", target: "ha cambiado" }],
    suppressUntilTranslation: true
  }),
  plannedGrammarConcept({
    conceptId: "gr-403-passive-basics",
    featureKeys: ["passive:be-plus-participle", "passive:agentless"],
    minBand: "level-4a",
    title: "Passive basics",
    learnerSummary:
      "Passive meanings can use ser plus a participle, an agentless passive, or a passive-like se pattern.",
    sourcePatternLabel: "be + participle",
    targetPatternLabel: "ser + participle or se pattern",
    examples: [{ source: "was created", target: "fue creado" }],
    suppressUntilTranslation: true
  }),
  plannedGrammarConcept({
    conceptId: "gr-404-basic-conditionals",
    featureKeys: ["conditional:if-basic"],
    minBand: "level-4b",
    title: "Basic conditionals with if",
    learnerSummary:
      "If clauses often map to Spanish si clauses.",
    sourcePatternLabel: "if + clause",
    targetPatternLabel: "si + clause",
    examples: [{ source: "if possible", target: "si es posible" }]
  }),
  plannedGrammarConcept({
    conceptId: "gr-405-contrast-concession",
    featureKeys: ["concession:contrast", "contrast:although"],
    minBand: "level-4a",
    title: "Contrast and concession",
    learnerSummary:
      "Although, however, and similar markers connect contrast or concession.",
    sourcePatternLabel: "although/however + clause",
    targetPatternLabel: "aunque / sin embargo / no obstante",
    examples: [{ source: "although", target: "aunque" }]
  }),
  plannedGrammarConcept({
    conceptId: "gr-406-relative-clauses",
    featureKeys: ["clause:relative-que", "subordination:relative-clause"],
    minBand: "level-4b",
    title: "Relative clauses with que",
    learnerSummary:
      "Spanish que can introduce a relative clause that adds information about a noun.",
    sourcePatternLabel: "that/which/who + clause",
    targetPatternLabel: "que + clause",
    examples: [{ source: "the book that I read", target: "el libro que lei" }],
    suppressUntilTranslation: true
  }),
  plannedGrammarConcept({
    conceptId: "gr-407-subjunctive-recognition",
    featureKeys: ["subjunctive:recognition-basic"],
    minBand: "level-4b",
    title: "Early subjunctive recognition",
    learnerSummary:
      "Some recommendations, wants, doubts, and purpose clauses use Spanish subjunctive forms.",
    sourcePatternLabel: "want/recommend/doubt + clause",
    targetPatternLabel: "subjunctive form",
    examples: [{ source: "recommend that he go", target: "recomienda que vaya" }],
    suppressUntilTranslation: true
  }),
  plannedGrammarConcept({
    conceptId: "gr-501-embedded-clauses",
    featureKeys: ["subordination:embedded"],
    minBand: "level-5b",
    title: "Embedded clauses",
    learnerSummary:
      "Dense native prose often nests clauses inside larger sentence structures.",
    sourcePatternLabel: "embedded clause",
    targetPatternLabel: "embedded Spanish clause",
    examples: [{ source: "the fact that it changed", target: "el hecho de que cambio" }],
    suppressUntilTranslation: true
  }),
  plannedGrammarConcept({
    conceptId: "gr-502-reported-speech",
    featureKeys: ["reported-speech:basic"],
    minBand: "level-5a",
    title: "Reported speech",
    learnerSummary:
      "Reported speech describes what someone said, thought, or claimed.",
    sourcePatternLabel: "said/thought that + clause",
    targetPatternLabel: "dijo/penso que + clause",
    examples: [{ source: "said that it changed", target: "dijo que cambio" }],
    suppressUntilTranslation: true
  }),
  plannedGrammarConcept({
    conceptId: "gr-503-perfect-contrasts",
    featureKeys: ["perfect:contrast"],
    minBand: "level-5a",
    title: "Perfect tense contrasts",
    learnerSummary:
      "Perfect forms can show different relationships between past events and the present.",
    sourcePatternLabel: "perfect tense contrast",
    targetPatternLabel: "haber forms in context",
    examples: [{ source: "had changed", target: "habia cambiado" }],
    suppressUntilTranslation: true
  }),
  plannedGrammarConcept({
    conceptId: "gr-504-advanced-conditionals",
    featureKeys: ["conditional:advanced"],
    minBand: "level-5b",
    title: "Advanced conditionals",
    learnerSummary:
      "Advanced conditionals can combine if clauses, conditional forms, and hypothetical meaning.",
    sourcePatternLabel: "hypothetical if clause",
    targetPatternLabel: "si + past subjunctive / conditional",
    examples: [{ source: "if it were possible", target: "si fuera posible" }],
    suppressUntilTranslation: true
  }),
  plannedGrammarConcept({
    conceptId: "gr-505-broader-subjunctive",
    featureKeys: ["subjunctive:recognition-broad"],
    minBand: "level-5b",
    title: "Broader subjunctive recognition",
    learnerSummary:
      "Later reading can surface subjunctive forms in time, purpose, doubt, and desire clauses.",
    sourcePatternLabel: "trigger + dependent clause",
    targetPatternLabel: "subjunctive form",
    examples: [{ source: "so that it works", target: "para que funcione" }],
    suppressUntilTranslation: true
  }),
  plannedGrammarConcept({
    conceptId: "gr-506-discourse-stance",
    featureKeys: ["discourse:stance-marker"],
    minBand: "level-5b",
    title: "Discourse stance and hedging",
    learnerSummary:
      "Native prose often uses markers that soften, qualify, or frame a claim.",
    sourcePatternLabel: "stance marker",
    targetPatternLabel: "Spanish discourse marker",
    examples: [{ source: "to some extent", target: "hasta cierto punto" }]
  })
] as const;

const GRAMMAR_CONCEPTS_BY_FEATURE_KEY = new Map<string, GrammarConcept>(
  DEFAULT_GRAMMAR_CONCEPTS.flatMap((concept) =>
    concept.featureKeys.map((featureKey) => [featureKey, concept] as const)
  )
);

export function listGrammarConcepts(): readonly GrammarConcept[] {
  return DEFAULT_GRAMMAR_CONCEPTS;
}

export function resolveGrammarConcept(
  featureKey: string | null | undefined
): GrammarConcept | null {
  if (!featureKey) {
    return null;
  }

  return GRAMMAR_CONCEPTS_BY_FEATURE_KEY.get(featureKey.trim()) ?? null;
}

export function evaluateGrammarCurriculumDecision(input: {
  featureKey: string;
  confidence?: number | null;
  config?: Partial<CurriculumConfig> | null;
  profile?: CurriculumRuntimeProfileInput | null;
  translatedText?: string | null;
}): GrammarCurriculumDecision {
  const featureKey = input.featureKey.trim();
  const config = resolveCurriculumConfig(input.config);
  const activeBand = resolveActiveCurriculumBand(
    config,
    "grammar-feature",
    input.profile
  );
  const confidence = normalizeConfidence(input.confidence);
  const concept = resolveGrammarConcept(featureKey);

  if (!concept) {
    return grammarDecision({
      eligible: false,
      status: "suppress",
      reason: "unknown-concept",
      configId: config.configId,
      activeBand,
      concept: null,
      featureKey,
      confidence
    });
  }

  if (!activeBand) {
    return grammarDecision({
      eligible: false,
      status: "suppress",
      reason: "inactive-band",
      configId: config.configId,
      activeBand,
      concept,
      featureKey,
      confidence
    });
  }

  if (concept.suppressUntilTranslation && !readNonEmptyString(input.translatedText)) {
    return grammarDecision({
      eligible: false,
      status: "suppress",
      reason: "translation-required",
      configId: config.configId,
      activeBand,
      concept,
      featureKey,
      confidence
    });
  }

  if (confidence < 0.72) {
    return grammarDecision({
      eligible: false,
      status: "suppress",
      reason: "below-confidence",
      configId: config.configId,
      activeBand,
      concept,
      featureKey,
      confidence
    });
  }

  const minBandOrder = getBandOrder(config, concept.minBand);
  const activeOrder = activeBand.order;
  const activeContent = getActiveCurriculumContent({
    config,
    profile: input.profile,
    unitType: "grammar-feature"
  }).content;

  if (isFeatureInCurrentGrammarFocus(activeContent, featureKey)) {
    return grammarDecision({
      eligible: true,
      status: "focus",
      reason: "current-band-focus",
      configId: config.configId,
      activeBand,
      concept,
      featureKey,
      confidence
    });
  }

  if (concept.reviewBands?.includes(activeBand.bandId)) {
    return grammarDecision({
      eligible: true,
      status: "review",
      reason: "listed-review-band",
      configId: config.configId,
      activeBand,
      concept,
      featureKey,
      confidence
    });
  }

  if (minBandOrder === activeOrder) {
    return grammarDecision({
      eligible: true,
      status: "focus",
      reason: "minimum-band-focus",
      configId: config.configId,
      activeBand,
      concept,
      featureKey,
      confidence
    });
  }

  if (minBandOrder < activeOrder) {
    return grammarDecision({
      eligible: true,
      status: "review",
      reason: "earlier-band-review",
      configId: config.configId,
      activeBand,
      concept,
      featureKey,
      confidence
    });
  }

  if (
    concept.displayPolicy.allowStretch &&
    minBandOrder === activeOrder + 1 &&
    confidence >= 0.8
  ) {
    return grammarDecision({
      eligible: true,
      status: "stretch",
      reason: "near-future-stretch",
      configId: config.configId,
      activeBand,
      concept,
      featureKey,
      confidence
    });
  }

  return grammarDecision({
    eligible: false,
    status: "suppress",
    reason: "above-stretch-band",
    configId: config.configId,
    activeBand,
    concept,
    featureKey,
    confidence
  });
}

export function resolveSentenceGrammarCards(
  input: ResolveSentenceGrammarCardsInput
): SentenceGrammarCard[] {
  const sentenceHash =
    readNonEmptyString(input.sentenceHash) ??
    readNonEmptyString(input.entry?.sentenceHash);
  if (!sentenceHash) {
    return [];
  }

  const features = input.features ?? input.entry?.grammarFeatures ?? [];
  if (features.length === 0) {
    return [];
  }

  const config = resolveCurriculumConfig(input.config);
  const activeBand = resolveActiveCurriculumBand(
    config,
    "grammar-feature",
    input.profile
  );
  const maxCards = resolveMaxGrammarCards(activeBand);
  const seenConceptIds = new Set<string>();
  const cards = features
    .flatMap((feature) => {
      const decision = evaluateGrammarCurriculumDecision({
        featureKey: feature.featureKey,
        confidence: feature.confidence,
        config,
        profile: input.profile,
        translatedText: input.translatedText
      });
      if (!decision.eligible || !decision.concept || decision.status === "suppress") {
        return [];
      }

      const card = createSentenceGrammarCard({
        sentenceHash,
        feature,
        decision,
        isDue: shouldReceiveDueReviewBoost(
          input.learningItemsByUnitRefId?.get(feature.featureKey)
        )
      });
      return card ? [card] : [];
    })
    .sort(compareGrammarCards)
    .filter((card) => {
      if (seenConceptIds.has(card.conceptId)) {
        return false;
      }

      seenConceptIds.add(card.conceptId);
      return true;
    });

  return cards.slice(0, maxCards);
}

export function grammarFeatureKeysForCards(
  cards: readonly SentenceGrammarCard[]
): string[] {
  return [...new Set(cards.map((card) => card.featureKey))];
}

function plannedGrammarConcept(input: {
  conceptId: string;
  featureKeys: readonly string[];
  minBand: string;
  title: string;
  learnerSummary: string;
  sourcePatternLabel: string;
  targetPatternLabel: string;
  examples: readonly GrammarConceptExample[];
  suppressUntilTranslation?: boolean;
}): GrammarConcept {
  return {
    conceptId: input.conceptId,
    featureKeys: input.featureKeys,
    minBand: input.minBand,
    title: input.title,
    learnerSummary: input.learnerSummary,
    sourcePatternLabel: input.sourcePatternLabel,
    targetPatternLabel: input.targetPatternLabel,
    examples: input.examples,
    displayPolicy: { allowStretch: false, maxCardsPerSentence: 1 },
    exposurePolicy: {
      itemType: "grammar-feature",
      countOnCardOpen: true,
      countOnDwell: true
    },
    suppressUntilTranslation: input.suppressUntilTranslation
  };
}

function createSentenceGrammarCard(input: {
  sentenceHash: string;
  feature: GrammarFeatureForCard;
  decision: GrammarCurriculumDecision;
  isDue: boolean;
}): SentenceGrammarCard | null {
  const concept = input.decision.concept;
  const activeBand = input.decision.activeBand;
  if (!concept || !activeBand || input.decision.status === "suppress") {
    return null;
  }

  const curriculumStatus = input.decision.status;
  return {
    conceptId: concept.conceptId,
    featureKey: input.decision.featureKey,
    sentenceHash: input.sentenceHash,
    sourceSpan: input.feature.span,
    sourceText: input.feature.sourceText,
    title: concept.title,
    explanation: concept.learnerSummary,
    sourcePatternLabel: concept.sourcePatternLabel,
    targetPatternLabel: concept.targetPatternLabel,
    exampleMapping: buildExampleMapping(input.feature.sourceText, concept),
    curriculumReason: input.isDue
      ? "This pattern is due for review in your reading path."
      : curriculumReasonForStatus(curriculumStatus, activeBand.label),
    bandId: activeBand.bandId,
    curriculumStatus,
    exposureItemId: buildLearningItemId(
      "grammar-feature",
      input.decision.featureKey
    ),
    confidence: input.decision.confidence
  };
}

function grammarDecision(input: {
  eligible: boolean;
  status: GrammarCurriculumStatus;
  reason: GrammarCurriculumDecision["reason"];
  configId: string;
  activeBand: CurriculumBand | null;
  concept: GrammarConcept | null;
  featureKey: string;
  confidence: number;
}): GrammarCurriculumDecision {
  return {
    eligible: input.eligible,
    status: input.status,
    reason: input.reason,
    configId: input.configId,
    activeBand: input.activeBand,
    activeBandId: input.activeBand?.bandId ?? null,
    concept: input.concept,
    conceptId: input.concept?.conceptId ?? null,
    featureKey: input.featureKey,
    confidence: input.confidence
  };
}

function resolveMaxGrammarCards(activeBand: CurriculumBand | null): number {
  if (!activeBand || activeBand.order <= 6) {
    return 1;
  }

  return 2;
}

function compareGrammarCards(
  left: SentenceGrammarCard,
  right: SentenceGrammarCard
): number {
  const statusDelta =
    grammarStatusWeight(right.curriculumStatus) -
    grammarStatusWeight(left.curriculumStatus);
  if (statusDelta !== 0) {
    return statusDelta;
  }

  if (right.confidence !== left.confidence) {
    return right.confidence - left.confidence;
  }

  return left.sourceSpan.startChar - right.sourceSpan.startChar;
}

function grammarStatusWeight(status: Exclude<GrammarCurriculumStatus, "suppress">): number {
  if (status === "focus") {
    return 3;
  }

  if (status === "review") {
    return 2;
  }

  return 1;
}

function buildExampleMapping(
  sourceText: string,
  concept: GrammarConcept
): string | null {
  const example = concept.examples[0];
  if (!example) {
    return null;
  }

  const source = readNonEmptyString(sourceText) ?? example.source;
  return `${source} -> ${example.target}`;
}

function curriculumReasonForStatus(
  status: Exclude<GrammarCurriculumStatus, "suppress">,
  bandLabel: string
): string {
  if (status === "focus") {
    return `This is part of your ${bandLabel} grammar focus.`;
  }

  if (status === "review") {
    return "This reviews a grammar pattern from an earlier focus.";
  }

  return "This is a nearby stretch pattern shown because the sentence is clear.";
}

function isFeatureInCurrentGrammarFocus(
  content: CurriculumBandContent | null,
  featureKey: string
): boolean {
  if (!content) {
    return false;
  }

  return content.currentGrammarKeys.some((key) =>
    grammarKeyMatchesFeature(key, featureKey)
  );
}

function grammarKeyMatchesFeature(key: string, featureKey: string): boolean {
  const normalizedKey = key.trim();
  if (!normalizedKey) {
    return false;
  }

  if (normalizedKey === featureKey) {
    return true;
  }

  if (normalizedKey.endsWith(":*")) {
    return featureKey.startsWith(normalizedKey.slice(0, -1));
  }

  return normalizedKey.startsWith("all current keys");
}

function getBandOrder(config: CurriculumConfig, bandId: string): number {
  return (
    config.bands.find((band) => band.bandId === bandId)?.order ??
    Number.POSITIVE_INFINITY
  );
}

function normalizeConfidence(confidence: number | null | undefined): number {
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) {
    return 0;
  }

  return Math.max(0, Math.min(1, confidence));
}

function readNonEmptyString(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}
