import {
  resolveDifficultyPreset,
  type DifficultyProfilePreset
} from "../../scoring/difficulty";
import { computeKnownRatioBaseline, scoreSentenceSuitability } from "./scorer";
import type {
  ProfileComparisonResult,
  RankErrorDelta,
  RankingMetrics,
  SuitabilityCorpus,
  SuitabilityRow
} from "./types";

const EPSILON = 1e-9;

type RankEntry = {
  id: string;
  score: number;
};

function sortByScore(entries: RankEntry[]): RankEntry[] {
  return [...entries].sort((a, b) => {
    if (Math.abs(b.score - a.score) > EPSILON) {
      return b.score - a.score;
    }

    return a.id.localeCompare(b.id);
  });
}

function buildAverageRankMap(entries: RankEntry[]): Map<string, number> {
  const sorted = sortByScore(entries);
  const rankMap = new Map<string, number>();

  let index = 0;
  while (index < sorted.length) {
    let cursor = index;
    while (
      cursor + 1 < sorted.length &&
      Math.abs(sorted[cursor + 1].score - sorted[index].score) <= EPSILON
    ) {
      cursor += 1;
    }

    const averageRank = (index + 1 + cursor + 1) / 2;
    for (let tieIndex = index; tieIndex <= cursor; tieIndex += 1) {
      rankMap.set(sorted[tieIndex].id, averageRank);
    }

    index = cursor + 1;
  }

  return rankMap;
}

function computePearsonCorrelation(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length === 0) {
    return 0;
  }

  const count = xs.length;
  const meanX = xs.reduce((acc, value) => acc + value, 0) / count;
  const meanY = ys.reduce((acc, value) => acc + value, 0) / count;

  let numerator = 0;
  let varianceX = 0;
  let varianceY = 0;

  for (let index = 0; index < count; index += 1) {
    const xOffset = xs[index] - meanX;
    const yOffset = ys[index] - meanY;
    numerator += xOffset * yOffset;
    varianceX += xOffset * xOffset;
    varianceY += yOffset * yOffset;
  }

  if (varianceX <= EPSILON || varianceY <= EPSILON) {
    return 0;
  }

  return numerator / Math.sqrt(varianceX * varianceY);
}

function computeSpearmanRho(rows: SuitabilityRow[], scoreSelector: (row: SuitabilityRow) => number): number {
  const predictedRanks = buildAverageRankMap(
    rows.map((row) => ({
      id: row.id,
      score: scoreSelector(row)
    }))
  );
  const goldRanks = buildAverageRankMap(
    rows.map((row) => ({
      id: row.id,
      score: row.goldLabel
    }))
  );

  const x: number[] = [];
  const y: number[] = [];

  for (const row of rows) {
    const predictedRank = predictedRanks.get(row.id);
    const goldRank = goldRanks.get(row.id);

    if (predictedRank === undefined || goldRank === undefined) {
      continue;
    }

    x.push(predictedRank);
    y.push(goldRank);
  }

  return computePearsonCorrelation(x, y);
}

function computePairwiseAccuracy(
  rows: SuitabilityRow[],
  scoreSelector: (row: SuitabilityRow) => number
): number {
  let comparablePairs = 0;
  let matchingPairs = 0;

  for (let left = 0; left < rows.length; left += 1) {
    for (let right = left + 1; right < rows.length; right += 1) {
      const leftLabel = rows[left].goldLabel;
      const rightLabel = rows[right].goldLabel;

      if (leftLabel === rightLabel) {
        continue;
      }

      comparablePairs += 1;
      const goldDirection = Math.sign(leftLabel - rightLabel);
      const predictedDirection = Math.sign(
        scoreSelector(rows[left]) - scoreSelector(rows[right])
      );

      if (predictedDirection === 0) {
        matchingPairs += 0.5;
        continue;
      }

      if (predictedDirection === goldDirection) {
        matchingPairs += 1;
      }
    }
  }

  if (comparablePairs === 0) {
    return 0;
  }

  return matchingPairs / comparablePairs;
}

