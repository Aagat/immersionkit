import { RuntimeMessageType } from "@immersionkit/shared";
import type {
  ContentAssetContext,
  CurriculumConfig,
  CurriculumRuntimeProfileInput,
  ContextualWordCandidate,
  ExtensionSettings,
  GrammarFeatureMatch,
  LearningItem,
  PhraseOccurrence,
  SeedLexiconEntry,
  SiteSetting,
  UserVocabEntry,
  VocabStatus
} from "@immersionkit/shared";
import { resolveCurriculumConfig } from "@immersionkit/shared";

import {
  DEFAULT_DISCOVERY_RATE,
  DEFAULT_SETTINGS,
  STORAGE_KEYS
} from "./constants";

type StorageRecord = Record<string, unknown>;

type VocabEntryRecord = {
  lemmaId: unknown;
  status: unknown;
  lastSeenAt?: unknown;
  exposureCount?: unknown;
  updatedAt?: unknown;
};

export type LexiconLoadSource =
  | "remote-pack"
  | "cached-pack"
  | "empty";

export type LexiconLoadInfo = {
  source: LexiconLoadSource;
  entryCount: number;
  assetVersion: string | null;
  isFallback: boolean;
};

export type ProcessingContext = {
  settings: ExtensionSettings;
  discoveryRate: number;
  siteSetting: SiteSetting | null;
  siteEnabled: boolean;
  lexicon: SeedLexiconEntry[];
  lexiconInfo: LexiconLoadInfo;
  vocabByLemmaId: Map<string, UserVocabEntry>;
  learningItemsByUnitRefId: Map<string, LearningItem>;
  cachedContextSkipDecisions: Map<string, CachedContextSkipDecision[]>;
  cachedPhraseMatchesBySentenceHash: Map<string, CachedPhraseMatch[]>;
  sentenceHintPhrases: string[];
  cachedGrammarFeaturesBySentenceHash: Map<string, CachedGrammarFeature[]>;
  curriculumConfig: CurriculumConfig;
  learningProfile: CurriculumRuntimeProfileInput;
};

export type CachedSentenceAnalysisContext = {
  entryCount: number;
  cachedContextSkipDecisions: Map<string, CachedContextSkipDecision[]>;
  cachedPhraseMatchesBySentenceHash: Map<string, CachedPhraseMatch[]>;
  cachedGrammarFeaturesBySentenceHash: Map<string, CachedGrammarFeature[]>;
};

export type CachedContextSkipDecision = {
  sentenceHash: string;
  lemmaId: string;
  normalizedText: string;
  rationale?: string;
};

export type CachedPhraseMatch = Pick<
  PhraseOccurrence,
  | "occurrenceId"
  | "phraseId"
  | "renderUnitId"
  | "renderUnitMinBand"
  | "renderPolicy"
  | "sentenceHash"
  | "sourceText"
  | "normalizedSourceText"
  | "sourceKind"
  | "category"
  | "ruleId"
  | "span"
  | "confidence"
>;

export type CachedGrammarFeature = Pick<
  GrammarFeatureMatch,
  "featureId" | "featureKey" | "label" | "category" | "sourceText" | "confidence"
>;

export type PersistVocabStatusInput = {
  lemmaId: string;
  status: VocabStatus;
  lastSeenAt?: string | null;
  updatedAt?: string;
  incrementExposure?: boolean;
};

