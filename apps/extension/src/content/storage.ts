import type {
  ExtensionSettings,
  SeedLexiconEntry,
  SiteSetting,
  UserVocabEntry,
  VocabStatus
} from "@immersionkit/shared";

import {
  DEFAULT_DISCOVERY_RATE,
  DEFAULT_SETTINGS,
  FALLBACK_SEED_LEXICON,
  SAFE_POS,
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

export type ProcessingContext = {
  settings: ExtensionSettings;
  discoveryRate: number;
  siteSetting: SiteSetting | null;
  siteEnabled: boolean;
  lexicon: SeedLexiconEntry[];
  vocabByLemmaId: Map<string, UserVocabEntry>;
};

export async function loadProcessingContext(
  hostname: string
): Promise<ProcessingContext> {
  const storage = await readStorageValues([
    ...STORAGE_KEYS.settings,
    ...STORAGE_KEYS.siteSettings,
    ...STORAGE_KEYS.vocab,
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

  return {
    settings,
    discoveryRate,
    siteSetting,
    siteEnabled: siteSetting?.enabled ?? true,
    lexicon: parseLexiconEntries(
      pickFirstDefinedValue(storage, STORAGE_KEYS.seedLexicon)
    ),
    vocabByLemmaId: parseVocabEntries(
      pickFirstDefinedValue(storage, STORAGE_KEYS.vocab)
    )
  };
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

function parseLexiconEntries(input: unknown): SeedLexiconEntry[] {
  if (!Array.isArray(input)) {
    return FALLBACK_SEED_LEXICON;
  }

  const parsed = input
    .map((entry) => normalizeSeedEntry(entry))
    .filter((entry): entry is SeedLexiconEntry => Boolean(entry));

  return parsed.length > 0 ? parsed : FALLBACK_SEED_LEXICON;
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

function normalizeSeedEntry(input: unknown): SeedLexiconEntry | null {
  if (!isRecord(input)) {
    return null;
  }

  const sourceLemma = readString(input.sourceLemma);
  const targetLemma = readString(input.targetLemma);
  const lemmaId = readString(input.lemmaId);
  const pos = readString(input.pos) as SeedLexiconEntry["pos"];
  if (!lemmaId || !sourceLemma || !targetLemma || !SAFE_POS.has(pos)) {
    return null;
  }

  return {
    lemmaId,
    sourceLemma,
    targetLemma,
    pos,
    frequencyRank:
      typeof input.frequencyRank === "number" && Number.isFinite(input.frequencyRank)
        ? input.frequencyRank
        : null,
    confidence: readNumber(input.confidence, 0.9),
    inflections: Array.isArray(input.inflections)
      ? input.inflections.filter((value): value is string => typeof value === "string")
      : undefined
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
