import { hashSentence } from "./hash";
import { normalizeAndTokenize } from "./tokenize";

const SENTENCE_PATTERN = /[^.!?]+[.!?]?/g;

export type RuntimeSentenceSegment = {
  text: string;
  start: number;
  end: number;
  hash: string;
  words: string[];
};

export type TextWindow = {
  text: string;
  start: number;
  end: number;
};

export function segmentRuntimeSentences(
  text: string,
  options: {
    minWords?: number;
    maxWords?: number;
  } = {}
): RuntimeSentenceSegment[] {
  const minWords = options.minWords ?? 1;
  const maxWords = options.maxWords ?? Number.MAX_SAFE_INTEGER;
  const segments: RuntimeSentenceSegment[] = [];

  for (const match of text.matchAll(SENTENCE_PATTERN)) {
    const raw = match[0] ?? "";
    const normalizedText = normalizeSentenceText(raw);
    if (!normalizedText) {
      continue;
    }

    const words = normalizeAndTokenize(normalizedText);
    if (words.length < minWords || words.length > maxWords) {
      continue;
    }

    const start = match.index ?? 0;
    const end = start + raw.length;

    segments.push({
      text: normalizedText,
      start,
      end,
      hash: hashSentence(normalizedText),
      words
    });
  }

  return segments;
}

export function splitTextIntoWindows(input: {
  text: string;
  maxLength: number;
}): TextWindow[] {
  if (input.text.length <= input.maxLength) {
    return [
      {
        text: input.text,
        start: 0,
        end: input.text.length
      }
    ];
  }

  const windows: TextWindow[] = [];
  let windowStart = 0;
  let lastSentenceBreak = 0;

  for (const match of input.text.matchAll(SENTENCE_PATTERN)) {
    const raw = match[0] ?? "";
    const end = (match.index ?? 0) + raw.length;

    if (end - windowStart > input.maxLength && lastSentenceBreak > windowStart) {
      windows.push(createTextWindow(input.text, windowStart, lastSentenceBreak));
      windowStart = lastSentenceBreak;
    }

    while (end - windowStart > input.maxLength) {
      const splitAt = findWindowBreak(input.text, windowStart, input.maxLength);
      windows.push(createTextWindow(input.text, windowStart, splitAt));
      windowStart = splitAt;
    }

    lastSentenceBreak = end;
  }

  if (windowStart < input.text.length) {
    windows.push(createTextWindow(input.text, windowStart, input.text.length));
  }

  return windows.filter((window) => window.text.length > 0);
}

function createTextWindow(input: string, start: number, end: number): TextWindow {
  return {
    text: input.slice(start, end),
    start,
    end
  };
}

function findWindowBreak(input: string, start: number, maxLength: number): number {
  const hardLimit = Math.min(start + maxLength, input.length);
  const preferredFloor = start + Math.floor(maxLength * 0.6);

  for (let index = hardLimit; index > preferredFloor; index -= 1) {
    if (/\s/.test(input.charAt(index))) {
      return index;
    }
  }

  return hardLimit;
}

function normalizeSentenceText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}
