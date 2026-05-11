import type { LearningItem } from "../domain/models";
import {
  getActiveCurriculumContent,
  type CurriculumBandContent
} from "./content";
import {
  evaluateCurriculumBandTransition,
  resolveActiveCurriculumBand,
  resolveCurriculumConfig,
  type CurriculumConfig,
  type CurriculumRuntimeProfileInput
} from "./config";
import { resolveGrammarConcept } from "./grammar";

export type BandPedagogy = {
  bandId: string;
  levelId: string;
  learnerTitle: string;
  learnerSummary: string;
  canDoStatements: readonly string[];
  vocabularyFocus: string;
  wordPatternLabels: readonly string[];
  phraseFocusExamples: readonly string[];
  grammarFocusLabels: readonly string[];
  sentenceFocusLabel: string;
  checkpointFocus: readonly string[];
  nextBandPreview: string;
};

export type CurrentFocusSummary = {
  levelId: string;
  levelLabel: string;
  bandId: string;
  bandLabel: string;
  learnerTitle: string;
  shortGoal: string;
  wordFocusLabels: readonly string[];
  wordPatternLabels: readonly string[];
  phraseFocusExamples: readonly string[];
  grammarFocusLabels: readonly string[];
  sentenceFocusLabel: string;
  nextFocusPreview: string;
};

export type CurriculumPathBandSummary = {
  bandId: string;
  bandLabel: string;
  learnerTitle: string;
  learnerSummary: string;
  active: boolean;
  unlocked: boolean;
};

export type CurriculumPathLevelSummary = {
  levelId: string;
  levelLabel: string;
  active: boolean;
  unlocked: boolean;
  stageSummary: string;
  vocabularySummary: string;
  phraseSummary: string;
  grammarSummary: string;
  sentenceSummary: string;
  checkpointSummary: string;
  bands: CurriculumPathBandSummary[];
};

export type CurriculumProgressSummary = {
  currentBandLabel: string;
  nextBandLabel: string | null;
  progressLabels: readonly string[];
  blockerLabels: readonly string[];
  checkpointLabel: string;
  checkpointReady: boolean;
};

