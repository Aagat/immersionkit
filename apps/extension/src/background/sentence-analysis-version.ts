import phraseTargetAsset from "../assets/en-es.phrase-targets.v1.json";
import {
  DEFAULT_LANGUAGE_PAIR_ID,
  hashSentence,
  normalizeToken,
  type CuratedPhraseTargetEntry,
  type FixedPhraseLexiconEntry,
  type LanguagePairId,
  type RenderUnitEntry
} from "@immersionkit/shared";
import { isRecord, readString } from "../storage/serialization";

export const RUNTIME_PHRASE_TARGET_LEXICON_BY_PAIR = new Map<
  LanguagePairId,
  readonly CuratedPhraseTargetEntry[]
>([
  [
    DEFAULT_LANGUAGE_PAIR_ID,
    parsePhraseTargetAsset(phraseTargetAsset, DEFAULT_LANGUAGE_PAIR_ID)
  ]
]);

export function getRuntimePhraseTargetsForLanguagePair(
  languagePair: LanguagePairId
): readonly CuratedPhraseTargetEntry[] {
  return RUNTIME_PHRASE_TARGET_LEXICON_BY_PAIR.get(languagePair) ?? [];
}

export function buildSentenceAnalysisVersion(
  analyzerVersion: string,
  renderUnits: readonly RenderUnitEntry[],
  curatedPhraseTargets: readonly CuratedPhraseTargetEntry[],
  fixedPhraseLexicon: readonly FixedPhraseLexiconEntry[],
  languagePair: LanguagePairId = DEFAULT_LANGUAGE_PAIR_ID
): string {
  const renderUnitSignature = renderUnits
    .map((unit) =>
      stableSerializeAnalysisSignature({
        renderUnitId: unit.renderUnitId,
        kind: unit.kind,
        renderPolicy: unit.renderPolicy,
        minBand: unit.minBand,
        sourceText: unit.sourceText,
        normalizedSourceText: unit.normalizedSourceText,
        targetText: unit.targetText ?? null,
        normalizedTargetText: unit.normalizedTargetText ?? null,
        sourcePattern: unit.sourcePattern,
        replacement: unit.replacement ?? null,
        lexemeIds: unit.lexemeIds,
        pos: unit.pos ?? null,
        frequencyRank: unit.frequencyRank ?? null,
        confidence: unit.confidence
      })
    )
    .sort()
    .join("|");
  const phraseTargetSignature = curatedPhraseTargets
    .map((entry) =>
      stableSerializeAnalysisSignature({
        sourceText: entry.sourceText,
        normalizedSourceText: entry.normalizedSourceText,
        targetText: entry.targetText,
        normalizedTargetText: entry.normalizedTargetText,
        sourceKind: entry.sourceKind,
        category: entry.category,
        minBand: entry.minBand,
        confidence: entry.confidence
      })
    )
    .sort()
    .join("|");
  const fixedPhraseSignature = fixedPhraseLexicon
    .map((entry) =>
      stableSerializeAnalysisSignature({
        phraseId: entry.phraseId,
        sourceText: entry.sourceText,
        targetText: entry.targetText,
        minBand: entry.minBand,
        category: entry.category,
        confidence: entry.confidence,
        normalizedTokens: entry.normalizedTokens,
        normalizedTargetText: entry.normalizedTargetText
      })
    )
    .sort()
    .join("|");
  const signature = stableSerializeAnalysisSignature({
    renderUnits: renderUnitSignature,
    fixedPhrases: fixedPhraseSignature,
    phraseTargets: phraseTargetSignature
  });

  return `${analyzerVersion}+pair:${languagePair}+assets:${hashSentence(signature).slice(0, 12)}`;
}

function parsePhraseTargetAsset(
  value: unknown,
  expectedLanguagePair: LanguagePairId
): readonly CuratedPhraseTargetEntry[] {
  if (
    !isRecord(value) ||
    value.languagePair !== expectedLanguagePair ||
    !Array.isArray(value.entries)
  ) {
    return [];
  }

  return value.entries.flatMap((entry): CuratedPhraseTargetEntry[] => {
    if (!isRecord(entry)) {
      return [];
    }

    const sourceText = readString(entry.sourceText);
    const targetText = readString(entry.targetText);
    const sourceKind = readPhraseTargetSourceKind(entry.sourceKind);
    const category = readPhraseCategory(entry.category);
    const minBand = readString(entry.minBand);
    const confidence =
      typeof entry.confidence === "number" && Number.isFinite(entry.confidence)
        ? Math.max(0, Math.min(1, entry.confidence))
        : null;

    if (
      !sourceText ||
      !targetText ||
      !sourceKind ||
      !category ||
      !minBand ||
      confidence === null
    ) {
      return [];
    }

    return [
      {
        sourceText,
        targetText,
        sourceKind,
        category,
        minBand,
        confidence,
        normalizedSourceText: normalizeToken(sourceText),
        normalizedTargetText: normalizeToken(targetText)
      }
    ];
  });
}

function readPhraseTargetSourceKind(
  value: unknown
): CuratedPhraseTargetEntry["sourceKind"] | null {
  return value === "chunk" || value === "pattern-match" ? value : null;
}

function readPhraseCategory(value: unknown): CuratedPhraseTargetEntry["category"] | null {
  return value === "noun-chunk" ||
    value === "adjective-noun" ||
    value === "grammar-carrier"
    ? value
    : null;
}

function stableSerializeAnalysisSignature(input: unknown): string {
  if (input === null || typeof input !== "object") {
    return JSON.stringify(input);
  }

  if (Array.isArray(input)) {
    return `[${input.map((item) => stableSerializeAnalysisSignature(item)).join(",")}]`;
  }

  const entries = Object.entries(input)
    .filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([key, value]) =>
        `${JSON.stringify(key)}:${stableSerializeAnalysisSignature(value)}`
    );

  return `{${entries.join(",")}}`;
}
