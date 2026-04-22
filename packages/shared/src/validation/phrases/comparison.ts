import { detectPhraseCandidates } from "./detector";
import { FIXED_PHRASE_LEXICON, type FixedPhraseLexiconEntry } from "./fixed-phrases";
import type {
  PhraseCandidate,
  PhraseCategory,
  PhraseCategoryMetrics,
  PhraseDetector,
  PhraseErrorExample,
  PhraseEvaluationSummary,
  PhraseGoldCorpus,
  PhraseGoldExpectation
} from "./types";

type CategoryCountBucket = {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
};

const PHRASE_CATEGORIES: readonly PhraseCategory[] = [
  "fixed-idiom",
  "function-phrase",
  "grammar-carrier",
  "adjective-noun",
  "noun-chunk"
];

export async function evaluatePhraseDetectorAgainstCorpusAsync(
  corpus: PhraseGoldCorpus,
  detector: PhraseDetector
): Promise<PhraseEvaluationSummary> {
  const categoryBuckets = new Map<PhraseCategory, CategoryCountBucket>(
    PHRASE_CATEGORIES.map((category) => [
      category,
      {
        truePositives: 0,
        falsePositives: 0,
        falseNegatives: 0
      }
    ])
  );
  const caseResults: PhraseEvaluationSummary["caseResults"] = [];
  const errors: PhraseErrorExample[] = [];

  for (const phraseCase of corpus.cases) {
    const detectionResult = await detector(phraseCase);
    const detected = detectionResult.selectedCandidates;
    const expected = phraseCase.expectedPhrases;

    const expectedByKey = new Map<string, PhraseGoldExpectation>(
      expected.map((entry) => [toExpectationKey(entry), entry])
    );
    const detectedByKey = new Map<string, PhraseCandidate>(
      detected.map((entry) => [toCandidateKey(entry), entry])
    );

    const truePositives: PhraseCandidate[] = [];
    const falsePositives: PhraseCandidate[] = [];
    const falseNegatives: PhraseGoldExpectation[] = [];

    for (const candidate of detected) {
      const key = toCandidateKey(candidate);
      if (expectedByKey.has(key)) {
        truePositives.push(candidate);
        incrementCategory(categoryBuckets, candidate.category, "truePositives");
      } else {
        falsePositives.push(candidate);
        incrementCategory(categoryBuckets, candidate.category, "falsePositives");
        errors.push({
          type: "false-positive",
          category: candidate.category,
          caseId: phraseCase.id,
          sourceText: phraseCase.sourceText,
          candidate
        });
      }
    }

    for (const goldEntry of expected) {
      const key = toExpectationKey(goldEntry);
      if (!detectedByKey.has(key)) {
        falseNegatives.push(goldEntry);
        incrementCategory(categoryBuckets, goldEntry.category, "falseNegatives");
        errors.push({
          type: "false-negative",
          category: goldEntry.category,
          caseId: phraseCase.id,
          sourceText: phraseCase.sourceText,
          expected: goldEntry
        });
      }
    }

    caseResults.push({
      caseId: phraseCase.id,
      sourceText: phraseCase.sourceText,
      detected,
      expected,
      truePositives,
      falsePositives,
      falseNegatives
    });
  }

  return buildEvaluationSummary(corpus, categoryBuckets, caseResults, errors);
}

export function evaluatePhraseDetectorAgainstCorpusWithLexicon(
  corpus: PhraseGoldCorpus,
  lexicon: readonly FixedPhraseLexiconEntry[] = FIXED_PHRASE_LEXICON
): PhraseEvaluationSummary {
  return evaluatePhraseDetectorAgainstCorpusSync(corpus, (phraseCase) =>
    detectPhraseCandidates(phraseCase, lexicon)
  );
}