export const DEFAULT_BAND_PEDAGOGY: readonly BandPedagogy[] = [
  {
    bandId: "level-1a",
    levelId: "level-1",
    learnerTitle: "First Spanish on the page",
    learnerSummary:
      "Concrete everyday words, familiar-looking pairs, and a few very useful short phrases.",
    canDoStatements: [
      "Recognize common concrete nouns and adjectives in safe contexts.",
      "Notice familiar Spanish-English word pairs.",
      "Use sentence help for very short, concrete sentences."
    ],
    vocabularyFocus: "people, home, food, common objects, colors, size, basic qualities",
    wordPatternLabels: [
      "identical or near-identical international words",
      "familiar descriptive words ending in e"
    ],
    phraseFocusExamples: ["at home -> en casa", "right now -> ahora mismo", "a lot -> mucho"],
    grammarFocusLabels: [
      "articles like el and la",
      "simple descriptions",
      "there is or there are"
    ],
    sentenceFocusLabel: "Very short, concrete, one-clause sentences.",
    checkpointFocus: ["starter words", "very short phrases", "simple sentence meaning"],
    nextBandPreview: "Time, place, family, weather, and simple time/place phrases."
  },
  {
    bandId: "level-1b",
    levelId: "level-1",
    learnerTitle: "Time, place, and familiar contexts",
    learnerSummary:
      "Places, days, time words, family, weather, and simple time/place phrases.",
    canDoStatements: [
      "Recognize everyday time and place words.",
      "Understand simple phrases like in the morning and at school."
    ],
    vocabularyFocus: "places, days, time words, weather, family, frequency words",
    wordPatternLabels: ["familiar word shapes backed by approved targets"],
    phraseFocusExamples: [
      "in the morning -> por la manana",
      "at school -> en la escuela",
      "on Monday -> el lunes"
    ],
    grammarFocusLabels: ["basic questions", "present-time contexts", "time/place phrases"],
    sentenceFocusLabel: "Short one-clause sentences with a clear time or place anchor.",
    checkpointFocus: ["time words", "place phrases", "basic question recognition"],
    nextBandPreview: "Foundation review, simple negation, and easy word-family patterns."
  },
  {
    bandId: "level-1c",
    levelId: "level-1",
    learnerTitle: "Foundation review and checkpoint prep",
    learnerSummary:
      "Consolidate simple vocabulary and add easy word-family patterns.",
    canDoStatements: [
      "Recognize more familiar word pairs.",
      "Notice simple negation and quantity words."
    ],
    vocabularyFocus: "routines, descriptive contrasts, common environments, review words",
    wordPatternLabels: ["-tion and -sion -> -cion and -sion", "ph -> f for common words"],
    phraseFocusExamples: ["of course -> por supuesto", "for now -> por ahora"],
    grammarFocusLabels: ["basic negation", "quantity words", "article and adjective review"],
    sentenceFocusLabel: "Safe review contexts before the first level boundary.",
    checkpointFocus: ["words", "phrases", "grammar recognition", "short sentence comprehension"],
    nextBandPreview: "Routines, schedules, movement, errands, and the first modal pattern."
  },
  {
    bandId: "level-2a",
    levelId: "level-2",
    learnerTitle: "Routines and movement",
    learnerSummary:
      "Everyday routines, schedules, movement, errands, and simple modal meaning.",
    canDoStatements: [
      "Follow common routine and movement contexts.",
      "Recognize ability with can in clear sentences."
    ],
    vocabularyFocus: "routine actions, schedules, movement, locations, errands",
    wordPatternLabels: ["safe routine verbs when context is clear"],
    phraseFocusExamples: ["every day -> todos los dias", "next week -> la proxima semana"],
    grammarFocusLabels: ["ability with can"],
    sentenceFocusLabel: "Clear routine contexts with conservative modal use.",
    checkpointFocus: ["routine words", "time anchors", "ability sentences"],
    nextBandPreview: "Past events, future plans, logistics, and advice."
  },
  {
    bandId: "level-2b",
    levelId: "level-2",
    learnerTitle: "Events and plans",
    learnerSummary:
      "Past events, future plans, logistics, social interactions, and modal carriers.",
    canDoStatements: [
      "Recognize future plans with going to.",
      "Notice advice and obligation patterns in sentence help."
    ],
    vocabularyFocus: "past events, future plans, logistics, social interactions",
    wordPatternLabels: ["high-confidence event and planning vocabulary"],
    phraseFocusExamples: [
      "going to -> ir a + infinitive",
      "have to -> tener que + infinitive",
      "make sure -> asegurarse de"
    ],
    grammarFocusLabels: [
      "future plans with going to",
      "advice with should",
      "obligation with have to"
    ],
    sentenceFocusLabel: "Past and future meanings should be locally obvious.",
    checkpointFocus: ["future plans", "modals", "event and logistics phrases"],
    nextBandPreview: "Comparison, quantity, community vocabulary, and level review."
  },
  {
    bandId: "level-2c",
    levelId: "level-2",
    learnerTitle: "Comparison and quantity",
    learnerSummary:
      "Comparison, quantity, travel-adjacent words, community vocabulary, and Level 2 review.",
    canDoStatements: [
      "Recognize comparison chunks.",
      "Review core modal patterns in clear contexts."
    ],
    vocabularyFocus: "comparison, quantity, travel-adjacent words, community vocabulary",
    wordPatternLabels: ["-ty -> -dad word families"],
    phraseFocusExamples: ["more than -> mas que", "a few -> unos pocos", "the same as -> lo mismo que"],
    grammarFocusLabels: ["can and should review", "comparison patterns", "quantity words"],
    sentenceFocusLabel: "Slightly longer sentences with low subordination.",
    checkpointFocus: ["modals", "comparison", "time anchors", "everyday sentence comprehension"],
    nextBandPreview: "Ongoing activity, situations, and first connected contexts."
  },
  {
    bandId: "level-3a",
    levelId: "level-3",
    learnerTitle: "Ongoing action and situations",
    learnerSummary:
      "Short connected contexts, ongoing activity, movement/change, and situation words.",
    canDoStatements: [
      "Follow simple connected situations.",
      "Recognize when as a time connector."
    ],
    vocabularyFocus: "ongoing activity, movement/change, situations, descriptive verbs",
    wordPatternLabels: ["-ly -> -mente adverbs"],
    phraseFocusExamples: ["in the middle of -> en medio de", "while -> mientras"],
    grammarFocusLabels: ["time clauses with when", "future plan review"],
    sentenceFocusLabel: "One light subordinate or time clause can appear.",
    checkpointFocus: ["ongoing situations", "time connectors", "connected sentence meaning"],
    nextBandPreview: "Short narratives, cause/effect, time sequence, and past habits."
  },
  {
    bandId: "level-3b",
    levelId: "level-3",
    learnerTitle: "Cause, time, and past habits",
    learnerSummary:
      "Short narratives, cause/effect, time sequencing, and richer collocations.",
    canDoStatements: [
      "Recognize cause and time links.",
      "Understand used to as a past-habit pattern."
    ],
    vocabularyFocus: "short narratives, cause/effect, time sequencing, richer collocations",
    wordPatternLabels: ["false-friend guard and contrast awareness"],
    phraseFocusExamples: ["because of -> debido a", "after that -> despues de eso"],
    grammarFocusLabels: ["past habits with used to", "cause with because", "when review"],
    sentenceFocusLabel: "Short narrative flow with scan-friendly cause and time links.",
    checkpointFocus: ["narrative connectors", "because/when", "used to"],
    nextBandPreview: "Purpose, sequence, daily-life stories, and Level 3 checkpoint prep."
  },
  {
    bandId: "level-3c",
    levelId: "level-3",
    learnerTitle: "Purpose and sequence",
    learnerSummary:
      "Daily-life stories, purpose chunks, sequence language, and early abstract description.",
    canDoStatements: [
      "Recognize purpose chunks.",
      "Follow short stories with sequence markers."
    ],
    vocabularyFocus: "work, media, travel, daily-life stories, early abstract description",
    wordPatternLabels: ["-ist/-ism and -ic/-ical families when safe"],
    phraseFocusExamples: ["in order to -> para + infinitive", "as soon as -> en cuanto"],
    grammarFocusLabels: ["used to review", "future plan review", "purpose with para"],
    sentenceFocusLabel: "Light subordination with one useful lesson at a time.",
    checkpointFocus: ["when", "because", "used to", "purpose and progressive recognition"],
    nextBandPreview: "Explanation prose, systems, opinion words, and have been."
  },
  {
    bandId: "level-4a",
    levelId: "level-4",
    learnerTitle: "Explanation and process",
    learnerSummary:
      "Explanation prose, process language, systems, comparison, and opinion vocabulary.",
    canDoStatements: [
      "Read bounded explanation prose.",
      "Recognize have been as a past-to-present pattern."
    ],
    vocabularyFocus: "explanation, process, systems, comparison, opinion vocabulary",
    wordPatternLabels: ["verb-family patterns such as -ate/-ize -> -ar/-izar"],
    phraseFocusExamples: ["for example -> por ejemplo", "as a result -> como resultado"],
    grammarFocusLabels: ["ongoing result with have been", "passive recognition"],
    sentenceFocusLabel: "Multi-clause explanation prose is allowed when scan-friendly.",
    checkpointFocus: ["present perfect", "passive basics", "conditionals", "concession"],
    nextBandPreview: "Opinion/evidence, passive recognition, conditionals, and abstract nouns."
  },
  {
    bandId: "level-4b",
    levelId: "level-4",
    learnerTitle: "Opinion, evidence, and reasoning",
    learnerSummary:
      "Opinion/evidence language, passive recognition, conditional reasoning, and abstract nouns.",
    canDoStatements: [
      "Follow short arguments with contrast markers.",
      "Review modal and perfect patterns in richer prose."
    ],
    vocabularyFocus: "opinion/evidence, passive recognition, conditional reasoning, abstract nouns",
    wordPatternLabels: ["abstract nouns and process verbs in context"],
    phraseFocusExamples: ["on the other hand -> por otro lado", "at least -> al menos"],
    grammarFocusLabels: ["have been review", "modal review", "basic conditionals"],
    sentenceFocusLabel: "Abstract multi-clause prose with bounded stretch.",
    checkpointFocus: ["present perfect", "passive basics", "conditionals", "concession"],
    nextBandPreview: "Editorial, analytical, institutional, and cultural native prose."
  },
  {
    bandId: "level-5a",
    levelId: "level-5",
    learnerTitle: "Broad native reading",
    learnerSummary:
      "Editorial, analytical, institutional, cultural, and academic-adjacent terms.",
    canDoStatements: [
      "Read varied native prose with adaptive help.",
      "Review earlier grammar when it matters to comprehension."
    ],
    vocabularyFocus: "editorial, analytical, institutional, cultural, academic-adjacent terms",
    wordPatternLabels: ["domain-specific word families"],
    phraseFocusExamples: ["in terms of -> en terminos de", "with respect to -> con respecto a"],
    grammarFocusLabels: ["adaptive review", "relative clauses", "reported speech"],
    sentenceFocusLabel: "Varied multi-clause native prose with overload controls.",
    checkpointFocus: ["dense clauses", "discourse markers", "advanced conditionals"],
    nextBandPreview: "Specialized interests and long-term weak-point review."
  },
  {
    bandId: "level-5b",
    levelId: "level-5",
    learnerTitle: "Adaptive native reading support",
    learnerSummary:
      "Broad domain expansion, specialized interests, and long-term weak-point review.",
    canDoStatements: [
      "Use adaptive support for specialized native reading.",
      "Review advanced grammar only when context is clear."
    ],
    vocabularyFocus: "broad domain expansion, specialized interests, weak-point review",
    wordPatternLabels: ["adaptive domain vocabulary"],
    phraseFocusExamples: ["in light of -> a la luz de", "for the sake of -> por el bien de"],
    grammarFocusLabels: ["embedded clauses", "advanced conditionals", "discourse markers"],
    sentenceFocusLabel: "Longer native sentences when ranking keeps them manageable.",
    checkpointFocus: ["broad native comprehension", "weak-point review"],
    nextBandPreview: "You are in the broad native reading band."
  }
] as const;

