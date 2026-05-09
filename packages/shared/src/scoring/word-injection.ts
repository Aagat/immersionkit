import {
  SAFE_INJECTION_POS_VALUES,
  type ContextChunkType,
  type ContextualWordCandidate,
  type ObservedContextPos
} from "../domain/models";

export const WORD_INJECTION_DECISIONS = ["inject", "skip"] as const;

export type WordInjectionDecision = (typeof WORD_INJECTION_DECISIONS)[number];

export type WordInjectionDecisionCode =
  | "content-baseline-safe-pos"
  | "content-baseline-unsafe-pos"
  | "group-not-in-inventory"
  | "low-confidence"
  | "blocked-observed-pos"
  | "blocked-context-signature"
  | "insufficient-context-evidence"
  | "context-evidence-accepted";

export type WordInjectionDecisionResult = {
  decision: WordInjectionDecision;
  code: WordInjectionDecisionCode;
  reason: string;
};

export type ContextualAmbiguityRule = {
  ambiguityGroup: string;
  minimumConfidence: number;
  allowedObservedPos: ReadonlySet<ObservedContextPos>;
  blockedObservedPos: ReadonlySet<ObservedContextPos>;
  allowedChunkTypes: ReadonlySet<ContextChunkType>;
  requiredContextEvidence: ReadonlySet<string>;
  blockedContextEvidence: ReadonlySet<string>;
};

const SAFE_INJECTABLE_POS = new Set(SAFE_INJECTION_POS_VALUES);

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

export function evaluateContentBaselineDecision(
  candidate: ContextualWordCandidate
): WordInjectionDecisionResult {
  if (!SAFE_INJECTABLE_POS.has(candidate.candidatePos)) {
    return {
      decision: "skip",
      code: "content-baseline-unsafe-pos",
      reason: `Content baseline rejects ${candidate.candidatePos} outside the safe POS set.`
    };
  }

  return {
    decision: "inject",
    code: "content-baseline-safe-pos",
    reason: `Content baseline injects ${candidate.candidateLemma} because ${candidate.candidatePos} is in the safe POS set.`
  };
}

export function evaluateContextAwareDecision(
  candidate: ContextualWordCandidate
): WordInjectionDecisionResult {
  const rule = CONTEXTUAL_AMBIGUITY_RULES.get(candidate.ambiguityGroup);
  if (!rule) {
    return {
      decision: "skip",
      code: "group-not-in-inventory",
      reason: `No ambiguity rule exists for ${candidate.ambiguityGroup}, so the candidate is skipped by default.`
    };
  }

  const confidence = clampUnitInterval(candidate.confidence);
  if (confidence < rule.minimumConfidence) {
    return {
      decision: "skip",
      code: "low-confidence",
      reason: `Confidence ${confidence.toFixed(2)} is below ${rule.minimumConfidence.toFixed(2)}.`
    };
  }

  if (rule.blockedObservedPos.has(candidate.observedPos)) {
    return {
      decision: "skip",
      code: "blocked-observed-pos",
      reason: `Observed POS ${candidate.observedPos} is blocked for ${candidate.ambiguityGroup}.`
    };
  }

  const blockedSignature = candidate.nearbyContextSignature.find((signature) =>
    rule.blockedContextEvidence.has(signature)
  );
  if (blockedSignature) {
    return {
      decision: "skip",
      code: "blocked-context-signature",
      reason: `Context signature ${blockedSignature} is blocked for ${candidate.ambiguityGroup}.`
    };
  }

  if (!rule.allowedObservedPos.has(candidate.observedPos)) {
    return {
      decision: "skip",
      code: "insufficient-context-evidence",
      reason: `Observed POS ${candidate.observedPos} is not in the allowed set for ${candidate.ambiguityGroup}.`
    };
  }

  if (!rule.allowedChunkTypes.has(candidate.chunkType)) {
    return {
      decision: "skip",
      code: "insufficient-context-evidence",
      reason: `Chunk type ${candidate.chunkType} is not allowed for ${candidate.ambiguityGroup}.`
    };
  }

  const hasRequiredEvidence = candidate.nearbyContextSignature.some((signature) =>
    rule.requiredContextEvidence.has(signature)
  );

  if (!hasRequiredEvidence) {
    return {
      decision: "skip",
      code: "insufficient-context-evidence",
      reason: `No required context signature was present for ${candidate.ambiguityGroup}.`
    };
  }

  return {
    decision: "inject",
    code: "context-evidence-accepted",
    reason: `Context evidence and confidence meet the ${candidate.ambiguityGroup} injection rule.`
  };
}

function clampUnitInterval(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}
