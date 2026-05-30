import { resetIndexedDbConnectionForTests } from "../../src/storage/indexeddb";

type StoreState = {
  keyPath: string | string[];
  records: Map<string, unknown>;
  indexes: Map<string, string | string[]>;
};

type DatabaseState = {
  version: number;
  stores: Map<string, StoreState>;
};

type MemoryRequest<T> = IDBRequest<T> & {
  result: T;
  error: DOMException | null;
  onsuccess: ((this: IDBRequest<T>, event: Event) => unknown) | null;
  onerror: ((this: IDBRequest<T>, event: Event) => unknown) | null;
  onupgradeneeded?: ((this: IDBOpenDBRequest, event: IDBVersionChangeEvent) => unknown) | null;
  transaction?: IDBTransaction | null;
};

export type IndexedDbTestStub = {
  clear(): void;
  restore(): void;
};

export function installIndexedDbStub(): IndexedDbTestStub {
  const existingIndexedDb = globalThis.indexedDB;
  const existingIDBKeyRange = globalThis.IDBKeyRange;
  const databases = new Map<string, DatabaseState>();

  resetIndexedDbConnectionForTests();
  globalThis.indexedDB = createFactory(databases) as IDBFactory;
  globalThis.IDBKeyRange = createKeyRangeFactory() as typeof IDBKeyRange;

  return {
    clear() {
      databases.clear();
      resetIndexedDbConnectionForTests();
    },
    restore() {
      resetIndexedDbConnectionForTests();
      if (existingIndexedDb) {
        globalThis.indexedDB = existingIndexedDb;
      } else {
        delete (globalThis as { indexedDB?: IDBFactory }).indexedDB;
      }

      if (existingIDBKeyRange) {
        globalThis.IDBKeyRange = existingIDBKeyRange;
      } else {
        delete (globalThis as { IDBKeyRange?: typeof IDBKeyRange }).IDBKeyRange;
      }
    }
  };
}

function createKeyRangeFactory(): Partial<typeof IDBKeyRange> {
  return {
    only(value: IDBValidKey): IDBKeyRange {
      return {
        lower: value,
        upper: value,
        lowerOpen: false,
        upperOpen: false
      } as IDBKeyRange;
    }
  };
}

function createFactory(databases: Map<string, DatabaseState>): Partial<IDBFactory> {
  return {
    open(name: string, version?: number): IDBOpenDBRequest {
      const request = createRequest<IDBDatabase>() as MemoryRequest<IDBDatabase> &
        IDBOpenDBRequest;

      queueMicrotask(() => {
        const requestedVersion = version ?? 1;
        const existing = databases.get(name);
        const shouldUpgrade = !existing || requestedVersion > existing.version;
        const state =
          existing ??
          {
            version: requestedVersion,
            stores: new Map<string, StoreState>()
          };
        state.version = Math.max(state.version, requestedVersion);
        databases.set(name, state);

        const database = new MemoryDatabase(state) as unknown as IDBDatabase;
        request.result = database;

        if (shouldUpgrade) {
          request.transaction = new MemoryTransaction(state, "versionchange") as
            unknown as IDBTransaction;
          request.onupgradeneeded?.call(
            request,
            createVersionChangeEvent(request) as IDBVersionChangeEvent
          );
        }

        request.onsuccess?.call(request, createEvent(request));
      });

      return request;
    },
    deleteDatabase(name: string): IDBOpenDBRequest {
      const request = createRequest<IDBDatabase>() as MemoryRequest<IDBDatabase> &
        IDBOpenDBRequest;
      queueMicrotask(() => {
        databases.delete(name);
        request.onsuccess?.call(request, createEvent(request));
      });
      return request;
    }
  };
}

class MemoryDatabase {
  constructor(private readonly state: DatabaseState) {}

  get objectStoreNames(): DOMStringList {
    return createDomStringList([...this.state.stores.keys()]);
  }

  createObjectStore(
    name: string,
    options: IDBObjectStoreParameters = {}
  ): IDBObjectStore {
    const keyPath = options.keyPath ?? "id";
    const store = {
      keyPath,
      records: new Map<string, unknown>(),
      indexes: new Map<string, string | string[]>()
    };
    this.state.stores.set(name, store);
    return new MemoryObjectStore(
      store,
      new MemoryTransaction(this.state, "versionchange")
    ) as unknown as IDBObjectStore;
  }

  transaction(
    storeNames: string | string[],
    mode: IDBTransactionMode = "readonly"
  ): IDBTransaction {
    return new MemoryTransaction(
      this.state,
      mode,
      Array.isArray(storeNames) ? storeNames : [storeNames]
    ) as unknown as IDBTransaction;
  }

  close(): void {}
}

class MemoryTransaction {
  oncomplete: ((this: IDBTransaction, event: Event) => unknown) | null = null;
  onabort: ((this: IDBTransaction, event: Event) => unknown) | null = null;
  onerror: ((this: IDBTransaction, event: Event) => unknown) | null = null;
  error: DOMException | null = null;
  private pending = 0;
  private completeQueued = false;
  private completed = false;

