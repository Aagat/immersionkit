import {
  DEFAULT_LANGUAGE_PAIR_ID,
  DEFAULT_SOURCE_LANGUAGE,
  DEFAULT_TARGET_LANGUAGE,
  buildLanguagePairId,
  isLanguagePairId,
  splitLanguagePairId,
  type LanguagePairId,
  type SourceLanguageCode,
  type TargetLanguageCode
} from "../language-pairs/types";

export type {
  LanguagePairId,
  SourceLanguageCode,
  TargetLanguageCode
} from "../language-pairs/types";

export const SUPPORTED_SOURCE_LANGUAGES = [DEFAULT_SOURCE_LANGUAGE] as const;
export const SUPPORTED_TARGET_LANGUAGES = [DEFAULT_TARGET_LANGUAGE] as const;
export const SUPPORTED_POS_VALUES = [
  "noun",
  "verb",
  "adjective",
  "adverb",
  "modal",
  "auxiliary",
  "pronoun",
  "determiner",
  "preposition",
  "particle",
  "conjunction",
  "interjection",
  "proper-noun",
  "number",
  "other"
] as const;
export const SAFE_INJECTION_POS_VALUES = ["noun", "adjective", "adverb"] as const;
export const VOCAB_STATUS_VALUES = [
  "new",
  "learning",
  "known",
  "ignored"
] as const;
export const PROVIDER_VALUES = ["openai", "none"] as const;
export const ANALYZER_CHUNK_TYPES = [
  "noun-phrase",
  "verb-phrase",
  "prepositional-phrase",
  "adjective-phrase",
  "adverb-phrase",
  "unknown"
] as const;
export const ANALYZER_IDS = [
  "wink-nlp",
  "compromise-three",
  "fixture-annotated"
] as const;
export const CONTEXT_CHUNK_TYPES = [
  "noun-phrase",
  "verb-phrase",
  "adjective-phrase",
  "adverb-phrase",
  "idiom",
  "fragment",
  "other"
] as const;
export const OBSERVED_CONTEXT_POS_VALUES = [
  "noun",
  "verb",
  "adjective",
  "adverb",
  "modal",
  "auxiliary",
  "preposition",
  "pronoun",
  "determiner",
  "number",
  "particle",
  "conjunction",
  "interjection",
  "other"
] as const;
export const PHRASE_SOURCE_KINDS = [
  "fixed-phrase",
  "pattern-match",
  "chunk"
] as const;
export const PHRASE_CATEGORIES = [
  "fixed-idiom",
  "function-phrase",
  "grammar-carrier",
  "adjective-noun",
  "noun-chunk"
] as const;
export const LEARNING_UNIT_TYPES = ["word", "phrase", "grammar-feature"] as const;
export const LEARNING_ITEM_STATUS_VALUES = [
  "new",
  "learning",
  "reviewing",
  "mastered",
  "suspended"
] as const;
export const REVIEW_EVENT_TYPES = [
  "implicit-exposure",
  "explicit-review",
  "checkpoint"
] as const;
export const REVIEW_GRADES = ["again", "hard", "good", "easy"] as const;
export const ASSIST_EVENT_TYPES = [
  "translation-reveal",
  "grammar-note-reveal",
  "phrase-gloss-reveal",
  "manual-lookup"
] as const;
export const CURRICULUM_BAND_UNIT_TYPES = [
  "word",
  "phrase",
  "grammar-feature",
  "mixed"
] as const;
export const RENDER_UNIT_KINDS = [
  "single-token",
  "fixed-phrase",
  "grammar-phrase",
  "subject-verb-phrase",
  "verb-object-phrase",
  "noun-phrase",
  "sentence-help-only"
] as const;
export const RENDER_UNIT_MATCH_MODES = ["exact", "analyzer-pattern"] as const;
export const RENDER_UNIT_POLICIES = [
  "inline",
  "phrase-only",
  "sentence-help-only",
  "suppress"
] as const;
export const RENDER_UNIT_PROVENANCE_SOURCES = [
  "deck-row",
  "deck-example",
  "manual",
  "llm-import",
  "curated"
] as const;

