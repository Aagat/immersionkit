import type {
  PageDiagnosticsPhraseSample,
  PageDiagnosticsSentenceRankingReason,
  PageDiagnosticsSnapshot,
  PageDiagnosticsTokenSample
} from "../diagnostics/page-diagnostics";
import { DIAGNOSTICS_ENABLED } from "../build-profile";
import { isRecord } from "../storage/serialization";
import type { PhraseRenderRejection } from "./annotate";
import { IMMERSIONKIT_TOKEN_ATTRIBUTE } from "./constants";

const SENTENCE_NOTE_SELECTOR = "[data-ik-sentence-note='true']";
const TOKEN_DIAGNOSTICS_SAMPLE_LIMIT = 8;
export const PHRASE_DIAGNOSTICS_SAMPLE_LIMIT = 8;

type DiagnosticsSnapshotInput = Pick<
  PageDiagnosticsSnapshot,
  | "siteEnabled"
  | "sentenceTranslationEnabled"
  | "assetSource"
  | "renderUnitCount"
  | "renderAssetVersion"
  | "fallbackAsset"
>;

export type ContentDiagnosticsProcessingState = {
  processedTextNodes: number;
  injectedTokens: number;
  injectedPhrases: number;
  rejectedPhrases: number;
  contextSkippedTokens: number;
  analysisSuppressedTokens: number;
  seenSentenceHashes: Set<string>;
  sentenceCandidatesQueued: number;
  sentenceNotesRendered: number;
  mutationCacheRefreshes: number;
  mutationCacheRefreshHits: number;
  freshPhraseAnalysisHits: number;
  freshPhraseRerenders: number;
  curriculumConfigId: string | null;
  activeCurriculumBandId: string | null;
  curriculumSkippedSentences: number;
  curriculumSkippedWords: number;
  curriculumSkippedPhrases: number;
  sentenceRankingReasons: PageDiagnosticsSentenceRankingReason[];
  unrenderedPhraseRejections: PhraseRenderRejection[];
};

export type ContentDiagnosticsRuntimeState = {
  processing: ContentDiagnosticsProcessingState | null;
  diagnostics: PageDiagnosticsSnapshot;
};

export function createDefaultDiagnostics(): PageDiagnosticsSnapshot {
  return createDiagnosticsSnapshot({
    siteEnabled: true,
    sentenceTranslationEnabled: false,
    assetSource: "unknown",
    renderUnitCount: 0,
    renderAssetVersion: null,
    fallbackAsset: true
  });
}

export function createDiagnosticsSnapshot(
  input: DiagnosticsSnapshotInput
): PageDiagnosticsSnapshot {
  return {
    pageUrl: window.location.href,
    pageHostname: window.location.hostname,
    pagePathname: window.location.pathname,
    siteEnabled: input.siteEnabled,
    sentenceTranslationEnabled: input.sentenceTranslationEnabled,
    assetSource: input.assetSource,
    renderUnitCount: input.renderUnitCount,
    renderAssetVersion: input.renderAssetVersion,
    fallbackAsset: input.fallbackAsset,
    processedTextNodes: 0,
    injectedTokens: 0,
    injectedPhrases: 0,
    rejectedPhrases: 0,
    contextSkippedTokens: 0,
    analysisSuppressedTokens: 0,
    sentenceCandidatesSeen: 0,
    sentenceCandidatesQueued: 0,
    sentenceNotesRendered: 0,
    sentenceNotesVisible: countSentenceNotes(),
    mutationCacheRefreshes: 0,
    mutationCacheRefreshHits: 0,
    freshPhraseAnalysisHits: 0,
    freshPhraseRerenders: 0,
    curriculumConfigId: null,
    activeCurriculumBandId: null,
    curriculumSkippedSentences: 0,
    curriculumSkippedWords: 0,
    curriculumSkippedPhrases: 0,
    grammarDueSentenceCount: 0,
    sentenceRankingReasons: [],
    phraseDecisionSamples: DIAGNOSTICS_ENABLED ? collectPhraseDecisionSamples() : [],
    tokenDecisionSamples: DIAGNOSTICS_ENABLED ? collectTokenDecisionSamples() : [],
    updatedAt: new Date().toISOString()
  };
}

