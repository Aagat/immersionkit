import type { WordInventoryEntry } from "../domain/models";
import { isFalseFriendSource } from "../curriculum/cognates";
import { normalizeToken } from "./normalize";

export type CognateEvaluation = {
  isCognate: boolean;
  similarity: number;
  reason:
    | "cognate"
    | "unsupported-language-pair"
    | "multiword-target"
    | "too-short"
    | "low-confidence"
    | "low-similarity";
};

export type BeginnerCognatePolicy = {
  evaluate: (
    entry: Pick<
      WordInventoryEntry,
      | "sourceLemma"
      | "targetLemma"
      | "confidence"
      | "sourceLanguage"
      | "targetLanguage"
    >
  ) => CognateEvaluation;
  isEligibleBand: (bandId: string | null | undefined) => boolean;
  maxFrequencyRank: number;
  discoveryRateFloor: number;
};

export const BEGINNER_COGNATE_MIN_SIMILARITY = 0.62;
export const BEGINNER_COGNATE_MIN_CONFIDENCE = 0.82;
export const BEGINNER_COGNATE_MAX_FREQUENCY_RANK = 3000;
export const BEGINNER_COGNATE_DISCOVERY_RATE_FLOOR = 0.45;

const MIN_COGNATE_TOKEN_LENGTH = 4;

export function evaluateEnglishSpanishCognate(
  entry: Pick<
    WordInventoryEntry,
    | "sourceLemma"
    | "targetLemma"
    | "confidence"
    | "sourceLanguage"
    | "targetLanguage"
  >
): CognateEvaluation {
  if (
    (entry.sourceLanguage && entry.sourceLanguage !== "en") ||
    (entry.targetLanguage && entry.targetLanguage !== "es")
  ) {
    return lowScore("unsupported-language-pair");
  }

  const source = normalizeComparableToken(entry.sourceLemma);
  const target = normalizeComparableToken(entry.targetLemma);
  if (!source || !target || source.includes(" ") || target.includes(" ")) {
    return lowScore("multiword-target");
  }

  if (
    source.length < MIN_COGNATE_TOKEN_LENGTH ||
    target.length < MIN_COGNATE_TOKEN_LENGTH
  ) {
    return lowScore("too-short");
  }

  if (isFalseFriendSource(source)) {
    return lowScore("low-similarity");
  }

  if (entry.confidence < BEGINNER_COGNATE_MIN_CONFIDENCE) {
    return {
      isCognate: false,
      similarity: scoreOrthographicSimilarity(source, target),
      reason: "low-confidence"
    };
  }

  const similarity = scoreOrthographicSimilarity(source, target);
  if (similarity < BEGINNER_COGNATE_MIN_SIMILARITY) {
    return {
      isCognate: false,
      similarity,
      reason: "low-similarity"
    };
  }

  return {
    isCognate: true,
    similarity,
    reason: "cognate"
  };
}

export function isBeginnerCognateBand(bandId: string | null | undefined): boolean {
  return typeof bandId === "string" && /^level-1[a-c]$/.test(bandId);
}

export function isBeginnerConfidenceCognate(
  entry: Pick<
    WordInventoryEntry,
    | "sourceLemma"
    | "targetLemma"
    | "confidence"
    | "frequencyRank"
    | "sourceLanguage"
    | "targetLanguage"
  >,
  policy: BeginnerCognatePolicy = ENGLISH_SPANISH_COGNATE_POLICY
): boolean {
  const rank = entry.frequencyRank;
  if (
    typeof rank !== "number" ||
    !Number.isFinite(rank) ||
    rank < 1 ||
    rank > policy.maxFrequencyRank
  ) {
    return false;
  }

  return policy.evaluate(entry).isCognate;
}

export function beginnerCognateDiscoveryRateFloor(
  entry: Pick<
    WordInventoryEntry,
    | "sourceLemma"
    | "targetLemma"
    | "confidence"
    | "frequencyRank"
    | "sourceLanguage"
    | "targetLanguage"
  >,
  bandId: string | null | undefined,
  policy: BeginnerCognatePolicy | null = ENGLISH_SPANISH_COGNATE_POLICY
): number | null {
  if (
    !policy ||
    !policy.isEligibleBand(bandId) ||
    !isBeginnerConfidenceCognate(entry, policy)
  ) {
    return null;
  }

  return policy.discoveryRateFloor;
}

export const ENGLISH_SPANISH_COGNATE_POLICY: BeginnerCognatePolicy = {
  evaluate: evaluateEnglishSpanishCognate,
  isEligibleBand: isBeginnerCognateBand,
  maxFrequencyRank: BEGINNER_COGNATE_MAX_FREQUENCY_RANK,
  discoveryRateFloor: BEGINNER_COGNATE_DISCOVERY_RATE_FLOOR
};

export function scoreOrthographicSimilarity(left: string, right: string): number {
  const normalizedLeft = normalizeComparableToken(left);
  const normalizedRight = normalizeComparableToken(right);
  if (!normalizedLeft || !normalizedRight) {
    return 0;
  }

  if (normalizedLeft === normalizedRight) {
    return 1;
  }

  const maxLength = Math.max(normalizedLeft.length, normalizedRight.length);
  if (maxLength === 0) {
    return 0;
  }

  const distance = levenshteinDistance(normalizedLeft, normalizedRight);
  return Math.max(0, Math.min(1, 1 - distance / maxLength));
}

function normalizeComparableToken(value: string): string {
  return normalizeToken(
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ñ/g, "n")
      .replace(/Ñ/g, "n")
  );
}

function levenshteinDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost =
        left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost
      );
    }

    for (let index = 0; index < previous.length; index += 1) {
      previous[index] = current[index] ?? 0;
    }
  }

  return previous[right.length] ?? 0;
}

function lowScore(reason: CognateEvaluation["reason"]): CognateEvaluation {
  return {
    isCognate: false,
    similarity: 0,
    reason
  };
}
