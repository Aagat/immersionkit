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
  scheduleAssistReview,
  scheduleQualifiedExposure
} from "@immersionkit/shared";

import {
  IndexedDbLearningHistoryRepository,
  type LearningHistoryRepository,
  type LearningItemContextHistory,
  type LearningItemContextHistoryRecord
} from "./learning-history-repository";
import {
  IndexedDbLearningItemRepository,
  type LearningItemRecord,
  type LearningItemRepository
} from "./learning-item-repository";

const MAX_CONTEXT_HISTORY_PER_ITEM = 50;
const EXPOSURE_DEDUPE_WINDOW_MS = 5 * 60 * 1000;

export class BackgroundLearningItemService {
  constructor(
    private readonly historyRepository: LearningHistoryRepository =
      new IndexedDbLearningHistoryRepository(),
    private readonly itemRepository: LearningItemRepository =
      new IndexedDbLearningItemRepository()
  ) {}

  async listItems(): Promise<LearningItem[]> {
    return Object.values(await this.itemRepository.loadAll());
  }

  async recordAssist(message: AssistEventMessage): Promise<LearningItem | null> {
    if (!isSupportedLearningItemId(message.itemId)) {
      return null;
    }

    const now = message.createdAt || new Date().toISOString();
    const state = await this.loadState();
    const existing = state.items[message.itemId];
    const item = ensureLearningItem(existing, message.itemId, now);
    if (!item) {
      return null;
    }

    const nextItem = scheduleAssistReview(item, now);

    state.items[nextItem.itemId] = nextItem;
    state.events.push(createReviewEvent(message, "hard", now));
    await this.persistState(state);
    return nextItem;
  }

  async recordQualifiedExposure(
    message: QualifiedExposureEventMessage
  ): Promise<LearningItem | null> {
    if (!isSupportedLearningItemId(message.itemId)) {
      return null;
    }

    const now = message.occurredAt || new Date().toISOString();
    const state = await this.loadState();
    const existing = state.items[message.itemId];
    const item = ensureLearningItem(existing, message.itemId, now);
    if (!item) {
      return null;
    }

    const contextUpdate = updateContextHistory({
      history: state.contextHistory[message.itemId],
      itemId: message.itemId,
      contextKey: readExposureContextKey(message),
      now
    });
    state.contextHistory[message.itemId] = contextUpdate.history;
    if (contextUpdate.isDuplicateWithinWindow) {
      await this.persistState(state);
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

    await this.persistState(state);
    return nextItem;
  }

  private async loadState(): Promise<{
    items: LearningItemRecord;
    events: ReviewEvent[];
    contextHistory: LearningItemContextHistoryRecord;
  }> {
    return {
      items: await this.itemRepository.loadAll(),
      events: await this.historyRepository.loadReviewEvents(),
      contextHistory: await this.historyRepository.loadContextHistory()
    };
  }

  private async persistState(state: {
    items: LearningItemRecord;
    events: ReviewEvent[];
    contextHistory: LearningItemContextHistoryRecord;
  }): Promise<void> {
    await this.itemRepository.persistAll(state.items);
    await this.historyRepository.persistReviewEvents(state.events);
    await this.historyRepository.persistContextHistory(state.contextHistory);
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

function ensureLearningItem(
  existing: LearningItem | undefined,
  itemId: string,
  now: string
): LearningItem | null {
  if (existing) {
    return existing;
  }

  return isWordItemId(itemId) ? ensureWordLearningItem(existing, itemId, now) : null;
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

function isWordItemId(itemId: string): boolean {
  return /^word:[a-zA-Z0-9:_-]+$/.test(itemId);
}

function isSupportedLearningItemId(itemId: string): boolean {
  return /^(word|phrase):[a-zA-Z0-9:_-]+$/.test(itemId);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
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
