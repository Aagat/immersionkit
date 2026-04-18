import type { VocabStatus } from "../domain/models";

export type SentenceScore = {
  knownWordCount: number;
  learningWordCount: number;
  ignoredWordCount: number;
  unknownWordCount: number;
  totalWordCount: number;
  knownRatio: number;
  familiarRatio: number;
};

export type SentenceScoreInput = {
  knownWordCount: number;
  totalWordCount: number;
  learningWordCount?: number;
  ignoredWordCount?: number;
};

export type GoldilocksSentenceOptions = {
  minimumKnownRatio?: number;
  maximumKnownRatio?: number;
  minimumWordCount?: number;
  requireUnknownWords?: boolean;
};

const DEFAULT_MINIMUM_KNOWN_RATIO = 0.6;

function sanitizeCount(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

export function scoreSentence(input: SentenceScoreInput): SentenceScore {
  const knownWordCount = sanitizeCount(input.knownWordCount);
  const learningWordCount = sanitizeCount(input.learningWordCount);
  const ignoredWordCount = sanitizeCount(input.ignoredWordCount);
  const minimumTotalWordCount = knownWordCount + learningWordCount + ignoredWordCount;
  const totalWordCount = Math.max(
    sanitizeCount(input.totalWordCount),
    minimumTotalWordCount
  );
  const unknownWordCount =
    totalWordCount - knownWordCount - learningWordCount - ignoredWordCount;
  const safeTotal = Math.max(totalWordCount, 1);

  return {
    knownWordCount,
    learningWordCount,
    ignoredWordCount,
    unknownWordCount,
    totalWordCount,
    knownRatio: knownWordCount / safeTotal,
    familiarRatio: (knownWordCount + learningWordCount) / safeTotal
  };
}

export function scoreSentenceByKnownWords(
  knownWords: number,
  totalWords: number
): SentenceScore {
  return scoreSentence({
    knownWordCount: knownWords,
    totalWordCount: totalWords
  });
}

export function scoreSentenceByVocabStatuses(
  statuses: readonly VocabStatus[]
): SentenceScore {
  let knownWordCount = 0;
  let learningWordCount = 0;
  let ignoredWordCount = 0;

  for (const status of statuses) {
    if (status === "known") {
      knownWordCount += 1;
      continue;
    }

    if (status === "learning") {
      learningWordCount += 1;
      continue;
    }

    if (status === "ignored") {
      ignoredWordCount += 1;
    }
  }

  return scoreSentence({
    knownWordCount,
    learningWordCount,
    ignoredWordCount,
    totalWordCount: statuses.length
  });
}

export function isGoldilocksSentence(
  score: SentenceScore,
  thresholdOrOptions: number | GoldilocksSentenceOptions = DEFAULT_MINIMUM_KNOWN_RATIO
): boolean {
  const options =
    typeof thresholdOrOptions === "number"
      ? {
          minimumKnownRatio: thresholdOrOptions,
          maximumKnownRatio: 1,
          minimumWordCount: 1,
          requireUnknownWords: false
        }
      : {
          minimumKnownRatio:
            thresholdOrOptions.minimumKnownRatio ?? DEFAULT_MINIMUM_KNOWN_RATIO,
          maximumKnownRatio: thresholdOrOptions.maximumKnownRatio ?? 1,
          minimumWordCount: thresholdOrOptions.minimumWordCount ?? 1,
          requireUnknownWords: thresholdOrOptions.requireUnknownWords ?? false
        };

  return (
    score.totalWordCount >= options.minimumWordCount &&
    score.knownRatio >= options.minimumKnownRatio &&
    score.knownRatio <= options.maximumKnownRatio &&
    (!options.requireUnknownWords || score.unknownWordCount > 0)
  );
}
