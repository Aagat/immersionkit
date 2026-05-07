type StorageRecord = Record<string, unknown>;

export async function readStorageValues(
  keys: readonly string[]
): Promise<StorageRecord> {
  if (typeof chrome === "undefined" || !chrome.storage?.local || keys.length === 0) {
    return {};
  }

  return new Promise((resolve) => {
    chrome.storage.local.get([...new Set(keys)], (values) => {
      if (chrome.runtime.lastError) {
        resolve({});
        return;
      }

      resolve(values as StorageRecord);
    });
  });
}

export async function removeStorageValues(keys: readonly string[]): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.storage?.local || keys.length === 0) {
    return;
  }

  await new Promise<void>((resolve) => {
    chrome.storage.local.remove([...new Set(keys)], () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

export function pickFirstDefinedValue(
  record: StorageRecord,
  keys: readonly string[]
): unknown {
  for (const key of keys) {
    if (record[key] !== undefined) {
      return record[key];
    }
  }

  return undefined;
}

export function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function isRecord(value: unknown): value is StorageRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
