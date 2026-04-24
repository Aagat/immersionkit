import type {
  AssistEventMessage,
  LearningItem,
  QualifiedExposureEventMessage,
  ReviewEvent,
  ReviewGrade
} from "@immersionkit/shared";
import { RuntimeMessageType } from "@immersionkit/shared";

import {
  isRecord,
  pickFirstDefinedValue,
  readStorageValues,
  writeStorageValues
} from "./storage";

const LEARNING_ITEMS_STORAGE_KEYS = ["immersionkit.learningItems"] as const;
const REVIEW_EVENTS_STORAGE_KEYS = ["immersionkit.reviewEvents"] as const;
const LEARNING_ITEMS_PRIMARY_KEY = LEARNING_ITEMS_STORAGE_KEYS[0];
const REVIEW_EVENTS_PRIMARY_KEY = REVIEW_EVENTS_STORAGE_KEYS[0];
const REVIEW_INTERVALS_MS = [
  10 * 60 * 1000,
  24 * 60 * 60 * 1000,
  3 * 24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
  14 * 24 * 60 * 60 * 1000,
  30 * 24 * 60 * 60 * 1000,
  60 * 24 * 60 * 60 * 1000
] as const;
const MAX_REVIEW_EVENTS = 500;

type LearningItemRecord = Record<string, LearningItem>;

export class BackgroundLearningItemService {
  async recordAssist(message: AssistEventMessage): Promise<LearningItem | null> {
    if (!isWordItemId(message.itemId)) {
      return null;
    }

    const now = message.createdAt || new Date().toISOString();
    const state = await this.loadState();
    const existing = state.items[message.itemId];
    const item = ensureWordLearningItem(existing, message.itemId, now);
    const nextItem: LearningItem = {
      ...item,
      status: item.status === "new" ? "learning" : item.status,
      lastReviewedAt: now,
      nextReviewAt: addMs(now, REVIEW_INTERVALS_MS[0]),
      interval: REVIEW_INTERVALS_MS[0],
      ease: Math.max(1.3, item.ease - 0.12),
      lapses:
        item.status === "reviewing" || item.status === "mastered"
          ? item.lapses + 1
          : item.lapses,
      assistCount: item.assistCount + 1,
      consecutiveUnassistedCount: 0,
      suspended: false
    };

    state.items[nextItem.itemId] = nextItem;
    state.events.push(createReviewEvent(message, "hard", now));
    await persistState(state);
    return nextItem;
  }

  async recordQualifiedExposure(
    message: QualifiedExposureEventMessage
  ): Promise<LearningItem | null> {
    if (!isWordItemId(message.itemId)) {
      return null;
    }

    const now = message.occurredAt || new Date().toISOString();
    const state = await this.loadState();
    const existing = state.items[message.itemId];
    const item = ensureWordLearningItem(existing, message.itemId, now);
    const isDue = !item.nextReviewAt || Date.parse(item.nextReviewAt) <= Date.parse(now);
    const distinctContextCount = Math.max(
      item.distinctContextCount,
      message.distinctContextKey ? item.distinctContextCount + 1 : item.distinctContextCount
    );
    const nextReviewIndex = isDue
      ? Math.min(REVIEW_INTERVALS_MS.length - 1, intervalIndex(item.interval) + 1)
      : intervalIndex(item.interval);
    const nextInterval = REVIEW_INTERVALS_MS[nextReviewIndex];
    const grade: ReviewGrade = message.wasAssisted ? "hard" : isDue ? "good" : "good";
    const nextItem: LearningItem = {
      ...item,
      status: resolveStatusAfterExposure(item, nextReviewIndex),
      lastExposedAt: now,
      lastReviewedAt: isDue ? now : item.lastReviewedAt,
      nextReviewAt: isDue ? addMs(now, nextInterval) : item.nextReviewAt,
      interval: isDue ? nextInterval : item.interval,
      ease: message.wasAssisted ? Math.max(1.3, item.ease - 0.08) : item.ease + 0.04,
      qualifiedExposureCount: item.qualifiedExposureCount + 1,
      consecutiveUnassistedCount: message.wasAssisted
        ? 0
        : item.consecutiveUnassistedCount + 1,
      distinctContextCount,
      suspended: false
    };

    state.items[nextItem.itemId] = nextItem;
    if (isDue || !item.nextReviewAt) {
      state.events.push(createReviewEvent(message, grade, now));
    }

    await persistState(state);
    return nextItem;
  }

