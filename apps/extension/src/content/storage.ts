import type {
  ExtensionSettings,
  LearningItem,
  SeedLexiconEntry,
  SiteSetting,
  UserVocabEntry,
  VocabStatus
} from "@immersionkit/shared";

import bundledSeedLexiconAsset from "../assets/en-es.seed.v1.json";
import {
  DEFAULT_DISCOVERY_RATE,
  DEFAULT_SETTINGS,
  FALLBACK_SEED_LEXICON,
  STORAGE_KEYS
} from "./constants";
import {
  isLikelyFallbackSeedLexicon,
  parseSeedLexiconInput
} from "../seed/seed-lexicon";

type StorageRecord = Record<string, unknown>;

type VocabEntryRecord = {
  lemmaId: unknown;
  status: unknown;
  lastSeenAt?: unknown;
  exposureCount?: unknown;
  updatedAt?: unknown;
};

export type LexiconLoadSource =
  | "storage-wrapped-asset"
  | "storage-legacy-array"
  | "bundled-asset"
  | "fallback";

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
};

export type PersistVocabStatusInput = {
  lemmaId: string;
  status: VocabStatus;
  lastSeenAt?: string | null;
  updatedAt?: string;
  incrementExposure?: boolean;
};

export async function loadProcessingContext(
  hostname: string
): Promise<ProcessingContext> {
  const storage = await readStorageValues([
    ...STORAGE_KEYS.settings,
    ...STORAGE_KEYS.siteSettings,
    ...STORAGE_KEYS.vocab,
    ...STORAGE_KEYS.learningItems,
    ...STORAGE_KEYS.seedLexicon
  ]);

  const settings = parseSettings(
    pickFirstDefinedValue(storage, STORAGE_KEYS.settings)
  );

  const siteSetting = parseSiteSetting(
    pickFirstDefinedValue(storage, STORAGE_KEYS.siteSettings),
    hostname
  );

  const discoveryRate = clampRate(
    siteSetting?.discoveryRate ?? settings.discoveryRate ?? DEFAULT_DISCOVERY_RATE
  );

  const lexiconInfo = resolveLexicon(
    pickFirstDefinedValue(storage, STORAGE_KEYS.seedLexicon)
  );

  return {
    settings,
    discoveryRate,
    siteSetting,
    siteEnabled: siteSetting?.enabled ?? true,
    lexicon: lexiconInfo.entries,
    lexiconInfo: {
      source: lexiconInfo.source,
      entryCount: lexiconInfo.entries.length,
      assetVersion: lexiconInfo.assetVersion,
      isFallback: lexiconInfo.isFallback
    },
    vocabByLemmaId: parseVocabEntries(
      pickFirstDefinedValue(storage, STORAGE_KEYS.vocab)
    ),
    learningItemsByUnitRefId: parseLearningItems(
      pickFirstDefinedValue(storage, STORAGE_KEYS.learningItems)
    )
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
      resolve();
    });
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

const BUNDLED_SEED_LEXICON = parseSeedLexiconInput(bundledSeedLexiconAsset);

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

  if (!isRecord(input)) {
    return new Map();
  }

  for (const value of Object.values(input)) {
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

function resolveLexicon(input: unknown): {
  entries: SeedLexiconEntry[];
  source: LexiconLoadSource;
  assetVersion: string | null;
  isFallback: boolean;
} {
  const parsedStorageLexicon = parseSeedLexiconInput(input);
  if (
    parsedStorageLexicon &&
    parsedStorageLexicon.entries.length > 0 &&
    !isLikelyFallbackSeedLexicon(parsedStorageLexicon.entries)
  ) {
    return {
      entries: parsedStorageLexicon.entries,
      source:
        parsedStorageLexicon.format === "legacy-object-array"
          ? "storage-legacy-array"
          : "storage-wrapped-asset",
      assetVersion: parsedStorageLexicon.assetVersion,
      isFallback: false
    };
  }

  if (BUNDLED_SEED_LEXICON && BUNDLED_SEED_LEXICON.entries.length > 0) {
    return {
      entries: BUNDLED_SEED_LEXICON.entries,
      source: "bundled-asset",
      assetVersion: BUNDLED_SEED_LEXICON.assetVersion,
      isFallback: false
    };
  }

  return {
    entries: FALLBACK_SEED_LEXICON,
    source: "fallback",
    assetVersion: null,
    isFallback: true
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
