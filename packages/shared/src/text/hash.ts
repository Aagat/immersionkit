import { normalizeSentenceText } from "./normalize";
import { normalizeAndTokenize } from "./tokenize";

export const SENTENCE_HASH_VERSION = "v1";

export function hashString(input: string) {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function normalizeSentenceForHash(input: string): string {
  const normalizedSentence = normalizeSentenceText(input).toLowerCase();
  const normalizedTokens = normalizeAndTokenize(normalizedSentence);
  return normalizedTokens.join(" ");
}

export function hashSentence(input: string): string {
  // A version prefix lets us update normalization rules without cache corruption.
  return `${SENTENCE_HASH_VERSION}:${hashString(normalizeSentenceForHash(input))}`;
}
