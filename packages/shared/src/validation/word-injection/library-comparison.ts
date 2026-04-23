/// <reference path="./third-party-modules.d.ts" />

import { normalizeToken } from "../../text/normalize";
import { tokenizeForLookup } from "../../text/tokenize";
import { evaluateWordInjectionCorpus } from "./evaluator";
import type {
  ContextChunkType,
  ContextualWordCandidate,
  ObservedContextPos,
  WordInjectionLibraryComparison
} from "./types";

type ParserToken = {
  surface: string;
  normalized: string;
  pos: ObservedContextPos;
  startChar: number;
  endChar: number;
};

type ParserTokenSource = {
  surface: string;
  normalized?: string;
  pos?: ObservedContextPos;
};

type WordInjectionLibraryImplementation = {
  implementationId: WordInjectionLibraryComparison["implementationId"];
  label: string;
  inputMode: WordInjectionLibraryComparison["inputMode"];
  parseSentence: (sentence: string) => Promise<ParserToken[]>;
};

type UnknownRecord = Record<string, unknown>;

type CompromiseDoc = {
  terms?: () => {
    json?: () => unknown;
  };
};

const MODAL_FORMS = new Set([
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
  "did"
]);

const DETERMINERS = new Set(["a", "an", "the"]);
const DEMONSTRATIVES = new Set(["this", "that", "these", "those"]);
const SUBJECT_PRONOUNS = new Set(["i", "you", "we", "they", "he", "she", "it"]);
const POSSESSIVES = new Set(["my", "your", "his", "her", "our", "their"]);
const QUANTIFIERS = new Set(["each", "every", "many", "several"]);
const PREPOSITIONS = new Set([
  "at",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "over",
  "past",
  "through",
  "to",
  "under",
  "with"
]);
const LINKING_VERBS = new Set([
  "am",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "feel",
  "feels",
  "felt",
  "seem",
  "seems",
  "seemed",
  "become",
  "becomes",
  "became",
  "keep",
  "keeps",
  "kept"
]);
const MOVEMENT_VERBS = new Set(["turn", "walk", "go", "head", "move"]);

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

export async function runWordInjectionLibraryComparisons(
  candidates: ContextualWordCandidate[],
  includeWinkNlp = true
): Promise<WordInjectionLibraryComparison[]> {
  const implementations = listWordInjectionLibraryImplementations(includeWinkNlp);
  const results: WordInjectionLibraryComparison[] = [];

  for (const implementation of implementations) {
    const derivedCandidates = await Promise.all(
      candidates.map((candidate) => deriveCandidate(candidate, implementation))
    );
    const runtime = await measureImplementationRuntime(candidates, implementation);
    const featureAgreement = buildFeatureAgreement(candidates, derivedCandidates);

    results.push({
      implementationId: implementation.implementationId,
      label: implementation.label,
      inputMode: implementation.inputMode,
      runtime,
      featureAgreement,
      summary: evaluateWordInjectionCorpus(derivedCandidates)
    });
  }

  return results;
}

function listWordInjectionLibraryImplementations(
  includeWinkNlp: boolean
): WordInjectionLibraryImplementation[] {
  const implementations: WordInjectionLibraryImplementation[] = [
    {
      implementationId: "shared-annotated",
      label: "Shared annotated features",
      inputMode: "fixture-annotated",
      parseSentence: async (sentence) =>
        alignParserTokens(
          sentence,
          tokenizeForLookup(sentence).map((token) => ({
            surface: token.raw,
            normalized: token.normalized,
            pos: "other" as ObservedContextPos
          }))
        )
    },
    {
      implementationId: "compromise-three",
      label: "compromise/three derived features",
      inputMode: "library-derived",
      parseSentence: async (sentence) => {
        const module = await loadCompromiseThreeModule();
        const doc = module.default(sentence);
        return alignParserTokens(sentence, extractCompromiseTerms(doc.terms?.()?.json?.()));
      }
    }
  ];

  if (includeWinkNlp) {
    implementations.push({
      implementationId: "wink-nlp",
      label: "wink-nlp derived features",
      inputMode: "library-derived",
      parseSentence: async (sentence) => {
        const winkNlp = await loadWinkNlpEngine();
        const doc = winkNlp.readDoc(sentence);
        const cursor = doc.tokens();
        const raw = safeStringArray(cursor.out());
        const normal = safeStringArray(cursor.out(winkNlp.its.normal));
        const pos = safeStringArray(cursor.out(winkNlp.its.pos));

        return alignParserTokens(
          sentence,
          raw.map((surface, index) => ({
            surface,
            normalized: normalizeToken(normal[index] ?? surface),
            pos: normalizeWinkObservedPos(surface, pos[index])
          }))
        );
      }
    });
  }

  return implementations;
}