const BAND_PEDAGOGY_BY_ID = new Map(
  DEFAULT_BAND_PEDAGOGY.map((band) => [band.bandId, band] as const)
);

const LEVEL_STAGE_SUMMARIES: Record<string, Omit<CurriculumPathLevelSummary, "active" | "unlocked" | "bands">> = {
  "level-1": {
    levelId: "level-1",
    levelLabel: "Foundations",
    stageSummary: "A0 to early A1 reading support.",
    vocabularySummary: "Concrete everyday words and safe cognates.",
    phraseSummary: "Very short fixed chunks.",
    grammarSummary: "Articles, simple descriptions, negation, and basic questions.",
    sentenceSummary: "Very short, concrete, mostly one-clause sentences.",
    checkpointSummary: "Validates starter words, short phrases, grammar recognition, and short sentence meaning."
  },
  "level-2": {
    levelId: "level-2",
    levelLabel: "Everyday Patterns",
    stageSummary: "A1 to A2 reading support.",
    vocabularySummary: "Routines, events, planning, comparison, and community words.",
    phraseSummary: "Grammar carriers such as going to and have to.",
    grammarSummary: "Can, should, have to, going to, time anchors, and comparison.",
    sentenceSummary: "Clear routine and event sentences with bounded stretch.",
    checkpointSummary: "Checks everyday patterns before wider connected reading."
  },
  "level-3": {
    levelId: "level-3",
    levelLabel: "Narrative and Description",
    stageSummary: "A2 to early B1 reading support.",
    vocabularySummary: "Narrative, cause/effect, time sequence, and descriptive vocabulary.",
    phraseSummary: "Connectors, purpose chunks, and narrative phrases.",
    grammarSummary: "When, because, used to, purpose, and progressive recognition.",
    sentenceSummary: "Short connected contexts with light subordination.",
    checkpointSummary: "Checks narrative links, past habits, purpose, and connected sentence meaning."
  },
  "level-4": {
    levelId: "level-4",
    levelLabel: "Connected Expression",
    stageSummary: "B1 to B2 reading support.",
    vocabularySummary: "Explanation, opinion, evidence, process, and abstract vocabulary.",
    phraseSummary: "Argument and explanation markers.",
    grammarSummary: "Have been, present perfect, passive basics, conditionals, and concession.",
    sentenceSummary: "Multi-clause explanation prose with overload controls.",
    checkpointSummary: "Checks readiness for richer native prose and abstract reasoning."
  },
  "level-5": {
    levelId: "level-5",
    levelLabel: "Broad Native Reading",
    stageSummary: "B2+ reading support.",
    vocabularySummary: "Broad domain and specialized vocabulary.",
    phraseSummary: "Discourse markers and dense native chunks.",
    grammarSummary: "Embedded clauses, reported speech, advanced conditionals, and adaptive review.",
    sentenceSummary: "Longer native sentences when ranking keeps them readable.",
    checkpointSummary: "Uses adaptive review rather than a new broad unlock."
  }
};

