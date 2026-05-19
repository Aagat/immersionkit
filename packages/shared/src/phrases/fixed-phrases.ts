import { normalizeAndTokenize } from "../text/tokenize";
import type { PhraseCategory } from "./types";

type FixedPhraseCategory = Extract<PhraseCategory, "fixed-idiom" | "function-phrase">;

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
    minBand: inferFixedPhraseMinBand(sourceText),
    category,
    confidence,
    normalizedTokens: normalizeAndTokenize(sourceText),
    normalizedTargetText: normalizeAndTokenize(targetText).join(" ")
  };
}

function createBandedFixedPhraseEntry(
  phraseId: string,
  sourceText: string,
  targetText: string,
  minBand: string,
  category: FixedPhraseCategory,
  confidence: number
): FixedPhraseLexiconEntry {
  return {
    phraseId,
    sourceText,
    targetText,
    minBand,
    category,
    confidence,
    normalizedTokens: normalizeAndTokenize(sourceText),
    normalizedTargetText: normalizeAndTokenize(targetText).join(" ")
  };
}

const FIXED_PHRASE_MIN_BAND_BY_NORMALIZED_SOURCE = new Map<string, string>([
  ["at home", "level-1a"],
  ["right now", "level-1a"],
  ["a lot", "level-1a"],
  ["very good", "level-1a"],
  ["good idea", "level-1a"],
  ["in the morning", "level-1b"],
  ["on monday", "level-1b"],
  ["at school", "level-1b"],
  ["this week", "level-1b"],
  ["sometimes", "level-1b"],
  ["every week", "level-1b"],
  ["of course", "level-1c"],
  ["for now", "level-1c"],
  ["not now", "level-1c"],
  ["little by little", "level-1c"],
  ["more or less", "level-1c"],
  ["every day", "level-2a"],
  ["on the way", "level-2a"],
  ["next week", "level-2a"],
  ["go to", "level-2a"],
  ["come from", "level-2a"],
  ["at work", "level-2a"],
  ["going to", "level-2b"],
  ["have to", "level-2b"],
  ["take care of", "level-2b"],
  ["make sure", "level-2b"],
  ["last night", "level-2b"],
  ["this afternoon", "level-2b"],
  ["more than", "level-2c"],
  ["less than", "level-2c"],
  ["a few", "level-2c"],
  ["the same as", "level-2c"],
  ["the most", "level-2c"],
  ["as much as", "level-2c"],
  ["in the middle of", "level-3a"],
  ["on the way to", "level-3a"],
  ["right before", "level-3a"],
  ["while", "level-3a"],
  ["at the moment", "level-3a"],
  ["because of", "level-3b"],
  ["after that", "level-3b"],
  ["at the end", "level-3b"],
  ["before that", "level-3b"],
  ["from time to time", "level-3b"],
  ["in order to", "level-3c"],
  ["as soon as", "level-3c"],
  ["used to", "level-3c"],
  ["according to", "level-3c"],
  ["in the same way", "level-3c"],
  ["by the way", "level-3c"],
  ["for example", "level-4a"],
  ["as a result", "level-4a"],
  ["in fact", "level-4a"],
  ["although", "level-4a"],
  ["in general", "level-4a"],
  ["for this reason", "level-4a"],
  ["on the other hand", "level-4b"],
  ["at least", "level-4b"],
  ["as well as", "level-4b"],
  ["however", "level-4b"],
  ["if possible", "level-4b"],
  ["in that case", "level-4b"],
  ["in terms of", "level-5a"],
  ["with respect to", "level-5a"],
  ["to some extent", "level-5a"],
  ["given that", "level-5a"],
  ["despite this", "level-5a"],
  ["in practice", "level-5a"],
  ["as opposed to", "level-5b"],
  ["in light of", "level-5b"],
  ["for the sake of", "level-5b"],
  ["nevertheless", "level-5b"],
  ["provided that", "level-5b"],
  ["in retrospect", "level-5b"]
]);

function inferFixedPhraseMinBand(sourceText: string): string {
  return (
    FIXED_PHRASE_MIN_BAND_BY_NORMALIZED_SOURCE.get(
      normalizeAndTokenize(sourceText).join(" ")
    ) ?? "level-5b"
  );
}

