export * from "./domain/analysis";
export * from "./domain/models";
export * from "./messaging/contracts";
export * from "./scoring/difficulty";
export * from "./scoring/scheduler";
export * from "./scoring/sentence";
export * from "./storage/adapter";
export * from "./storage/repositories";
export * from "./text/hash";
export * from "./text/normalize";
export * from "./text/phrases";
export * from "./text/tokenize";
export {
  FIXED_PHRASE_LEXICON,
  buildCanonicalPhraseKey,
  detectAdjectiveNounPatterns,
  detectCoherentChunks,
  detectFixedPhraseLane,
  detectFixedPhrasesFromAnalyzerOutput,
  detectGrammarCarrierPatterns,
  detectGrammarCarriersFromAnalyzerOutput,
  detectHighConfidenceChunksFromAnalyzerOutput,
  detectPhraseCandidates,
  detectPhraseCandidatesFromAnalyzerOutput,
  detectPosBackedNounChunks,
  evaluatePhraseDetectorAgainstCorpus,
  evaluatePhraseDetectorAgainstCorpusAsync,
  evaluatePhraseDetectorAgainstCorpusWithLexicon,
  findCaseResult,
  hasOverlappingSelections,
  listPhraseDetectorImplementations,
  materializePhraseTokens,
  materializePhraseTokensFromAnalyzerOutput,
  resolveOverlaps
} from "./validation/phrases";
export type {
  AnalyzerPhraseDetectionOptions,
  FixedPhraseLexiconEntry,
  PhraseCandidate,
  PhraseCandidateSpan,
  PhraseCaseEvaluation,
  PhraseCategoryMetrics,
  PhraseChunkAnnotation,
  PhraseDetectionResult,
  PhraseDetector,
  PhraseDetectorImplementation,
  PhraseDetectorImplementationId,
  PhraseDetectorInputMode,
  PhraseErrorExample,
  PhraseEvaluationSummary,
  PhraseGoldCase,
  PhraseGoldCorpus,
  PhraseGoldExpectation,
  PhraseToken,
  PhraseTokenAnnotation
} from "./validation/phrases";
export * from "./validation/suitability";
export {
  CONTEXTUAL_AMBIGUITY_RULES,
  INITIAL_AMBIGUOUS_LEMMA_INVENTORY,
  V1_AMBIGUOUS_LEMMA_GROUPS,
  WORD_INJECTION_DECISIONS,
  WORD_INJECTION_EXPECTED_OUTCOMES,
  evaluateContextAwareDecision,
  evaluateLemmaOnlyDecision,
  evaluateWordInjectionCorpus,
  getV1AmbiguityGroupForLemma,
  isV1AmbiguousLemma,
  mapExpectedOutcomeToDecision,
  runWordInjectionLibraryComparisons
} from "./validation/word-injection";
export type {
  ContextualAmbiguityRule,
  WordInjectionCaseEvaluation,
  WordInjectionDecision,
  WordInjectionDecisionCode,
  WordInjectionDecisionResult,
  WordInjectionEvaluationSummary,
  WordInjectionExpectedOutcome,
  WordInjectionLibraryComparison,
  WordInjectionLibraryFeatureAgreement,
  WordInjectionLibraryImplementationId,
  WordInjectionStrategyMetrics
} from "./validation/word-injection";
