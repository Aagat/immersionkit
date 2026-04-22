import { normalizeToken } from "../../text/normalize";
import { tokenizeForLookup } from "../../text/tokenize";
import {
  FIXED_PHRASE_LEXICON,
  type FixedPhraseLexiconEntry
} from "./fixed-phrases";
import type {
  PhraseCandidate,
  PhraseChunkAnnotation,
  PhraseDetectionResult,
  PhraseGoldCase,
  PhraseSourceKind,
  PhraseToken
} from "./types";

const BE_FORMS = new Set(["am", "is", "are", "was", "were", "be", "been", "being"]);
const HAVE_FORMS = new Set(["have", "has", "had"]);
const PREPOSITIONS = new Set(["of", "for", "in", "on", "to", "with", "from", "at"]);
const GENERIC_CHUNK_HEADS = new Set([
  "thing",
  "things",
  "stuff",
  "someone",
  "something",
  "anything"
]);

const SOURCE_PRIORITY: Record<PhraseSourceKind, number> = {
  "fixed-phrase": 3,
  chunk: 2,
  "pattern-match": 1
};

type BuildCandidateInput = {
  sourceKind: PhraseSourceKind;
  category: PhraseCandidate["category"];
  lane: PhraseCandidate["lane"];
  ruleId: string;
  confidence: number;
  startToken: number;
  endToken: number;
  sourceText: string;
  tokens: readonly PhraseToken[];
};

export function buildCanonicalPhraseKey(
  sourceKind: PhraseSourceKind,
  normalizedSourceText: string
): string {
  const slug = normalizedSourceText
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `phrase:${sourceKind}:${slug}`;
}

export function materializePhraseTokens(
  sourceText: string,
  annotations: PhraseGoldCase["tokens"]
): PhraseToken[] {
  const tokenized = tokenizeForLookup(sourceText);

  if (tokenized.length !== annotations.length) {
    throw new Error(
      `Token annotation mismatch. Expected ${annotations.length} tokens, got ${tokenized.length} for sentence: "${sourceText}"`
    );
  }

  return annotations.map((annotation, index) => {
    const token = tokenized[index];
    const annotationSurface = normalizeToken(annotation.surface);

    if (annotationSurface && annotationSurface !== token.normalized) {
      throw new Error(
        `Token surface mismatch at index ${index}. Annotation "${annotation.surface}" does not align with "${token.raw}" in sentence: "${sourceText}"`
      );
    }

    const annotationNormalized = annotation.normalized
      ? normalizeToken(annotation.normalized)
      : undefined;
    if (annotationNormalized && annotationNormalized !== token.normalized) {
      throw new Error(
        `Token normalized mismatch at index ${index}. Annotation "${annotation.normalized}" does not align with runtime normalized token "${token.normalized}" in sentence: "${sourceText}"`
      );
    }

    return {
      index,
      surface: token.raw,
      normalized: token.normalized,
      lemma: annotation.lemma ? normalizeToken(annotation.lemma) : token.normalized,
      pos: annotation.pos,
      startChar: token.start,
      endChar: token.end
    };
  });
}

export function detectPhraseCandidates(
  phraseCase: PhraseGoldCase,
  lexicon: readonly FixedPhraseLexiconEntry[] = FIXED_PHRASE_LEXICON
): PhraseDetectionResult {
  const tokens = materializePhraseTokens(phraseCase.sourceText, phraseCase.tokens);
  const fixedLaneCandidates = detectFixedPhraseLane(phraseCase.sourceText, tokens, lexicon);
  const grammarLaneCandidates = [
    ...detectGrammarCarrierPatterns(phraseCase.sourceText, tokens),
    ...detectAdjectiveNounPatterns(phraseCase.sourceText, tokens),
    ...detectCoherentChunks(phraseCase.sourceText, tokens, phraseCase.chunks ?? [])
  ];
  const allCandidates = [...fixedLaneCandidates, ...grammarLaneCandidates].sort(
    compareBySpan
  );
  const selectedCandidates = resolveOverlaps(allCandidates);

  return {
    allCandidates,
    selectedCandidates
  };
}

function detectFixedPhraseLane(
  sourceText: string,
  tokens: readonly PhraseToken[],
  lexicon: readonly FixedPhraseLexiconEntry[]
): PhraseCandidate[] {
  const candidates: PhraseCandidate[] = [];

  for (const phrase of lexicon) {
    if (phrase.normalizedTokens.length === 0 || phrase.normalizedTokens.length > tokens.length) {
      continue;
    }

    const phraseLength = phrase.normalizedTokens.length;
    for (let startToken = 0; startToken <= tokens.length - phraseLength; startToken += 1) {
      let matched = true;
      for (let offset = 0; offset < phraseLength; offset += 1) {
        if (tokens[startToken + offset].normalized !== phrase.normalizedTokens[offset]) {
          matched = false;
          break;
        }
      }

      if (!matched) {
        continue;
      }

      candidates.push(
        buildPhraseCandidate({
          sourceKind: "fixed-phrase",
          category: phrase.category,
          lane: "fixed",
          ruleId: phrase.phraseId,
          confidence: phrase.confidence,
          startToken,
          endToken: startToken + phraseLength,
          sourceText,
          tokens
        })
      );
    }
  }

  return candidates;
}

