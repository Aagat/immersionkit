import {
  BEGINNER_DIFFICULTY_PRESET,
  DEFAULT_LANGUAGE_PAIR_ID,
  createFallbackLanguagePairDefinition,
  buildRenderUnitRuntimeIndex,
  buildRuntimePhraseId,
  createSentenceAnalysisEntry,
  conjugateSpanishVerb,
  findRenderUnitTokenSpans,
  findVerbRenderEntriesForAnalyzerToken,
  findWordRenderEntriesForAnalyzerToken,
  hashSentence,
  normalizeToken,
  SPANISH_SUBJECT_PRONOUN_BY_PERSON,
  getLanguagePairDefinition,
  resolveGrammarConcept,
  scoreSentenceSuitability,
  scoreSentenceByVocabStatuses,
  resolveRenderUnitPhraseTarget,
  type AnalyzerChunk,
  type AnalyzerOutput,
  type AnalyzerToken,
  type ContextChunkType,
  type ContextualWordCandidate,
  type CuratedPhraseTargetEntry,
  type LanguagePairDefinition,
  type LanguagePairId,
  type ObservedContextPos,
  type PhraseOccurrence,
  type RenderUnitEntry,
  type RenderUnitRuntimeIndex,
  type SentenceAnalysisEntry,
  type SpanishVerbPerson,
  type UserVocabEntry,
  type VerbRenderEntry,
  type VocabStatus,
  type WordRenderEntry
} from "@immersionkit/shared";
import {
  evaluateContextAwareDecision,
  getV1AmbiguityGroupForWord
} from "@immersionkit/shared/runtime";
import { detectPhraseCandidatesFromAnalyzerOutput } from "@immersionkit/shared/phrases/detection";
import {
  RUNTIME_PHRASE_TARGET_LEXICON_BY_PAIR,
  buildSentenceAnalysisVersion
} from "./sentence-analysis-version";

import {
  getBackgroundAssetPackService,
  type BackgroundAssetPackService
} from "./asset-packs";
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
import { IndexedDbUserVocabRepository } from "../storage/user-data-repository";

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
  assetPacks?: Pick<BackgroundAssetPackService, "loadActiveContext">;
  loadRenderUnits?: () => Promise<RenderUnitEntry[]>;
  languagePair?: LanguagePairId;
  languagePairDefinitions?: ReadonlyMap<LanguagePairId, LanguagePairDefinition>;
  phraseTargetsByLanguagePair?: ReadonlyMap<
    LanguagePairId,
    readonly CuratedPhraseTargetEntry[]
  >;
  loadVocab?: () => Promise<Map<string, UserVocabEntry>>;
};

type DetectedPhraseCandidate = ReturnType<
  typeof detectPhraseCandidatesFromAnalyzerOutput
>["selectedCandidates"][number];

type WordRenderLookup = RenderUnitRuntimeIndex;

