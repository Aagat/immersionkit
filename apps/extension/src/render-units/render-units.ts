import {
  RENDER_UNIT_KINDS,
  RENDER_UNIT_MATCH_MODES,
  RENDER_UNIT_POLICIES,
  RENDER_UNIT_PROVENANCE_SOURCES,
  SAFE_INJECTION_POS_VALUES,
  SUPPORTED_POS_VALUES,
  normalizeToken,
  type RenderUnitAsset,
  type RenderUnitEntry,
  type RenderUnitKind,
  type RenderUnitMatchMode,
  type RenderUnitPolicy,
  type RenderUnitProvenanceSource,
  type RenderUnitTokenPattern,
  type LexemeAsset,
  type LexemeEntry,
  type SeedLexiconAsset,
  type SeedLexiconEntry,
  type SupportedPos
} from "@immersionkit/shared";

type StorageRecord = Record<string, unknown>;

export type ParsedRenderUnitAsset = {
  entries: RenderUnitEntry[];
  assetVersion: string | null;
  schemaVersion: string | null;
};

export type ParsedLexemeAsset = {
  entries: LexemeEntry[];
  assetVersion: string | null;
  schemaVersion: string | null;
};

type RenderUnitPhraseTarget = {
  targetText: string;
  normalizedTargetText: string;
};

const SUPPORTED_POS = new Set<string>(SUPPORTED_POS_VALUES);
const SAFE_POS = new Set<string>(SAFE_INJECTION_POS_VALUES);
const RENDER_UNIT_KIND_SET = new Set<string>(RENDER_UNIT_KINDS);
const RENDER_UNIT_MATCH_MODE_SET = new Set<string>(RENDER_UNIT_MATCH_MODES);
const RENDER_UNIT_POLICY_SET = new Set<string>(RENDER_UNIT_POLICIES);
const RENDER_UNIT_PROVENANCE_SOURCE_SET = new Set<string>(
  RENDER_UNIT_PROVENANCE_SOURCES
);

export function parseRenderUnitAsset(input: unknown): ParsedRenderUnitAsset | null {
  if (!isRecord(input) || !Array.isArray(input.entries)) {
    return null;
  }

  const entries = input.entries.flatMap((entry): RenderUnitEntry[] => {
    const normalized = normalizeRenderUnitEntry(entry);
    return normalized ? [normalized] : [];
  });

  if (entries.length === 0) {
    return null;
  }

  return {
    entries,
    assetVersion: readString(input.assetVersion),
    schemaVersion: readString(input.schemaVersion)
  };
}

export function parseLexemeAsset(input: unknown): ParsedLexemeAsset | null {
  if (!isRecord(input) || !Array.isArray(input.entries)) {
    return null;
  }

  const entries = input.entries.flatMap((entry): LexemeEntry[] => {
    const normalized = normalizeLexemeEntry(entry);
    return normalized ? [normalized] : [];
  });

  if (entries.length === 0) {
    return null;
  }

  return {
    entries,
    assetVersion: readString(input.assetVersion),
    schemaVersion: readString(input.schemaVersion)
  };
}

export function renderUnitsToSeedLexiconEntries(
  entries: readonly RenderUnitEntry[],
  lexemes: readonly LexemeEntry[] = []
): SeedLexiconEntry[] {
  const lexemesById = new Map(lexemes.map((lexeme) => [lexeme.lexemeId, lexeme]));
  return entries.flatMap((entry): SeedLexiconEntry[] => {
    if (!isRenderableSingleTokenUnit(entry)) {
      return [];
    }

    const lexemeId = entry.lexemeIds[0] ?? entry.renderUnitId;
    const lexeme = lexemesById.get(lexemeId);

    return [
      {
        lemmaId: lexeme?.lexemeId ?? lexemeId,
        lexemeId: lexeme?.lexemeId ?? lexemeId,
        renderUnitId: entry.renderUnitId,
        renderUnitMinBand: entry.minBand,
        sourceLemma: entry.normalizedSourceText,
        targetLemma: entry.targetText.trim(),
        pos: entry.pos,
        frequencyRank: entry.frequencyRank ?? null,
        confidence: entry.confidence,
        exampleSentenceEnglish: entry.exampleSentenceEnglish,
        exampleSentenceNative: entry.exampleSentenceNative,
        inflections: entry.inflections,
        sourceLanguage: entry.sourceLanguage ?? "en",
        targetLanguage: entry.targetLanguage ?? "es",
        sourceDataset: "render-units"
      }
    ];
  });
}

export function renderUnitsToSeedLexiconAsset(
  asset: ParsedRenderUnitAsset,
  lexemes: readonly LexemeEntry[] = []
): SeedLexiconAsset & {
  schemaVersion: string | null;
  assetVersion: string | null;
  languagePair: "en-es";
  entryCount: number;
} {
  const entries = renderUnitsToSeedLexiconEntries(asset.entries, lexemes);
  return {
    schemaVersion: asset.schemaVersion,
    assetVersion: asset.assetVersion,
    version: asset.assetVersion ?? "render-units",
    languagePair: "en-es",
    sourceLanguage: "en",
    targetLanguage: "es",
    createdAt: new Date().toISOString(),
    entryCount: entries.length,
    entries
  };
}

