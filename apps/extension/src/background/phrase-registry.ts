import {
  createRuntimePhraseRegistryEntry,
  type LearningItem,
  type PhraseOccurrence,
  type PhraseRegistryEntry
} from "@immersionkit/shared";

import { isRecord, readString } from "./storage";
import {
  IndexedDbLearningItemRepository,
  type LearningItemRecord,
  type LearningItemRepository
} from "./learning-item-repository";
import {
  INDEXEDDB_STORES,
  getIndexedDbStore,
  isIndexedDbAvailable,
  requestToPromise,
  transactionDone
} from "./indexeddb";

export type PhraseRegistryRecord = Record<string, PhraseRegistryEntry>;

export interface PhraseRegistryStore {
  loadAll(): Promise<PhraseRegistryRecord>;
  persistAll(registry: PhraseRegistryRecord): Promise<void>;
}

export interface PhraseRegistryRepository {
  get(phraseId: string): Promise<PhraseRegistryEntry | null>;
  cleanupLegacyBlankTargetDuplicates(): Promise<LegacyPhraseCleanupResult>;
  upsertOccurrences(
    occurrences: readonly PhraseOccurrence[],
    now: string
  ): Promise<PhraseRegistryEntry[]>;
}

export type LegacyPhraseCleanupResult = {
  scanned: number;
  removedRegistryEntries: number;
  removedLearningItems: number;
};

export class IndexedDbPhraseRegistryRepository
  implements PhraseRegistryRepository
{
  constructor(
    private readonly learningItems: LearningItemRepository =
      new IndexedDbLearningItemRepository(),
    private readonly registryStore: PhraseRegistryStore =
      new IndexedDbPhraseRegistryStore()
  ) {}

  async get(phraseId: string): Promise<PhraseRegistryEntry | null> {
    if (!phraseId) {
      return null;
    }

    const registry = await this.loadRegistry();
    return registry[phraseId] ?? null;
  }

  async cleanupLegacyBlankTargetDuplicates(): Promise<LegacyPhraseCleanupResult> {
    const registry = await this.loadRegistry();
    const learningItems = await this.loadLearningItems();
    const canonicalTargets = new Set(
      Object.values(registry)
        .filter((entry) => hasPhraseTarget(entry))
        .map(buildLegacyCleanupKey)
    );
    let removedRegistryEntries = 0;
    let removedLearningItems = 0;

    for (const entry of Object.values(registry)) {
      if (hasPhraseTarget(entry) || !canonicalTargets.has(buildLegacyCleanupKey(entry))) {
        continue;
      }

      delete registry[entry.phraseId];
      removedRegistryEntries += 1;

      const itemId = `phrase:${entry.phraseId}`;
      if (learningItems[itemId]?.unitType === "phrase") {
        delete learningItems[itemId];
        removedLearningItems += 1;
      }
    }

    if (removedRegistryEntries > 0) {
      await this.persistRegistry(registry);
    }

    if (removedLearningItems > 0) {
      await this.learningItems.persistAll(learningItems);
    }

    return {
      scanned: Object.keys(registry).length + removedRegistryEntries,
      removedRegistryEntries,
      removedLearningItems
    };
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

    await this.persistRegistry(registry);
    await this.learningItems.persistAll(learningItems);
    return updated;
  }

  private async loadRegistry(): Promise<PhraseRegistryRecord> {
    return this.registryStore.loadAll();
  }

  private async loadLearningItems(): Promise<LearningItemRecord> {
    return this.learningItems.loadAll();
  }

  private async persistRegistry(registry: PhraseRegistryRecord): Promise<void> {
    await this.registryStore.persistAll(registry);
  }
}

export class IndexedDbPhraseRegistryStore implements PhraseRegistryStore {
  async loadAll(): Promise<PhraseRegistryRecord> {
    if (!isIndexedDbAvailable()) {
      return {};
    }

    try {
      const store = await getIndexedDbStore(INDEXEDDB_STORES.phraseRegistry, "readonly");
      return parsePhraseRegistry(await requestToPromise(store.getAll()));
    } catch (error) {
      console.warn("ImmersionKit IndexedDB phrase registry read failed.", error);
      return {};
    }
  }

  async persistAll(registry: PhraseRegistryRecord): Promise<void> {
    if (!isIndexedDbAvailable()) {
      return;
    }

    try {
      const store = await getIndexedDbStore(
        INDEXEDDB_STORES.phraseRegistry,
        "readwrite"
      );
      const transaction = store.transaction;
      store.clear();
      for (const entry of Object.values(registry)) {
        store.put(entry);
      }
      await transactionDone(transaction);
    } catch (error) {
      console.warn("ImmersionKit IndexedDB phrase registry write failed.", error);
    }
  }
}

export function mergePhraseOccurrence(
  existing: PhraseRegistryEntry | null | undefined,
  occurrence: PhraseOccurrence,
  now: string
): PhraseRegistryEntry {
  if (!existing) {
    const created = createRuntimePhraseRegistryEntry({
      sourceText: occurrence.sourceText,
      targetText: occurrence.targetText ?? "",
      sourceKind: occurrence.sourceKind,
      category: occurrence.category,
      confidence: occurrence.confidence,
      firstSeenAt: now,
      lastSeenAt: now,
      exposureCount: 1
    });
    return {
      ...created,
      phraseId: occurrence.phraseId
    };
  }

  return {
    ...existing,
    category: existing.category,
    confidence: Math.max(existing.confidence, occurrence.confidence),
    canonicalTargetText:
      occurrence.targetText && occurrence.targetText.trim().length > 0
        ? occurrence.targetText.trim()
        : existing.canonicalTargetText,
    normalizedTargetText:
      occurrence.normalizedTargetText && occurrence.normalizedTargetText.trim().length > 0
        ? occurrence.normalizedTargetText.trim()
        : existing.normalizedTargetText,
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

function parsePhraseRegistry(value: unknown): PhraseRegistryRecord {
  const values = Array.isArray(value)
    ? value
    : isRecord(value)
      ? Object.values(value)
      : [];
  const registry: PhraseRegistryRecord = {};
  for (const candidate of values) {
    const entry = normalizePhraseRegistryEntry(candidate);
    if (entry) {
      registry[entry.phraseId] = entry;
    }
  }

  return registry;
}

function ensurePhraseLearningItem(
  learningItems: LearningItemRecord,
  entry: PhraseRegistryEntry,
  now: string
): void {
  const itemId = `phrase:${entry.phraseId}`;
  const existing = learningItems[itemId];
  if (existing) {
    learningItems[itemId] = {
      ...existing,
      sourceText: entry.normalizedSourceText,
      targetText: entry.canonicalTargetText
    };
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

function hasPhraseTarget(entry: PhraseRegistryEntry): boolean {
  return (
    entry.canonicalTargetText.trim().length > 0 &&
    entry.normalizedTargetText.trim().length > 0 &&
    !entry.phraseId.endsWith(":empty")
  );
}

function buildLegacyCleanupKey(entry: PhraseRegistryEntry): string {
  return `${entry.sourceKind}:${entry.category}:${entry.normalizedSourceText}`;
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