export function readPageDiagnostics(
  runtimeState: ContentDiagnosticsRuntimeState
): PageDiagnosticsSnapshot {
  updateDiagnostics(runtimeState);
  return { ...runtimeState.diagnostics };
}

export function updateDiagnostics(
  runtimeState: ContentDiagnosticsRuntimeState
): void {
  const processing = runtimeState.processing;
  if (processing) {
    runtimeState.diagnostics.processedTextNodes = processing.processedTextNodes;
    runtimeState.diagnostics.injectedTokens = processing.injectedTokens;
    runtimeState.diagnostics.injectedPhrases = processing.injectedPhrases;
    runtimeState.diagnostics.rejectedPhrases = processing.rejectedPhrases;
    runtimeState.diagnostics.contextSkippedTokens = processing.contextSkippedTokens;
    runtimeState.diagnostics.analysisSuppressedTokens =
      processing.analysisSuppressedTokens;
    runtimeState.diagnostics.sentenceCandidatesSeen =
      processing.seenSentenceHashes.size;
    runtimeState.diagnostics.sentenceCandidatesQueued =
      processing.sentenceCandidatesQueued;
    runtimeState.diagnostics.sentenceNotesRendered =
      processing.sentenceNotesRendered;
    runtimeState.diagnostics.mutationCacheRefreshes =
      processing.mutationCacheRefreshes;
    runtimeState.diagnostics.mutationCacheRefreshHits =
      processing.mutationCacheRefreshHits;
    runtimeState.diagnostics.freshPhraseAnalysisHits =
      processing.freshPhraseAnalysisHits;
    runtimeState.diagnostics.freshPhraseRerenders =
      processing.freshPhraseRerenders;
    runtimeState.diagnostics.curriculumConfigId = processing.curriculumConfigId;
    runtimeState.diagnostics.activeCurriculumBandId =
      processing.activeCurriculumBandId;
    runtimeState.diagnostics.curriculumSkippedSentences =
      processing.curriculumSkippedSentences;
    runtimeState.diagnostics.curriculumSkippedWords =
      processing.curriculumSkippedWords;
    runtimeState.diagnostics.curriculumSkippedPhrases =
      processing.curriculumSkippedPhrases;
    runtimeState.diagnostics.grammarDueSentenceCount =
      countGrammarDueSentenceReasons(processing.sentenceRankingReasons);
    runtimeState.diagnostics.sentenceRankingReasons = DIAGNOSTICS_ENABLED
      ? processing.sentenceRankingReasons
      : [];
  }

  runtimeState.diagnostics.sentenceNotesVisible = countSentenceNotes();
  runtimeState.diagnostics.phraseDecisionSamples = DIAGNOSTICS_ENABLED
    ? collectPhraseDecisionSamples(runtimeState.processing)
    : [];
  runtimeState.diagnostics.tokenDecisionSamples = DIAGNOSTICS_ENABLED
    ? collectTokenDecisionSamples()
    : [];
  runtimeState.diagnostics.updatedAt = new Date().toISOString();
}

export function updateCurriculumDiagnosticsFromRanking(
  state: ContentDiagnosticsProcessingState
): void {
  const curriculumReasons = state.sentenceRankingReasons.flatMap((reason) =>
    reason.curriculum ? [reason.curriculum] : []
  );
  const first = curriculumReasons[0];

  state.curriculumConfigId = first?.configId ?? state.curriculumConfigId;
  state.activeCurriculumBandId =
    first?.activeBandId ?? state.activeCurriculumBandId;
  state.curriculumSkippedSentences = curriculumReasons.filter(
    (reason) => !reason.eligible
  ).length;
}

function countGrammarDueSentenceReasons(
  reasons: readonly PageDiagnosticsSentenceRankingReason[]
): number {
  return reasons.filter(
    (reason) => (reason.signals?.grammarDueValue ?? 0) > 0
  ).length;
}

function countSentenceNotes(): number {
  return document.querySelectorAll(SENTENCE_NOTE_SELECTOR).length;
}