  constructor(
    private readonly state: DatabaseState,
    readonly mode: IDBTransactionMode,
    _storeNames: string[] = []
  ) {}

  objectStore(name: string): IDBObjectStore {
    const store = this.state.stores.get(name);
    if (!store) {
      throw new Error(`IndexedDB test store not found: ${name}`);
    }

    return new MemoryObjectStore(store, this) as unknown as IDBObjectStore;
  }

  queue<T>(operation: () => T): IDBRequest<T> {
    const request = createRequest<T>();
    this.pending += 1;

    queueMicrotask(() => {
      try {
        request.result = operation();
        request.onsuccess?.call(request, createEvent(request));
      } catch (error) {
        this.error =
          error instanceof DOMException
            ? error
            : new DOMException(String(error), "AbortError");
        request.error = this.error;
        request.onerror?.call(request, createEvent(request));
        this.onerror?.call(this as unknown as IDBTransaction, createEvent(this));
      } finally {
        this.pending -= 1;
        this.queueComplete();
      }
    });

    return request;
  }

  private queueComplete(): void {
    if (this.pending > 0 || this.completeQueued || this.completed) {
      return;
    }

    this.completeQueued = true;
    queueMicrotask(() => {
      this.completeQueued = false;
      if (this.pending > 0 || this.completed) {
        return;
      }

      this.completed = true;
      this.oncomplete?.call(
        this as unknown as IDBTransaction,
        createEvent(this)
      );
    });
  }
}

class MemoryObjectStore {
  constructor(
    private readonly state: StoreState,
    readonly transaction: MemoryTransaction
  ) {}

  get keyPath(): string | string[] {
    return this.state.keyPath;
  }

  get indexNames(): DOMStringList {
    return createDomStringList([...this.state.indexes.keys()]);
  }

  createIndex(name: string, keyPath: string | string[]): IDBIndex {
    this.state.indexes.set(name, keyPath);
    return {} as IDBIndex;
  }

  index(name: string): IDBIndex {
    const keyPath = this.state.indexes.get(name);
    if (!keyPath) {
      throw new Error(`IndexedDB test index not found: ${name}`);
    }

    return {
      getAll: () =>
        this.transaction.queue(() =>
          [...this.state.records.values()].filter((record) =>
            Boolean(readKeyPath(record, keyPath))
          )
        )
    } as unknown as IDBIndex;
  }

  get(key: IDBValidKey): IDBRequest<unknown> {
    return this.transaction.queue(() => this.state.records.get(stringifyKey(key)));
  }

  getAll(): IDBRequest<unknown[]> {
    return this.transaction.queue(() => [...this.state.records.values()]);
  }

  put(value: unknown): IDBRequest<IDBValidKey> {
    return this.transaction.queue(() => {
      const key = readKeyPath(value, this.state.keyPath);
      if (key === null) {
        throw new Error("IndexedDB test put missing keyPath value.");
      }

      this.state.records.set(stringifyKey(key), value);
      return key;
    });
  }

  delete(key: IDBValidKey): IDBRequest<undefined> {
    return this.transaction.queue(() => {
      this.state.records.delete(stringifyKey(key));
      return undefined;
    });
  }

  clear(): IDBRequest<undefined> {
    return this.transaction.queue(() => {
      this.state.records.clear();
      return undefined;
    });
  }

  count(): IDBRequest<number> {
    return this.transaction.queue(() => this.state.records.size);
  }
}

function createRequest<T>(): MemoryRequest<T> {
  return {
    result: undefined as T,
    error: null,
    source: null,
    transaction: null,
    readyState: "pending",
    onsuccess: null,
    onerror: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true
  } as MemoryRequest<T>;
}

function createDomStringList(values: string[]): DOMStringList {
  const list = [...values] as unknown as DOMStringList & string[];
  Object.defineProperties(list, {
    contains: {
      value: (value: string) => values.includes(value)
    },
    item: {
      value: (index: number) => values[index] ?? null
    }
  });
  return list;
}

function createEvent(target: unknown): Event {
  return { target } as Event;
}

function createVersionChangeEvent(target: unknown): Event {
  return { target, oldVersion: 0, newVersion: 1 } as Event;
}

function readKeyPath(
  value: unknown,
  keyPath: string | string[]
): IDBValidKey | null {
  if (Array.isArray(keyPath)) {
    const parts = keyPath.map((path) => readRecordValue(value, path));
    return parts.every((part): part is string => typeof part === "string")
      ? parts
      : null;
  }

  const key = readRecordValue(value, keyPath);
  return typeof key === "string" || typeof key === "number" ? key : null;
}

function readRecordValue(value: unknown, key: string): unknown {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function stringifyKey(key: IDBValidKey): string {
  return Array.isArray(key) ? JSON.stringify(key) : String(key);
}
