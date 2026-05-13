export const STORAGE_NAMESPACES = [
  "vocab",
  "sentence-cache",
  "site-settings",
  "extension-settings"
] as const;

export type StorageNamespace = (typeof STORAGE_NAMESPACES)[number];

export type StorageEntry<TValue> = {
  key: string;
  value: TValue;
};

export interface StorageAdapter {
  get<TValue>(namespace: StorageNamespace, key: string): Promise<TValue | null>;
  getMany<TValue>(
    namespace: StorageNamespace,
    keys: readonly string[]
  ): Promise<StorageEntry<TValue>[]>;
  set<TValue>(namespace: StorageNamespace, key: string, value: TValue): Promise<void>;
  setMany<TValue>(namespace: StorageNamespace, entries: readonly StorageEntry<TValue>[]): Promise<void>;
  delete(namespace: StorageNamespace, key: string): Promise<void>;
  list<TValue>(namespace: StorageNamespace): Promise<StorageEntry<TValue>[]>;
  clear(namespace: StorageNamespace): Promise<void>;
}
