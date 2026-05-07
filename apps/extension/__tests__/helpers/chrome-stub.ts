import {
  getRenderUnitSentenceHints,
  parseRenderUnitAsset
} from "../../src/render-units/render-units";

type RuntimeListener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
) => boolean | void;

type StorageValues = Record<string, unknown>;
const USER_VOCAB_STORE_KEY = "user-vocab";

export type ChromeTestStub = {
  sentMessages: unknown[];
  sentTabMessages: { tabId: number; message: unknown }[];
  setStorageValues: (values: StorageValues) => void;
  setTabs: (tabs: chrome.tabs.Tab[]) => void;
  setSendMessageHandler: (
    handler: ((message: unknown) => unknown | Promise<unknown>) | null
  ) => void;
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
  const sentTabMessages: { tabId: number; message: unknown }[] = [];
  const storageValues: StorageValues = { ...initialStorage };
  let tabs: chrome.tabs.Tab[] = [];
  let sendMessageHandler:
    | ((message: unknown) => unknown | Promise<unknown>)
    | null = null;

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
      sendMessage(message: unknown, callback?: (response?: unknown) => void) {
        sentMessages.push(message);
        if (!sendMessageHandler) {
          callback?.(createDefaultRuntimeResponse(message, storageValues));
          return;
        }

        Promise.resolve(sendMessageHandler(message)).then((response) => {
          callback?.(
            response === undefined
              ? createDefaultRuntimeResponse(message, storageValues)
              : response
          );
        });
      }
    },
    tabs: {
      query(queryInfo: unknown, callback: (tabs: chrome.tabs.Tab[]) => void) {
        callback(filterTabs(queryInfo, tabs));
      },
      sendMessage(tabId: number, message: unknown, callback?: () => void) {
        sentTabMessages.push({ tabId, message });
        callback?.();
      }
    }
  } as unknown as typeof chrome;

  (globalThis as { chrome?: typeof chrome }).chrome = chromeStub;

  return {
    sentMessages,
    sentTabMessages,
    setStorageValues(values: StorageValues) {
      Object.assign(storageValues, values);
    },
    setTabs(nextTabs: chrome.tabs.Tab[]) {
      tabs = [...nextTabs];
    },
    setSendMessageHandler(handler) {
      sendMessageHandler = handler;
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

function createDefaultRuntimeResponse(
  message: unknown,
  storageValues: StorageValues
): unknown {
  if (!message || typeof message !== "object") {
    return undefined;
  }

  const messageType = (message as { type?: unknown }).type;
  if (messageType === "user-data/get") {
    const keys = Array.isArray((message as { keys?: unknown }).keys)
      ? (message as { keys: unknown[] }).keys
      : [];
    return {
      ok: true,
      values: resolveStorageRead(keys, storageValues)
    };
  }

  if (messageType === "user-vocab/get") {
    const lexemeIds = Array.isArray((message as { lexemeIds?: unknown }).lexemeIds)
      ? new Set(
          (message as { lexemeIds: unknown[] }).lexemeIds.filter(
            (lexemeId): lexemeId is string => typeof lexemeId === "string"
          )
        )
      : null;
    const entries = readRuntimeVocabEntries(storageValues).filter((entry) =>
      lexemeIds && lexemeIds.size > 0 ? lexemeIds.has(entry.lexemeId) : true
    );
    return {
      ok: true,
      entries
    };
  }

  if (messageType === "user-vocab/set-status") {
    return setRuntimeVocabStatus(message, storageValues);
  }

  if (messageType !== "assets/get-context") {
    return undefined;
  }

  const renderUnitAsset = parseRenderUnitAsset(
    pickFirstDefinedValue(storageValues, ["asset-render-units", "renderUnits"])
  );
  if (renderUnitAsset) {
    return {
      ok: true,
      context: {
        renderUnits: renderUnitAsset.entries,
        sentenceHintPhrases: getRenderUnitSentenceHints(renderUnitAsset.entries),
        source: "cached-pack",
        assetVersion: renderUnitAsset.assetVersion,
        bandIds: [],
        missingBandIds: []
      }
    };
  }

  return {
    ok: true,
    context: {
      renderUnits: [],
      sentenceHintPhrases: [],
      source: "empty",
      assetVersion: null,
      bandIds: [],
      missingBandIds: []
    }
  };
}

function readRuntimeVocabEntries(storageValues: StorageValues): RuntimeVocabEntry[] {
  const rawVocab = storageValues[USER_VOCAB_STORE_KEY];
  const values = Array.isArray(rawVocab)
    ? rawVocab
    : rawVocab && typeof rawVocab === "object"
      ? Object.values(rawVocab)
      : [];
  return values.flatMap((value): RuntimeVocabEntry[] => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return [];
    }

    const entry = value as Record<string, unknown>;
    const lexemeId = typeof entry.lexemeId === "string" ? entry.lexemeId : null;
    if (!lexemeId) {
      return [];
    }

    return [
      {
        lexemeId,
        status:
          entry.status === "known" ||
          entry.status === "learning" ||
          entry.status === "ignored"
            ? entry.status
            : "new",
        lastSeenAt:
          typeof entry.lastSeenAt === "string" ? entry.lastSeenAt : null,
        exposureCount:
          typeof entry.exposureCount === "number" &&
          Number.isFinite(entry.exposureCount)
            ? entry.exposureCount
            : 0,
        updatedAt:
          typeof entry.updatedAt === "string"
            ? entry.updatedAt
            : new Date().toISOString()
      }
    ];
  });
}

