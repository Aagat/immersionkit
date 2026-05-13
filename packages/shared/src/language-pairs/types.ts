import type {
  CurriculumBandContent
} from "../curriculum/content";
import type { CurriculumConfig } from "../curriculum/config";
import type { FixedPhraseLexiconEntry } from "../phrases/fixed-phrases";
import type { BeginnerCognatePolicy } from "../text/cognates";

export type SourceLanguageCode = string;
export type TargetLanguageCode = string;
export type LanguagePairId = `${string}-${string}`;

export const DEFAULT_SOURCE_LANGUAGE = "en" as const satisfies SourceLanguageCode;
export const DEFAULT_TARGET_LANGUAGE = "es" as const satisfies TargetLanguageCode;
export const DEFAULT_LANGUAGE_PAIR_ID =
  "en-es" as const satisfies LanguagePairId;

export type CurriculumDefinition = {
  config: CurriculumConfig;
  content: readonly CurriculumBandContent[];
};

export type LanguagePairDefinition = {
  id: LanguagePairId;
  sourceLanguage: SourceLanguageCode;
  targetLanguage: TargetLanguageCode;
  displayNames: {
    sourceLanguage: string;
    targetLanguage: string;
    sourceLanguageNative?: string;
    targetLanguageNative?: string;
  };
  curriculum: CurriculumDefinition;
  fixedPhraseLexicon: readonly FixedPhraseLexiconEntry[];
  beginnerCognatePolicy?: BeginnerCognatePolicy;
};

export function isLanguagePairId(value: unknown): value is LanguagePairId {
  return (
    typeof value === "string" &&
    /^[a-z]{2,3}-[a-z]{2,3}$/.test(value)
  );
}

export function splitLanguagePairId(languagePair: LanguagePairId): {
  sourceLanguage: SourceLanguageCode;
  targetLanguage: TargetLanguageCode;
} {
  const [sourceLanguage, targetLanguage] = languagePair.split("-");
  return {
    sourceLanguage: sourceLanguage || DEFAULT_SOURCE_LANGUAGE,
    targetLanguage: targetLanguage || DEFAULT_TARGET_LANGUAGE
  };
}

export function buildLanguagePairId(
  sourceLanguage: SourceLanguageCode,
  targetLanguage: TargetLanguageCode
): LanguagePairId {
  return `${sourceLanguage}-${targetLanguage}` as LanguagePairId;
}
