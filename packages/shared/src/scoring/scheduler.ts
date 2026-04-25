import type { LearningItem, ReviewGrade } from "../domain/models";

export const REVIEW_INTERVALS_MS = [
  10 * 60 * 1000,
  24 * 60 * 60 * 1000,
  3 * 24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
  14 * 24 * 60 * 60 * 1000,
  30 * 24 * 60 * 60 * 1000,
  60 * 24 * 60 * 60 * 1000
] as const;

export type SchedulerDecision = {
  isDue: boolean;
  receivesDueBoost: boolean;
  reason: "suspended" | "new-item" | "missing-review-date" | "due" | "not-due";
};

export type QualifiedExposureScheduleResult = {
  item: LearningItem;
  grade: ReviewGrade;
  isDue: boolean;
  shouldCreateReviewEvent: boolean;
};

export function evaluateLearningItemSchedule(
  item: LearningItem | null | undefined,
  now: string | number | Date = Date.now()
): SchedulerDecision {
  if (!item) {
    return {
      isDue: false,
      receivesDueBoost: false,
      reason: "new-item"
    };
  }

  if (item.suspended || item.status === "suspended") {
    return {
      isDue: false,
      receivesDueBoost: false,
      reason: "suspended"
    };
  }

  if (!item.nextReviewAt) {
    const isReviewable = item.status === "learning" || item.status === "reviewing";
    return {
      isDue: isReviewable,
      receivesDueBoost: isReviewable,
      reason: "missing-review-date"
    };
  }

  const due = Date.parse(item.nextReviewAt) <= coerceTimeMs(now);
  return {
    isDue: due,
    receivesDueBoost: due,
    reason: due ? "due" : "not-due"
  };
}

export function shouldReceiveDueReviewBoost(
  item: LearningItem | null | undefined,
  now: string | number | Date = Date.now()
): boolean {
  return evaluateLearningItemSchedule(item, now).receivesDueBoost;
}

export function scheduleAssistReview(
  item: LearningItem,
  now: string
): LearningItem {
  return {
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
}

export function scheduleQualifiedExposure(
  item: LearningItem,
  input: {
    now: string;
    wasAssisted: boolean;
    isDistinctContext: boolean;
  }
): QualifiedExposureScheduleResult {
  const schedule = evaluateLearningItemSchedule(item, input.now);
  const nextReviewIndex = schedule.isDue
    ? Math.min(REVIEW_INTERVALS_MS.length - 1, reviewIntervalIndex(item.interval) + 1)
    : reviewIntervalIndex(item.interval);
  const nextInterval = REVIEW_INTERVALS_MS[nextReviewIndex];
  const nextConsecutiveUnassisted = input.wasAssisted
    ? 0
    : item.consecutiveUnassistedCount + 1;
  const grade: ReviewGrade = input.wasAssisted ? "hard" : "good";
  const shouldCreateReviewEvent = schedule.isDue || !item.nextReviewAt;

  return {
    grade,
    isDue: schedule.isDue,
    shouldCreateReviewEvent,
    item: {
      ...item,
      status: resolveStatusAfterExposure(
        item,
        nextReviewIndex,
        nextConsecutiveUnassisted
      ),
      lastExposedAt: input.now,
      lastReviewedAt: shouldCreateReviewEvent ? input.now : item.lastReviewedAt,
      nextReviewAt: shouldCreateReviewEvent
        ? addMs(input.now, nextInterval)
        : item.nextReviewAt,
      interval: shouldCreateReviewEvent ? nextInterval : item.interval,
      ease: input.wasAssisted
        ? Math.max(1.3, item.ease - 0.08)
        : item.ease + 0.04,
      qualifiedExposureCount: item.qualifiedExposureCount + 1,
      consecutiveUnassistedCount: nextConsecutiveUnassisted,
      distinctContextCount: input.isDistinctContext
        ? item.distinctContextCount + 1
        : item.distinctContextCount,
      suspended: false
    }
  };
}

export function reviewIntervalIndex(interval: number): number {
  const index = REVIEW_INTERVALS_MS.findIndex((candidate) => candidate >= interval);
  return index >= 0 ? index : 0;
}

export function addMs(timestamp: string, ms: number): string {
  const base = Date.parse(timestamp);
  return new Date((Number.isFinite(base) ? base : Date.now()) + ms).toISOString();
}

function resolveStatusAfterExposure(
  item: LearningItem,
  intervalIndexValue: number,
  consecutiveUnassistedCount: number
): LearningItem["status"] {
  if (item.status === "suspended") {
    return "suspended";
  }

  if (intervalIndexValue >= 5 && consecutiveUnassistedCount >= 3) {
    return "mastered";
  }

  if (intervalIndexValue >= 2) {
    return "reviewing";
  }

  return "learning";
}

function coerceTimeMs(value: string | number | Date): number {
  if (typeof value === "number") {
    return value;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  return Date.parse(value);
}
