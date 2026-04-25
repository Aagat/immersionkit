const DATABASE_NAME = "immersionkit-extension";
const DATABASE_VERSION = 3;

export const INDEXEDDB_STORES = {
  sentenceCache: "sentence-cache",
  sentenceAnalysisCache: "sentence-analysis-cache",
  learningItems: "learning-items",
  phraseRegistry: "phrase-registry",
  reviewEvents: "review-events",
  learningItemContextHistory: "learning-item-context-history"
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
        database.createObjectStore(INDEXEDDB_STORES.sentenceAnalysisCache, {
          keyPath: "identity"
        });
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
