import type { SentenceLearningNote } from "../domain/models";

export enum RuntimeMessageType {
  Ping = "runtime/ping",
  RefreshActiveTab = "settings/refresh-active-tab",
  QueueSentenceCandidates = "sentence/queue-candidates",
  SentenceTranslationResult = "sentence/translation-result"
}

export type PingMessage = {
  type: RuntimeMessageType.Ping;
};

export type RefreshActiveTabMessage = {
  type: RuntimeMessageType.RefreshActiveTab;
};

export type QueueSentenceCandidatesMessage = {
  type: RuntimeMessageType.QueueSentenceCandidates;
  sentences: string[];
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

export type RuntimeMessage =
  | PingMessage
  | RefreshActiveTabMessage
  | QueueSentenceCandidatesMessage
  | SentenceTranslationResultMessage;
