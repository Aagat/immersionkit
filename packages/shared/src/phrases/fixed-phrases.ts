import { normalizeAndTokenize } from "../text/tokenize";
import { FIXED_PHRASE_SOURCE_ROWS } from "./fixed-phrases.generated";
import type { PhraseCategory } from "./types";

type FixedPhraseCategory = Extract<PhraseCategory, "fixed-idiom" | "function-phrase">;

type FixedPhraseSourceRow = {
  phraseId: string;
  sourceText: string;
  targetText: string;
  minBand: string;
  category: FixedPhraseCategory;
  confidence: number;
};

export type FixedPhraseLexiconEntry = {
  phraseId: string;
  sourceText: string;
  targetText: string;
  minBand: string;
  category: FixedPhraseCategory;
  confidence: number;
  normalizedTokens: string[];
  normalizedTargetText: string;
};

export type CuratedPhraseTargetEntry = {
  sourceText: string;
  targetText: string;
  minBand: string;
  sourceKind: "chunk" | "pattern-match";
  category: PhraseCategory;
  confidence: number;
  normalizedSourceText: string;
  normalizedTargetText: string;
};

function createFixedPhraseEntry(row: FixedPhraseSourceRow): FixedPhraseLexiconEntry {
  return {
    phraseId: row.phraseId,
    sourceText: row.sourceText,
    targetText: row.targetText,
    minBand: row.minBand,
    category: row.category,
    confidence: row.confidence,
    normalizedTokens: normalizeAndTokenize(row.sourceText),
    normalizedTargetText: normalizeAndTokenize(row.targetText).join(" ")
  };
}

export const FIXED_PHRASE_LEXICON: readonly FixedPhraseLexiconEntry[] =
  FIXED_PHRASE_SOURCE_ROWS.map((row) => createFixedPhraseEntry(row));

function createCuratedPhraseTargetEntry(
  sourceText: string,
  targetText: string,
  minBand: string,
  sourceKind: CuratedPhraseTargetEntry["sourceKind"],
  category: PhraseCategory,
  confidence: number
): CuratedPhraseTargetEntry {
  return {
    sourceText,
    targetText,
    minBand,
    sourceKind,
    category,
    confidence,
    normalizedSourceText: normalizeAndTokenize(sourceText).join(" "),
    normalizedTargetText: normalizeAndTokenize(targetText).join(" ")
  };
}

export const CURATED_PHRASE_TARGET_LEXICON: readonly CuratedPhraseTargetEntry[] = [
  createCuratedPhraseTargetEntry(
    "public health care system",
    "sistema público de salud",
    "level-4a",
    "chunk",
    "noun-chunk",
    0.93
  ),
  createCuratedPhraseTargetEntry(
    "climate change action plan",
    "plan de acción climática",
    "level-5a",
    "chunk",
    "noun-chunk",
    0.92
  ),
  createCuratedPhraseTargetEntry(
    "customer service team",
    "equipo de atención al cliente",
    "level-2b",
    "chunk",
    "noun-chunk",
    0.91
  ),
  createCuratedPhraseTargetEntry(
    "used to",
    "soler + infinitivo",
    "level-3b",
    "pattern-match",
    "grammar-carrier",
    0.9
  ),
  createCuratedPhraseTargetEntry(
    "going to",
    "ir a + infinitivo",
    "level-2b",
    "pattern-match",
    "grammar-carrier",
    0.9
  ),
  createCuratedPhraseTargetEntry(
    "have to",
    "tener que + infinitivo",
    "level-2b",
    "pattern-match",
    "grammar-carrier",
    0.9
  )
];