function setRuntimeVocabStatus(
  message: unknown,
  storageValues: StorageValues
): unknown {
  if (!message || typeof message !== "object") {
    return { ok: true, entry: null };
  }

  const payload = message as Record<string, unknown>;
  const lexemeId = typeof payload.lexemeId === "string" ? payload.lexemeId : "";
  if (!lexemeId.trim()) {
    return { ok: true, entry: null };
  }

  const entries = new Map(
    readRuntimeVocabEntries(storageValues).map((entry) => [entry.lexemeId, entry])
  );
  const existingEntry = entries.get(lexemeId);
  const now =
    typeof payload.updatedAt === "string"
      ? payload.updatedAt
      : new Date().toISOString();
  const status =
    payload.status === "known" ||
    payload.status === "learning" ||
    payload.status === "ignored"
      ? payload.status
      : "new";
  const entry: RuntimeVocabEntry = {
    lexemeId,
    status,
    lastSeenAt:
      payload.lastSeenAt === null
        ? null
        : typeof payload.lastSeenAt === "string"
          ? payload.lastSeenAt
          : now,
    exposureCount:
      (existingEntry?.exposureCount ?? 0) +
      (payload.incrementExposure === false ? 0 : 1),
    updatedAt: now
  };
  entries.set(lexemeId, entry);
  storageValues[USER_VOCAB_STORE_KEY] = Object.fromEntries(entries);

  return {
    ok: true,
    entry
  };
}

type RuntimeVocabEntry = {
  lexemeId: string;
  status: "new" | "learning" | "known" | "ignored";
  lastSeenAt: string | null;
  exposureCount: number;
  updatedAt: string;
};

function pickFirstDefinedValue(
  record: StorageValues,
  keys: readonly string[]
): unknown {
  for (const key of keys) {
    if (record[key] !== undefined) {
      return record[key];
    }
  }

  return undefined;
}

function filterTabs(queryInfo: unknown, tabs: chrome.tabs.Tab[]): chrome.tabs.Tab[] {
  if (!queryInfo || typeof queryInfo !== "object") {
    return tabs;
  }

  const query = queryInfo as { active?: unknown; url?: unknown };
  return tabs.filter((tab) => {
    if (typeof query.active === "boolean" && tab.active !== query.active) {
      return false;
    }

    if (Array.isArray(query.url)) {
      const tabUrl = typeof tab.url === "string" ? tab.url : "";
      return query.url.some((pattern) =>
        pattern === "http://*/*"
          ? tabUrl.startsWith("http://")
          : pattern === "https://*/*"
            ? tabUrl.startsWith("https://")
            : false
      );
    }

    return true;
  });
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