async function deriveCandidate(
  candidate: ContextualWordCandidate,
  implementation: WordInjectionLibraryImplementation
): Promise<ContextualWordCandidate> {
  if (implementation.implementationId === "shared-annotated") {
    return candidate;
  }

  const tokens = await implementation.parseSentence(candidate.sentence);
  const targetIndex = findTargetTokenIndex(tokens, candidate.tokenText);

  if (targetIndex < 0) {
    return {
      ...candidate,
      observedPos: "other",
      chunkType: "other",
      nearbyContextSignature: []
    };
  }

  const observedPos = refineObservedPos(candidate, tokens, targetIndex, tokens[targetIndex].pos);
  const chunkType = deriveChunkType(candidate, tokens, targetIndex, observedPos);
  const nearbyContextSignature = deriveContextSignatures(
    candidate,
    tokens,
    targetIndex,
    observedPos
  );

  return {
    ...candidate,
    observedPos,
    chunkType,
    nearbyContextSignature
  };
}

function refineObservedPos(
  candidate: ContextualWordCandidate,
  tokens: readonly ParserToken[],
  targetIndex: number,
  observedPos: ObservedContextPos
): ObservedContextPos {
  const previousToken = targetIndex > 0 ? tokens[targetIndex - 1] : undefined;
  const nextToken = targetIndex + 1 < tokens.length ? tokens[targetIndex + 1] : undefined;
  const nextTwo = targetIndex + 2 < tokens.length ? tokens[targetIndex + 2] : undefined;

  if (candidate.candidatePos === "noun") {
    const hasNounCue = previousToken
      ? DETERMINERS.has(previousToken.normalized) ||
        DEMONSTRATIVES.has(previousToken.normalized) ||
        POSSESSIVES.has(previousToken.normalized) ||
        QUANTIFIERS.has(previousToken.normalized) ||
        previousToken.pos === "noun"
      : false;

    if (
      hasNounCue &&
      nextToken &&
      (nextToken.pos === "verb" ||
        nextToken.pos === "auxiliary" ||
        LINKING_VERBS.has(nextToken.normalized))
    ) {
      return "noun";
    }
  }

  if (candidate.candidatePos === "adjective") {
    if (nextToken?.pos === "noun") {
      return "adjective";
    }

    if (previousToken && LINKING_VERBS.has(previousToken.normalized)) {
      return "adjective";
    }

    if (nextToken?.normalized === "and" && nextTwo?.pos === "adjective") {
      return "adjective";
    }

    if (
      previousToken?.pos === "noun" &&
      hasPosWithinWindow(tokens, Math.max(0, targetIndex - 3), targetIndex - 1, [
        "verb",
        "auxiliary"
      ])
    ) {
      return "adjective";
    }
  }

  return observedPos;
}

function buildFeatureAgreement(
  annotated: ContextualWordCandidate[],
  derived: ContextualWordCandidate[]
): WordInjectionLibraryComparison["featureAgreement"] {
  let observedPosMatches = 0;
  let chunkTypeMatches = 0;
  let exactSignatureMatches = 0;

  for (let index = 0; index < annotated.length; index += 1) {
    const original = annotated[index];
    const extracted = derived[index];

    if (original.observedPos === extracted.observedPos) {
      observedPosMatches += 1;
    }

    if (original.chunkType === extracted.chunkType) {
      chunkTypeMatches += 1;
    }

    const originalSignatures = [...original.nearbyContextSignature].sort().join("|");
    const extractedSignatures = [...extracted.nearbyContextSignature].sort().join("|");
    if (originalSignatures === extractedSignatures) {
      exactSignatureMatches += 1;
    }
  }

  return {
    caseCount: annotated.length,
    observedPosMatchRate: observedPosMatches / Math.max(annotated.length, 1),
    chunkTypeMatchRate: chunkTypeMatches / Math.max(annotated.length, 1),
    exactSignatureMatchRate: exactSignatureMatches / Math.max(annotated.length, 1)
  };
}

