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
