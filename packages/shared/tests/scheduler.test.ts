import {
  evaluateLearningItemSchedule,
  inferAssistReviewGrade,
  scheduleAssistReview,
  scheduleQualifiedExposure,
  shouldReceiveDueReviewBoost,
  type LearningItem
} from "../src";
import { describe, expect, it } from "vitest";

const BASE_ITEM: LearningItem = {
  itemId: "word:lemma-city",
  unitRefId: "lemma-city",
  unitType: "word",
  sourceText: "city",
  targetText: "ciudad",
  status: "learning",
  introducedAt: "2026-04-18T09:00:00.000Z",
  nextReviewAt: "2026-04-18T09:30:00.000Z",
  interval: 10 * 60 * 1000,
  ease: 2.3,
  lapses: 0,
  assistCount: 0,
  qualifiedExposureCount: 0,
  consecutiveUnassistedCount: 0,
  distinctContextCount: 0,
  suspended: false
};

describe("learning scheduler", () => {
  it("identifies due and not-due learning items", () => {
    expect(
      evaluateLearningItemSchedule(BASE_ITEM, "2026-04-18T10:00:00.000Z")
    ).toMatchObject({
      isDue: true,
      receivesDueBoost: true,
      reason: "due"
    });

    expect(
      evaluateLearningItemSchedule(
        {
          ...BASE_ITEM,
          nextReviewAt: "2026-04-18T11:00:00.000Z"
        },
        "2026-04-18T10:00:00.000Z"
      )
    ).toMatchObject({
      isDue: false,
      receivesDueBoost: false,
      reason: "not-due"
    });
  });

  it("boosts near-due items without treating them as due reviews", () => {
    expect(
      evaluateLearningItemSchedule(
        {
          ...BASE_ITEM,
          nextReviewAt: "2026-04-18T10:10:00.000Z"
        },
        "2026-04-18T10:00:00.000Z"
      )
    ).toMatchObject({
      isDue: false,
      receivesDueBoost: true,
      reason: "near-due"
    });
  });

  it("does not boost suspended items", () => {
    expect(
      shouldReceiveDueReviewBoost(
        {
          ...BASE_ITEM,
          status: "suspended",
          suspended: true
        },
        "2026-04-18T10:00:00.000Z"
      )
    ).toBe(false);
  });

  it("records assists as hard reviews on the first interval", () => {
    const item = scheduleAssistReview(BASE_ITEM, "2026-04-18T10:00:00.000Z");

    expect(item.status).toBe("learning");
    expect(item.assistCount).toBe(1);
    expect(item.consecutiveUnassistedCount).toBe(0);
    expect(item.interval).toBe(10 * 60 * 1000);
    expect(item.nextReviewAt).toBe("2026-04-18T10:10:00.000Z");
  });

  it("infers repeated assists as again reviews", () => {
    expect(
      inferAssistReviewGrade(
        {
          ...BASE_ITEM,
          assistCount: 1,
          lastReviewedAt: "2026-04-18T10:00:00.000Z"
        },
        "2026-04-18T10:05:00.000Z"
      )
    ).toBe("again");

    expect(inferAssistReviewGrade(BASE_ITEM, "2026-04-18T10:05:00.000Z")).toBe(
      "hard"
    );
  });

  it("advances due unassisted exposures and records new contexts", () => {
    const result = scheduleQualifiedExposure(BASE_ITEM, {
      now: "2026-04-18T10:00:00.000Z",
      wasAssisted: false,
      isDistinctContext: true
    });

    expect(result.isDue).toBe(true);
    expect(result.shouldCreateReviewEvent).toBe(true);
    expect(result.grade).toBe("good");
    expect(result.item.qualifiedExposureCount).toBe(1);
    expect(result.item.consecutiveUnassistedCount).toBe(1);
    expect(result.item.distinctContextCount).toBe(1);
    expect(result.item.nextReviewAt).toBe("2026-04-19T10:00:00.000Z");
  });

  it("keeps not-due exposures from changing the review schedule", () => {
    const item = {
      ...BASE_ITEM,
      nextReviewAt: "2026-04-18T11:00:00.000Z",
      interval: 24 * 60 * 60 * 1000
    };
    const result = scheduleQualifiedExposure(item, {
      now: "2026-04-18T10:00:00.000Z",
      wasAssisted: false,
      isDistinctContext: false
    });

    expect(result.isDue).toBe(false);
    expect(result.shouldCreateReviewEvent).toBe(false);
    expect(result.item.qualifiedExposureCount).toBe(1);
    expect(result.item.distinctContextCount).toBe(0);
    expect(result.item.nextReviewAt).toBe("2026-04-18T11:00:00.000Z");
    expect(result.item.interval).toBe(24 * 60 * 60 * 1000);
  });

  it("treats assisted exposures as harder evidence", () => {
    const result = scheduleQualifiedExposure(
      {
        ...BASE_ITEM,
        consecutiveUnassistedCount: 2
      },
      {
        now: "2026-04-18T10:00:00.000Z",
        wasAssisted: true,
        isDistinctContext: true
      }
    );

    expect(result.grade).toBe("hard");
    expect(result.item.consecutiveUnassistedCount).toBe(0);
    expect(result.item.ease).toBeCloseTo(2.22);
  });

  it("infers easy for due unassisted exposures with repeated distinct success", () => {
    const result = scheduleQualifiedExposure(
      {
        ...BASE_ITEM,
        interval: 24 * 60 * 60 * 1000,
        consecutiveUnassistedCount: 2,
        distinctContextCount: 2
      },
      {
        now: "2026-04-18T10:00:00.000Z",
        wasAssisted: false,
        isDistinctContext: true
      }
    );

    expect(result.grade).toBe("easy");
    expect(result.item.nextReviewAt).toBe("2026-04-25T10:00:00.000Z");
  });
});
