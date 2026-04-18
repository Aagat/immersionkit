import { normalizeToken, tokenizePlainText } from "@immersionkit/shared";

const WORD_PATTERN = /[A-Za-z]+(?:'[A-Za-z]+)*/g;

export type TextSegment =
  | {
      kind: "text";
      value: string;
      start: number;
      end: number;
    }
  | {
      kind: "word";
      value: string;
      normalized: string;
      start: number;
      end: number;
    };

export function segmentText(input: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let cursor = 0;

  for (const match of input.matchAll(WORD_PATTERN)) {
    const value = match[0];
    const start = match.index ?? 0;
    const end = start + value.length;

    if (start > cursor) {
      segments.push({
        kind: "text",
        value: input.slice(cursor, start),
        start: cursor,
        end: start
      });
    }

    const normalized = normalizeToken(value);
    if (!normalized) {
      segments.push({
        kind: "text",
        value,
        start,
        end
      });
    } else {
      segments.push({
        kind: "word",
        value,
        normalized,
        start,
        end
      });
    }

    cursor = end;
  }

  if (cursor < input.length) {
    segments.push({
      kind: "text",
      value: input.slice(cursor),
      start: cursor,
      end: input.length
    });
  }

  return segments;
}

export function normalizeSentenceWords(sentence: string): string[] {
  return tokenizePlainText(sentence)
    .map((word) => normalizeToken(word))
    .filter((word): word is string => Boolean(word));
}

export function preserveWordCasing(sourceToken: string, targetToken: string): string {
  if (!targetToken) {
    return sourceToken;
  }

  if (sourceToken === sourceToken.toUpperCase()) {
    return targetToken.toUpperCase();
  }

  const startsWithUppercase = /^[A-Z]/.test(sourceToken);
  if (startsWithUppercase) {
    return `${targetToken.charAt(0).toUpperCase()}${targetToken.slice(1)}`;
  }

  return targetToken.toLowerCase();
}
