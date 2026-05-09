import { REVIEW_INTERVALS_MS, type LearningItem } from "@immersionkit/shared";

import { isRecord } from "./serialization";
import {
  INDEXEDDB_STORES,
  getIndexedDbStore,
  isIndexedDbAvailable,
  requestToPromise,
  transactionDone
} from "./indexeddb";

export type LearningItemRecord = Record<string, LearningItem>;

export interface LearningItemRepository {
  loadAll(): Promise<LearningItemRecord>;
  persistAll(items: LearningItemRecord): Promise<void>;
}

export class IndexedDbLearningItemRepository implements LearningItemRepository {
  async loadAll(): Promise<LearningItemRecord> {
    if (!isIndexedDbAvailable()) {
      return {};
    }

    try {
      const store = await getIndexedDbStore(INDEXEDDB_STORES.learningItems, "readonly");
      return parseLearningItems(await requestToPromise(store.getAll()));
    } catch (error) {
      console.warn("ImmersionKit IndexedDB learning item read failed.", error);
      return {};
    }
  }

  async persistAll(items: LearningItemRecord): Promise<void> {
    if (!isIndexedDbAvailable()) {
      return;
    }

    try {
      const store = await getIndexedDbStore(
        INDEXEDDB_STORES.learningItems,
        "readwrite"
      );
      const transaction = store.transaction;
      store.clear();
      for (const item of Object.values(parseLearningItems(items))) {
        store.put(item);
      }
      await transactionDone(transaction);
    } catch (error) {
      console.warn("ImmersionKit IndexedDB learning item write failed.", error);
    }
  }
}

function parseLearningItems(value: unknown): LearningItemRecord {
  const values = Array.isArray(value)
    ? value
    : isRecord(value)
      ? Object.values(value)
      : [];
  const output: LearningItemRecord = {};

  for (const entry of values) {
    if (!isRecord(entry) || typeof entry.itemId !== "string") {
      continue;
    }

    const item = normalizeLearningItem(entry);
    output[item.itemId] = item;
  }

  return output;
}

function normalizeLearningItem(entry: Record<string, unknown>): LearningItem {
  const now = new Date().toISOString();
  const itemId = readString(entry.itemId) ?? "word:unknown";
  const unitRefId = readString(entry.unitRefId) ?? itemId.replace(/^[^:]+:/, "");

  return {
    itemId,
    unitRefId,
    unitType:
      entry.unitType === "phrase" || entry.unitType === "grammar-feature"
        ? entry.unitType
        : "word",
    sourceText: readString(entry.sourceText) ?? unitRefId,
    targetText: readString(entry.targetText) ?? "",
    status: normalizeLearningStatus(entry.status),
    bandId: readString(entry.bandId) ?? undefined,
    introducedAt: readString(entry.introducedAt) ?? now,
    lastExposedAt: readString(entry.lastExposedAt) ?? undefined,
    lastReviewedAt: readString(entry.lastReviewedAt) ?? undefined,
    nextReviewAt: readString(entry.nextReviewAt) ?? undefined,
    interval: readNumber(entry.interval, REVIEW_INTERVALS_MS[0]),
    ease: readNumber(entry.ease, 2.3),
    lapses: readNumber(entry.lapses, 0),
    assistCount: readNumber(entry.assistCount, 0),
    qualifiedExposureCount: readNumber(entry.qualifiedExposureCount, 0),
    consecutiveUnassistedCount: readNumber(entry.consecutiveUnassistedCount, 0),
    distinctContextCount: readNumber(entry.distinctContextCount, 0),
    suspended: entry.suspended === true
  };
}

function normalizeLearningStatus(value: unknown): LearningItem["status"] {
  return value === "learning" ||
    value === "reviewing" ||
    value === "mastered" ||
    value === "suspended"
    ? value
    : "new";
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
