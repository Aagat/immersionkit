export enum RuntimeMessageType {
  Ping = "runtime/ping",
  RefreshActiveTab = "settings/refresh-active-tab",
  QueueSentenceCandidates = "sentence/queue-candidates"
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

export type RuntimeMessage =
  | PingMessage
  | RefreshActiveTabMessage
  | QueueSentenceCandidatesMessage;

