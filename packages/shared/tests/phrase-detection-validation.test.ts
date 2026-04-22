import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  buildCanonicalPhraseKey,
  evaluatePhraseDetectorAgainstCorpus,
  findCaseResult,
  type PhraseGoldCorpus
} from "../src/validation/phrases";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFilePath);
const corpusPath = path.resolve(
  currentDirectory,
  "../../../fixtures/evals/phrase-detection/phrase-detection-gold-corpus.json"
);

function readCorpus(): PhraseGoldCorpus {
  const fileContents = readFileSync(corpusPath, "utf8");
  return JSON.parse(fileContents) as PhraseGoldCorpus;
}

describe("phrase detection validation", () => {
  it("produces stable aggregate precision/recall from the gold corpus", () => {
    const corpus = readCorpus();
    const evaluation = evaluatePhraseDetectorAgainstCorpus(corpus);

    expect(evaluation.overall).toEqual({
      truePositives: 18,
      falsePositives: 1,
      falseNegatives: 1,
      precision: 0.9474,
      recall: 0.9474
    });
  });

  it("prefers the longer fixed phrase over nested adjective+noun overlap", () => {
    const corpus = readCorpus();
    const evaluation = evaluatePhraseDetectorAgainstCorpus(corpus);
    const overlapCase = findCaseResult(evaluation, "overlap-fixed-other-hand");

    expect(overlapCase).toBeTruthy();
    expect(overlapCase?.detected.map((candidate) => candidate.normalizedSourceText)).toEqual([
      "on the other hand"
    ]);
  });

  it("keeps canonical keys deterministic for repeated fixed phrases", () => {
    const corpus = readCorpus();
    const evaluation = evaluatePhraseDetectorAgainstCorpus(corpus);
    const atLeastKeys = evaluation.caseResults
      .flatMap((result) => result.detected)
      .filter(
        (candidate) =>
          candidate.sourceKind === "fixed-phrase" &&
          candidate.normalizedSourceText === "at least"
      )
      .map((candidate) => candidate.canonicalPhraseKey);

    expect(new Set(atLeastKeys)).toEqual(
      new Set([buildCanonicalPhraseKey("fixed-phrase", "at least")])
    );
  });
});
