import {
  normalizeToken,
  type ContextualWordCandidate,
  type GrammarFeatureMatch,
  type PhraseOccurrence,
  type SentenceAnalysisEntry
} from "@immersionkit/shared";

export type CachedWordRenderDecision = {
  sentenceHash: string;
  lexemeId: string;
  renderUnitId?: string;
  renderUnitMinBand?: string;
  normalizedSourceText?: string;
  normalizedText: string;
  targetText?: string;
  candidateLemma?: string;
  candidatePos?: ContextualWordCandidate["candidatePos"];
  confidence?: number;
  decision: "inject" | "skip";
  rationale?: string;
};

export type CachedContextSkipDecision = CachedWordRenderDecision;

export type CachedPhraseMatch = Pick<
  PhraseOccurrence,
  | "occurrenceId"
  | "phraseId"
  | "renderUnitId"
  | "renderUnitMinBand"
  | "renderPolicy"
  | "sentenceHash"
  | "sourceText"
  | "normalizedSourceText"
  | "sourceKind"
  | "category"
  | "ruleId"
  | "span"
  | "confidence"
>;

export type CachedGrammarFeature = Pick<
  GrammarFeatureMatch,
  "featureId" | "featureKey" | "label" | "category" | "sourceText" | "confidence"
>;

export type RuntimeSentenceAnalysis = {
  wordDecisions: CachedWordRenderDecision[];
  wordDecisionsByToken: Map<string, CachedWordRenderDecision[]>;
  injectDecisionsByToken: Map<string, CachedWordRenderDecision[]>;
  skipByLexemeAndToken: Map<string, CachedWordRenderDecision>;
  phraseMatches: CachedPhraseMatch[];
  grammarFeatures: CachedGrammarFeature[];
};

export type RuntimeAnalysisContext = {
  entryCount: number;
  bySentenceHash: Map<string, RuntimeSentenceAnalysis>;
};

export type CachedSentenceAnalysisContext = {
  entryCount: number;
  cachedWordRenderDecisions: Map<string, CachedWordRenderDecision[]>;
  cachedPhraseMatchesBySentenceHash: Map<string, CachedPhraseMatch[]>;
  cachedGrammarFeaturesBySentenceHash: Map<string, CachedGrammarFeature[]>;
  analysisContext: RuntimeAnalysisContext;
};

export function buildCachedSentenceAnalysisContext(
  entries: readonly SentenceAnalysisEntry[]
): CachedSentenceAnalysisContext {
  const analysisContext = buildRuntimeAnalysisContext(entries);

  return {
    entryCount: entries.length,
    cachedWordRenderDecisions: mapRuntimeAnalysis(
      analysisContext,
      (entry) => entry.wordDecisions
    ),
    cachedPhraseMatchesBySentenceHash: mapRuntimeAnalysis(
      analysisContext,
      (entry) => entry.phraseMatches
    ),
    cachedGrammarFeaturesBySentenceHash: mapRuntimeAnalysis(
      analysisContext,
      (entry) => entry.grammarFeatures
    ),
    analysisContext
  };
}

function buildRuntimeAnalysisContext(
  entries: readonly SentenceAnalysisEntry[]
): RuntimeAnalysisContext {
  const bySentenceHash = new Map<string, RuntimeSentenceAnalysis>();

  for (const entry of entries) {
    const contextualWordCandidates = Array.isArray(entry.contextualWordCandidates)
      ? entry.contextualWordCandidates
      : [];
    const phraseMatches = Array.isArray(entry.phraseMatches) ? entry.phraseMatches : [];
    const grammarFeatures = Array.isArray(entry.grammarFeatures)
      ? entry.grammarFeatures
      : [];

    bySentenceHash.set(
      entry.sentenceHash,
      buildRuntimeSentenceAnalysis({
        wordDecisions: contextualWordCandidates.flatMap((candidate) => {
          const decision = normalizeCachedWordRenderDecision(
            entry.sentenceHash,
            candidate
          );
          return decision ? [decision] : [];
        }),
        phraseMatches: phraseMatches.map((match) =>
          normalizeCachedPhraseMatch(entry.sentenceHash, match)
        ),
        grammarFeatures: grammarFeatures.map(normalizeCachedGrammarFeature)
      })
    );
  }

  return {
    entryCount: entries.length,
    bySentenceHash
  };
}