async function measureImplementationRuntime(
  candidates: ContextualWordCandidate[],
  implementation: WordInjectionLibraryImplementation
): Promise<WordInjectionLibraryComparison["runtime"]> {
  const repeatCount = 25;
  const startedAt = Date.now();

  for (let repetition = 0; repetition < repeatCount; repetition += 1) {
    for (const candidate of candidates) {
      await deriveCandidate(candidate, implementation);
    }
  }

  const totalMs = Math.max(Date.now() - startedAt, 1);
  const totalCaseRuns = candidates.length * repeatCount;

  return {
    totalMs,
    averageCaseMs: totalMs / totalCaseRuns,
    casesPerSecond: totalCaseRuns / Math.max(totalMs / 1000, 0.001),
    repeatCount
  };
}

function deriveChunkType(
  candidate: ContextualWordCandidate,
  tokens: readonly ParserToken[],
  targetIndex: number,
  observedPos: ObservedContextPos
): ContextChunkType {
  const token = tokens[targetIndex];
  const previousToken = targetIndex > 0 ? tokens[targetIndex - 1] : undefined;
  const nextToken = targetIndex + 1 < tokens.length ? tokens[targetIndex + 1] : undefined;

  if (isHyphenated(candidate.sentence, token)) {
    return "idiom";
  }

  if (
    candidate.candidateLemma === "light" &&
    previousToken?.normalized &&
    ["make", "made", "makes"].includes(previousToken.normalized) &&
    nextToken?.normalized === "of"
  ) {
    return "idiom";
  }

  if (
    candidate.candidateLemma === "watch" &&
    nextToken?.normalized === "out" &&
    targetIndex === 0
  ) {
    return "idiom";
  }

  if (candidate.candidateLemma === "right" && targetIndex === 0 && hasCommaAfter(candidate.sentence, token)) {
    return "fragment";
  }

  if (observedPos === "noun") {
    return "noun-phrase";
  }

  if (observedPos === "adjective") {
    return "adjective-phrase";
  }

  if (observedPos === "adverb") {
    return "adverb-phrase";
  }

  if (observedPos === "verb" || observedPos === "modal" || observedPos === "auxiliary") {
    return "verb-phrase";
  }

  return "other";
}

