import type {
  RenderUnitEntry,
  SentenceAnalysisEntry
} from "@immersionkit/shared";
import { describe, expect, it } from "vitest";

import { collectRelevantUnitRefIds } from "../src/background/content-context";

describe("background content context", () => {
  it("prioritizes current-page learning refs before broad asset refs", () => {
    const renderUnits = Array.from({ length: 650 }, (_, index) =>
      createRenderUnit(`asset-${index}`)
    );
    const analysisEntry = createSentenceAnalysisEntry();

    const relevantRefs = collectRelevantUnitRefIds(renderUnits, [analysisEntry]);
    const cappedLearningRefs = relevantRefs.learningUnitRefIds.slice(0, 500);

    expect(cappedLearningRefs.slice(0, 3)).toEqual([
      "lx:page-word",
      "phrase:fixed-phrase:at-home:en-casa",
      "grammar:present-simple"
    ]);
    expect(cappedLearningRefs).toContain("lx:asset-0");
    expect(cappedLearningRefs).not.toContain("lx:asset-649");
  });

  it("deduplicates page refs from the asset backlog while preserving page priority", () => {
    const renderUnits = [createRenderUnit("page-word"), createRenderUnit("asset-word")];
    const analysisEntry = createSentenceAnalysisEntry();

    const relevantRefs = collectRelevantUnitRefIds(renderUnits, [analysisEntry]);

    expect(relevantRefs.learningUnitRefIds).toEqual([
      "lx:page-word",
      "phrase:fixed-phrase:at-home:en-casa",
      "grammar:present-simple",
      "lx:asset-word"
    ]);
  });
});

function createRenderUnit(id: string): RenderUnitEntry {
  return {
    renderUnitId: `ru:${id}`,
    lexemeIds: [`lx:${id}`],
    kind: "single-token",
    renderPolicy: "inline",
    sourceText: id,
    normalizedSourceText: id,
    targetText: id,
    normalizedTargetText: id,
    sourcePattern: {
      matchMode: "exact",
      tokens: [{ normal: id }]
    },
    replacement: {
      startToken: 0,
      endToken: 1,
      targetText: id
    },
    minBand: "level-1a",
    confidence: 0.9,
    provenance: { source: "manual" }
  };
}

function createSentenceAnalysisEntry(): SentenceAnalysisEntry {
  const createdAt = "2026-05-09T00:00:00.000Z";
  return {
    sentenceHash: "hash:page",
    analyzerVersion: "fixture-v1",
    analyzerId: "fixture-annotated",
    sourceText: "At home we read.",
    tokens: [],
    lemmas: [],
    posTags: [],
    chunks: [],
    contextualWordCandidates: [
      {
        lexemeId: "lx:page-word"
      } as SentenceAnalysisEntry["contextualWordCandidates"][number]
    ],
    phraseMatches: [
      {
        occurrenceId: "occurrence:at-home",
        phraseId: "phrase:fixed-phrase:at-home:en-casa",
        sentenceHash: "hash:page",
        analyzerVersion: "fixture-v1",
        sourceText: "at home",
        normalizedSourceText: "at home",
        targetText: "en casa",
        normalizedTargetText: "en casa",
        sourceKind: "fixed-phrase",
        category: "function-phrase",
        ruleId: "fixed-phrase:at-home",
        span: {
          startToken: 0,
          endToken: 2,
          startChar: 0,
          endChar: 7
        },
        confidence: 0.97
      }
    ],
    grammarFeatures: [
      {
        featureId: "grammar:present-simple",
        featureKey: "tense:present-simple",
        label: "Present simple",
        category: "tense-aspect",
        sourceText: "read",
        normalizedSourceText: "read",
        span: {
          startToken: 3,
          endToken: 4,
          startChar: 11,
          endChar: 15
        },
        evidence: ["fixture"],
        confidence: 0.84
      }
    ],
    createdAt,
    lastAccessedAt: createdAt
  };
}
