import { describe, expect, it } from "vitest";
import type { LearningItem } from "@immersionkit/shared";

import {
  loadCurriculumDiagnostics,
  summarizeGrammarEvidenceStats
} from "../src/options/state";
import { installChromeStub } from "./helpers/chrome-stub";

describe("options state", () => {
  it("parses curriculum profile and last progression diagnostics", async () => {
    const chromeStub = installChromeStub({
      "immersionkit.learningProfile": {
        activeVocabularyBandId: "level-1b",
        activePhraseBandId: "level-1b",
        activeGrammarBandId: "level-1a",
        unlockedBandIds: ["level-1a", "level-1b", ""]
      },
      "immersionkit.curriculum.lastProgressionDecision": {
        decidedAt: "2026-04-28T12:00:00.000Z",
        configId: "en-es-default-v1",
        previousBandId: "level-1a",
        nextBandId: "level-1b",
        eligible: true,
        reason: "advanced",
        unmetRequirements: [""],
        checkpointBoundary: false,
        activeVocabularyBandId: "level-1b",
        activePhraseBandId: "level-1b",
        activeGrammarBandId: "level-1b",
        unlockedBandIds: ["level-1a", "level-1b"]
      }
    });

    try {
      await expect(loadCurriculumDiagnostics()).resolves.toEqual({
        profile: {
          activeVocabularyBandId: "level-1b",
          activePhraseBandId: "level-1b",
          activeGrammarBandId: "level-1a",
          unlockedBandIds: ["level-1a", "level-1b"]
        },
        lastProgressionDecision: {
          decidedAt: "2026-04-28T12:00:00.000Z",
          configId: "en-es-default-v1",
          previousBandId: "level-1a",
          nextBandId: "level-1b",
          eligible: true,
          reason: "advanced",
          unmetRequirements: [],
          checkpointBoundary: false,
          activeVocabularyBandId: "level-1b",
          activePhraseBandId: "level-1b",
          activeGrammarBandId: "level-1b",
          unlockedBandIds: ["level-1a", "level-1b"]
        }
      });
    } finally {
      chromeStub.restore();
    }
  });

  it("summarizes grammar evidence from durable learning items", () => {
    expect(
      summarizeGrammarEvidenceStats(
        [
          createLearningItem({
            itemId: "grammar-feature:aspect:have-been",
            unitRefId: "aspect:have-been",
            unitType: "grammar-feature",
            assistCount: 2,
            qualifiedExposureCount: 3,
            nextReviewAt: "2026-04-29T10:00:00.000Z"
          }),
          createLearningItem({
            itemId: "grammar-feature:clause:if",
            unitRefId: "clause:if",
            unitType: "grammar-feature",
            assistCount: 1,
            qualifiedExposureCount: 0,
            nextReviewAt: "2026-05-01T10:00:00.000Z"
          }),
          createLearningItem({
            itemId: "grammar-feature:suspended",
            unitRefId: "suspended",
            unitType: "grammar-feature",
            assistCount: 10,
            qualifiedExposureCount: 10,
            suspended: true
          }),
          createLearningItem({
            itemId: "word:city",
            unitRefId: "city",
            unitType: "word",
            assistCount: 5,
            qualifiedExposureCount: 5
          })
        ],
        Date.parse("2026-04-29T12:00:00.000Z")
      )
    ).toEqual({
      featureCount: 2,
      assistCount: 3,
      qualifiedExposureCount: 3,
      dueCount: 1
    });
  });
});

function createLearningItem(
  input: Pick<LearningItem, "itemId" | "unitRefId" | "unitType"> &
    Partial<LearningItem>
): LearningItem {
  return {
    itemId: input.itemId,
    unitRefId: input.unitRefId,
    unitType: input.unitType,
    sourceText: input.sourceText ?? input.unitRefId,
    targetText: input.targetText ?? "",
    status: input.status ?? "new",
    introducedAt: input.introducedAt ?? "2026-04-29T09:00:00.000Z",
    nextReviewAt: input.nextReviewAt,
    interval: input.interval ?? 600000,
    ease: input.ease ?? 2.3,
    lapses: input.lapses ?? 0,
    assistCount: input.assistCount ?? 0,
    qualifiedExposureCount: input.qualifiedExposureCount ?? 0,
    consecutiveUnassistedCount: input.consecutiveUnassistedCount ?? 0,
    distinctContextCount: input.distinctContextCount ?? 0,
    suspended: input.suspended ?? false
  };
}
