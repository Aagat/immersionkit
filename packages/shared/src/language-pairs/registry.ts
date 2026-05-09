import { EN_ES_LANGUAGE_PAIR } from "./en-es";
import {
  DEFAULT_LANGUAGE_PAIR_ID,
  isLanguagePairId,
  splitLanguagePairId,
  type CurriculumDefinition,
  type LanguagePairDefinition,
  type LanguagePairId
} from "./types";

const LANGUAGE_PAIR_REGISTRY = new Map<LanguagePairId, LanguagePairDefinition>(
  [[EN_ES_LANGUAGE_PAIR.id, EN_ES_LANGUAGE_PAIR]]
);

export function listLanguagePairDefinitions(): LanguagePairDefinition[] {
  return [...LANGUAGE_PAIR_REGISTRY.values()];
}

export function getLanguagePairDefinition(
  languagePair: LanguagePairId | string | null | undefined
): LanguagePairDefinition | null {
  if (!isLanguagePairId(languagePair)) {
    return null;
  }

  return LANGUAGE_PAIR_REGISTRY.get(languagePair) ?? null;
}

export function getDefaultLanguagePairDefinition(): LanguagePairDefinition {
  return EN_ES_LANGUAGE_PAIR;
}

export function resolveLanguagePairDefinition(
  languagePair: LanguagePairId | string | null | undefined
): LanguagePairDefinition {
  return getLanguagePairDefinition(languagePair) ?? getDefaultLanguagePairDefinition();
}

export function createFallbackLanguagePairDefinition(
  languagePair: LanguagePairId
): LanguagePairDefinition {
  const languages = splitLanguagePairId(languagePair);
  return {
    id: languagePair,
    sourceLanguage: languages.sourceLanguage,
    targetLanguage: languages.targetLanguage,
    displayNames: {
      sourceLanguage: languages.sourceLanguage,
      targetLanguage: languages.targetLanguage
    },
    curriculum: EN_ES_LANGUAGE_PAIR.curriculum,
    fixedPhraseLexicon: []
  };
}

export function resolveCurriculumDefinition(
  definition?: Partial<CurriculumDefinition> | null,
  languagePair: LanguagePairId | string | null | undefined = DEFAULT_LANGUAGE_PAIR_ID
): CurriculumDefinition {
  const pair = resolveLanguagePairDefinition(languagePair);
  return {
    config: definition?.config ?? pair.curriculum.config,
    content: definition?.content ?? pair.curriculum.content
  };
}

export {
  DEFAULT_LANGUAGE_PAIR_ID,
  DEFAULT_SOURCE_LANGUAGE,
  DEFAULT_TARGET_LANGUAGE,
  buildLanguagePairId,
  isLanguagePairId,
  splitLanguagePairId
} from "./types";
export type {
  CurriculumDefinition,
  LanguagePairDefinition,
  LanguagePairId,
  SourceLanguageCode,
  TargetLanguageCode
} from "./types";
