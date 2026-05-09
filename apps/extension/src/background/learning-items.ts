import type {
  AssistEventMessage,
  GrammarFeatureMatch,
  LearningItem,
  LearningUnitType,
  QualifiedExposureEventMessage,
  ReviewEvent,
  ReviewGrade
} from "@immersionkit/shared";
import {
  CONTENT_EVIDENCE_POLICY,
  REVIEW_INTERVALS_MS,
  RuntimeMessageType,
  buildLearningItemId,
  inferAssistReviewGrade,
  isSupportedLearningItemId,
  parseLearningItemId,
  resolveActiveCurriculumBand,
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
} from "../storage/learning-item-repository";
import { loadBackgroundRuntimeConfig } from "./settings";

const MAX_CONTEXT_HISTORY_PER_ITEM = 50;
const DEFAULT_BAND_BACKFILL_LIMIT = 50;

export class BackgroundLearningItemService {
  constructor(
    private readonly historyRepository: LearningHistoryRepository =
      new IndexedDbLearningHistoryRepository(),
    private readonly itemRepository: LearningItemRepository =
      new IndexedDbLearningItemRepository(),
    private readonly resolveActiveBandId: (
      unitType: LearningUnitType
    ) => Promise<string | null> = resolveActiveLearningBandId
  ) {}

  async listItems(): Promise<LearningItem[]> {
    return Object.values(await this.itemRepository.loadAll());
  }

  async listItemsByUnitRefIds(unitRefIds: readonly string[]): Promise<LearningItem[]> {
    const requested = new Set(
      unitRefIds.map((unitRefId) => unitRefId.trim()).filter(Boolean)
    );
    if (requested.size === 0) {
      return [];
    }

    return Object.values(await this.itemRepository.loadAll()).filter((item) =>
      requested.has(item.unitRefId)
    );
  }

  async upsertGrammarFeatureItems(
    features: readonly GrammarFeatureMatch[],
    now: string = new Date().toISOString()
  ): Promise<LearningItem[]> {
    const uniqueFeatures = dedupeGrammarFeatures(features);
    if (uniqueFeatures.length === 0) {
      return [];
    }

    const items = await this.itemRepository.loadAll();
    const updatedItems: LearningItem[] = [];
    for (const feature of uniqueFeatures) {
      const item = await this.buildGrammarFeatureLearningItem(
        items[buildLearningItemId("grammar-feature", feature.featureKey)],
        feature,
        now
      );
      items[item.itemId] = item;
      updatedItems.push(item);
    }

    await this.itemRepository.persistAll(items);
    return updatedItems;
  }

  async backfillMissingBands(limit: number = DEFAULT_BAND_BACKFILL_LIMIT): Promise<{
    scanned: number;
    updated: number;
    remaining: number;
  }> {
    const normalizedLimit = Math.max(0, Math.floor(limit));
    if (normalizedLimit === 0) {
      return {
        scanned: 0,
        updated: 0,
        remaining: 0
      };
    }

    const items = await this.itemRepository.loadAll();
    const entries = Object.entries(items).filter(([, item]) => !item.bandId);
    const batch = entries.slice(0, normalizedLimit);
    const resolvedBands = new Map<LearningUnitType, string | null>();
    let updated = 0;

    for (const [itemId, item] of batch) {
      let bandId = resolvedBands.get(item.unitType);
      if (!resolvedBands.has(item.unitType)) {
        bandId = await this.resolveActiveBandId(item.unitType);
        resolvedBands.set(item.unitType, bandId ?? null);
      }

      if (!bandId) {
        continue;
      }

      items[itemId] = {
        ...item,
        bandId
      };
      updated += 1;
    }

    if (updated > 0) {
      await this.itemRepository.persistAll(items);
    }

    return {
      scanned: batch.length,
      updated,
      remaining: Math.max(0, entries.length - batch.length)
    };
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

    const bandedItem = await assignBandIfMissing(item, this.resolveActiveBandId);
    const grade = inferAssistReviewGrade(bandedItem, now);
    const nextItem = scheduleAssistReview(bandedItem, now);

    state.items[nextItem.itemId] = nextItem;
    state.events.push(createReviewEvent(message, grade, now));
    await this.persistState(state);
    return nextItem;
  }

  private async buildGrammarFeatureLearningItem(
    existing: LearningItem | undefined,
    feature: GrammarFeatureMatch,
    now: string
  ): Promise<LearningItem> {
    const itemId = buildLearningItemId("grammar-feature", feature.featureKey);
    const baseItem: LearningItem = existing
      ? {
          ...existing,
          unitRefId: feature.featureKey,
          unitType: "grammar-feature",
          sourceText: feature.label || feature.featureKey
        }
      : {
          itemId,
          unitRefId: feature.featureKey,
          unitType: "grammar-feature",
          sourceText: feature.label || feature.featureKey,
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

    return assignBandIfMissing(baseItem, this.resolveActiveBandId);
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

    const bandedItem = await assignBandIfMissing(item, this.resolveActiveBandId);
    const contextUpdate = updateContextHistory({
      history: state.contextHistory[message.itemId],
      itemId: message.itemId,
      contextKey: readExposureContextKey(message),
      now
    });
    state.contextHistory[message.itemId] = contextUpdate.history;
    if (contextUpdate.isDuplicateWithinWindow) {
      state.items[bandedItem.itemId] = bandedItem;
      await this.persistState(state);
      return bandedItem;
    }

    const scheduled = scheduleQualifiedExposure(bandedItem, {
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

  const parsedItemId = parseLearningItemId(itemId);
  const unitRefId = parsedItemId?.unitType === "word" ? parsedItemId.unitRefId : "";
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

  const parsedItemId = parseLearningItemId(itemId);
  return parsedItemId?.unitType === "word"
    ? ensureWordLearningItem(existing, itemId, now)
    : null;
}

function dedupeGrammarFeatures(
  features: readonly GrammarFeatureMatch[]
): GrammarFeatureMatch[] {
  const seen = new Set<string>();
  const output: GrammarFeatureMatch[] = [];
  for (const feature of features) {
    const featureKey = feature.featureKey.trim();
    if (!featureKey || seen.has(featureKey)) {
      continue;
    }

    seen.add(featureKey);
    output.push({
      ...feature,
      featureKey
    });
  }

  return output;
}

async function assignBandIfMissing(
  item: LearningItem,
  resolveActiveBandId: (unitType: LearningUnitType) => Promise<string | null>
): Promise<LearningItem> {
  if (item.bandId) {
    return item;
  }

  const bandId = await resolveActiveBandId(item.unitType);
  return bandId ? { ...item, bandId } : item;
}

async function resolveActiveLearningBandId(
  unitType: LearningUnitType
): Promise<string | null> {
  const runtimeConfig = await loadBackgroundRuntimeConfig();
  return (
    resolveActiveCurriculumBand(
      runtimeConfig.curriculum.config,
      unitType,
      runtimeConfig.curriculum.profile
    )?.bandId ?? null
  );
}

function createReviewEvent(
  message: AssistEventMessage | QualifiedExposureEventMessage,
  grade: ReviewGrade,
  now: string
): ReviewEvent {
  return {
    eventId: `${message.eventId}:review`,
    itemId: message.itemId,
    unitType: readLearningUnitTypeFromItemId(message.itemId),
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

function readLearningUnitTypeFromItemId(itemId: string): LearningUnitType | undefined {
  return parseLearningItemId(itemId)?.unitType;
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
      nowMs - lastSeenMs < CONTENT_EVIDENCE_POLICY.evidenceDedupeWindowMs;
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
