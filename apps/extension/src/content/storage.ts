import {
  RuntimeMessageType,
  normalizeToken,
  parseCurriculumRuntimeProfile
} from "@immersionkit/shared";
import type {
  ContentAssetContext,
  CurriculumConfig,
  CurriculumRuntimeProfileInput,
  ContextualWordCandidate,
  ExtensionSettings,
  GrammarFeatureMatch,
  LearningItem,
  PhraseOccurrence,
  RenderUnitEntry,
  SiteSetting,
  UserVocabEntry,
  VocabStatus
} from "@immersionkit/shared";
import { resolveCurriculumConfig } from "@immersionkit/shared";

import { parseRenderUnitAsset } from "../render-units/render-units";
import {
  isRecord,
  pickFirstDefinedValue,
  readString
} from "../storage/serialization";

import {
  DEFAULT_DISCOVERY_RATE,
  DEFAULT_SETTINGS,
  STORAGE_KEYS
} from "./constants";

type StorageRecord = Record<string, unknown>;

type VocabEntryRecord = {
  lexemeId: unknown;
  status: unknown;
  lastSeenAt?: unknown;
  exposureCount?: unknown;
  updatedAt?: unknown;
};

export type RenderAssetLoadSource =
  | "remote-pack"
  | "cached-pack"
  | "empty";

export type RenderAssetLoadInfo = {
  source: RenderAssetLoadSource;
  entryCount: number;
  assetVersion: string | null;
  isFallback: boolean;
};

export type ProcessingContext = {
  settings: ExtensionSettings;
  discoveryRate: number;
  siteSetting: SiteSetting | null;
  siteEnabled: boolean;
  renderUnits: RenderUnitEntry[];
  renderAssetInfo: RenderAssetLoadInfo;
  vocabByLexemeId: Map<string, UserVocabEntry>;
  learningItemsByUnitRefId: Map<string, LearningItem>;
  cachedWordRenderDecisions: Map<string, CachedWordRenderDecision[]>;
  cachedPhraseMatchesBySentenceHash: Map<string, CachedPhraseMatch[]>;
  sentenceHintPhrases: string[];
  cachedGrammarFeaturesBySentenceHash: Map<string, CachedGrammarFeature[]>;
  analysisContext: RuntimeAnalysisContext;
  curriculumConfig: CurriculumConfig;
  learningProfile: CurriculumRuntimeProfileInput;
};

export type CachedSentenceAnalysisContext = {
  entryCount: number;
  cachedWordRenderDecisions: Map<string, CachedWordRenderDecision[]>;
  cachedPhraseMatchesBySentenceHash: Map<string, CachedPhraseMatch[]>;
  cachedGrammarFeaturesBySentenceHash: Map<string, CachedGrammarFeature[]>;
  analysisContext: RuntimeAnalysisContext;
};

export type CachedWordRenderDecision = {
  sentenceHash: string;
  lexemeId: string;
  renderUnitId?: string;
  renderUnitMinBand?: string;
  normalizedSourceText?: string;
  normalizedText: string;
  targetText?: string;
  candidateLemma?: string;
  candidatePos?: ContextualWordCandidate["candidatePos"];
  confidence?: number;
  decision: "inject" | "skip";
  rationale?: string;
};

export type CachedContextSkipDecision = CachedWordRenderDecision;

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

export type RuntimeSentenceAnalysis = {
  wordDecisions: CachedWordRenderDecision[];
  wordDecisionsByToken: Map<string, CachedWordRenderDecision[]>;
  injectDecisionsByToken: Map<string, CachedWordRenderDecision[]>;
  skipByLexemeAndToken: Map<string, CachedWordRenderDecision>;
  phraseMatches: CachedPhraseMatch[];
  grammarFeatures: CachedGrammarFeature[];
};

export type RuntimeAnalysisContext = {
  entryCount: number;
  bySentenceHash: Map<string, RuntimeSentenceAnalysis>;
};

export type PersistVocabStatusInput = {
  lexemeId: string;
  status: VocabStatus;
  lastSeenAt?: string | null;
  updatedAt?: string;
  incrementExposure?: boolean;
};

