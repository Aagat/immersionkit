import {
  getRenderUnitSentenceHints,
  parseLexemeAsset,
  parseRenderUnitAsset,
  renderUnitsToSeedLexiconEntries
} from "../../src/render-units/render-units";
import { parseSeedLexiconInput } from "../../src/seed/seed-lexicon";

type RuntimeListener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
) => boolean | void;

type StorageValues = Record<string, unknown>;

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
  if (
    !message ||
    typeof message !== "object" ||
    (message as { type?: unknown }).type !== "assets/get-context"
  ) {
    return undefined;
  }

  const renderUnitAsset = parseRenderUnitAsset(
    pickFirstDefinedValue(storageValues, ["immersionkit.renderUnits", "renderUnits"])
  );
  if (renderUnitAsset) {
    const lexemeAsset = parseLexemeAsset(
      pickFirstDefinedValue(storageValues, ["immersionkit.lexemes", "lexemes"])
    );
    return {
      ok: true,
      context: {
        lexicon: renderUnitsToSeedLexiconEntries(
          renderUnitAsset.entries,
          lexemeAsset?.entries ?? []
        ),
        renderUnits: renderUnitAsset.entries,
        sentenceHintPhrases: getRenderUnitSentenceHints(renderUnitAsset.entries),
        source: "cached-pack",
        assetVersion: renderUnitAsset.assetVersion,
        bandIds: [],
        missingBandIds: []
      }
    };
  }

  const seedLexicon = parseSeedLexiconInput(
    pickFirstDefinedValue(storageValues, [
      "immersionkit.seedLexicon",
      "seedLexicon",
      "lexicon"
    ])
  );
  return {
    ok: true,
    context: {
      lexicon: seedLexicon?.entries ?? [],
      renderUnits: [],
      sentenceHintPhrases: [],
      source: seedLexicon ? "cached-pack" : "empty",
      assetVersion: seedLexicon?.assetVersion ?? null,
      bandIds: [],
      missingBandIds: []
    }
  };
}

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
