import {
  scoreSentenceByKnownWords,
  segmentRuntimeSentences
} from "@immersionkit/shared";

import { SENTENCE_FIXED_PHRASE_HINTS } from "./constants";
import type { SentenceCandidateMetadata } from "./contracts";
const MIN_WORDS_PER_SENTENCE = 5;
const MAX_WORDS_PER_SENTENCE = 32;

export type SentenceSegment = {
  text: string;
  start: number;
  end: number;
  hash: string;
  words: string[];
  phraseHints: string[];
};

type PhraseHintPattern = {
  phrase: string;
  regex: RegExp;
};

export function segmentSentences(
  text: string,
  extraPhraseHints: readonly string[] = []
): SentenceSegment[] {
  const segments: SentenceSegment[] = [];
  let phraseHintPatterns: PhraseHintPattern[] | null = null;

  for (const sentence of segmentRuntimeSentences(text, {
    minWords: MIN_WORDS_PER_SENTENCE,
    maxWords: MAX_WORDS_PER_SENTENCE
  })) {
    segments.push({
      ...sentence,
      phraseHints: findFixedPhraseHints(
        sentence.text,
        (phraseHintPatterns ??= createPhraseHintPatterns(extraPhraseHints))
      )
    });
  }

  return segments;
}

export function findSentenceForOffset(
  sentences: SentenceSegment[],
  offset: number
): SentenceSegment | null {
  for (const sentence of sentences) {
    if (offset >= sentence.start && offset < sentence.end) {
      return sentence;
    }
  }

  return null;
}

export function scoreSentenceCandidates(
  sentences: SentenceSegment[],
  nodeId: string,
  injectedSentenceHashes: Set<string>,
  isKnownWord: (word: string) => boolean
): SentenceCandidateMetadata[] {
  const candidates: SentenceCandidateMetadata[] = [];
  const seenHashes = new Set<string>();

  for (const sentence of sentences) {
    if (!injectedSentenceHashes.has(sentence.hash) || seenHashes.has(sentence.hash)) {
      continue;
    }

    seenHashes.add(sentence.hash);
    candidates.push(
      createCandidateMetadata(sentence, nodeId, isKnownWord, "injected-token")
    );
  }

  for (const sentence of sentences) {
    if (sentence.phraseHints.length === 0 || seenHashes.has(sentence.hash)) {
      continue;
    }

    seenHashes.add(sentence.hash);
    candidates.push(
      createCandidateMetadata(sentence, nodeId, isKnownWord, "fixed-phrase-hint")
    );
  }

  return candidates;
}

function createCandidateMetadata(
  sentence: SentenceSegment,
  nodeId: string,
  isKnownWord: (word: string) => boolean,
  reason: SentenceCandidateMetadata["reason"]
): SentenceCandidateMetadata {
  const knownWordCount = sentence.words.reduce((count, word) => {
    return count + (isKnownWord(word) ? 1 : 0);
  }, 0);
  const score = scoreSentenceByKnownWords(knownWordCount, sentence.words.length);

  return {
    sentenceHash: sentence.hash,
    sentence: sentence.text,
    knownWordCount: score.knownWordCount,
    totalWordCount: score.totalWordCount,
    knownRatio: score.knownRatio,
    nodeId,
    reason,
    phraseHints: sentence.phraseHints
  };
}

function findFixedPhraseHints(
  sentence: string,
  phraseHintPatterns: readonly PhraseHintPattern[]
): string[] {
  const normalized = ` ${sentence.toLowerCase().replace(/\s+/g, " ")} `;
  return phraseHintPatterns
    .filter(({ regex }) => regex.test(normalized))
    .map(({ phrase }) => phrase);
}

function createPhraseHintPatterns(
  extraPhraseHints: readonly string[] = []
): PhraseHintPattern[] {
  return [...new Set([...SENTENCE_FIXED_PHRASE_HINTS, ...extraPhraseHints])].map(
    (phrase) => {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return {
        phrase,
        regex: new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "i")
      };
    }
  );
}
