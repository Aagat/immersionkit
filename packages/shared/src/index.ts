export * from "./domain/analysis";
export * from "./domain/learning-items";
export * from "./domain/models";
export * from "./curriculum/checkpoint";
export * from "./curriculum/config";
export * from "./curriculum/content";
export * from "./curriculum/cognates";
export * from "./curriculum/grammar";
export * from "./curriculum/presentation";
export * from "./curriculum/profile";
export * from "./curriculum/runtime-activation";
export * from "./language-pairs/registry";
export * from "./messaging/contracts";
export * from "./scoring/difficulty";
export * from "./scoring/evidence";
export * from "./scoring/scheduler";
export * from "./scoring/sentence";
export {
  CONTEXTUAL_AMBIGUITY_RULES,
  INITIAL_AMBIGUOUS_WORD_INVENTORY,
  V1_AMBIGUOUS_WORD_GROUPS,
  WORD_INJECTION_DECISIONS,
  evaluateContextAwareDecision,
  evaluateContentBaselineDecision,
  getV1AmbiguityGroupForWord,
  isV1AmbiguousWord
} from "./scoring/word-injection";
export type {
  ContextualAmbiguityRule,
  WordInjectionDecision,
  WordInjectionDecisionCode,
  WordInjectionDecisionResult
} from "./scoring/word-injection";
export * from "./storage/adapter";
export * from "./storage/repositories";
export * from "./text/hash";
export * from "./text/cognates";
export * from "./text/normalize";
export * from "./text/phrases";
export * from "./text/sentences";
export * from "./text/tokenize";
export * from "./replacement/render-units";
export {
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
  materializePhraseTokens,
  materializePhraseTokensFromAnalyzerOutput,
  resolveOverlaps
} from "./phrases/detection";
export type { AnalyzerPhraseDetectionOptions } from "./phrases/detection";
export {
  CURATED_PHRASE_TARGET_LEXICON,
  FIXED_PHRASE_LEXICON,
  evaluatePhraseDetectorAgainstCorpus,
  evaluatePhraseDetectorAgainstCorpusAsync,
  evaluatePhraseDetectorAgainstCorpusWithLexicon,
  findCaseResult,
  hasOverlappingSelections,
  listPhraseDetectorImplementations,
} from "./validation/phrases";
export type {
  CuratedPhraseTargetEntry,
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
  WORD_INJECTION_EXPECTED_OUTCOMES,
  evaluateWordInjectionCorpus,
  mapExpectedOutcomeToDecision,
  runWordInjectionLibraryComparisons
} from "./validation/word-injection";
export type {
  WordInjectionCaseEvaluation,
  WordInjectionEvaluationSummary,
  WordInjectionExpectedOutcome,
  WordInjectionLibraryComparison,
  WordInjectionLibraryFeatureAgreement,
  WordInjectionLibraryImplementationId,
  WordInjectionStrategyMetrics
} from "./validation/word-injection";
