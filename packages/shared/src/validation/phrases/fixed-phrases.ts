import { normalizeAndTokenize } from "../../text/tokenize";
import type { PhraseCategory } from "./types";

type FixedPhraseCategory = Extract<PhraseCategory, "fixed-idiom" | "function-phrase">;

export type FixedPhraseLexiconEntry = {
  phraseId: string;
  sourceText: string;
  targetText: string;
  category: FixedPhraseCategory;
  confidence: number;
  normalizedTokens: string[];
  normalizedTargetText: string;
};

export type CuratedPhraseTargetEntry = {
  sourceText: string;
  targetText: string;
  sourceKind: "chunk" | "pattern-match";
  category: PhraseCategory;
  confidence: number;
  normalizedSourceText: string;
  normalizedTargetText: string;
};

function createFixedPhraseEntry(
  phraseId: string,
  sourceText: string,
  targetText: string,
  category: FixedPhraseCategory,
  confidence: number
): FixedPhraseLexiconEntry {
  return {
    phraseId,
    sourceText,
    targetText,
    category,
    confidence,
    normalizedTokens: normalizeAndTokenize(sourceText),
    normalizedTargetText: normalizeAndTokenize(targetText).join(" ")
  };
}

export const FIXED_PHRASE_LEXICON: readonly FixedPhraseLexiconEntry[] = [
  createFixedPhraseEntry(
    "fixed-by-the-way",
    "by the way",
    "por cierto",
    "fixed-idiom",
    0.97
  ),
  createFixedPhraseEntry(
    "fixed-on-the-other-hand",
    "on the other hand",
    "por otro lado",
    "fixed-idiom",
    0.97
  ),
  createFixedPhraseEntry(
    "fixed-as-soon-as",
    "as soon as",
    "en cuanto",
    "function-phrase",
    0.95
  ),
  createFixedPhraseEntry(
    "fixed-at-least",
    "at least",
    "al menos",
    "function-phrase",
    0.94
  ),
  createFixedPhraseEntry(
    "fixed-in-order-to",
    "in order to",
    "para",
    "function-phrase",
    0.94
  ),
  createFixedPhraseEntry(
    "fixed-take-care-of",
    "take care of",
    "cuidar de",
    "function-phrase",
    0.93
  )
];

function createCuratedPhraseTargetEntry(
  sourceText: string,
  targetText: string,
  sourceKind: CuratedPhraseTargetEntry["sourceKind"],
  category: PhraseCategory,
  confidence: number
): CuratedPhraseTargetEntry {
  return {
    sourceText,
    targetText,
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
    "sistema de salud publica",
    "chunk",
    "noun-chunk",
    0.93
  ),
  createCuratedPhraseTargetEntry(
    "climate change action plan",
    "plan de accion climatica",
    "chunk",
    "noun-chunk",
    0.92
  ),
  createCuratedPhraseTargetEntry(
    "customer service team",
    "equipo de atencion al cliente",
    "chunk",
    "noun-chunk",
    0.91
  ),
  createCuratedPhraseTargetEntry(
    "used to",
    "solia",
    "pattern-match",
    "grammar-carrier",
    0.9
  ),
  createCuratedPhraseTargetEntry(
    "going to",
    "va a",
    "pattern-match",
    "grammar-carrier",
    0.9
  )
];