export function getBandPedagogy(
  bandId: string | null | undefined
): BandPedagogy | null {
  return bandId ? BAND_PEDAGOGY_BY_ID.get(bandId) ?? null : null;
}

export function createCurrentFocusSummary(input?: {
  config?: Partial<CurriculumConfig> | null;
  profile?: CurriculumRuntimeProfileInput | null;
  content?: readonly CurriculumBandContent[];
}): CurrentFocusSummary | null {
  const config = resolveCurriculumConfig(input?.config);
  const active = getActiveCurriculumContent({
    config,
    profile: input?.profile,
    content: input?.content,
    unitType: "word"
  });
  const band = active.band;
  const content = active.content;
  if (!band || !content) {
    return null;
  }

  const pedagogy = getBandPedagogy(band.bandId);
  const level = config.levels.find((entry) => entry.bandIds.includes(band.bandId));
  const nextBand = [...config.bands]
    .sort((left, right) => left.order - right.order)
    .find((candidate) => candidate.order > band.order);
  const nextPedagogy = getBandPedagogy(nextBand?.bandId);

  return {
    levelId: level?.levelId ?? pedagogy?.levelId ?? "level-1",
    levelLabel: level?.label ?? "Foundations",
    bandId: band.bandId,
    bandLabel: band.label,
    learnerTitle: pedagogy?.learnerTitle ?? band.label,
    shortGoal: pedagogy?.learnerSummary ?? content.sentencePolicy.notes,
    wordFocusLabels: [...content.vocabularyDomains],
    wordPatternLabels: pedagogy?.wordPatternLabels ?? [],
    phraseFocusExamples:
      pedagogy?.phraseFocusExamples ??
      content.phraseChunks.slice(0, 3).map((phrase) => phrase),
    grammarFocusLabels: resolveGrammarFocusLabels(content, pedagogy),
    sentenceFocusLabel:
      pedagogy?.sentenceFocusLabel ??
      formatSentencePolicy(content.sentencePolicy),
    nextFocusPreview:
      pedagogy?.nextBandPreview ??
      nextPedagogy?.learnerSummary ??
      "You are in the broad native reading band."
  };
}

