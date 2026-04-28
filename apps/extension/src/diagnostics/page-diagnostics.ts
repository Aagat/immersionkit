export const PAGE_DIAGNOSTICS_MESSAGE_TYPE = "immersionkit/content/get-page-diagnostics";

export type PageDiagnosticsMessage = {
  type: typeof PAGE_DIAGNOSTICS_MESSAGE_TYPE;
};

export type PageDiagnosticsSnapshot = {
  pageUrl: string;
  pageHostname: string;
  pagePathname: string;
  siteEnabled: boolean;
  sentenceTranslationEnabled: boolean;
  lexiconSource: string;
  lexiconEntryCount: number;
  lexiconAssetVersion: string | null;
  fallbackLexicon: boolean;
  processedTextNodes: number;
  injectedTokens: number;
  injectedPhrases: number;
  rejectedPhrases: number;
  contextSkippedTokens: number;
  analysisSuppressedTokens: number;
  sentenceCandidatesSeen: number;
  sentenceCandidatesQueued: number;
  sentenceNotesRendered: number;
  sentenceNotesVisible: number;
  mutationCacheRefreshes: number;
  mutationCacheRefreshHits: number;
  curriculumConfigId: string | null;
  activeCurriculumBandId: string | null;
  curriculumSkippedSentences: number;
  curriculumSkippedWords: number;
  curriculumSkippedPhrases: number;
  sentenceRankingReasons: PageDiagnosticsSentenceRankingReason[];
  phraseDecisionSamples: PageDiagnosticsPhraseSample[];
  tokenDecisionSamples: PageDiagnosticsTokenSample[];
  updatedAt: string;
};

export type PageDiagnosticsSentenceRankingReason = {
  sentenceHash: string;
  rank: number;
  score: number;
  primaryReason: string;
  curriculum?: {
    configId: string;
    activeBandId: string | null;
    eligible: boolean;
    skipReason: string | null;
  };
  signals?: {
    vocabularyFit: number;
    grammarFit: number;
    dueTargetValue: number;
    chunkUsefulness: number;
    ambiguityPenalty: number;
  };
};

export type PageDiagnosticsTokenSample = {
  sourceToken: string | null;
  targetToken: string | null;
  lemmaId: string | null;
  unitKind: string | null;
  wordKind: string | null;
  contextDecision: string | null;
  contextRationale: string | null;
  dueStatus: string | null;
  schedulerReason: string | null;
  sentenceHash: string | null;
};

export type PageDiagnosticsPhraseSample = {
  phraseId: string | null;
  sourceText: string | null;
  targetText: string | null;
  selected: boolean;
  rejectedReason: string | null;
  sourceKind: string | null;
  category: string | null;
  dueStatus: string | null;
  schedulerReason: string | null;
  sentenceHash: string | null;
  exposureEligible: boolean;
};

export function isPageDiagnosticsMessage(
  message: unknown
): message is PageDiagnosticsMessage {
  if (!message || typeof message !== "object") {
    return false;
  }

  return (message as { type?: unknown }).type === PAGE_DIAGNOSTICS_MESSAGE_TYPE;
}
