import type { ReviewEvent } from "@immersionkit/shared";

import { isRecord } from "./storage";
import {
  INDEXEDDB_STORES,
  getIndexedDbStore,
  isIndexedDbAvailable,
  requestToPromise,
  transactionDone
} from "./indexeddb";

const MAX_REVIEW_EVENTS = 500;
const MAX_CONTEXT_HISTORY_PER_ITEM = 50;

export type LearningItemContextHistoryRecord = Record<
  string,
  LearningItemContextHistory
>;

export type LearningItemContextHistory = {
  itemId: string;
  contexts: LearningItemContextEntry[];
};

export type LearningItemContextEntry = {
  key: string;
  firstSeenAt: string;
  lastSeenAt: string;
  exposureCount: number;
};

export interface LearningHistoryRepository {
  loadReviewEvents(): Promise<ReviewEvent[]>;
  persistReviewEvents(events: readonly ReviewEvent[]): Promise<void>;
  loadContextHistory(): Promise<LearningItemContextHistoryRecord>;
  persistContextHistory(
    history: LearningItemContextHistoryRecord
  ): Promise<void>;
  clear(): Promise<void>;
}

export class IndexedDbLearningHistoryRepository
  implements LearningHistoryRepository
{
  async loadReviewEvents(): Promise<ReviewEvent[]> {
    if (!isIndexedDbAvailable()) {
      return [];
    }

    try {
      const store = await getIndexedDbStore(
        INDEXEDDB_STORES.reviewEvents,
        "readonly"
      );
      return parseReviewEvents(await requestToPromise(store.getAll()));
    } catch (error) {
      console.warn("ImmersionKit IndexedDB review event read failed.", error);
      return [];
    }
  }

  async persistReviewEvents(events: readonly ReviewEvent[]): Promise<void> {
    const normalizedEvents = parseReviewEvents(events).slice(-MAX_REVIEW_EVENTS);
    if (!isIndexedDbAvailable()) {
      return;
    }

    try {
      const store = await getIndexedDbStore(
        INDEXEDDB_STORES.reviewEvents,
        "readwrite"
      );
      const transaction = store.transaction;
      for (const event of normalizedEvents) {
        store.put(event);
      }

      const storedEvents = parseReviewEvents(await requestToPromise(store.getAll()));
      const excessEvents = storedEvents
        .sort(compareReviewEvents)
        .slice(0, Math.max(0, storedEvents.length - MAX_REVIEW_EVENTS));
      for (const event of excessEvents) {
        store.delete(event.eventId);
      }

      await transactionDone(transaction);
    } catch (error) {
      console.warn("ImmersionKit IndexedDB review event write failed.", error);
    }
  }

  async loadContextHistory(): Promise<LearningItemContextHistoryRecord> {
    if (!isIndexedDbAvailable()) {
      return {};
    }

    try {
      const store = await getIndexedDbStore(
        INDEXEDDB_STORES.learningItemContextHistory,
        "readonly"
      );
      return parseContextHistory(await requestToPromise(store.getAll()));
    } catch (error) {
      console.warn("ImmersionKit IndexedDB context history read failed.", error);
      return {};
    }
  }

  async persistContextHistory(
    history: LearningItemContextHistoryRecord
  ): Promise<void> {
    const normalizedHistory = parseContextHistory(history);
    if (!isIndexedDbAvailable()) {
      return;
    }

    try {
      const store = await getIndexedDbStore(
        INDEXEDDB_STORES.learningItemContextHistory,
        "readwrite"
      );
      const transaction = store.transaction;
      for (const entry of Object.values(normalizedHistory)) {
        store.put(entry);
      }
      await transactionDone(transaction);
    } catch (error) {
      console.warn("ImmersionKit IndexedDB context history write failed.", error);
    }
  }

  async clear(): Promise<void> {
    if (!isIndexedDbAvailable()) {
      return;
    }

    try {
      const reviewStore = await getIndexedDbStore(
        INDEXEDDB_STORES.reviewEvents,
        "readwrite"
      );
      const reviewTransaction = reviewStore.transaction;
      reviewStore.clear();
      await transactionDone(reviewTransaction);

      const contextStore = await getIndexedDbStore(
        INDEXEDDB_STORES.learningItemContextHistory,
        "readwrite"
      );
      const contextTransaction = contextStore.transaction;
      contextStore.clear();
      await transactionDone(contextTransaction);
    } catch (error) {
      console.warn("ImmersionKit IndexedDB learning history clear failed.", error);
    }
  }
}

export function parseReviewEvents(value: unknown): ReviewEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((event): event is ReviewEvent => {
    return isRecord(event) && typeof event.eventId === "string";
  });
}

export function parseContextHistory(
  value: unknown
): LearningItemContextHistoryRecord {
  const values = Array.isArray(value)
    ? value
    : isRecord(value)
      ? Object.values(value)
      : [];
  const output: LearningItemContextHistoryRecord = {};

  for (const entry of values) {
    if (!isRecord(entry)) {
      continue;
    }

    const itemId = readString(entry.itemId);
    if (!itemId || !Array.isArray(entry.contexts)) {
      continue;
    }

    const contexts = entry.contexts.flatMap((context): LearningItemContextEntry[] => {
      if (!isRecord(context)) {
        return [];
      }

      const key = readString(context.key);
      const firstSeenAt = readString(context.firstSeenAt);
      const lastSeenAt = readString(context.lastSeenAt);
      if (!key || !firstSeenAt || !lastSeenAt) {
        return [];
      }

      return [
        {
          key,
          firstSeenAt,
          lastSeenAt,
          exposureCount: readNumber(context.exposureCount, 1)
        }
      ];
    });

    output[itemId] = {
      itemId,
      contexts: contexts.slice(-MAX_CONTEXT_HISTORY_PER_ITEM)
    };
  }

  return output;
}

function compareReviewEvents(left: ReviewEvent, right: ReviewEvent): number {
  return `${left.createdAt}:${left.eventId}`.localeCompare(
    `${right.createdAt}:${right.eventId}`
  );
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
