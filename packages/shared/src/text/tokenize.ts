import { normalizeToken } from "./normalize";

const TOKEN_PATTERN = /[A-Za-z0-9]+(?:[’'-][A-Za-z0-9]+)*/g;

export type TokenizedWord = {
  raw: string;
  normalized: string;
  start: number;
  end: number;
};

export function tokenizeForLookup(input: string): TokenizedWord[] {
  const tokens: TokenizedWord[] = [];
  const matches = input.matchAll(new RegExp(TOKEN_PATTERN));

  for (const match of matches) {
    const raw = match[0];
    const start = match.index ?? 0;
    const normalized = normalizeToken(raw);

    if (!normalized) {
      continue;
    }

    tokens.push({
      raw,
      normalized,
      start,
      end: start + raw.length
    });
  }

  return tokens;
}

export function tokenizePlainText(input: string): string[] {
  return tokenizeForLookup(input).map((token) => token.raw);
}

export function normalizeAndTokenize(input: string): string[] {
  return tokenizeForLookup(input).map((token) => token.normalized);
}