function gainFromLabel(label: number): number {
  return Math.pow(2, Math.max(0, label)) - 1;
}

function computeDcg(labels: number[]): number {
  let score = 0;

  for (let index = 0; index < labels.length; index += 1) {
    const gain = gainFromLabel(labels[index]);
    const discount = 1 / Math.log2(index + 2);
    score += gain * discount;
  }

  return score;
}

function computeNdcgAtK(
  rows: SuitabilityRow[],
  scoreSelector: (row: SuitabilityRow) => number,
  k: number
): number {
  if (rows.length === 0) {
    return 0;
  }

  const topKRows = sortByScore(
    rows.map((row) => ({ id: row.id, score: scoreSelector(row) }))
  )
    .slice(0, k)
    .map((entry) => rows.find((row) => row.id === entry.id))
    .filter((row): row is SuitabilityRow => Boolean(row));

  const idealLabels = [...rows]
    .sort((a, b) => {
      if (b.goldLabel !== a.goldLabel) {
        return b.goldLabel - a.goldLabel;
      }

      return a.id.localeCompare(b.id);
    })
    .slice(0, k)
    .map((row) => row.goldLabel);

  const dcg = computeDcg(topKRows.map((row) => row.goldLabel));
  const idcg = computeDcg(idealLabels);

  if (idcg <= EPSILON) {
    return 0;
  }

  return dcg / idcg;
}

function computePrecisionAtFive(
  rows: SuitabilityRow[],
  scoreSelector: (row: SuitabilityRow) => number
): number {
  const rankedRows = sortByScore(
    rows.map((row) => ({ id: row.id, score: scoreSelector(row) }))
  )
    .slice(0, 5)
    .map((entry) => rows.find((row) => row.id === entry.id))
    .filter((row): row is SuitabilityRow => Boolean(row));

  if (rankedRows.length === 0) {
    return 0;
  }

  const relevantCount = rankedRows.filter((row) => row.goldLabel >= 4).length;
  return relevantCount / rankedRows.length;
}

function buildRankingMetrics(
  rows: SuitabilityRow[],
  scoreSelector: (row: SuitabilityRow) => number
): RankingMetrics {
  return {
    ndcgAt5: computeNdcgAtK(rows, scoreSelector, 5),
    ndcgAt10: computeNdcgAtK(rows, scoreSelector, 10),
    pairwiseAccuracy: computePairwiseAccuracy(rows, scoreSelector),
    spearmanRho: computeSpearmanRho(rows, scoreSelector),
    precisionAt5: computePrecisionAtFive(rows, scoreSelector)
  };
}

function subtractMetrics(
  current: RankingMetrics,
  previous: RankingMetrics
): RankingMetrics {
  return {
    ndcgAt5: current.ndcgAt5 - previous.ndcgAt5,
    ndcgAt10: current.ndcgAt10 - previous.ndcgAt10,
    pairwiseAccuracy: current.pairwiseAccuracy - previous.pairwiseAccuracy,
    spearmanRho: current.spearmanRho - previous.spearmanRho,
    precisionAt5: current.precisionAt5 - previous.precisionAt5
  };
}

