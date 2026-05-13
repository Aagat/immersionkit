import { scoreSentenceByKnownWords } from "../../scoring/sentence";
import type {
  DifficultyBands,
  DifficultyProfilePreset,
  SuitabilitySignalWeights
} from "../../scoring/difficulty";
import type {
  DifficultyBand,
  ProfileLabel,
  SuitabilitySignalContributions,
  SentenceSuitabilityScore,
  SuitabilitySignals
} from "./types";

const EPSILON = 1e-9;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

export function computeKnownRatioBaseline(profile: ProfileLabel): number {
  return scoreSentenceByKnownWords(profile.knownWordCount, profile.totalWordCount).knownRatio;
}

export function computeStretchAlignment(
  stretchDemand: number,
  stretchTolerance: number
): number {
  return clamp01(1 - Math.abs(clamp01(stretchDemand) - clamp01(stretchTolerance)));
}

export function classifyDifficultyBand(
  normalizedScore: number,
  bands: DifficultyBands
): DifficultyBand {
  const score = clamp01(normalizedScore);

  if (score >= bands.coreMin - EPSILON) {
    return "core";
  }

  if (score >= bands.stretchMin - EPSILON) {
    return "stretch";
  }

  return "defer";
}

export function scoreSentenceSuitability(
  signals: SuitabilitySignals,
  preset: DifficultyProfilePreset
): SentenceSuitabilityScore {
  const weights = preset.weights;
  const signalValues = {
    vocabularyFit: clamp01(signals.vocabularyFit),
    grammarFit: clamp01(signals.grammarFit),
    structuralSimplicity: clamp01(signals.structuralSimplicity),
    dueTargetValue: clamp01(signals.dueTargetValue),
    chunkUsefulness: clamp01(signals.chunkUsefulness),
    ambiguityPenalty: clamp01(signals.ambiguityPenalty),
    stretchAlignment: computeStretchAlignment(
      signals.stretchDemand,
      preset.stretchTolerance
    )
  };

  const contributions: SuitabilitySignalContributions = {
    vocabularyFit: weights.vocabularyFit * signalValues.vocabularyFit,
    grammarFit: weights.grammarFit * signalValues.grammarFit,
    structuralSimplicity:
      weights.structuralSimplicity * signalValues.structuralSimplicity,
    dueTargetValue: weights.dueTargetValue * signalValues.dueTargetValue,
    chunkUsefulness: weights.chunkUsefulness * signalValues.chunkUsefulness,
    stretchAlignment: weights.stretchTolerance * signalValues.stretchAlignment,
    ambiguityPenalty: weights.ambiguityPenalty * signalValues.ambiguityPenalty
  };

  const positiveWeightTotal = totalPositiveWeight(weights);
  const rawPositive =
    contributions.vocabularyFit +
    contributions.grammarFit +
    contributions.structuralSimplicity +
    contributions.dueTargetValue +
    contributions.chunkUsefulness +
    contributions.stretchAlignment;
  const score = rawPositive - contributions.ambiguityPenalty;
  const normalizedScore =
    positiveWeightTotal + weights.ambiguityPenalty <= EPSILON
      ? 0
      : (score + weights.ambiguityPenalty) /
        (positiveWeightTotal + weights.ambiguityPenalty);

  return {
    score,
    normalizedScore: clamp01(normalizedScore),
    stretchAlignment: signalValues.stretchAlignment,
    difficultyBand: classifyDifficultyBand(normalizedScore, preset.bands),
    contributions
  };
}

function totalPositiveWeight(weights: SuitabilitySignalWeights): number {
  return (
    weights.vocabularyFit +
    weights.grammarFit +
    weights.structuralSimplicity +
    weights.dueTargetValue +
    weights.chunkUsefulness +
    weights.stretchTolerance
  );
}
