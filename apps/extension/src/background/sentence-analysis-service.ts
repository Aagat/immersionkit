import bundledLexemeAsset from "../assets/en-es.lexemes.v1.json";
import bundledRenderUnitAsset from "../assets/en-es.render-units.v1.json";
import phraseTargetAsset from "../assets/en-es.phrase-targets.v1.json";
import {
  BEGINNER_DIFFICULTY_PRESET,
  buildRuntimePhraseId,
  createSentenceAnalysisEntry,
  detectPhraseCandidatesFromAnalyzerOutput,
  evaluateContextAwareDecision,
  getV1AmbiguityGroupForLemma,
  hashSentence,
  normalizeToken,
  scorePrototypeSuitability,
  scoreSentenceByVocabStatuses,
  type AnalyzerChunk,
  type AnalyzerOutput,
  type AnalyzerToken,
  type ContextChunkType,
  type ContextualWordCandidate,
  type CuratedPhraseTargetEntry,
  type ObservedContextPos,
  type PhraseOccurrence,
  type RenderUnitEntry,
  type SafeInjectionPos,
  type SeedLexiconEntry,
  type SentenceAnalysisEntry,
  type UserVocabEntry,
  type VocabStatus
} from "@immersionkit/shared";

import {
  parseLexemeAsset,
  parseRenderUnitAsset,
  renderUnitsToSeedLexiconEntries,
  resolveRenderUnitPhraseTarget
} from "../render-units/render-units";
import { parseSeedLexiconInput } from "../seed/seed-lexicon";
import {
  IndexedDbPhraseRegistryRepository,
  type PhraseRegistryRepository
} from "./phrase-registry";
import { BackgroundLearningItemService } from "./learning-items";
import {
  IndexedDbSentenceAnalysisCacheRepository,
  type SentenceAnalysisCacheRepository
} from "./sentence-analysis-cache";
import {
  getDefaultSentenceAnalyzer,
  type SentenceAnalyzer
} from "./sentence-analyzers";
import { pickFirstDefinedValue, readStorageValues } from "./storage";

const VOCAB_STORAGE_KEYS = ["immersionkit.vocab", "vocab", "vocabEntries"] as const;
const SEED_LEXICON_STORAGE_KEYS = [
  "immersionkit.seedLexicon",
  "seedLexicon",
  "lexicon"
] as const;
const RENDER_UNIT_STORAGE_KEYS = ["immersionkit.renderUnits", "renderUnits"] as const;
const LEXEME_STORAGE_KEYS = ["immersionkit.lexemes", "lexemes"] as const;
const RUNTIME_PHRASE_TARGET_LEXICON = parsePhraseTargetAsset(phraseTargetAsset);
const RUNTIME_RENDER_UNITS = parseRenderUnitAsset(bundledRenderUnitAsset);
const RUNTIME_LEXEMES = parseLexemeAsset(bundledLexemeAsset);

export type SentenceAnalysisCandidate = {
  sentenceHash?: string;
  sourceText: string;
  hostname?: string;
  nodeId?: string;
  documentUrl?: string;
};

export type SentenceSuitabilitySignals = {
  vocabularyFit: number;
  grammarFit: number;
  structuralSimplicity: number;
  dueTargetValue: number;
  chunkUsefulness: number;
  ambiguityPenalty: number;
  stretchDemand: number;
};

export type AnalyzedSentenceCandidate = {
  entry: SentenceAnalysisEntry;
  cacheHit: boolean;
  suitabilitySignals: SentenceSuitabilitySignals;
};

type SentenceAnalysisServiceOptions = {
  cache?: SentenceAnalysisCacheRepository;
  phraseRegistry?: PhraseRegistryRepository;
  learningItems?: Pick<BackgroundLearningItemService, "upsertGrammarFeatureItems">;
  analyzer?: SentenceAnalyzer | (() => Promise<SentenceAnalyzer>);
  loadLexicon?: () => Promise<SeedLexiconEntry[]>;
  loadRenderUnits?: () => Promise<RenderUnitEntry[]>;
  loadVocab?: () => Promise<Map<string, UserVocabEntry>>;
};

type LexiconLookup = {
  byNormalizedForm: Map<string, SeedLexiconEntry[]>;
};

type ResolvedPhraseTarget = {
  targetText: string;
  normalizedTargetText: string;
};

type PhraseTargetResolver = (input: {
  sourceText: string;
  normalizedSourceText: string;
  sourceKind: PhraseOccurrence["sourceKind"];
  category: PhraseOccurrence["category"];
}) => ResolvedPhraseTarget | null;

export class SentenceAnalysisService {
  private readonly cache: SentenceAnalysisCacheRepository;
  private readonly phraseRegistry: PhraseRegistryRepository;
  private readonly learningItems: Pick<
    BackgroundLearningItemService,
    "upsertGrammarFeatureItems"
  >;
  private readonly analyzerLoader: () => Promise<SentenceAnalyzer>;
  private readonly loadLexicon: () => Promise<SeedLexiconEntry[]>;
  private readonly loadRenderUnits: () => Promise<RenderUnitEntry[]>;
  private readonly loadVocab: () => Promise<Map<string, UserVocabEntry>>;

