import {
  DEFAULT_CURRICULUM_CONTENT
} from "../curriculum/content";
import { DEFAULT_CURRICULUM_CONFIG } from "../curriculum/config";
import { FIXED_PHRASE_LEXICON } from "../phrases/fixed-phrases";
import { ENGLISH_SPANISH_COGNATE_POLICY } from "../text/cognates";
import {
  DEFAULT_LANGUAGE_PAIR_ID,
  DEFAULT_SOURCE_LANGUAGE,
  DEFAULT_TARGET_LANGUAGE,
  type LanguagePairDefinition
} from "./types";

export const EN_ES_LANGUAGE_PAIR: LanguagePairDefinition = {
  id: DEFAULT_LANGUAGE_PAIR_ID,
  sourceLanguage: DEFAULT_SOURCE_LANGUAGE,
  targetLanguage: DEFAULT_TARGET_LANGUAGE,
  displayNames: {
    sourceLanguage: "English",
    targetLanguage: "Spanish"
  },
  curriculum: {
    config: DEFAULT_CURRICULUM_CONFIG,
    content: DEFAULT_CURRICULUM_CONTENT
  },
  fixedPhraseLexicon: FIXED_PHRASE_LEXICON,
  beginnerCognatePolicy: ENGLISH_SPANISH_COGNATE_POLICY
};
