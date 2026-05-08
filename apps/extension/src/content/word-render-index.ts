import {
  buildRenderUnitRuntimeIndex,
  type RenderUnitEntry,
  type WordRenderEntry
} from "@immersionkit/shared";

export type WordRenderIndex = Map<string, WordRenderEntry>;

export function buildWordRenderIndex(
  renderUnits: readonly RenderUnitEntry[],
  options: { bandPreference?: readonly string[] } = {}
): WordRenderIndex {
  return buildRenderUnitRuntimeIndex(renderUnits, {
    bandPreference: options.bandPreference
  }).preferredWordByNormalizedForm;
}