  constructor(options: SentenceAnalysisServiceOptions = {}) {
    this.cache = options.cache ?? new IndexedDbSentenceAnalysisCacheRepository();
    this.phraseRegistry =
      options.phraseRegistry ?? new IndexedDbPhraseRegistryRepository();
    this.learningItems = options.learningItems ?? new BackgroundLearningItemService();
    if (!options.analyzer) {
      this.analyzerLoader = getDefaultSentenceAnalyzer;
    } else if (isSentenceAnalyzer(options.analyzer)) {
      const analyzer = options.analyzer;
      this.analyzerLoader = async () => analyzer;
    } else {
      this.analyzerLoader = options.analyzer;
    }
    this.loadLexicon = options.loadLexicon ?? loadBackgroundLexicon;
    this.loadRenderUnits = options.loadRenderUnits ?? loadBackgroundRenderUnits;
    this.loadVocab = options.loadVocab ?? loadBackgroundVocab;
  }

  async analyzeCandidates(
    candidates: readonly SentenceAnalysisCandidate[]
  ): Promise<AnalyzedSentenceCandidate[]> {
    if (candidates.length === 0) {
      return [];
    }

    const analyzer = await this.analyzerLoader();
    const renderUnits = await this.loadRenderUnits();
    const analysisVersion = buildRenderUnitAnalysisVersion(
      analyzer.analyzerVersion,
      renderUnits
    );
    const normalizedCandidates = normalizeAnalysisCandidates(candidates);
    const cachedEntries = await this.cache.getMany(
      normalizedCandidates.map((candidate) => candidate.sentenceHash),
      analysisVersion
    );
    const cachedByHash = new Map(
      cachedEntries.map((entry) => [entry.sentenceHash, entry] as const)
    );
    const [lexicon, vocab] = await Promise.all([
      this.loadLexicon(),
      this.loadVocab()
    ]);
    const lookup = buildLexiconLookup(lexicon);
    const now = new Date().toISOString();
    const results: AnalyzedSentenceCandidate[] = [];
    const entriesToPersist: SentenceAnalysisEntry[] = [];

    for (const candidate of normalizedCandidates) {
      const cachedEntry = cachedByHash.get(candidate.sentenceHash);
      if (cachedEntry) {
        const refreshedEntry = {
          ...cachedEntry,
          lastAccessedAt: now
        };
        entriesToPersist.push(refreshedEntry);
        results.push({
          entry: refreshedEntry,
          cacheHit: true,
          suitabilitySignals: deriveSuitabilitySignals(refreshedEntry)
        });
        continue;
      }

      const rawAnalyzerOutput = await analyzer.analyze(
        candidate.sourceText,
        candidate.sentenceHash
      );
      const analyzerOutput = {
        ...rawAnalyzerOutput,
        analyzerVersion: analysisVersion
      };
      const entry = buildAnalysisEntry(analyzerOutput, lookup, vocab, now, renderUnits);
      entriesToPersist.push(entry);
      results.push({
        entry,
        cacheHit: false,
        suitabilitySignals: deriveSuitabilitySignals(entry)
      });
    }

    await this.cache.putMany(entriesToPersist);
    await this.phraseRegistry.upsertOccurrences(
      results.flatMap((result) => result.entry.phraseMatches),
      now
    );
    await this.learningItems.upsertGrammarFeatureItems(
      results.flatMap((result) => result.entry.grammarFeatures),
      now
    );
    return results;
  }
}

function buildAnalysisEntry(
  analyzerOutput: AnalyzerOutput,
  lookup: LexiconLookup,
  vocab: ReadonlyMap<string, UserVocabEntry>,
  now: string,
  renderUnits: readonly RenderUnitEntry[]
): SentenceAnalysisEntry {
  const contextualWordCandidates = buildContextualWordCandidates(
    analyzerOutput,
    lookup
  );
  const phraseMatches = buildPhraseOccurrences(
    analyzerOutput,
    buildSeedLexiconPhraseTargetResolver(lookup, renderUnits),
    renderUnits
  );
  const vocabStats = scoreSentenceByVocabStatuses(
    analyzerOutput.tokens.map((token) =>
      resolveTokenVocabStatus(token, lookup, vocab)
    )
  );
  const suitabilitySignals = computeSuitabilitySignals(
    analyzerOutput,
    contextualWordCandidates,
    phraseMatches,
    vocabStats
  );
  const suitabilityScore = scorePrototypeSuitability(
    suitabilitySignals,
    BEGINNER_DIFFICULTY_PRESET
  );

  return createSentenceAnalysisEntry(analyzerOutput, {
    contextualWordCandidates,
    phraseMatches,
    grammarFeatures: analyzerOutput.grammarFeatures,
    difficultyScore: suitabilityScore.normalizedScore,
    difficultyBand: suitabilityScore.difficultyBand,
    vocabStats,
    createdAt: now,
    lastAccessedAt: now
  });
}

