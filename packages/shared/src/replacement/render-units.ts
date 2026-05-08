import {
  SAFE_INJECTION_POS_VALUES,
  type AnalyzerToken,
  type LexemeEntry,
  type RenderUnitEntry,
  type RenderUnitTokenPattern,
  type SafeInjectionPos
} from "../domain/models";
import { normalizeToken } from "../text/normalize";

export type WordRenderEntry = {
  lexemeId: string;
  renderUnitId: string;
  renderUnitMinBand: string;
  renderUnitMatchMode: RenderUnitEntry["sourcePattern"]["matchMode"];
  normalizedSourceText: string;
  targetText: string;
  sourceLemma: string;
  targetLemma: string;
  pos: SafeInjectionPos;
  frequencyRank: number | null;
  confidence: number;
  exampleSentenceEnglish?: string;
  exampleSentenceNative?: string;
  inflections?: string[];
  sourceLanguage?: "en";
  targetLanguage?: "es";
  sourceDataset?: string;
};

export type RenderUnitPhraseTarget = {
  targetText: string;
  normalizedTargetText: string;
};

export type RenderUnitRuntimeIndex = {
  exactSingleTokenWordEntriesByNormalizedForm: Map<string, WordRenderEntry[]>;
  preferredWordByNormalizedForm: Map<string, WordRenderEntry>;
  analyzerPatternWordEntries: WordRenderEntry[];
  analyzerPatternWordEntriesByFirstToken: Map<string, WordRenderEntry[]>;
  phraseEntriesByNormalizedSourceText: Map<string, RenderUnitEntry[]>;
  sentenceHelpHintByNormalizedSourceText: Map<string, string>;
  phraseTargetByNormalizedSourceText: Map<string, RenderUnitPhraseTarget>;
  renderUnitById: Map<string, RenderUnitEntry>;
  bandOrder: Map<string, number>;
  minBandByRenderUnitId: Map<string, string>;
};

export type RenderUnitRuntimeIndexOptions = {
  bandPreference?: readonly string[];
  blockedSingleTokenSourceTexts?: ReadonlySet<string>;
};

const SAFE_POS = new Set<string>(SAFE_INJECTION_POS_VALUES);
const DEFAULT_BLOCKED_SINGLE_TOKEN_SOURCE_TEXTS = new Set(["a", "an", "the"]);

export function buildRenderUnitRuntimeIndex(
  renderUnits: readonly RenderUnitEntry[],
  options: RenderUnitRuntimeIndexOptions = {}
): RenderUnitRuntimeIndex {
  const exactSingleTokenWordEntriesByNormalizedForm = new Map<
    string,
    WordRenderEntry[]
  >();
  const preferredWordByNormalizedForm = new Map<string, WordRenderEntry>();
  const analyzerPatternWordEntries: WordRenderEntry[] = [];
  const analyzerPatternWordEntriesByFirstToken = new Map<string, WordRenderEntry[]>();
  const phraseEntriesByNormalizedSourceText = new Map<string, RenderUnitEntry[]>();
  const sentenceHelpHintByNormalizedSourceText = new Map<string, string>();
  const phraseTargetByNormalizedSourceText = new Map<string, RenderUnitPhraseTarget>();
  const renderUnitById = new Map<string, RenderUnitEntry>();
  const minBandByRenderUnitId = new Map<string, string>();
  const bandOrder = new Map(
    (options.bandPreference ?? []).map((bandId, order) => [bandId, order] as const)
  );
  const blockedSingleTokenSourceTexts =
    options.blockedSingleTokenSourceTexts ?? DEFAULT_BLOCKED_SINGLE_TOKEN_SOURCE_TEXTS;

  for (const renderUnit of renderUnits) {
    renderUnitById.set(renderUnit.renderUnitId, renderUnit);
    minBandByRenderUnitId.set(renderUnit.renderUnitId, renderUnit.minBand);

    if (renderUnit.kind !== "single-token") {
      registerPhraseRenderUnit({
        renderUnit,
        phraseEntriesByNormalizedSourceText,
        sentenceHelpHintByNormalizedSourceText,
        phraseTargetByNormalizedSourceText
      });
    }

    if (!isSingleTokenInlineWordRenderUnit(renderUnit)) {
      continue;
    }

    const entry = renderUnitToWordRenderEntry(renderUnit);
    if (!entry) {
      continue;
    }

    if (isImmediateWordRenderUnit(renderUnit)) {
      registerExactWordForms({
        exactSingleTokenWordEntriesByNormalizedForm,
        preferredWordByNormalizedForm,
        entry,
        renderUnit,
        bandOrder,
        blockedSingleTokenSourceTexts
      });
      continue;
    }

    if (isAnalyzerPatternWordRenderUnit(renderUnit)) {
      analyzerPatternWordEntries.push(entry);
      for (const key of readAnalyzerPatternFirstTokenKeys(renderUnit)) {
        addWordRenderForm(analyzerPatternWordEntriesByFirstToken, key, entry);
      }
    }
  }

  return {
    exactSingleTokenWordEntriesByNormalizedForm,
    preferredWordByNormalizedForm,
    analyzerPatternWordEntries,
    analyzerPatternWordEntriesByFirstToken,
    phraseEntriesByNormalizedSourceText,
    sentenceHelpHintByNormalizedSourceText,
    phraseTargetByNormalizedSourceText,
    renderUnitById,
    bandOrder,
    minBandByRenderUnitId
  };
}