export async function loadProcessingContext(
  hostname: string,
  sentenceHashes: readonly string[] = []
): Promise<ProcessingContext> {
  const [
    storage,
    assetContext,
    sentenceAnalysisContext
  ] = await Promise.all([
    readUserDataValues([
      ...STORAGE_KEYS.settings,
      ...STORAGE_KEYS.siteSettings,
      ...STORAGE_KEYS.curriculumConfig,
      ...STORAGE_KEYS.learningProfile
    ]),
    requestActiveAssetContext(),
    loadCachedSentenceAnalysisContext(sentenceHashes)
  ]);
  const relevantUnitRefIds = collectRelevantUnitRefIds(
    assetContext.renderUnits,
    sentenceAnalysisContext.analysisContext
  );
  const [vocabByLexemeId, learningItemsByUnitRefId] = await Promise.all([
    loadUserVocabByLexemeId(relevantUnitRefIds.lexemeIds),
    loadLearningItemsByUnitRefId(relevantUnitRefIds.learningUnitRefIds)
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

  const rawCurriculumConfig = pickFirstDefinedValue(
    storage,
    STORAGE_KEYS.curriculumConfig
  );
  const rawLearningProfile = pickFirstDefinedValue(
    storage,
    STORAGE_KEYS.learningProfile
  );

  return {
    settings,
    discoveryRate,
    siteSetting,
    siteEnabled: siteSetting?.enabled ?? true,
    renderUnits: assetContext.renderUnits,
    renderAssetInfo: {
      source: assetContext.source,
      entryCount: assetContext.renderUnits.length,
      assetVersion: assetContext.assetVersion,
      isFallback: assetContext.source === "empty"
    },
    sentenceHintPhrases: assetContext.sentenceHintPhrases,
    vocabByLexemeId: vocabByLexemeId ?? new Map(),
    learningItemsByUnitRefId,
    cachedWordRenderDecisions:
      sentenceAnalysisContext.cachedWordRenderDecisions,
    cachedPhraseMatchesBySentenceHash:
      sentenceAnalysisContext.cachedPhraseMatchesBySentenceHash,
    cachedGrammarFeaturesBySentenceHash:
      sentenceAnalysisContext.cachedGrammarFeaturesBySentenceHash,
    analysisContext: sentenceAnalysisContext.analysisContext,
    curriculumConfig: resolveCurriculumConfig(
      isRecord(rawCurriculumConfig)
        ? (rawCurriculumConfig as Partial<CurriculumConfig>)
        : null
    ),
    learningProfile: parseCurriculumRuntimeProfile(rawLearningProfile)
  };
}

export async function loadCachedSentenceAnalysisContext(
  sentenceHashes: readonly string[]
): Promise<CachedSentenceAnalysisContext> {
  const sentenceAnalysisCache = await loadCachedSentenceAnalysisEntries(sentenceHashes);
  const analysisContext = buildRuntimeAnalysisContext(sentenceAnalysisCache);

  return {
    entryCount: sentenceAnalysisCache.length,
    cachedWordRenderDecisions: mapRuntimeAnalysis(
      analysisContext,
      (entry) => entry.wordDecisions
    ),
    cachedPhraseMatchesBySentenceHash: mapRuntimeAnalysis(
      analysisContext,
      (entry) => entry.phraseMatches
    ),
    cachedGrammarFeaturesBySentenceHash: mapRuntimeAnalysis(
      analysisContext,
      (entry) => entry.grammarFeatures
    ),
    analysisContext
  };
}

function collectRelevantUnitRefIds(
  renderUnits: readonly RenderUnitEntry[],
  analysisContext: RuntimeAnalysisContext
): {
  lexemeIds: string[];
  learningUnitRefIds: string[];
} {
  const lexemeIds = new Set<string>();
  const learningUnitRefIds = new Set<string>();

  for (const renderUnit of renderUnits) {
    for (const lexemeId of renderUnit.lexemeIds) {
      if (lexemeId.trim()) {
        lexemeIds.add(lexemeId);
        learningUnitRefIds.add(lexemeId);
      }
    }
  }

  for (const analysis of analysisContext.bySentenceHash.values()) {
    for (const decision of analysis.wordDecisions) {
      if (decision.lexemeId.trim()) {
        lexemeIds.add(decision.lexemeId);
        learningUnitRefIds.add(decision.lexemeId);
      }
    }

    for (const phraseMatch of analysis.phraseMatches) {
      if (phraseMatch.phraseId.trim()) {
        learningUnitRefIds.add(phraseMatch.phraseId);
      }
    }

    for (const grammarFeature of analysis.grammarFeatures) {
      if (grammarFeature.featureId.trim()) {
        learningUnitRefIds.add(grammarFeature.featureId);
      }
    }
  }

  return {
    lexemeIds: [...lexemeIds],
    learningUnitRefIds: [...learningUnitRefIds]
  };
}

function buildRuntimeAnalysisContext(input: unknown): RuntimeAnalysisContext {
  const cachedWordRenderDecisions = parseCachedWordRenderDecisions(input);
  const cachedPhraseMatchesBySentenceHash = parseCachedPhraseMatches(input);
  const cachedGrammarFeaturesBySentenceHash = parseCachedGrammarFeatures(input);
  const sentenceHashes = new Set([
    ...cachedWordRenderDecisions.keys(),
    ...cachedPhraseMatchesBySentenceHash.keys(),
    ...cachedGrammarFeaturesBySentenceHash.keys()
  ]);
  const bySentenceHash = new Map<string, RuntimeSentenceAnalysis>();

  for (const sentenceHash of sentenceHashes) {
    bySentenceHash.set(
      sentenceHash,
      buildRuntimeSentenceAnalysis({
        wordDecisions: cachedWordRenderDecisions.get(sentenceHash) ?? [],
        phraseMatches: cachedPhraseMatchesBySentenceHash.get(sentenceHash) ?? [],
        grammarFeatures: cachedGrammarFeaturesBySentenceHash.get(sentenceHash) ?? []
      })
    );
  }

  return {
    entryCount: readEntryCount(input),
    bySentenceHash
  };
}

export function mergeRuntimeAnalysisContext(
  target: RuntimeAnalysisContext,
  source: RuntimeAnalysisContext
) {
  target.entryCount += source.entryCount;
  for (const [sentenceHash, analysis] of source.bySentenceHash) {
    target.bySentenceHash.set(sentenceHash, analysis);
  }
}

export function upsertRuntimeSentenceAnalysis(
  context: RuntimeAnalysisContext,
  sentenceHash: string,
  input: {
    wordDecisions?: readonly CachedWordRenderDecision[];
    phraseMatches?: readonly CachedPhraseMatch[];
    grammarFeatures?: readonly CachedGrammarFeature[];
  }
) {
  const existing = context.bySentenceHash.get(sentenceHash);
  context.bySentenceHash.set(
    sentenceHash,
    buildRuntimeSentenceAnalysis({
      wordDecisions: [...(input.wordDecisions ?? existing?.wordDecisions ?? [])],
      phraseMatches: [...(input.phraseMatches ?? existing?.phraseMatches ?? [])],
      grammarFeatures: [...(input.grammarFeatures ?? existing?.grammarFeatures ?? [])]
    })
  );
}

export function findRuntimeWordDecision(input: {
  analysisContext?: RuntimeAnalysisContext;
  sentenceHash: string;
  sourceToken: string;
  decision: "inject" | "skip";
  lexemeId?: string;
  renderUnitId?: string;
}): CachedWordRenderDecision | null {
  const sentenceAnalysis = input.analysisContext?.bySentenceHash.get(input.sentenceHash);
  if (!sentenceAnalysis) {
    return null;
  }

  const normalizedSourceToken = normalizeToken(input.sourceToken);
  if (!normalizedSourceToken) {
    return null;
  }

  if (input.decision === "skip" && input.lexemeId) {
    const exactSkip = sentenceAnalysis.skipByLexemeAndToken.get(
      createSkipDecisionKey({
        lexemeId: input.lexemeId,
        renderUnitId: input.renderUnitId,
        normalizedText: normalizedSourceToken
      })
    );
    if (exactSkip) {
      return exactSkip;
    }

    const genericSkip = sentenceAnalysis.skipByLexemeAndToken.get(
      createSkipDecisionKey({
        lexemeId: input.lexemeId,
        normalizedText: normalizedSourceToken
      })
    );
    if (genericSkip) {
      return genericSkip;
    }
  }

  const decisions =
    input.decision === "inject"
      ? sentenceAnalysis.injectDecisionsByToken.get(normalizedSourceToken) ?? []
      : sentenceAnalysis.wordDecisionsByToken.get(normalizedSourceToken) ?? [];

  return (
    decisions.find((decision) => {
      if (decision.decision !== input.decision) {
        return false;
      }

      if (input.lexemeId && decision.lexemeId !== input.lexemeId) {
        return false;
      }

      if (
        input.renderUnitId &&
        decision.renderUnitId &&
        decision.renderUnitId !== input.renderUnitId
      ) {
        return false;
      }

      return true;
    }) ?? null
  );
}

export async function persistVocabStatus(
  input: PersistVocabStatusInput
): Promise<UserVocabEntry | null> {
  const lexemeId = readString(input.lexemeId);
  if (!lexemeId) {
    return null;
  }

  const backgroundEntry = await persistVocabStatusInBackground({
    ...input,
    lexemeId
  });
  if (backgroundEntry !== undefined) {
    return backgroundEntry;
  }

  return null;
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

async function readUserDataValues(keys: readonly string[]): Promise<StorageRecord> {
  return (await requestUserDataValues(keys)) ?? {};
}

async function requestUserDataValues(
  keys: readonly string[]
): Promise<StorageRecord | null> {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    return null;
  }

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: RuntimeMessageType.GetUserData,
        keys: [...new Set(keys)]
      },
      (response?: unknown) => {
        if (
          chrome.runtime.lastError ||
          !isRecord(response) ||
          response.ok !== true ||
          !isRecord(response.values)
        ) {
          resolve(null);
          return;
        }

        resolve(response.values as StorageRecord);
      }
    );
  });
}

