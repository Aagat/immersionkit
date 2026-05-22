import type {
  AssistEvent,
  ExtensionSettings,
  QualifiedExposureEvent,
  LearningItem,
  LanguagePairId,
  RenderUnitEntry,
  SentenceAnalysisEntry,
  SentenceLearningNote,
  SiteSetting,
  UserVocabEntry,
  VocabStatus
} from "../domain/models";
import type {
  CurriculumConfig,
  CurriculumRuntimeProfileInput
} from "../curriculum/config";
import type { SentenceGrammarCard } from "../curriculum/grammar";

export enum RuntimeMessageType {
  Ping = "runtime/ping",
  RefreshActiveTab = "settings/refresh-active-tab",
  GetTabZoom = "tabs/get-zoom",
  GetAccountState = "account/get-state",
  StartAccountLogin = "account/start-login",
  LogoutAccount = "account/logout",
  QueueActivationEvent = "telemetry/queue-activation-event",
  SubmitFeedback = "feedback/submit",
  GetAssetContext = "assets/get-context",
  GetLearningItems = "learning-items/get",
  GetUserData = "user-data/get",
  SetUserData = "user-data/set",
  RemoveUserData = "user-data/remove",
  GetUserVocab = "user-vocab/get",
  SetVocabStatus = "user-vocab/set-status",
  GetSentenceAnalysisCache = "sentence-analysis-cache/get",
  LoadContentContext = "content/context/load",
  GetContentAnalysisContext = "content/analysis-context/get",
  GraduateCheckpoint = "curriculum/graduate-checkpoint",
  QueueSentenceCandidates = "sentence/queue-candidates",
  SentenceTranslationResult = "sentence/translation-result",
  SpeakText = "tts/speak-text",
  AssistEvent = "evidence/assist-event",
  QualifiedExposureEvent = "evidence/qualified-exposure-event"
}

export type PingMessage = {
  type: RuntimeMessageType.Ping;
};

export type RefreshActiveTabMessage = {
  type: RuntimeMessageType.RefreshActiveTab;
};

export type GetTabZoomMessage = {
  type: RuntimeMessageType.GetTabZoom;
};

export type PreviewAccountStatus = "signed-out" | "signed-in";

export type PreviewAccountProvider = "google" | "github";

export type PreviewAccountProfile = {
  userId: string;
  email: string;
  provider: PreviewAccountProvider;
  previewStatus: "active" | "pending" | "disabled";
  signedInAt: string;
};

export type PreviewInstallIdentity = {
  installId: string;
  languagePair: LanguagePairId;
  extensionVersion: string;
  assetVersion: string | null;
  registeredAt: string | null;
  registrationState: "local" | "registered";
};

export type PreviewAccountState = {
  accountRequired: boolean;
  status: PreviewAccountStatus;
  profile: PreviewAccountProfile | null;
  install: PreviewInstallIdentity;
  signInProvider: "google";
  canStartSignIn: boolean;
};

export type GetAccountStateMessage = {
  type: RuntimeMessageType.GetAccountState;
};

export type StartAccountLoginMessage = {
  type: RuntimeMessageType.StartAccountLogin;
  provider: "google";
};

export type LogoutAccountMessage = {
  type: RuntimeMessageType.LogoutAccount;
};

export type ActivationEventName =
  | "install_registered"
  | "signup_completed"
  | "supported_page_seen"
  | "reading_rendered"
  | "help_opened"
  | "sentence_help_interest"
  | "pause_resume"
  | "active_day"
  | "feedback_submitted"
  | "asset_load"
  | "asset_fallback"
  | "error_bucket";

export type ActivationEventProperties = Partial<{
  surface: "popup" | "options" | "content" | "background";
  helpSurface: "word" | "phrase" | "sentence";
  action: "pause" | "resume" | "open" | "close" | "submit";
  assetSource: AssetContextLoadSource;
  assetVersion: string;
  errorBucket: string;
  count: number;
  dayIndex: 0 | 1 | 2 | 7;
}>;

export type QueueActivationEventMessage = {
  type: RuntimeMessageType.QueueActivationEvent;
  eventName: ActivationEventName;
  properties?: ActivationEventProperties;
};

export type FeedbackCategory =
  | "bug"
  | "quality"
  | "translation"
  | "page-compatibility"
  | "other";

export type SubmitFeedbackMessage = {
  type: RuntimeMessageType.SubmitFeedback;
  category: FeedbackCategory;
  description: string;
  diagnostics?: unknown;
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
  languagePair: LanguagePairId;
  renderUnits: RenderUnitEntry[];
  sentenceHintPhrases: string[];
  source: AssetContextLoadSource;
  assetVersion: string | null;
  bandIds: string[];
  missingBandIds: string[];
};

export type ContentAssetContext = ActiveAssetContext;

export type AssetContextMetadata = {
  languagePair: LanguagePairId;
  source: AssetContextLoadSource;
  assetVersion: string | null;
  bandIds: string[];
  missingBandIds: string[];
  renderUnitCount: number;
  sentenceHintPhraseCount: number;
};

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

