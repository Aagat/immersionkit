export type SuitabilitySignalWeights = {
  vocabularyFit: number;
  grammarFit: number;
  structuralSimplicity: number;
  dueTargetValue: number;
  chunkUsefulness: number;
  stretchTolerance: number;
  ambiguityPenalty: number;
};

export type DifficultyBands = {
  coreMin: number;
  stretchMin: number;
};

export type DifficultyProfilePreset = {
  id: string;
  displayName: string;
  stretchTolerance: number;
  weights: SuitabilitySignalWeights;
  bands: DifficultyBands;
};

function clampWeight(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, value);
}

function sanitizeWeights(weights: SuitabilitySignalWeights): SuitabilitySignalWeights {
  return {
    vocabularyFit: clampWeight(weights.vocabularyFit),
    grammarFit: clampWeight(weights.grammarFit),
    structuralSimplicity: clampWeight(weights.structuralSimplicity),
    dueTargetValue: clampWeight(weights.dueTargetValue),
    chunkUsefulness: clampWeight(weights.chunkUsefulness),
    stretchTolerance: clampWeight(weights.stretchTolerance),
    ambiguityPenalty: clampWeight(weights.ambiguityPenalty)
  };
}

function sanitizeBandFloor(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, value));
}

export function createDifficultyPreset(
  preset: DifficultyProfilePreset
): DifficultyProfilePreset {
  const coreMin = sanitizeBandFloor(preset.bands.coreMin, 0.7);
  const stretchMin = sanitizeBandFloor(preset.bands.stretchMin, 0.55);

  return {
    ...preset,
    stretchTolerance: sanitizeBandFloor(preset.stretchTolerance, 0.5),
    weights: sanitizeWeights(preset.weights),
    bands: {
      coreMin: Math.max(coreMin, stretchMin),
      stretchMin
    }
  };
}

export const BEGINNER_DIFFICULTY_PRESET = createDifficultyPreset({
  id: "beginner_a2",
  displayName: "Beginner (A2-ish)",
  stretchTolerance: 0.25,
  weights: {
    vocabularyFit: 0.3,
    grammarFit: 0.16,
    structuralSimplicity: 0.2,
    dueTargetValue: 0.12,
    chunkUsefulness: 0.1,
    stretchTolerance: 0.08,
    ambiguityPenalty: 0.22
  },
  bands: {
    coreMin: 0.72,
    stretchMin: 0.58
  }
});

export const INTERMEDIATE_DIFFICULTY_PRESET = createDifficultyPreset({
  id: "intermediate_b1",
  displayName: "Intermediate (B1-ish)",
  stretchTolerance: 0.62,
  weights: {
    vocabularyFit: 0.2,
    grammarFit: 0.18,
    structuralSimplicity: 0.12,
    dueTargetValue: 0.22,
    chunkUsefulness: 0.16,
    stretchTolerance: 0.12,
    ambiguityPenalty: 0.16
  },
  bands: {
    coreMin: 0.68,
    stretchMin: 0.52
  }
});

export const DEFAULT_DIFFICULTY_PRESETS: Record<string, DifficultyProfilePreset> = {
  [BEGINNER_DIFFICULTY_PRESET.id]: BEGINNER_DIFFICULTY_PRESET,
  [INTERMEDIATE_DIFFICULTY_PRESET.id]: INTERMEDIATE_DIFFICULTY_PRESET
};

export function resolveDifficultyPreset(
  profileId: string,
  profileDisplayName: string,
  stretchTolerance: number
): DifficultyProfilePreset {
  const existingPreset = DEFAULT_DIFFICULTY_PRESETS[profileId];

  if (existingPreset) {
    return existingPreset;
  }

  return createDifficultyPreset({
    id: profileId,
    displayName: profileDisplayName,
    stretchTolerance,
    weights: {
      vocabularyFit: 0.25,
      grammarFit: 0.17,
      structuralSimplicity: 0.15,
      dueTargetValue: 0.17,
      chunkUsefulness: 0.14,
      stretchTolerance: 0.12,
      ambiguityPenalty: 0.18
    },
    bands: {
      coreMin: 0.7,
      stretchMin: 0.55
    }
  });
}
