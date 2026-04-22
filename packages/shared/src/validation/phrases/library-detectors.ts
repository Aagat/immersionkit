/// <reference path="./third-party-modules.d.ts" />

import { normalizeToken } from "../../text/normalize";
import { tokenizeForLookup } from "../../text/tokenize";
import {
  buildCanonicalPhraseKey,
  detectFixedPhraseLane,
  detectPhraseCandidates,
  resolveOverlaps
} from "./detector";
import { FIXED_PHRASE_LEXICON } from "./fixed-phrases";
import type {
  PhraseCandidate,
  PhraseDetectionResult,
  PhraseDetectorImplementation,
  PhraseGoldCase,
  PhraseToken
} from "./types";

type UnknownRecord = Record<string, unknown>;

type CompromiseDoc = {
  terms?: () => {
    json?: () => unknown;
  };
};

const AUXILIARY_FORMS = new Set([
  "am",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "can",
  "could",
  "may",
  "might",
  "must",
  "shall",
  "should",
  "will",
  "would"
]);

const GENERIC_CHUNK_HEADS = new Set([
  "thing",
  "things",
  "stuff",
  "someone",
  "something",
  "anything"
]);

const TRAILING_TEMPORAL_NOUNS = new Set([
  "today",
  "tomorrow",
  "yesterday",
  "tonight"
]);

let compromiseThreeModulePromise:
  | Promise<{
      default: (text: string) => CompromiseDoc;
    }>
  | null = null;

let winkNlpEnginePromise:
  | Promise<{
      its: {
        normal: unknown;
        pos: unknown;
      };
      readDoc: (input: string) => {
        tokens: () => {
          out: (kind?: unknown) => unknown;
        };
      };
    }>
  | null = null;

export function listPhraseDetectorImplementations(
  includeWinkNlp = true
): PhraseDetectorImplementation[] {
  const implementations: PhraseDetectorImplementation[] = [
    {
      implementationId: "shared-annotated",
      label: "Shared annotated heuristics",
      inputMode: "fixture-annotated",
      detect: (phraseCase) => detectPhraseCandidates(phraseCase)
    },
    {
      implementationId: "compromise-three",
      label: "compromise/three + shared phrase heuristics",
      inputMode: "library-pos-from-raw",
      detect: async (phraseCase) => detectCompromiseThreePhraseCandidates(phraseCase)
    }
  ];

  if (includeWinkNlp) {
    implementations.push({
      implementationId: "wink-nlp",
      label: "wink-nlp + shared phrase heuristics",
      inputMode: "library-pos-from-raw",
      detect: async (phraseCase) => detectWinkPhraseCandidates(phraseCase)
    });
  }

  return implementations;
}

async function detectCompromiseThreePhraseCandidates(
  phraseCase: PhraseGoldCase
): Promise<PhraseDetectionResult> {
  const module = await loadCompromiseThreeModule();
  const doc = module.default(phraseCase.sourceText);
  const terms = extractCompromiseTerms(doc.terms?.()?.json?.());
  const tokens = alignLibraryTokens(phraseCase.sourceText, terms);
  return detectPhraseCandidatesFromLibraryTokens(phraseCase.sourceText, tokens);
}

async function detectWinkPhraseCandidates(
  phraseCase: PhraseGoldCase
): Promise<PhraseDetectionResult> {
  const winkNlp = await loadWinkNlpEngine();
  const doc = winkNlp.readDoc(phraseCase.sourceText);
  const tokenCursor = doc.tokens();
  const rawTexts = safeStringArray(tokenCursor.out());
  const normalForms = safeStringArray(tokenCursor.out(winkNlp.its.normal));
  const posTags = safeStringArray(tokenCursor.out(winkNlp.its.pos));

  const tokens = alignLibraryTokens(
    phraseCase.sourceText,
    rawTexts.map((raw, index) => ({
      surface: raw,
      normalized: normalForms[index],
      pos: normalizeWinkPos(raw, posTags[index])
    }))
  );

  return detectPhraseCandidatesFromLibraryTokens(phraseCase.sourceText, tokens);
}