export function resolveRenderUnitPhraseTarget(
  entriesOrIndex: readonly RenderUnitEntry[] | RenderUnitRuntimeIndex,
  normalizedSourceText: string
): RenderUnitPhraseTarget | null {
  const normalized = normalizeToken(normalizedSourceText);
  if (!normalized) {
    return null;
  }

  if (isRenderUnitRuntimeIndex(entriesOrIndex)) {
    return entriesOrIndex.phraseTargetByNormalizedSourceText.get(normalized) ?? null;
  }

  const match = entriesOrIndex.find(
    (entry) =>
      entry.kind !== "single-token" &&
      (entry.renderPolicy === "inline" || entry.renderPolicy === "phrase-only") &&
      entry.sourcePattern.matchMode === "exact" &&
      entry.normalizedSourceText === normalized &&
      hasUsableTarget(entry)
  );

  if (!match || !match.targetText || !match.normalizedTargetText) {
    return null;
  }

  return {
    targetText: match.targetText,
    normalizedTargetText: match.normalizedTargetText
  };
}

export function getRenderUnitSentenceHints(
  entriesOrIndex: readonly RenderUnitEntry[] | RenderUnitRuntimeIndex
): string[] {
  if (isRenderUnitRuntimeIndex(entriesOrIndex)) {
    return [...entriesOrIndex.sentenceHelpHintByNormalizedSourceText.values()];
  }

  const hints = new Set<string>();
  for (const entry of entriesOrIndex) {
    if (
      entry.kind === "single-token" ||
      (entry.renderPolicy !== "sentence-help-only" &&
        entry.renderPolicy !== "phrase-only" &&
        entry.renderPolicy !== "inline")
    ) {
      continue;
    }

    const hint = renderUnitHintText(entry);
    if (hint) {
      hints.add(hint);
    }
  }

  return [...hints];
}

export function isSingleTokenInlineWordRenderUnit(
  entry: RenderUnitEntry
): entry is RenderUnitEntry & {
  pos: SafeInjectionPos;
  targetText: string;
  normalizedTargetText: string;
} {
  return (
    entry.kind === "single-token" &&
    entry.renderPolicy === "inline" &&
    entry.sourcePattern.tokens.length === 1 &&
    SAFE_POS.has(entry.pos ?? "") &&
    !entry.normalizedSourceText.includes(" ") &&
    entry.lexemeIds.length > 0 &&
    hasUsableTarget(entry)
  );
}

