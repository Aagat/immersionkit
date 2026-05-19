import { normalizeAndTokenize } from "../text/tokenize";
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
    "fixed-at-home",
    "at home",
    "en casa",
    "function-phrase",
    0.95
  ),
  createFixedPhraseEntry(
    "fixed-right-now",
    "right now",
    "ahora mismo",
    "fixed-idiom",
    0.95
  ),
  createFixedPhraseEntry(
    "fixed-a-lot",
    "a lot",
    "mucho",
    "fixed-idiom",
    0.94
  ),
  createFixedPhraseEntry(
    "fixed-very-good",
    "very good",
    "muy bueno",
    "fixed-idiom",
    0.91
  ),
  createFixedPhraseEntry(
    "fixed-good-idea",
    "good idea",
    "buena idea",
    "fixed-idiom",
    0.91
  ),
  createFixedPhraseEntry(
    "fixed-by-the-way",
    "by the way",
    "por cierto",
    "fixed-idiom",
    0.97
  ),
  createFixedPhraseEntry(
    "fixed-in-the-morning",
    "in the morning",
    "por la mañana",
    "function-phrase",
    0.94
  ),
  createFixedPhraseEntry(
    "fixed-at-school",
    "at school",
    "en la escuela",
    "function-phrase",
    0.94
  ),
  createFixedPhraseEntry(
    "fixed-on-monday",
    "on Monday",
    "el lunes",
    "function-phrase",
    0.93
  ),
  createFixedPhraseEntry(
    "fixed-this-week",
    "this week",
    "esta semana",
    "function-phrase",
    0.93
  ),
  createFixedPhraseEntry(
    "fixed-sometimes",
    "sometimes",
    "a veces",
    "function-phrase",
    0.92
  ),
  createFixedPhraseEntry(
    "fixed-every-week",
    "every week",
    "cada semana",
    "function-phrase",
    0.92
  ),
  createFixedPhraseEntry(
    "fixed-of-course",
    "of course",
    "por supuesto",
    "fixed-idiom",
    0.96
  ),
  createFixedPhraseEntry(
    "fixed-for-now",
    "for now",
    "por ahora",
    "function-phrase",
    0.94
  ),
  createFixedPhraseEntry(
    "fixed-not-now",
    "not now",
    "ahora no",
    "function-phrase",
    0.92
  ),
  createFixedPhraseEntry(
    "fixed-little-by-little",
    "little by little",
    "poco a poco",
    "fixed-idiom",
    0.93
  ),
  createFixedPhraseEntry(
    "fixed-more-or-less",
    "more or less",
    "más o menos",
    "fixed-idiom",
    0.93
  ),
  createFixedPhraseEntry(
    "fixed-every-day",
    "every day",
    "todos los días",
    "function-phrase",
    0.94
  ),
  createFixedPhraseEntry(
    "fixed-on-the-way",
    "on the way",
    "en camino",
    "function-phrase",
    0.94
  ),
  createFixedPhraseEntry(
    "fixed-next-week",
    "next week",
    "la próxima semana",
    "function-phrase",
    0.94
  ),
  createFixedPhraseEntry(
    "fixed-go-to",
    "go to",
    "ir a",
    "function-phrase",
    0.9
  ),
  createFixedPhraseEntry(
    "fixed-come-from",
    "come from",
    "venir de",
    "function-phrase",
    0.9
  ),
  createFixedPhraseEntry(
    "fixed-at-work",
    "at work",
    "en el trabajo",
    "function-phrase",
    0.92
  ),
  createFixedPhraseEntry(
    "fixed-last-night",
    "last night",
    "anoche",
    "function-phrase",
    0.93
  ),
  createFixedPhraseEntry(
    "fixed-this-afternoon",
    "this afternoon",
    "esta tarde",
    "function-phrase",
    0.92
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
    "fixed-more-than",
    "more than",
    "más que",
    "function-phrase",
    0.94
  ),
  createFixedPhraseEntry(
    "fixed-less-than",
    "less than",
    "menos que",
    "function-phrase",
    0.94
  ),
  createFixedPhraseEntry(
    "fixed-a-few",
    "a few",
    "unos pocos",
    "function-phrase",
    0.93
  ),
  createFixedPhraseEntry(
    "fixed-the-most",
    "the most",
    "el más",
    "function-phrase",
    0.91
  ),
  createFixedPhraseEntry(
    "fixed-as-much-as",
    "as much as",
    "tanto como",
    "function-phrase",
    0.92
  ),
  createFixedPhraseEntry(
    "fixed-the-same-as",
    "the same as",
    "lo mismo que",
    "function-phrase",
    0.93
  ),
  createFixedPhraseEntry(
    "fixed-on-the-way-to",
    "on the way to",
    "en camino a",
    "function-phrase",
    0.92
  ),
  createFixedPhraseEntry(
    "fixed-right-before",
    "right before",
    "justo antes de",
    "function-phrase",
    0.91
  ),
  createFixedPhraseEntry(
    "fixed-while",
    "while",
    "mientras",
    "function-phrase",
    0.9
  ),
  createFixedPhraseEntry(
    "fixed-at-the-moment",
    "at the moment",
    "en este momento",
    "function-phrase",
    0.92
  ),
  createFixedPhraseEntry(
    "fixed-in-the-middle-of",
    "in the middle of",
    "en medio de",
    "function-phrase",
    0.93
  ),
  createFixedPhraseEntry(
    "fixed-before-that",
    "before that",
    "antes de eso",
    "function-phrase",
    0.92
  ),
  createFixedPhraseEntry(
    "fixed-from-time-to-time",
    "from time to time",
    "de vez en cuando",
    "fixed-idiom",
    0.92
  ),
  createFixedPhraseEntry(
    "fixed-because-of",
    "because of",
    "debido a",
    "function-phrase",
    0.94
  ),
  createFixedPhraseEntry(
    "fixed-according-to",
    "according to",
    "según",
    "function-phrase",
    0.92
  ),
  createFixedPhraseEntry(
    "fixed-in-the-same-way",
    "in the same way",
    "de la misma manera",
    "function-phrase",
    0.91
  ),
  createFixedPhraseEntry(
    "fixed-after-that",
    "after that",
    "después de eso",
    "function-phrase",
    0.93
  ),
  createFixedPhraseEntry(
    "fixed-at-the-end",
    "at the end",
    "al final",
    "function-phrase",
    0.93
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
    "fixed-for-example",
    "for example",
    "por ejemplo",
    "function-phrase",
    0.95
  ),
  createFixedPhraseEntry(
    "fixed-as-a-result",
    "as a result",
    "como resultado",
    "function-phrase",
    0.94
  ),
  createFixedPhraseEntry(
    "fixed-in-fact",
    "in fact",
    "de hecho",
    "fixed-idiom",
    0.95
  ),
  createFixedPhraseEntry(
    "fixed-although",
    "although",
    "aunque",
    "function-phrase",
    0.91
  ),
  createFixedPhraseEntry(
    "fixed-in-general",
    "in general",
    "en general",
    "function-phrase",
    0.92
  ),
  createFixedPhraseEntry(
    "fixed-for-this-reason",
    "for this reason",
    "por esta razón",
    "function-phrase",
    0.92
  ),
  createFixedPhraseEntry(
    "fixed-as-well-as",
    "as well as",
    "así como",
    "function-phrase",
    0.94
  ),
  createFixedPhraseEntry(
    "fixed-however",
    "however",
    "sin embargo",
    "function-phrase",
    0.91
  ),
  createFixedPhraseEntry(
    "fixed-if-possible",
    "if possible",
    "si es posible",
    "function-phrase",
    0.91
  ),
  createFixedPhraseEntry(
    "fixed-in-that-case",
    "in that case",
    "en ese caso",
    "function-phrase",
    0.91
  ),
  createFixedPhraseEntry(
    "fixed-in-terms-of",
    "in terms of",
    "en términos de",
    "function-phrase",
    0.93
  ),
  createFixedPhraseEntry(
    "fixed-with-respect-to",
    "with respect to",
    "con respecto a",
    "function-phrase",
    0.93
  ),
  createFixedPhraseEntry(
    "fixed-to-some-extent",
    "to some extent",
    "hasta cierto punto",
    "function-phrase",
    0.92
  ),
  createFixedPhraseEntry(
    "fixed-given-that",
    "given that",
    "dado que",
    "function-phrase",
    0.91
  ),
  createFixedPhraseEntry(
    "fixed-despite-this",
    "despite this",
    "a pesar de esto",
    "function-phrase",
    0.91
  ),
  createFixedPhraseEntry(
    "fixed-in-practice",
    "in practice",
    "en la práctica",
    "function-phrase",
    0.91
  ),
  createFixedPhraseEntry(
    "fixed-as-opposed-to",
    "as opposed to",
    "en oposición a",
    "function-phrase",
    0.92
  ),
  createFixedPhraseEntry(
    "fixed-nevertheless",
    "nevertheless",
    "no obstante",
    "function-phrase",
    0.9
  ),
  createFixedPhraseEntry(
    "fixed-provided-that",
    "provided that",
    "siempre que",
    "function-phrase",
    0.9
  ),
  createFixedPhraseEntry(
    "fixed-in-retrospect",
    "in retrospect",
    "en retrospectiva",
    "function-phrase",
    0.9
  ),
  createFixedPhraseEntry(
    "fixed-in-light-of",
    "in light of",
    "a la luz de",
    "function-phrase",
    0.92
  ),
  createFixedPhraseEntry(
    "fixed-for-the-sake-of",
    "for the sake of",
    "por el bien de",
    "function-phrase",
    0.92
  ),
  createFixedPhraseEntry(
    "fixed-take-care-of",
    "take care of",
    "cuidar de",
    "function-phrase",
    0.93
  ),
  createFixedPhraseEntry(
    "fixed-make-sure",
    "make sure",
    "asegurarse de",
    "function-phrase",
    0.92
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
    "sistema de salud pública",
    "chunk",
    "noun-chunk",
    0.93
  ),
  createCuratedPhraseTargetEntry(
    "climate change action plan",
    "plan de acción climática",
    "chunk",
    "noun-chunk",
    0.92
  ),
  createCuratedPhraseTargetEntry(
    "customer service team",
    "equipo de atención al cliente",
    "chunk",
    "noun-chunk",
    0.91
  ),
  createCuratedPhraseTargetEntry(
    "used to",
    "solía",
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
  ),
  createCuratedPhraseTargetEntry(
    "have to",
    "tener que",
    "pattern-match",
    "grammar-carrier",
    0.9
  )
];