export async function loadProcessingContext(
  hostname: string,
  sentenceHashes: readonly string[] = []
): Promise<ProcessingContext> {
  const storage = await readStorageValues([
    ...STORAGE_KEYS.settings,
    ...STORAGE_KEYS.siteSettings,
    ...STORAGE_KEYS.vocab,
    ...STORAGE_KEYS.curriculumConfig,
    ...STORAGE_KEYS.learningProfile
  ]);

  const rawSettings = pickFirstDefinedValue(storage, STORAGE_KEYS.settings);
  const settings = parseSettings(rawSettings);

  const siteSetting = parseSiteSetting(
    pickFirstDefinedValue(storage, STORAGE_KEYS.siteSettings),
    hostname
  );

  const discoveryRate = clampRate(
    siteSetting?.discoveryRate ?? settings.discoveryRate ?? DEFAULT_DISCOVERY_RATE
  );

  const assetContext = await requestActiveAssetContext();

  const sentenceAnalysisContext = await loadCachedSentenceAnalysisContext(sentenceHashes);
  const rawCurriculumConfig =
    pickFirstDefinedValue(storage, STORAGE_KEYS.curriculumConfig) ??
    (isRecord(rawSettings) ? rawSettings.curriculumConfig : null);
  const rawLearningProfile =
    pickFirstDefinedValue(storage, STORAGE_KEYS.learningProfile) ??
    (isRecord(rawSettings) ? rawSettings.learningProfile : null);

  return {
    settings,
    discoveryRate,
    siteSetting,
    siteEnabled: siteSetting?.enabled ?? true,
    lexicon: assetContext.lexicon,
    lexiconInfo: {
      source: assetContext.source,
      entryCount: assetContext.lexicon.length,
      assetVersion: assetContext.assetVersion,
      isFallback: assetContext.source === "empty"
    },
    sentenceHintPhrases: assetContext.sentenceHintPhrases,
    vocabByLemmaId: parseVocabEntries(
      pickFirstDefinedValue(storage, STORAGE_KEYS.vocab)
    ),
    learningItemsByUnitRefId: await loadLearningItemsByUnitRefId(),
    cachedContextSkipDecisions:
      sentenceAnalysisContext.cachedContextSkipDecisions,
    cachedPhraseMatchesBySentenceHash:
      sentenceAnalysisContext.cachedPhraseMatchesBySentenceHash,
    cachedGrammarFeaturesBySentenceHash:
      sentenceAnalysisContext.cachedGrammarFeaturesBySentenceHash,
    curriculumConfig: resolveCurriculumConfig(
      isRecord(rawCurriculumConfig)
        ? (rawCurriculumConfig as Partial<CurriculumConfig>)
        : null
    ),
    learningProfile: parseLearningProfile(rawLearningProfile)
  };
}

export async function loadCachedSentenceAnalysisContext(
  sentenceHashes: readonly string[]
): Promise<CachedSentenceAnalysisContext> {
  const sentenceAnalysisCache = await loadCachedSentenceAnalysisEntries(sentenceHashes);

  return {
    entryCount: sentenceAnalysisCache.length,
    cachedContextSkipDecisions: parseCachedContextSkipDecisions(sentenceAnalysisCache),
    cachedPhraseMatchesBySentenceHash: parseCachedPhraseMatches(sentenceAnalysisCache),
    cachedGrammarFeaturesBySentenceHash: parseCachedGrammarFeatures(sentenceAnalysisCache)
  };
}

export async function persistVocabStatus(
  input: PersistVocabStatusInput
): Promise<UserVocabEntry | null> {
  const lemmaId = readString(input.lemmaId);
  if (!lemmaId) {
    return null;
  }

  const storage = await readStorageValues([...STORAGE_KEYS.vocab]);
  const existingEntries = parseVocabEntries(
    pickFirstDefinedValue(storage, STORAGE_KEYS.vocab)
  );
  const existingEntry = existingEntries.get(lemmaId);
  const now = input.updatedAt ?? new Date().toISOString();
  const shouldIncrementExposure = input.incrementExposure ?? true;

  const nextEntry: UserVocabEntry = {
    lemmaId,
    status: input.status,
    updatedAt: now,
    lastSeenAt: input.lastSeenAt === undefined ? now : input.lastSeenAt,
    exposureCount: Math.max(
      0,
      (existingEntry?.exposureCount ?? 0) + (shouldIncrementExposure ? 1 : 0)
    )
  };

  existingEntries.set(lemmaId, nextEntry);
  await writeStorageValues({
    [STORAGE_KEYS.vocab[0]]: serializeVocabEntries(existingEntries)
  });

  return nextEntry;
}