  private async loadState(): Promise<{
    items: LearningItemRecord;
    events: ReviewEvent[];
  }> {
    const storage = await readStorageValues([
      ...LEARNING_ITEMS_STORAGE_KEYS,
      ...REVIEW_EVENTS_STORAGE_KEYS
    ]);
    const rawItems = pickFirstDefinedValue(storage, LEARNING_ITEMS_STORAGE_KEYS);
    const rawEvents = pickFirstDefinedValue(storage, REVIEW_EVENTS_STORAGE_KEYS);

    return {
      items: parseLearningItems(rawItems),
      events: parseReviewEvents(rawEvents)
    };
  }
}

function ensureWordLearningItem(
  existing: LearningItem | undefined,
  itemId: string,
  now: string
): LearningItem {
  if (existing) {
    return existing;
  }

  const unitRefId = itemId.replace(/^word:/, "");
  return {
    itemId,
    unitRefId,
    unitType: "word",
    sourceText: unitRefId,
    targetText: "",
    status: "new",
    introducedAt: now,
    nextReviewAt: now,
    interval: REVIEW_INTERVALS_MS[0],
    ease: 2.3,
    lapses: 0,
    assistCount: 0,
    qualifiedExposureCount: 0,
    consecutiveUnassistedCount: 0,
    distinctContextCount: 0,
    suspended: false
  };
}

function resolveStatusAfterExposure(
  item: LearningItem,
  intervalIndexValue: number
): LearningItem["status"] {
  if (item.status === "suspended") {
    return "suspended";
  }

  if (intervalIndexValue >= 5 && item.consecutiveUnassistedCount >= 3) {
    return "mastered";
  }

  if (intervalIndexValue >= 2) {
    return "reviewing";
  }

  return "learning";
}

function createReviewEvent(
  message: AssistEventMessage | QualifiedExposureEventMessage,
  grade: ReviewGrade,
  now: string
): ReviewEvent {
  return {
    eventId: `${message.eventId}:review`,
    itemId: message.itemId,
    eventType: "implicit-exposure",
    grade,
    contextSentenceHash: isQualifiedExposureMessage(message)
      ? message.sentenceHash
      : message.contextSentenceHash,
    hostname: message.hostname,
    sessionId: message.sessionId,
    createdAt: now
  };
}

function isQualifiedExposureMessage(
  message: AssistEventMessage | QualifiedExposureEventMessage
): message is QualifiedExposureEventMessage {
  return message.type === RuntimeMessageType.QualifiedExposureEvent;
}

function parseLearningItems(value: unknown): LearningItemRecord {
  if (!isRecord(value)) {
    return {};
  }

  const output: LearningItemRecord = {};
  for (const entry of Object.values(value)) {
    if (!isRecord(entry) || typeof entry.itemId !== "string") {
      continue;
    }

    output[entry.itemId] = normalizeLearningItem(entry);
  }

  return output;
}

function normalizeLearningItem(entry: Record<string, unknown>): LearningItem {
  const now = new Date().toISOString();
  const itemId = readString(entry.itemId) ?? "word:unknown";
  const unitRefId = readString(entry.unitRefId) ?? itemId.replace(/^word:/, "");

  return {
    itemId,
    unitRefId,
    unitType: entry.unitType === "phrase" || entry.unitType === "grammar-feature"
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

function parseReviewEvents(value: unknown): ReviewEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((event): event is ReviewEvent => {
    return isRecord(event) && typeof event.eventId === "string";
  });
}

async function persistState(state: {
  items: LearningItemRecord;
  events: ReviewEvent[];
}): Promise<void> {
  await writeStorageValues({
    [LEARNING_ITEMS_PRIMARY_KEY]: state.items,
    [REVIEW_EVENTS_PRIMARY_KEY]: state.events.slice(-MAX_REVIEW_EVENTS)
  });
}

function intervalIndex(interval: number): number {
  const index = REVIEW_INTERVALS_MS.findIndex((candidate) => candidate >= interval);
  return index >= 0 ? index : 0;
}

function addMs(timestamp: string, ms: number): string {
  const base = Date.parse(timestamp);
  return new Date((Number.isFinite(base) ? base : Date.now()) + ms).toISOString();
}

function isWordItemId(itemId: string): boolean {
  return /^word:[a-zA-Z0-9:_-]+$/.test(itemId);
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
