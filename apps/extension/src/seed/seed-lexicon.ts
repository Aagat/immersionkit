import { SAFE_INJECTION_POS_VALUES } from "@immersionkit/shared";
import type { SeedLexiconEntry } from "@immersionkit/shared";

const SAFE_POS = new Set<string>(SAFE_INJECTION_POS_VALUES);
const DEFAULT_ARRAY_COLUMNS = [
  "lemmaId",
  "sourceLemma",
  "targetLemma",
  "pos",
  "frequencyRank",
  "confidence"
] as const;

type SeedLexiconStorageRecord = Record<string, unknown>;

export type SeedLexiconFormat =
  | "legacy-object-array"
  | "wrapped-object-array"
  | "wrapped-array";

export type ParsedSeedLexicon = {
  entries: SeedLexiconEntry[];
  assetVersion: string | null;
  schemaVersion: string | null;
  format: SeedLexiconFormat;
};

export function parseSeedLexiconInput(input: unknown): ParsedSeedLexicon | null {
  if (Array.isArray(input)) {
    const entries = parseObjectEntries(input);
    if (entries.length === 0) {
      return null;
    }

    return {
      entries,
      assetVersion: null,
      schemaVersion: null,
      format: "legacy-object-array"
    };
  }

  if (!isRecord(input)) {
    return null;
  }

  const wrappedEntries = input.entries;
  if (!Array.isArray(wrappedEntries)) {
    return null;
  }

  const assetVersion = readString(input.assetVersion);
  const schemaVersion = readString(input.schemaVersion);
  const columns = normalizeColumns(input.columns);
  const entryEncoding = readString(input.entryEncoding);

  const firstRow = wrappedEntries.find((row) => row !== null && row !== undefined);
  const isArrayRows = Array.isArray(firstRow);
  const format: SeedLexiconFormat = isArrayRows
    ? "wrapped-array"
    : "wrapped-object-array";

  const entries =
    entryEncoding === "array" || isArrayRows
      ? parseArrayEntries(wrappedEntries, columns)
      : parseObjectEntries(wrappedEntries);

  if (entries.length === 0) {
    return null;
  }

  return {
    entries,
    assetVersion,
    schemaVersion,
    format
  };
}

export function isLikelyFallbackSeedLexicon(
  entries: readonly SeedLexiconEntry[]
): boolean {
  return entries.length > 0 && entries.every((entry) => entry.lemmaId.startsWith("seed-"));
}

function parseArrayEntries(
  rows: readonly unknown[],
  rawColumns: readonly string[]
): SeedLexiconEntry[] {
  const columns = rawColumns.length > 0 ? rawColumns : DEFAULT_ARRAY_COLUMNS;
  const columnLookup = new Map(columns.map((column, index) => [column, index] as const));

  const lemmaIdIndex = resolveColumnIndex(columnLookup, "lemmaId", 0);
  const sourceLemmaIndex = resolveColumnIndex(columnLookup, "sourceLemma", 1);
  const targetLemmaIndex = resolveColumnIndex(columnLookup, "targetLemma", 2);
  const posIndex = resolveColumnIndex(columnLookup, "pos", 3);
  const frequencyRankIndex = resolveColumnIndex(columnLookup, "frequencyRank", 4);
  const confidenceIndex = resolveColumnIndex(columnLookup, "confidence", 5);

  const entries: SeedLexiconEntry[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) {
      continue;
    }

    const normalizedEntry = normalizeSeedEntry({
      lemmaId: row[lemmaIdIndex],
      sourceLemma: row[sourceLemmaIndex],
      targetLemma: row[targetLemmaIndex],
      pos: row[posIndex],
      frequencyRank: row[frequencyRankIndex],
      confidence: row[confidenceIndex]
    });

    if (!normalizedEntry) {
      continue;
    }

    entries.push(normalizedEntry);
  }

  return entries;
}

function parseObjectEntries(rows: readonly unknown[]): SeedLexiconEntry[] {
  const entries: SeedLexiconEntry[] = [];

  for (const row of rows) {
    const normalizedEntry = normalizeSeedEntry(row);
    if (!normalizedEntry) {
      continue;
    }

    entries.push(normalizedEntry);
  }

  return entries;
}

function normalizeSeedEntry(input: unknown): SeedLexiconEntry | null {
  if (!isRecord(input)) {
    return null;
  }

  const lemmaId = readString(input.lemmaId);
  const sourceLemma = readString(input.sourceLemma);
  const targetLemma = readString(input.targetLemma);
  const pos = readString(input.pos) as SeedLexiconEntry["pos"] | null;

  if (!lemmaId || !sourceLemma || !targetLemma || !pos || !SAFE_POS.has(pos)) {
    return null;
  }

  return {
    lemmaId,
    sourceLemma,
    targetLemma,
    pos,
    frequencyRank: readFiniteNumberOrNull(input.frequencyRank),
    confidence: readFiniteNumber(input.confidence, 0.9),
    inflections: Array.isArray(input.inflections)
      ? input.inflections.filter((value): value is string => typeof value === "string")
      : undefined
  };
}

function normalizeColumns(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((value) => readString(value))
    .filter((value): value is string => Boolean(value));
}

function resolveColumnIndex(
  lookup: ReadonlyMap<string, number>,
  columnName: string,
  fallbackIndex: number
): number {
  const mappedIndex = lookup.get(columnName);
  return typeof mappedIndex === "number" ? mappedIndex : fallbackIndex;
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

function isRecord(value: unknown): value is SeedLexiconStorageRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
