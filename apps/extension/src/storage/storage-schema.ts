type IndexedDbIndexSchema = {
  name: string;
  keyPath: string | readonly string[];
  unique: boolean;
};

type IndexedDbStoreClassification =
  | "durable-user-data"
  | "durable-credential"
  | "durable-learning-state"
  | "provider-cache"
  | "analyzer-cache"
  | "asset-cache";

type IndexedDbRetentionPolicy =
  | "preserve"
  | "preserve-with-linked-records"
  | "preserve-unless-explicit-reset"
  | "clear-on-incompatible-change"
  | "refresh-from-assets";

type IndexedDbStoreSchema = {
  name: string;
  keyPath: string;
  indexes: readonly IndexedDbIndexSchema[];
  classification: IndexedDbStoreClassification;
  retention: IndexedDbRetentionPolicy;
  recordType: string;
  owner: string;
};

type StorageSchemaDefinition = {
  database: {
    name: string;
    version: number;
  };
  recordVersions: {
    userData: number;
    userVocab: number;
  };
  userDataKeys: Record<string, string>;
  stores: Record<string, IndexedDbStoreSchema>;
};

export const STORAGE_SCHEMA = {
  database: {
    name: "immersionkit-extension",
    version: 8
  },
  recordVersions: {
    userData: 1,
    userVocab: 1
  },
  userDataKeys: {
    settings: "settings",
    siteSettings: "site-settings",
    providerOpenAiApiKey: "provider-openai-api-key",
    curriculumConfig: "curriculum-config",
    learningProfile: "learning-profile",
    curriculumProgressionDiagnostics: "curriculum-progression-diagnostics",
    firstRunIntro: "first-run-intro-visible",
    accountProfile: "account-profile",
    accountSession: "account-session",
    installIdentity: "install-identity",
    telemetryState: "telemetry-state",
    entitlementCache: "entitlement-cache"
  },
  stores: {
    sentenceCache: {
      name: "sentence-cache",
      keyPath: "sentenceHash",
      indexes: [],
      classification: "provider-cache",
      retention: "clear-on-incompatible-change",
      recordType: "SentenceCacheEntry",
      owner: "apps/extension/src/background/sentence-cache.ts"
    },
    sentenceAnalysisCache: {
      name: "sentence-analysis-cache",
      keyPath: "identity",
      indexes: [
        {
          name: "sentenceHash",
          keyPath: "sentenceHash",
          unique: false
        }
      ],
      classification: "analyzer-cache",
      retention: "clear-on-incompatible-change",
      recordType: "SentenceAnalysisEntry + identity",
      owner: "apps/extension/src/background/sentence-analysis-cache.ts"
    },
    learningItems: {
      name: "learning-items",
      keyPath: "itemId",
      indexes: [],
      classification: "durable-learning-state",
      retention: "preserve",
      recordType: "LearningItem",
      owner: "apps/extension/src/storage/learning-item-repository.ts"
    },
    phraseRegistry: {
      name: "phrase-registry",
      keyPath: "phraseId",
      indexes: [],
      classification: "durable-learning-state",
      retention: "preserve-with-linked-records",
      recordType: "PhraseRegistryEntry",
      owner: "apps/extension/src/background/phrase-registry.ts"
    },
    reviewEvents: {
      name: "review-events",
      keyPath: "eventId",
      indexes: [],
      classification: "durable-learning-state",
      retention: "preserve-unless-explicit-reset",
      recordType: "ReviewEvent",
      owner: "apps/extension/src/background/learning-history-repository.ts"
    },
    learningItemContextHistory: {
      name: "learning-item-context-history",
      keyPath: "itemId",
      indexes: [],
      classification: "durable-learning-state",
      retention: "preserve-unless-explicit-reset",
      recordType: "LearningItemContextHistory",
      owner: "apps/extension/src/background/learning-history-repository.ts"
    },
    userData: {
      name: "user-data",
      keyPath: "key",
      indexes: [],
      classification: "durable-user-data",
      retention: "preserve",
      recordType: "UserDataRecord",
      owner: "apps/extension/src/storage/user-data-repository.ts"
    },
    userVocab: {
      name: "user-vocab",
      keyPath: "lexemeId",
      indexes: [],
      classification: "durable-user-data",
      retention: "preserve",
      recordType: "UserVocabEntry",
      owner: "apps/extension/src/storage/user-data-repository.ts"
    },
    assetPacks: {
      name: "asset-packs",
      keyPath: "identity",
      indexes: [
        {
          name: "languagePair",
          keyPath: "languagePair",
          unique: false
        },
        {
          name: "bandId",
          keyPath: "bandId",
          unique: false
        },
        {
          name: "assetVersion",
          keyPath: "assetVersion",
          unique: false
        }
      ],
      classification: "asset-cache",
      retention: "refresh-from-assets",
      recordType: "StoredAssetPackMetadata",
      owner: "apps/extension/src/background/asset-packs.ts"
    },
    assetPackRenderUnits: {
      name: "asset-pack-render-units",
      keyPath: "identity",
      indexes: [
        {
          name: "packIdentity",
          keyPath: "packIdentity",
          unique: false
        },
        {
          name: "bandId",
          keyPath: "bandId",
          unique: false
        },
        {
          name: "languagePairBandId",
          keyPath: ["languagePair", "bandId"],
          unique: false
        },
        {
          name: "assetVersion",
          keyPath: "assetVersion",
          unique: false
        },
        {
          name: "renderUnitId",
          keyPath: "renderUnitId",
          unique: false
        }
      ],
      classification: "asset-cache",
      retention: "refresh-from-assets",
      recordType: "StoredAssetRenderUnitRow",
      owner: "apps/extension/src/background/asset-packs.ts"
    },
    assetPackLexemes: {
      name: "asset-pack-lexemes",
      keyPath: "identity",
      indexes: [
        {
          name: "packIdentity",
          keyPath: "packIdentity",
          unique: false
        },
        {
          name: "bandId",
          keyPath: "bandId",
          unique: false
        },
        {
          name: "languagePairBandId",
          keyPath: ["languagePair", "bandId"],
          unique: false
        },
        {
          name: "assetVersion",
          keyPath: "assetVersion",
          unique: false
        },
        {
          name: "lexemeId",
          keyPath: "lexemeId",
          unique: false
        }
      ],
      classification: "asset-cache",
      retention: "refresh-from-assets",
      recordType: "StoredAssetLexemeRow",
      owner: "apps/extension/src/background/asset-packs.ts"
    },
    ttsVoices: {
      name: "tts-voices",
      keyPath: "voiceId",
      indexes: [
        {
          name: "languagePair",
          keyPath: "languagePair",
          unique: false
        },
        {
          name: "assetVersion",
          keyPath: "assetVersion",
          unique: false
        }
      ],
      classification: "asset-cache",
      retention: "refresh-from-assets",
      recordType: "StoredTtsVoiceAsset",
      owner: "apps/extension/src/background/tts-assets.ts"
    }
  }
} as const satisfies StorageSchemaDefinition;

export type StorageSchema = typeof STORAGE_SCHEMA;
export type IndexedDbStoreId = keyof StorageSchema["stores"];
export type IndexedDbStoreName =
  StorageSchema["stores"][IndexedDbStoreId]["name"];