function detectPhraseCandidatesFromLibraryTokens(
  sourceText: string,
  tokens: readonly PhraseToken[]
): PhraseDetectionResult {
  const allCandidates = [
    ...detectFixedPhraseLane(sourceText, tokens, FIXED_PHRASE_LEXICON),
    ...detectLibraryBackedGrammarCarrierPatterns(sourceText, tokens),
    ...detectLibraryBackedAdjectiveNounPatterns(sourceText, tokens),
    ...detectLibraryBackedNounChunks(sourceText, tokens)
  ].sort(comparePhraseCandidates);

  return {
    allCandidates,
    selectedCandidates: resolveOverlaps(allCandidates)
  };
}

function detectLibraryBackedGrammarCarrierPatterns(
  sourceText: string,
  tokens: readonly PhraseToken[]
): PhraseCandidate[] {
  const candidates: PhraseCandidate[] = [];

  for (let index = 0; index < tokens.length - 1; index += 1) {
    const currentToken = tokens[index];
    const nextToken = tokens[index + 1];
    const previousToken = index > 0 ? tokens[index - 1] : undefined;
    const trailingToken = index + 2 < tokens.length ? tokens[index + 2] : undefined;
    const trailingPlusOne = index + 3 < tokens.length ? tokens[index + 3] : undefined;

    if (
      currentToken.normalized === "going" &&
      nextToken.normalized === "to" &&
      previousToken &&
      AUXILIARY_FORMS.has(previousToken.normalized) &&
      trailingToken?.pos === "VERB"
    ) {
      candidates.push(
        buildPhraseCandidate({
          sourceKind: "pattern-match",
          category: "grammar-carrier",
          lane: "grammar-chunk",
          ruleId: "pattern-going-to-v1",
          confidence: 0.86,
          startToken: index,
          endToken: index + 2,
          sourceText,
          tokens
        })
      );
    }

    if (
      currentToken.normalized === "used" &&
      nextToken.normalized === "to" &&
      trailingToken?.pos === "VERB" &&
      previousToken?.pos !== "AUX" &&
      !AUXILIARY_FORMS.has(previousToken?.normalized ?? "")
    ) {
      candidates.push(
        buildPhraseCandidate({
          sourceKind: "pattern-match",
          category: "grammar-carrier",
          lane: "grammar-chunk",
          ruleId: "pattern-used-to-v2",
          confidence: 0.87,
          startToken: index,
          endToken: index + 2,
          sourceText,
          tokens
        })
      );
    }

    const lookaheadToken =
      trailingToken?.pos === "ADV" && trailingPlusOne ? trailingPlusOne : trailingToken;

    if (
      AUXILIARY_FORMS.has(currentToken.normalized) &&
      nextToken.normalized === "been" &&
      lookaheadToken &&
      (lookaheadToken.pos === "VERB" ||
        lookaheadToken.pos === "ADJ" ||
        lookaheadToken.pos === "NOUN" ||
        lookaheadToken.normalized === "to" ||
        lookaheadToken.pos === "PART")
    ) {
      candidates.push(
        buildPhraseCandidate({
          sourceKind: "pattern-match",
          category: "grammar-carrier",
          lane: "grammar-chunk",
          ruleId: trailingToken?.pos === "ADV" ? "pattern-have-been-adv-v2" : "pattern-have-been-v1",
          confidence: trailingToken?.pos === "ADV" ? 0.82 : 0.84,
          startToken: index,
          endToken: index + 2,
          sourceText,
          tokens
        })
      );
    }
  }

  return candidates;
}