export function createCurriculumPathSummary(input?: {
  config?: Partial<CurriculumConfig> | null;
  profile?: CurriculumRuntimeProfileInput | null;
}): CurriculumPathLevelSummary[] {
  const config = resolveCurriculumConfig(input?.config);
  const activeBand = resolveActiveCurriculumBand(config, "word", input?.profile);
  const unlocked = new Set(input?.profile?.unlockedBandIds ?? []);

  return config.levels.map((level) => {
    const base = LEVEL_STAGE_SUMMARIES[level.levelId] ?? {
      levelId: level.levelId,
      levelLabel: level.label,
      stageSummary: level.label,
      vocabularySummary: "Vocabulary grows with the reading band.",
      phraseSummary: "Phrases expand as context allows.",
      grammarSummary: "Grammar appears in sentence help.",
      sentenceSummary: "Sentence complexity widens gradually.",
      checkpointSummary: "A local checkpoint validates readiness."
    };
    const bands = level.bandIds.flatMap((bandId) => {
      const band = config.bands.find((entry) => entry.bandId === bandId);
      const pedagogy = getBandPedagogy(bandId);
      if (!band || !pedagogy) {
        return [];
      }

      return [
        {
          bandId,
          bandLabel: band.label,
          learnerTitle: pedagogy.learnerTitle,
          learnerSummary: pedagogy.learnerSummary,
          active: activeBand?.bandId === bandId,
          unlocked: unlocked.size === 0 ? band.order === 1 : unlocked.has(bandId)
        }
      ];
    });

    return {
      ...base,
      active: bands.some((band) => band.active),
      unlocked: bands.some((band) => band.unlocked),
      bands
    };
  });
}

