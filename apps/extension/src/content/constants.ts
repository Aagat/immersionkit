import {
  DEFAULT_EXTENSION_SETTINGS,
  type ExtensionSettings,
  type SupportedPos
} from "@immersionkit/shared";
import { USER_DATA_KEYS } from "../shared/user-data-keys";

export const IMMERSIONKIT_ROOT_ATTRIBUTE = "data-immersionkit-root";
export const IMMERSIONKIT_NODE_ATTRIBUTE = "data-ik-node-id";
export const IMMERSIONKIT_ORIGINAL_TEXT_ATTRIBUTE = "data-ik-original";
export const IMMERSIONKIT_TOKEN_ATTRIBUTE = "data-ik-token-id";
export const IMMERSIONKIT_WORD_SELECTOR = `[${IMMERSIONKIT_TOKEN_ATTRIBUTE}]`;
export const IMMERSIONKIT_NODE_SELECTOR = `[${IMMERSIONKIT_NODE_ATTRIBUTE}]`;
export const IMMERSIONKIT_IGNORE_SELECTOR = "[data-immersionkit-ignore='true']";

export const SAFE_POS: ReadonlySet<SupportedPos> = new Set([
  "noun",
  "adjective",
  "adverb"
]);

export const DEFAULT_DISCOVERY_RATE = DEFAULT_EXTENSION_SETTINGS.discoveryRate;
export const DEFAULT_SENTENCE_THRESHOLD =
  DEFAULT_EXTENSION_SETTINGS.goldilocksThreshold;
export const MAX_TEXT_NODE_LENGTH = 420;
export const MAX_TEXT_NODE_SCAN_LENGTH = 8_000;
export const MAX_SENTENCE_METADATA_LENGTH = 240;
export const SENTENCE_FIXED_PHRASE_HINTS = [
  "as soon as",
  "at least",
  "i need help",
  "we need help",
  "need to",
  "not need",
  "might need",
  "by the way",
  "of course",
  "right now",
  "for now",
  "at home",
  "at school",
  "in the morning",
  "take care of",
  "in order to",
  "used to",
  "going to"
] as const;

export const DEFAULT_SETTINGS: ExtensionSettings = {
  discoveryRate: DEFAULT_DISCOVERY_RATE,
  targetLanguage: "es",
  sentenceTranslationEnabled: false,
  provider: "none"
};

export const STORAGE_KEYS = {
  settings: [USER_DATA_KEYS.settings] as const,
  siteSettings: [USER_DATA_KEYS.siteSettings] as const,
  curriculumConfig: [USER_DATA_KEYS.curriculumConfig] as const,
  learningProfile: [USER_DATA_KEYS.learningProfile] as const
};