export async function refreshLearningItemsByUnitRefIds(
  unitRefIds: readonly string[]
): Promise<Map<string, LearningItem>> {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    return new Map();
  }

  const requestedUnitRefIds = [...new Set(unitRefIds.map((id) => id.trim()).filter(Boolean))]
    .slice(0, 100);
  if (requestedUnitRefIds.length === 0) {
    return new Map();
  }

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: RuntimeMessageType.GetLearningItems,
        unitRefIds: requestedUnitRefIds
      },
      (response?: unknown) => {
        if (chrome.runtime.lastError || !isRecord(response) || response.ok !== true) {
          resolve(new Map());
          return;
        }

        resolve(parseLearningItems(response.items));
      }
    );
  });
}

async function readStorageValues(keys: readonly string[]): Promise<StorageRecord> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    return {};
  }

  return new Promise((resolve) => {
    chrome.storage.local.get([...new Set(keys)], (values) => {
      if (chrome.runtime.lastError) {
        resolve({});
        return;
      }

      resolve(values as StorageRecord);
    });
  });
}

async function writeStorageValues(values: StorageRecord): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    return;
  }

  await new Promise<void>((resolve) => {
    chrome.storage.local.set(values, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

async function loadLearningItemsByUnitRefId(): Promise<Map<string, LearningItem>> {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    return new Map();
  }

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: RuntimeMessageType.GetLearningItems },
      (response?: unknown) => {
        if (chrome.runtime.lastError || !isRecord(response) || response.ok !== true) {
          resolve(new Map());
          return;
        }

        resolve(parseLearningItems(response.items));
      }
    );
  });
}

async function requestActiveAssetContext(): Promise<ContentAssetContext> {
  const emptyContext: ContentAssetContext = {
    lexicon: [],
    sentenceHintPhrases: [],
    source: "empty",
    assetVersion: null,
    bandIds: [],
    missingBandIds: []
  };

  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    return emptyContext;
  }

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: RuntimeMessageType.GetAssetContext },
      (response?: unknown) => {
        if (chrome.runtime.lastError || !isRecord(response) || response.ok !== true) {
          resolve(emptyContext);
          return;
        }

        const context = normalizeAssetContext(response.context);
        resolve(context ?? emptyContext);
      }
    );
  });
}

function normalizeAssetContext(input: unknown): ContentAssetContext | null {
  if (!isRecord(input)) {
    return null;
  }

  const source = readAssetContextSource(input.source);
  if (!source) {
    return null;
  }

  return {
    lexicon: readSeedLexiconEntries(input.lexicon),
    sentenceHintPhrases: Array.isArray(input.sentenceHintPhrases)
      ? input.sentenceHintPhrases
          .map((value) => readString(value))
          .filter((value): value is string => Boolean(value))
      : [],
    source,
    assetVersion: readString(input.assetVersion),
    bandIds: readStringArray(input.bandIds),
    missingBandIds: readStringArray(input.missingBandIds)
  };
}

function readAssetContextSource(value: unknown): LexiconLoadSource | null {
  return value === "remote-pack" ||
    value === "cached-pack" ||
    value === "empty"
    ? value
    : null;
}

function readSeedLexiconEntries(input: unknown): SeedLexiconEntry[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.flatMap((entry): SeedLexiconEntry[] => {
    const normalized = normalizeSeedLexiconEntry(entry);
    return normalized ? [normalized] : [];
  });
}