export type SupportedSourceLanguage = SourceLanguageCode;
export type SupportedTargetLanguage = TargetLanguageCode;
export type SupportedPos = (typeof SUPPORTED_POS_VALUES)[number];
export type SafeInjectionPos = (typeof SAFE_INJECTION_POS_VALUES)[number];
export type VocabStatus = (typeof VOCAB_STATUS_VALUES)[number];
export type ProviderName = (typeof PROVIDER_VALUES)[number];
export type IsoTimestamp = string;
export type AnalyzerChunkType = (typeof ANALYZER_CHUNK_TYPES)[number];
export type AnalyzerId = (typeof ANALYZER_IDS)[number];
export type ContextChunkType = (typeof CONTEXT_CHUNK_TYPES)[number];
export type ObservedContextPos = (typeof OBSERVED_CONTEXT_POS_VALUES)[number];
export type PhraseSourceKind = (typeof PHRASE_SOURCE_KINDS)[number];
export type PhraseCategory = (typeof PHRASE_CATEGORIES)[number];
export type LearningUnitType = (typeof LEARNING_UNIT_TYPES)[number];
export type LearningItemStatus = (typeof LEARNING_ITEM_STATUS_VALUES)[number];
export type ReviewEventType = (typeof REVIEW_EVENT_TYPES)[number];
export type ReviewGrade = (typeof REVIEW_GRADES)[number];
export type AssistEventType = (typeof ASSIST_EVENT_TYPES)[number];
export type CurriculumBandUnitType = (typeof CURRICULUM_BAND_UNIT_TYPES)[number];
export type RenderUnitKind = (typeof RENDER_UNIT_KINDS)[number];
export type RenderUnitMatchMode = (typeof RENDER_UNIT_MATCH_MODES)[number];
export type RenderUnitPolicy = (typeof RENDER_UNIT_POLICIES)[number];
export type RenderUnitProvenanceSource =
  (typeof RENDER_UNIT_PROVENANCE_SOURCES)[number];

export type TokenSpan = {
  startToken: number;
  endToken: number;
  startChar: number;
  endChar: number;
};

export type AnalyzerToken = {
  text: string;
  normalized: string;
  lemma?: string;
  pos?: string;
  tags: string[];
  startOffset: number;
  endOffset: number;
};

export type AnalyzerChunk = {
  text: string;
  normalized: string;
  type: AnalyzerChunkType;
  tokenStart: number;
  tokenEnd: number;
  confidence: number;
};

export type GrammarFeatureMatch = {
  featureId: string;
  featureKey: string;
  label: string;
  category: "tense-aspect" | "modality" | "syntax" | "function" | "other";
  sourceText: string;
  normalizedSourceText: string;
  span: TokenSpan;
  evidence: string[];
  confidence: number;
};

export type AnalyzerOutput = {
  analyzerId: AnalyzerId;
  analyzerVersion: string;
  sentenceHash: string;
  sourceText: string;
  tokens: AnalyzerToken[];
  chunks: AnalyzerChunk[];
  grammarFeatures: GrammarFeatureMatch[];
};

export type PhraseLexiconEntry = {
  phraseId: string;
  sourceText: string;
  normalizedSourceText: string;
  targetText: string;
  normalizedTargetText: string;
  category: PhraseCategory;
  sourceKind: "fixed-phrase";
  confidence: number;
  tokenLength: number;
  frequencyRank?: number | null;
  grammarTags?: string[];
  notes?: string;
  sourceLanguage?: SupportedSourceLanguage;
  targetLanguage?: SupportedTargetLanguage;
  sourceDataset?: string;
};

export type LexemeEntry = {
  lexemeId: string;
  sourceLemma: string;
  targetLemma: string;
  pos: SupportedPos;
  frequencyRank: number | null;
  cefrLevel?: string;
  confidence: number;
  exampleSentenceEnglish?: string;
  exampleSentenceNative?: string;
  inflections?: string[];
  sourceLanguage?: SupportedSourceLanguage;
  targetLanguage?: SupportedTargetLanguage;
  sourceDataset?: string;
};

export type LexemeAsset = {
  schemaVersion: string;
  assetVersion: string;
  languagePair: LanguagePairId;
  generatedAt?: IsoTimestamp;
  entries: LexemeEntry[];
};

export type RenderUnitTokenPattern = {
  surface?: string;
  normal?: string;
  lemma?: string;
  pos?: SupportedPos;
  role?: "subject" | "verb" | "object" | "complement";
  optional?: boolean;
  features?: Record<string, string | string[] | boolean>;
};