type ResolvedPhraseTarget = {
  targetText: string;
  normalizedTargetText: string;
  minBand?: string;
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
  private readonly loadAssetContext: () => Promise<{
    languagePair: LanguagePairId;
    renderUnits: RenderUnitEntry[];
  }>;
  private readonly phraseTargetsByLanguagePair: ReadonlyMap<
    LanguagePairId,
    readonly CuratedPhraseTargetEntry[]
  >;
  private readonly languagePairDefinitions: ReadonlyMap<
    LanguagePairId,
    LanguagePairDefinition
  >;
  private readonly loadVocab: () => Promise<Map<string, UserVocabEntry>>;
  private renderUnitIndexCache: {
    analysisVersion: string;
    index: RenderUnitRuntimeIndex;
  } | null = null;

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
    if (options.loadRenderUnits) {
      const loadRenderUnits = options.loadRenderUnits ?? (async () => []);
      this.loadAssetContext = async () => ({
        languagePair: options.languagePair ?? DEFAULT_LANGUAGE_PAIR_ID,
        renderUnits: await loadRenderUnits()
      });
    } else {
      const assetPacks = options.assetPacks ?? getBackgroundAssetPackService();
      this.loadAssetContext = () => assetPacks.loadActiveContext();
    }
    this.phraseTargetsByLanguagePair =
      options.phraseTargetsByLanguagePair ?? RUNTIME_PHRASE_TARGET_LEXICON_BY_PAIR;
    this.languagePairDefinitions = options.languagePairDefinitions ?? new Map();
    this.loadVocab = options.loadVocab ?? loadBackgroundVocab;
  }

  async analyzeCandidates(
    candidates: readonly SentenceAnalysisCandidate[]
  ): Promise<AnalyzedSentenceCandidate[]> {
    if (candidates.length === 0) {
      return [];
    }

    const analyzer = await this.analyzerLoader();
    const assetContext = await this.loadAssetContext();
    const languagePair = assetContext.languagePair;
    const pairDefinition =
      this.languagePairDefinitions.get(languagePair) ??
      getLanguagePairDefinition(languagePair) ??
      createFallbackLanguagePairDefinition(languagePair);
    const renderUnits = assetContext.renderUnits;
    const curatedPhraseTargets =
      this.phraseTargetsByLanguagePair.get(languagePair) ?? [];
    const analysisVersion = buildSentenceAnalysisVersion(
      analyzer.analyzerVersion,
      renderUnits,
      curatedPhraseTargets,
      pairDefinition.fixedPhraseLexicon,
      languagePair
    );
    const normalizedCandidates = normalizeAnalysisCandidates(candidates);
    const cachedEntries = await this.cache.getMany(
      normalizedCandidates.map((candidate) => candidate.sentenceHash),
      analysisVersion
    );
    const cachedByHash = new Map(
      cachedEntries.map((entry) => [entry.sentenceHash, entry] as const)
    );
    const vocab = await this.loadVocab();
    const lookup = this.getRenderUnitRuntimeIndex(renderUnits, analysisVersion);
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
      const entry = buildAnalysisEntry(
        analyzerOutput,
        lookup,
        vocab,
        now,
        renderUnits,
        pairDefinition,
        curatedPhraseTargets
      );
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
      results
        .flatMap((result) => result.entry.grammarFeatures)
        .filter((feature) => resolveGrammarConcept(feature.featureKey)),
      now
    );
    return results;
  }

  private getRenderUnitRuntimeIndex(
    renderUnits: readonly RenderUnitEntry[],
    analysisVersion: string
  ): RenderUnitRuntimeIndex {
    if (this.renderUnitIndexCache?.analysisVersion === analysisVersion) {
      return this.renderUnitIndexCache.index;
    }

    const index = buildRenderUnitRuntimeIndex(renderUnits);
    this.renderUnitIndexCache = {
      analysisVersion,
      index
    };
    return index;
  }
}

