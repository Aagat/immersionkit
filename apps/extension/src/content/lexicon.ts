import { normalizeToken, type RenderUnitEntry } from "@immersionkit/shared";

import {
  isImmediateWordRenderUnit,
  renderUnitToWordRenderEntry,
  type WordRenderEntry
} from "../render-units/render-units";

export type WordRenderIndex = Map<string, WordRenderEntry>;

const BLOCKED_SINGLE_TOKEN_SOURCE_TEXTS = new Set(["a", "an", "the"]);

export function buildWordRenderIndex(
  renderUnits: readonly RenderUnitEntry[],
  options: { bandPreference?: readonly string[] } = {}
): WordRenderIndex {
  const index = new Map<string, WordRenderEntry>();
  const bandOrder = new Map(
    (options.bandPreference ?? []).map((bandId, order) => [bandId, order] as const)
  );

  for (const renderUnit of renderUnits) {
    if (!isImmediateWordRenderUnit(renderUnit)) {
      continue;
    }

    if (isBlockedWordRenderKey(renderUnit.normalizedSourceText)) {
      continue;
    }

    const entry = renderUnitToWordRenderEntry(renderUnit);
    if (!entry) {
      continue;
    }

    registerWordRenderKey(index, renderUnit.normalizedSourceText, entry, bandOrder);
    registerWordRenderKey(index, renderUnit.sourceText, entry, bandOrder);

    for (const inflection of renderUnit.inflections ?? []) {
      registerWordRenderKey(index, inflection, entry, bandOrder);
    }
  }

  return index;
}

function registerWordRenderKey(
  index: WordRenderIndex,
  rawKey: string,
  entry: WordRenderEntry,
  bandOrder: ReadonlyMap<string, number>
) {
  const normalized = normalizeToken(rawKey);
  if (!normalized || isBlockedWordRenderKey(normalized)) {
    return;
  }

  const existing = index.get(normalized);
  index.set(normalized, selectPreferredEntry(existing, entry, bandOrder));
}

function isBlockedWordRenderKey(rawKey: string): boolean {
  const normalized = normalizeToken(rawKey);
  return BLOCKED_SINGLE_TOKEN_SOURCE_TEXTS.has(normalized);
}

function selectPreferredEntry(
  current: WordRenderEntry | undefined,
  candidate: WordRenderEntry,
  bandOrder: ReadonlyMap<string, number>
): WordRenderEntry {
  if (!current) {
    return candidate;
  }

  const currentBandOrder = bandOrder.get(current.renderUnitMinBand) ?? Number.MAX_SAFE_INTEGER;
  const candidateBandOrder = bandOrder.get(candidate.renderUnitMinBand) ?? Number.MAX_SAFE_INTEGER;
  if (candidateBandOrder !== currentBandOrder) {
    return candidateBandOrder < currentBandOrder ? candidate : current;
  }

  if (candidate.confidence !== current.confidence) {
    return candidate.confidence > current.confidence ? candidate : current;
  }

  const currentRank = current.frequencyRank ?? Number.MAX_SAFE_INTEGER;
  const candidateRank = candidate.frequencyRank ?? Number.MAX_SAFE_INTEGER;
  if (candidateRank !== currentRank) {
    return candidateRank < currentRank ? candidate : current;
  }

  return candidate.renderUnitId.localeCompare(current.renderUnitId) < 0
    ? candidate
    : current;
}