function detectLibraryBackedAdjectiveNounPatterns(
  sourceText: string,
  tokens: readonly PhraseToken[]
): PhraseCandidate[] {
  const candidates: PhraseCandidate[] = [];

  for (let startToken = 0; startToken < tokens.length - 1; startToken += 1) {
    const currentToken = tokens[startToken];
    const nextToken = tokens[startToken + 1];

    if (currentToken.pos !== "ADJ" || nextToken.pos !== "NOUN") {
      continue;
    }

    let endToken = startToken + 2;
    while (
      endToken < tokens.length &&
      tokens[endToken].pos === "NOUN" &&
      !TRAILING_TEMPORAL_NOUNS.has(tokens[endToken].normalized) &&
      endToken - startToken < 4
    ) {
      endToken += 1;
    }

    const tokenLength = endToken - startToken;
    const confidence = Math.min(0.78, 0.66 + Math.max(0, tokenLength - 2) * 0.04);

    candidates.push(
      buildPhraseCandidate({
        sourceKind: "pattern-match",
        category: "adjective-noun",
        lane: "grammar-chunk",
        ruleId: "pattern-adjective-noun-shell-v2",
        confidence,
        startToken,
        endToken,
        sourceText,
        tokens
      })
    );
  }

  return candidates;
}

function detectLibraryBackedNounChunks(
  sourceText: string,
  tokens: readonly PhraseToken[]
): PhraseCandidate[] {
  const candidates: PhraseCandidate[] = [];

  for (let startToken = 0; startToken < tokens.length - 2; startToken += 1) {
    for (
      let endTokenExclusive = startToken + 3;
      endTokenExclusive <= tokens.length && endTokenExclusive - startToken <= 7;
      endTokenExclusive += 1
    ) {
      const rawSpan = tokens.slice(startToken, endTokenExclusive);
      if (!rawSpan.every((token) => isLibraryChunkShellToken(token.pos))) {
        break;
      }

      const containsConnector = rawSpan.some((token) => token.pos === "PREP");
      if (!containsConnector) {
        continue;
      }

      let trimmedStart = startToken;
      while (
        trimmedStart < endTokenExclusive - 2 &&
        (tokens[trimmedStart].pos === "DET" || tokens[trimmedStart].pos === "AUX")
      ) {
        trimmedStart += 1;
      }

      const span = tokens.slice(trimmedStart, endTokenExclusive);
      if (span.length < 3 || span.some((token) => token.pos === "PRON")) {
        continue;
      }

      const nounCount = span.filter(
        (token) => token.pos === "NOUN" || token.pos === "PROPN"
      ).length;
      if (nounCount < 2) {
        continue;
      }

      const connectorIndex = span.findIndex((token) => token.pos === "PREP");
      if (connectorIndex <= 0 || connectorIndex >= span.length - 2) {
        continue;
      }

      const headToken = span
        .slice(0, connectorIndex)
        .find((token) => token.pos === "NOUN" || token.pos === "PROPN");
      if (!headToken || GENERIC_CHUNK_HEADS.has(headToken.normalized)) {
        continue;
      }

      candidates.push(
        buildPhraseCandidate({
          sourceKind: "chunk",
          category: "noun-chunk",
          lane: "grammar-chunk",
          ruleId: "pattern-pos-backed-noun-chunk-v2",
          confidence: Math.min(0.86, 0.76 + Math.max(0, span.length - 4) * 0.03),
          startToken: trimmedStart,
          endToken: endTokenExclusive,
          sourceText,
          tokens
        })
      );
    }
  }

  return candidates;
}

function comparePhraseCandidates(a: PhraseCandidate, b: PhraseCandidate): number {
  if (a.span.startToken !== b.span.startToken) {
    return a.span.startToken - b.span.startToken;
  }

  if (a.span.endToken !== b.span.endToken) {
    return a.span.endToken - b.span.endToken;
  }

  return a.canonicalPhraseKey.localeCompare(b.canonicalPhraseKey);
}

