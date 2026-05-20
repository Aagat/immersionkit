import type { PhraseCategory, PhraseRegistryEntry, PhraseSourceKind } from "../domain/models";
import { normalizeSentenceText, normalizeToken } from "./normalize";
import { normalizeAndTokenize } from "./tokenize";

export function normalizePhraseText(input: string): string {
  return normalizeAndTokenize(normalizeSentenceText(input)).join(" ");
}

export function buildRuntimePhraseId(input: {
  normalizedSourceText: string;
  sourceKind: PhraseSourceKind;
  normalizedTargetText: string;
}): string {
  return [
    "phrase",
    input.sourceKind,
    slugifyPhraseIdentity(input.normalizedSourceText),
    slugifyPhraseIdentity(input.normalizedTargetText)
  ].join(":");
}

export function createRuntimePhraseRegistryEntry(input: {
  sourceText: string;
  targetText: string;
  sourceKind: PhraseSourceKind;
  category: PhraseCategory;
  provenance?: PhraseRegistryEntry["provenance"];
  confidence: number;
  firstSeenAt: string;
  lastSeenAt?: string;
  exposureCount?: number;
  sourceEntryId?: string;
  minBand?: string;
}): PhraseRegistryEntry {
  const normalizedSourceText = normalizePhraseText(input.sourceText);
  const normalizedTargetText = normalizePhraseText(input.targetText);

  return {
    phraseId: buildRuntimePhraseId({
      normalizedSourceText,
      sourceKind: input.sourceKind,
      normalizedTargetText
    }),
    normalizedSourceText,
    canonicalTargetText: normalizeSentenceText(input.targetText),
    normalizedTargetText,
    minBand: input.minBand,
    sourceKind: input.sourceKind,
    category: input.category,
    provenance: input.provenance ?? "runtime",
    confidence: Math.min(1, Math.max(0, input.confidence)),
    firstSeenAt: input.firstSeenAt,
    lastSeenAt: input.lastSeenAt ?? input.firstSeenAt,
    exposureCount: Math.max(0, Math.floor(input.exposureCount ?? 0)),
    sourceEntryId: input.sourceEntryId
  };
}

function slugifyPhraseIdentity(input: string): string {
  const normalized = normalizeToken(input).replace(/[^a-z0-9]+/g, "-");
  return normalized.replace(/^-+|-+$/g, "") || "empty";
}
