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
  contextSkippedTokens: number;
  analysisSuppressedTokens: number;
  sentenceCandidatesSeen: number;
  sentenceCandidatesQueued: number;
  sentenceNotesRendered: number;
  sentenceNotesVisible: number;
  tokenDecisionSamples: PageDiagnosticsTokenSample[];
  updatedAt: string;
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

export function isPageDiagnosticsMessage(
  message: unknown
): message is PageDiagnosticsMessage {
  if (!message || typeof message !== "object") {
    return false;
  }

  return (message as { type?: unknown }).type === PAGE_DIAGNOSTICS_MESSAGE_TYPE;
}
