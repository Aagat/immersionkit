import type {
  AssistEvent,
  QualifiedExposureEvent,
  SentenceAnalysisEntry,
  SentenceLearningNote
} from "../domain/models";

export enum RuntimeMessageType {
  Ping = "runtime/ping",
  RefreshActiveTab = "settings/refresh-active-tab",
  GetLearningItems = "learning-items/get",
  GetSentenceAnalysisCache = "sentence-analysis-cache/get",
  QueueSentenceCandidates = "sentence/queue-candidates",
  SentenceTranslationResult = "sentence/translation-result",
  AssistEvent = "evidence/assist-event",
  QualifiedExposureEvent = "evidence/qualified-exposure-event"
}

export type PingMessage = {
  type: RuntimeMessageType.Ping;
};

export type RefreshActiveTabMessage = {
  type: RuntimeMessageType.RefreshActiveTab;
};

export type GetLearningItemsMessage = {
  type: RuntimeMessageType.GetLearningItems;
};

export type GetSentenceAnalysisCacheMessage = {
  type: RuntimeMessageType.GetSentenceAnalysisCache;
};

export type QueuedSentenceCandidate = {
  sentenceHash: string;
  sourceText: string;
  hostname?: string;
  nodeId?: string;
  documentUrl?: string;
};

export type QueueSentenceCandidatesMessage = {
  type: RuntimeMessageType.QueueSentenceCandidates;
  sentences: string[];
  candidates?: QueuedSentenceCandidate[];
};

export type SentenceTranslationResult = {
  sentenceHash: string;
  sourceText: string;
  translatedText: string;
  learningNote: SentenceLearningNote;
  grammarNote?: string;
};

export type SentenceTranslationResultMessage = {
  type: RuntimeMessageType.SentenceTranslationResult;
  results: SentenceTranslationResult[];
};

export type SentenceAnalysisResult = {
  entry: SentenceAnalysisEntry;
};

export type AssistEventMessage = AssistEvent & {
  type: RuntimeMessageType.AssistEvent;
};

export type QualifiedExposureEventMessage = QualifiedExposureEvent & {
  type: RuntimeMessageType.QualifiedExposureEvent;
  dwellMs?: number;
  viewportRatio?: number;
  source?: string;
};

export type RuntimeMessage =
  | PingMessage
  | RefreshActiveTabMessage
  | GetLearningItemsMessage
  | GetSentenceAnalysisCacheMessage
  | QueueSentenceCandidatesMessage
  | SentenceTranslationResultMessage
  | AssistEventMessage
  | QualifiedExposureEventMessage;
