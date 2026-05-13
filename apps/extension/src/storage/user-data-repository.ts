import type { UserVocabEntry, VocabStatus } from "@immersionkit/shared";

import {
  INDEXEDDB_STORES,
  getIndexedDbStore,
  isIndexedDbAvailable,
  requestToPromise,
  transactionDone
} from "./indexeddb";
import { isRecord } from "./serialization";
import { STORAGE_SCHEMA } from "./storage-schema";
import { USER_DATA_KEYS } from "../shared/user-data-keys";

export { USER_DATA_KEYS } from "../shared/user-data-keys";

const USER_DATA_SCHEMA_VERSION = STORAGE_SCHEMA.recordVersions.userData;
const USER_VOCAB_SCHEMA_VERSION = STORAGE_SCHEMA.recordVersions.userVocab;

type StorageRecord = Record<string, unknown>;

type UserDataKeyDefinition = {
  key: string;
};

const USER_DATA_KEY_DEFINITIONS = [
  {
    key: USER_DATA_KEYS.settings
  },
  {
    key: USER_DATA_KEYS.siteSettings
  },
  {
    key: USER_DATA_KEYS.providerOpenAiApiKey
  },
  {
    key: USER_DATA_KEYS.curriculumConfig
  },
  {
    key: USER_DATA_KEYS.learningProfile
  },
  {
    key: USER_DATA_KEYS.curriculumProgressionDiagnostics
  },
  {
    key: USER_DATA_KEYS.firstRunIntro
  }
] as const satisfies readonly UserDataKeyDefinition[];

type UserDataRecord = {
  key: string;
  value: unknown;
  schemaVersion: number;
  updatedAt: string;
};

type StoredVocabRecord = UserVocabEntry & {
  schemaVersion?: number;
};

export class IndexedDbUserDataRepository {
  async getValue(key: string): Promise<unknown> {
    return (await this.getValues([key]))[key];
  }

  async setValue(key: string, value: unknown): Promise<void> {
    await this.setValues({ [key]: value });
  }

  async removeValue(key: string): Promise<void> {
    await this.removeValues([key]);
  }

  async getValues(keys: readonly string[]): Promise<StorageRecord> {
    if (!isIndexedDbAvailable()) {
      return {};
    }

    return this.readIndexedDbValues(keys);
  }

  async setValues(values: StorageRecord): Promise<void> {
    const entries = Object.entries(values);
    if (!isIndexedDbAvailable() || entries.length === 0) {
      return;
    }

    const store = await getIndexedDbStore(INDEXEDDB_STORES.userData, "readwrite");
    const transaction = store.transaction;
    const updatedAt = new Date().toISOString();
    for (const [key, value] of entries) {
      store.put({
        key,
        value,
        schemaVersion: USER_DATA_SCHEMA_VERSION,
        updatedAt
      } satisfies UserDataRecord);
    }
    await transactionDone(transaction);
  }

  async removeValues(keys: readonly string[]): Promise<void> {
    const uniqueKeys = [...new Set(keys)];
    if (!isIndexedDbAvailable() || uniqueKeys.length === 0) {
      return;
    }

    const store = await getIndexedDbStore(INDEXEDDB_STORES.userData, "readwrite");
    const transaction = store.transaction;
    for (const key of uniqueKeys) {
      store.delete(key);
    }
    await transactionDone(transaction);
  }

  private async readIndexedDbValues(keys: readonly string[]): Promise<StorageRecord> {
    const uniqueKeys = [...new Set(keys)];
    if (uniqueKeys.length === 0) {
      return {};
    }

    try {
      const store = await getIndexedDbStore(INDEXEDDB_STORES.userData, "readonly");
      const transaction = store.transaction;
      const done = transactionDone(transaction);
      const requests = uniqueKeys.map((key) =>
        requestToPromise(store.get(key)).then((record) => [key, record] as const)
      );
      const records = await Promise.all(requests);
      await done;
      return records.reduce<StorageRecord>((output, [key, record]) => {
        if (isRecord(record) && "value" in record) {
          output[key] = record.value;
        }
        return output;
      }, {});
    } catch (error) {
      console.warn("ImmersionKit IndexedDB user data read failed.", error);
      return {};
    }
  }
}

export class IndexedDbUserVocabRepository {
  async loadAll(): Promise<Map<string, UserVocabEntry>> {
    if (!isIndexedDbAvailable()) {
      return new Map();
    }

    return this.loadIndexedDbEntries();
  }