function findRankErrorDeltas(
  rows: SuitabilityRow[],
  baselineOrder: string[],
  suitabilityOrder: string[]
): { improvements: RankErrorDelta[]; regressions: RankErrorDelta[] } {
  const baselineRankMap = new Map<string, number>();
  const suitabilityRankMap = new Map<string, number>();

  baselineOrder.forEach((id, index) => baselineRankMap.set(id, index + 1));
  suitabilityOrder.forEach((id, index) => suitabilityRankMap.set(id, index + 1));

  const goldRankMap = buildAverageRankMap(
    rows.map((row) => ({
      id: row.id,
      score: row.goldLabel
    }))
  );

  const deltas = rows.map((row) => {
    const baselineRank = baselineRankMap.get(row.id) ?? rows.length;
    const suitabilityRank = suitabilityRankMap.get(row.id) ?? rows.length;
    const goldRank = goldRankMap.get(row.id) ?? rows.length;
    const baselineError = Math.abs(baselineRank - goldRank);
    const suitabilityError = Math.abs(suitabilityRank - goldRank);

    return {
      id: row.id,
      sentence: row.sentence,
      category: row.category,
      goldLabel: row.goldLabel,
      baselineRank,
      suitabilityRank,
      deltaAbsoluteError: baselineError - suitabilityError
    } satisfies RankErrorDelta;
  });

  const improvements = [...deltas]
    .filter((entry) => entry.deltaAbsoluteError > 0)
    .sort((left, right) => {
      if (Math.abs(right.deltaAbsoluteError - left.deltaAbsoluteError) > EPSILON) {
        return right.deltaAbsoluteError - left.deltaAbsoluteError;
      }

      return left.id.localeCompare(right.id);
    })
    .slice(0, 5);

  const regressions = [...deltas]
    .filter((entry) => entry.deltaAbsoluteError < 0)
    .sort((left, right) => {
      if (Math.abs(left.deltaAbsoluteError - right.deltaAbsoluteError) > EPSILON) {
        return left.deltaAbsoluteError - right.deltaAbsoluteError;
      }

      return left.id.localeCompare(right.id);
    })
    .slice(0, 5);

  return { improvements, regressions };
}

function resolvePreset(
  profileId: string,
  profileDisplayName: string,
  stretchTolerance: number,
  presets: Record<string, DifficultyProfilePreset>
): DifficultyProfilePreset {
  return (
    presets[profileId] ??
    resolveDifficultyPreset(profileId, profileDisplayName, stretchTolerance)
  );
}

export function compareSuitabilityScorers(
  corpus: SuitabilityCorpus,
  presets: Record<string, DifficultyProfilePreset> = {}
): ProfileComparisonResult[] {
  return corpus.profiles.map((profile) => {
    const preset = resolvePreset(
      profile.id,
      profile.displayName,
      profile.stretchTolerance,
      presets
    );

    const rows = corpus.sentences.map((example) => {
      const profileLabel = example.profiles[profile.id];

      if (!profileLabel) {
        throw new Error(
          `Sentence ${example.id} is missing labels for profile ${profile.id}.`
        );
      }

      return {
        id: example.id,
        sentence: example.sentence,
        category: example.category,
        goldLabel: profileLabel.label,
        rationale: profileLabel.rationale,
        baselineKnownRatio: computeKnownRatioBaseline(profileLabel),
        suitabilityScore: scoreSentenceSuitability(example.signals, preset)
      } satisfies SuitabilityRow;
    });

    const baselineMetrics = buildRankingMetrics(rows, (row) => row.baselineKnownRatio);
    const suitabilityMetrics = buildRankingMetrics(
      rows,
      (row) => row.suitabilityScore.normalizedScore
    );

    const baselineOrder = sortByScore(
      rows.map((row) => ({ id: row.id, score: row.baselineKnownRatio }))
    ).map((entry) => entry.id);
    const suitabilityOrder = sortByScore(
      rows.map((row) => ({
        id: row.id,
        score: row.suitabilityScore.normalizedScore
      }))
    ).map((entry) => entry.id);

    const rankDeltas = findRankErrorDeltas(rows, baselineOrder, suitabilityOrder);

    return {
      profileId: profile.id,
      profileDisplayName: profile.displayName,
      baselineMetrics,
      suitabilityMetrics,
      deltas: subtractMetrics(suitabilityMetrics, baselineMetrics),
      rows,
      baselineOrder,
      suitabilityOrder,
      strongestImprovements: rankDeltas.improvements,
      strongestRegressions: rankDeltas.regressions
    } satisfies ProfileComparisonResult;
  });
}
