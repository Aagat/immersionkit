import { describe, expect, it } from "vitest";

import { loadCurriculumDiagnostics } from "../src/options/state";
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
});
