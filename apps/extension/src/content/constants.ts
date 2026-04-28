import {
  DEFAULT_EXTENSION_SETTINGS,
  type ExtensionSettings,
  type SeedLexiconEntry,
  type SupportedPos
} from "@immersionkit/shared";

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
  settings: ["immersionkit.settings", "settings"] as const,
  siteSettings: ["immersionkit.siteSettings", "siteSettings"] as const,
  vocab: ["immersionkit.vocab", "vocab", "vocabEntries"] as const,
  seedLexicon: ["immersionkit.seedLexicon", "seedLexicon", "lexicon"] as const,
  curriculumConfig: ["immersionkit.curriculum.config", "curriculumConfig"] as const,
  learningProfile: ["immersionkit.learningProfile", "learningProfile"] as const
};

export const FALLBACK_SEED_LEXICON: SeedLexiconEntry[] = [
  {
    lemmaId: "seed-house-noun",
    sourceLemma: "house",
    targetLemma: "casa",
    pos: "noun",
    frequencyRank: 430,
    confidence: 0.97,
    inflections: ["houses"]
  },
  {
    lemmaId: "seed-book-noun",
    sourceLemma: "book",
    targetLemma: "libro",
    pos: "noun",
    frequencyRank: 570,
    confidence: 0.96,
    inflections: ["books"]
  },
  {
    lemmaId: "seed-city-noun",
    sourceLemma: "city",
    targetLemma: "ciudad",
    pos: "noun",
    frequencyRank: 330,
    confidence: 0.95,
    inflections: ["cities"]
  },
  {
    lemmaId: "seed-water-noun",
    sourceLemma: "water",
    targetLemma: "agua",
    pos: "noun",
    frequencyRank: 360,
    confidence: 0.97,
    inflections: ["waters"]
  },
  {
    lemmaId: "seed-friend-noun",
    sourceLemma: "friend",
    targetLemma: "amigo",
    pos: "noun",
    frequencyRank: 700,
    confidence: 0.95,
    inflections: ["friends"]
  },
  {
    lemmaId: "seed-family-noun",
    sourceLemma: "family",
    targetLemma: "familia",
    pos: "noun",
    frequencyRank: 510,
    confidence: 0.95,
    inflections: ["families"]
  },
  {
    lemmaId: "seed-world-noun",
    sourceLemma: "world",
    targetLemma: "mundo",
    pos: "noun",
    frequencyRank: 460,
    confidence: 0.94,
    inflections: ["worlds"]
  },
  {
    lemmaId: "seed-day-noun",
    sourceLemma: "day",
    targetLemma: "dia",
    pos: "noun",
    frequencyRank: 80,
    confidence: 0.98,
    inflections: ["days"]
  },
  {
    lemmaId: "seed-night-noun",
    sourceLemma: "night",
    targetLemma: "noche",
    pos: "noun",
    frequencyRank: 260,
    confidence: 0.96,
    inflections: ["nights"]
  },
  {
    lemmaId: "seed-important-adjective",
    sourceLemma: "important",
    targetLemma: "importante",
    pos: "adjective",
    frequencyRank: 300,
    confidence: 0.94,
    inflections: ["importance"]
  },
  {
    lemmaId: "seed-small-adjective",
    sourceLemma: "small",
    targetLemma: "pequeno",
    pos: "adjective",
    frequencyRank: 380,
    confidence: 0.94,
    inflections: ["smaller", "smallest"]
  },
  {
    lemmaId: "seed-big-adjective",
    sourceLemma: "big",
    targetLemma: "grande",
    pos: "adjective",
    frequencyRank: 410,
    confidence: 0.93,
    inflections: ["bigger", "biggest"]
  },
  {
    lemmaId: "seed-new-adjective",
    sourceLemma: "new",
    targetLemma: "nuevo",
    pos: "adjective",
    frequencyRank: 120,
    confidence: 0.96,
    inflections: ["newer", "newest"]
  },
  {
    lemmaId: "seed-old-adjective",
    sourceLemma: "old",
    targetLemma: "viejo",
    pos: "adjective",
    frequencyRank: 290,
    confidence: 0.93,
    inflections: ["older", "oldest"]
  },
  {
    lemmaId: "seed-clear-adjective",
    sourceLemma: "clear",
    targetLemma: "claro",
    pos: "adjective",
    frequencyRank: 520,
    confidence: 0.93,
    inflections: ["clearer", "clearest"]
  },
  {
    lemmaId: "seed-simple-adjective",
    sourceLemma: "simple",
    targetLemma: "simple",
    pos: "adjective",
    frequencyRank: 420,
    confidence: 0.95,
    inflections: ["simpler", "simplest"]
  },
  {
    lemmaId: "seed-quickly-adverb",
    sourceLemma: "quickly",
    targetLemma: "rapidamente",
    pos: "adverb",
    frequencyRank: 840,
    confidence: 0.93
  },
  {
    lemmaId: "seed-slowly-adverb",
    sourceLemma: "slowly",
    targetLemma: "lentamente",
    pos: "adverb",
    frequencyRank: 1120,
    confidence: 0.93
  },
  {
    lemmaId: "seed-carefully-adverb",
    sourceLemma: "carefully",
    targetLemma: "cuidadosamente",
    pos: "adverb",
    frequencyRank: 1310,
    confidence: 0.92
  },
  {
    lemmaId: "seed-usually-adverb",
    sourceLemma: "usually",
    targetLemma: "normalmente",
    pos: "adverb",
    frequencyRank: 780,
    confidence: 0.93
  },
  {
    lemmaId: "seed-always-adverb",
    sourceLemma: "always",
    targetLemma: "siempre",
    pos: "adverb",
    frequencyRank: 95,
    confidence: 0.97
  },
  {
    lemmaId: "seed-often-adverb",
    sourceLemma: "often",
    targetLemma: "frecuentemente",
    pos: "adverb",
    frequencyRank: 320,
    confidence: 0.94
  }
];