const BASE_FIXED_PHRASE_LEXICON: readonly FixedPhraseLexiconEntry[] = [
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

const EXPANDED_FIXED_PHRASE_LEXICON: readonly FixedPhraseLexiconEntry[] = [
  createBandedFixedPhraseEntry(
    "fixed-common-a-little-bit-of",
    "a little bit of",
    "un poco de",
    "level-1a",
    "function-phrase",
    0.93
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-for-me",
    "for me",
    "para mí",
    "level-1a",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-good-afternoon",
    "good afternoon",
    "buenas tardes",
    "level-1a",
    "fixed-idiom",
    0.96
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-good-evening",
    "good evening",
    "buenas noches",
    "level-1a",
    "fixed-idiom",
    0.95
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-good-morning",
    "good morning",
    "buenos días",
    "level-1a",
    "fixed-idiom",
    0.96
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-good-night",
    "good night",
    "buenas noches",
    "level-1a",
    "fixed-idiom",
    0.95
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-i-am-from",
    "I am from",
    "soy de",
    "level-1a",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-i-do-not-understand",
    "I do not understand",
    "no entiendo",
    "level-1a",
    "fixed-idiom",
    0.94
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-i-live-in",
    "I live in",
    "vivo en",
    "level-1a",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-i-understand",
    "I understand",
    "entiendo",
    "level-1a",
    "fixed-idiom",
    0.93
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-it-is-fine",
    "it is fine",
    "está bien",
    "level-1a",
    "fixed-idiom",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-it-is-okay",
    "it is okay",
    "está bien",
    "level-1a",
    "fixed-idiom",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-just-a-moment",
    "just a moment",
    "un momento",
    "level-1a",
    "fixed-idiom",
    0.93
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-my-name-is",
    "my name is",
    "me llamo",
    "level-1a",
    "function-phrase",
    0.93
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-nice-to-meet-you",
    "nice to meet you",
    "mucho gusto",
    "level-1a",
    "fixed-idiom",
    0.95
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-no-thank-you",
    "no thank you",
    "no, gracias",
    "level-1a",
    "fixed-idiom",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-not-bad",
    "not bad",
    "no está mal",
    "level-1a",
    "fixed-idiom",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-one-moment",
    "one moment",
    "un momento",
    "level-1a",
    "fixed-idiom",
    0.93
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-see-you-later",
    "see you later",
    "hasta luego",
    "level-1a",
    "fixed-idiom",
    0.95
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-see-you-soon",
    "see you soon",
    "hasta pronto",
    "level-1a",
    "fixed-idiom",
    0.94
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-see-you-tomorrow",
    "see you tomorrow",
    "hasta mañana",
    "level-1a",
    "fixed-idiom",
    0.94
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-thank-you-for",
    "thank you for",
    "gracias por",
    "level-1a",
    "function-phrase",
    0.94
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-thanks-for",
    "thanks for",
    "gracias por",
    "level-1a",
    "function-phrase",
    0.93
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-that-is-fine",
    "that is fine",
    "está bien",
    "level-1a",
    "fixed-idiom",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-very-well",
    "very well",
    "muy bien",
    "level-1a",
    "fixed-idiom",
    0.94
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-what-is-your-name",
    "what is your name",
    "cómo te llamas",
    "level-1a",
    "fixed-idiom",
    0.93
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-with-me",
    "with me",
    "conmigo",
    "level-1a",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-without-me",
    "without me",
    "sin mí",
    "level-1a",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-yes-please",
    "yes please",
    "sí, por favor",
    "level-1a",
    "fixed-idiom",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-around-here",
    "around here",
    "por aquí",
    "level-1b",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-at-night",
    "at night",
    "por la noche",
    "level-1b",
    "function-phrase",
    0.93
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-at-the-airport",
    "at the airport",
    "en el aeropuerto",
    "level-1b",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-at-the-hotel",
    "at the hotel",
    "en el hotel",
    "level-1b",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-at-the-office",
    "at the office",
    "en la oficina",
    "level-1b",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-at-the-restaurant",
    "at the restaurant",
    "en el restaurante",
    "level-1b",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-at-the-station",
    "at the station",
    "en la estación",
    "level-1b",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-at-the-store",
    "at the store",
    "en la tienda",
    "level-1b",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-at-the-weekend",
    "at the weekend",
    "el fin de semana",
    "level-1b",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-before-work",
    "before work",
    "antes del trabajo",
    "level-1b",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-from-here",
    "from here",
    "desde aquí",
    "level-1b",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-the-afternoon",
    "in the afternoon",
    "por la tarde",
    "level-1b",
    "function-phrase",
    0.93
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-the-evening",
    "in the evening",
    "por la noche",
    "level-1b",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-inside-the-house",
    "inside the house",
    "dentro de la casa",
    "level-1b",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-last-week",
    "last week",
    "la semana pasada",
    "level-1b",
    "function-phrase",
    0.93
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-near-here",
    "near here",
    "cerca de aquí",
    "level-1b",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-next-time",
    "next time",
    "la próxima vez",
    "level-1b",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-on-the-weekend",
    "on the weekend",
    "el fin de semana",
    "level-1b",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-on-time",
    "on time",
    "a tiempo",
    "level-1b",
    "function-phrase",
    0.94
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-outside-the-house",
    "outside the house",
    "fuera de la casa",
    "level-1b",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-over-there",
    "over there",
    "por allí",
    "level-1b",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-right-here",
    "right here",
    "aquí mismo",
    "level-1b",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-this-month",
    "this month",
    "este mes",
    "level-1b",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-this-morning",
    "this morning",
    "esta mañana",
    "level-1b",
    "function-phrase",
    0.94
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-tomorrow-morning",
    "tomorrow morning",
    "mañana por la mañana",
    "level-1b",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-tonight",
    "tonight",
    "esta noche",
    "level-1b",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-too-early",
    "too early",
    "demasiado temprano",
    "level-1b",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-too-late",
    "too late",
    "demasiado tarde",
    "level-1b",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-all-day",
    "all day",
    "todo el día",
    "level-1c",
    "function-phrase",
    0.93
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-already-done",
    "all done",
    "ya está",
    "level-1c",
    "fixed-idiom",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-all-night",
    "all night",
    "toda la noche",
    "level-1c",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-all-week",
    "all week",
    "toda la semana",
    "level-1c",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-at-first",
    "at first",
    "al principio",
    "level-1c",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-at-last",
    "at last",
    "por fin",
    "level-1c",
    "fixed-idiom",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-by-email",
    "by email",
    "por correo electrónico",
    "level-1c",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-by-hand",
    "by hand",
    "a mano",
    "level-1c",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-by-phone",
    "by phone",
    "por teléfono",
    "level-1c",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-every-morning",
    "every morning",
    "cada mañana",
    "level-1c",
    "function-phrase",
    0.93
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-every-night",
    "every night",
    "cada noche",
    "level-1c",
    "function-phrase",
    0.93
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-every-time",
    "every time",
    "cada vez",
    "level-1c",
    "function-phrase",
    0.93
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-for-free",
    "for free",
    "gratis",
    "level-1c",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-advance",
    "in advance",
    "por adelantado",
    "level-1c",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-english",
    "in English",
    "en inglés",
    "level-1c",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-person",
    "in person",
    "en persona",
    "level-1c",
    "function-phrase",
    0.93
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-spanish",
    "in Spanish",
    "en español",
    "level-1c",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-not-at-all",
    "not at all",
    "para nada",
    "level-1c",
    "fixed-idiom",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-not-yet",
    "not yet",
    "todavía no",
    "level-1c",
    "function-phrase",
    0.94
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-on-foot",
    "on foot",
    "a pie",
    "level-1c",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-on-purpose",
    "on purpose",
    "a propósito",
    "level-1c",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-once-again",
    "once again",
    "una vez más",
    "level-1c",
    "function-phrase",
    0.93
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-one-more-time",
    "one more time",
    "una vez más",
    "level-1c",
    "function-phrase",
    0.93
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-sooner-or-later",
    "sooner or later",
    "tarde o temprano",
    "level-1c",
    "fixed-idiom",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-across-from",
    "across from",
    "enfrente de",
    "level-2a",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-after-dinner",
    "after dinner",
    "después de cenar",
    "level-2a",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-after-lunch",
    "after lunch",
    "después del almuerzo",
    "level-2a",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-as-usual",
    "as usual",
    "como de costumbre",
    "level-2a",
    "fixed-idiom",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-at-lunch",
    "at lunch",
    "durante el almuerzo",
    "level-2a",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-at-the-same-time",
    "at the same time",
    "al mismo tiempo",
    "level-2a",
    "function-phrase",
    0.93
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-before-dinner",
    "before dinner",
    "antes de cenar",
    "level-2a",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-before-lunch",
    "before lunch",
    "antes del almuerzo",
    "level-2a",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-close-to",
    "close to",
    "cerca de",
    "level-2a",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-day-by-day",
    "day by day",
    "día a día",
    "level-2a",
    "fixed-idiom",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-far-from",
    "far from",
    "lejos de",
    "level-2a",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-for-a-long-time",
    "for a long time",
    "durante mucho tiempo",
    "level-2a",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-for-a-moment",
    "for a moment",
    "por un momento",
    "level-2a",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-for-a-while",
    "for a while",
    "por un rato",
    "level-2a",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-from-now-on",
    "from now on",
    "de ahora en adelante",
    "level-2a",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-a-few-days",
    "in a few days",
    "en unos días",
    "level-2a",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-a-few-minutes",
    "in a few minutes",
    "en unos minutos",
    "level-2a",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-a-minute",
    "in a minute",
    "en un minuto",
    "level-2a",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-front-of",
    "in front of",
    "delante de",
    "level-2a",
    "function-phrase",
    0.93
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-next-to",
    "next to",
    "junto a",
    "level-2a",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-on-the-way-back",
    "on the way back",
    "de regreso",
    "level-2a",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-on-the-way-home",
    "on the way home",
    "de camino a casa",
    "level-2a",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-right-away",
    "right away",
    "enseguida",
    "level-2a",
    "fixed-idiom",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-so-far",
    "so far",
    "hasta ahora",
    "level-2a",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-step-by-step",
    "step by step",
    "paso a paso",
    "level-2a",
    "fixed-idiom",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-up-to-now",
    "up to now",
    "hasta ahora",
    "level-2a",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-a-few-days-ago",
    "a few days ago",
    "hace unos días",
    "level-2b",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-a-few-minutes-ago",
    "a few minutes ago",
    "hace unos minutos",
    "level-2b",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-a-few-years-ago",
    "a few years ago",
    "hace unos años",
    "level-2b",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-a-long-time-ago",
    "a long time ago",
    "hace mucho tiempo",
    "level-2b",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-just-now",
    "just now",
    "hace un momento",
    "level-2b",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-last-month",
    "last month",
    "el mes pasado",
    "level-2b",
    "function-phrase",
    0.93
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-last-weekend",
    "last weekend",
    "el fin de semana pasado",
    "level-2b",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-last-year",
    "last year",
    "el año pasado",
    "level-2b",
    "function-phrase",
    0.93
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-next-month",
    "next month",
    "el próximo mes",
    "level-2b",
    "function-phrase",
    0.93
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-next-year",
    "next year",
    "el próximo año",
    "level-2b",
    "function-phrase",
    0.93
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-this-weekend",
    "this weekend",
    "este fin de semana",
    "level-2b",
    "function-phrase",
    0.93
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-this-year",
    "this year",
    "este año",
    "level-2b",
    "function-phrase",
    0.93
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-at-most",
    "at most",
    "como máximo",
    "level-2c",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-away-from",
    "away from",
    "lejos de",
    "level-2c",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-instead-of",
    "instead of",
    "en lugar de",
    "level-2c",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-rather-than",
    "rather than",
    "en lugar de",
    "level-2c",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-such-as",
    "such as",
    "como",
    "level-2c",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-thanks-to",
    "thanks to",
    "gracias a",
    "level-2c",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-the-day-after",
    "the day after",
    "al día siguiente",
    "level-2c",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-the-day-after-tomorrow",
    "the day after tomorrow",
    "pasado mañana",
    "level-2c",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-the-day-before",
    "the day before",
    "el día anterior",
    "level-2c",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-the-day-before-yesterday",
    "the day before yesterday",
    "anteayer",
    "level-2c",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-the-next-day",
    "the next day",
    "al día siguiente",
    "level-2c",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-together-with",
    "together with",
    "junto con",
    "level-2c",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-at-the-beginning",
    "at the beginning",
    "al principio",
    "level-3a",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-at-the-center-of",
    "at the center of",
    "en el centro de",
    "level-3a",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-at-the-start",
    "at the start",
    "al comienzo",
    "level-3a",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-during-the-day",
    "during the day",
    "durante el día",
    "level-3a",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-during-the-night",
    "during the night",
    "durante la noche",
    "level-3a",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-during-the-week",
    "during the week",
    "durante la semana",
    "level-3a",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-for-the-moment",
    "for the moment",
    "por el momento",
    "level-3a",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-progress",
    "in progress",
    "en curso",
    "level-3a",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-right-after",
    "right after",
    "justo después de",
    "level-3a",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-after-a-few-days",
    "after a few days",
    "después de unos días",
    "level-3b",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-after-a-few-minutes",
    "after a few minutes",
    "después de unos minutos",
    "level-3b",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-after-a-while",
    "after a while",
    "después de un rato",
    "level-3b",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-at-that-time",
    "at that time",
    "en ese momento",
    "level-3b",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-at-the-time",
    "at the time",
    "en ese momento",
    "level-3b",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-because-of-that",
    "because of that",
    "por eso",
    "level-3b",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-day-after-day",
    "day after day",
    "día tras día",
    "level-3b",
    "fixed-idiom",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-for-that-reason",
    "for that reason",
    "por esa razón",
    "level-3b",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-for-the-first-time",
    "for the first time",
    "por primera vez",
    "level-3b",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-for-the-last-time",
    "for the last time",
    "por última vez",
    "level-3b",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-from-then-on",
    "from then on",
    "a partir de entonces",
    "level-3b",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-the-end",
    "in the end",
    "al final",
    "level-3b",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-once-upon-a-time",
    "once upon a time",
    "había una vez",
    "level-3b",
    "fixed-idiom",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-over-time",
    "over time",
    "con el tiempo",
    "level-3b",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-year-after-year",
    "year after year",
    "año tras año",
    "level-3b",
    "fixed-idiom",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-as-part-of",
    "as part of",
    "como parte de",
    "level-3c",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-as-soon-as-possible",
    "as soon as possible",
    "lo antes posible",
    "level-3c",
    "fixed-idiom",
    0.93
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-for-this-purpose",
    "for this purpose",
    "con este propósito",
    "level-3c",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-addition-to",
    "in addition to",
    "además de",
    "level-3c",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-this-way",
    "in this way",
    "de esta manera",
    "level-3c",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-on-the-one-hand",
    "on the one hand",
    "por un lado",
    "level-3c",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-thanks-to-this",
    "thanks to this",
    "gracias a esto",
    "level-3c",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-with-the-goal-of",
    "with the goal of",
    "con el objetivo de",
    "level-3c",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-with-the-help-of",
    "with the help of",
    "con la ayuda de",
    "level-3c",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-as-a-result-of",
    "as a result of",
    "como resultado de",
    "level-4a",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-as-expected",
    "as expected",
    "como se esperaba",
    "level-4a",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-as-mentioned-above",
    "as mentioned above",
    "como se mencionó anteriormente",
    "level-4a",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-as-noted-above",
    "as noted above",
    "como se señaló anteriormente",
    "level-4a",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-as-shown-below",
    "as shown below",
    "como se muestra a continuación",
    "level-4a",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-for-instance",
    "for instance",
    "por ejemplo",
    "level-4a",
    "function-phrase",
    0.93
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-many-cases",
    "in many cases",
    "en muchos casos",
    "level-4a",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-most-cases",
    "in most cases",
    "en la mayoría de los casos",
    "level-4a",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-other-words",
    "in other words",
    "en otras palabras",
    "level-4a",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-particular",
    "in particular",
    "en particular",
    "level-4a",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-short",
    "in short",
    "en resumen",
    "level-4a",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-some-cases",
    "in some cases",
    "en algunos casos",
    "level-4a",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-summary",
    "in summary",
    "en resumen",
    "level-4a",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-on-average",
    "on average",
    "en promedio",
    "level-4a",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-above-all",
    "above all",
    "sobre todo",
    "level-4b",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-as-a-whole",
    "as a whole",
    "en conjunto",
    "level-4b",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-as-if",
    "as if",
    "como si",
    "level-4b",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-as-well",
    "as well",
    "también",
    "level-4b",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-even-if",
    "even if",
    "incluso si",
    "level-4b",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-even-though",
    "even though",
    "aunque",
    "level-4b",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-if-necessary",
    "if necessary",
    "si es necesario",
    "level-4b",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-if-needed",
    "if needed",
    "si es necesario",
    "level-4b",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-any-case",
    "in any case",
    "en cualquier caso",
    "level-4b",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-case-of",
    "in case of",
    "en caso de",
    "level-4b",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-comparison-with",
    "in comparison with",
    "en comparación con",
    "level-4b",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-contrast",
    "in contrast",
    "en contraste",
    "level-4b",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-this-case",
    "in this case",
    "en este caso",
    "level-4b",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-on-the-contrary",
    "on the contrary",
    "por el contrario",
    "level-4b",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-to-be-clear",
    "to be clear",
    "para dejarlo claro",
    "level-4b",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-under-the-same-conditions",
    "under the same conditions",
    "bajo las mismas condiciones",
    "level-4b",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-under-these-conditions",
    "under these conditions",
    "bajo estas condiciones",
    "level-4b",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-as-a-matter-of-fact",
    "as a matter of fact",
    "de hecho",
    "level-5a",
    "fixed-idiom",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-as-discussed-above",
    "as discussed above",
    "como se discutió anteriormente",
    "level-5a",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-as-noted-earlier",
    "as noted earlier",
    "como se señaló antes",
    "level-5a",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-from-the-point-of-view-of",
    "from the point of view of",
    "desde el punto de vista de",
    "level-5a",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-from-this-perspective",
    "from this perspective",
    "desde esta perspectiva",
    "level-5a",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-a-broader-sense",
    "in a broader sense",
    "en un sentido más amplio",
    "level-5a",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-accordance-with",
    "in accordance with",
    "de acuerdo con",
    "level-5a",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-relation-to",
    "in relation to",
    "en relación con",
    "level-5a",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-the-absence-of",
    "in the absence of",
    "en ausencia de",
    "level-5a",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-the-context-of",
    "in the context of",
    "en el contexto de",
    "level-5a",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-the-presence-of",
    "in the presence of",
    "en presencia de",
    "level-5a",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-on-the-basis-of",
    "on the basis of",
    "sobre la base de",
    "level-5a",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-to-a-certain-extent",
    "to a certain extent",
    "hasta cierto punto",
    "level-5a",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-to-a-large-extent",
    "to a large extent",
    "en gran medida",
    "level-5a",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-with-regard-to",
    "with regard to",
    "con respecto a",
    "level-5a",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-with-the-exception-of",
    "with the exception of",
    "a excepción de",
    "level-5a",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-all-things-considered",
    "all things considered",
    "considerándolo todo",
    "level-5b",
    "fixed-idiom",
    0.88
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-by-virtue-of",
    "by virtue of",
    "en virtud de",
    "level-5b",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-for-all-practical-purposes",
    "for all practical purposes",
    "a efectos prácticos",
    "level-5b",
    "fixed-idiom",
    0.88
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-for-the-purposes-of",
    "for the purposes of",
    "para los fines de",
    "level-5b",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-light-of-the-above",
    "in light of the above",
    "a la luz de lo anterior",
    "level-5b",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-spite-of",
    "in spite of",
    "a pesar de",
    "level-5b",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-the-event-that",
    "in the event that",
    "en caso de que",
    "level-5b",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-the-long-run",
    "in the long run",
    "a largo plazo",
    "level-5b",
    "fixed-idiom",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-the-meantime",
    "in the meantime",
    "mientras tanto",
    "level-5b",
    "function-phrase",
    0.92
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-in-the-short-term",
    "in the short term",
    "a corto plazo",
    "level-5b",
    "function-phrase",
    0.91
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-insofar-as",
    "insofar as",
    "en la medida en que",
    "level-5b",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-notwithstanding-the-fact-that",
    "notwithstanding the fact that",
    "no obstante el hecho de que",
    "level-5b",
    "function-phrase",
    0.88
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-on-balance",
    "on balance",
    "en conjunto",
    "level-5b",
    "function-phrase",
    0.88
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-with-a-view-to",
    "with a view to",
    "con miras a",
    "level-5b",
    "function-phrase",
    0.9
  ),
  createBandedFixedPhraseEntry(
    "fixed-common-with-reference-to",
    "with reference to",
    "con referencia a",
    "level-5b",
    "function-phrase",
    0.9
  )
];

export const FIXED_PHRASE_LEXICON: readonly FixedPhraseLexiconEntry[] = [
  ...BASE_FIXED_PHRASE_LEXICON,
  ...EXPANDED_FIXED_PHRASE_LEXICON
];

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