export function isImmediateWordRenderUnit(
  entry: RenderUnitEntry
): entry is RenderUnitEntry & {
  pos: SafeInjectionPos;
  targetText: string;
  normalizedTargetText: string;
} {
  return (
    isSingleTokenInlineWordRenderUnit(entry) &&
    entry.sourcePattern.matchMode === "exact"
  );
}

export function isAnalyzerPatternWordRenderUnit(
  entry: RenderUnitEntry
): entry is RenderUnitEntry & {
  pos: SafeInjectionPos;
  targetText: string;
  normalizedTargetText: string;
} {
  return (
    isSingleTokenInlineWordRenderUnit(entry) &&
    entry.sourcePattern.matchMode === "analyzer-pattern"
  );
}

export function renderUnitToWordRenderEntry(
  entry: RenderUnitEntry,
  lexemesById: ReadonlyMap<string, LexemeEntry> = new Map()
): WordRenderEntry | null {
  if (!isSingleTokenInlineWordRenderUnit(entry)) {
    return null;
  }

  const lexemeId = entry.lexemeIds[0];
  if (!lexemeId) {
    return null;
  }

  const lexeme = lexemesById.get(lexemeId);
  const targetText = entry.replacement?.targetText ?? entry.targetText;
  if (!targetText.trim()) {
    return null;
  }

  return {
    lexemeId: lexeme?.lexemeId ?? lexemeId,
    renderUnitId: entry.renderUnitId,
    renderUnitMinBand: entry.minBand,
    renderUnitMatchMode: entry.sourcePattern.matchMode,
    normalizedSourceText: entry.normalizedSourceText,
    targetText: targetText.trim(),
    sourceLemma: entry.normalizedSourceText,
    targetLemma: targetText.trim(),
    pos: entry.pos,
    frequencyRank: entry.frequencyRank ?? lexeme?.frequencyRank ?? null,
    confidence: entry.confidence,
    exampleSentenceEnglish:
      entry.exampleSentenceEnglish ?? lexeme?.exampleSentenceEnglish,
    exampleSentenceNative:
      entry.exampleSentenceNative ?? lexeme?.exampleSentenceNative,
    inflections: entry.inflections ?? lexeme?.inflections,
    sourceLanguage: entry.sourceLanguage ?? "en",
    targetLanguage: entry.targetLanguage ?? "es",
    sourceDataset: "render-units"
  };
}

export function findWordRenderEntriesForAnalyzerToken(input: {
  token: Pick<AnalyzerToken, "normalized" | "lemma">;
  tokenIndex: number;
  tokens: readonly AnalyzerToken[] | null;
  index: RenderUnitRuntimeIndex;
}): WordRenderEntry[] {
  const exactEntries = [
    ...(input.index.exactSingleTokenWordEntriesByNormalizedForm.get(
      input.token.normalized
    ) ?? []),
    ...(input.token.lemma
      ? input.index.exactSingleTokenWordEntriesByNormalizedForm.get(
          normalizeToken(input.token.lemma)
        ) ?? []
      : [])
  ];

  const analyzerEntries =
    input.tokens && input.tokenIndex >= 0
      ? findAnalyzerPatternEntriesForToken({
          tokens: input.tokens,
          tokenIndex: input.tokenIndex,
          index: input.index
        })
      : [];

  return uniqueWordRenderEntries([...exactEntries, ...analyzerEntries]);
}

export function findRenderUnitTokenSpans(
  tokens: readonly AnalyzerToken[],
  renderUnit: RenderUnitEntry
): { startToken: number; endToken: number }[] {
  const spans: { startToken: number; endToken: number }[] = [];
  const patternTokens = renderUnit.sourcePattern.tokens;
  if (patternTokens.length === 0) {
    return spans;
  }

  for (let startToken = 0; startToken < tokens.length; startToken += 1) {
    let tokenIndex = startToken;
    let matched = true;

    for (const patternToken of patternTokens) {
      const token = tokens[tokenIndex];
      if (!token) {
        if (patternToken.optional) {
          continue;
        }
        matched = false;
        break;
      }

      if (matchesRenderUnitPatternToken(tokens, tokenIndex, patternToken)) {
        tokenIndex += 1;
        continue;
      }

      if (!patternToken.optional) {
        matched = false;
        break;
      }
    }

    if (matched && tokenIndex > startToken) {
      spans.push({ startToken, endToken: tokenIndex });
    }
  }

  return spans;
}

