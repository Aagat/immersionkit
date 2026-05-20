import {
  buildRenderUnitRuntimeIndex,
  type RenderUnitEntry,
  type WordRenderEntry
} from "@immersionkit/shared";

export type WordRenderIndex = Map<string, WordRenderEntry>;
export type AnalyzerPatternWordRenderIndex = Map<string, WordRenderEntry>;

export type WordRenderIndexes = {
  wordRenderIndex: WordRenderIndex;
  analyzerPatternWordRenderIndex: AnalyzerPatternWordRenderIndex;
};

export function buildWordRenderIndex(
  renderUnits: readonly RenderUnitEntry[],
  options: { bandPreference?: readonly string[] } = {}
): WordRenderIndex {
  return buildWordRenderIndexes(renderUnits, options).wordRenderIndex;
}

export function buildWordRenderIndexes(
  renderUnits: readonly RenderUnitEntry[],
  options: { bandPreference?: readonly string[] } = {}
): WordRenderIndexes {
  const runtimeIndex = buildRenderUnitRuntimeIndex(renderUnits, {
    bandPreference: options.bandPreference
  });

  return {
    wordRenderIndex: runtimeIndex.preferredWordByNormalizedForm,
    analyzerPatternWordRenderIndex: new Map(
      runtimeIndex.analyzerPatternWordEntries.map((entry) => [
        createAnalyzerPatternWordRenderKey(entry.renderUnitId, entry.lexemeId),
        entry
      ])
    )
  };
}

export function createAnalyzerPatternWordRenderKey(
  renderUnitId: string,
  lexemeId: string
): string {
  return `${renderUnitId}::${lexemeId}`;
}
