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
import winkNlpModule from "wink-nlp";
import winkModel from "wink-eng-lite-web-model";

type WinkNlpEngine = {
  its: {
    lemma: unknown;
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

const WINK_NLP_ANALYZER_VERSION =
  "wink-nlp@2.4.0+immersionkit-background-v6-source-grammar";

let winkAnalyzerPromise: Promise<SentenceAnalyzer> | null = null;

export function getDefaultSentenceAnalyzer(): Promise<SentenceAnalyzer> {
  if (!winkAnalyzerPromise) {
    winkAnalyzerPromise = createWinkNlpSentenceAnalyzer();
  }

  return winkAnalyzerPromise;
}

export async function createWinkNlpSentenceAnalyzer(): Promise<SentenceAnalyzer> {
  const createWinkNlp = winkNlpModule as (model: unknown) => WinkNlpEngine;
  const winkNlp = createWinkNlp(winkModel);

  return {
    analyzerId: "wink-nlp",
    analyzerVersion: WINK_NLP_ANALYZER_VERSION,
    analyze(sentence, sentenceHash = hashSentence(sentence)) {
      const doc = winkNlp.readDoc(sentence);
      const tokenCursor = doc.tokens();
      const tokenTexts = readStringArray(tokenCursor.out());
      const tokenNormals = readStringArray(tokenCursor.out(winkNlp.its.normal));
      const tokenLemmas = readStringArray(tokenCursor.out(winkNlp.its.lemma));
      const tokenPos = readStringArray(tokenCursor.out(winkNlp.its.pos));
      const tokens = materializeWinkTokens(
        sentence,
        tokenTexts,
        tokenNormals,
        tokenLemmas,
        tokenPos
      );
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
  tokenLemmas: readonly string[],
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
    const lemma = normalizeToken(tokenLemmas[index] ?? normalized) || normalized;
    const coarsePos = normalizeAnalyzerPos(rawPos, normalized);

    return normalizeAnalyzerToken({
      text,
      normalized,
      lemma,
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
  const emittedFeatureSpans = new Set<string>();

  const addFeature = (
    input: Omit<
      Parameters<typeof buildGrammarFeature>[0],
      "sentenceHash" | "sentence" | "tokens"
    >
  ) => {
    if (
      input.startToken < 0 ||
      input.endToken <= input.startToken ||
      input.endToken > tokens.length ||
      !tokens[input.startToken] ||
      !tokens[input.endToken - 1]
    ) {
      return;
    }

    const key = `${input.featureKey}:${input.startToken}:${input.endToken}`;
    if (emittedFeatureSpans.has(key)) {
      return;
    }

    emittedFeatureSpans.add(key);
    features.push(
      buildGrammarFeature({
        sentenceHash,
        sentence,
        tokens,
        ...input
      })
    );
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const nextToken = tokens[index + 1];
    const previousToken = tokens[index - 1];
    const trailingToken = tokens[index + 2];
    const fourthToken = tokens[index + 3];

    if (token.pos === "modal") {
      if (token.normalized === "will") {
        const verbIndex = findFollowingVerbIndex(tokens, index + 1, 3);
        if (verbIndex !== null) {
          addFeature({
            startToken: index,
            endToken: verbIndex + 1,
            featureKey: "future:will",
            label: "Future with will",
            category: "tense-aspect",
            evidence: ["modal-will-before-verb"],
            confidence: 0.84
          });
        }
      } else if (SOURCE_MODAL_FORMS.has(token.normalized)) {
        addFeature({
          startToken: index,
          endToken: Math.min(tokens.length, index + 2),
          featureKey: `modal:${token.normalized}`,
          label: "Modal auxiliary",
          category: "modality",
          evidence: ["wink-pos-modal"],
          confidence: 0.86
        });
      }
    }

    if (
      token.normalized === "going" &&
      nextToken?.normalized === "to" &&
      previousToken &&
      BE_FORMS.has(previousToken.normalized) &&
      trailingToken?.pos === "verb"
    ) {
      addFeature({
        startToken: index,
        endToken: index + 2,
        featureKey: "future:going-to",
        label: "Going to future",
        category: "tense-aspect",
        evidence: ["be-before", "to-before-verb"],
        confidence: 0.84
      });
    }

    if (
      HAVE_FORMS.has(token.normalized) &&
      nextToken?.normalized === "to" &&
      trailingToken?.pos === "verb"
    ) {
      addFeature({
        startToken: index,
        endToken: index + 2,
        featureKey: "modal:have-to",
        label: "Have to",
        category: "modality",
        evidence: ["have-form-before-to-verb"],
        confidence: 0.82
      });
    }

    if (
      token.normalized === "used" &&
      nextToken?.normalized === "to" &&
      trailingToken?.pos === "verb"
    ) {
      addFeature({
        startToken: index,
        endToken: index + 2,
        featureKey: "aspect:used-to",
        label: "Used to",
        category: "tense-aspect",
        evidence: ["used-to-before-verb"],
        confidence: 0.85
      });
    }

    if (
      token.normalized === "in" &&
      nextToken?.normalized === "order" &&
      trailingToken?.normalized === "to" &&
      fourthToken?.pos === "verb"
    ) {
      addFeature({
        startToken: index,
        endToken: index + 4,
        featureKey: "infinitive:purpose",
        label: "Purpose with in order to",
        category: "syntax",
        evidence: ["in-order-to-before-verb"],
        confidence: 0.86
      });
    }

    if (token.normalized === "because") {
      addFeature({
        startToken: index,
        endToken: Math.min(tokens.length, index + 2),
        featureKey: "clause:because-basic",
        label: "Because clause",
        category: "syntax",
        evidence: ["because-connector"],
        confidence: 0.8
      });
    }

    if (token.normalized === "when") {
      addFeature({
        startToken: index,
        endToken: Math.min(tokens.length, index + 2),
        featureKey: "clause:when-basic",
        label: "When clause",
        category: "syntax",
        evidence: ["when-connector"],
        confidence: 0.8
      });
    }

    if (
      HAVE_FORMS.has(token.normalized) &&
      nextToken?.normalized === "been" &&
      trailingToken
    ) {
      addFeature({
        startToken: index,
        endToken: index + 2,
        featureKey: "aspect:have-been",
        label: "Have been",
        category: "tense-aspect",
        evidence: ["have-form-before-been"],
        confidence: 0.82
      });
    }

    if (
      token.normalized === "there" &&
      nextToken &&
      BE_FORMS.has(nextToken.normalized)
    ) {
      addFeature({
        startToken: index,
        endToken: index + 2,
        featureKey: "existential:there-is",
        label: "Existence with there is",
        category: "syntax",
        evidence: ["there-before-be-form"],
        confidence: 0.83
      });
    }

    if (isDoNotContraction(token)) {
      addFeature({
        startToken: index,
        endToken: Math.min(tokens.length, index + 2),
        featureKey: "negation:do-not",
        label: "Negation with do not",
        category: "function",
        evidence: ["do-not-contraction"],
        confidence: 0.84
      });
    } else if (isNotToken(token)) {
      if (previousToken && DO_FORMS.has(previousToken.normalized)) {
        addFeature({
          startToken: index - 1,
          endToken: Math.min(tokens.length, index + 2),
          featureKey: "negation:do-not",
          label: "Negation with do not",
          category: "function",
          evidence: ["do-form-before-not"],
          confidence: 0.84
        });
      } else {
        addFeature({
          startToken: index,
          endToken: Math.min(tokens.length, index + 2),
          featureKey: "negation:basic-not",
          label: "Basic not negation",
          category: "function",
          evidence: ["not-marker"],
          confidence: 0.8
        });
      }
    }

    if (token.normalized === "no") {
      addFeature({
        startToken: index,
        endToken: Math.min(tokens.length, index + 2),
        featureKey: "negation:basic-no",
        label: "Basic no negation",
        category: "function",
        evidence: ["no-marker"],
        confidence: 0.79
      });
    }

    if (isQuestionWordToken(token) && isQuestionContext(sentence, index)) {
      addFeature({
        startToken: index,
        endToken: Math.min(tokens.length, index + 2),
        featureKey: "question:basic-wh",
        label: "Basic question word",
        category: "function",
        evidence: ["wh-question-marker"],
        confidence: 0.82
      });
    }

    const routineMarkerEnd = getRoutineMarkerEnd(tokens, index);
    if (routineMarkerEnd !== null && hasRoutineVerb(tokens)) {
      addFeature({
        startToken: index,
        endToken: routineMarkerEnd,
        featureKey: "present:routine-verbs",
        label: "Present routine",
        category: "tense-aspect",
        evidence: ["routine-marker-with-verb"],
        confidence: 0.76
      });
    }

    const timeAnchorEnd = getTimeAnchorEnd(tokens, index);
    if (timeAnchorEnd !== null) {
      addFeature({
        startToken: index,
        endToken: timeAnchorEnd,
        featureKey: "time:anchor-basic",
        label: "Basic time anchor",
        category: "function",
        evidence: ["time-anchor-marker"],
        confidence: 0.78
      });
    }

    if (TIME_SEQUENCE_MARKERS.has(token.normalized)) {
      addFeature({
        startToken: index,
        endToken: Math.min(tokens.length, index + 2),
        featureKey: "time:sequence-basic",
        label: "Basic time sequence",
        category: "function",
        evidence: ["time-sequence-marker"],
        confidence: 0.77
      });
    }

    const sequenceConnectorEnd = getSequenceConnectorEnd(tokens, index);
    if (sequenceConnectorEnd !== null) {
      addFeature({
        startToken: index,
        endToken: sequenceConnectorEnd,
        featureKey: "connector:sequence",
        label: "Sequence connector",
        category: "syntax",
        evidence: ["sequence-connector"],
        confidence: 0.8
      });
    }

    if (isComparativeMarker(tokens, index)) {
      addFeature({
        startToken: index,
        endToken: getComparisonEnd(tokens, index),
        featureKey: "comparison:comparative",
        label: "Comparative",
        category: "function",
        evidence: ["comparative-marker"],
        confidence: 0.78
      });
    }

    if (isSuperlativeMarker(tokens, index)) {
      addFeature({
        startToken: index,
        endToken: getComparisonEnd(tokens, index),
        featureKey: "comparison:superlative",
        label: "Superlative",
        category: "function",
        evidence: ["superlative-marker"],
        confidence: 0.78
      });
    }

    const quantityEnd = getQuantityDeterminerEnd(tokens, index);
    if (quantityEnd !== null) {
      addFeature({
        startToken: index,
        endToken: quantityEnd,
        featureKey: "determiner:quantity-basic",
        label: "Quantity determiner",
        category: "function",
        evidence: ["quantity-determiner"],
        confidence: 0.78
      });
    }

    if (token.normalized === "if") {
      addFeature({
        startToken: index,
        endToken: Math.min(tokens.length, index + 2),
        featureKey: "conditional:if-basic",
        label: "Basic if conditional",
        category: "syntax",
        evidence: ["if-clause-marker"],
        confidence: 0.8
      });
    }

    const althoughEnd = getAlthoughMarkerEnd(tokens, index);
    if (althoughEnd !== null) {
      addFeature({
        startToken: index,
        endToken: althoughEnd,
        featureKey: "contrast:although",
        label: "Although contrast",
        category: "syntax",
        evidence: ["although-marker"],
        confidence: 0.82
      });
    }

    const concessionEnd = getConcessionMarkerEnd(tokens, index);
    if (concessionEnd !== null) {
      addFeature({
        startToken: index,
        endToken: concessionEnd,
        featureKey: "concession:contrast",
        label: "Contrast concession",
        category: "syntax",
        evidence: ["concession-marker"],
        confidence: 0.8
      });
    }

    const stanceEnd = getStanceMarkerEnd(tokens, index);
    if (stanceEnd !== null) {
      addFeature({
        startToken: index,
        endToken: stanceEnd,
        featureKey: "discourse:stance-marker",
        label: "Discourse stance marker",
        category: "function",
        evidence: ["stance-marker"],
        confidence: 0.78
      });
    }
  }

  return features;
}

function findFollowingVerbIndex(
  tokens: readonly AnalyzerToken[],
  startIndex: number,
  maxLookahead: number
): number | null {
  const endIndex = Math.min(tokens.length, startIndex + maxLookahead);
  for (let index = startIndex; index < endIndex; index += 1) {
    const token = tokens[index];
    if (!token) {
      continue;
    }

    if (isNotToken(token)) {
      continue;
    }

    if (isVerbLikeToken(token)) {
      return index;
    }
  }

  return null;
}

function isVerbLikeToken(token: AnalyzerToken): boolean {
  return token.pos === "verb" || token.pos === "auxiliary";
}

function isNotToken(token: AnalyzerToken): boolean {
  return NEGATION_NOT_FORMS.has(token.normalized);
}

function isDoNotContraction(token: AnalyzerToken): boolean {
  return DO_NOT_CONTRACTIONS.has(token.normalized);
}

function isQuestionWordToken(token: AnalyzerToken): boolean {
  return WH_QUESTION_WORDS.has(token.normalized);
}

function isQuestionContext(sentence: string, tokenIndex: number): boolean {
  return tokenIndex === 0 || sentence.includes("?");
}

function getRoutineMarkerEnd(
  tokens: readonly AnalyzerToken[],
  index: number
): number | null {
  const token = tokens[index];
  const nextToken = tokens[index + 1];
  if (!token) {
    return null;
  }

  if (ROUTINE_MARKERS.has(token.normalized)) {
    return index + 1;
  }

  if (
    token.normalized === "every" &&
    nextToken &&
    ROUTINE_TIME_UNITS.has(nextToken.normalized)
  ) {
    return index + 2;
  }

  return null;
}

function hasRoutineVerb(tokens: readonly AnalyzerToken[]): boolean {
  return tokens.some(
    (token) => token.pos === "verb" && !BE_FORMS.has(token.normalized)
  );
}

function getTimeAnchorEnd(
  tokens: readonly AnalyzerToken[],
  index: number
): number | null {
  const token = tokens[index];
  const nextToken = tokens[index + 1];
  if (!token) {
    return null;
  }

  if (TIME_ANCHOR_MARKERS.has(token.normalized)) {
    return index + 1;
  }

  if (
    TIME_ANCHOR_DETERMINERS.has(token.normalized) &&
    nextToken &&
    TIME_ANCHOR_UNITS.has(nextToken.normalized)
  ) {
    return index + 2;
  }

  return null;
}

function getSequenceConnectorEnd(
  tokens: readonly AnalyzerToken[],
  index: number
): number | null {
  const token = tokens[index];
  const nextToken = tokens[index + 1];
  if (!token) {
    return null;
  }

  if (SEQUENCE_CONNECTORS.has(token.normalized)) {
    return index + 1;
  }

  if (token.normalized === "after" && nextToken?.normalized === "that") {
    return index + 2;
  }

  return null;
}

function isComparativeMarker(tokens: readonly AnalyzerToken[], index: number): boolean {
  const token = tokens[index];
  const nextToken = tokens[index + 1];
  if (!token) {
    return false;
  }

  if (COMPARATIVE_FORMS.has(token.normalized)) {
    return true;
  }

  if ((token.normalized === "more" || token.normalized === "less") && nextToken) {
    return true;
  }

  return (
    Boolean(nextToken && nextToken.normalized === "than") &&
    (token.pos === "adjective" || token.pos === "adverb") &&
    token.normalized.length > 4 &&
    token.normalized.endsWith("er")
  );
}

function isSuperlativeMarker(tokens: readonly AnalyzerToken[], index: number): boolean {
  const token = tokens[index];
  const nextToken = tokens[index + 1];
  const previousToken = tokens[index - 1];
  if (!token) {
    return false;
  }

  if (SUPERLATIVE_FORMS.has(token.normalized)) {
    return true;
  }

  if (token.normalized === "most" || token.normalized === "least") {
    if (nextToken && isAdjectiveOrAdverbToken(nextToken)) {
      return true;
    }

    return (
      previousToken?.normalized === "the" &&
      (!nextToken || isTerminalPunctuationToken(nextToken))
    );
  }

  return (
    previousToken?.normalized === "the" &&
    (token.pos === "adjective" || token.pos === "adverb") &&
    token.normalized.length > 4 &&
    token.normalized.endsWith("est")
  );
}

function getConcessionMarkerEnd(
  tokens: readonly AnalyzerToken[],
  index: number
): number | null {
  const token = tokens[index];
  const nextToken = tokens[index + 1];
  if (!token) {
    return null;
  }

  if (CONCESSION_MARKERS.has(token.normalized)) {
    return Math.min(tokens.length, index + 2);
  }

  if (
    CONCESSION_DISCOURSE_MARKERS.has(token.normalized) &&
    index === 0 &&
    nextToken &&
    isCommaToken(nextToken)
  ) {
    return Math.min(tokens.length, index + 2);
  }

  return null;
}

function isAdjectiveOrAdverbToken(token: AnalyzerToken): boolean {
  return token.pos === "adjective" || token.pos === "adverb";
}

function isCommaToken(token: AnalyzerToken): boolean {
  return token.text === "," || token.normalized === ",";
}

function isTerminalPunctuationToken(token: AnalyzerToken): boolean {
  return (
    token.text === "." ||
    token.text === "!" ||
    token.text === "?" ||
    token.normalized === "." ||
    token.normalized === "!" ||
    token.normalized === "?"
  );
}

function getComparisonEnd(tokens: readonly AnalyzerToken[], index: number): number {
  if (tokens[index + 1] && tokens[index + 1].normalized === "than") {
    return Math.min(tokens.length, index + 2);
  }

  if (tokens[index + 2] && tokens[index + 2].normalized === "than") {
    return Math.min(tokens.length, index + 3);
  }

  return Math.min(tokens.length, index + 2);
}

function getQuantityDeterminerEnd(
  tokens: readonly AnalyzerToken[],
  index: number
): number | null {
  const token = tokens[index];
  const nextToken = tokens[index + 1];
  const trailingToken = tokens[index + 2];
  if (!token) {
    return null;
  }

  if (QUANTITY_DETERMINERS.has(token.normalized)) {
    return Math.min(tokens.length, index + 2);
  }

  if (token.normalized === "a" && nextToken?.normalized === "few") {
    return Math.min(tokens.length, index + 3);
  }

  if (token.normalized === "a" && nextToken?.normalized === "lot") {
    return Math.min(
      tokens.length,
      trailingToken?.normalized === "of" ? index + 3 : index + 2
    );
  }

  if (token.normalized === "lots" && nextToken?.normalized === "of") {
    return Math.min(tokens.length, index + 3);
  }

  return null;
}

function getAlthoughMarkerEnd(
  tokens: readonly AnalyzerToken[],
  index: number
): number | null {
  const token = tokens[index];
  const nextToken = tokens[index + 1];
  if (!token) {
    return null;
  }

  if (token.normalized === "although" || token.normalized === "though") {
    return Math.min(tokens.length, index + 2);
  }

  if (token.normalized === "even" && nextToken?.normalized === "though") {
    return Math.min(tokens.length, index + 3);
  }

  return null;
}

function getStanceMarkerEnd(
  tokens: readonly AnalyzerToken[],
  index: number
): number | null {
  const token = tokens[index];
  const nextToken = tokens[index + 1];
  const trailingToken = tokens[index + 2];
  if (!token) {
    return null;
  }

  if (STANCE_MARKERS.has(token.normalized)) {
    return Math.min(tokens.length, index + 1);
  }

  if (
    token.normalized === "to" &&
    nextToken?.normalized === "some" &&
    trailingToken?.normalized === "extent"
  ) {
    return Math.min(tokens.length, index + 3);
  }

  return null;
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

function normalizeAnalyzerPos(value: string, normalized: string): string {
  const tag = value.toLowerCase();

  if (tag === "md" || (tag === "aux" && MODAL_FORMS.has(normalized))) {
    return "modal";
  }

  if (tag === "aux") {
    return "auxiliary";
  }

  if (tag === "noun" || tag === "propn" || tag.startsWith("nn")) {
    return "noun";
  }

  if (tag === "verb" || tag.startsWith("vb")) {
    return "verb";
  }

  if (tag === "adj" || tag.startsWith("jj")) {
    return "adjective";
  }

  if (tag === "adv" || tag.startsWith("rb")) {
    return "adverb";
  }

  if (tag === "det" || tag === "dt" || tag === "pdt" || tag === "wdt") {
    return "determiner";
  }

  if (tag === "adp" || tag === "in" || tag === "to") {
    return "preposition";
  }

  if (
    tag === "pron" ||
    tag === "prp" ||
    tag === "prp$" ||
    tag === "wp" ||
    tag === "wp$"
  ) {
    return "pronoun";
  }

  if (tag === "num" || tag === "cd") {
    return "number";
  }

  if (tag === "part" || tag === "rp") {
    return "particle";
  }

  if (tag === "cconj" || tag === "sconj" || tag === "cc") {
    return "conjunction";
  }

  if (tag === "intj") {
    return "interjection";
  }

  if (tag === "punct" || tag === "sym" || tag === "x") {
    return "other";
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
const DO_FORMS = new Set(["do", "does", "did"]);
const SOURCE_MODAL_FORMS = new Set(["can", "should"]);
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
const NEGATION_NOT_FORMS = new Set(["not", "n't", "nt"]);
const DO_NOT_CONTRACTIONS = new Set(["don't", "doesn't", "didn't", "dont", "doesnt", "didnt"]);
const WH_QUESTION_WORDS = new Set([
  "what",
  "who",
  "whom",
  "whose",
  "which",
  "where",
  "when",
  "why",
  "how"
]);
const ROUTINE_MARKERS = new Set([
  "always",
  "usually",
  "often",
  "sometimes",
  "daily",
  "weekly",
  "monthly"
]);
const ROUTINE_TIME_UNITS = new Set([
  "day",
  "days",
  "week",
  "weeks",
  "month",
  "months",
  "year",
  "years",
  "morning",
  "evening",
  "night"
]);
const TIME_ANCHOR_MARKERS = new Set([
  "today",
  "tomorrow",
  "yesterday",
  "tonight",
  "now"
]);
const TIME_ANCHOR_DETERMINERS = new Set(["this", "next", "last"]);
const TIME_ANCHOR_UNITS = new Set([
  "morning",
  "afternoon",
  "evening",
  "night",
  "week",
  "month",
  "year",
  "spring",
  "summer",
  "fall",
  "autumn",
  "winter"
]);
const TIME_SEQUENCE_MARKERS = new Set(["before", "after"]);
const SEQUENCE_CONNECTORS = new Set([
  "then",
  "finally",
  "first",
  "second",
  "third",
  "next",
  "later"
]);
const COMPARATIVE_FORMS = new Set(["better", "worse", "earlier", "later"]);
const SUPERLATIVE_FORMS = new Set(["best", "worst", "earliest", "latest"]);
const QUANTITY_DETERMINERS = new Set([
  "many",
  "much",
  "few",
  "several",
  "some",
  "any",
  "most",
  "more",
  "less",
  "enough"
]);
const CONCESSION_MARKERS = new Set([
  "however",
  "nevertheless",
  "nonetheless"
]);
const CONCESSION_DISCOURSE_MARKERS = new Set(["still", "yet"]);
const STANCE_MARKERS = new Set([
  "perhaps",
  "maybe",
  "probably",
  "apparently",
  "likely"
]);
