import { describe, expect, it } from "vitest";

import {
  DATABASE_NAME,
  DATABASE_VERSION,
  INDEXEDDB_STORES
} from "../src/storage/indexeddb";
import { STORAGE_SCHEMA } from "../src/storage/storage-schema";
import { USER_DATA_KEYS } from "../src/shared/user-data-keys";

describe("storage schema contract", () => {
  it("is the source of truth for IndexedDB database and store metadata", () => {
    expect(DATABASE_NAME).toBe(STORAGE_SCHEMA.database.name);
    expect(DATABASE_VERSION).toBe(STORAGE_SCHEMA.database.version);
    expect(INDEXEDDB_STORES).toEqual(
      Object.fromEntries(
        Object.entries(STORAGE_SCHEMA.stores).map(([storeId, store]) => [
          storeId,
          store.name
        ])
      )
    );
  });

  it("keeps canonical user-data keys in the schema contract", () => {
    expect(USER_DATA_KEYS).toBe(STORAGE_SCHEMA.userDataKeys);
    expect(Object.values(USER_DATA_KEYS)).toEqual([
      "settings",
      "site-settings",
      "provider-openai-api-key",
      "curriculum-config",
      "learning-profile",
      "curriculum-progression-diagnostics",
      "first-run-intro-visible"
    ]);
  });

  it("does not define duplicate stores or duplicate indexes", () => {
    const storeNames = Object.values(STORAGE_SCHEMA.stores).map(
      (store) => store.name
    );
    expect(new Set(storeNames).size).toBe(storeNames.length);

    for (const store of Object.values(STORAGE_SCHEMA.stores)) {
      const indexNames = store.indexes.map((index) => index.name);
      expect(new Set(indexNames).size).toBe(indexNames.length);
    }
  });
});
