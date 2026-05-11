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
  }
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