function evaluatePhraseDetectorAgainstCorpusSync(
  corpus: PhraseGoldCorpus,
  detector: (corpusCase: PhraseGoldCorpus["cases"][number]) => ReturnType<typeof detectPhraseCandidates>
): PhraseEvaluationSummary {
  const categoryBuckets = new Map<PhraseCategory, CategoryCountBucket>(
    PHRASE_CATEGORIES.map((category) => [
      category,
      {
        truePositives: 0,
        falsePositives: 0,
        falseNegatives: 0
      }
    ])
  );
  const caseResults: PhraseEvaluationSummary["caseResults"] = [];
  const errors: PhraseErrorExample[] = [];

  for (const phraseCase of corpus.cases) {
    const detectionResult = detector(phraseCase);
    const detected = detectionResult.selectedCandidates;
    const expected = phraseCase.expectedPhrases;

    const expectedByKey = new Map<string, PhraseGoldExpectation>(
      expected.map((entry) => [toExpectationKey(entry), entry])
    );
    const detectedByKey = new Map<string, PhraseCandidate>(
      detected.map((entry) => [toCandidateKey(entry), entry])
    );

    const truePositives: PhraseCandidate[] = [];
    const falsePositives: PhraseCandidate[] = [];
    const falseNegatives: PhraseGoldExpectation[] = [];

    for (const candidate of detected) {
      const key = toCandidateKey(candidate);
      if (expectedByKey.has(key)) {
        truePositives.push(candidate);
        incrementCategory(categoryBuckets, candidate.category, "truePositives");
      } else {
        falsePositives.push(candidate);
        incrementCategory(categoryBuckets, candidate.category, "falsePositives");
        errors.push({
          type: "false-positive",
          category: candidate.category,
          caseId: phraseCase.id,
          sourceText: phraseCase.sourceText,
          candidate
        });
      }
    }

    for (const goldEntry of expected) {
      const key = toExpectationKey(goldEntry);
      if (!detectedByKey.has(key)) {
        falseNegatives.push(goldEntry);
        incrementCategory(categoryBuckets, goldEntry.category, "falseNegatives");
        errors.push({
          type: "false-negative",
          category: goldEntry.category,
          caseId: phraseCase.id,
          sourceText: phraseCase.sourceText,
          expected: goldEntry
        });
      }
    }

    caseResults.push({
      caseId: phraseCase.id,
      sourceText: phraseCase.sourceText,
      detected,
      expected,
      truePositives,
      falsePositives,
      falseNegatives
    });
  }

  return buildEvaluationSummary(corpus, categoryBuckets, caseResults, errors);
}

function buildEvaluationSummary(
  corpus: PhraseGoldCorpus,
  categoryBuckets: Map<PhraseCategory, CategoryCountBucket>,
  caseResults: PhraseEvaluationSummary["caseResults"],
  errors: PhraseErrorExample[]
): PhraseEvaluationSummary {
  const categoryMetrics: PhraseCategoryMetrics[] = PHRASE_CATEGORIES.map((category) =>
    toCategoryMetrics(category, categoryBuckets.get(category))
  );
  const overallBucket = categoryMetrics.reduce(
    (accumulator, metrics) => {
      accumulator.truePositives += metrics.truePositives;
      accumulator.falsePositives += metrics.falsePositives;
      accumulator.falseNegatives += metrics.falseNegatives;
      return accumulator;
    },
    {
      truePositives: 0,
      falsePositives: 0,
      falseNegatives: 0
    }
  );

  return {
    corpusVersion: corpus.version,
    categoryMetrics,
    overall: {
      ...overallBucket,
      precision: ratio(
        overallBucket.truePositives,
        overallBucket.truePositives + overallBucket.falsePositives
      ),
      recall: ratio(
        overallBucket.truePositives,
        overallBucket.truePositives + overallBucket.falseNegatives
      )
    },
    caseResults,
    errors
  };
}

function toCategoryMetrics(
  category: PhraseCategory,
  bucket?: CategoryCountBucket
): PhraseCategoryMetrics {
  const safeBucket = bucket ?? {
    truePositives: 0,
    falsePositives: 0,
    falseNegatives: 0
  };

  return {
    category,
    truePositives: safeBucket.truePositives,
    falsePositives: safeBucket.falsePositives,
    falseNegatives: safeBucket.falseNegatives,
    precision: ratio(
      safeBucket.truePositives,
      safeBucket.truePositives + safeBucket.falsePositives
    ),
    recall: ratio(
      safeBucket.truePositives,
      safeBucket.truePositives + safeBucket.falseNegatives
    )
  };
}

function incrementCategory(
  buckets: Map<PhraseCategory, CategoryCountBucket>,
  category: PhraseCategory,
  field: keyof CategoryCountBucket
) {
  const bucket = buckets.get(category);
  if (!bucket) {
    return;
  }

  bucket[field] += 1;
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }

  return Number((numerator / denominator).toFixed(4));
}

function toCandidateKey(candidate: PhraseCandidate): string {
  return [
    candidate.category,
    candidate.sourceKind,
    candidate.span.startToken,
    candidate.span.endToken,
    candidate.normalizedSourceText
  ].join("|");
}

function toExpectationKey(expectation: PhraseGoldExpectation): string {
  return [
    expectation.category,
    expectation.sourceKind,
    expectation.startToken,
    expectation.endToken,
    expectation.normalizedSourceText
  ].join("|");
}