function buildContextualWordCandidates(
  analyzerOutput: AnalyzerOutput,
  lookup: LexiconLookup
): ContextualWordCandidate[] {
  const candidates: ContextualWordCandidate[] = [];

  analyzerOutput.tokens.forEach((token, tokenIndex) => {
    const lexiconEntries = findLexiconEntriesForToken(token, lookup);
    for (const lexiconEntry of lexiconEntries) {
      if (!isSafeInjectionPos(lexiconEntry.pos)) {
        continue;
      }

      const ambiguityGroup = getV1AmbiguityGroupForLemma(
        lexiconEntry.sourceLemma
      );
      const observedPos = toObservedContextPos(token);
      const chunk = findChunkForToken(analyzerOutput.chunks, tokenIndex);
      const chunkType = toContextChunkType(chunk, observedPos);
      const nearbyContextSignature = buildContextSignatures(
        analyzerOutput.tokens,
        tokenIndex,
        observedPos,
        chunkType
      );
      const confidence = scoreCandidateConfidence({
        token,
        tokenIndex,
        lexiconEntry,
        observedPos,
        chunkType,
        nearbyContextSignature
      });
      const candidate: ContextualWordCandidate = {
        id: `${analyzerOutput.sentenceHash}:${tokenIndex}:${lexiconEntry.lemmaId}`,
        sentenceHash: analyzerOutput.sentenceHash,
        sentence: analyzerOutput.sourceText,
        tokenText: token.text,
        surfaceText: token.text,
        normalizedText: token.normalized,
        targetLemma: lexiconEntry.targetLemma,
        candidateLemma: lexiconEntry.sourceLemma,
        lemmaId: lexiconEntry.lemmaId,
        candidatePos: lexiconEntry.pos,
        observedPos,
        chunkType,
        chunkText: chunk?.text,
        tokenStart: tokenIndex,
        tokenEnd: tokenIndex + 1,
        leftContextLemmas: analyzerOutput.tokens
          .slice(Math.max(0, tokenIndex - 3), tokenIndex)
          .map((entry) => entry.lemma ?? entry.normalized),
        rightContextLemmas: analyzerOutput.tokens
          .slice(tokenIndex + 1, tokenIndex + 4)
          .map((entry) => entry.lemma ?? entry.normalized),
        nearbyContextSignature,
        ambiguityGroup: ambiguityGroup ?? `unambiguous:${lexiconEntry.sourceLemma}`,
        confidence
      };

      if (ambiguityGroup) {
        const decision = evaluateContextAwareDecision(candidate);
        candidates.push({
          ...candidate,
          decision: decision.decision,
          rationale: decision.reason
        });
        continue;
      }

      const decision = evaluateUnambiguousCandidate(candidate);
      candidates.push({
        ...candidate,
        decision: decision.decision,
        rationale: decision.rationale
      });
    }
  });

  return candidates;
}

function isSentenceAnalyzer(value: SentenceAnalyzer | (() => Promise<SentenceAnalyzer>)): value is SentenceAnalyzer {
  return typeof value === "object" && value !== null && "analyze" in value;
}

function isSafeInjectionPos(value: SeedLexiconEntry["pos"]): value is SafeInjectionPos {
  return value === "noun" || value === "adjective" || value === "adverb";
}

function buildPhraseOccurrences(
  analyzerOutput: AnalyzerOutput,
  resolvePhraseTarget: PhraseTargetResolver,
  renderUnits: readonly RenderUnitEntry[]
): PhraseOccurrence[] {
  const detection = detectPhraseCandidatesFromAnalyzerOutput(analyzerOutput, undefined, {
    minimumChunkConfidence: 0.76
  });
  const renderUnitOccurrences = buildRenderUnitPhraseOccurrences(
    analyzerOutput,
    renderUnits
  );

  const detectedOccurrences = detection.selectedCandidates.map((candidate) => {
    const resolvedTarget = resolvePhraseTarget({
      sourceText: candidate.sourceText,
      normalizedSourceText: candidate.normalizedSourceText,
      sourceKind: candidate.sourceKind,
      category: candidate.category
    });
    const normalizedTargetText = resolvedTarget?.normalizedTargetText ?? "";

    return {
      occurrenceId: `${analyzerOutput.sentenceHash}:${analyzerOutput.analyzerVersion}:${candidate.span.startToken}-${candidate.span.endToken}:${candidate.ruleId}`,
      phraseId: buildRuntimePhraseId({
        normalizedSourceText: candidate.normalizedSourceText,
        sourceKind: candidate.sourceKind,
        normalizedTargetText
      }),
      sentenceHash: analyzerOutput.sentenceHash,
      analyzerVersion: analyzerOutput.analyzerVersion,
      sourceText: candidate.sourceText,
      normalizedSourceText: candidate.normalizedSourceText,
      targetText: resolvedTarget?.targetText,
      normalizedTargetText: resolvedTarget?.normalizedTargetText,
      sourceKind: candidate.sourceKind,
      category: candidate.category,
      ruleId: candidate.ruleId,
      span: {
        startToken: candidate.span.startToken,
        endToken: candidate.span.endToken,
        startChar: candidate.span.startChar,
        endChar: candidate.span.endChar
      },
      confidence: candidate.confidence
    };
  }).filter((occurrence) => !overlapsRenderUnitOccurrence(occurrence, renderUnitOccurrences));

  return [
    ...renderUnitOccurrences,
    ...detectedOccurrences
  ];
}