function buildAnalysisEntry(
  analyzerOutput: AnalyzerOutput,
  lookup: WordRenderLookup,
  vocab: ReadonlyMap<string, UserVocabEntry>,
  now: string,
  renderUnits: readonly RenderUnitEntry[],
  pairDefinition: LanguagePairDefinition,
  curatedPhraseTargets: readonly CuratedPhraseTargetEntry[]
): SentenceAnalysisEntry {
  const contextualWordCandidates = buildContextualWordCandidates(
    analyzerOutput,
    lookup
  );
  const phraseMatches = buildPhraseOccurrences(
    analyzerOutput,
    buildRenderUnitPhraseTargetResolver(renderUnits, curatedPhraseTargets),
    renderUnits,
    pairDefinition
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
  const suitabilityScore = scoreSentenceSuitability(
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
  lookup: WordRenderLookup
): ContextualWordCandidate[] {
  const candidates: ContextualWordCandidate[] = [];

  analyzerOutput.tokens.forEach((token, tokenIndex) => {
    const wordEntries = findWordRenderEntriesForToken(token, tokenIndex, analyzerOutput, lookup);
    for (const wordEntry of wordEntries) {
      const ambiguityGroup = getV1AmbiguityGroupForWord(
        wordEntry.sourceLemma
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
        wordEntry,
        observedPos,
        chunkType,
        nearbyContextSignature
      });
      const candidate: ContextualWordCandidate = {
        id: `${analyzerOutput.sentenceHash}:${tokenIndex}:${wordEntry.renderUnitId}:${wordEntry.lexemeId}`,
        sentenceHash: analyzerOutput.sentenceHash,
        sentence: analyzerOutput.sourceText,
        tokenText: token.text,
        surfaceText: token.text,
        normalizedText: token.normalized,
        renderUnitId: wordEntry.renderUnitId,
        renderUnitMinBand: wordEntry.renderUnitMinBand,
        lexemeId: wordEntry.lexemeId,
        normalizedSourceText: wordEntry.normalizedSourceText,
        targetText: wordEntry.targetText,
        targetLemma: wordEntry.targetLemma,
        candidateLemma: wordEntry.sourceLemma,
        candidatePos: wordEntry.pos,
        frequencyRank: wordEntry.frequencyRank,
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
        ambiguityGroup: ambiguityGroup ?? `unambiguous:${wordEntry.sourceLemma}`,
        confidence
      };

      if (wordEntry.renderUnitMatchMode === "analyzer-pattern") {
        const analyzerPatternDecision = evaluateAnalyzerPatternCandidate({
          tokenIndex,
          analyzerOutput,
          wordEntry
        });
        candidates.push({
          ...candidate,
          decision: analyzerPatternDecision.decision,
          rationale: analyzerPatternDecision.rationale
        });
        continue;
      }

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

    const verbEntries = findVerbRenderEntriesForAnalyzerToken({
      token,
      index: lookup
    });
    for (const verbEntry of verbEntries) {
      const frameDecision = evaluateVerbFrameCandidate({
        tokenIndex,
        analyzerOutput,
        verbEntry
      });
      if (!frameDecision) {
        continue;
      }

      const startToken = frameDecision.startToken ?? tokenIndex;
      const endToken = frameDecision.endToken ?? tokenIndex + 1;
      const firstToken = analyzerOutput.tokens[startToken];
      const lastToken = analyzerOutput.tokens[endToken - 1];
      if (!firstToken || !lastToken) {
        continue;
      }

      const sourceText = analyzerOutput.sourceText.slice(
        firstToken.startOffset,
        lastToken.endOffset
      );
      candidates.push({
        id: `${analyzerOutput.sentenceHash}:${startToken}-${endToken}:${verbEntry.renderUnitId}:${verbEntry.lexemeId}:${frameDecision.frameType}`,
        sentenceHash: analyzerOutput.sentenceHash,
        sentence: analyzerOutput.sourceText,
        tokenText: sourceText,
        surfaceText: sourceText,
        normalizedText: normalizeToken(sourceText),
        renderUnitId: verbEntry.renderUnitId,
        renderUnitMinBand: verbEntry.renderUnitMinBand,
        lexemeId: verbEntry.lexemeId,
        normalizedSourceText: verbEntry.normalizedSourceText,
        targetText: frameDecision.targetText,
        targetLemma: verbEntry.targetInfinitive,
        candidateLemma: verbEntry.sourceLemma,
        candidatePos: "verb",
        frequencyRank: verbEntry.frequencyRank,
        observedPos: toObservedContextPos(token),
        chunkType: "verb-phrase",
        chunkText: sourceText,
        tokenStart: startToken,
        tokenEnd: endToken,
        startChar: firstToken.startOffset,
        endChar: lastToken.endOffset,
        leftContextLemmas: analyzerOutput.tokens
          .slice(Math.max(0, startToken - 3), startToken)
          .map((entry) => entry.lemma ?? entry.normalized),
        rightContextLemmas: analyzerOutput.tokens
          .slice(endToken, endToken + 3)
          .map((entry) => entry.lemma ?? entry.normalized),
        nearbyContextSignature: [
          `verb-frame:${frameDecision.frameType}`
        ],
        patternId: `verb-frame:${frameDecision.frameType}`,
        ambiguityGroup: `verb:${verbEntry.sourceLemma}`,
        confidence: frameDecision.confidence,
        decision: frameDecision.decision,
        rationale: frameDecision.rationale
      });
    }
  });

  return candidates;
}

function evaluateAnalyzerPatternCandidate(input: {
  tokenIndex: number;
  analyzerOutput: AnalyzerOutput;
  wordEntry: WordRenderEntry;
}): { decision: "inject" | "skip"; rationale: string } {
  const token = input.analyzerOutput.tokens[input.tokenIndex];
  const next = input.analyzerOutput.tokens[input.tokenIndex + 1];
  if (
    (input.wordEntry.sourceLemma === "like" ||
      input.wordEntry.normalizedSourceText === "like") &&
    token?.normalized === "like" &&
    (next?.pos === "determiner" ||
      next?.pos === "pronoun" ||
      next?.pos === "noun" ||
      next?.pos === "proper-noun" ||
      next?.pos === "adjective")
  ) {
    return {
      decision: "skip",
      rationale: "Comparative preposition frame is unsafe for the discourse-marker render unit."
    };
  }

  return {
    decision: "inject",
    rationale: "Analyzer pattern matched the approved render unit."
  };
}

type VerbFrameDecision = {
  decision: "inject" | "skip";
  frameType:
    | "subject-present"
    | "imperative"
    | "modal-infinitive"
    | "to-infinitive"
    | "present-progressive"
    | "unsafe";
  targetText: string;
  startToken?: number;
  endToken?: number;
  confidence: number;
  rationale: string;
};

function evaluateVerbFrameCandidate(input: {
  tokenIndex: number;
  analyzerOutput: AnalyzerOutput;
  verbEntry: VerbRenderEntry;
}): VerbFrameDecision | null {
  const { tokenIndex, analyzerOutput, verbEntry } = input;
  const tokens = analyzerOutput.tokens;
  const token = tokens[tokenIndex];
  if (!token || !tokenMatchesVerbEntry(token, verbEntry)) {
    return null;
  }

  const previous = tokens[tokenIndex - 1];
  const previous2 = tokens[tokenIndex - 2];
  const next = tokens[tokenIndex + 1];

  if (isGerundSurface(token) && previous && previous2) {
    const subjectPerson = readSubjectPronounPerson(previous2);
    if (subjectPerson && isPresentBeForm(previous)) {
      const targetText = conjugateProgressiveTarget(
        verbEntry.targetInfinitive,
        subjectPerson
      );
      if (targetText) {
        return {
          decision: "inject",
          frameType: "present-progressive",
          startToken: tokenIndex - 2,
          endToken: tokenIndex + 1,
          targetText,
          confidence: 0.9,
          rationale: "Clear subject + present be + gerund frame matched the approved verb unit."
        };
      }
    }
  }

  if (previous?.normalized === "to" && isBaseVerbSurface(token, verbEntry)) {
    return {
      decision: "inject",
      frameType: "to-infinitive",
      targetText: verbEntry.targetInfinitive,
      confidence: 0.84,
      rationale: "Infinitive particle before an approved base verb is safe to render as a Spanish infinitive."
    };
  }

  if (previous && isModalToken(previous) && isBaseVerbSurface(token, verbEntry)) {
    if (getV1AmbiguityGroupForWord(verbEntry.sourceLemma)) {
      return unsafeVerbDecision(
        verbEntry,
        "Modal + base verb is too weak for the V1 ambiguous verb inventory."
      );
    }

    return {
      decision: "inject",
      frameType: "modal-infinitive",
      targetText: verbEntry.targetInfinitive,
      confidence: 0.84,
      rationale: "Modal before an approved base verb is safe to render as a Spanish infinitive."
    };
  }

  const subjectPerson = previous ? readSubjectPronounPerson(previous) : null;
  if (subjectPerson) {
    if (previous.normalized === "it") {
      return unsafeVerbDecision(
        verbEntry,
        "The pronoun 'it' needs Spanish gender or impersonal context."
      );
    }

    if (isQuestionAuxiliaryBeforeSubject(previous2, previous)) {
      return unsafeVerbDecision(
        verbEntry,
        "Question and do-support frames need phrase-level word order handling."
      );
    }

    if (isUnsafeHaveAuxiliaryFrame(verbEntry, next)) {
      return unsafeVerbDecision(
        verbEntry,
        "Auxiliary have frames are unsafe for possession-style inline rendering."
      );
    }

    if (isLikelyPastOrParticipleSurface(token, verbEntry)) {
      return unsafeVerbDecision(
        verbEntry,
        "Past and participle verb forms are skipped until tense/aspect selection is explicit."
      );
    }

    const targetText = conjugateSubjectPresentTarget(
      verbEntry.targetInfinitive,
      subjectPerson
    );
    if (targetText && isLikelyPresentVerbSurface(token, verbEntry, subjectPerson)) {
      return {
        decision: "inject",
        frameType: "subject-present",
        startToken: tokenIndex - 1,
        endToken: tokenIndex + 1,
        targetText,
        confidence: 0.88,
        rationale: "Clear subject pronoun + present verb frame matched the approved verb unit."
      };
    }
  }

  if (isCommandHead(tokens, tokenIndex) && isBaseVerbSurface(token, verbEntry)) {
    if (isUnsafeCommandAuxiliaryFrame(verbEntry, next)) {
      return unsafeVerbDecision(
        verbEntry,
        "Sentence-initial auxiliary, modal, or negated command frame is unsafe."
      );
    }

    if (next && isCommandBlockingNextToken(next)) {
      return unsafeVerbDecision(
        verbEntry,
        "Sentence-initial auxiliary/question-like command frame is unsafe."
      );
    }

    const targetText = conjugateSpanishVerb(verbEntry.targetInfinitive, {
      mood: "affirmative-tu-imperative"
    });
    if (targetText) {
      return {
        decision: "inject",
        frameType: "imperative",
        targetText,
        confidence: 0.86,
        rationale: "Sentence-initial approved base verb matched a safe imperative command frame."
      };
    }
  }

  return unsafeVerbDecision(
    verbEntry,
    "No safe local verb frame matched this occurrence."
  );
}

function unsafeVerbDecision(
  verbEntry: VerbRenderEntry,
  rationale: string
): VerbFrameDecision {
  return {
    decision: "skip",
    frameType: "unsafe",
    targetText: verbEntry.targetInfinitive,
    confidence: 0.5,
    rationale
  };
}

function conjugateSubjectPresentTarget(
  infinitive: string,
  person: SpanishVerbPerson
): string | null {
  const verb = conjugateSpanishVerb(infinitive, {
    mood: "present-indicative",
    person
  });
  if (!verb) {
    return null;
  }

  return `${SPANISH_SUBJECT_PRONOUN_BY_PERSON[person]} ${verb}`;
}

function conjugateProgressiveTarget(
  infinitive: string,
  person: SpanishVerbPerson
): string | null {
  const estar = conjugateSpanishVerb("estar", {
    mood: "present-indicative",
    person
  });
  const gerund = conjugateSpanishVerb(infinitive, { mood: "gerund" });
  return estar && gerund ? `${estar} ${gerund}` : null;
}

function tokenMatchesVerbEntry(token: AnalyzerToken, verbEntry: VerbRenderEntry): boolean {
  return (
    token.normalized === verbEntry.normalizedSourceText ||
    normalizeToken(token.lemma ?? "") === verbEntry.normalizedSourceText
  );
}

function isBaseVerbSurface(token: AnalyzerToken, verbEntry: VerbRenderEntry): boolean {
  return token.normalized === verbEntry.normalizedSourceText;
}

function isLikelyPresentVerbSurface(
  token: AnalyzerToken,
  verbEntry: VerbRenderEntry,
  person: SpanishVerbPerson
): boolean {
  if (isGerundSurface(token) || isLikelyPastOrParticipleSurface(token, verbEntry)) {
    return false;
  }

  const expected = englishPresentForms(verbEntry.sourceLemma, person);
  return expected.size === 0 || expected.has(token.normalized);
}

function englishPresentForms(
  lemma: string,
  person: SpanishVerbPerson
): Set<string> {
  const third = person === "third-singular";
  if (lemma === "be") {
    return new Set(
      person === "first-singular"
        ? ["am"]
        : person === "second-singular" || person === "first-plural" || person === "third-plural"
          ? ["are"]
          : ["is"]
    );
  }

  if (lemma === "have") {
    return new Set(third ? ["has"] : ["have"]);
  }

  if (lemma === "do") {
    return new Set(third ? ["does"] : ["do"]);
  }

  if (lemma === "can" || lemma === "must" || lemma === "should") {
    return new Set([lemma]);
  }

  return new Set(third ? [thirdPersonEnglishPresent(lemma)] : [lemma]);
}

function thirdPersonEnglishPresent(lemma: string): string {
  if (lemma.endsWith("y") && !/[aeiou]y$/.test(lemma)) {
    return `${lemma.slice(0, -1)}ies`;
  }

  if (/(s|sh|ch|x|z|o)$/.test(lemma)) {
    return `${lemma}es`;
  }

  return `${lemma}s`;
}

function isLikelyPastOrParticipleSurface(
  token: AnalyzerToken,
  verbEntry: VerbRenderEntry
): boolean {
  const normalized = token.normalized;
  if (IRREGULAR_PAST_BY_LEMMA.get(verbEntry.sourceLemma)?.has(normalized)) {
    return true;
  }

  return (
    normalized !== verbEntry.normalizedSourceText &&
    (normalized.endsWith("ed") || normalized.endsWith("en"))
  );
}

function isGerundSurface(token: AnalyzerToken): boolean {
  return token.normalized.endsWith("ing");
}

function readSubjectPronounPerson(token: AnalyzerToken): SpanishVerbPerson | null {
  if (token.normalized === "i") {
    return "first-singular";
  }

  if (token.normalized === "you") {
    return "second-singular";
  }

  if (token.normalized === "he" || token.normalized === "she") {
    return "third-singular";
  }

  if (token.normalized === "we") {
    return "first-plural";
  }

  if (token.normalized === "they") {
    return "third-plural";
  }

  return token.normalized === "it" ? "third-singular" : null;
}

function isPresentBeForm(token: AnalyzerToken): boolean {
  return token.lemma === "be" && PRESENT_BE_FORMS.has(token.normalized);
}

function isModalToken(token: AnalyzerToken): boolean {
  return token.pos === "modal" || MODAL_FORMS.has(token.normalized);
}

function isQuestionAuxiliaryBeforeSubject(
  token: AnalyzerToken | undefined,
  subject: AnalyzerToken
): boolean {
  return (
    Boolean(token) &&
    QUESTION_AUXILIARY_FORMS.has(token?.normalized ?? "") &&
    readSubjectPronounPerson(subject) !== null
  );
}

function isUnsafeHaveAuxiliaryFrame(
  verbEntry: VerbRenderEntry,
  next: AnalyzerToken | undefined
): boolean {
  return (
    verbEntry.sourceLemma === "have" &&
    (next?.normalized === "to" || next?.pos === "verb")
  );
}

function isUnsafeCommandAuxiliaryFrame(
  verbEntry: VerbRenderEntry,
  next: AnalyzerToken | undefined
): boolean {
  if (next && isNegationToken(next)) {
    return true;
  }

  if (verbEntry.sourceLemma === "do") {
    return next?.pos === "verb" || next?.pos === "auxiliary" || next?.pos === "modal";
  }

  if (verbEntry.sourceLemma === "have") {
    return next?.normalized === "to" || next?.pos === "verb";
  }

  return MODAL_FORMS.has(verbEntry.sourceLemma);
}

function isCommandHead(tokens: readonly AnalyzerToken[], tokenIndex: number): boolean {
  if (tokenIndex === 0) {
    return true;
  }

  return SENTENCE_BREAK_TOKENS.has(tokens[tokenIndex - 1]?.normalized ?? "");
}

function isCommandBlockingNextToken(token: AnalyzerToken): boolean {
  return (
    token.pos === "pronoun" ||
    token.normalized === "you" ||
    SENTENCE_BREAK_TOKENS.has(token.normalized)
  );
}

function isNegationToken(token: AnalyzerToken): boolean {
  return NEGATION_TOKENS.has(token.normalized);
}

function isSentenceAnalyzer(value: SentenceAnalyzer | (() => Promise<SentenceAnalyzer>)): value is SentenceAnalyzer {
  return typeof value === "object" && value !== null && "analyze" in value;
}

function buildPhraseOccurrences(
  analyzerOutput: AnalyzerOutput,
  resolvePhraseTarget: PhraseTargetResolver,
  renderUnits: readonly RenderUnitEntry[],
  pairDefinition: LanguagePairDefinition
): PhraseOccurrence[] {
  const detection = detectPhraseCandidatesFromAnalyzerOutput(
    analyzerOutput,
    pairDefinition.fixedPhraseLexicon,
    {
      minimumChunkConfidence: 0.76
    }
  );
  const renderUnitOccurrences = buildRenderUnitPhraseOccurrences(
    analyzerOutput,
    renderUnits
  );

  const detectedOccurrences = detection.selectedCandidates.map((candidate) => {
    const resolvedTarget = resolveDetectedPhraseTarget(candidate, resolvePhraseTarget);
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
      phraseMinBand: resolvedTarget?.minBand,
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

function resolveDetectedPhraseTarget(
  candidate: DetectedPhraseCandidate,
  resolvePhraseTarget: PhraseTargetResolver
): ResolvedPhraseTarget | null {
  const candidateTargetText = readString(candidate.targetText);
  const candidateNormalizedTargetText = readString(candidate.normalizedTargetText);
  if (candidateTargetText && candidateNormalizedTargetText) {
    return {
      targetText: candidateTargetText,
      normalizedTargetText: candidateNormalizedTargetText,
      minBand: candidate.minBand
    };
  }

  return resolvePhraseTarget({
    sourceText: candidate.sourceText,
    normalizedSourceText: candidate.normalizedSourceText,
    sourceKind: candidate.sourceKind,
    category: candidate.category
  });
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
      renderUnit.kind === "verb-frame" ||
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

function buildRenderUnitPhraseTargetResolver(
  renderUnits: readonly RenderUnitEntry[],
  curatedPhraseTargets: readonly CuratedPhraseTargetEntry[]
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

    const curatedTarget = curatedPhraseTargets.find(
      (entry) =>
        entry.sourceKind === input.sourceKind &&
        entry.category === input.category &&
        entry.normalizedSourceText === input.normalizedSourceText
    );
    if (curatedTarget) {
      return {
        targetText: curatedTarget.targetText,
        normalizedTargetText: curatedTarget.normalizedTargetText,
        minBand: curatedTarget.minBand
      };
    }

    return null;
  };
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
    Boolean(getV1AmbiguityGroupForWord(candidate.candidateLemma))
  ).length;
  const skippedAmbiguousCount = contextualWordCandidates.filter(
    (candidate) =>
      Boolean(getV1AmbiguityGroupForWord(candidate.candidateLemma)) &&
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
  if (
    candidate.candidateLemma === "map" &&
    candidate.leftContextLemmas?.includes("release")
  ) {
    return {
      decision: "skip",
      rationale: "Product-term frame 'release maps' is safer to keep in English."
    };
  }

  if (candidate.observedPos !== candidate.candidatePos) {
    return {
      decision: "skip",
      rationale: `Observed POS ${candidate.observedPos} does not match render-unit POS ${candidate.candidatePos}.`
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
    rationale: "Analyzer evidence is compatible with the render unit."
  };
}

function findWordRenderEntriesForToken(
  token: AnalyzerToken,
  tokenIndex: number,
  analyzerOutput: AnalyzerOutput | null,
  lookup: WordRenderLookup
): WordRenderEntry[] {
  return findWordRenderEntriesForAnalyzerToken({
    token,
    tokenIndex,
    tokens: analyzerOutput?.tokens ?? null,
    index: lookup
  });
}

function resolveTokenVocabStatus(
  token: AnalyzerToken,
  lookup: WordRenderLookup,
  vocab: ReadonlyMap<string, UserVocabEntry>
): VocabStatus {
  const observedPos = toObservedContextPos(token);
  const wordEntry = findWordRenderEntriesForToken(token, -1, null, lookup).find(
    (entry) => observedPos === entry.pos
  );
  if (!wordEntry) {
    const verbEntry = findVerbRenderEntriesForAnalyzerToken({
      token,
      index: lookup
    })[0];
    return verbEntry ? vocab.get(verbEntry.lexemeId)?.status ?? "new" : "new";
  }

  return vocab.get(wordEntry.lexemeId)?.status ?? "new";
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
  wordEntry: WordRenderEntry;
  observedPos: ObservedContextPos;
  chunkType: ContextChunkType;
  nearbyContextSignature: readonly string[];
}): number {
  let score = 0.5;

  if (input.observedPos === input.wordEntry.pos) {
    score += 0.24;
  }

  if (
    (input.wordEntry.pos === "noun" && input.chunkType === "noun-phrase") ||
    (input.wordEntry.pos === "adjective" && input.chunkType === "adjective-phrase")
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

async function loadBackgroundVocab(): Promise<Map<string, UserVocabEntry>> {
  return new IndexedDbUserVocabRepository().loadAll();
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

const BE_FORMS = new Set(["am", "is", "are", "was", "were", "be", "been", "being"]);
const PRESENT_BE_FORMS = new Set(["am", "is", "are"]);
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
const QUESTION_AUXILIARY_FORMS = new Set([
  "am",
  "are",
  "can",
  "could",
  "did",
  "do",
  "does",
  "had",
  "has",
  "have",
  "is",
  "may",
  "might",
  "must",
  "shall",
  "should",
  "was",
  "were",
  "will",
  "would"
]);
const SENTENCE_BREAK_TOKENS = new Set([".", "?", "!"]);
const NEGATION_TOKENS = new Set(["not", "n't", "nt", "n’t", "never"]);
const IRREGULAR_PAST_BY_LEMMA = new Map<string, Set<string>>([
  ["be", new Set(["was", "were", "been"])],
  ["become", new Set(["became", "become"])],
  ["begin", new Set(["began", "begun"])],
  ["break", new Set(["broke", "broken"])],
  ["bring", new Set(["brought"])],
  ["build", new Set(["built"])],
  ["buy", new Set(["bought"])],
  ["catch", new Set(["caught"])],
  ["choose", new Set(["chose", "chosen"])],
  ["come", new Set(["came", "come"])],
  ["do", new Set(["did", "done"])],
  ["drink", new Set(["drank", "drunk"])],
  ["eat", new Set(["ate", "eaten"])],
  ["fall", new Set(["fell", "fallen"])],
  ["feel", new Set(["felt"])],
  ["find", new Set(["found"])],
  ["get", new Set(["got", "gotten"])],
  ["give", new Set(["gave", "given"])],
  ["go", new Set(["went", "gone"])],
  ["grow", new Set(["grew", "grown"])],
  ["have", new Set(["had"])],
  ["hear", new Set(["heard"])],
  ["know", new Set(["knew", "known"])],
  ["leave", new Set(["left"])],
  ["lose", new Set(["lost"])],
  ["make", new Set(["made"])],
  ["pay", new Set(["paid"])],
  ["put", new Set(["put"])],
  ["read", new Set(["read"])],
  ["run", new Set(["ran", "run"])],
  ["say", new Set(["said"])],
  ["see", new Set(["saw", "seen"])],
  ["sell", new Set(["sold"])],
  ["send", new Set(["sent"])],
  ["sleep", new Set(["slept"])],
  ["speak", new Set(["spoke", "spoken"])],
  ["take", new Set(["took", "taken"])],
  ["tell", new Set(["told"])],
  ["think", new Set(["thought"])],
  ["throw", new Set(["threw", "thrown"])],
  ["understand", new Set(["understood"])],
  ["wear", new Set(["wore", "worn"])],
  ["win", new Set(["won"])],
  ["write", new Set(["wrote", "written"])]
]);
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
