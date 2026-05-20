import {
  DEFAULT_EXTENSION_SETTINGS,
  resolveCurriculumConfig,
  getRenderUnitSentenceHints
} from "@immersionkit/shared";
import { parseRenderUnitAsset } from "../../src/render-units/render-units";
import { resolveLearningProfileFromStorage } from "../../src/app-state/proficiency";

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
  createdTabs: chrome.tabs.CreateProperties[];
  openedOptionsPageCount: () => number;
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
  const createdTabs: chrome.tabs.CreateProperties[] = [];
  const storageValues: StorageValues = { ...initialStorage };
  let tabs: chrome.tabs.Tab[] = [];
  let openedOptionsPageCount = 0;
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
      },
      getManifest() {
        return {
          version: "0.1.0"
        } as chrome.runtime.Manifest;
      },
      getURL(path: string) {
        return `chrome-extension://test-extension/${path}`;
      },
      openOptionsPage(callback?: () => void) {
        openedOptionsPageCount += 1;
        callback?.();
      }
    },
    tabs: {
      query(queryInfo: unknown, callback: (tabs: chrome.tabs.Tab[]) => void) {
        callback(filterTabs(queryInfo, tabs));
      },
      sendMessage(tabId: number, message: unknown, callback?: () => void) {
        sentTabMessages.push({ tabId, message });
        callback?.();
      },
      create(
        createProperties: chrome.tabs.CreateProperties,
        callback?: (tab: chrome.tabs.Tab) => void
      ) {
        createdTabs.push(createProperties);
        callback?.({
          id: createdTabs.length,
          url: createProperties.url
        } as chrome.tabs.Tab);
      }
    }
  } as unknown as typeof chrome;

  (globalThis as { chrome?: typeof chrome }).chrome = chromeStub;

  return {
    sentMessages,
    sentTabMessages,
    createdTabs,
    openedOptionsPageCount() {
      return openedOptionsPageCount;
    },
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
        let didRespond = false;
        listener(message, sender, (value) => {
          didRespond = true;
          response = value;
        });
        if (didRespond) {
          responses.push(response);
        }
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
  if (messageType === "content/context/load") {
    return {
      ok: true,
      context: createContentContextResponse(message, storageValues)
    };
  }

  if (messageType === "content/analysis-context/get") {
    const entries = readSentenceAnalysisEntries(storageValues);
    const requestedHashes = readRequestedSentenceHashes(message);
    const filteredEntries =
      requestedHashes.size > 0
        ? entries.filter((entry) => requestedHashes.has(entry.sentenceHash))
        : [];
    return {
      ok: true,
      context: {
        entryCount: filteredEntries.length,
        entries: filteredEntries
      }
    };
  }

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

  if (messageType === "learning-items/get") {
    const unitRefIds = Array.isArray((message as { unitRefIds?: unknown }).unitRefIds)
      ? new Set(
          (message as { unitRefIds: unknown[] }).unitRefIds.filter(
            (unitRefId): unitRefId is string => typeof unitRefId === "string"
          )
        )
      : null;
    const items = readRuntimeLearningItems(storageValues).filter((item) =>
      unitRefIds && unitRefIds.size > 0 ? unitRefIds.has(item.unitRefId) : true
    );
    return {
      ok: true,
      items
    };
  }

  if (messageType === "sentence-analysis-cache/get") {
    const entries = readSentenceAnalysisEntries(storageValues);
    const requestedHashes = readRequestedSentenceHashes(message);
    return {
      ok: true,
      entries:
        requestedHashes.size > 0
          ? entries.filter((entry) => requestedHashes.has(entry.sentenceHash))
          : []
    };
  }

  if (messageType === "user-vocab/set-status") {
    return setRuntimeVocabStatus(message, storageValues);
  }

  if (messageType !== "assets/get-context") {
    return undefined;
  }

  return {
    ok: true,
    context: createAssetContext(storageValues)
  };
}

function createContentContextResponse(
  message: unknown,
  storageValues: StorageValues
) {
  const hostname =
    message &&
    typeof message === "object" &&
    typeof (message as { hostname?: unknown }).hostname === "string"
      ? (message as { hostname: string }).hostname
      : "fixtures.immersionkit.test";
  const settings = {
    ...DEFAULT_EXTENSION_SETTINGS,
    ...(isRecord(storageValues.settings) ? storageValues.settings : {}),
    targetLanguage: "es"
  };
  const siteSetting = readSiteSetting(storageValues["site-settings"], hostname);
  const assetContext = createAssetContext(storageValues);
  const requestedHashes = readRequestedSentenceHashes(message);
  const sentenceAnalysisEntries = readSentenceAnalysisEntries(storageValues).filter(
    (entry) => requestedHashes.size > 0 && requestedHashes.has(entry.sentenceHash)
  );

  return {
    settings,
    discoveryRate: clampUnitInterval(
      siteSetting?.discoveryRate ?? settings.discoveryRate
    ),
    siteSetting,
    siteEnabled: settings.enabled !== false && (siteSetting?.enabled ?? true),
    assetContext,
    vocabEntries: readRuntimeVocabEntries(storageValues),
    learningItems: readRuntimeLearningItems(storageValues),
    sentenceAnalysisEntries,
    curriculumConfig: resolveCurriculumConfig(
      isRecord(storageValues["curriculum-config"])
        ? storageValues["curriculum-config"]
        : null
    ),
    learningProfile: resolveLearningProfileFromStorage(
      storageValues["learning-profile"],
      isRecord(storageValues.settings) ? storageValues.settings.proficiencySeed : undefined
    )
  };
}