export type RenderUnitSourcePattern = {
  matchMode: RenderUnitMatchMode;
  tokens: RenderUnitTokenPattern[];
};

export type RenderUnitReplacement = {
  startToken: number;
  endToken: number;
  targetText: string;
};

export type RenderUnitProvenance = {
  source: RenderUnitProvenanceSource;
  sourceRowHash?: string;
  promptVersion?: string;
  model?: string;
  notes?: string;
};

export type RenderUnitEntry = {
  renderUnitId: string;
  lexemeIds: string[];
  kind: RenderUnitKind;
  renderPolicy: RenderUnitPolicy;
  sourceText: string;
  normalizedSourceText: string;
  targetText?: string;
  normalizedTargetText?: string;
  sourcePattern: RenderUnitSourcePattern;
  replacement?: RenderUnitReplacement;
  pos?: SupportedPos;
  minBand: string;
  frequencyRank?: number | null;
  confidence: number;
  provenance: RenderUnitProvenance;
  exampleSentenceEnglish?: string;
  exampleSentenceNative?: string;
  inflections?: string[];
  sourceLanguage?: SupportedSourceLanguage;
  targetLanguage?: SupportedTargetLanguage;
};

export type RenderUnitAsset = {
  schemaVersion: string;
  assetVersion: string;
  languagePair: LanguagePairId;
  generatedAt?: IsoTimestamp;
  entries: RenderUnitEntry[];
};

export type PhraseRegistryEntry = {
  phraseId: string;
  normalizedSourceText: string;
  canonicalTargetText: string;
  normalizedTargetText: string;
  sourceKind: PhraseSourceKind;
  category: PhraseCategory;
  provenance: "curated" | "runtime";
  confidence: number;
  firstSeenAt: IsoTimestamp;
  lastSeenAt: IsoTimestamp;
  exposureCount: number;
  sourceEntryId?: string;
};

export type PhraseOccurrence = {
  occurrenceId: string;
  phraseId: string;
  renderUnitId?: string;
  renderUnitMinBand?: string;
  renderPolicy?: RenderUnitPolicy;
  sentenceHash: string;
  analyzerVersion: string;
  sourceText: string;
  normalizedSourceText: string;
  targetText?: string;
  normalizedTargetText?: string;
  sourceKind: PhraseSourceKind;
  category: PhraseCategory;
  ruleId: string;
  span: TokenSpan;
  confidence: number;
};

export type ContextualWordCandidate = {
  id: string;
  sentenceHash?: string;
  nodeId?: string;
  sentence: string;
  tokenText: string;
  surfaceText?: string;
  normalizedText?: string;
  renderUnitId?: string;
  renderUnitMinBand?: string;
  lexemeId?: string;
  normalizedSourceText?: string;
  targetText?: string;
  targetLemma: string;
  candidateLemma: string;
  candidatePos: SafeInjectionPos;
  observedPos: ObservedContextPos;
  chunkType: ContextChunkType;
  chunkText?: string;
  tokenStart?: number;
  tokenEnd?: number;
  leftContextLemmas?: string[];
  rightContextLemmas?: string[];
  nearbyContextSignature: string[];
  patternId?: string;
  ambiguityGroup: string;
  confidence: number;
  decision?: "inject" | "skip";
  rationale?: string;
  expectedOutcome?: "must-inject" | "must-skip" | "uncertain-skip";
};

export type SentenceAnalysisEntry = {
  sentenceHash: string;
  analyzerVersion: string;
  analyzerId: AnalyzerId;
  sourceText: string;
  tokens: AnalyzerToken[];
  lemmas: string[];
  posTags: string[];
  chunks: AnalyzerChunk[];
  contextualWordCandidates: ContextualWordCandidate[];
  phraseMatches: PhraseOccurrence[];
  grammarFeatures: GrammarFeatureMatch[];
  difficultyScore?: number;
  difficultyBand?: "core" | "stretch" | "defer";
  vocabStats?: SentenceScoreSummary;
  createdAt: IsoTimestamp;
  lastAccessedAt: IsoTimestamp;
};

export type SentenceScoreSummary = {
  knownWordCount: number;
  learningWordCount: number;
  ignoredWordCount: number;
  unknownWordCount: number;
  totalWordCount: number;
  knownRatio: number;
  familiarRatio: number;
};

