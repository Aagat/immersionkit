type RuntimeListener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
) => boolean | void;

type StorageValues = Record<string, unknown>;

export type ChromeTestStub = {
  sentMessages: unknown[];
  setStorageValues: (values: StorageValues) => void;
  getStorageSnapshot: () => StorageValues;
  dispatchRuntimeMessage: (
    message: unknown,
    sender?: chrome.runtime.MessageSender
  ) => Promise<unknown[]>;
  restore: () => void;
};

export function installChromeStub(initialStorage: StorageValues = {}): ChromeTestStub {
  const existingChrome = (globalThis as { chrome?: typeof chrome }).chrome;
  const listeners = new Set<RuntimeListener>();
  const sentMessages: unknown[] = [];
  const storageValues: StorageValues = { ...initialStorage };

  const chromeStub = {
    runtime: {
      lastError: undefined,
      onInstalled: {
        addListener: () => {}
      },
      onMessage: {
        addListener(listener: RuntimeListener) {
          listeners.add(listener);
        },
        removeListener(listener: RuntimeListener) {
          listeners.delete(listener);
        }
      },
      sendMessage(message: unknown, callback?: () => void) {
        sentMessages.push(message);
        callback?.();
      }
    },
    storage: {
      local: {
        get(keys: unknown, callback: (items: StorageValues) => void) {
          callback(resolveStorageRead(keys, storageValues));
        },
        set(items: StorageValues, callback?: () => void) {
          Object.assign(storageValues, items);
          callback?.();
        },
        remove(keys: unknown, callback?: () => void) {
          const normalizedKeys = Array.isArray(keys)
            ? keys.filter((key): key is string => typeof key === "string")
            : typeof keys === "string"
              ? [keys]
              : [];

          for (const key of normalizedKeys) {
            delete storageValues[key];
          }

          callback?.();
        }
      }
    },
    tabs: {
      query(_queryInfo: unknown, callback: (tabs: chrome.tabs.Tab[]) => void) {
        callback([]);
      },
      sendMessage(_tabId: number, _message: unknown, callback?: () => void) {
        callback?.();
      }
    }
  } as unknown as typeof chrome;

  (globalThis as { chrome?: typeof chrome }).chrome = chromeStub;

  return {
    sentMessages,
    setStorageValues(values: StorageValues) {
      Object.assign(storageValues, values);
    },
    getStorageSnapshot() {
      return { ...storageValues };
    },
    async dispatchRuntimeMessage(
      message: unknown,
      sender: chrome.runtime.MessageSender = {}
    ): Promise<unknown[]> {
      const responses: unknown[] = [];

      for (const listener of listeners) {
        let response: unknown;
        listener(message, sender, (value) => {
          response = value;
        });
        responses.push(response);
      }

      return responses;
    },
    restore() {
      if (existingChrome) {
        (globalThis as { chrome?: typeof chrome }).chrome = existingChrome;
        return;
      }

      delete (globalThis as { chrome?: typeof chrome }).chrome;
    }
  };
}

function resolveStorageRead(
  keys: unknown,
  storageValues: StorageValues
): StorageValues {
  if (Array.isArray(keys)) {
    const output: StorageValues = {};
    for (const key of keys) {
      if (typeof key === "string" && storageValues[key] !== undefined) {
        output[key] = storageValues[key];
      }
    }
    return output;
  }

  if (typeof keys === "string") {
    return storageValues[keys] === undefined ? {} : { [keys]: storageValues[keys] };
  }

  if (!keys || typeof keys !== "object") {
    return { ...storageValues };
  }

  const defaults = keys as StorageValues;
  const output: StorageValues = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    output[key] = storageValues[key] ?? fallback;
  }
  return output;
}