function normalizeSeedLexiconEntry(input: unknown): SeedLexiconEntry | null {
  if (!isRecord(input)) {
    return null;
  }

  const lemmaId = readString(input.lemmaId);
  const sourceLemma = readString(input.sourceLemma);
  const targetLemma = readString(input.targetLemma);
  const pos = readString(input.pos) as SeedLexiconEntry["pos"] | null;
  if (!lemmaId || !sourceLemma || !targetLemma || !pos) {
    return null;
  }

  return {
    lemmaId,
    lexemeId: readString(input.lexemeId) ?? undefined,
    renderUnitId: readString(input.renderUnitId) ?? undefined,
    renderUnitMinBand: readString(input.renderUnitMinBand) ?? undefined,
    sourceLemma,
    targetLemma,
    pos,
    frequencyRank:
      typeof input.frequencyRank === "number" && Number.isFinite(input.frequencyRank)
        ? input.frequencyRank
        : null,
    confidence: readNumber(input.confidence, 0.9),
    exampleSentenceEnglish: readString(input.exampleSentenceEnglish) ?? undefined,
    exampleSentenceNative: readString(input.exampleSentenceNative) ?? undefined,
    inflections: Array.isArray(input.inflections)
      ? input.inflections.filter((value): value is string => typeof value === "string")
      : undefined,
    sourceLanguage: input.sourceLanguage === "en" ? "en" : undefined,
    targetLanguage: input.targetLanguage === "es" ? "es" : undefined,
    sourceDataset: readString(input.sourceDataset) ?? undefined
  };
}

function readStringArray(input: unknown): string[] {
  return Array.isArray(input)
    ? input
        .map((value) => readString(value))
        .filter((value): value is string => Boolean(value))
    : [];
}

async function loadCachedSentenceAnalysisEntries(
  sentenceHashes: readonly string[]
): Promise<unknown[]> {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    return [];
  }

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: RuntimeMessageType.GetSentenceAnalysisCache,
        sentenceHashes: [...new Set(sentenceHashes)].slice(0, 500)
      },
      (response?: unknown) => {
        if (chrome.runtime.lastError || !isRecord(response) || response.ok !== true) {
          resolve([]);
          return;
        }

        const entries = response.entries;
        resolve(
          Array.isArray(entries)
            ? entries
            : isRecord(entries)
              ? Object.values(entries)
              : []
        );
      }
    );
  });
}

function parseSettings(input: unknown): ExtensionSettings {
  if (!isRecord(input)) {
    return DEFAULT_SETTINGS;
  }

  const discoveryRate = clampRate(readNumber(input.discoveryRate, DEFAULT_DISCOVERY_RATE));
  const sentenceTranslationEnabled =
    typeof input.sentenceTranslationEnabled === "boolean"
      ? input.sentenceTranslationEnabled
      : DEFAULT_SETTINGS.sentenceTranslationEnabled;
  const provider = input.provider === "openai" ? "openai" : "none";

  return {
    discoveryRate,
    sentenceTranslationEnabled,
    provider,
    targetLanguage: "es"
  };
}

function parseSiteSetting(input: unknown, hostname: string): SiteSetting | null {
  if (Array.isArray(input)) {
    const candidate = input.find((entry) => {
      if (!isRecord(entry)) {
        return false;
      }

      return entry.hostname === hostname;
    });

    return candidate && isRecord(candidate)
      ? normalizeSiteSetting(candidate, hostname)
      : null;
  }

  if (isRecord(input) && input.hostname === hostname) {
    return normalizeSiteSetting(input, hostname);
  }

  if (isRecord(input) && isRecord(input[hostname])) {
    return normalizeSiteSetting(input[hostname], hostname);
  }

  return null;
}

function parseVocabEntries(input: unknown): Map<string, UserVocabEntry> {
  const entries: UserVocabEntry[] = [];

  if (Array.isArray(input)) {
    for (const entry of input) {
      const parsedEntry = normalizeVocabEntry(entry);
      if (parsedEntry) {
        entries.push(parsedEntry);
      }
    }
  } else if (isRecord(input)) {
    for (const value of Object.values(input)) {
      const parsedEntry = normalizeVocabEntry(value);
      if (parsedEntry) {
        entries.push(parsedEntry);
      }
    }
  }

  return new Map(entries.map((entry) => [entry.lemmaId, entry]));
}

