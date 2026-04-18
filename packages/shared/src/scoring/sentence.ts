export type SentenceScore = {
  knownWordCount: number;
  totalWordCount: number;
  knownRatio: number;
};

export function scoreSentenceByKnownWords(
  knownWords: number,
  totalWords: number
): SentenceScore {
  const safeTotal = Math.max(totalWords, 1);
  const knownRatio = knownWords / safeTotal;

  return {
    knownWordCount: knownWords,
    totalWordCount: totalWords,
    knownRatio
  };
}

export function isGoldilocksSentence(score: SentenceScore, threshold = 0.6) {
  return score.totalWordCount > 0 && score.knownRatio >= threshold;
}