function buildRenderUnitAnalysisVersion(
  analyzerVersion: string,
  renderUnits: readonly RenderUnitEntry[]
): string {
  if (renderUnits.length === 0) {
    return analyzerVersion;
  }

  const signature = renderUnits
    .map((unit) =>
      stableSerializeRenderUnitSignature({
        renderUnitId: unit.renderUnitId,
        kind: unit.kind,
        renderPolicy: unit.renderPolicy,
        minBand: unit.minBand,
        sourceText: unit.sourceText,
        normalizedSourceText: unit.normalizedSourceText,
        targetText: unit.targetText ?? null,
        normalizedTargetText: unit.normalizedTargetText ?? null,
        sourcePattern: unit.sourcePattern,
        replacement: unit.replacement ?? null,
        confidence: unit.confidence
      })
    )
    .sort()
    .join("|");

  return `${analyzerVersion}+render-units:${hashSentence(signature).slice(0, 12)}`;
}

function stableSerializeRenderUnitSignature(input: unknown): string {
  if (input === null || typeof input !== "object") {
    return JSON.stringify(input);
  }

  if (Array.isArray(input)) {
    return `[${input.map((item) => stableSerializeRenderUnitSignature(item)).join(",")}]`;
  }

  const entries = Object.entries(input)
    .filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries
    .map(
      ([key, value]) =>
        `${JSON.stringify(key)}:${stableSerializeRenderUnitSignature(value)}`
    )
    .join(",")}}`;
}

function overlapsRenderUnitOccurrence(
  occurrence: PhraseOccurrence,
  renderUnitOccurrences: readonly PhraseOccurrence[]
): boolean {
  return renderUnitOccurrences.some(
    (renderUnitOccurrence) =>
      renderUnitOccurrence.sentenceHash === occurrence.sentenceHash &&
      occurrence.span.startToken < renderUnitOccurrence.span.endToken &&
      renderUnitOccurrence.span.startToken < occurrence.span.endToken
  );
}

function buildRenderUnitPhraseOccurrences(
  analyzerOutput: AnalyzerOutput,
  renderUnits: readonly RenderUnitEntry[]
): PhraseOccurrence[] {
  const occurrences: PhraseOccurrence[] = [];

  for (const renderUnit of renderUnits) {
    if (
      renderUnit.kind === "single-token" ||
      !shouldEmitRenderUnitOccurrence(renderUnit)
    ) {
      continue;
    }

    for (const span of findRenderUnitTokenSpans(analyzerOutput.tokens, renderUnit)) {
      const replacementStart =
        span.startToken + (renderUnit.replacement?.startToken ?? 0);
      const replacementEnd =
        span.startToken + (renderUnit.replacement?.endToken ?? span.endToken - span.startToken);
      const firstToken = analyzerOutput.tokens[replacementStart];
      const lastToken = analyzerOutput.tokens[replacementEnd - 1];
      if (!firstToken || !lastToken) {
        continue;
      }

      const sourceText = analyzerOutput.sourceText.slice(
        firstToken.startOffset,
        lastToken.endOffset
      );
      const sourceMetadata = mapRenderUnitPhraseMetadata(renderUnit.kind);
      occurrences.push({
        occurrenceId: `${analyzerOutput.sentenceHash}:${analyzerOutput.analyzerVersion}:${span.startToken}-${span.endToken}:${renderUnit.renderUnitId}`,
        phraseId: renderUnit.renderUnitId,
        renderUnitId: renderUnit.renderUnitId,
        renderUnitMinBand: renderUnit.minBand,
        renderPolicy: renderUnit.renderPolicy,
        sentenceHash: analyzerOutput.sentenceHash,
        analyzerVersion: analyzerOutput.analyzerVersion,
        sourceText,
        normalizedSourceText: renderUnit.normalizedSourceText,
        targetText:
          renderUnit.renderPolicy === "inline" || renderUnit.renderPolicy === "phrase-only"
            ? renderUnit.replacement?.targetText ?? renderUnit.targetText
            : undefined,
        normalizedTargetText:
          renderUnit.renderPolicy === "inline" || renderUnit.renderPolicy === "phrase-only"
            ? normalizeToken(renderUnit.replacement?.targetText ?? renderUnit.targetText ?? "")
            : undefined,
        sourceKind: sourceMetadata.sourceKind,
        category: sourceMetadata.category,
        ruleId: `render-unit:${renderUnit.renderUnitId}`,
        span: {
          startToken: replacementStart,
          endToken: replacementEnd,
          startChar: firstToken.startOffset,
          endChar: lastToken.endOffset
        },
        confidence: renderUnit.confidence
      });
    }
  }

  return occurrences;
}

function shouldEmitRenderUnitOccurrence(renderUnit: RenderUnitEntry): boolean {
  if (renderUnit.renderPolicy === "sentence-help-only") {
    return true;
  }

  return (
    (renderUnit.renderPolicy === "inline" || renderUnit.renderPolicy === "phrase-only") &&
    Boolean(renderUnit.targetText && renderUnit.normalizedTargetText)
  );
}

function findRenderUnitTokenSpans(
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

function matchesRenderUnitPatternToken(
  tokens: readonly AnalyzerToken[],
  tokenIndex: number,
  pattern: RenderUnitEntry["sourcePattern"]["tokens"][number]
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

  if (pattern.role && !matchesShallowRole(token, pattern.role)) {
    return false;
  }

  return matchesRenderUnitFeatures(tokens, tokenIndex, pattern.features);
}

function matchesShallowRole(
  token: AnalyzerToken,
  role: NonNullable<RenderUnitEntry["sourcePattern"]["tokens"][number]["role"]>
): boolean {
  if (role === "subject") {
    return token.pos === "pronoun" || token.pos === "noun" || token.pos === "proper-noun";
  }

  if (role === "verb") {
    return token.pos === "verb" || token.pos === "auxiliary" || token.pos === "modal";
  }

  if (role === "object") {
    return token.pos === "noun" || token.pos === "pronoun" || token.pos === "proper-noun";
  }

  return token.pos !== "other";
}

function matchesRenderUnitFeatures(
  tokens: readonly AnalyzerToken[],
  tokenIndex: number,
  features: RenderUnitEntry["sourcePattern"]["tokens"][number]["features"]
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

    if (key === "normalIn" && !matchesStringOrList(token.normalized, value)) {
      return false;
    }

    if (key === "lemmaIn" && !matchesStringOrList(token.lemma ?? token.normalized, value)) {
      return false;
    }

    if (key === "posIn" && !matchesStringOrList(token.pos ?? "other", value)) {
      return false;
    }

    if (key === "precededByNormal") {
      const previous = tokens[tokenIndex - 1]?.normalized ?? "";
      if (!matchesStringOrList(previous, value)) {
        return false;
      }
    }

    if (key === "followedByNormal") {
      const next = tokens[tokenIndex + 1]?.normalized ?? "";
      if (!matchesStringOrList(next, value)) {
        return false;
      }
    }

    if (key === "negated") {
      const negated = hasNearbyNegation(tokens, tokenIndex);
      if (typeof value === "boolean" && negated !== value) {
        return false;
      }
    }
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

function mapRenderUnitPhraseMetadata(kind: RenderUnitEntry["kind"]): Pick<
  PhraseOccurrence,
  "sourceKind" | "category"
> {
  if (kind === "fixed-phrase") {
    return { sourceKind: "fixed-phrase", category: "fixed-idiom" };
  }

  if (kind === "noun-phrase") {
    return { sourceKind: "chunk", category: "noun-chunk" };
  }

  return { sourceKind: "pattern-match", category: "grammar-carrier" };
}

function buildSeedLexiconPhraseTargetResolver(
  lookup: LexiconLookup,
  renderUnits: readonly RenderUnitEntry[]
): PhraseTargetResolver {
  return (input) => {
    const renderUnitTarget = resolveRenderUnitPhraseTarget(
      renderUnits,
      input.normalizedSourceText
    );
    if (renderUnitTarget) {
      return renderUnitTarget;
    }

    if (input.sourceKind === "fixed-phrase") {
      return null;
    }

    const curatedTarget = RUNTIME_PHRASE_TARGET_LEXICON.find(
      (entry) =>
        entry.sourceKind === input.sourceKind &&
        entry.category === input.category &&
        entry.normalizedSourceText === input.normalizedSourceText
    );
    if (curatedTarget) {
      return {
        targetText: curatedTarget.targetText,
        normalizedTargetText: curatedTarget.normalizedTargetText
      };
    }

    const entries = lookup.byNormalizedForm.get(input.normalizedSourceText) ?? [];
    const entry = entries.find(
      (candidate) =>
        candidate.targetLemma.trim().length > 0 &&
        normalizeToken(candidate.sourceLemma) === input.normalizedSourceText
    );
    if (!entry) {
      return null;
    }

    return {
      targetText: entry.targetLemma.trim(),
      normalizedTargetText: normalizeToken(entry.targetLemma)
    };
  };
}

function parsePhraseTargetAsset(value: unknown): readonly CuratedPhraseTargetEntry[] {
  if (!isRecord(value) || !Array.isArray(value.entries)) {
    return [];
  }

  return value.entries.flatMap((entry): CuratedPhraseTargetEntry[] => {
    if (!isRecord(entry)) {
      return [];
    }

    const sourceText = readString(entry.sourceText);
    const targetText = readString(entry.targetText);
    const sourceKind = readPhraseTargetSourceKind(entry.sourceKind);
    const category = readPhraseCategory(entry.category);
    const confidence =
      typeof entry.confidence === "number" && Number.isFinite(entry.confidence)
        ? Math.max(0, Math.min(1, entry.confidence))
        : null;

    if (!sourceText || !targetText || !sourceKind || !category || confidence === null) {
      return [];
    }

    return [
      {
        sourceText,
        targetText,
        sourceKind,
        category,
        confidence,
        normalizedSourceText: normalizeToken(sourceText),
        normalizedTargetText: normalizeToken(targetText)
      }
    ];
  });
}

function readPhraseTargetSourceKind(
  value: unknown
): CuratedPhraseTargetEntry["sourceKind"] | null {
  return value === "chunk" || value === "pattern-match" ? value : null;
}

function readPhraseCategory(value: unknown): CuratedPhraseTargetEntry["category"] | null {
  return value === "noun-chunk" ||
    value === "adjective-noun" ||
    value === "grammar-carrier"
    ? value
    : null;
}

function computeSuitabilitySignals(
  analyzerOutput: AnalyzerOutput,
  contextualWordCandidates: readonly ContextualWordCandidate[],
  phraseMatches: readonly PhraseOccurrence[],
  vocabStats: ReturnType<typeof scoreSentenceByVocabStatuses>
): SentenceSuitabilitySignals {
  const tokenCount = Math.max(1, analyzerOutput.tokens.length);
  const injectedCandidateCount = contextualWordCandidates.filter(
    (candidate) => candidate.decision === "inject"
  ).length;
  const ambiguousCandidateCount = contextualWordCandidates.filter((candidate) =>
    Boolean(getV1AmbiguityGroupForLemma(candidate.candidateLemma))
  ).length;
  const skippedAmbiguousCount = contextualWordCandidates.filter(
    (candidate) =>
      Boolean(getV1AmbiguityGroupForLemma(candidate.candidateLemma)) &&
      candidate.decision === "skip"
  ).length;
  const averagePhraseConfidence =
    phraseMatches.length === 0
      ? 0
      : phraseMatches.reduce((total, phrase) => total + phrase.confidence, 0) /
        phraseMatches.length;
  const grammarConfidence =
    analyzerOutput.grammarFeatures.length === 0
      ? 0.72
      : Math.min(
          1,
          analyzerOutput.grammarFeatures.reduce(
            (total, feature) => total + feature.confidence,
            0
          ) / analyzerOutput.grammarFeatures.length
        );
  const complexityPenalty = Math.min(0.45, Math.max(0, tokenCount - 14) * 0.025);
  const chunkDensity = Math.min(1, phraseMatches.length / 3);
  const ambiguityPenalty =
    ambiguousCandidateCount === 0
      ? 0
      : skippedAmbiguousCount / Math.max(1, ambiguousCandidateCount);
  const stretchDemand = Math.min(
    1,
    vocabStats.unknownWordCount / tokenCount + analyzerOutput.grammarFeatures.length * 0.08
  );

  return {
    vocabularyFit: Math.min(1, vocabStats.familiarRatio + injectedCandidateCount * 0.04),
    grammarFit: grammarConfidence,
    structuralSimplicity: Math.max(0, 1 - complexityPenalty),
    dueTargetValue: Math.min(1, injectedCandidateCount / Math.max(1, tokenCount / 4)),
    chunkUsefulness: Math.max(averagePhraseConfidence, chunkDensity * 0.72),
    ambiguityPenalty,
    stretchDemand
  };
}

function deriveSuitabilitySignals(
  entry: SentenceAnalysisEntry
): SentenceSuitabilitySignals {
  return computeSuitabilitySignals(
    {
      analyzerId: entry.analyzerId,
      analyzerVersion: entry.analyzerVersion,
      sentenceHash: entry.sentenceHash,
      sourceText: entry.sourceText,
      tokens: entry.tokens,
      chunks: entry.chunks,
      grammarFeatures: entry.grammarFeatures
    },
    entry.contextualWordCandidates,
    entry.phraseMatches,
    entry.vocabStats ??
      scoreSentenceByVocabStatuses(entry.tokens.map(() => "new" as VocabStatus))
  );
}

function evaluateUnambiguousCandidate(
  candidate: ContextualWordCandidate
): { decision: "inject" | "skip"; rationale: string } {
  if (candidate.observedPos !== candidate.candidatePos) {
    return {
      decision: "skip",
      rationale: `Observed POS ${candidate.observedPos} does not match lexicon POS ${candidate.candidatePos}.`
    };
  }

  if (candidate.confidence < 0.58) {
    return {
      decision: "skip",
      rationale: "Analyzer evidence is too weak for a contextual word decision."
    };
  }

  return {
    decision: "inject",
    rationale: "Analyzer evidence is compatible with the lexicon entry."
  };
}

function findLexiconEntriesForToken(
  token: AnalyzerToken,
  lookup: LexiconLookup
): SeedLexiconEntry[] {
  return uniqueLexiconEntries([
    ...(lookup.byNormalizedForm.get(token.normalized) ?? []),
    ...(token.lemma ? lookup.byNormalizedForm.get(normalizeToken(token.lemma)) ?? [] : [])
  ]);
}

function resolveTokenVocabStatus(
  token: AnalyzerToken,
  lookup: LexiconLookup,
  vocab: ReadonlyMap<string, UserVocabEntry>
): VocabStatus {
  const observedPos = toObservedContextPos(token);
  const lexiconEntry = findLexiconEntriesForToken(token, lookup).find(
    (entry) => observedPos === entry.pos
  );
  if (!lexiconEntry) {
    return "new";
  }

  return vocab.get(lexiconEntry.lemmaId)?.status ?? "new";
}

function buildLexiconLookup(entries: readonly SeedLexiconEntry[]): LexiconLookup {
  const byNormalizedForm = new Map<string, SeedLexiconEntry[]>();

  for (const entry of entries) {
    addLexiconForm(byNormalizedForm, entry.sourceLemma, entry);
    for (const inflection of entry.inflections ?? []) {
      addLexiconForm(byNormalizedForm, inflection, entry);
    }
  }

  return { byNormalizedForm };
}

function addLexiconForm(
  lookup: Map<string, SeedLexiconEntry[]>,
  form: string,
  entry: SeedLexiconEntry
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

function uniqueLexiconEntries(
  entries: readonly SeedLexiconEntry[]
): SeedLexiconEntry[] {
  const seen = new Set<string>();
  const output: SeedLexiconEntry[] = [];

  for (const entry of entries) {
    if (seen.has(entry.lemmaId)) {
      continue;
    }

    seen.add(entry.lemmaId);
    output.push(entry);
  }

  return output;
}

function buildContextSignatures(
  tokens: readonly AnalyzerToken[],
  tokenIndex: number,
  observedPos: ObservedContextPos,
  chunkType: ContextChunkType
): string[] {
  const signatures = new Set<string>();
  const token = tokens[tokenIndex];
  const previous = tokens[tokenIndex - 1];
  const next = tokens[tokenIndex + 1];

  if (previous && DETERMINERS.has(previous.normalized)) {
    signatures.add("determiner-before");
  }

  if (previous && DEMONSTRATIVES.has(previous.normalized)) {
    signatures.add("demonstrative-before");
  }

  if (previous && POSSESSIVES.has(previous.normalized)) {
    signatures.add("possessive-before");
  }

  if (previous && QUANTIFIERS.has(previous.normalized)) {
    signatures.add("quantifier-before");
  }

  if (previous?.pos === "noun") {
    signatures.add("noun-compound-before");
  }

  if (previous?.pos === "adjective") {
    signatures.add("noun-compound-after-adjective");
  }

  if (next?.pos === "noun" && observedPos === "adjective") {
    signatures.add("attributive-before-noun");
  }

  if (previous && BE_FORMS.has(previous.normalized) && observedPos === "adjective") {
    signatures.add("predicative-after-linking-verb");
  }

  if (previous?.normalized === "and" || next?.normalized === "and") {
    signatures.add("adjective-coordination");
  }

  if (token.normalized.endsWith("s") || token.tags.some((tag) => tag === "NNS")) {
    signatures.add("plural-morphology");
  }

  if (chunkType === "noun-phrase" && observedPos === "noun") {
    signatures.add("noun-head-subject");
  }

  if (token.normalized === "can" && next?.pos === "verb") {
    signatures.add("modal-before-base-verb");
  }

  if (tokenIndex === 0 && token.normalized === "can") {
    signatures.add("sentence-initial-modal-question");
  }

  if (observedPos === "verb") {
    signatures.add("finite-verb-head");
    signatures.add("present-tense-verb");
  }

  if (tokenIndex === 0 && observedPos === "verb") {
    signatures.add("imperative-head");
  }

  if (token.normalized === "watch" && next?.normalized === "out") {
    signatures.add("phrasal-verb-out");
  }

  if (token.normalized === "right" && previous?.pos === "verb") {
    signatures.add("directional-adverb");
  }

  if (token.normalized === "right" && next?.pos === "preposition") {
    signatures.add("degree-adverb-before-preposition");
  }

  if (tokenIndex === 0 && token.normalized === "right") {
    signatures.add("discourse-marker-sentence-initial");
  }

  if (observedPos === "verb" && next?.pos === "noun") {
    signatures.add("verb-object-frame");
  }

  return [...signatures].sort();
}

function scoreCandidateConfidence(input: {
  token: AnalyzerToken;
  tokenIndex: number;
  lexiconEntry: SeedLexiconEntry;
  observedPos: ObservedContextPos;
  chunkType: ContextChunkType;
  nearbyContextSignature: readonly string[];
}): number {
  let score = 0.5;

  if (input.observedPos === input.lexiconEntry.pos) {
    score += 0.24;
  }

  if (
    (input.lexiconEntry.pos === "noun" && input.chunkType === "noun-phrase") ||
    (input.lexiconEntry.pos === "adjective" && input.chunkType === "adjective-phrase")
  ) {
    score += 0.12;
  }

  if (input.nearbyContextSignature.length > 0) {
    score += Math.min(0.14, input.nearbyContextSignature.length * 0.04);
  }

  if (
    input.nearbyContextSignature.some((signature) =>
      signature.includes("blocked") || signature.includes("verb-object")
    )
  ) {
    score -= 0.12;
  }

  return Math.max(0, Math.min(1, score));
}

function findChunkForToken(
  chunks: readonly AnalyzerChunk[],
  tokenIndex: number
): AnalyzerChunk | undefined {
  return chunks.find(
    (chunk) => tokenIndex >= chunk.tokenStart && tokenIndex < chunk.tokenEnd
  );
}

function toContextChunkType(
  chunk: AnalyzerChunk | undefined,
  observedPos: ObservedContextPos
): ContextChunkType {
  if (chunk?.type === "noun-phrase") {
    return "noun-phrase";
  }

  if (chunk?.type === "verb-phrase") {
    return "verb-phrase";
  }

  if (chunk?.type === "adjective-phrase") {
    return "adjective-phrase";
  }

  if (chunk?.type === "adverb-phrase") {
    return "adverb-phrase";
  }

  if (observedPos === "adjective") {
    return "adjective-phrase";
  }

  if (observedPos === "adverb") {
    return "adverb-phrase";
  }

  return "other";
}

function toObservedContextPos(token: AnalyzerToken): ObservedContextPos {
  if (
    token.pos === "noun" ||
    token.pos === "verb" ||
    token.pos === "adjective" ||
    token.pos === "adverb" ||
    token.pos === "modal" ||
    token.pos === "auxiliary" ||
    token.pos === "preposition" ||
    token.pos === "pronoun" ||
    token.pos === "determiner" ||
    token.pos === "number" ||
    token.pos === "particle" ||
    token.pos === "conjunction" ||
    token.pos === "interjection"
  ) {
    return token.pos;
  }

  return "other";
}

function normalizeAnalysisCandidates(
  candidates: readonly SentenceAnalysisCandidate[]
): Required<Pick<SentenceAnalysisCandidate, "sentenceHash" | "sourceText">>[] {
  const byHash = new Map<
    string,
    Required<Pick<SentenceAnalysisCandidate, "sentenceHash" | "sourceText">>
  >();

  for (const candidate of candidates) {
    const sourceText = candidate.sourceText.replace(/\s+/g, " ").trim();
    if (!sourceText) {
      continue;
    }

    const sentenceHash = candidate.sentenceHash || hashSentence(sourceText);
    if (byHash.has(sentenceHash)) {
      continue;
    }

    byHash.set(sentenceHash, {
      sentenceHash,
      sourceText
    });
  }

  return [...byHash.values()];
}

async function loadBackgroundLexicon(): Promise<SeedLexiconEntry[]> {
  const storage = await readStorageValues([
    ...SEED_LEXICON_STORAGE_KEYS,
    ...RENDER_UNIT_STORAGE_KEYS,
    ...LEXEME_STORAGE_KEYS
  ]);
  const lexemes =
    parseLexemeAsset(pickFirstDefinedValue(storage, LEXEME_STORAGE_KEYS)) ??
    RUNTIME_LEXEMES;
  const storedRenderUnits = parseRenderUnitAsset(
    pickFirstDefinedValue(storage, RENDER_UNIT_STORAGE_KEYS)
  );
  if (storedRenderUnits && storedRenderUnits.entries.length > 0) {
    return renderUnitsToSeedLexiconEntries(
      storedRenderUnits.entries,
      lexemes?.entries ?? []
    );
  }

  const stored = parseSeedLexiconInput(
    pickFirstDefinedValue(storage, SEED_LEXICON_STORAGE_KEYS)
  );
  if (stored && stored.entries.length > 0) {
    return stored.entries;
  }

  return renderUnitsToSeedLexiconEntries(
    RUNTIME_RENDER_UNITS?.entries ?? [],
    RUNTIME_LEXEMES?.entries ?? []
  );
}

async function loadBackgroundRenderUnits(): Promise<RenderUnitEntry[]> {
  const storage = await readStorageValues(RENDER_UNIT_STORAGE_KEYS);
  const storedRenderUnits = parseRenderUnitAsset(
    pickFirstDefinedValue(storage, RENDER_UNIT_STORAGE_KEYS)
  );
  if (storedRenderUnits && storedRenderUnits.entries.length > 0) {
    return storedRenderUnits.entries;
  }

  return RUNTIME_RENDER_UNITS?.entries ?? [];
}

async function loadBackgroundVocab(): Promise<Map<string, UserVocabEntry>> {
  const storage = await readStorageValues(VOCAB_STORAGE_KEYS);
  return parseVocabEntries(pickFirstDefinedValue(storage, VOCAB_STORAGE_KEYS));
}

function parseVocabEntries(input: unknown): Map<string, UserVocabEntry> {
  const entries: UserVocabEntry[] = [];

  if (Array.isArray(input)) {
    for (const entry of input) {
      const normalized = normalizeVocabEntry(entry);
      if (normalized) {
        entries.push(normalized);
      }
    }
  } else if (isRecord(input)) {
    for (const value of Object.values(input)) {
      const normalized = normalizeVocabEntry(value);
      if (normalized) {
        entries.push(normalized);
      }
    }
  }

  return new Map(entries.map((entry) => [entry.lemmaId, entry] as const));
}

function normalizeVocabEntry(input: unknown): UserVocabEntry | null {
  if (!isRecord(input)) {
    return null;
  }

  const lemmaId = readString(input.lemmaId);
  if (!lemmaId) {
    return null;
  }

  return {
    lemmaId,
    status: normalizeVocabStatus(input.status),
    lastSeenAt: readString(input.lastSeenAt),
    exposureCount: readNumber(input.exposureCount, 0),
    updatedAt: readString(input.updatedAt) ?? new Date().toISOString()
  };
}

function normalizeVocabStatus(value: unknown): VocabStatus {
  return value === "known" || value === "learning" || value === "ignored"
    ? value
    : "new";
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const BE_FORMS = new Set(["am", "is", "are", "was", "were", "be", "been", "being"]);
const DETERMINERS = new Set(["a", "an", "the"]);
const DEMONSTRATIVES = new Set(["this", "that", "these", "those"]);
const POSSESSIVES = new Set(["my", "your", "his", "her", "its", "our", "their"]);
const QUANTIFIERS = new Set([
  "one",
  "two",
  "three",
  "many",
  "few",
  "several",
  "some",
  "any"
]);
