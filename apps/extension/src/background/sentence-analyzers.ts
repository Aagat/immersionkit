import {
  hashSentence,
  normalizeAnalyzerToken,
  normalizeToken,
  tokenizeForLookup,
  type AnalyzerChunk,
  type AnalyzerId,
  type AnalyzerOutput,
  type AnalyzerToken,
  type GrammarFeatureMatch
} from "@immersionkit/shared";

type WinkNlpEngine = {
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

export type SentenceAnalyzer = {
  readonly analyzerId: AnalyzerId;
  readonly analyzerVersion: string;
  analyze(sentence: string, sentenceHash?: string): AnalyzerOutput | Promise<AnalyzerOutput>;
};

export const WINK_NLP_ANALYZER_VERSION =
  "wink-nlp@2.4.0+immersionkit-background-v1";

let winkAnalyzerPromise: Promise<SentenceAnalyzer> | null = null;

export function getDefaultSentenceAnalyzer(): Promise<SentenceAnalyzer> {
  if (!winkAnalyzerPromise) {
    winkAnalyzerPromise = createWinkNlpSentenceAnalyzer();
  }

  return winkAnalyzerPromise;
}

export async function createWinkNlpSentenceAnalyzer(): Promise<SentenceAnalyzer> {
  const winkModule = (await import("wink-nlp")) as unknown as {
    default: (model: unknown) => WinkNlpEngine;
  };
  const modelModule = (await import("wink-eng-lite-web-model")) as {
    default: unknown;
  };
  const winkNlp = winkModule.default(modelModule.default);

  return {
    analyzerId: "wink-nlp",
    analyzerVersion: WINK_NLP_ANALYZER_VERSION,
    analyze(sentence, sentenceHash = hashSentence(sentence)) {
      const doc = winkNlp.readDoc(sentence);
      const tokenCursor = doc.tokens();
      const tokenTexts = readStringArray(tokenCursor.out());
      const tokenNormals = readStringArray(tokenCursor.out(winkNlp.its.normal));
      const tokenPos = readStringArray(tokenCursor.out(winkNlp.its.pos));
      const tokens = materializeWinkTokens(sentence, tokenTexts, tokenNormals, tokenPos);
      const chunks = detectNounPhraseChunks(sentence, tokens);

      return {
        analyzerId: "wink-nlp",
        analyzerVersion: WINK_NLP_ANALYZER_VERSION,
        sentenceHash,
        sourceText: sentence,
        tokens,
        chunks,
        grammarFeatures: detectGrammarFeatures(sentenceHash, sentence, tokens)
      };
    }
  };
}

function materializeWinkTokens(
  sentence: string,
  tokenTexts: readonly string[],
  tokenNormals: readonly string[],
  tokenPos: readonly string[]
): AnalyzerToken[] {
  if (tokenTexts.length === 0) {
    return tokenizeForLookup(sentence).map((token) =>
      normalizeAnalyzerToken({
        text: token.raw,
        normalized: token.normalized,
        lemma: token.normalized,
        pos: "other",
        tags: [],
        startOffset: token.start,
        endOffset: token.end
      })
    );
  }

  let searchStart = 0;
  return tokenTexts.map((text, index) => {
    const startOffset = findTokenOffset(sentence, text, searchStart);
    const endOffset = startOffset + text.length;
    searchStart = endOffset;
    const rawPos = tokenPos[index] ?? "";
    const normalized = normalizeToken(tokenNormals[index] ?? text);
    const coarsePos = normalizePennTag(rawPos);

    return normalizeAnalyzerToken({
      text,
      normalized,
      lemma: normalized,
      pos: coarsePos,
      tags: rawPos ? [rawPos, coarsePos] : [coarsePos],
      startOffset,
      endOffset
    });
  });
}

function detectNounPhraseChunks(
  sentence: string,
  tokens: readonly AnalyzerToken[]
): AnalyzerChunk[] {
  const chunks: AnalyzerChunk[] = [];
  let index = 0;

  while (index < tokens.length) {
    const token = tokens[index];
    if (!isNounPhraseStartToken(token)) {
      index += 1;
      continue;
    }

    const startToken = index;
    let endToken = index + 1;
    let nounCount = isNounToken(token) ? 1 : 0;
    let containsConnector = false;

    while (endToken < tokens.length && endToken - startToken < 8) {
      const nextToken = tokens[endToken];
      if (!isNounPhraseContinuationToken(nextToken)) {
        break;
      }

      if (isNounToken(nextToken)) {
        nounCount += 1;
      }

      if (nextToken.normalized === "of" || nextToken.normalized === "for") {
        containsConnector = true;
      }

      endToken += 1;
    }

    if (nounCount > 0 && endToken - startToken >= 2) {
      const first = tokens[startToken];
      const last = tokens[endToken - 1];
      chunks.push({
        text: sentence.slice(first.startOffset, last.endOffset),
        normalized: tokens
          .slice(startToken, endToken)
          .map((entry) => entry.normalized)
          .join(" "),
        type: "noun-phrase",
        tokenStart: startToken,
        tokenEnd: endToken,
        confidence: Math.min(
          0.9,
          0.74 + Math.max(0, nounCount - 1) * 0.04 + (containsConnector ? 0.04 : 0)
        )
      });
    }

    index = Math.max(endToken, index + 1);
  }

  return chunks;
}

function detectGrammarFeatures(
  sentenceHash: string,
  sentence: string,
  tokens: readonly AnalyzerToken[]
): GrammarFeatureMatch[] {
  const features: GrammarFeatureMatch[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const nextToken = tokens[index + 1];
    const previousToken = tokens[index - 1];
    const trailingToken = tokens[index + 2];

    if (token.pos === "modal") {
      features.push(
        buildGrammarFeature({
          sentenceHash,
          sentence,
          tokens,
          startToken: index,
          endToken: Math.min(tokens.length, index + 2),
          featureKey: `modal:${token.normalized}`,
          label: "Modal auxiliary",
          category: "modality",
          evidence: ["wink-pos-modal"],
          confidence: 0.86
        })
      );
    }

    if (
      token.normalized === "going" &&
      nextToken?.normalized === "to" &&
      previousToken &&
      BE_FORMS.has(previousToken.normalized) &&
      trailingToken?.pos === "verb"
    ) {
      features.push(
        buildGrammarFeature({
          sentenceHash,
          sentence,
          tokens,
          startToken: index,
          endToken: index + 2,
          featureKey: "future:going-to",
          label: "Going to future",
          category: "tense-aspect",
          evidence: ["be-before", "to-before-verb"],
          confidence: 0.84
        })
      );
    }

    if (
      token.normalized === "used" &&
      nextToken?.normalized === "to" &&
      trailingToken?.pos === "verb"
    ) {
      features.push(
        buildGrammarFeature({
          sentenceHash,
          sentence,
          tokens,
          startToken: index,
          endToken: index + 2,
          featureKey: "aspect:used-to",
          label: "Used to",
          category: "tense-aspect",
          evidence: ["used-to-before-verb"],
          confidence: 0.85
        })
      );
    }

    if (
      HAVE_FORMS.has(token.normalized) &&
      nextToken?.normalized === "been" &&
      trailingToken
    ) {
      features.push(
        buildGrammarFeature({
          sentenceHash,
          sentence,
          tokens,
          startToken: index,
          endToken: index + 2,
          featureKey: "aspect:have-been",
          label: "Have been",
          category: "tense-aspect",
          evidence: ["have-form-before-been"],
          confidence: 0.82
        })
      );
    }
  }

  return features;
}

function buildGrammarFeature(input: {
  sentenceHash: string;
  sentence: string;
  tokens: readonly AnalyzerToken[];
  startToken: number;
  endToken: number;
  featureKey: string;
  label: string;
  category: GrammarFeatureMatch["category"];
  evidence: string[];
  confidence: number;
}): GrammarFeatureMatch {
  const first = input.tokens[input.startToken];
  const last = input.tokens[input.endToken - 1];
  const sourceText = input.sentence.slice(first.startOffset, last.endOffset);

  return {
    featureId: `grammar:${input.featureKey}`,
    featureKey: input.featureKey,
    label: input.label,
    category: input.category,
    sourceText,
    normalizedSourceText: input.tokens
      .slice(input.startToken, input.endToken)
      .map((token) => token.normalized)
      .join(" "),
    span: {
      startToken: input.startToken,
      endToken: input.endToken,
      startChar: first.startOffset,
      endChar: last.endOffset
    },
    evidence: input.evidence,
    confidence: input.confidence
  };
}

function findTokenOffset(sentence: string, tokenText: string, fromIndex: number): number {
  const directIndex = sentence.indexOf(tokenText, fromIndex);
  if (directIndex >= 0) {
    return directIndex;
  }

  const lowerIndex = sentence.toLowerCase().indexOf(tokenText.toLowerCase(), fromIndex);
  return lowerIndex >= 0 ? lowerIndex : fromIndex;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

function normalizePennTag(value: string): string {
  const tag = value.toLowerCase();

  if (tag === "md") {
    return "modal";
  }

  if (tag.startsWith("nn")) {
    return "noun";
  }

  if (tag.startsWith("vb")) {
    return "verb";
  }

  if (tag.startsWith("jj")) {
    return "adjective";
  }

  if (tag.startsWith("rb")) {
    return "adverb";
  }

  if (tag === "dt" || tag === "pdt" || tag === "wdt") {
    return "determiner";
  }

  if (tag === "in" || tag === "to") {
    return "preposition";
  }

  if (tag === "prp" || tag === "prp$" || tag === "wp" || tag === "wp$") {
    return "pronoun";
  }

  return tag || "other";
}

function isNounPhraseStartToken(token: AnalyzerToken): boolean {
  return (
    token.pos === "determiner" ||
    token.pos === "adjective" ||
    token.pos === "noun"
  );
}

function isNounPhraseContinuationToken(token: AnalyzerToken): boolean {
  return (
    token.pos === "determiner" ||
    token.pos === "adjective" ||
    token.pos === "noun" ||
    token.pos === "preposition"
  );
}

function isNounToken(token: AnalyzerToken): boolean {
  return token.pos === "noun";
}

const BE_FORMS = new Set(["am", "is", "are", "was", "were", "be", "been", "being"]);
const HAVE_FORMS = new Set(["have", "has", "had"]);
