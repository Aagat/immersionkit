import { normalizeToken } from "@immersionkit/shared";
import type { SeedLexiconEntry } from "@immersionkit/shared";

import { SAFE_POS } from "./constants";

export type LexiconLookup = Map<string, SeedLexiconEntry>;

export function buildLexiconLookup(seedEntries: SeedLexiconEntry[]): LexiconLookup {
  const lookup = new Map<string, SeedLexiconEntry>();

  for (const entry of seedEntries) {
    if (!SAFE_POS.has(entry.pos)) {
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

  const existing = lookup.get(normalized);
  lookup.set(normalized, selectPreferredEntry(existing, entry));
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