export type LearningItem = {
  itemId: string;
  unitRefId: string;
  unitType: LearningUnitType;
  sourceText: string;
  targetText: string;
  status: LearningItemStatus;
  bandId?: string;
  introducedAt: IsoTimestamp;
  lastExposedAt?: IsoTimestamp;
  lastReviewedAt?: IsoTimestamp;
  nextReviewAt?: IsoTimestamp;
  interval: number;
  ease: number;
  lapses: number;
  assistCount: number;
  qualifiedExposureCount: number;
  consecutiveUnassistedCount: number;
  distinctContextCount: number;
  suspended: boolean;
};

export type ReviewEvent = {
  eventId: string;
  itemId: string;
  unitType?: LearningUnitType;
  eventType: ReviewEventType;
  grade: ReviewGrade;
  contextSentenceHash?: string;
  hostname?: string;
  sessionId?: string;
  createdAt: IsoTimestamp;
};

export type QualifiedExposureEvent = {
  eventId: string;
  itemId: string;
  sentenceHash: string;
  phraseId?: string;
  hostname?: string;
  sessionId?: string;
  occurredAt: IsoTimestamp;
  wasAssisted: boolean;
  confidence: number;
  distinctContextKey: string;
};

export type AssistEvent = {
  eventId: string;
  itemId: string;
  assistType: AssistEventType;
  contextSentenceHash?: string;
  hostname?: string;
  sessionId?: string;
  createdAt: IsoTimestamp;
};

export type CurriculumBand = {
  bandId: string;
  unitType: CurriculumBandUnitType;
  label: string;
  order: number;
  itemIds: string[];
  unlockRequirements: {
    stableItemRatio: number;
    minimumQualifiedExposures: number;
    maximumRecentLapseRate: number;
    minimumEvidenceBearingItems?: number;
    minimumDistinctContextItems?: number;
    minimumUnassistedItems?: number;
    checkpointRequired: boolean;
  };
  difficultyLimits: {
    minimumScore: number;
    maximumScore: number;
  };
};

export type UserLearningProfile = {
  profileId: string;
  sourceLanguage: SupportedSourceLanguage;
  targetLanguage: SupportedTargetLanguage;
  displayName: string;
  activeVocabularyBandId?: string;
  activePhraseBandId?: string;
  activeGrammarBandId?: string;
  unlockedBandIds: string[];
  difficultyPresetId: string;
  stretchTolerance: number;
  knownLexemeIds: string[];
  learningItems: Record<string, LearningItem>;
  lastCheckpointAt?: IsoTimestamp;
  checkpointEligibilityAt?: IsoTimestamp;
  updatedAt: IsoTimestamp;
};

export type WordInventoryEntry = {
  lexemeId: string;
  renderUnitId?: string;
  renderUnitMinBand?: string;
  sourceLemma: string;
  targetLemma: string;
  pos: SupportedPos;
  frequencyRank: number | null;
  confidence: number;
  exampleSentenceEnglish?: string;
  exampleSentenceNative?: string;
  inflections?: string[];
  sourceLanguage?: SupportedSourceLanguage;
  targetLanguage?: SupportedTargetLanguage;
  sourceDataset?: string;
};

export type UserVocabEntry = {
  lexemeId: string;
  status: VocabStatus;
  lastSeenAt: IsoTimestamp | null;
  exposureCount: number;
  updatedAt: IsoTimestamp;
  createdAt?: IsoTimestamp;
};

export type SentenceLearningNote = {
  summary: string;
  literalGloss: string;
  keyPhrase: string;
  canonicalUsage: string;
  grammarFocus: string;
};

export type SentenceCacheEntry = {
  sentenceHash: string;
  sourceText: string;
  translatedText: string;
  learningNote: SentenceLearningNote;
  languagePair?: LanguagePairId;
  targetLanguage: SupportedTargetLanguage;
  model: string;
  promptVersion: string;
  createdAt: IsoTimestamp;
  sourceLanguage?: SupportedSourceLanguage;
  provider?: ProviderName;
  lastAccessedAt?: IsoTimestamp;
};

export type SiteSetting = {
  hostname: string;
  enabled: boolean;
  discoveryRate: number | null;
  sentenceTranslationEnabled?: boolean | null;
  updatedAt: IsoTimestamp;
};

export type ExtensionSettings = {
  languagePair?: LanguagePairId;
  discoveryRate: number;
  targetLanguage: SupportedTargetLanguage;
  sentenceTranslationEnabled: boolean;
  provider: ProviderName;
  enabled?: boolean;
  sourceLanguage?: SupportedSourceLanguage;
  goldilocksThreshold?: number;
  sentenceBatchSize?: number;
};