export type LoadContentContextMessage = {
  type: RuntimeMessageType.LoadContentContext;
  hostname: string;
  sentenceHashes?: string[];
};

export type GetContentAnalysisContextMessage = {
  type: RuntimeMessageType.GetContentAnalysisContext;
  sentenceHashes: string[];
};

export type ContentContextSnapshot = {
  settings: ExtensionSettings;
  discoveryRate: number;
  siteSetting: SiteSetting | null;
  siteEnabled: boolean;
  assetContext: ContentAssetContext;
  vocabEntries: UserVocabEntry[];
  learningItems: LearningItem[];
  sentenceAnalysisEntries: SentenceAnalysisEntry[];
  curriculumConfig: CurriculumConfig;
  learningProfile: CurriculumRuntimeProfileInput;
};

export type ContentAnalysisContextSnapshot = {
  entryCount: number;
  entries: SentenceAnalysisEntry[];
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
  reason?: string;
  knownWordCount?: number;
  totalWordCount?: number;
  phraseHints?: string[];
};

export type QueueSentenceCandidatesMessage = {
  type: RuntimeMessageType.QueueSentenceCandidates;
  candidates: QueuedSentenceCandidate[];
};

export type SentenceTranslationResult = {
  sentenceHash: string;
  sourceText: string;
  translatedText: string;
  learningNote: SentenceLearningNote;
  grammarCards?: SentenceGrammarCard[];
};

export type SentenceTranslationResultMessage = {
  type: RuntimeMessageType.SentenceTranslationResult;
  results: SentenceTranslationResult[];
};

export type SpeakTextSurface = "word" | "phrase" | "sentence";

export type SpeakTextMessage = {
  type: RuntimeMessageType.SpeakText;
  text: string;
  language: "es-ES";
  surface: SpeakTextSurface;
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
  | GetTabZoomMessage
  | GetAccountStateMessage
  | StartAccountLoginMessage
  | LogoutAccountMessage
  | QueueActivationEventMessage
  | SubmitFeedbackMessage
  | GetAssetContextMessage
  | GetLearningItemsMessage
  | GetUserDataMessage
  | SetUserDataMessage
  | RemoveUserDataMessage
  | GetUserVocabMessage
  | SetVocabStatusMessage
  | GetSentenceAnalysisCacheMessage
  | LoadContentContextMessage
  | GetContentAnalysisContextMessage
  | GraduateCheckpointMessage
  | QueueSentenceCandidatesMessage
  | SentenceTranslationResultMessage
  | SpeakTextMessage
  | AssistEventMessage
  | QualifiedExposureEventMessage;

export type RuntimeErrorResponse = {
  ok: false;
  error: string;
};

export type RuntimeOkResponse = {
  ok: true;
};

export type PingResponse = {
  ok: true;
  source: "background";
  timestamp: string;
};

export type RefreshActiveTabResponse =
  | {
      ok: true;
      refreshed: true;
      tabId: number;
    }
  | {
      ok: false;
      refreshed: false;
      reason: string;
      tabId: number | null;
    };

export type GetTabZoomResponse =
  | {
      ok: true;
      zoomFactor: number;
    }
  | RuntimeErrorResponse;

export type GetAccountStateResponse =
  | {
      ok: true;
      state: PreviewAccountState;
    }
  | RuntimeErrorResponse;

export type StartAccountLoginResponse =
  | {
      ok: true;
      state: PreviewAccountState;
    }
  | RuntimeErrorResponse;

export type LogoutAccountResponse =
  | {
      ok: true;
      state: PreviewAccountState;
    }
  | RuntimeErrorResponse;

export type QueueActivationEventResponse =
  | {
      ok: true;
      queued: boolean;
    }
  | RuntimeErrorResponse;

export type SubmitFeedbackResponse =
  | {
      ok: true;
      submitted: boolean;
      queuedTelemetry: boolean;
    }
  | RuntimeErrorResponse;

export type GetAssetContextResponse =
  | {
      ok: true;
      context: ActiveAssetContext | ContentAssetContext | AssetContextMetadata;
    }
  | RuntimeErrorResponse;

export type GetLearningItemsResponse =
  | {
      ok: true;
      items: LearningItem[];
    }
  | RuntimeErrorResponse;

export type GetUserDataResponse =
  | {
      ok: true;
      values: Record<string, unknown>;
    }
  | RuntimeErrorResponse;

export type MutateUserDataResponse = RuntimeOkResponse | RuntimeErrorResponse;

export type GetUserVocabResponse =
  | {
      ok: true;
      entries: UserVocabEntry[];
    }
  | RuntimeErrorResponse;

export type SetVocabStatusResponse =
  | {
      ok: true;
      entry: UserVocabEntry | null;
    }
  | RuntimeErrorResponse;

export type GetSentenceAnalysisCacheResponse =
  | {
      ok: true;
      entries: SentenceAnalysisEntry[];
    }
  | RuntimeErrorResponse;

export type LoadContentContextResponse =
  | {
      ok: true;
      context: ContentContextSnapshot;
    }
  | RuntimeErrorResponse;

export type GetContentAnalysisContextResponse =
  | {
      ok: true;
      context: ContentAnalysisContextSnapshot;
    }
  | RuntimeErrorResponse;

export type GraduateCheckpointResponse =
  | {
      ok: true;
      advanced: boolean;
      previousBandId: string | null;
      nextBandId: string | null;
      reason: string;
      unmetRequirements: string[];
    }
  | RuntimeErrorResponse;

export type TranslationAvailability =
  | "ready"
  | "feature-disabled"
  | "provider-disabled"
  | "missing-credentials";

export type SentenceSuitabilitySignals = {
  vocabularyFit: number;
  grammarFit: number;
  structuralSimplicity: number;
  dueTargetValue: number;
  chunkUsefulness: number;
  ambiguityPenalty: number;
  stretchDemand: number;
};

export type SentenceAnalysisResult = {
  entry: SentenceAnalysisEntry;
  cacheHit: boolean;
  suitabilitySignals: SentenceSuitabilitySignals;
};

export type SentenceRankingPrimaryReason =
  | "difficulty-score"
  | "vocab-fit"
  | "due-target-value"
  | "grammar-due-value"
  | "curriculum-grammar-focus"
  | "phrase-value"
  | "ambiguity-penalty"
  | "curriculum-sentence-policy"
  | "curriculum-gate"
  | "fallback-original-order";

export type SentenceRankingReason = {
  sentenceHash: string;
  rank: number;
  score: number;
  primaryReason: SentenceRankingPrimaryReason;
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
    grammarDueValue?: number;
    grammarCurriculumValue?: number;
    grammarOverloadPenalty?: number;
    chunkUsefulness: number;
    ambiguityPenalty: number;
    sentencePolicyFit?: number;
  };
  sentencePolicy?: {
    activeBandId: string;
    tokenCount: number;
    tokenRange: readonly [number, number];
    fit: number;
    penalty: number;
    outsideRange: boolean;
    clausePolicy: string;
    targetPolicy: string;
  };
};

