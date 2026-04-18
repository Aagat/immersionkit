import { hashString, isGoldilocksSentence, scoreSentenceByKnownWords } from "@immersionkit/shared";

import { DEFAULT_SENTENCE_THRESHOLD } from "./constants";
import type { SentenceCandidateMetadata } from "./contracts";
import { normalizeSentenceWords } from "./tokenize";

const SENTENCE_PATTERN = /[^.!?]+[.!?]?/g;
const MIN_WORDS_PER_SENTENCE = 5;
const MAX_WORDS_PER_SENTENCE = 32;

export type SentenceSegment = {
  text: string;
  start: number;
  end: number;
  hash: string;
  words: string[];
};

export function segmentSentences(text: string): SentenceSegment[] {
  const segments: SentenceSegment[] = [];

  for (const match of text.matchAll(SENTENCE_PATTERN)) {
    const raw = match[0] ?? "";
    const normalizedText = normalizeSentenceText(raw);
    if (!normalizedText) {
      continue;
    }

    const words = normalizeSentenceWords(normalizedText);
    if (words.length < MIN_WORDS_PER_SENTENCE || words.length > MAX_WORDS_PER_SENTENCE) {
      continue;
    }

    const start = match.index ?? 0;
    const end = start + raw.length;

    segments.push({
      text: normalizedText,
      start,
      end,
      hash: hashString(normalizedText.toLowerCase()),
      words
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
  isKnownWord: (word: string) => boolean,
  threshold = DEFAULT_SENTENCE_THRESHOLD
): SentenceCandidateMetadata[] {
  const candidates: SentenceCandidateMetadata[] = [];

  for (const sentence of sentences) {
    if (!injectedSentenceHashes.has(sentence.hash)) {
      continue;
    }

    const knownWordCount = sentence.words.reduce((count, word) => {
      return count + (isKnownWord(word) ? 1 : 0);
    }, 0);

    const score = scoreSentenceByKnownWords(knownWordCount, sentence.words.length);
    if (!isGoldilocksSentence(score, threshold)) {
      continue;
    }

    candidates.push({
      sentenceHash: sentence.hash,
      sentence: sentence.text,
      knownWordCount: score.knownWordCount,
      totalWordCount: score.totalWordCount,
      knownRatio: score.knownRatio,
      nodeId
    });
  }

  return candidates;
}

function normalizeSentenceText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}
