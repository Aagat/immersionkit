import type { SeedLexiconEntry, VocabStatus } from "@immersionkit/shared";

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
};

export type TokenActivatedDetail = TokenMetadata & {
  sourceEvent: "click" | "keyboard";
};

export type TokenStatusUpdatedDetail = {
  tokenId: string;
  lemmaId: string;
  status: VocabStatus;
};

export type SentenceCandidateMetadata = {
  sentenceHash: string;
  sentence: string;
  knownWordCount: number;
  totalWordCount: number;
  knownRatio: number;
  nodeId: string;
};