function serializeVocabEntries(
  entries: Map<string, UserVocabEntry>
): Record<string, UserVocabEntry> {
  const serialized: Record<string, UserVocabEntry> = {};

  for (const [lemmaId, entry] of entries) {
    serialized[lemmaId] = entry;
  }

  return serialized;
}

function parseLearningItems(input: unknown): Map<string, LearningItem> {
  const items: LearningItem[] = [];
  const values = Array.isArray(input)
    ? input
    : isRecord(input)
      ? Object.values(input)
      : [];

  for (const value of values) {
    if (!isRecord(value)) {
      continue;
    }

    const itemId = readString(value.itemId);
    const unitRefId = readString(value.unitRefId);
    if (!itemId || !unitRefId) {
      continue;
    }

    items.push({
      itemId,
      unitRefId,
      unitType:
        value.unitType === "phrase" || value.unitType === "grammar-feature"
          ? value.unitType
          : "word",
      sourceText: readString(value.sourceText) ?? unitRefId,
      targetText: readString(value.targetText) ?? "",
      status:
        value.status === "learning" ||
        value.status === "reviewing" ||
        value.status === "mastered" ||
        value.status === "suspended"
          ? value.status
          : "new",
      introducedAt: readString(value.introducedAt) ?? new Date().toISOString(),
      lastExposedAt: readString(value.lastExposedAt) ?? undefined,
      lastReviewedAt: readString(value.lastReviewedAt) ?? undefined,
      nextReviewAt: readString(value.nextReviewAt) ?? undefined,
      interval: readNumber(value.interval, 0),
      ease: readNumber(value.ease, 2.3),
      lapses: readNumber(value.lapses, 0),
      assistCount: readNumber(value.assistCount, 0),
      qualifiedExposureCount: readNumber(value.qualifiedExposureCount, 0),
      consecutiveUnassistedCount: readNumber(value.consecutiveUnassistedCount, 0),
      distinctContextCount: readNumber(value.distinctContextCount, 0),
      suspended: value.suspended === true
    });
  }

  return new Map(items.map((item) => [item.unitRefId, item]));
}

function parseLearningProfile(input: unknown): CurriculumRuntimeProfileInput {
  if (!isRecord(input)) {
    return {};
  }

  const activeVocabularyBandId = readString(input.activeVocabularyBandId);
  const activePhraseBandId = readString(input.activePhraseBandId);
  const activeGrammarBandId = readString(input.activeGrammarBandId);
  const unlockedBandIds = Array.isArray(input.unlockedBandIds)
    ? input.unlockedBandIds.flatMap((value): string[] => {
        const bandId = readString(value);
        return bandId ? [bandId] : [];
      })
    : undefined;

  return {
    ...(activeVocabularyBandId ? { activeVocabularyBandId } : {}),
    ...(activePhraseBandId ? { activePhraseBandId } : {}),
    ...(activeGrammarBandId ? { activeGrammarBandId } : {}),
    ...(unlockedBandIds ? { unlockedBandIds } : {})
  };
}

function parseCachedContextSkipDecisions(
  input: unknown
): Map<string, CachedContextSkipDecision[]> {
  const decisionsBySentenceHash = new Map<string, CachedContextSkipDecision[]>();
  const values = Array.isArray(input)
    ? input
    : isRecord(input)
      ? Object.values(input)
      : [];

  for (const entry of values) {
    if (!isRecord(entry)) {
      continue;
    }

    const sentenceHash = readString(entry.sentenceHash);
    if (!sentenceHash || !Array.isArray(entry.contextualWordCandidates)) {
      continue;
    }

    for (const candidate of entry.contextualWordCandidates) {
      const decision = normalizeCachedSkipDecision(sentenceHash, candidate);
      if (!decision) {
        continue;
      }

      const existing = decisionsBySentenceHash.get(sentenceHash) ?? [];
      existing.push(decision);
      decisionsBySentenceHash.set(sentenceHash, existing);
    }
  }

  return decisionsBySentenceHash;
}

