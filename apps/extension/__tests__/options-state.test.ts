import { describe, expect, it } from "vitest";
import type { LearningItem } from "@immersionkit/shared";

import {
  graduateCheckpoint,
  loadFirstRunIntroVisible,
  loadCurriculumDiagnostics,
  loadSiteSettingsMap,
  markFirstRunIntroSeen,
  parseProficiencySeed,
  proficiencySeedToBandId,
  createLearningProfileForProficiencySeed,
  createLearningProfileForBand,
  getExactActiveBandId,
  formatCurriculumProgressRequirement,
  summarizeActiveCurriculumContent,
  summarizeCheckpointEligibilityPreview,
  summarizeGrammarEvidenceStats
} from "../src/app-state/settings-state";
import { getCheckpointStatus } from "../src/options/App";
import { setUserDataValues } from "../src/storage/user-data-repository";
import { installChromeStub } from "./helpers/chrome-stub";
import { installIndexedDbStub } from "./helpers/indexeddb-stub";

describe("options state", () => {
  it("loads site settings only from the canonical hostname-keyed map", async () => {
    const indexedDbStub = installIndexedDbStub();

    try {
      await setUserDataValues({
        "site-settings": [
          {
            hostname: "legacy.example",
            enabled: false,
            discoveryRate: 0.5,
            updatedAt: "2026-05-08T10:00:00.000Z"
          }
        ]
      });
      await expect(loadSiteSettingsMap()).resolves.toEqual({});

      await setUserDataValues({
        "site-settings": {
          "canonical.example": {
            hostname: "canonical.example",
            enabled: false,
            discoveryRate: 0.25,
            updatedAt: "2026-05-08T11:00:00.000Z"
          }
        }
      });

      await expect(loadSiteSettingsMap()).resolves.toMatchObject({
        "canonical.example": {
          hostname: "canonical.example",
          enabled: false,
          discoveryRate: 0.25
        }
      });
    } finally {
      indexedDbStub.restore();
    }
  });

  it("parses friendly proficiency seeds and migrates legacy advanced to intermediate", () => {
    expect(parseProficiencySeed(undefined)).toBe("false-beginner");
    expect(parseProficiencySeed("beginner")).toBe("beginner");
    expect(parseProficiencySeed("false-beginner")).toBe("false-beginner");
    expect(parseProficiencySeed("intermediate")).toBe("intermediate");
    expect(parseProficiencySeed("advanced")).toBe("intermediate");
    expect(proficiencySeedToBandId("beginner")).toBe("level-1a");
    expect(proficiencySeedToBandId("false-beginner")).toBe("level-1b");
    expect(proficiencySeedToBandId("intermediate")).toBe("level-2a");
  });

  it("creates placement profiles from friendly seeds and exact diagnostic bands", () => {
    expect(createLearningProfileForProficiencySeed("false-beginner")).toMatchObject({
      activeVocabularyBandId: "level-1b",
      activePhraseBandId: "level-1b",
      activeGrammarBandId: "level-1b",
      unlockedBandIds: ["level-1a", "level-1b"]
    });

    const exactProfile = createLearningProfileForBand("level-5b");
    expect(exactProfile).toMatchObject({
      activeVocabularyBandId: "level-5b",
      activePhraseBandId: "level-5b",
      activeGrammarBandId: "level-5b"
    });
    expect(exactProfile.unlockedBandIds).toContain("level-1a");
    expect(exactProfile.unlockedBandIds).toContain("level-5b");
    expect(getExactActiveBandId(exactProfile)).toBe("level-5b");
  });

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
      await expect(loadCurriculumDiagnostics()).resolves.toMatchObject({
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
          phraseChunks: expect.arrayContaining([
            "in the morning",
            "on Monday",
            "at school",
            "this week",
            "sometimes",
            "every week",
            "literal noun chunks with connectors"
          ]),
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
        currentFocus: expect.objectContaining({
          levelLabel: "Foundations",
          bandLabel: "Level 1B",
          learnerTitle: "Time, place, and familiar contexts",
          grammarFocusLabels: expect.arrayContaining(["basic questions"])
        }),
        path: expect.arrayContaining([
          expect.objectContaining({
            levelLabel: "Foundations",
            active: true
          })
        ]),
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

  it("derives curriculum diagnostics from the saved proficiency seed when no profile exists", async () => {
    const indexedDbStub = installIndexedDbStub();
    await setUserDataValues({
      settings: {
        proficiencySeed: "advanced"
      }
    });

    try {
      await expect(loadCurriculumDiagnostics()).resolves.toMatchObject({
        profile: {
          activeVocabularyBandId: "level-2a",
          activePhraseBandId: "level-2a",
          activeGrammarBandId: "level-2a",
          unlockedBandIds: ["level-1a", "level-1b", "level-1c", "level-2a"]
        },
        activeContent: {
          bandId: "level-2a"
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
      learnerFocus: expect.objectContaining({
        levelLabel: "Connected Expression",
        learnerTitle: "Explanation and process",
        grammarFocusLabels: expect.arrayContaining([
          "Ongoing result with have been"
        ])
      }),
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
      items: createProgressionReadyItems("level-1c"),
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
      "evidence-breadth",
      "distinct-context-breadth",
      "unassisted-breadth",
      "checkpoint"
    ]);
  });

  it("formats calibrated progression blockers as learner-facing copy", () => {
    expect(formatCurriculumProgressRequirement("checkpoint")).toBe(
      "manual reading-band step"
    );
    expect(formatCurriculumProgressRequirement("evidence-breadth")).toBe(
      "more real-page learning items"
    );
    expect(formatCurriculumProgressRequirement("distinct-context-breadth")).toBe(
      "more varied real-page contexts"
    );
    expect(formatCurriculumProgressRequirement("unassisted-breadth")).toBe(
      "more unassisted successful sightings"
    );
  });

  it("formats ready reading-band widening without assessment language", () => {
    const description = getCheckpointStatus({
      activeBandId: "level-1c",
      activeBandLabel: "Level 1C",
      nextBandId: "level-2a",
      nextBandLabel: "Level 2A",
      checkpointBlueprint: null,
      checkpointScopeLabels: ["Level 1 fixed phrases"],
      checkpointRequired: true,
      checkpointIsOnlyBlocker: true,
      unmetRequirements: ["checkpoint"]
    }).description;

    expect(description).toBe(
      "You have enough local reading evidence for Level 2A. Widen the reading band when you want the next level."
    );
    expect(description).not.toMatch(
      /\b(checkpoint|quiz|assessment|readiness check)\b/i
    );
  });

  it("formats blocked reading-band widening around local signals", () => {
    const description = getCheckpointStatus({
      activeBandId: "level-1c",
      activeBandLabel: "Level 1C",
      nextBandId: "level-2a",
      nextBandLabel: "Level 2A",
      checkpointBlueprint: null,
      checkpointScopeLabels: [],
      checkpointRequired: true,
      checkpointIsOnlyBlocker: false,
      unmetRequirements: [
        "evidence-breadth",
        "distinct-context-breadth",
        "checkpoint"
      ]
    }).description;

    expect(description).toBe(
      "Keep reading to build more real-page learning items, more varied real-page contexts; the reading band widens after those signals are ready."
    );
    expect(description).not.toContain("next level unlocks");
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

function createProgressionReadyItems(bandId: string): LearningItem[] {
  return [
    createLearningItem({
      itemId: "word:city",
      unitRefId: "city",
      unitType: "word",
      bandId,
      status: "reviewing",
      qualifiedExposureCount: 2,
      consecutiveUnassistedCount: 2,
      distinctContextCount: 2
    }),
    createLearningItem({
      itemId: "phrase:used-to",
      unitRefId: "used-to",
      unitType: "phrase",
      bandId,
      status: "mastered",
      qualifiedExposureCount: 3,
      consecutiveUnassistedCount: 3,
      distinctContextCount: 2
    }),
    createLearningItem({
      itemId: "grammar-feature:negation:do-not",
      unitRefId: "negation:do-not",
      unitType: "grammar-feature",
      bandId,
      status: "reviewing",
      qualifiedExposureCount: 2,
      consecutiveUnassistedCount: 2,
      distinctContextCount: 2
    }),
    createLearningItem({
      itemId: "word:home",
      unitRefId: "home",
      unitType: "word",
      bandId,
      status: "reviewing",
      qualifiedExposureCount: 2,
      consecutiveUnassistedCount: 2,
      distinctContextCount: 2
    })
  ];
}

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