async function loadLearningItemsByUnitRefId(
  unitRefIds?: readonly string[]
): Promise<Map<string, LearningItem>> {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    return new Map();
  }

  const requestedUnitRefIds = Array.isArray(unitRefIds)
    ? [...new Set(unitRefIds.map((id) => id.trim()).filter(Boolean))].slice(0, 500)
    : undefined;

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

async function loadUserVocabByLexemeId(
  lexemeIds?: readonly string[]
): Promise<Map<string, UserVocabEntry> | null> {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    return null;
  }

  const requestedLexemeIds = Array.isArray(lexemeIds)
    ? [...new Set(lexemeIds.map((id) => id.trim()).filter(Boolean))].slice(0, 1000)
    : undefined;

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: RuntimeMessageType.GetUserVocab,
        lexemeIds: requestedLexemeIds
      },
      (response?: unknown) => {
        if (
          chrome.runtime.lastError ||
          !isRecord(response) ||
          response.ok !== true ||
          !Array.isArray(response.entries)
        ) {
          resolve(null);
          return;
        }

        resolve(parseVocabEntries(response.entries));
      }
    );
  });
}

async function persistVocabStatusInBackground(
  input: PersistVocabStatusInput
): Promise<UserVocabEntry | null | undefined> {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    return undefined;
  }

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: RuntimeMessageType.SetVocabStatus,
        lexemeId: input.lexemeId,
        status: input.status,
        lastSeenAt: input.lastSeenAt,
        updatedAt: input.updatedAt,
        incrementExposure: input.incrementExposure
      },
      (response?: unknown) => {
        if (
          chrome.runtime.lastError ||
          !isRecord(response) ||
          response.ok !== true
        ) {
          resolve(undefined);
          return;
        }

        resolve(normalizeVocabEntry(response.entry));
      }
    );
  });
}

