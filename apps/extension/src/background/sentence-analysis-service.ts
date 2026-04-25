import bundledSeedLexiconAsset from "../assets/en-es.seed.v1.json";
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
  type ObservedContextPos,
  type PhraseOccurrence,
  type SafeInjectionPos,
  type SeedLexiconEntry,
  type SentenceAnalysisEntry,
  type UserVocabEntry,
  type VocabStatus
} from "@immersionkit/shared";

import { parseSeedLexiconInput } from "../seed/seed-lexicon";
import {
  ChromeStoragePhraseRegistryRepository,
  type PhraseRegistryRepository
} from "./phrase-registry";
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
  analyzer?: SentenceAnalyzer | (() => Promise<SentenceAnalyzer>);
  loadLexicon?: () => Promise<SeedLexiconEntry[]>;
  loadVocab?: () => Promise<Map<string, UserVocabEntry>>;
};

type LexiconLookup = {
  byNormalizedForm: Map<string, SeedLexiconEntry[]>;
};

export class SentenceAnalysisService {
  private readonly cache: SentenceAnalysisCacheRepository;
  private readonly phraseRegistry: PhraseRegistryRepository;
  private readonly analyzerLoader: () => Promise<SentenceAnalyzer>;
  private readonly loadLexicon: () => Promise<SeedLexiconEntry[]>;
  private readonly loadVocab: () => Promise<Map<string, UserVocabEntry>>;

  constructor(options: SentenceAnalysisServiceOptions = {}) {
    this.cache = options.cache ?? new IndexedDbSentenceAnalysisCacheRepository();
    this.phraseRegistry =
      options.phraseRegistry ?? new ChromeStoragePhraseRegistryRepository();
    if (!options.analyzer) {
      this.analyzerLoader = getDefaultSentenceAnalyzer;
    } else if (isSentenceAnalyzer(options.analyzer)) {
      const analyzer = options.analyzer;
      this.analyzerLoader = async () => analyzer;
    } else {
      this.analyzerLoader = options.analyzer;
    }
    this.loadLexicon = options.loadLexicon ?? loadBackgroundLexicon;
    this.loadVocab = options.loadVocab ?? loadBackgroundVocab;
  }

  async analyzeCandidates(
    candidates: readonly SentenceAnalysisCandidate[]
  ): Promise<AnalyzedSentenceCandidate[]> {
    if (candidates.length === 0) {
      return [];
    }

    const analyzer = await this.analyzerLoader();
    const normalizedCandidates = normalizeAnalysisCandidates(candidates);
    const cachedEntries = await this.cache.getMany(
      normalizedCandidates.map((candidate) => candidate.sentenceHash),
      analyzer.analyzerVersion
    );
    const cachedByHash = new Map(
      cachedEntries.map((entry) => [entry.sentenceHash, entry] as const)
    );
    const lexicon = await this.loadLexicon();
    const vocab = await this.loadVocab();
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

      const analyzerOutput = await analyzer.analyze(
        candidate.sourceText,
        candidate.sentenceHash
      );
      const entry = buildAnalysisEntry(analyzerOutput, lookup, vocab, now);
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
    return results;
  }
}

function buildAnalysisEntry(
  analyzerOutput: AnalyzerOutput,
  lookup: LexiconLookup,
  vocab: ReadonlyMap<string, UserVocabEntry>,
  now: string
): SentenceAnalysisEntry {
  const contextualWordCandidates = buildContextualWordCandidates(
    analyzerOutput,
    lookup
  );
  const phraseMatches = buildPhraseOccurrences(analyzerOutput);
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
  analyzerOutput: AnalyzerOutput
): PhraseOccurrence[] {
  const detection = detectPhraseCandidatesFromAnalyzerOutput(analyzerOutput, undefined, {
    minimumChunkConfidence: 0.76
  });

  return detection.selectedCandidates.map((candidate) => ({
    occurrenceId: `${analyzerOutput.sentenceHash}:${analyzerOutput.analyzerVersion}:${candidate.span.startToken}-${candidate.span.endToken}:${candidate.ruleId}`,
    phraseId: buildRuntimePhraseId({
      normalizedSourceText: candidate.normalizedSourceText,
      sourceKind: candidate.sourceKind,
      normalizedTargetText: ""
    }),
    sentenceHash: analyzerOutput.sentenceHash,
    analyzerVersion: analyzerOutput.analyzerVersion,
    sourceText: candidate.sourceText,
    normalizedSourceText: candidate.normalizedSourceText,
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
  }));
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
  if (candidate.confidence < 0.58) {
    return {
      decision: "skip",
      rationale: "Analyzer evidence is too weak for a contextual word decision."
    };
  }

  if (
    candidate.observedPos !== candidate.candidatePos &&
    candidate.observedPos !== "other"
  ) {
    return {
      decision: "skip",
      rationale: `Observed POS ${candidate.observedPos} does not match lexicon POS ${candidate.candidatePos}.`
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
  const lexiconEntry = findLexiconEntriesForToken(token, lookup)[0];
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
  const storage = await readStorageValues(SEED_LEXICON_STORAGE_KEYS);
  const stored = parseSeedLexiconInput(
    pickFirstDefinedValue(storage, SEED_LEXICON_STORAGE_KEYS)
  );
  if (stored && stored.entries.length > 0) {
    return stored.entries;
  }

  return parseSeedLexiconInput(bundledSeedLexiconAsset)?.entries ?? [];
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
