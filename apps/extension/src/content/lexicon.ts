import { normalizeToken } from "@immersionkit/shared";
import type { SeedLexiconEntry } from "@immersionkit/shared";

import { SAFE_POS } from "./constants";

export type LexiconLookup = Map<string, SeedLexiconEntry>;

const BLOCKED_SINGLE_TOKEN_SOURCE_LEMMAS = new Set(["a", "an", "the"]);

export function buildLexiconLookup(seedEntries: SeedLexiconEntry[]): LexiconLookup {
  const lookup = new Map<string, SeedLexiconEntry>();

  for (const entry of seedEntries) {
    if (!SAFE_POS.has(entry.pos)) {
      continue;
    }

    if (isBlockedLexicalKey(entry.sourceLemma)) {
      continue;
    }

    registerLexiconKey(lookup, entry.sourceLemma, entry);

    for (const inflection of entry.inflections ?? []) {
      registerLexiconKey(lookup, inflection, entry);
    }
  }

  return lookup;
}

function registerLexiconKey(
  lookup: LexiconLookup,
  rawKey: string,
  entry: SeedLexiconEntry
) {
  const normalized = normalizeToken(rawKey);
  if (!normalized) {
    return;
  }

  if (isBlockedLexicalKey(normalized)) {
    return;
  }

  const existing = lookup.get(normalized);
  lookup.set(normalized, selectPreferredEntry(existing, entry));
}

function isBlockedLexicalKey(rawKey: string): boolean {
  const normalized = normalizeToken(rawKey);
  return BLOCKED_SINGLE_TOKEN_SOURCE_LEMMAS.has(normalized);
}

function selectPreferredEntry(
  current: SeedLexiconEntry | undefined,
  candidate: SeedLexiconEntry
): SeedLexiconEntry {
  if (!current) {
    return candidate;
  }

  if (candidate.confidence !== current.confidence) {
    return candidate.confidence > current.confidence ? candidate : current;
  }

  const currentRank = current.frequencyRank ?? Number.MAX_SAFE_INTEGER;
  const candidateRank = candidate.frequencyRank ?? Number.MAX_SAFE_INTEGER;
  if (candidateRank !== currentRank) {
    return candidateRank < currentRank ? candidate : current;
  }

  return candidate.lemmaId.localeCompare(current.lemmaId) < 0 ? candidate : current;
}