export type ResolvedExtensionSettings = Omit<
  ExtensionSettings,
  "enabled" | "sourceLanguage" | "goldilocksThreshold" | "sentenceBatchSize"
> & {
  languagePair: LanguagePairId;
  enabled: boolean;
  sourceLanguage: SupportedSourceLanguage;
  goldilocksThreshold: number;
  sentenceBatchSize: number;
};

export const DEFAULT_EXTENSION_SETTINGS: ResolvedExtensionSettings = {
  languagePair: DEFAULT_LANGUAGE_PAIR_ID,
  enabled: true,
  discoveryRate: 0.15,
  targetLanguage: DEFAULT_TARGET_LANGUAGE,
  sourceLanguage: DEFAULT_SOURCE_LANGUAGE,
  sentenceTranslationEnabled: false,
  provider: "none",
  goldilocksThreshold: 0.6,
  sentenceBatchSize: 3
};

export function clampUnitInterval(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, value));
}

export function clampSentenceBatchSize(
  value: number | undefined,
  fallback = DEFAULT_EXTENSION_SETTINGS.sentenceBatchSize
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(5, Math.max(1, Math.round(value)));
}

export function createSentenceLearningNote(
  input: Partial<SentenceLearningNote> | null | undefined
): SentenceLearningNote {
  const note = {
    summary: normalizeLearningNoteField(input?.summary),
    literalGloss: normalizeLearningNoteField(input?.literalGloss),
    keyPhrase: normalizeLearningNoteField(input?.keyPhrase),
    canonicalUsage: normalizeLearningNoteField(input?.canonicalUsage),
    grammarFocus: normalizeLearningNoteField(input?.grammarFocus)
  };

  if (!note.summary) {
    note.summary =
      note.canonicalUsage || note.keyPhrase || note.grammarFocus || note.literalGloss;
  }

  return note;
}

export function hasSentenceLearningNoteContent(note: SentenceLearningNote): boolean {
  return Boolean(
    note.summary ||
      note.literalGloss ||
      note.keyPhrase ||
      note.canonicalUsage ||
      note.grammarFocus
  );
}

export function resolveExtensionSettings(
  settings: Partial<ExtensionSettings> | null | undefined
): ResolvedExtensionSettings {
  const draft = settings ?? {};
  const languagePair = resolveSettingsLanguagePair(draft);
  const pairLanguages = splitLanguagePairId(languagePair);
  const hasExplicitLanguagePair = isLanguagePairId(draft.languagePair);

  return {
    languagePair,
    enabled: draft.enabled ?? DEFAULT_EXTENSION_SETTINGS.enabled,
    discoveryRate: clampUnitInterval(
      draft.discoveryRate,
      DEFAULT_EXTENSION_SETTINGS.discoveryRate
    ),
    targetLanguage: hasExplicitLanguagePair
      ? pairLanguages.targetLanguage
      : draft.targetLanguage ?? pairLanguages.targetLanguage,
    sourceLanguage: hasExplicitLanguagePair
      ? pairLanguages.sourceLanguage
      : draft.sourceLanguage ?? pairLanguages.sourceLanguage,
    sentenceTranslationEnabled:
      draft.sentenceTranslationEnabled ??
      DEFAULT_EXTENSION_SETTINGS.sentenceTranslationEnabled,
    provider: draft.provider ?? DEFAULT_EXTENSION_SETTINGS.provider,
    goldilocksThreshold: clampUnitInterval(
      draft.goldilocksThreshold,
      DEFAULT_EXTENSION_SETTINGS.goldilocksThreshold
    ),
    sentenceBatchSize: clampSentenceBatchSize(draft.sentenceBatchSize)
  };
}

function resolveSettingsLanguagePair(
  settings: Partial<ExtensionSettings>
): LanguagePairId {
  if (isLanguagePairId(settings.languagePair)) {
    return settings.languagePair;
  }

  return buildLanguagePairId(
    settings.sourceLanguage ?? DEFAULT_EXTENSION_SETTINGS.sourceLanguage,
    settings.targetLanguage ?? DEFAULT_EXTENSION_SETTINGS.targetLanguage
  );
}

function normalizeLearningNoteField(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}