function parseCachedPhraseMatches(input: unknown): Map<string, CachedPhraseMatch[]> {
  const matchesBySentenceHash = new Map<string, CachedPhraseMatch[]>();
  const values = Array.isArray(input)
    ? input
    : isRecord(input)
      ? Object.values(input)
      : [];

  for (const entry of values) {
    if (!isRecord(entry)) {
      continue;
    }

    const sentenceHash = readString(entry.sentenceHash);
    if (!sentenceHash || !Array.isArray(entry.phraseMatches)) {
      continue;
    }

    for (const phraseMatch of entry.phraseMatches) {
      const parsedMatch = normalizeCachedPhraseMatch(sentenceHash, phraseMatch);
      if (!parsedMatch) {
        continue;
      }

      const existing = matchesBySentenceHash.get(sentenceHash) ?? [];
      existing.push(parsedMatch);
      matchesBySentenceHash.set(sentenceHash, existing);
    }
  }

  return matchesBySentenceHash;
}

function parseCachedGrammarFeatures(input: unknown): Map<string, CachedGrammarFeature[]> {
  const featuresBySentenceHash = new Map<string, CachedGrammarFeature[]>();
  const values = Array.isArray(input)
    ? input
    : isRecord(input)
      ? Object.values(input)
      : [];

  for (const entry of values) {
    if (!isRecord(entry)) {
      continue;
    }

    const sentenceHash = readString(entry.sentenceHash);
    if (!sentenceHash || !Array.isArray(entry.grammarFeatures)) {
      continue;
    }

    const features = entry.grammarFeatures.flatMap(
      (feature): CachedGrammarFeature[] => {
        const parsedFeature = normalizeCachedGrammarFeature(feature);
        return parsedFeature ? [parsedFeature] : [];
      }
    );
    if (features.length > 0) {
      featuresBySentenceHash.set(sentenceHash, features);
    }
  }

  return featuresBySentenceHash;
}

function normalizeCachedGrammarFeature(value: unknown): CachedGrammarFeature | null {
  if (!isRecord(value)) {
    return null;
  }

  const featureKey = readString(value.featureKey);
  const label = readString(value.label);
  const category = readGrammarFeatureCategory(value.category);
  if (!featureKey || !label || !category) {
    return null;
  }

  return {
    featureId: readString(value.featureId) ?? `grammar:${featureKey}`,
    featureKey,
    label,
    category,
    sourceText: readString(value.sourceText) ?? label,
    confidence: readNumber(value.confidence, 0)
  };
}

function normalizeCachedPhraseMatch(
  fallbackSentenceHash: string,
  input: unknown
): CachedPhraseMatch | null {
  if (!isRecord(input) || !isRecord(input.span)) {
    return null;
  }

  const phraseId = readString(input.phraseId);
  const occurrenceId = readString(input.occurrenceId);
  const sourceText = readString(input.sourceText);
  const normalizedSourceText = readString(input.normalizedSourceText);
  const startChar = readNumber(input.span.startChar, -1);
  const endChar = readNumber(input.span.endChar, -1);
  const startToken = readNumber(input.span.startToken, -1);
  const endToken = readNumber(input.span.endToken, -1);
  const sourceKind = readPhraseSourceKind(input.sourceKind);
  const category = readPhraseCategory(input.category);
  const ruleId = readString(input.ruleId);
  const confidence = readNumber(input.confidence, 0);

  if (
    !phraseId ||
    !occurrenceId ||
    !sourceText ||
    !normalizedSourceText ||
    !sourceKind ||
    !category ||
    !ruleId ||
    startChar < 0 ||
    endChar <= startChar ||
    startToken < 0 ||
    endToken <= startToken
  ) {
    return null;
  }

  return {
    occurrenceId,
    phraseId,
    renderUnitId: readString(input.renderUnitId) ?? undefined,
    renderUnitMinBand: readString(input.renderUnitMinBand) ?? undefined,
    renderPolicy:
      input.renderPolicy === "inline" ||
      input.renderPolicy === "phrase-only" ||
      input.renderPolicy === "sentence-help-only" ||
      input.renderPolicy === "suppress"
        ? input.renderPolicy
        : undefined,
    sentenceHash: readString(input.sentenceHash) ?? fallbackSentenceHash,
    sourceText,
    normalizedSourceText,
    sourceKind,
    category,
    ruleId,
    span: {
      startToken,
      endToken,
      startChar,
      endChar
    },
    confidence
  };
}

