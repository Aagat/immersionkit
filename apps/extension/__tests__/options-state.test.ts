import { describe, expect, it } from "vitest";
import type { LearningItem } from "@immersionkit/shared";

import {
  graduateCheckpoint,
  loadFirstRunIntroVisible,
  loadCurriculumDiagnostics,
  markFirstRunIntroSeen,
  summarizeActiveCurriculumContent,
  summarizeCheckpointEligibilityPreview,
  summarizeGrammarEvidenceStats
} from "../src/app-state/settings-state";
import { setUserDataValues } from "../src/storage/user-data-repository";
import { installChromeStub } from "./helpers/chrome-stub";
import { installIndexedDbStub } from "./helpers/indexeddb-stub";

describe("options state", () => {
  it("parses curriculum profile and last progression diagnostics", async () => {
    const indexedDbStub = installIndexedDbStub();
    await setUserDataValues({
      "learning-profile": {
        activeVocabularyBandId: "level-1b",
        activePhraseBandId: "level-1b",
        activeGrammarBandId: "level-1a",
        unlockedBandIds: ["level-1a", "level-1b", ""]
      },
      "curriculum-progression-diagnostics": {
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
        activeContent: {
          bandId: "level-1b",
          bandLabel: "Level 1B",
          vocabularyDomains: [
            "places",
            "days",
            "time words",
            "weather",
            "family",
            "frequency adverbs"
          ],
          phraseChunks: [
            "in the morning",
            "on Monday",
            "at school",
            "literal noun chunks with connectors"
          ],
          currentGrammarKeys: [],
          plannedGrammarKeys: [
            "question:basic-wh",
            "present:simple",
            "adverb:frequency"
          ],
          sentenceTokenRange: [5, 9],
          sentenceClausePolicy: "single clause",
          sentenceTargetPolicy: "0-1 target",
          sentenceNotes: "Low ambiguity with clear time or place anchoring."
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
      indexedDbStub.restore();
    }
  });

  it("summarizes active curriculum content for options diagnostics", () => {
    expect(
      summarizeActiveCurriculumContent({
        activeVocabularyBandId: "level-4a"
      })
    ).toMatchObject({
      bandId: "level-4a",
      bandLabel: "Level 4A",
      vocabularyDomains: expect.arrayContaining(["explanation", "systems"]),
      phraseChunks: expect.arrayContaining(["for example"]),
      currentGrammarKeys: ["aspect:have-been"],
      sentenceTokenRange: [10, 20],
      sentenceClausePolicy: "multi-clause allowed"
    });
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

  it("previews checkpoint-only curriculum blockers without advancing bands", () => {
    const preview = summarizeCheckpointEligibilityPreview({
      profile: {
        activeVocabularyBandId: "level-1c",
        activePhraseBandId: "level-1c",
        activeGrammarBandId: "level-1c"
      },
      items: [
        createLearningItem({
          itemId: "word:city",
          unitRefId: "city",
          unitType: "word",
          bandId: "level-1c",
          status: "reviewing",
          qualifiedExposureCount: 2
        }),
        createLearningItem({
          itemId: "phrase:used-to",
          unitRefId: "used-to",
          unitType: "phrase",
          bandId: "level-1c",
          status: "mastered",
          qualifiedExposureCount: 3
        })
      ],
      now: "2026-04-29T12:00:00.000Z"
    });

    expect(preview).toMatchObject({
      activeBandId: "level-1c",
      activeBandLabel: "Level 1C",
      nextBandId: "level-2a",
      nextBandLabel: "Level 2A",
      checkpointRequired: true,
      checkpointIsOnlyBlocker: true,
      unmetRequirements: ["checkpoint"]
    });
  });

  it("keeps unmet evidence requirements visible in checkpoint preview", () => {
    const preview = summarizeCheckpointEligibilityPreview({
      profile: {
        activeVocabularyBandId: "level-1c"
      },
      items: [
        createLearningItem({
          itemId: "word:city",
          unitRefId: "city",
          unitType: "word",
          bandId: "level-1c",
          status: "new",
          qualifiedExposureCount: 0
        })
      ],
      now: "2026-04-29T12:00:00.000Z"
    });

    expect(preview.checkpointRequired).toBe(true);
    expect(preview.checkpointIsOnlyBlocker).toBe(false);
    expect(preview.unmetRequirements).toEqual([
      "stable-item-ratio",
      "qualified-exposures",
      "checkpoint"
    ]);
  });

  it("requests explicit checkpoint graduation through the background runtime", async () => {
    const chromeStub = installChromeStub();
    chromeStub.setSendMessageHandler((message) => {
      expect(message).toEqual({
        type: "curriculum/graduate-checkpoint"
      });
      return {
        ok: true,
        advanced: true,
        previousBandId: "level-1c",
        nextBandId: "level-2a",
        reason: "checkpoint-advanced",
        unmetRequirements: []
      };
    });

    try {
      await expect(graduateCheckpoint()).resolves.toEqual({
        advanced: true,
        previousBandId: "level-1c",
        nextBandId: "level-2a",
        reason: "checkpoint-advanced",
        unmetRequirements: []
      });
      expect(chromeStub.sentMessages).toEqual([
        { type: "curriculum/graduate-checkpoint" }
      ]);
    } finally {
      chromeStub.restore();
    }
  });

  it("shows first-run guidance until it is dismissed", async () => {
    const indexedDbStub = installIndexedDbStub();

    try {
      await expect(loadFirstRunIntroVisible()).resolves.toBe(true);
      await markFirstRunIntroSeen();
      await expect(loadFirstRunIntroVisible()).resolves.toBe(false);
    } finally {
      indexedDbStub.restore();
    }
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
    bandId: input.bandId,
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
