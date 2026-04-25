import {
  createRuntimePhraseRegistryEntry,
  type LearningItem,
  type PhraseOccurrence,
  type PhraseRegistryEntry
} from "@immersionkit/shared";

import {
  isRecord,
  pickFirstDefinedValue,
  readStorageValues,
  readString,
  writeStorageValues
} from "./storage";

const PHRASE_REGISTRY_STORAGE_KEYS = ["immersionkit.phraseRegistry"] as const;
const LEARNING_ITEMS_STORAGE_KEYS = ["immersionkit.learningItems"] as const;
const PHRASE_REGISTRY_PRIMARY_KEY = PHRASE_REGISTRY_STORAGE_KEYS[0];
const LEARNING_ITEMS_PRIMARY_KEY = LEARNING_ITEMS_STORAGE_KEYS[0];

type PhraseRegistryRecord = Record<string, PhraseRegistryEntry>;
type LearningItemRecord = Record<string, LearningItem>;

export interface PhraseRegistryRepository {
  get(phraseId: string): Promise<PhraseRegistryEntry | null>;
  upsertOccurrences(
    occurrences: readonly PhraseOccurrence[],
    now: string
  ): Promise<PhraseRegistryEntry[]>;
}

export class ChromeStoragePhraseRegistryRepository
  implements PhraseRegistryRepository
{
  async get(phraseId: string): Promise<PhraseRegistryEntry | null> {
    if (!phraseId) {
      return null;
    }

    const registry = await this.loadRegistry();
    return registry[phraseId] ?? null;
  }

  async upsertOccurrences(
    occurrences: readonly PhraseOccurrence[],
    now: string
  ): Promise<PhraseRegistryEntry[]> {
    if (occurrences.length === 0) {
      return [];
    }

    const registry = await this.loadRegistry();
    const learningItems = await this.loadLearningItems();
    const updated: PhraseRegistryEntry[] = [];
    for (const occurrence of occurrences) {
      const existing = registry[occurrence.phraseId];
      const nextEntry = mergePhraseOccurrence(existing, occurrence, now);
      registry[nextEntry.phraseId] = nextEntry;
      ensurePhraseLearningItem(learningItems, nextEntry, now);
      updated.push(nextEntry);
    }

    await writeStorageValues({
      [PHRASE_REGISTRY_PRIMARY_KEY]: registry,
      [LEARNING_ITEMS_PRIMARY_KEY]: learningItems
    });
    return updated;
  }

  private async loadRegistry(): Promise<PhraseRegistryRecord> {
    const storage = await readStorageValues(PHRASE_REGISTRY_STORAGE_KEYS);
    const rawRegistry = pickFirstDefinedValue(storage, PHRASE_REGISTRY_STORAGE_KEYS);
    if (!isRecord(rawRegistry)) {
      return {};
    }

    const registry: PhraseRegistryRecord = {};
    for (const value of Object.values(rawRegistry)) {
      const entry = normalizePhraseRegistryEntry(value);
      if (entry) {
        registry[entry.phraseId] = entry;
      }
    }

    return registry;
  }

  private async loadLearningItems(): Promise<LearningItemRecord> {
    const storage = await readStorageValues(LEARNING_ITEMS_STORAGE_KEYS);
    const rawItems = pickFirstDefinedValue(storage, LEARNING_ITEMS_STORAGE_KEYS);
    if (!isRecord(rawItems)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(rawItems).filter((entry): entry is [string, LearningItem] => {
        return isRecord(entry[1]) && readString(entry[1].itemId) === entry[0];
      })
    );
  }
}

export function mergePhraseOccurrence(
  existing: PhraseRegistryEntry | null | undefined,
  occurrence: PhraseOccurrence,
  now: string
): PhraseRegistryEntry {
  if (!existing) {
    return createRuntimePhraseRegistryEntry({
      sourceText: occurrence.sourceText,
      targetText: "",
      sourceKind: occurrence.sourceKind,
      category: occurrence.category,
      confidence: occurrence.confidence,
      firstSeenAt: now,
      lastSeenAt: now,
      exposureCount: 1
    });
  }

  return {
    ...existing,
    category: existing.category,
    confidence: Math.max(existing.confidence, occurrence.confidence),
    lastSeenAt: now,
    exposureCount: existing.exposureCount + 1
  };
}

function normalizePhraseRegistryEntry(value: unknown): PhraseRegistryEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const phraseId = readString(value.phraseId);
  const normalizedSourceText = readString(value.normalizedSourceText);
  const canonicalTargetText = readString(value.canonicalTargetText) ?? "";
  const normalizedTargetText = readString(value.normalizedTargetText) ?? "";
  const sourceKind = readPhraseSourceKind(value.sourceKind);
  const category = readPhraseCategory(value.category);
  const firstSeenAt = readString(value.firstSeenAt);
  const lastSeenAt = readString(value.lastSeenAt);

  if (
    !phraseId ||
    !normalizedSourceText ||
    !sourceKind ||
    !category ||
    !firstSeenAt ||
    !lastSeenAt
  ) {
    return null;
  }

  return {
    phraseId,
    normalizedSourceText,
    canonicalTargetText,
    normalizedTargetText,
    sourceKind,
    category,
    provenance: value.provenance === "seed" ? "seed" : "runtime",
    confidence: readNumber(value.confidence, 0),
    firstSeenAt,
    lastSeenAt,
    exposureCount: Math.max(0, Math.floor(readNumber(value.exposureCount, 0))),
    lexiconEntryId: readString(value.lexiconEntryId) ?? undefined
  };
}

function ensurePhraseLearningItem(
  learningItems: LearningItemRecord,
  entry: PhraseRegistryEntry,
  now: string
): void {
  const itemId = `phrase:${entry.phraseId}`;
  if (learningItems[itemId]) {
    return;
  }

  learningItems[itemId] = {
    itemId,
    unitRefId: entry.phraseId,
    unitType: "phrase",
    sourceText: entry.normalizedSourceText,
    targetText: entry.canonicalTargetText,
    status: "new",
    introducedAt: now,
    nextReviewAt: now,
    interval: 10 * 60 * 1000,
    ease: 2.3,
    lapses: 0,
    assistCount: 0,
    qualifiedExposureCount: 0,
    consecutiveUnassistedCount: 0,
    distinctContextCount: 0,
    suspended: false
  };
}

function readPhraseSourceKind(value: unknown): PhraseRegistryEntry["sourceKind"] | null {
  return value === "fixed-phrase" || value === "pattern-match" || value === "chunk"
    ? value
    : null;
}

function readPhraseCategory(value: unknown): PhraseRegistryEntry["category"] | null {
  return value === "fixed-idiom" ||
    value === "function-phrase" ||
    value === "grammar-carrier" ||
    value === "adjective-noun" ||
    value === "noun-chunk"
    ? value
    : null;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