export function mergeRuntimeAnalysisContext(
  target: RuntimeAnalysisContext,
  source: RuntimeAnalysisContext
) {
  target.entryCount += source.entryCount;
  for (const [sentenceHash, analysis] of source.bySentenceHash) {
    target.bySentenceHash.set(sentenceHash, analysis);
  }
}

export function upsertRuntimeSentenceAnalysis(
  context: RuntimeAnalysisContext,
  sentenceHash: string,
  input: {
    wordDecisions?: readonly CachedWordRenderDecision[];
    phraseMatches?: readonly CachedPhraseMatch[];
    grammarFeatures?: readonly CachedGrammarFeature[];
  }
) {
  const existing = context.bySentenceHash.get(sentenceHash);
  context.bySentenceHash.set(
    sentenceHash,
    buildRuntimeSentenceAnalysis({
      wordDecisions: [...(input.wordDecisions ?? existing?.wordDecisions ?? [])],
      phraseMatches: [...(input.phraseMatches ?? existing?.phraseMatches ?? [])],
      grammarFeatures: [...(input.grammarFeatures ?? existing?.grammarFeatures ?? [])]
    })
  );
}

export function findRuntimeWordDecision(input: {
  analysisContext?: RuntimeAnalysisContext;
  sentenceHash: string;
  sourceToken: string;
  decision: "inject" | "skip";
  lexemeId?: string;
  renderUnitId?: string;
}): CachedWordRenderDecision | null {
  const sentenceAnalysis = input.analysisContext?.bySentenceHash.get(input.sentenceHash);
  if (!sentenceAnalysis) {
    return null;
  }

  const normalizedSourceToken = normalizeToken(input.sourceToken);
  if (!normalizedSourceToken) {
    return null;
  }

  if (input.decision === "skip" && input.lexemeId) {
    const exactSkip = sentenceAnalysis.skipByLexemeAndToken.get(
      createSkipDecisionKey({
        lexemeId: input.lexemeId,
        renderUnitId: input.renderUnitId,
        normalizedText: normalizedSourceToken
      })
    );
    if (exactSkip) {
      return exactSkip;
    }

    const genericSkip = sentenceAnalysis.skipByLexemeAndToken.get(
      createSkipDecisionKey({
        lexemeId: input.lexemeId,
        normalizedText: normalizedSourceToken
      })
    );
    if (genericSkip) {
      return genericSkip;
    }
  }

  const decisions =
    input.decision === "inject"
      ? sentenceAnalysis.injectDecisionsByToken.get(normalizedSourceToken) ?? []
      : sentenceAnalysis.wordDecisionsByToken.get(normalizedSourceToken) ?? [];

  return (
    decisions.find((decision) => {
      if (decision.decision !== input.decision) {
        return false;
      }

      if (input.lexemeId && decision.lexemeId !== input.lexemeId) {
        return false;
      }

      if (
        input.renderUnitId &&
        decision.renderUnitId &&
        decision.renderUnitId !== input.renderUnitId
      ) {
        return false;
      }

      return true;
    }) ?? null
  );
}

