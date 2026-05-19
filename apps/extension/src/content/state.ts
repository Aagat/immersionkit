import {
  DEFAULT_SOURCE_LANGUAGE,
  getLanguagePairDefinition,
  getActiveCurriculumContent,
  resolveActiveCurriculumBand,
  type BeginnerCognatePolicy,
  type CurriculumConfig,
  type CurriculumRuntimeProfileInput,
  type LearningItem,
  type SupportedSourceLanguage,
  type SupportedTargetLanguage,
  type UserVocabEntry
} from "@immersionkit/shared";
import type { PageDiagnosticsSnapshot } from "../diagnostics/page-diagnostics";
import { createDefaultDiagnostics, type ContentDiagnosticsProcessingState } from "./diagnostics";
import { ContentEvidenceTracker } from "./evidence";
import type { ContentPopoverRuntimeState } from "./popover";
import { SentenceAnchorRegistry } from "./sentence-anchor-registry";
import type {
  CachedGrammarFeature,
  CachedPhraseMatch,
  CachedWordRenderDecision,
  ProcessingContext,
  RuntimeAnalysisContext
} from "./storage";
import type { ContentWrapperRegistryState } from "./wrapper-registry";
import type {
  AnalyzerPatternWordRenderIndex,
  WordRenderIndex
} from "./word-render-index";

export type ProcessingAnalysisCacheState = {
  analysisContext: RuntimeAnalysisContext;
  cachedWordRenderDecisions: Map<string, CachedWordRenderDecision[]>;
  cachedPhraseMatchesBySentenceHash: Map<string, CachedPhraseMatch[]>;
  cachedGrammarFeaturesBySentenceHash: Map<string, CachedGrammarFeature[]>;
};

export type ProcessingCurriculumState = {
  config: CurriculumConfig;
  profile: CurriculumRuntimeProfileInput;
  beginnerCognatePolicy: BeginnerCognatePolicy | null;
  activeWordContent: ReturnType<typeof getActiveCurriculumContent>;
  activePhraseContent: ReturnType<typeof getActiveCurriculumContent>;
};

export type ProcessingMutationState = {
  pendingRoots: Set<ParentNode>;
  flushHandle: number | null;
  observer: MutationObserver | null;
};

export type ProcessingRenderRegistryState = ContentWrapperRegistryState & {
  sentenceAnchorRegistry: SentenceAnchorRegistry;
};

export type ProcessingState = {
  discoveryRate: number;
  sourceLanguage: SupportedSourceLanguage;
  targetLanguage: SupportedTargetLanguage;
  samplingSeed: string;
  wordRenderIndex: WordRenderIndex;
  analyzerPatternWordRenderIndex: AnalyzerPatternWordRenderIndex;
  vocabByLexemeId: Map<string, UserVocabEntry>;
  learningItemsByUnitRefId: Map<string, LearningItem>;
  sentenceHintPhrases: string[];
  analysisCache: ProcessingAnalysisCacheState;
  diagnostics: ContentDiagnosticsProcessingState;
  curriculum: ProcessingCurriculumState;
  mutation: ProcessingMutationState;
  renderRegistry: ProcessingRenderRegistryState;
  sentenceTranslationEnabled: boolean;
  evidenceTracker: ContentEvidenceTracker;
  isActive: boolean;
};

export type RuntimeState = ContentPopoverRuntimeState & {
  processing: ProcessingState | null;
  refreshPromise: Promise<void> | null;
  diagnostics: PageDiagnosticsSnapshot;
};

export function createRuntimeState(): RuntimeState {
  return {
    processing: null,
    refreshPromise: null,
    activeToken: null,
    popover: null,
    popoverCleanup: null,
    diagnostics: createDefaultDiagnostics()
  };
}

