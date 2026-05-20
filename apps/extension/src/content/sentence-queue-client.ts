import {
  RuntimeMessageType,
  type QueuedSentenceCandidate,
  type QueueSentenceCandidatesMessage,
  type SentenceAnalysisResult,
  type SentenceAnalysisEntry,
  type SentenceRankingReason,
  type SentenceTranslationResult,
  type TranslationAvailability
} from "@immersionkit/shared";
import { sendRuntimeMessage } from "../runtime-client";
import type { SentenceCandidateMetadata } from "./contracts";

const MAX_QUEUED_SENTENCE_CANDIDATES = 12;

export type SentenceQueueOutcome = {
  accepted: number;
  analyzed: number;
  analysisCacheHits: number;
  queued: number;
  skipped: number;
  cacheHits: number;
  translationAvailability: TranslationAvailability;
  queuedCandidateCount: number;
  cachedResults: SentenceTranslationResult[];
  analysisResults: SentenceAnalysisResult[];
  analysisEntries: SentenceAnalysisEntry[];
  rankingReasons: SentenceRankingReason[];
};

export async function sendSentenceCandidatesToQueue(
  candidates: readonly SentenceCandidateMetadata[]
): Promise<SentenceQueueOutcome | null> {
  const compactCandidates = dedupeSentenceCandidates(candidates).slice(
    0,
    MAX_QUEUED_SENTENCE_CANDIDATES
  );
  if (compactCandidates.length === 0) {
    return null;
  }

  const message: QueueSentenceCandidatesMessage = {
    type: RuntimeMessageType.QueueSentenceCandidates,
    candidates: compactCandidates
  };
  const response = await sendRuntimeMessage(message);
  if (!response?.ok) {
    return null;
  }

  return {
    accepted: response.accepted,
    analyzed: response.analyzed,
    analysisCacheHits: response.analysisCacheHits,
    queued: response.queued,
    skipped: response.skipped,
    cacheHits: response.cacheHits,
    translationAvailability: response.translationAvailability,
    queuedCandidateCount: compactCandidates.length,
    cachedResults: Array.isArray(response.cachedResults) ? response.cachedResults : [],
    analysisResults: Array.isArray(response.analysisResults)
      ? response.analysisResults
      : [],
    analysisEntries: Array.isArray(response.analysisResults)
      ? response.analysisResults.map((result) => result.entry)
      : [],
    rankingReasons: Array.isArray(response.rankingReasons) ? response.rankingReasons : []
  };
}

export function dedupeSentenceCandidates(
  candidates: readonly SentenceCandidateMetadata[]
): QueuedSentenceCandidate[] {
  const byHash = new Map<string, QueuedSentenceCandidate>();

  for (const candidate of candidates) {
    if (byHash.has(candidate.sentenceHash)) {
      continue;
    }

    byHash.set(candidate.sentenceHash, {
      sentenceHash: candidate.sentenceHash,
      sourceText: candidate.sentence,
      hostname: window.location.hostname,
      nodeId: candidate.nodeId,
      documentUrl: window.location.href,
      reason: candidate.reason,
      knownWordCount: candidate.knownWordCount,
      totalWordCount: candidate.totalWordCount,
      phraseHints: candidate.phraseHints
    });
  }

  return [...byHash.values()];
}