function buildRuntimeSentenceAnalysis(input: {
  wordDecisions: readonly CachedWordRenderDecision[];
  phraseMatches: readonly CachedPhraseMatch[];
  grammarFeatures: readonly CachedGrammarFeature[];
}): RuntimeSentenceAnalysis {
  const wordDecisions = [...input.wordDecisions];
  const wordDecisionsByToken = new Map<string, CachedWordRenderDecision[]>();
  const injectDecisionsByToken = new Map<string, CachedWordRenderDecision[]>();
  const skipByLexemeAndToken = new Map<string, CachedWordRenderDecision>();

  for (const decision of wordDecisions) {
    const normalizedText = normalizeToken(decision.normalizedText);
    if (!normalizedText) {
      continue;
    }

    appendRuntimeAnalysisValue(wordDecisionsByToken, normalizedText, decision);
    if (decision.decision === "inject") {
      appendRuntimeAnalysisValue(injectDecisionsByToken, normalizedText, decision);
      continue;
    }

    skipByLexemeAndToken.set(
      createSkipDecisionKey({
        lexemeId: decision.lexemeId,
        renderUnitId: decision.renderUnitId,
        normalizedText
      }),
      decision
    );
    skipByLexemeAndToken.set(
      createSkipDecisionKey({
        lexemeId: decision.lexemeId,
        normalizedText
      }),
      decision
    );
  }

  return {
    wordDecisions,
    wordDecisionsByToken,
    injectDecisionsByToken,
    skipByLexemeAndToken,
    phraseMatches: [...input.phraseMatches],
    grammarFeatures: [...input.grammarFeatures]
  };
}

function normalizeCachedWordRenderDecision(
  fallbackSentenceHash: string,
  candidate: ContextualWordCandidate
): CachedWordRenderDecision | null {
  if (candidate.decision !== "inject" && candidate.decision !== "skip") {
    return null;
  }

  const lexemeId = candidate.lexemeId?.trim();
  const normalizedText = candidate.normalizedText ?? candidate.tokenText;
  if (!lexemeId || !normalizeToken(normalizedText)) {
    return null;
  }

  return {
    sentenceHash: candidate.sentenceHash ?? fallbackSentenceHash,
    lexemeId,
    renderUnitId: candidate.renderUnitId,
    renderUnitMinBand: candidate.renderUnitMinBand,
    normalizedSourceText: candidate.normalizedSourceText,
    normalizedText,
    targetText: candidate.targetText ?? candidate.targetLemma,
    candidateLemma: candidate.candidateLemma,
    candidatePos: candidate.candidatePos,
    confidence: candidate.confidence,
    decision: candidate.decision,
    rationale: candidate.rationale
  };
}

function normalizeCachedPhraseMatch(
  fallbackSentenceHash: string,
  input: PhraseOccurrence
): CachedPhraseMatch {
  return {
    occurrenceId: input.occurrenceId,
    phraseId: input.phraseId,
    renderUnitId: input.renderUnitId,
    renderUnitMinBand: input.renderUnitMinBand,
    renderPolicy: input.renderPolicy,
    sentenceHash: input.sentenceHash || fallbackSentenceHash,
    sourceText: input.sourceText,
    normalizedSourceText: input.normalizedSourceText,
    sourceKind: input.sourceKind,
    category: input.category,
    ruleId: input.ruleId,
    span: { ...input.span },
    confidence: input.confidence
  };
}

function normalizeCachedGrammarFeature(
  value: GrammarFeatureMatch
): CachedGrammarFeature {
  return {
    featureId: value.featureId,
    featureKey: value.featureKey,
    label: value.label,
    category: value.category,
    sourceText: value.sourceText,
    confidence: value.confidence
  };
}

function appendRuntimeAnalysisValue<T>(
  map: Map<string, T[]>,
  key: string,
  value: T
) {
  const existing = map.get(key);
  if (existing) {
    existing.push(value);
    return;
  }

  map.set(key, [value]);
}

function createSkipDecisionKey(input: {
  lexemeId: string;
  renderUnitId?: string;
  normalizedText: string;
}): string {
  return [
    input.lexemeId,
    input.renderUnitId ?? "",
    normalizeToken(input.normalizedText)
  ].join("\u0000");
}

function mapRuntimeAnalysis<T>(
  context: RuntimeAnalysisContext,
  select: (entry: RuntimeSentenceAnalysis) => readonly T[]
): Map<string, T[]> {
  const output = new Map<string, T[]>();
  for (const [sentenceHash, entry] of context.bySentenceHash) {
    const values = [...select(entry)];
    if (values.length > 0) {
      output.set(sentenceHash, values);
    }
  }

  return output;
}