export function createCurriculumProgressSummary(input: {
  config?: Partial<CurriculumConfig> | null;
  profile?: CurriculumRuntimeProfileInput | null;
  items?: readonly LearningItem[];
  recentLapseRate?: number;
  checkpointPassed?: boolean;
}): CurriculumProgressSummary {
  const config = resolveCurriculumConfig(input.config);
  const activeBand = resolveActiveCurriculumBand(config, "word", input.profile);
  if (!activeBand) {
    return {
      currentBandLabel: "Starting",
      nextBandLabel: null,
      progressLabels: [],
      blockerLabels: ["Reading progress will appear after your starting level is loaded."],
      checkpointLabel: "Quick readiness checks appear at level boundaries.",
      checkpointReady: false
    };
  }

  const transition = evaluateCurriculumBandTransition(config, {
    bandId: activeBand.bandId,
    items: input.items ?? [],
    recentLapseRate: input.recentLapseRate ?? 0,
    checkpointPassed: input.checkpointPassed ?? false
  });
  const blockers = transition.unmetRequirements.map(formatProgressRequirement);

  return {
    currentBandLabel: activeBand.label,
    nextBandLabel: transition.nextBand?.label ?? null,
    progressLabels: [
      "Comfort with current items",
      "Successful real-page sightings",
      "Recent difficulty staying low"
    ],
    blockerLabels: blockers,
    checkpointLabel: transition.band?.unlockRequirements.checkpointRequired
      ? "The next level boundary uses a quick readiness check across words, phrases, grammar recognition, and sentence comprehension."
      : "This band widens through reading evidence; the next major checkpoint is at a level boundary.",
    checkpointReady:
      transition.unmetRequirements.length === 1 &&
      transition.unmetRequirements[0] === "checkpoint"
  };
}

export function formatProgressRequirement(requirement: string): string {
  if (requirement === "stable-item-ratio") {
    return "comfort with current items";
  }

  if (requirement === "qualified-exposures") {
    return "seen successfully in real pages";
  }

  if (requirement === "recent-lapse-rate") {
    return "recent difficulty";
  }

  if (requirement === "checkpoint") {
    return "quick readiness check";
  }

  return requirement;
}

function resolveGrammarFocusLabels(
  content: CurriculumBandContent,
  pedagogy: BandPedagogy | null
): readonly string[] {
  const conceptLabels = content.currentGrammarKeys.flatMap((featureKey) => {
    if (featureKey.startsWith("all current keys")) {
      return ["adaptive review of earlier grammar patterns"];
    }

    const concept = resolveGrammarConcept(featureKey);
    return concept ? [concept.title] : [];
  });

  if (conceptLabels.length > 0) {
    return conceptLabels;
  }

  return pedagogy?.grammarFocusLabels ?? content.plannedGrammarKeys.map(humanizeGrammarKey);
}

function humanizeGrammarKey(key: string): string {
  return key
    .replace(/[:_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatSentencePolicy(policy: CurriculumBandContent["sentencePolicy"]): string {
  const [minimum, maximum] = policy.tokenRange;
  return `${minimum} to ${maximum} tokens; ${policy.clausePolicy}; ${policy.targetPolicy}.`;
}