function deriveContextSignatures(
  candidate: ContextualWordCandidate,
  tokens: readonly ParserToken[],
  targetIndex: number,
  observedPos: ObservedContextPos
): string[] {
  const signatures = new Set<string>();
  const token = tokens[targetIndex];
  const previousToken = targetIndex > 0 ? tokens[targetIndex - 1] : undefined;
  const nextToken = targetIndex + 1 < tokens.length ? tokens[targetIndex + 1] : undefined;
  const nextTwo = targetIndex + 2 < tokens.length ? tokens[targetIndex + 2] : undefined;

  if (previousToken && DETERMINERS.has(previousToken.normalized)) {
    signatures.add("determiner-before");
  }

  if (previousToken && DEMONSTRATIVES.has(previousToken.normalized)) {
    signatures.add("demonstrative-before");
  }

  if (
    observedPos === "noun" &&
    candidate.tokenText.toLowerCase().endsWith("s") &&
    normalizeToken(candidate.tokenText) !== candidate.candidateLemma
  ) {
    signatures.add("plural-morphology");
  }

  if (
    observedPos === "noun" &&
    nextToken &&
    (nextToken.pos === "verb" || nextToken.pos === "auxiliary")
  ) {
    signatures.add("noun-head-subject");
  }

  if (observedPos === "modal" && nextToken?.pos === "verb") {
    signatures.add("modal-before-base-verb");
  }

  if (observedPos === "modal" && targetIndex === 0) {
    signatures.add("sentence-initial-modal-question");
  }

  if (isHyphenated(candidate.sentence, token)) {
    signatures.add(
      candidate.candidateLemma === "plant" ? "hyphenated-compound-adjective" : "hyphenated-idiom"
    );
  }

  if (previousToken && SUBJECT_PRONOUNS.has(previousToken.normalized)) {
    signatures.add("subject-pronoun-before");
  }

  if (observedPos === "verb" && previousToken && SUBJECT_PRONOUNS.has(previousToken.normalized)) {
    signatures.add("finite-verb-head");
  }

  if (previousToken && POSSESSIVES.has(previousToken.normalized)) {
    signatures.add("possessive-before");
  }

  if (nextToken?.pos === "adverb") {
    signatures.add("adverb-after");
  }

  if (observedPos === "noun" && nextToken && PREPOSITIONS.has(nextToken.normalized)) {
    signatures.add("pp-attachment-after");
  }

  if (previousToken?.pos === "noun") {
    signatures.add("noun-compound-before");
  }

  if (targetIndex === 0 && (observedPos === "verb" || observedPos === "modal")) {
    signatures.add("imperative-head");
  }

  if (nextToken?.normalized === "out") {
    signatures.add("phrasal-verb-out");
  }

  if (observedPos === "adjective" && previousToken && LINKING_VERBS.has(previousToken.normalized)) {
    signatures.add("predicative-after-linking-verb");
  }

  if (observedPos === "adjective" && nextToken?.pos === "noun") {
    signatures.add("attributive-before-noun");
  }

  if (
    observedPos === "noun" &&
    previousToken &&
    (DETERMINERS.has(previousToken.normalized) ||
      DEMONSTRATIVES.has(previousToken.normalized) ||
      POSSESSIVES.has(previousToken.normalized)) &&
    hasPosWithinWindow(tokens, Math.max(0, targetIndex - 3), targetIndex, [
      "verb",
      "modal",
      "auxiliary"
    ])
  ) {
    signatures.add("verb-object-noun");
  }

  if (
    candidate.candidateLemma === "light" &&
    previousToken &&
    ["make", "made", "makes"].includes(previousToken.normalized) &&
    nextToken?.normalized === "of"
  ) {
    signatures.add("idiom-make-light-of");
  }

  if (
    observedPos === "adjective" &&
    previousToken?.pos === "noun" &&
    hasPosWithinWindow(tokens, Math.max(0, targetIndex - 3), targetIndex - 1, [
      "verb",
      "auxiliary"
    ])
  ) {
    signatures.add("object-complement-adjective");
  }

  if (observedPos === "adjective" && nextToken?.normalized === "and" && nextTwo?.pos === "adjective") {
    signatures.add("adjective-coordination");
  }

  if (
    observedPos === "adverb" &&
    previousToken &&
    MOVEMENT_VERBS.has(previousToken.normalized)
  ) {
    signatures.add("directional-adverb");
  }

  if (candidate.candidateLemma === "right" && observedPos === "noun" && nextToken?.normalized === "to") {
    signatures.add("noun-right-idiom");
  }

  if (observedPos === "adverb" && nextToken && PREPOSITIONS.has(nextToken.normalized)) {
    signatures.add("degree-adverb-before-preposition");
  }

  if (candidate.candidateLemma === "right" && targetIndex === 0 && hasCommaAfter(candidate.sentence, token)) {
    signatures.add("discourse-marker-sentence-initial");
  }

  if (previousToken && QUANTIFIERS.has(previousToken.normalized)) {
    signatures.add("quantifier-before");
  }

  if (observedPos === "verb" && previousToken && SUBJECT_PRONOUNS.has(previousToken.normalized)) {
    signatures.add("present-tense-verb");
  }

  if (observedPos === "noun" && previousToken?.pos === "adjective") {
    signatures.add("noun-compound-after-adjective");
  }

  if (
    candidate.candidateLemma === "plant" &&
    observedPos === "verb" &&
    nextToken &&
    (DETERMINERS.has(nextToken.normalized) ||
      DEMONSTRATIVES.has(nextToken.normalized) ||
      nextToken.pos === "noun")
  ) {
    signatures.add("verb-object-frame");
  }

  return Array.from(signatures).sort();
}

function findTargetTokenIndex(tokens: readonly ParserToken[], tokenText: string): number {
  const normalizedTarget = normalizeToken(tokenText);

  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index].normalized === normalizedTarget) {
      return index;
    }
  }

  return -1;
}

function isHyphenated(sentence: string, token: ParserToken): boolean {
  const before = sentence[token.startChar - 1] ?? "";
  const after = sentence[token.endChar] ?? "";
  return before === "-" || after === "-";
}

function hasCommaAfter(sentence: string, token: ParserToken): boolean {
  return sentence[token.endChar] === ",";
}