function collectTokenDecisionSamples(): PageDiagnosticsTokenSample[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      `[${IMMERSIONKIT_TOKEN_ATTRIBUTE}]`
    )
  )
    .slice(0, TOKEN_DIAGNOSTICS_SAMPLE_LIMIT)
    .map((token) => ({
      sourceToken: token.getAttribute("data-ik-source-token"),
      targetToken: token.getAttribute("data-ik-target-token"),
      lexemeId: token.getAttribute("data-ik-lexeme-id"),
      unitKind: token.getAttribute("data-ik-unit-kind"),
      wordKind: token.getAttribute("data-ik-word-kind"),
      contextDecision: token.getAttribute("data-ik-context-decision"),
      contextRationale: token.getAttribute("data-ik-context-rationale"),
      dueStatus: token.getAttribute("data-ik-due-status"),
      schedulerReason: token.getAttribute("data-ik-scheduler-reason"),
      sentenceHash: token.getAttribute("data-ik-sentence-hash")
    }));
}

function collectPhraseDecisionSamples(
  state: ContentDiagnosticsProcessingState | null = null
): PageDiagnosticsPhraseSample[] {
  const selected = Array.from(
    document.querySelectorAll<HTMLElement>("[data-ik-unit-kind='phrase']")
  ).map((phrase): PageDiagnosticsPhraseSample => ({
    phraseId: phrase.getAttribute("data-ik-phrase-id"),
    sourceText: phrase.getAttribute("data-ik-source-token"),
    targetText: phrase.getAttribute("data-ik-target-token"),
    selected: true,
    rejectedReason: null,
    sourceKind: phrase.getAttribute("data-ik-phrase-source-kind"),
    category: phrase.getAttribute("data-ik-phrase-category"),
    dueStatus: phrase.getAttribute("data-ik-due-status"),
    schedulerReason: phrase.getAttribute("data-ik-scheduler-reason"),
    sentenceHash: phrase.getAttribute("data-ik-sentence-hash"),
    exposureEligible: Boolean(phrase.getAttribute("data-ik-sentence-hash"))
  }));

  const rejected = Array.from(
    document.querySelectorAll<HTMLElement>("[data-ik-phrase-rejection-details]")
  ).flatMap(readPhraseRejectionDetails);

  return [
    ...selected,
    ...rejected,
    ...(state?.unrenderedPhraseRejections.map(toRejectedPhraseDecisionSample) ?? [])
  ].slice(0, PHRASE_DIAGNOSTICS_SAMPLE_LIMIT);
}

function toRejectedPhraseDecisionSample(
  entry: PhraseRenderRejection
): PageDiagnosticsPhraseSample {
  return {
    phraseId: entry.phraseId,
    sourceText: entry.sourceText,
    targetText: entry.targetText,
    selected: false,
    rejectedReason: entry.reason,
    sourceKind: entry.sourceKind,
    category: entry.category,
    dueStatus: null,
    schedulerReason: null,
    sentenceHash: entry.sentenceHash,
    exposureEligible: false
  };
}

function readPhraseRejectionDetails(
  wrapper: HTMLElement
): PageDiagnosticsPhraseSample[] {
  const rawDetails = wrapper.getAttribute("data-ik-phrase-rejection-details");
  if (!rawDetails) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawDetails);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((entry): PageDiagnosticsPhraseSample[] => {
      if (!isRecord(entry)) {
        return [];
      }

      const phraseId = readNullableString(entry.phraseId);
      const rejectedReason = readNullableString(entry.reason);
      if (!phraseId || !rejectedReason) {
        return [];
      }

      return [
        {
          phraseId,
          sourceText: readNullableString(entry.sourceText),
          targetText: readNullableString(entry.targetText),
          selected: false,
          rejectedReason,
          sourceKind: readNullableString(entry.sourceKind),
          category: readNullableString(entry.category),
          dueStatus: null,
          schedulerReason: null,
          sentenceHash: readNullableString(entry.sentenceHash),
          exposureEligible: false
        }
      ];
    });
  } catch {
    return [];
  }
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
