import type {
  SafeInjectionPos,
  SupportedSourceLanguage,
  SupportedTargetLanguage,
  UserVocabEntry,
  VocabStatus
} from "@immersionkit/shared";

export const IMMERSIONKIT_TOKEN_ACTIVATED_EVENT =
  "immersionkit:token-activated";
export const IMMERSIONKIT_TOKEN_STATUS_EVENT = "immersionkit:token-status-updated";
export const IMMERSIONKIT_RESTORE_EVENT = "immersionkit:restore";

export type InjectedWordKind = "known" | "discovery";

export type TokenMetadata = {
  tokenId: string;
  nodeId: string;
  sourceLanguage: SupportedSourceLanguage;
  targetLanguage: SupportedTargetLanguage;
  sourceToken: string;
  targetToken: string;
  sourceLemma: string;
  lexemeId: string;
  renderUnitId: string | null;
  pos: SafeInjectionPos;
  status: VocabStatus;
  wordKind: InjectedWordKind;
  sentence: string | null;
  sentenceHash: string | null;
  exampleSentenceEnglish: string | null;
  exampleSentenceNative: string | null;
  curriculumReason: string | null;
};

export type PhraseMetadata = {
  tokenId: string;
  nodeId: string;
  sourceLanguage: SupportedSourceLanguage;
  targetLanguage: SupportedTargetLanguage;
  sourceText: string;
  targetText: string;
  phraseId: string;
  itemId: string;
  category: string | null;
  sourceKind: string | null;
  ruleId: string | null;
  confidence: number | null;
  dueStatus: string | null;
  schedulerReason: string | null;
  sentence: string | null;
  sentenceHash: string | null;
  curriculumReason: string | null;
};

export type SentenceCandidateReason = "injected-token" | "fixed-phrase-hint";

export type TokenActivatedDetail = TokenMetadata & {
  sourceEvent: "click" | "keyboard";
};

export type PhraseActivatedDetail = PhraseMetadata & {
  sourceEvent: "click" | "keyboard";
};

export type TokenStatusUpdatedDetail = {
  tokenId: string;
  lexemeId: string;
  status: VocabStatus;
  entry?: UserVocabEntry;
};

export type SentenceCandidateMetadata = {
  sentenceHash: string;
  sentence: string;
  knownWordCount: number;
  totalWordCount: number;
  knownRatio: number;
  nodeId: string;
  reason: SentenceCandidateReason;
  phraseHints: string[];
};
