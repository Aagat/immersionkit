import type {
  AssistEvent,
  QualifiedExposureEvent,
  RenderUnitEntry,
  SentenceAnalysisEntry,
  SentenceLearningNote,
  UserVocabEntry,
  VocabStatus
} from "../domain/models";

export enum RuntimeMessageType {
  Ping = "runtime/ping",
  RefreshActiveTab = "settings/refresh-active-tab",
  GetAssetContext = "assets/get-context",
  GetLearningItems = "learning-items/get",
  GetUserData = "user-data/get",
  SetUserData = "user-data/set",
  RemoveUserData = "user-data/remove",
  GetUserVocab = "user-vocab/get",
  SetVocabStatus = "user-vocab/set-status",
  GetSentenceAnalysisCache = "sentence-analysis-cache/get",
  GraduateCheckpoint = "curriculum/graduate-checkpoint",
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

export type GetAssetContextMessage = {
  type: RuntimeMessageType.GetAssetContext;
  includeRenderUnits?: boolean;
};

export type AssetContextLoadSource =
  | "remote-pack"
  | "cached-pack"
  | "empty";

export type ActiveAssetContext = {
  renderUnits: RenderUnitEntry[];
  sentenceHintPhrases: string[];
  source: AssetContextLoadSource;
  assetVersion: string | null;
  bandIds: string[];
  missingBandIds: string[];
};

export type ContentAssetContext = ActiveAssetContext;

export type GetLearningItemsMessage = {
  type: RuntimeMessageType.GetLearningItems;
  unitRefIds?: string[];
};

export type GetUserDataMessage = {
  type: RuntimeMessageType.GetUserData;
  keys: string[];
};

export type SetUserDataMessage = {
  type: RuntimeMessageType.SetUserData;
  values: Record<string, unknown>;
};

export type RemoveUserDataMessage = {
  type: RuntimeMessageType.RemoveUserData;
  keys: string[];
};

export type GetUserVocabMessage = {
  type: RuntimeMessageType.GetUserVocab;
  lexemeIds?: string[];
};

export type SetVocabStatusMessage = {
  type: RuntimeMessageType.SetVocabStatus;
  lexemeId: string;
  status: VocabStatus;
  lastSeenAt?: string | null;
  updatedAt?: string;
  incrementExposure?: boolean;
};

export type UserVocabResponse = {
  entries: UserVocabEntry[];
};

export type GetSentenceAnalysisCacheMessage = {
  type: RuntimeMessageType.GetSentenceAnalysisCache;
  sentenceHashes?: string[];
};

export type GraduateCheckpointMessage = {
  type: RuntimeMessageType.GraduateCheckpoint;
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
  | GetAssetContextMessage
  | GetLearningItemsMessage
  | GetUserDataMessage
  | SetUserDataMessage
  | RemoveUserDataMessage
  | GetUserVocabMessage
  | SetVocabStatusMessage
  | GetSentenceAnalysisCacheMessage
  | GraduateCheckpointMessage
  | QueueSentenceCandidatesMessage
  | SentenceTranslationResultMessage
  | AssistEventMessage
  | QualifiedExposureEventMessage;