export function matchesRenderUnitPatternToken(
  tokens: readonly AnalyzerToken[],
  tokenIndex: number,
  pattern: RenderUnitTokenPattern
): boolean {
  const token = tokens[tokenIndex];
  if (!token) {
    return false;
  }

  if (pattern.normal && token.normalized !== pattern.normal) {
    return false;
  }

  if (pattern.lemma && (token.lemma ?? token.normalized) !== pattern.lemma) {
    return false;
  }

  if (pattern.surface && normalizeToken(token.text) !== normalizeToken(pattern.surface)) {
    return false;
  }

  if (pattern.pos && token.pos !== pattern.pos) {
    return false;
  }

  if (pattern.role && !matchesShallowRole(token, pattern.role, pattern)) {
    return false;
  }

  return matchesRenderUnitFeatures(tokens, tokenIndex, pattern.features);
}

export function uniqueWordRenderEntries(
  entries: readonly WordRenderEntry[]
): WordRenderEntry[] {
  const seen = new Set<string>();
  const output: WordRenderEntry[] = [];

  for (const entry of entries) {
    const key = `${entry.renderUnitId}:${entry.lexemeId}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(entry);
  }

  return output;
}

function registerExactWordForms(input: {
  exactSingleTokenWordEntriesByNormalizedForm: Map<string, WordRenderEntry[]>;
  preferredWordByNormalizedForm: Map<string, WordRenderEntry>;
  entry: WordRenderEntry;
  renderUnit: RenderUnitEntry;
  bandOrder: ReadonlyMap<string, number>;
  blockedSingleTokenSourceTexts: ReadonlySet<string>;
}) {
  registerWordRenderKey(input, input.renderUnit.normalizedSourceText);
  registerWordRenderKey(input, input.renderUnit.sourceText);

  for (const inflection of input.renderUnit.inflections ?? []) {
    registerWordRenderKey(input, inflection);
  }
}

function registerWordRenderKey(
  input: {
    exactSingleTokenWordEntriesByNormalizedForm: Map<string, WordRenderEntry[]>;
    preferredWordByNormalizedForm: Map<string, WordRenderEntry>;
    entry: WordRenderEntry;
    bandOrder: ReadonlyMap<string, number>;
    blockedSingleTokenSourceTexts: ReadonlySet<string>;
  },
  rawKey: string
) {
  const normalized = normalizeToken(rawKey);
  if (!normalized || input.blockedSingleTokenSourceTexts.has(normalized)) {
    return;
  }

  addWordRenderForm(
    input.exactSingleTokenWordEntriesByNormalizedForm,
    normalized,
    input.entry
  );
  input.preferredWordByNormalizedForm.set(
    normalized,
    selectPreferredEntry(
      input.preferredWordByNormalizedForm.get(normalized),
      input.entry,
      input.bandOrder
    )
  );
}

function registerPhraseRenderUnit(input: {
  renderUnit: RenderUnitEntry;
  phraseEntriesByNormalizedSourceText: Map<string, RenderUnitEntry[]>;
  sentenceHelpHintByNormalizedSourceText: Map<string, string>;
  phraseTargetByNormalizedSourceText: Map<string, RenderUnitPhraseTarget>;
}) {
  const normalized = normalizeToken(input.renderUnit.normalizedSourceText);
  if (!normalized) {
    return;
  }

  addRenderUnit(input.phraseEntriesByNormalizedSourceText, normalized, input.renderUnit);

  const hint = renderUnitHintText(input.renderUnit);
  if (hint) {
    input.sentenceHelpHintByNormalizedSourceText.set(normalized, hint);
  }

  if (
    (input.renderUnit.renderPolicy === "inline" ||
      input.renderUnit.renderPolicy === "phrase-only") &&
    input.renderUnit.sourcePattern.matchMode === "exact" &&
    hasUsableTarget(input.renderUnit) &&
    input.renderUnit.targetText &&
    input.renderUnit.normalizedTargetText
  ) {
    input.phraseTargetByNormalizedSourceText.set(normalized, {
      targetText: input.renderUnit.targetText,
      normalizedTargetText: input.renderUnit.normalizedTargetText
    });
  }
}

function findAnalyzerPatternEntriesForToken(input: {
  tokens: readonly AnalyzerToken[];
  tokenIndex: number;
  index: RenderUnitRuntimeIndex;
}): WordRenderEntry[] {
  const token = input.tokens[input.tokenIndex];
  if (!token) {
    return [];
  }

  const keys = new Set([
    token.normalized,
    token.lemma ? normalizeToken(token.lemma) : "",
    "*"
  ]);
  const candidates = [...keys].flatMap(
    (key) => input.index.analyzerPatternWordEntriesByFirstToken.get(key) ?? []
  );
  const fallback =
    candidates.length > 0 ? candidates : input.index.analyzerPatternWordEntries;

  return fallback.filter((entry) => {
    const renderUnit = input.index.renderUnitById.get(entry.renderUnitId);
    return renderUnit
      ? matchesRenderUnitPatternToken(
          input.tokens,
          input.tokenIndex,
          renderUnit.sourcePattern.tokens[0]
        )
      : false;
  });
}

function readAnalyzerPatternFirstTokenKeys(renderUnit: RenderUnitEntry): string[] {
  const firstToken = renderUnit.sourcePattern.tokens[0];
  if (!firstToken) {
    return ["*"];
  }

  const keys = [
    firstToken.normal,
    firstToken.lemma,
    firstToken.surface ? normalizeToken(firstToken.surface) : undefined
  ].filter((value): value is string => Boolean(value));

  return keys.length > 0 ? [...new Set(keys)] : ["*"];
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

function addWordRenderForm(
  lookup: Map<string, WordRenderEntry[]>,
  form: string,
  entry: WordRenderEntry
) {
  const normalized = normalizeToken(form);
  if (!normalized) {
    return;
  }

  const existing = lookup.get(normalized);
  if (existing) {
    existing.push(entry);
    return;
  }

  lookup.set(normalized, [entry]);
}

function addRenderUnit(
  lookup: Map<string, RenderUnitEntry[]>,
  normalized: string,
  entry: RenderUnitEntry
) {
  const existing = lookup.get(normalized);
  if (existing) {
    existing.push(entry);
    return;
  }

  lookup.set(normalized, [entry]);
}

function isRenderUnitRuntimeIndex(
  value: readonly RenderUnitEntry[] | RenderUnitRuntimeIndex
): value is RenderUnitRuntimeIndex {
  return !Array.isArray(value);
}

function hasUsableTarget(
  entry: RenderUnitEntry
): entry is RenderUnitEntry & { targetText: string; normalizedTargetText: string } {
  return Boolean(entry.targetText?.trim() && entry.normalizedTargetText?.trim());
}

function renderUnitHintText(entry: RenderUnitEntry): string | null {
  const literalSource = entry.sourceText.replace(/\{[^}]+}/g, " ");
  const sourceHint = normalizeToken(literalSource);
  if (sourceHint && sourceHint.includes(" ")) {
    return sourceHint;
  }

  const patternHint = entry.sourcePattern.tokens
    .map((token) => token.normal ?? token.lemma ?? token.surface ?? "")
    .filter(Boolean)
    .join(" ");

  if (patternHint.includes(" ")) {
    return normalizeToken(patternHint);
  }

  const replacement = entry.replacement;
  if (replacement) {
    const tokens = entry.sourceText.split(/\s+/);
    const selected = tokens.slice(replacement.startToken, replacement.endToken).join(" ");
    if (selected.trim()) {
      return selected.trim().toLowerCase();
    }
  }

  return entry.sourceText.trim().toLowerCase() || null;
}

function matchesShallowRole(
  token: AnalyzerToken,
  role: NonNullable<RenderUnitTokenPattern["role"]>,
  pattern: RenderUnitTokenPattern
): boolean {
  if (role === "subject") {
    return token.pos === "pronoun" || token.pos === "noun" || token.pos === "proper-noun";
  }

  if (role === "verb") {
    return token.pos === "verb" || token.pos === "auxiliary" || token.pos === "modal";
  }

  if (role === "object") {
    if (token.pos === "noun" || token.pos === "pronoun" || token.pos === "proper-noun") {
      return true;
    }

    return token.pos === "verb" && hasLexicallyPinnedPattern(pattern);
  }

  return token.pos !== "other";
}

function hasLexicallyPinnedPattern(pattern: RenderUnitTokenPattern): boolean {
  return Boolean(pattern.normal || pattern.lemma || pattern.surface);
}

function matchesRenderUnitFeatures(
  tokens: readonly AnalyzerToken[],
  tokenIndex: number,
  features: RenderUnitTokenPattern["features"]
): boolean {
  if (!features) {
    return true;
  }

  const token = tokens[tokenIndex];
  if (!token) {
    return false;
  }

  for (const [key, value] of Object.entries(features)) {
    if (key === "wildcard" && value === true) {
      continue;
    }

    if (key === "notSentenceInitial") {
      if (typeof value === "boolean" && (tokenIndex === 0) === value) {
        return false;
      }
      continue;
    }

    if (key === "normalIn" && !matchesStringOrList(token.normalized, value)) {
      return false;
    }
    if (key === "normalIn") {
      continue;
    }

    if (key === "lemmaIn" && !matchesStringOrList(token.lemma ?? token.normalized, value)) {
      return false;
    }
    if (key === "lemmaIn") {
      continue;
    }

    if (key === "posIn" && !matchesStringOrList(token.pos ?? "other", value)) {
      return false;
    }
    if (key === "posIn") {
      continue;
    }

    if (key === "precededByNormal") {
      const previous = tokens[tokenIndex - 1]?.normalized ?? "";
      if (!matchesStringOrList(previous, value)) {
        return false;
      }
      continue;
    }

    if (key === "followedByNormal") {
      const next = tokens[tokenIndex + 1]?.normalized ?? "";
      if (!matchesStringOrList(next, value)) {
        return false;
      }
      continue;
    }

    if (key === "precededByPos") {
      const previousPos = tokens[tokenIndex - 1]?.pos ?? "other";
      if (!matchesStringOrList(previousPos, value)) {
        return false;
      }
      continue;
    }

    if (key === "followedByPos") {
      const nextPos = tokens[tokenIndex + 1]?.pos ?? "other";
      if (!matchesStringOrList(nextPos, value)) {
        return false;
      }
      continue;
    }

    if (key === "notPrecededByPos") {
      const previousPos = tokens[tokenIndex - 1]?.pos ?? "other";
      if (matchesStringOrList(previousPos, value)) {
        return false;
      }
      continue;
    }

    if (key === "notFollowedByPos") {
      const nextPos = tokens[tokenIndex + 1]?.pos ?? "other";
      if (matchesStringOrList(nextPos, value)) {
        return false;
      }
      continue;
    }

    if (key === "negated") {
      const negated = hasNearbyNegation(tokens, tokenIndex);
      if (typeof value === "boolean" && negated !== value) {
        return false;
      }
      continue;
    }

    return false;
  }

  return true;
}

function matchesStringOrList(
  input: string,
  expected: string | string[] | boolean
): boolean {
  if (typeof expected === "string") {
    return input === expected;
  }

  return Array.isArray(expected) ? expected.includes(input) : false;
}

function hasNearbyNegation(tokens: readonly AnalyzerToken[], tokenIndex: number): boolean {
  return tokens
    .slice(Math.max(0, tokenIndex - 3), Math.min(tokens.length, tokenIndex + 4))
    .some((token) =>
      token.normalized === "not" ||
      token.normalized === "never" ||
      token.normalized === "no" ||
      token.normalized.endsWith("n't")
    );
}
