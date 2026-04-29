import type { CurriculumBand } from "../domain/models";
import {
  DEFAULT_CURRICULUM_CONFIG,
  resolveActiveCurriculumBand,
  resolveCurriculumConfig,
  type CurriculumConfig,
  type CurriculumRuntimeProfileInput
} from "./config";

export type SentenceComplexityPolicy = {
  tokenRange: readonly [number, number];
  clausePolicy: string;
  targetPolicy: string;
  notes: string;
};

export type CurriculumBandContent = {
  bandId: string;
  vocabularyDomains: readonly string[];
  phraseChunks: readonly string[];
  currentGrammarKeys: readonly string[];
  plannedGrammarKeys: readonly string[];
  sentencePolicy: SentenceComplexityPolicy;
};

export type ActiveCurriculumContent = {
  band: CurriculumBand | null;
  content: CurriculumBandContent | null;
};

export const DEFAULT_CURRICULUM_CONTENT: readonly CurriculumBandContent[] = [
  {
    bandId: "level-1a",
    vocabularyDomains: ["people", "home", "food", "common objects", "colors", "size", "quality"],
    phraseChunks: ["at home", "right now", "a lot", "clear adjective+noun spans"],
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
    vocabularyDomains: ["places", "days", "time words", "weather", "family", "frequency adverbs"],
    phraseChunks: ["in the morning", "on Monday", "at school", "literal noun chunks with connectors"],
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
    phraseChunks: ["of course", "for now", "simple noun chunks"],
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
    phraseChunks: ["every day", "on the way", "next week", "safe adjective+noun spans"],
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
    phraseChunks: ["take care of", "make sure", "modal carriers"],
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
    phraseChunks: ["more than", "a few", "the same as"],
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
    vocabularyDomains: ["ongoing activity", "movement/change", "situations", "descriptive verbs through context"],
    phraseChunks: ["in the middle of", "on the way to", "progressive chunks"],
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
    phraseChunks: ["because of", "after that", "at the end"],
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
    phraseChunks: ["in order to", "as soon as", "used to"],
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
    vocabularyDomains: ["explanation", "process", "systems", "comparison", "opinion vocabulary"],
    phraseChunks: ["for example", "as a result", "in fact"],
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
    vocabularyDomains: ["opinion/evidence", "passive recognition", "conditional reasoning", "abstract nouns"],
    phraseChunks: ["on the other hand", "at least", "as well as"],
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
    vocabularyDomains: ["editorial", "analytical", "institutional", "cultural", "academic-adjacent terms"],
    phraseChunks: ["in terms of", "with respect to", "to some extent"],
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
    vocabularyDomains: ["broad domain expansion", "specialized interests", "long-term weak-point review"],
    phraseChunks: ["as opposed to", "in light of", "for the sake of"],
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
}): ActiveCurriculumContent {
  const config = resolveCurriculumConfig(input?.config ?? DEFAULT_CURRICULUM_CONFIG);
  const band = resolveActiveCurriculumBand(config, "word", input?.profile);

  return {
    band,
    content: getCurriculumContentForBand(band?.bandId, input?.content)
  };
}