function normalizeLexemeEntry(input: unknown): LexemeEntry | null {
  if (!isRecord(input)) {
    return null;
  }

  const lexemeId = readString(input.lexemeId);
  const sourceLemma = readString(input.sourceLemma);
  const targetLemma = readString(input.targetLemma);
  const pos = readSupportedPos(input.pos);
  const confidence = readFiniteNumber(input.confidence, Number.NaN);
  if (!lexemeId || !sourceLemma || !targetLemma || !pos || !Number.isFinite(confidence)) {
    return null;
  }

  return {
    lexemeId,
    sourceLemma,
    targetLemma,
    pos,
    frequencyRank: readFiniteNumberOrNull(input.frequencyRank),
    cefrLevel: readString(input.cefrLevel) ?? undefined,
    confidence: Math.max(0, Math.min(1, confidence)),
    exampleSentenceEnglish: readString(input.exampleSentenceEnglish) ?? undefined,
    exampleSentenceNative: readString(input.exampleSentenceNative) ?? undefined,
    inflections: Array.isArray(input.inflections)
      ? input.inflections.filter((value): value is string => typeof value === "string")
      : undefined,
    sourceLanguage: "en",
    targetLanguage: "es",
    sourceDataset: readString(input.sourceDataset) ?? undefined
  };
}