async function requestActiveAssetContext(): Promise<ContentAssetContext> {
  const emptyContext: ContentAssetContext = {
    renderUnits: [],
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
    renderUnits: readRenderUnits(input.renderUnits),
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

function readAssetContextSource(value: unknown): RenderAssetLoadSource | null {
  return value === "remote-pack" ||
    value === "cached-pack" ||
    value === "empty"
    ? value
    : null;
}

function readRenderUnits(input: unknown): RenderUnitEntry[] {
  const parsed = parseRenderUnitAsset({
    entries: Array.isArray(input) ? input : []
  });
  return parsed?.entries ?? [];
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

  return new Map(entries.map((entry) => [entry.lexemeId, entry]));
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

function buildRuntimeSentenceAnalysis(input: {
  wordDecisions: readonly CachedWordRenderDecision[];
  phraseMatches: readonly CachedPhraseMatch[];
  grammarFeatures: readonly CachedGrammarFeature[];
}): RuntimeSentenceAnalysis {
  const wordDecisions = [...input.wordDecisions];
  const wordDecisionsByToken = new Map<string, CachedWordRenderDecision[]>();
  const injectDecisionsByToken = new Map<string, CachedWordRenderDecision[]>();
  const skipByLexemeAndToken = new Map<string, CachedWordRenderDecision>();

  for (const decision of wordDecisions) {
    const normalizedText = normalizeToken(decision.normalizedText);
    if (!normalizedText) {
      continue;
    }

    appendRuntimeAnalysisValue(wordDecisionsByToken, normalizedText, decision);
    if (decision.decision === "inject") {
      appendRuntimeAnalysisValue(injectDecisionsByToken, normalizedText, decision);
      continue;
    }

    skipByLexemeAndToken.set(
      createSkipDecisionKey({
        lexemeId: decision.lexemeId,
        renderUnitId: decision.renderUnitId,
        normalizedText
      }),
      decision
    );
    skipByLexemeAndToken.set(
      createSkipDecisionKey({
        lexemeId: decision.lexemeId,
        normalizedText
      }),
      decision
    );
  }

  return {
    wordDecisions,
    wordDecisionsByToken,
    injectDecisionsByToken,
    skipByLexemeAndToken,
    phraseMatches: [...input.phraseMatches],
    grammarFeatures: [...input.grammarFeatures]
  };
}

function appendRuntimeAnalysisValue<T>(
  map: Map<string, T[]>,
  key: string,
  value: T
) {
  const existing = map.get(key);
  if (existing) {
    existing.push(value);
    return;
  }

  map.set(key, [value]);
}

function createSkipDecisionKey(input: {
  lexemeId: string;
  renderUnitId?: string;
  normalizedText: string;
}): string {
  return [
    input.lexemeId,
    input.renderUnitId ?? "",
    normalizeToken(input.normalizedText)
  ].join("\u0000");
}

function mapRuntimeAnalysis<T>(
  context: RuntimeAnalysisContext,
  select: (entry: RuntimeSentenceAnalysis) => readonly T[]
): Map<string, T[]> {
  const output = new Map<string, T[]>();
  for (const [sentenceHash, entry] of context.bySentenceHash) {
    const values = [...select(entry)];
    if (values.length > 0) {
      output.set(sentenceHash, values);
    }
  }

  return output;
}

function readEntryCount(input: unknown): number {
  if (Array.isArray(input)) {
    return input.length;
  }

  if (isRecord(input)) {
    return Object.keys(input).length;
  }

  return 0;
}

function parseCachedWordRenderDecisions(
  input: unknown
): Map<string, CachedWordRenderDecision[]> {
  const decisionsBySentenceHash = new Map<string, CachedWordRenderDecision[]>();
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
      const decision = normalizeCachedWordRenderDecision(sentenceHash, candidate);
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

function normalizeCachedWordRenderDecision(
  fallbackSentenceHash: string,
  input: unknown
): CachedWordRenderDecision | null {
  if (
    !isRecord(input) ||
    (input.decision !== "inject" && input.decision !== "skip")
  ) {
    return null;
  }

  const candidate = input as Partial<ContextualWordCandidate>;
  const lexemeId = readString(candidate.lexemeId);
  const normalizedText =
    readString(candidate.normalizedText) ?? readString(candidate.tokenText);
  if (!lexemeId || !normalizedText) {
    return null;
  }

  return {
    sentenceHash: readString(candidate.sentenceHash) ?? fallbackSentenceHash,
    lexemeId,
    renderUnitId: readString(candidate.renderUnitId) ?? undefined,
    renderUnitMinBand: readString(candidate.renderUnitMinBand) ?? undefined,
    normalizedSourceText: readString(candidate.normalizedSourceText) ?? undefined,
    normalizedText,
    targetText:
      readString(candidate.targetText) ?? readString(candidate.targetLemma) ?? undefined,
    candidateLemma: readString(candidate.candidateLemma) ?? undefined,
    candidatePos: readSafeCandidatePos(candidate.candidatePos),
    confidence:
      typeof candidate.confidence === "number" && Number.isFinite(candidate.confidence)
        ? candidate.confidence
        : undefined,
    decision: input.decision,
    rationale: readString(candidate.rationale) ?? undefined
  };
}

function normalizeVocabEntry(input: unknown): UserVocabEntry | null {
  if (!isRecord(input)) {
    return null;
  }

  const record = input as VocabEntryRecord;
  const lexemeId = readString(record.lexemeId);
  if (!lexemeId) {
    return null;
  }

  const status = normalizeStatus(record.status);
  const updatedAt = readString(record.updatedAt) ?? new Date().toISOString();

  return {
    lexemeId,
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

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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

function readSafeCandidatePos(
  value: unknown
): ContextualWordCandidate["candidatePos"] | undefined {
  return value === "noun" || value === "adjective" || value === "adverb"
    ? value
    : undefined;
}
