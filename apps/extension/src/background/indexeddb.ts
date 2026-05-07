const DATABASE_NAME = "immersionkit-extension";
const DATABASE_VERSION = 6;

export const INDEXEDDB_STORES = {
  sentenceCache: "sentence-cache",
  sentenceAnalysisCache: "sentence-analysis-cache",
  learningItems: "learning-items",
  phraseRegistry: "phrase-registry",
  reviewEvents: "review-events",
  learningItemContextHistory: "learning-item-context-history",
  assetPacks: "asset-packs",
  assetPackRenderUnits: "asset-pack-render-units",
  assetPackLexemes: "asset-pack-lexemes"
} as const;

type IndexedDbStoreName =
  (typeof INDEXEDDB_STORES)[keyof typeof INDEXEDDB_STORES];

let databasePromise: Promise<IDBDatabase> | null = null;

export function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

export async function getIndexedDbStore(
  storeName: IndexedDbStoreName,
  mode: IDBTransactionMode
): Promise<IDBObjectStore> {
  const database = await openDatabase();
  return database.transaction(storeName, mode).objectStore(storeName);
}

export async function getIndexedDbTransaction(
  storeNames: readonly IndexedDbStoreName[],
  mode: IDBTransactionMode
): Promise<IDBTransaction> {
  const database = await openDatabase();
  return database.transaction([...new Set(storeNames)], mode);
}

export async function countIndexedDbStore(
  storeName: IndexedDbStoreName
): Promise<number | null> {
  if (!isIndexedDbAvailable()) {
    return null;
  }

  try {
    const store = await getIndexedDbStore(storeName, "readonly");
    return await requestToPromise(store.count());
  } catch {
    return null;
  }
}

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB request failed."));
    };
  });
}

export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve();
    };
    transaction.onabort = () => {
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    };
    transaction.onerror = () => {
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    };
  });
}

async function openDatabase(): Promise<IDBDatabase> {
  if (!isIndexedDbAvailable()) {
    throw new Error("IndexedDB is unavailable in this runtime.");
  }

  databasePromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(INDEXEDDB_STORES.sentenceCache)) {
        database.createObjectStore(INDEXEDDB_STORES.sentenceCache, {
          keyPath: "sentenceHash"
        });
      }

      if (
        !database.objectStoreNames.contains(
          INDEXEDDB_STORES.sentenceAnalysisCache
        )
      ) {
        const store = database.createObjectStore(INDEXEDDB_STORES.sentenceAnalysisCache, {
          keyPath: "identity"
        });
        store.createIndex("sentenceHash", "sentenceHash", { unique: false });
      } else {
        const transaction = request.transaction;
        const store = transaction?.objectStore(INDEXEDDB_STORES.sentenceAnalysisCache);
        if (store && !store.indexNames.contains("sentenceHash")) {
          store.createIndex("sentenceHash", "sentenceHash", { unique: false });
        }
      }

      if (!database.objectStoreNames.contains(INDEXEDDB_STORES.reviewEvents)) {
        database.createObjectStore(INDEXEDDB_STORES.reviewEvents, {
          keyPath: "eventId"
        });
      }

      if (!database.objectStoreNames.contains(INDEXEDDB_STORES.learningItems)) {
        database.createObjectStore(INDEXEDDB_STORES.learningItems, {
          keyPath: "itemId"
        });
      }

      if (!database.objectStoreNames.contains(INDEXEDDB_STORES.phraseRegistry)) {
        database.createObjectStore(INDEXEDDB_STORES.phraseRegistry, {
          keyPath: "phraseId"
        });
      }

      if (
        !database.objectStoreNames.contains(
          INDEXEDDB_STORES.learningItemContextHistory
        )
      ) {
        database.createObjectStore(INDEXEDDB_STORES.learningItemContextHistory, {
          keyPath: "itemId"
        });
      }

      if (!database.objectStoreNames.contains(INDEXEDDB_STORES.assetPacks)) {
        const store = database.createObjectStore(INDEXEDDB_STORES.assetPacks, {
          keyPath: "identity"
        });
        store.createIndex("languagePair", "languagePair", { unique: false });
        store.createIndex("bandId", "bandId", { unique: false });
        store.createIndex("assetVersion", "assetVersion", { unique: false });
      } else {
        const transaction = request.transaction;
        const store = transaction?.objectStore(INDEXEDDB_STORES.assetPacks);
        if (store) {
          ensureIndex(store, "languagePair", "languagePair");
          ensureIndex(store, "bandId", "bandId");
          ensureIndex(store, "assetVersion", "assetVersion");
        }
      }

      if (
        !database.objectStoreNames.contains(
          INDEXEDDB_STORES.assetPackRenderUnits
        )
      ) {
        const store = database.createObjectStore(
          INDEXEDDB_STORES.assetPackRenderUnits,
          {
            keyPath: "identity"
          }
        );
        store.createIndex("packIdentity", "packIdentity", { unique: false });
        store.createIndex("bandId", "bandId", { unique: false });
        store.createIndex("languagePairBandId", ["languagePair", "bandId"], {
          unique: false
        });
        store.createIndex("assetVersion", "assetVersion", { unique: false });
        store.createIndex("renderUnitId", "renderUnitId", { unique: false });
      }

      if (
        !database.objectStoreNames.contains(INDEXEDDB_STORES.assetPackLexemes)
      ) {
        const store = database.createObjectStore(
          INDEXEDDB_STORES.assetPackLexemes,
          {
            keyPath: "identity"
          }
        );
        store.createIndex("packIdentity", "packIdentity", { unique: false });
        store.createIndex("bandId", "bandId", { unique: false });
        store.createIndex("languagePairBandId", ["languagePair", "bandId"], {
          unique: false
        });
        store.createIndex("assetVersion", "assetVersion", { unique: false });
        store.createIndex("lexemeId", "lexemeId", { unique: false });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB open failed."));
    };
  });

  return databasePromise;
}

function ensureIndex(
  store: IDBObjectStore,
  indexName: string,
  keyPath: string | string[]
): void {
  if (!store.indexNames.contains(indexName)) {
    store.createIndex(indexName, keyPath, { unique: false });
  }
}