function normalizeCachedSkipDecision(
  fallbackSentenceHash: string,
  input: unknown
): CachedContextSkipDecision | null {
  if (!isRecord(input) || input.decision !== "skip") {
    return null;
  }

  const candidate = input as Partial<ContextualWordCandidate>;
  const lemmaId = readString(candidate.lemmaId);
  const normalizedText =
    readString(candidate.normalizedText) ?? readString(candidate.tokenText);
  if (!lemmaId || !normalizedText) {
    return null;
  }

  return {
    sentenceHash: readString(candidate.sentenceHash) ?? fallbackSentenceHash,
    lemmaId,
    normalizedText,
    rationale: readString(candidate.rationale) ?? undefined
  };
}

function normalizeVocabEntry(input: unknown): UserVocabEntry | null {
  if (!isRecord(input)) {
    return null;
  }

  const record = input as VocabEntryRecord;
  const lemmaId = readString(record.lemmaId);
  if (!lemmaId) {
    return null;
  }

  const status = normalizeStatus(record.status);
  const updatedAt = readString(record.updatedAt) ?? new Date().toISOString();

  return {
    lemmaId,
    status,
    updatedAt,
    lastSeenAt: readString(record.lastSeenAt),
    exposureCount: readNumber(record.exposureCount, 0)
  };
}

function normalizeSiteSetting(input: StorageRecord, hostname: string): SiteSetting {
  return {
    hostname,
    enabled: typeof input.enabled === "boolean" ? input.enabled : true,
    discoveryRate:
      typeof input.discoveryRate === "number" && Number.isFinite(input.discoveryRate)
        ? clampRate(input.discoveryRate)
        : null,
    updatedAt: readString(input.updatedAt) ?? new Date().toISOString()
  };
}

function normalizeStatus(value: unknown): VocabStatus {
  return value === "learning" || value === "known" || value === "ignored"
    ? value
    : "new";
}

function clampRate(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_DISCOVERY_RATE;
  }

  return Math.max(0, Math.min(1, value));
}

function pickFirstDefinedValue(
  storage: StorageRecord,
  keys: readonly string[]
): unknown {
  for (const key of keys) {
    if (storage[key] !== undefined) {
      return storage[key];
    }
  }

  return undefined;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is StorageRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readPhraseSourceKind(value: unknown): CachedPhraseMatch["sourceKind"] | null {
  return value === "fixed-phrase" || value === "pattern-match" || value === "chunk"
    ? value
    : null;
}

function readPhraseCategory(value: unknown): CachedPhraseMatch["category"] | null {
  return value === "fixed-idiom" ||
    value === "function-phrase" ||
    value === "grammar-carrier" ||
    value === "adjective-noun" ||
    value === "noun-chunk"
    ? value
    : null;
}

function readGrammarFeatureCategory(
  value: unknown
): CachedGrammarFeature["category"] | null {
  return value === "tense-aspect" ||
    value === "modality" ||
    value === "syntax" ||
    value === "function" ||
    value === "other"
    ? value
    : null;
}