function buildPhraseCandidate(input: {
  sourceKind: PhraseCandidate["sourceKind"];
  category: PhraseCandidate["category"];
  lane: PhraseCandidate["lane"];
  ruleId: string;
  confidence: number;
  startToken: number;
  endToken: number;
  sourceText: string;
  tokens: readonly PhraseToken[];
}): PhraseCandidate {
  const start = input.tokens[input.startToken];
  const end = input.tokens[input.endToken - 1];
  const normalizedSourceText = input.tokens
    .slice(input.startToken, input.endToken)
    .map((token) => token.normalized)
    .join(" ");

  return {
    sourceKind: input.sourceKind,
    category: input.category,
    lane: input.lane,
    ruleId: input.ruleId,
    sourceText: input.sourceText.slice(start.startChar, end.endChar),
    normalizedSourceText,
    canonicalPhraseKey: buildCanonicalPhraseKey(input.sourceKind, normalizedSourceText),
    confidence: input.confidence,
    ruleStrength: input.confidence,
    span: {
      startToken: input.startToken,
      endToken: input.endToken,
      startChar: start.startChar,
      endChar: end.endChar,
      tokenLength: input.endToken - input.startToken
    }
  };
}

function isLibraryChunkShellToken(pos: string): boolean {
  return (
    pos === "DET" ||
    pos === "ADJ" ||
    pos === "NOUN" ||
    pos === "PROPN" ||
    pos === "PREP" ||
    pos === "AUX"
  );
}

function alignLibraryTokens(
  sourceText: string,
  libraryTokens: Array<{
    surface: string;
    normalized?: string;
    pos?: string;
  }>
): PhraseToken[] {
  const baseTokens = tokenizeForLookup(sourceText);
  const filteredLibraryTokens = libraryTokens.filter(
    (token) => normalizeToken(token.surface).length > 0
  );
  const tokenCount = Math.min(baseTokens.length, filteredLibraryTokens.length);
  const aligned: PhraseToken[] = [];

  for (let index = 0; index < tokenCount; index += 1) {
    const baseToken = baseTokens[index];
    const libraryToken = filteredLibraryTokens[index];
    aligned.push({
      index,
      surface: baseToken.raw,
      normalized: normalizeToken(libraryToken.normalized ?? baseToken.normalized) || baseToken.normalized,
      lemma: normalizeToken(libraryToken.normalized ?? baseToken.normalized) || baseToken.normalized,
      pos: libraryToken.pos ?? "X",
      startChar: baseToken.start,
      endChar: baseToken.end
    });
  }

  if (aligned.length === baseTokens.length) {
    return aligned;
  }

  for (let index = aligned.length; index < baseTokens.length; index += 1) {
    const baseToken = baseTokens[index];
    aligned.push({
      index,
      surface: baseToken.raw,
      normalized: baseToken.normalized,
      lemma: baseToken.normalized,
      pos: "X",
      startChar: baseToken.start,
      endChar: baseToken.end
    });
  }

  return aligned;
}

function extractCompromiseTerms(raw: unknown): Array<{
  surface: string;
  normalized?: string;
  pos?: string;
}> {
  const terms: Array<{
    surface: string;
    normalized?: string;
    pos?: string;
  }> = [];

  if (!Array.isArray(raw)) {
    return terms;
  }

  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const record = item as UnknownRecord;
    const nestedTerms = record.terms;

    if (Array.isArray(nestedTerms)) {
      for (const nestedTerm of nestedTerms) {
        appendCompromiseTerm(terms, nestedTerm);
      }
      continue;
    }

    appendCompromiseTerm(terms, item);
  }

  return terms;
}

function appendCompromiseTerm(
  terms: Array<{
    surface: string;
    normalized?: string;
    pos?: string;
  }>,
  raw: unknown
) {
  if (!raw || typeof raw !== "object") {
    return;
  }

  const record = raw as UnknownRecord;
  const surface = typeof record.text === "string" ? record.text : null;
  if (!surface) {
    return;
  }

  const tags = normalizeCompromiseTags(record.tags);
  terms.push({
    surface,
    normalized: normalizeToken(surface),
    pos: normalizeCompromisePos(surface, tags)
  });
}

function normalizeCompromiseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((entry): entry is string => typeof entry === "string");
  }

  if (raw && typeof raw === "object") {
    return Object.keys(raw as UnknownRecord);
  }

  return [];
}

