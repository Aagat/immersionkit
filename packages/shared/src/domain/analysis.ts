import { normalizeToken } from "../text/normalize";
import type {
  AnalyzerOutput,
  AnalyzerToken,
  ContextualWordCandidate,
  GrammarFeatureMatch,
  PhraseOccurrence,
  SentenceAnalysisEntry
} from "./models";

export function buildSentenceAnalysisIdentity(
  sentenceHash: string,
  analyzerVersion: string
): string {
  return `${sentenceHash}:${analyzerVersion}`;
}

export function createSentenceAnalysisEntry(
  analyzerOutput: AnalyzerOutput,
  input: {
    contextualWordCandidates?: ContextualWordCandidate[];
    phraseMatches?: PhraseOccurrence[];
    grammarFeatures?: GrammarFeatureMatch[];
    difficultyScore?: number;
    difficultyBand?: SentenceAnalysisEntry["difficultyBand"];
    vocabStats?: SentenceAnalysisEntry["vocabStats"];
    createdAt: string;
    lastAccessedAt?: string;
  }
): SentenceAnalysisEntry {
  return {
    sentenceHash: analyzerOutput.sentenceHash,
    analyzerVersion: analyzerOutput.analyzerVersion,
    analyzerId: analyzerOutput.analyzerId,
    sourceText: analyzerOutput.sourceText,
    tokens: analyzerOutput.tokens,
    lemmas: analyzerOutput.tokens.map((token) => token.lemma ?? token.normalized),
    posTags: analyzerOutput.tokens.map((token) => token.pos ?? ""),
    chunks: analyzerOutput.chunks,
    contextualWordCandidates: input.contextualWordCandidates ?? [],
    phraseMatches: input.phraseMatches ?? [],
    grammarFeatures: input.grammarFeatures ?? analyzerOutput.grammarFeatures,
    difficultyScore: input.difficultyScore,
    difficultyBand: input.difficultyBand,
    vocabStats: input.vocabStats,
    createdAt: input.createdAt,
    lastAccessedAt: input.lastAccessedAt ?? input.createdAt
  };
}

export function normalizeAnalyzerToken(input: {
  text: string;
  normalized?: string;
  lemma?: string;
  pos?: string;
  tags?: readonly string[];
  startOffset: number;
  endOffset: number;
}): AnalyzerToken {
  return {
    text: input.text,
    normalized: input.normalized ?? normalizeToken(input.text),
    lemma: input.lemma,
    pos: input.pos,
    tags: [...(input.tags ?? [])],
    startOffset: input.startOffset,
    endOffset: input.endOffset
  };
}