export type QueueSentenceCandidatesOkResponse = {
  ok: true;
  accepted: number;
  analyzed: number;
  analysisCacheHits: number;
  queued: number;
  skipped: number;
  cacheHits: number;
  translationAvailability: TranslationAvailability;
  analysisResults: SentenceAnalysisResult[];
  cachedResults: SentenceTranslationResult[];
  rankingReasons: SentenceRankingReason[];
};

export type QueueSentenceCandidatesResponse =
  | QueueSentenceCandidatesOkResponse
  | RuntimeErrorResponse;

export type EvidenceEventResponse =
  | {
      ok: true;
      stored: boolean;
    }
  | RuntimeErrorResponse;

export type SpeakTextResponse =
  | {
      ok: true;
      engine: "piper" | "chrome-tts";
    }
  | RuntimeErrorResponse;

export type RuntimeResponseByType = {
  [RuntimeMessageType.Ping]: PingResponse;
  [RuntimeMessageType.RefreshActiveTab]: RefreshActiveTabResponse | RuntimeErrorResponse;
  [RuntimeMessageType.GetTabZoom]: GetTabZoomResponse;
  [RuntimeMessageType.GetAccountState]: GetAccountStateResponse;
  [RuntimeMessageType.StartAccountLogin]: StartAccountLoginResponse;
  [RuntimeMessageType.LogoutAccount]: LogoutAccountResponse;
  [RuntimeMessageType.QueueActivationEvent]: QueueActivationEventResponse;
  [RuntimeMessageType.SubmitFeedback]: SubmitFeedbackResponse;
  [RuntimeMessageType.GetAssetContext]: GetAssetContextResponse;
  [RuntimeMessageType.GetLearningItems]: GetLearningItemsResponse;
  [RuntimeMessageType.GetUserData]: GetUserDataResponse;
  [RuntimeMessageType.SetUserData]: MutateUserDataResponse;
  [RuntimeMessageType.RemoveUserData]: MutateUserDataResponse;
  [RuntimeMessageType.GetUserVocab]: GetUserVocabResponse;
  [RuntimeMessageType.SetVocabStatus]: SetVocabStatusResponse;
  [RuntimeMessageType.GetSentenceAnalysisCache]: GetSentenceAnalysisCacheResponse;
  [RuntimeMessageType.LoadContentContext]: LoadContentContextResponse;
  [RuntimeMessageType.GetContentAnalysisContext]: GetContentAnalysisContextResponse;
  [RuntimeMessageType.GraduateCheckpoint]: GraduateCheckpointResponse;
  [RuntimeMessageType.QueueSentenceCandidates]: QueueSentenceCandidatesResponse;
  [RuntimeMessageType.SentenceTranslationResult]: RuntimeOkResponse | RuntimeErrorResponse;
  [RuntimeMessageType.SpeakText]: SpeakTextResponse;
  [RuntimeMessageType.AssistEvent]: EvidenceEventResponse;
  [RuntimeMessageType.QualifiedExposureEvent]: EvidenceEventResponse;
};

export type RuntimeResponseFor<TMessage extends RuntimeMessage> =
  RuntimeResponseByType[TMessage["type"]];
