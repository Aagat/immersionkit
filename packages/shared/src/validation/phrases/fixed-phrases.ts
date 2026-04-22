import { normalizeAndTokenize } from "../../text/tokenize";
import type { PhraseCategory } from "./types";

type FixedPhraseCategory = Extract<PhraseCategory, "fixed-idiom" | "function-phrase">;

export type FixedPhraseLexiconEntry = {
  phraseId: string;
  sourceText: string;
  category: FixedPhraseCategory;
  confidence: number;
  normalizedTokens: string[];
};

function createFixedPhraseEntry(
  phraseId: string,
  sourceText: string,
  category: FixedPhraseCategory,
  confidence: number
): FixedPhraseLexiconEntry {
  return {
    phraseId,
    sourceText,
    category,
    confidence,
    normalizedTokens: normalizeAndTokenize(sourceText)
  };
}

export const FIXED_PHRASE_LEXICON: readonly FixedPhraseLexiconEntry[] = [
  createFixedPhraseEntry("fixed-by-the-way", "by the way", "fixed-idiom", 0.97),
  createFixedPhraseEntry(
    "fixed-on-the-other-hand",
    "on the other hand",
    "fixed-idiom",
    0.97
  ),
  createFixedPhraseEntry("fixed-as-soon-as", "as soon as", "function-phrase", 0.95),
  createFixedPhraseEntry("fixed-at-least", "at least", "function-phrase", 0.94),
  createFixedPhraseEntry("fixed-in-order-to", "in order to", "function-phrase", 0.94),
  createFixedPhraseEntry("fixed-take-care-of", "take care of", "function-phrase", 0.93)
];