function detectGrammarCarrierPatterns(
  sourceText: string,
  tokens: readonly PhraseToken[]
): PhraseCandidate[] {
  const candidates: PhraseCandidate[] = [];

  for (let index = 0; index < tokens.length - 1; index += 1) {
    const currentToken = tokens[index];
    const nextToken = tokens[index + 1];
    const previousToken = index > 0 ? tokens[index - 1] : undefined;
    const trailingToken = index + 2 < tokens.length ? tokens[index + 2] : undefined;

    if (
      currentToken.normalized === "going" &&
      nextToken.normalized === "to" &&
      previousToken &&
      BE_FORMS.has(previousToken.normalized) &&
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
      trailingToken?.pos === "VERB"
    ) {
      candidates.push(
        buildPhraseCandidate({
          sourceKind: "pattern-match",
          category: "grammar-carrier",
          lane: "grammar-chunk",
          ruleId: "pattern-used-to-v1",
          confidence: 0.87,
          startToken: index,
          endToken: index + 2,
          sourceText,
          tokens
        })
      );
    }

    if (
      HAVE_FORMS.has(currentToken.normalized) &&
      nextToken.normalized === "been" &&
      trailingToken &&
      (trailingToken.pos === "VERB" ||
        trailingToken.pos === "ADJ" ||
        trailingToken.normalized === "to")
    ) {
      candidates.push(
        buildPhraseCandidate({
          sourceKind: "pattern-match",
          category: "grammar-carrier",
          lane: "grammar-chunk",
          ruleId: "pattern-have-been-v1",
          confidence: 0.84,
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

function detectAdjectiveNounPatterns(
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
        ruleId: "pattern-adjective-noun-shell-v1",
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

function detectCoherentChunks(
  sourceText: string,
  tokens: readonly PhraseToken[],
  chunks: readonly PhraseChunkAnnotation[]
): PhraseCandidate[] {
  const candidates: PhraseCandidate[] = [];

  for (const chunk of chunks) {
    if (chunk.kind !== "noun-chunk") {
      continue;
    }

    const startToken = Math.max(0, chunk.startToken);
    const endToken = Math.min(tokens.length, chunk.endToken);
    const tokenLength = endToken - startToken;

    if (tokenLength < 3) {
      continue;
    }

    const chunkTokens = tokens.slice(startToken, endToken);
    const nounCount = chunkTokens.filter(
      (token) => token.pos === "NOUN" || token.pos === "PROPN"
    ).length;
    const containsPronoun = chunkTokens.some((token) => token.pos === "PRON");
    const containsConnector = chunkTokens.some((token) =>
      PREPOSITIONS.has(token.normalized)
    );
    const headToken = chunkTokens.find(
      (token) => token.pos === "NOUN" || token.pos === "PROPN"
    );

    if (containsPronoun || nounCount < 2 || !headToken) {
      continue;
    }

    if (GENERIC_CHUNK_HEADS.has(headToken.normalized)) {
      continue;
    }

    if (!containsConnector && tokenLength < 4) {
      continue;
    }

    const confidence = Math.min(
      0.91,
      0.76 + Math.max(0, tokenLength - 3) * 0.03 + (containsConnector ? 0.03 : 0)
    );

    candidates.push(
      buildPhraseCandidate({
        sourceKind: "chunk",
        category: "noun-chunk",
        lane: "grammar-chunk",
        ruleId: "chunk-noun-coherent-v1",
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

function buildPhraseCandidate(input: BuildCandidateInput): PhraseCandidate {
  const start = input.tokens[input.startToken];
  const end = input.tokens[input.endToken - 1];
  const normalizedSourceText = input.tokens
    .slice(input.startToken, input.endToken)
    .map((token) => token.normalized)
    .join(" ");
  const canonicalPhraseKey = buildCanonicalPhraseKey(
    input.sourceKind,
    normalizedSourceText
  );

  return {
    sourceKind: input.sourceKind,
    category: input.category,
    lane: input.lane,
    ruleId: input.ruleId,
    sourceText: input.sourceText.slice(start.startChar, end.endChar),
    normalizedSourceText,
    canonicalPhraseKey,
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

function compareBySpan(a: PhraseCandidate, b: PhraseCandidate): number {
  if (a.span.startToken !== b.span.startToken) {
    return a.span.startToken - b.span.startToken;
  }

  return a.span.endToken - b.span.endToken;
}

function compareForSelection(a: PhraseCandidate, b: PhraseCandidate): number {
  if (a.confidence !== b.confidence) {
    return b.confidence - a.confidence;
  }

  if (a.span.tokenLength !== b.span.tokenLength) {
    return b.span.tokenLength - a.span.tokenLength;
  }

  if (a.sourceKind !== b.sourceKind) {
    return SOURCE_PRIORITY[b.sourceKind] - SOURCE_PRIORITY[a.sourceKind];
  }

  if (a.span.startToken !== b.span.startToken) {
    return a.span.startToken - b.span.startToken;
  }

  return a.span.endToken - b.span.endToken;
}

function overlaps(a: PhraseCandidate, b: PhraseCandidate): boolean {
  return a.span.startToken < b.span.endToken && b.span.startToken < a.span.endToken;
}

function resolveOverlaps(candidates: readonly PhraseCandidate[]): PhraseCandidate[] {
  const selected: PhraseCandidate[] = [];
  const candidatesByPriority = [...candidates].sort(compareForSelection);

  for (const candidate of candidatesByPriority) {
    const hasOverlap = selected.some((existing) => overlaps(existing, candidate));
    if (!hasOverlap) {
      selected.push(candidate);
    }
  }

  return selected.sort(compareBySpan);
}
