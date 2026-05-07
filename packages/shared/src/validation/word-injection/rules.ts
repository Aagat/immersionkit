import type {
  ContextualAmbiguityRule,
  ContextChunkType,
  ObservedContextPos
} from "./types";

const toPosSet = (
  values: ReadonlyArray<ObservedContextPos>
): ReadonlySet<ObservedContextPos> => new Set(values);

const toChunkSet = (
  values: ReadonlyArray<ContextChunkType>
): ReadonlySet<ContextChunkType> => new Set(values);

const toStringSet = (values: ReadonlyArray<string>): ReadonlySet<string> =>
  new Set(values);

export const CONTEXTUAL_AMBIGUITY_RULES: ReadonlyMap<string, ContextualAmbiguityRule> =
  new Map<string, ContextualAmbiguityRule>([
    [
      "can_modal_vs_noun",
      {
        ambiguityGroup: "can_modal_vs_noun",
        minimumConfidence: 0.72,
        allowedObservedPos: toPosSet(["noun"]),
        blockedObservedPos: toPosSet(["modal", "auxiliary", "verb", "adjective"]),
        allowedChunkTypes: toChunkSet(["noun-phrase"]),
        requiredContextEvidence: toStringSet([
          "determiner-before",
          "demonstrative-before",
          "plural-morphology",
          "noun-head-subject"
        ]),
        blockedContextEvidence: toStringSet([
          "modal-before-base-verb",
          "sentence-initial-modal-question",
          "hyphenated-idiom"
        ])
      }
    ],
    [
      "watch_verb_vs_noun",
      {
        ambiguityGroup: "watch_verb_vs_noun",
        minimumConfidence: 0.72,
        allowedObservedPos: toPosSet(["noun"]),
        blockedObservedPos: toPosSet(["verb", "modal", "auxiliary"]),
        allowedChunkTypes: toChunkSet(["noun-phrase"]),
        requiredContextEvidence: toStringSet([
          "possessive-before",
          "determiner-before",
          "noun-compound-before",
          "pp-attachment-after",
          "noun-head-subject"
        ]),
        blockedContextEvidence: toStringSet([
          "finite-verb-head",
          "imperative-head",
          "phrasal-verb-out"
        ])
      }
    ],
    [
      "light_adjective_vs_noun",
      {
        ambiguityGroup: "light_adjective_vs_noun",
        minimumConfidence: 0.75,
        allowedObservedPos: toPosSet(["adjective"]),
        blockedObservedPos: toPosSet(["noun", "verb", "adverb"]),
        allowedChunkTypes: toChunkSet(["adjective-phrase"]),
        requiredContextEvidence: toStringSet([
          "attributive-before-noun",
          "predicative-after-linking-verb",
          "object-complement-adjective",
          "adjective-coordination"
        ]),
        blockedContextEvidence: toStringSet([
          "noun-head-subject",
          "verb-object-noun",
          "idiom-make-light-of"
        ])
      }
    ],
    [
      "right_adjective_vs_adverb_or_noun",
      {
        ambiguityGroup: "right_adjective_vs_adverb_or_noun",
        minimumConfidence: 0.78,
        allowedObservedPos: toPosSet(["adjective"]),
        blockedObservedPos: toPosSet(["adverb", "noun", "verb", "interjection"]),
        allowedChunkTypes: toChunkSet(["adjective-phrase"]),
        requiredContextEvidence: toStringSet(["attributive-before-noun"]),
        blockedContextEvidence: toStringSet([
          "directional-adverb",
          "noun-right-idiom",
          "degree-adverb-before-preposition",
          "discourse-marker-sentence-initial"
        ])
      }
    ],
    [
      "plant_verb_vs_noun",
      {
        ambiguityGroup: "plant_verb_vs_noun",
        minimumConfidence: 0.72,
        allowedObservedPos: toPosSet(["noun"]),
        blockedObservedPos: toPosSet(["verb", "adjective"]),
        allowedChunkTypes: toChunkSet(["noun-phrase"]),
        requiredContextEvidence: toStringSet([
          "determiner-before",
          "quantifier-before",
          "noun-head-subject",
          "noun-compound-after-adjective"
        ]),
        blockedContextEvidence: toStringSet([
          "imperative-head",
          "verb-object-frame",
          "present-tense-verb",
          "hyphenated-compound-adjective"
        ])
      }
    ]
  ]);

export const INITIAL_AMBIGUOUS_WORD_INVENTORY = Object.freeze([
  "can",
  "watch",
  "light",
  "right",
  "plant"
]);

export const V1_AMBIGUOUS_WORD_GROUPS: Readonly<Record<string, string>> =
  Object.freeze({
    can: "can_modal_vs_noun",
    watch: "watch_verb_vs_noun",
    light: "light_adjective_vs_noun",
    right: "right_adjective_vs_adverb_or_noun",
    plant: "plant_verb_vs_noun"
  });

export function getV1AmbiguityGroupForWord(
  word: string | undefined
): string | undefined {
  if (!word) {
    return undefined;
  }

  return V1_AMBIGUOUS_WORD_GROUPS[word.trim().toLowerCase()];
}

export function isV1AmbiguousWord(word: string | undefined): boolean {
  return getV1AmbiguityGroupForWord(word) !== undefined;
}