function hasPosWithinWindow(
  tokens: readonly ParserToken[],
  startIndex: number,
  endIndex: number,
  posValues: readonly ObservedContextPos[]
): boolean {
  if (endIndex <= startIndex) {
    return false;
  }

  const allowed = new Set(posValues);
  for (let index = startIndex; index < endIndex; index += 1) {
    if (allowed.has(tokens[index].pos)) {
      return true;
    }
  }

  return false;
}

function alignParserTokens(
  sentence: string,
  sourceTokens: ParserTokenSource[]
): ParserToken[] {
  const baseTokens = tokenizeForLookup(sentence);
  const filteredSourceTokens = sourceTokens.filter(
    (token) => normalizeToken(token.surface).length > 0
  );
  const tokenCount = Math.min(baseTokens.length, filteredSourceTokens.length);
  const aligned: ParserToken[] = [];

  for (let index = 0; index < tokenCount; index += 1) {
    const baseToken = baseTokens[index];
    const sourceToken = filteredSourceTokens[index];

    aligned.push({
      surface: baseToken.raw,
      normalized:
        normalizeToken(sourceToken.normalized ?? sourceToken.surface) || baseToken.normalized,
      pos: sourceToken.pos ?? "other",
      startChar: baseToken.start,
      endChar: baseToken.end
    });
  }

  for (let index = tokenCount; index < baseTokens.length; index += 1) {
    const baseToken = baseTokens[index];
    aligned.push({
      surface: baseToken.raw,
      normalized: baseToken.normalized,
      pos: "other",
      startChar: baseToken.start,
      endChar: baseToken.end
    });
  }

  return aligned;
}

function extractCompromiseTerms(raw: unknown): ParserTokenSource[] {
  const terms: ParserTokenSource[] = [];

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

function appendCompromiseTerm(terms: ParserTokenSource[], raw: unknown) {
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
    pos: normalizeCompromiseObservedPos(surface, tags)
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

function normalizeCompromiseObservedPos(
  surface: string,
  tags: string[]
): ObservedContextPos {
  const normalizedSurface = normalizeToken(surface);
  const normalizedTags = tags.map((tag) => tag.toLowerCase());

  if (MODAL_FORMS.has(normalizedSurface)) {
    return "modal";
  }

  if (AUXILIARY_FORMS.has(normalizedSurface)) {
    return "auxiliary";
  }

  if (normalizedTags.some((tag) => tag.includes("adjective"))) {
    return "adjective";
  }

  if (normalizedTags.some((tag) => tag.includes("adverb"))) {
    return "adverb";
  }

  if (normalizedTags.some((tag) => tag.includes("noun"))) {
    return "noun";
  }

  if (normalizedTags.some((tag) => tag.includes("verb"))) {
    return "verb";
  }

  return "other";
}

function normalizeWinkObservedPos(
  surface: string,
  rawPos: string | undefined
): ObservedContextPos {
  const normalizedSurface = normalizeToken(surface);
  const lower = typeof rawPos === "string" ? rawPos.toLowerCase() : "";
  const upper = typeof rawPos === "string" ? rawPos.toUpperCase() : "";

  if (upper === "ADJ") {
    return "adjective";
  }

  if (upper === "ADV") {
    return "adverb";
  }

  if (upper === "NOUN" || upper === "PROPN") {
    return "noun";
  }

  if (upper === "INTJ") {
    return "interjection";
  }

  if (upper === "AUX") {
    return MODAL_FORMS.has(normalizedSurface) ? "modal" : "auxiliary";
  }

  if (upper === "VERB") {
    return MODAL_FORMS.has(normalizedSurface)
      ? "modal"
      : AUXILIARY_FORMS.has(normalizedSurface)
        ? "auxiliary"
        : "verb";
  }

  if (lower === "md") {
    return "modal";
  }

  if (lower.startsWith("jj")) {
    return "adjective";
  }

  if (lower.startsWith("rb")) {
    return "adverb";
  }

  if (lower.startsWith("nn")) {
    return "noun";
  }

  if (lower.startsWith("vb")) {
    return MODAL_FORMS.has(normalizedSurface)
      ? "modal"
      : AUXILIARY_FORMS.has(normalizedSurface)
        ? "auxiliary"
        : "verb";
  }

  return "other";
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