function createAssetContext(storageValues: StorageValues) {
  const renderUnitAsset = parseRenderUnitAsset(
    pickFirstDefinedValue(storageValues, ["asset-render-units", "renderUnits"])
  );
  if (renderUnitAsset) {
    return {
      renderUnits: renderUnitAsset.entries,
      sentenceHintPhrases: getRenderUnitSentenceHints(renderUnitAsset.entries),
      source: "cached-pack",
      assetVersion: renderUnitAsset.assetVersion,
      bandIds: [],
      missingBandIds: []
    };
  }

  return {
    renderUnits: [],
    sentenceHintPhrases: [],
    source: "empty",
    assetVersion: null,
    bandIds: [],
    missingBandIds: []
  };
}

function readRequestedSentenceHashes(message: unknown): Set<string> {
  if (!isRecord(message) || !Array.isArray(message.sentenceHashes)) {
    return new Set();
  }

  return new Set(
    message.sentenceHashes.filter((hash): hash is string => typeof hash === "string")
  );
}

function readSentenceAnalysisEntries(storageValues: StorageValues): Array<{
  sentenceHash: string;
  [key: string]: unknown;
}> {
  const rawEntries = storageValues["sentence-analysis-cache"];
  const values = Array.isArray(rawEntries)
    ? rawEntries
    : isRecord(rawEntries)
      ? Object.values(rawEntries)
      : [];

  return values.flatMap((value) => {
    if (!isRecord(value) || typeof value.sentenceHash !== "string") {
      return [];
    }

    return [value as { sentenceHash: string; [key: string]: unknown }];
  });
}

function readSiteSetting(input: unknown, hostname: string) {
  if (!isRecord(input)) {
    return null;
  }

  const candidate = input[hostname];
  if (!isRecord(candidate)) {
    return null;
  }

  const candidateHostname =
    typeof candidate.hostname === "string" ? candidate.hostname : hostname;
  if (candidateHostname !== hostname) {
    return null;
  }

  return {
    hostname,
    enabled: typeof candidate.enabled === "boolean" ? candidate.enabled : true,
    discoveryRate:
      typeof candidate.discoveryRate === "number" &&
      Number.isFinite(candidate.discoveryRate)
        ? clampUnitInterval(candidate.discoveryRate)
        : null,
    sentenceTranslationEnabled:
      typeof candidate.sentenceTranslationEnabled === "boolean"
        ? candidate.sentenceTranslationEnabled
        : null,
    updatedAt:
      typeof candidate.updatedAt === "string"
        ? candidate.updatedAt
        : new Date().toISOString()
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

function readRuntimeLearningItems(storageValues: StorageValues): RuntimeLearningItem[] {
  const rawItems = storageValues["learning-items"];
  const values = Array.isArray(rawItems)
    ? rawItems
    : isRecord(rawItems)
      ? Object.values(rawItems)
      : [];

  return values.flatMap((value): RuntimeLearningItem[] => {
    if (!isRecord(value)) {
      return [];
    }

    const itemId = typeof value.itemId === "string" ? value.itemId : null;
    const unitRefId = typeof value.unitRefId === "string" ? value.unitRefId : null;
    if (!itemId || !unitRefId) {
      return [];
    }

    return [
      {
        itemId,
        unitRefId,
        unitType:
          value.unitType === "phrase" || value.unitType === "grammar-feature"
            ? value.unitType
            : "word",
        sourceText: typeof value.sourceText === "string" ? value.sourceText : unitRefId,
        targetText: typeof value.targetText === "string" ? value.targetText : "",
        status:
          value.status === "learning" ||
          value.status === "reviewing" ||
          value.status === "mastered" ||
          value.status === "suspended"
            ? value.status
            : "new",
        introducedAt:
          typeof value.introducedAt === "string"
            ? value.introducedAt
            : new Date().toISOString(),
        lastExposedAt:
          typeof value.lastExposedAt === "string" ? value.lastExposedAt : undefined,
        lastReviewedAt:
          typeof value.lastReviewedAt === "string" ? value.lastReviewedAt : undefined,
        nextReviewAt:
          typeof value.nextReviewAt === "string" ? value.nextReviewAt : undefined,
        interval: readNumber(value.interval, 0),
        ease: readNumber(value.ease, 2.3),
        lapses: readNumber(value.lapses, 0),
        assistCount: readNumber(value.assistCount, 0),
        qualifiedExposureCount: readNumber(value.qualifiedExposureCount, 0),
        consecutiveUnassistedCount: readNumber(value.consecutiveUnassistedCount, 0),
        distinctContextCount: readNumber(value.distinctContextCount, 0),
        suspended: value.suspended === true
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

type RuntimeLearningItem = {
  itemId: string;
  unitRefId: string;
  unitType: "word" | "phrase" | "grammar-feature";
  sourceText: string;
  targetText: string;
  status: "new" | "learning" | "reviewing" | "mastered" | "suspended";
  introducedAt: string;
  lastExposedAt?: string;
  lastReviewedAt?: string;
  nextReviewAt?: string;
  interval: number;
  ease: number;
  lapses: number;
  assistCount: number;
  qualifiedExposureCount: number;
  consecutiveUnassistedCount: number;
  distinctContextCount: number;
  suspended: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampUnitInterval(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_EXTENSION_SETTINGS.discoveryRate;
  }

  return Math.max(0, Math.min(1, value));
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
