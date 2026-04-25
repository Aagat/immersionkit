import type {
  SeedLexiconEntry,
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
  sourceLanguage: "en";
  targetLanguage: "es";
  sourceToken: string;
  targetToken: string;
  sourceLemma: string;
  lemmaId: string;
  pos: SeedLexiconEntry["pos"];
  status: VocabStatus;
  wordKind: InjectedWordKind;
  sentence: string | null;
  sentenceHash: string | null;
  exampleSentenceEnglish: string | null;
  exampleSentenceNative: string | null;
};

export type PhraseMetadata = {
  tokenId: string;
  nodeId: string;
  sourceLanguage: "en";
  targetLanguage: "es";
  sourceText: string;
  targetText: string;
  phraseId: string;
  itemId: string;
  category: string;
  sourceKind: string;
  ruleId: string;
  confidence: number | null;
  dueStatus: string | null;
  schedulerReason: string | null;
  sentence: string | null;
  sentenceHash: string | null;
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
  lemmaId: string;
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