function normalizeCompromisePos(surface: string, tags: string[]): string {
  const normalizedSurface = normalizeToken(surface);
  const normalizedTags = tags.map((tag) => tag.toLowerCase());

  if (normalizedSurface === "to") {
    return "PART";
  }

  if (normalizedTags.some((tag) => tag.includes("propernoun") || tag.includes("person"))) {
    return "PROPN";
  }

  if (normalizedTags.some((tag) => tag.includes("pronoun"))) {
    return "PRON";
  }

  if (normalizedTags.some((tag) => tag.includes("determiner") || tag.includes("article"))) {
    return "DET";
  }

  if (normalizedTags.some((tag) => tag.includes("preposition"))) {
    return "PREP";
  }

  if (normalizedTags.some((tag) => tag.includes("adjective"))) {
    return "ADJ";
  }

  if (normalizedTags.some((tag) => tag.includes("adverb"))) {
    return "ADV";
  }

  if (normalizedTags.some((tag) => tag.includes("verb"))) {
    return AUXILIARY_FORMS.has(normalizedSurface) ? "AUX" : "VERB";
  }

  if (normalizedTags.some((tag) => tag.includes("noun"))) {
    return "NOUN";
  }

  return "X";
}

function normalizeWinkPos(surface: string, rawPos: string | undefined): string {
  const normalizedSurface = normalizeToken(surface);
  const lower = typeof rawPos === "string" ? rawPos.toLowerCase() : "";
  const upper = typeof rawPos === "string" ? rawPos.toUpperCase() : "";

  if (upper === "PROPN") {
    return "PROPN";
  }

  if (upper === "NOUN") {
    return "NOUN";
  }

  if (upper === "ADJ") {
    return "ADJ";
  }

  if (upper === "ADV") {
    return "ADV";
  }

  if (upper === "DET") {
    return "DET";
  }

  if (upper === "PRON") {
    return "PRON";
  }

  if (upper === "AUX") {
    return "AUX";
  }

  if (upper === "VERB") {
    return AUXILIARY_FORMS.has(normalizedSurface) ? "AUX" : "VERB";
  }

  if (upper === "ADP") {
    return normalizedSurface === "to" ? "PART" : "PREP";
  }

  if (upper === "PART") {
    return "PART";
  }

  if (normalizedSurface === "to" || lower === "to") {
    return "PART";
  }

  if (lower.startsWith("nnp")) {
    return "PROPN";
  }

  if (lower.startsWith("nn")) {
    return "NOUN";
  }

  if (lower.startsWith("jj")) {
    return "ADJ";
  }

  if (lower.startsWith("rb")) {
    return "ADV";
  }

  if (lower.startsWith("dt") || lower === "pdt" || lower === "wdt") {
    return "DET";
  }

  if (lower.startsWith("prp") || lower === "wp") {
    return "PRON";
  }

  if (lower === "md") {
    return "AUX";
  }

  if (lower.startsWith("vb")) {
    return AUXILIARY_FORMS.has(normalizedSurface) ? "AUX" : "VERB";
  }

  if (lower === "in") {
    return "PREP";
  }

  return "X";
}

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

async function loadCompromiseThreeModule(): Promise<{
  default: (text: string) => CompromiseDoc;
}> {
  if (!compromiseThreeModulePromise) {
    compromiseThreeModulePromise = import("compromise/three") as Promise<{
      default: (text: string) => CompromiseDoc;
    }>;
  }

  return compromiseThreeModulePromise;
}

async function loadWinkNlpEngine(): Promise<{
  its: {
    normal: unknown;
    pos: unknown;
  };
  readDoc: (input: string) => {
    tokens: () => {
      out: (kind?: unknown) => unknown;
    };
  };
}> {
  if (!winkNlpEnginePromise) {
    winkNlpEnginePromise = (async () => {
      const winkModule = (await import("wink-nlp")) as {
        default: (model: unknown) => {
          its: {
            normal: unknown;
            pos: unknown;
          };
          readDoc: (input: string) => {
            tokens: () => {
              out: (kind?: unknown) => unknown;
            };
          };
        };
      };
      const modelModule = (await import("wink-eng-lite-web-model")) as {
        default: unknown;
      };

      return winkModule.default(modelModule.default);
    })();
  }

  return winkNlpEnginePromise;
}