export function resolveRenderUnitPhraseTarget(
  entries: readonly RenderUnitEntry[],
  normalizedSourceText: string
): RenderUnitPhraseTarget | null {
  const normalized = normalizeToken(normalizedSourceText);
  if (!normalized) {
    return null;
  }

  const match = entries.find(
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
  entries: readonly RenderUnitEntry[]
): string[] {
  const hints = new Set<string>();
  for (const entry of entries) {
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

function normalizeRenderUnitEntry(input: unknown): RenderUnitEntry | null {
  if (!isRecord(input)) {
    return null;
  }

  const renderUnitId = readString(input.renderUnitId);
  const kind = readRenderUnitKind(input.kind);
  const sourceText = readString(input.sourceText);
  const normalizedSourceText = normalizeToken(
    readString(input.normalizedSourceText) ?? sourceText ?? ""
  );
  const sourcePattern = readSourcePattern(input.sourcePattern, normalizedSourceText);
  const renderPolicy = readRenderUnitPolicy(input.renderPolicy);
  const confidence = readFiniteNumber(input.confidence, Number.NaN);
  const minBand = readString(input.minBand);
  const provenanceSource = readProvenanceSource(
    isRecord(input.provenance) ? input.provenance.source : undefined
  );

  if (
    !renderUnitId ||
    !kind ||
    !sourceText ||
    !normalizedSourceText ||
    !sourcePattern ||
    !renderPolicy ||
    !Number.isFinite(confidence) ||
    !minBand ||
    !provenanceSource
  ) {
    return null;
  }

  const rawTargetText = readString(input.targetText);
  const normalizedTargetText = normalizeToken(
    readString(input.normalizedTargetText) ?? rawTargetText ?? ""
  );
  const targetText = rawTargetText ?? undefined;
  const pos = readSupportedPos(input.pos) ?? inferPatternPos(sourcePattern.tokens);
  const lexemeIds = Array.isArray(input.lexemeIds)
    ? input.lexemeIds
        .map((value) => readString(value))
        .filter((value): value is string => Boolean(value))
    : [];

  if (
    (renderPolicy === "inline" || renderPolicy === "phrase-only") &&
    (!targetText || !normalizedTargetText)
  ) {
    return null;
  }

  return {
    renderUnitId,
    lexemeIds,
    kind,
    renderPolicy,
    sourceText,
    normalizedSourceText,
    targetText,
    normalizedTargetText: normalizedTargetText || undefined,
    sourcePattern,
    replacement: readReplacement(input.replacement),
    pos,
    minBand,
    frequencyRank: readFiniteNumberOrNull(input.frequencyRank),
    confidence: Math.max(0, Math.min(1, confidence)),
    provenance: {
      source: provenanceSource,
      sourceRowHash: isRecord(input.provenance)
        ? readString(input.provenance.sourceRowHash) ?? undefined
        : undefined,
      promptVersion: isRecord(input.provenance)
        ? readString(input.provenance.promptVersion) ?? undefined
        : undefined,
      model: isRecord(input.provenance)
        ? readString(input.provenance.model) ?? undefined
        : undefined,
      notes: isRecord(input.provenance)
        ? readString(input.provenance.notes) ?? undefined
        : undefined
    },
    exampleSentenceEnglish: readString(input.exampleSentenceEnglish) ?? undefined,
    exampleSentenceNative: readString(input.exampleSentenceNative) ?? undefined,
    inflections: Array.isArray(input.inflections)
      ? input.inflections.filter((value): value is string => typeof value === "string")
      : undefined,
    sourceLanguage: "en",
    targetLanguage: "es"
  };
}

function readSourcePattern(
  input: unknown,
  normalizedSourceText: string
): RenderUnitEntry["sourcePattern"] | null {
  if (isRecord(input)) {
    const matchMode = readRenderUnitMatchMode(input.matchMode);
    const tokens = Array.isArray(input.tokens)
      ? input.tokens.flatMap((token): RenderUnitTokenPattern[] => {
          const normalized = normalizePatternToken(token);
          return normalized ? [normalized] : [];
        })
      : [];

    if (matchMode && tokens.length > 0) {
      return {
        matchMode,
        tokens
      };
    }
  }

  const exactTokens = normalizedSourceText
    .split(/\s+/)
    .filter(Boolean)
    .map((normal) => ({ normal }));

  return exactTokens.length > 0
    ? {
        matchMode: "exact",
        tokens: exactTokens
      }
    : null;
}

function normalizePatternToken(input: unknown): RenderUnitTokenPattern | null {
  if (!isRecord(input)) {
    return null;
  }

  const surface = readString(input.surface) ?? undefined;
  const normal = normalizeToken(readString(input.normal) ?? surface ?? "");
  const lemma = normalizeToken(readString(input.lemma) ?? "");
  const pos = readSupportedPos(input.pos);
  const role = readRenderUnitRole(input.role);
  const features = isRecord(input.features)
    ? (Object.fromEntries(
        Object.entries(input.features).filter(([, value]) =>
          typeof value === "string" ||
          typeof value === "boolean" ||
          (Array.isArray(value) && value.every((item) => typeof item === "string"))
        )
      ) as Record<string, string | string[] | boolean>)
    : undefined;

  if (!surface && !normal && !lemma && !pos && !role && !features) {
    return null;
  }

  return {
    surface,
    normal: normal || undefined,
    lemma: lemma || undefined,
    pos,
    role,
    optional: input.optional === true,
    features
  };
}

function readReplacement(input: unknown): RenderUnitEntry["replacement"] | undefined {
  if (!isRecord(input)) {
    return undefined;
  }

  const startToken = readFiniteNumber(input.startToken, Number.NaN);
  const endToken = readFiniteNumber(input.endToken, Number.NaN);
  const targetText = readString(input.targetText);
  if (!Number.isInteger(startToken) || !Number.isInteger(endToken) || !targetText) {
    return undefined;
  }

  return {
    startToken,
    endToken,
    targetText
  };
}

function isRenderableSingleTokenUnit(
  entry: RenderUnitEntry
): entry is RenderUnitEntry & { pos: SupportedPos; targetText: string } {
  return (
    entry.kind === "single-token" &&
    entry.renderPolicy === "inline" &&
    entry.sourcePattern.matchMode === "exact" &&
    entry.sourcePattern.tokens.length === 1 &&
    Boolean(entry.pos && SAFE_POS.has(entry.pos)) &&
    !entry.normalizedSourceText.includes(" ") &&
    hasUsableTarget(entry)
  );
}

function hasUsableTarget(
  entry: RenderUnitEntry
): entry is RenderUnitEntry & { targetText: string; normalizedTargetText: string } {
  return Boolean(
    entry.targetText &&
      entry.targetText.trim().length > 0 &&
      entry.normalizedTargetText &&
      entry.normalizedTargetText.trim().length > 0
  );
}

function inferPatternPos(tokens: readonly RenderUnitTokenPattern[]): SupportedPos | undefined {
  return tokens.length === 1 ? tokens[0]?.pos : undefined;
}

function readRenderUnitKind(value: unknown): RenderUnitKind | null {
  return readStringSetValue(value, RENDER_UNIT_KIND_SET) as RenderUnitKind | null;
}

function readRenderUnitMatchMode(value: unknown): RenderUnitMatchMode | null {
  const text = readString(value);
  if (text === "token-pattern") {
    return "analyzer-pattern";
  }

  return text && RENDER_UNIT_MATCH_MODE_SET.has(text)
    ? (text as RenderUnitMatchMode)
    : null;
}

function readRenderUnitPolicy(value: unknown): RenderUnitPolicy | null {
  return readStringSetValue(value, RENDER_UNIT_POLICY_SET) as RenderUnitPolicy | null;
}

function readProvenanceSource(value: unknown): RenderUnitProvenanceSource | null {
  return readStringSetValue(value, RENDER_UNIT_PROVENANCE_SOURCE_SET) as
    | RenderUnitProvenanceSource
    | null;
}

function readSupportedPos(value: unknown): SupportedPos | undefined {
  const pos = readString(value);
  return pos && SUPPORTED_POS.has(pos) ? (pos as SupportedPos) : undefined;
}

function readRenderUnitRole(
  value: unknown
): RenderUnitTokenPattern["role"] | undefined {
  const role = readString(value);
  return role === "subject" ||
    role === "verb" ||
    role === "object" ||
    role === "complement"
    ? role
    : undefined;
}

function readStringSetValue(value: unknown, allowed: ReadonlySet<string>): string | null {
  const text = readString(value);
  return text && allowed.has(text) ? text : null;
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

  return patternHint.includes(" ") ? normalizeToken(patternHint) : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readFiniteNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is StorageRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