  async setStatus(input: {
    lexemeId: string;
    status: VocabStatus;
    lastSeenAt?: string | null;
    updatedAt?: string;
    incrementExposure?: boolean;
  }): Promise<UserVocabEntry | null> {
    const lexemeId = readString(input.lexemeId);
    if (!lexemeId) {
      return null;
    }

    const existingEntry = await this.getEntry(lexemeId);
    const now = input.updatedAt ?? new Date().toISOString();
    const shouldIncrementExposure = input.incrementExposure ?? true;
    const nextEntry: UserVocabEntry = {
      lexemeId,
      status: normalizeVocabStatus(input.status),
      updatedAt: now,
      createdAt: existingEntry?.createdAt ?? now,
      lastSeenAt: input.lastSeenAt === undefined ? now : input.lastSeenAt,
      exposureCount: Math.max(
        0,
        (existingEntry?.exposureCount ?? 0) +
          (shouldIncrementExposure ? 1 : 0)
      )
    };

    await this.upsertEntry(nextEntry);
    return nextEntry;
  }

  async upsertEntry(entry: UserVocabEntry): Promise<void> {
    if (!isIndexedDbAvailable()) {
      return;
    }

    const store = await getIndexedDbStore(INDEXEDDB_STORES.userVocab, "readwrite");
    const transaction = store.transaction;
    store.put({
      ...entry,
      schemaVersion: USER_VOCAB_SCHEMA_VERSION
    } satisfies StoredVocabRecord);
    await transactionDone(transaction);
  }

  private async loadIndexedDbEntries(): Promise<Map<string, UserVocabEntry>> {
    try {
      const store = await getIndexedDbStore(INDEXEDDB_STORES.userVocab, "readonly");
      return parseVocabEntries(await requestToPromise(store.getAll()));
    } catch (error) {
      console.warn("ImmersionKit IndexedDB vocab read failed.", error);
      return new Map();
    }
  }

  private async getEntry(lexemeId: string): Promise<UserVocabEntry | null> {
    if (!isIndexedDbAvailable()) {
      return null;
    }

    try {
      const store = await getIndexedDbStore(INDEXEDDB_STORES.userVocab, "readonly");
      return normalizeVocabEntry(await requestToPromise(store.get(lexemeId)));
    } catch (error) {
      console.warn("ImmersionKit IndexedDB vocab read failed.", error);
      return null;
    }
  }
}

export async function loadUserDataValues(
  keys: readonly string[]
): Promise<StorageRecord> {
  const repository = new IndexedDbUserDataRepository();
  const output: StorageRecord = {};
  const knownDefinitions = collectKnownDefinitions(keys);
  Object.assign(
    output,
    await repository.getValues(knownDefinitions.map((definition) => definition.key))
  );

  for (const key of Object.keys(output)) {
    if (output[key] === undefined) {
      delete output[key];
    }
  }

  return output;
}

export async function setUserDataValues(values: StorageRecord): Promise<void> {
  const repository = new IndexedDbUserDataRepository();
  const knownValues: StorageRecord = {};
  for (const [key, value] of Object.entries(values)) {
    const definition = findDefinitionForKey(key);
    if (!definition) {
      continue;
    }

    knownValues[definition.key] = value;
  }
  await repository.setValues(knownValues);
}

export async function removeUserDataValues(keys: readonly string[]): Promise<void> {
  const repository = new IndexedDbUserDataRepository();
  const definitions = collectKnownDefinitions(keys);
  await repository.removeValues(definitions.map((definition) => definition.key));
}

function parseVocabEntries(input: unknown): Map<string, UserVocabEntry> {
  const entries: UserVocabEntry[] = [];

  if (Array.isArray(input)) {
    for (const entry of input) {
      const normalized = normalizeVocabEntry(entry);
      if (normalized) {
        entries.push(normalized);
      }
    }
  } else if (isRecord(input)) {
    for (const value of Object.values(input)) {
      const normalized = normalizeVocabEntry(value);
      if (normalized) {
        entries.push(normalized);
      }
    }
  }

  return new Map(entries.map((entry) => [entry.lexemeId, entry] as const));
}

function collectKnownDefinitions(
  keys: readonly string[]
): UserDataKeyDefinition[] {
  const requestedKeys = new Set(keys);
  return USER_DATA_KEY_DEFINITIONS.filter((definition) =>
    requestedKeys.has(definition.key)
  );
}

function findDefinitionForKey(key: string): UserDataKeyDefinition | null {
  return (
    USER_DATA_KEY_DEFINITIONS.find((definition) => definition.key === key) ?? null
  );
}

function normalizeVocabEntry(input: unknown): UserVocabEntry | null {
  if (!isRecord(input)) {
    return null;
  }

  const lexemeId = readString(input.lexemeId);
  if (!lexemeId) {
    return null;
  }

  const now = new Date().toISOString();
  return {
    lexemeId,
    status: normalizeVocabStatus(input.status),
    lastSeenAt: readString(input.lastSeenAt),
    exposureCount: readNumber(input.exposureCount, 0),
    updatedAt: readString(input.updatedAt) ?? now,
    createdAt: readString(input.createdAt) ?? undefined
  };
}

function normalizeVocabStatus(value: unknown): VocabStatus {
  return value === "known" || value === "learning" || value === "ignored"
    ? value
    : "new";
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
