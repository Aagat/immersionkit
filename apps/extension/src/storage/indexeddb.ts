import { STORAGE_SCHEMA, type IndexedDbStoreName } from "./storage-schema";

export const DATABASE_NAME = STORAGE_SCHEMA.database.name;
export const DATABASE_VERSION = STORAGE_SCHEMA.database.version;

type StorageStores = typeof STORAGE_SCHEMA.stores;
type IndexedDbStoreNameMap = {
  readonly [StoreId in keyof StorageStores]: StorageStores[StoreId]["name"];
};

export const INDEXEDDB_STORES = Object.fromEntries(
  Object.entries(STORAGE_SCHEMA.stores).map(([storeId, store]) => [
    storeId,
    store.name
  ])
) as IndexedDbStoreNameMap;

let databasePromise: Promise<IDBDatabase> | null = null;

export function resetIndexedDbConnectionForTests(): void {
  databasePromise = null;
}

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
      ensureObjectStores(database, request.transaction);
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

function ensureObjectStores(
  database: IDBDatabase,
  transaction: IDBTransaction | null
): void {
  for (const storeSchema of Object.values(STORAGE_SCHEMA.stores)) {
    let store: IDBObjectStore | null = null;
    if (!database.objectStoreNames.contains(storeSchema.name)) {
      store = database.createObjectStore(storeSchema.name, {
        keyPath: storeSchema.keyPath
      });
    } else {
      store = transaction?.objectStore(storeSchema.name) ?? null;
    }

    if (store) {
      for (const index of storeSchema.indexes) {
        ensureIndex(store, index.name, index.keyPath, index.unique);
      }
    }
  }
}

function ensureIndex(
  store: IDBObjectStore,
  indexName: string,
  keyPath: string | readonly string[],
  unique: boolean
): void {
  if (!store.indexNames.contains(indexName)) {
    store.createIndex(indexName, normalizeKeyPath(keyPath), { unique });
  }
}

function normalizeKeyPath(keyPath: string | readonly string[]): string | string[] {
  return typeof keyPath === "string" ? keyPath : [...keyPath];
}