export function createProcessingState(input: {
  processingContext: ProcessingContext;
  wordRenderIndex: WordRenderIndex;
  analyzerPatternWordRenderIndex: AnalyzerPatternWordRenderIndex;
  sentenceTranslationEnabled: boolean;
}): ProcessingState {
  const { processingContext } = input;
  const languagePair = getLanguagePairDefinition(
    processingContext.settings.languagePair
  );

  return {
    discoveryRate: processingContext.discoveryRate,
    sourceLanguage: processingContext.settings.sourceLanguage ?? DEFAULT_SOURCE_LANGUAGE,
    targetLanguage: processingContext.settings.targetLanguage,
    samplingSeed: `${window.location.hostname}${window.location.pathname}`,
    wordRenderIndex: input.wordRenderIndex,
    analyzerPatternWordRenderIndex: input.analyzerPatternWordRenderIndex,
    vocabByLexemeId: processingContext.vocabByLexemeId,
    learningItemsByUnitRefId: processingContext.learningItemsByUnitRefId,
    sentenceHintPhrases: processingContext.sentenceHintPhrases,
    analysisCache: {
      analysisContext: processingContext.analysisContext,
      cachedWordRenderDecisions: processingContext.cachedWordRenderDecisions,
      cachedPhraseMatchesBySentenceHash:
        processingContext.cachedPhraseMatchesBySentenceHash,
      cachedGrammarFeaturesBySentenceHash:
        processingContext.cachedGrammarFeaturesBySentenceHash
    },
    diagnostics: {
      seenSentenceHashes: new Set<string>(),
      processedTextNodes: 0,
      injectedTokens: 0,
      injectedPhrases: 0,
      rejectedPhrases: 0,
      contextSkippedTokens: 0,
      analysisSuppressedTokens: 0,
      sentenceCandidatesQueued: 0,
      sentenceNotesRendered: 0,
      mutationCacheRefreshes: 0,
      mutationCacheRefreshHits: 0,
      freshPhraseAnalysisHits: 0,
      freshPhraseRerenders: 0,
      curriculumConfigId: processingContext.curriculumConfig.configId,
      activeCurriculumBandId:
        resolveActiveCurriculumBand(
          processingContext.curriculumConfig,
          "word",
          processingContext.learningProfile
        )?.bandId ?? null,
      curriculumSkippedSentences: 0,
      curriculumSkippedWords: 0,
      curriculumSkippedPhrases: 0,
      sentenceRankingReasons: [],
      unrenderedPhraseRejections: []
    },
    curriculum: {
      config: processingContext.curriculumConfig,
      profile: processingContext.learningProfile,
      beginnerCognatePolicy: languagePair?.beginnerCognatePolicy ?? null,
      activeWordContent: getActiveCurriculumContent({
        config: processingContext.curriculumConfig,
        profile: processingContext.learningProfile,
        beginnerCognatePolicy: languagePair?.beginnerCognatePolicy ?? null,
        unitType: "word"
      }),
      activePhraseContent: getActiveCurriculumContent({
        config: processingContext.curriculumConfig,
        profile: processingContext.learningProfile,
        unitType: "phrase"
      })
    },
    mutation: {
      pendingRoots: new Set<ParentNode>(),
      flushHandle: null,
      observer: null
    },
    renderRegistry: {
      nodeSequence: 0,
      wrappersBySentenceHash: new Map(),
      wrapperMetadataByNodeId: new Map(),
      sentenceAnchorRegistry: new SentenceAnchorRegistry()
    },
    sentenceTranslationEnabled: input.sentenceTranslationEnabled,
    evidenceTracker: new ContentEvidenceTracker(),
    isActive: true
  };
}

export function getCurriculumBandPreference(config: CurriculumConfig): string[] {
  const seen = new Set<string>();
  return [...config.bands]
    .filter((band) => typeof band.bandId === "string" && band.bandId.trim().length > 0)
    .sort((left, right) => left.order - right.order)
    .flatMap((band): string[] => {
      if (seen.has(band.bandId)) {
        return [];
      }

      seen.add(band.bandId);
      return [band.bandId];
    });
}

export function isSentenceTranslationEnabled(
  sentenceTranslationEnabled: boolean,
  provider: string
): boolean {
  return sentenceTranslationEnabled && provider === "openai";
}
