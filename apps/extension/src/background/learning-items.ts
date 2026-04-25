import type {
  AssistEventMessage,
  LearningItem,
  QualifiedExposureEventMessage,
  ReviewEvent,
  ReviewGrade
} from "@immersionkit/shared";
import {
  REVIEW_INTERVALS_MS,
  RuntimeMessageType,
  addMs,
  scheduleAssistReview,
  scheduleQualifiedExposure
} from "@immersionkit/shared";

import {
  isRecord,
  pickFirstDefinedValue,
  readStorageValues,
  writeStorageValues
} from "./storage";

const LEARNING_ITEMS_STORAGE_KEYS = ["immersionkit.learningItems"] as const;
const REVIEW_EVENTS_STORAGE_KEYS = ["immersionkit.reviewEvents"] as const;
const CONTEXT_HISTORY_STORAGE_KEYS = [
  "immersionkit.learningItemContextHistory"
] as const;
const LEARNING_ITEMS_PRIMARY_KEY = LEARNING_ITEMS_STORAGE_KEYS[0];
const REVIEW_EVENTS_PRIMARY_KEY = REVIEW_EVENTS_STORAGE_KEYS[0];
const CONTEXT_HISTORY_PRIMARY_KEY = CONTEXT_HISTORY_STORAGE_KEYS[0];
const MAX_REVIEW_EVENTS = 500;
const MAX_CONTEXT_HISTORY_PER_ITEM = 50;
const EXPOSURE_DEDUPE_WINDOW_MS = 5 * 60 * 1000;

type LearningItemRecord = Record<string, LearningItem>;
type LearningItemContextHistoryRecord = Record<string, LearningItemContextHistory>;

type LearningItemContextHistory = {
  itemId: string;
  contexts: LearningItemContextEntry[];
};

type LearningItemContextEntry = {
  key: string;
  firstSeenAt: string;
  lastSeenAt: string;
  exposureCount: number;
};

export class BackgroundLearningItemService {
  async recordAssist(message: AssistEventMessage): Promise<LearningItem | null> {
    if (!isWordItemId(message.itemId)) {
      return null;
    }

    const now = message.createdAt || new Date().toISOString();
    const state = await this.loadState();
    const existing = state.items[message.itemId];
    const item = ensureWordLearningItem(existing, message.itemId, now);
    const nextItem = scheduleAssistReview(item, now);

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
    const contextUpdate = updateContextHistory({
      history: state.contextHistory[message.itemId],
      itemId: message.itemId,
      contextKey: readExposureContextKey(message),
      now
    });
    state.contextHistory[message.itemId] = contextUpdate.history;
    if (contextUpdate.isDuplicateWithinWindow) {
      await persistState(state);
      return item;
    }

    const scheduled = scheduleQualifiedExposure(item, {
      now,
      wasAssisted: message.wasAssisted,
      isDistinctContext: contextUpdate.isNewContext
    });
    const nextItem = scheduled.item;

    state.items[nextItem.itemId] = nextItem;
    if (scheduled.shouldCreateReviewEvent) {
      state.events.push(createReviewEvent(message, scheduled.grade, now));
    }

    await persistState(state);
    return nextItem;
  }

  private async loadState(): Promise<{
    items: LearningItemRecord;
    events: ReviewEvent[];
    contextHistory: LearningItemContextHistoryRecord;
  }> {
    const storage = await readStorageValues([
      ...LEARNING_ITEMS_STORAGE_KEYS,
      ...REVIEW_EVENTS_STORAGE_KEYS,
      ...CONTEXT_HISTORY_STORAGE_KEYS
    ]);
    const rawItems = pickFirstDefinedValue(storage, LEARNING_ITEMS_STORAGE_KEYS);
    const rawEvents = pickFirstDefinedValue(storage, REVIEW_EVENTS_STORAGE_KEYS);
    const rawContextHistory = pickFirstDefinedValue(
      storage,
      CONTEXT_HISTORY_STORAGE_KEYS
    );

    return {
      items: parseLearningItems(rawItems),
      events: parseReviewEvents(rawEvents),
      contextHistory: parseContextHistory(rawContextHistory)
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

function parseContextHistory(value: unknown): LearningItemContextHistoryRecord {
  if (!isRecord(value)) {
    return {};
  }

  const output: LearningItemContextHistoryRecord = {};
  for (const entry of Object.values(value)) {
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

async function persistState(state: {
  items: LearningItemRecord;
  events: ReviewEvent[];
  contextHistory: LearningItemContextHistoryRecord;
}): Promise<void> {
  await writeStorageValues({
    [LEARNING_ITEMS_PRIMARY_KEY]: state.items,
    [REVIEW_EVENTS_PRIMARY_KEY]: state.events.slice(-MAX_REVIEW_EVENTS),
    [CONTEXT_HISTORY_PRIMARY_KEY]: state.contextHistory
  });
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

function readExposureContextKey(
  message: QualifiedExposureEventMessage
): string | null {
  return (
    readString(message.distinctContextKey) ??
    (message.hostname ? `${message.hostname}:${message.sentenceHash}` : message.sentenceHash)
  );
}

function updateContextHistory(input: {
  history: LearningItemContextHistory | undefined;
  itemId: string;
  contextKey: string | null;
  now: string;
}): {
  history: LearningItemContextHistory;
  isNewContext: boolean;
  isDuplicateWithinWindow: boolean;
} {
  const history = input.history ?? {
    itemId: input.itemId,
    contexts: []
  };
  if (!input.contextKey) {
    return {
      history,
      isNewContext: false,
      isDuplicateWithinWindow: false
    };
  }

  const existing = history.contexts.find((context) => context.key === input.contextKey);
  if (existing) {
    const nowMs = Date.parse(input.now);
    const lastSeenMs = Date.parse(existing.lastSeenAt);
    const isDuplicateWithinWindow =
      Number.isFinite(nowMs) &&
      Number.isFinite(lastSeenMs) &&
      nowMs - lastSeenMs < EXPOSURE_DEDUPE_WINDOW_MS;
    if (!isDuplicateWithinWindow) {
      existing.lastSeenAt = input.now;
      existing.exposureCount += 1;
    }

    return {
      history,
      isNewContext: false,
      isDuplicateWithinWindow
    };
  }

  history.contexts.push({
    key: input.contextKey,
    firstSeenAt: input.now,
    lastSeenAt: input.now,
    exposureCount: 1
  });
  history.contexts = history.contexts.slice(-MAX_CONTEXT_HISTORY_PER_ITEM);

  return {
    history,
    isNewContext: true,
    isDuplicateWithinWindow: false
  };
}
