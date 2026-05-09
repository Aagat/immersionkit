import {
  resolveCurriculumConfig,
  resolveActiveCurriculumBand,
  DEFAULT_LANGUAGE_PAIR_ID,
  isLanguagePairId,
  type ActiveAssetContext,
  type AssetContextLoadSource,
  type CurriculumConfig,
  type CurriculumRuntimeProfileInput,
  type LanguagePairId,
  type LexemeEntry,
  type RenderUnitEntry
} from "@immersionkit/shared";

import {
  getRenderUnitSentenceHints,
  parseLexemeAsset,
  parseRenderUnitAsset
} from "../render-units/render-units";
import {
  INDEXEDDB_STORES,
  getIndexedDbTransaction,
  getIndexedDbStore,
  isIndexedDbAvailable,
  requestToPromise,
  transactionDone
} from "../storage/indexeddb";
import { isRecord, readString } from "../storage/serialization";
import {
  loadBackgroundRuntimeConfig,
  type BackgroundRuntimeConfig
} from "./settings";
import { diagnosticInfo } from "../shared/logger";

const LOCAL_DEV_ASSET_BASE_URL = "http://127.0.0.1:8787/assets";
const FIRST_RUN_REMOTE_LOAD_TIMEOUT_MS = 2500;

export type AssetPackManifestEntry = {
  bandId: string;
  url: string;
  assetVersion?: string;
  languagePair?: LanguagePairId;
};

export type AssetPackManifest = {
  schemaVersion: string;
  assetVersion: string;
  languagePair: LanguagePairId;
  packs: AssetPackManifestEntry[];
};

export type AssetPack = {
  schemaVersion: string;
  assetVersion: string;
  languagePair: LanguagePairId;
  bandId: string;
  renderUnits: RenderUnitEntry[];
  lexemes: LexemeEntry[];
  generatedAt?: string;
};

export type StoredAssetPack = AssetPack & {
  identity: string;
  cachedAt: string;
  sourceUrl?: string;
};

type StoredAssetPackMetadata = Omit<AssetPack, "renderUnits" | "lexemes"> & {
  identity: string;
  cachedAt: string;
  sourceUrl?: string;
  renderUnitCount: number;
  lexemeCount: number;
};

type StoredAssetRenderUnitRow = {
  identity: string;
  packIdentity: string;
  languagePair: LanguagePairId;
  assetVersion: string;
  bandId: string;
  renderUnitId: string;
  sortOrder: number;
  cachedAt: string;
  entry: RenderUnitEntry;
};

type StoredAssetLexemeRow = {
  identity: string;
  packIdentity: string;
  languagePair: LanguagePairId;
  assetVersion: string;
  bandId: string;
  lexemeId: string;
  sortOrder: number;
  cachedAt: string;
  entry: LexemeEntry;
};

export interface AssetPackRepository {
  getLatestPacksForBands(
    languagePair: LanguagePairId,
    bandIds: readonly string[]
  ): Promise<StoredAssetPack[]>;
  putPacks(
    packs: readonly AssetPack[],
    options: { cachedAt: string; sourceUrlByBandId?: ReadonlyMap<string, string> }
  ): Promise<boolean>;
  retainOnly(identities: readonly string[]): Promise<void>;
}

type FetchJson = (url: string) => Promise<unknown>;

type AssetPackServiceOptions = {
  assetBaseUrl?: string | null;
  fetchJson?: FetchJson;
  repository?: AssetPackRepository;
  loadRuntimeConfig?: () => Promise<BackgroundRuntimeConfig>;
  remoteLoadTimeoutMs?: number;
};

type RemotePackLoadResult =
  | {
      status: "success";
      packs: AssetPack[];
      assetVersion: string;
      missingBandIds: string[];
      sourceUrlByBandId: Map<string, string>;
    }
  | {
      status: "failure";
    };

let singletonService: BackgroundAssetPackService | null = null;

export function getBackgroundAssetPackService(): BackgroundAssetPackService {
  singletonService ??= new BackgroundAssetPackService();
  return singletonService;
}

export class BackgroundAssetPackService {
  private readonly assetBaseUrl: string | null;
  private readonly fetchJson: FetchJson;
  private readonly repository: AssetPackRepository;
  private readonly loadRuntimeConfig: () => Promise<BackgroundRuntimeConfig>;
  private readonly remoteLoadTimeoutMs: number;
  private readonly remoteRefreshesByBandWindow = new Map<
    string,
    Promise<ActiveAssetContext | null>
  >();

  constructor(options: AssetPackServiceOptions = {}) {
    this.assetBaseUrl =
      options.assetBaseUrl === undefined
        ? readConfiguredAssetBaseUrl()
        : normalizeBaseUrl(options.assetBaseUrl);
    this.fetchJson = options.fetchJson ?? fetchJson;
    this.repository = options.repository ?? new IndexedDbAssetPackRepository();
    this.loadRuntimeConfig = options.loadRuntimeConfig ?? loadBackgroundRuntimeConfig;
    this.remoteLoadTimeoutMs =
      options.remoteLoadTimeoutMs ?? FIRST_RUN_REMOTE_LOAD_TIMEOUT_MS;
  }

  async loadActiveContext(): Promise<ActiveAssetContext> {
    const runtimeConfig = await this.loadRuntimeConfig();
    const languagePair = runtimeConfig.settings.languagePair;
    const bandIds = resolveActiveAssetBandWindow(
      runtimeConfig.curriculum.config,
      runtimeConfig.curriculum.profile
    );

    const cachedPacks = await this.repository.getLatestPacksForBands(
      languagePair,
      bandIds
    );
    if (cachedPacks.length > 0) {
      void this.refreshRemotePacks(languagePair, bandIds);
      return createActiveAssetContext({
        languagePair,
        packs: cachedPacks,
        source: "cached-pack",
        bandIds
      });
    }

    const remoteContext = await withTimeout(
      this.refreshRemotePacks(languagePair, bandIds),
      this.remoteLoadTimeoutMs
    );
    if (remoteContext) {
      return remoteContext;
    }

    return createActiveAssetContext({
      languagePair,
      packs: [],
      source: "empty",
      bandIds
    });
  }

  private refreshRemotePacks(
    languagePair: LanguagePairId,
    bandIds: readonly string[]
  ): Promise<ActiveAssetContext | null> {
    if (!this.assetBaseUrl || bandIds.length === 0) {
      return Promise.resolve(null);
    }

    const bandWindowKey = buildBandWindowKey(languagePair, bandIds);
    const existingRefresh = this.remoteRefreshesByBandWindow.get(bandWindowKey);
    if (existingRefresh) {
      return existingRefresh;
    }

    const refresh = this.refreshRemotePacksNow(languagePair, bandIds)
      .catch((error) => {
        diagnosticInfo("ImmersionKit asset pack refresh skipped.", error);
        return null;
      })
      .finally(() => {
        this.remoteRefreshesByBandWindow.delete(bandWindowKey);
      });
    this.remoteRefreshesByBandWindow.set(bandWindowKey, refresh);
    return refresh;
  }

  private async refreshRemotePacksNow(
    languagePair: LanguagePairId,
    bandIds: readonly string[]
  ): Promise<ActiveAssetContext | null> {
    const remoteResult = await this.loadRemotePacks(languagePair, bandIds);
    if (remoteResult.status !== "success") {
      return null;
    }

    const cachedMissingPacks =
      remoteResult.missingBandIds.length > 0
        ? await this.repository.getLatestPacksForBands(
            languagePair,
            remoteResult.missingBandIds
          )
        : [];
    const packsForContext = [...remoteResult.packs, ...cachedMissingPacks];
    const loadedBandIds = new Set(packsForContext.map((pack) => pack.bandId));
    const cachedAt = new Date().toISOString();
    const stored = await this.repository.putPacks(remoteResult.packs, {
      cachedAt,
      sourceUrlByBandId: remoteResult.sourceUrlByBandId
    });
    if (stored) {
      await this.repository.retainOnly(
        packsForContext.map((pack) => buildAssetPackIdentity(pack))
      );
    }

    return createActiveAssetContext({
      languagePair,
      packs: packsForContext,
      source: "remote-pack",
      bandIds,
      missingBandIds: bandIds.filter((bandId) => !loadedBandIds.has(bandId)),
      assetVersion:
        cachedMissingPacks.length === 0 ? remoteResult.assetVersion : undefined
    });
  }

  private async loadRemotePacks(
    languagePair: LanguagePairId,
    bandIds: readonly string[]
  ): Promise<RemotePackLoadResult> {
    if (!this.assetBaseUrl) {
      return { status: "failure" };
    }

    try {
      const manifestUrl = buildManifestUrl(this.assetBaseUrl, languagePair);
      const manifest = validateAssetPackManifest(
        await this.fetchJson(manifestUrl),
        languagePair
      );
      if (!manifest) {
        return { status: "failure" };
      }

      const packEntriesByBandId = new Map(
        manifest.packs.map((entry) => [entry.bandId, entry] as const)
      );
      const sourceUrlByBandId = new Map<string, string>();
      const requestedEntries = bandIds.flatMap((bandId): AssetPackManifestEntry[] => {
        const entry = packEntriesByBandId.get(bandId);
        return entry ? [entry] : [];
      });
      if (bandIds.length > 0 && requestedEntries.length === 0) {
        return { status: "failure" };
      }

      const missingBandIds = bandIds.filter(
        (bandId) => !packEntriesByBandId.has(bandId)
      );
      const packs = await Promise.all(
        requestedEntries.map(async (entry) => {
          const packUrl = resolvePackUrl(entry.url, manifestUrl);
          sourceUrlByBandId.set(entry.bandId, packUrl);
          return validateAssetPack(await this.fetchJson(packUrl), {
            bandId: entry.bandId,
            assetVersion: entry.assetVersion ?? manifest.assetVersion,
            languagePair: manifest.languagePair
          });
        })
      );

      if (packs.some((pack) => !pack)) {
        return { status: "failure" };
      }

      return {
        status: "success",
        packs: packs.filter((pack): pack is AssetPack => Boolean(pack)),
        assetVersion: manifest.assetVersion,
        missingBandIds,
        sourceUrlByBandId
      };
    } catch (error) {
      diagnosticInfo("ImmersionKit asset pack fetch skipped.", error);
      return { status: "failure" };
    }
  }
}

class IndexedDbAssetPackRepository implements AssetPackRepository {
  async getLatestPacksForBands(
    languagePair: LanguagePairId,
    bandIds: readonly string[]
  ): Promise<StoredAssetPack[]> {
    if (bandIds.length === 0 || !isIndexedDbAvailable()) {
      return [];
    }

    try {
      const store = await getIndexedDbStore(INDEXEDDB_STORES.assetPacks, "readonly");
      const metadata = await readLatestPackMetadataForBands(
        store,
        languagePair,
        bandIds
      );
      return await readStoredPacksForMetadata(metadata);
    } catch (error) {
      console.warn("ImmersionKit IndexedDB asset pack read failed.", error);
      return [];
    }
  }

  async putPacks(
    packs: readonly AssetPack[],
    options: { cachedAt: string; sourceUrlByBandId?: ReadonlyMap<string, string> }
  ): Promise<boolean> {
    if (packs.length === 0) {
      return true;
    }

    if (!isIndexedDbAvailable()) {
      return false;
    }

    try {
      const transaction = await getIndexedDbTransaction(
        [
          INDEXEDDB_STORES.assetPacks,
          INDEXEDDB_STORES.assetPackRenderUnits,
          INDEXEDDB_STORES.assetPackLexemes
        ],
        "readwrite"
      );
      const done = transactionDone(transaction);
      const store = transaction.objectStore(INDEXEDDB_STORES.assetPacks);
      const renderUnitStore = transaction.objectStore(
        INDEXEDDB_STORES.assetPackRenderUnits
      );
      const lexemeStore = transaction.objectStore(
        INDEXEDDB_STORES.assetPackLexemes
      );
      for (const pack of packs) {
        const identity = buildAssetPackIdentity(pack);
        store.put({
          schemaVersion: pack.schemaVersion,
          assetVersion: pack.assetVersion,
          languagePair: pack.languagePair,
          bandId: pack.bandId,
          generatedAt: pack.generatedAt,
          identity,
          cachedAt: options.cachedAt,
          sourceUrl: options.sourceUrlByBandId?.get(pack.bandId),
          renderUnitCount: pack.renderUnits.length,
          lexemeCount: pack.lexemes.length
        } satisfies StoredAssetPackMetadata);

        pack.renderUnits.forEach((entry, sortOrder) => {
          renderUnitStore.put({
            identity: buildAssetRowIdentity(identity, "render-unit", entry.renderUnitId),
            packIdentity: identity,
            languagePair: pack.languagePair,
            assetVersion: pack.assetVersion,
            bandId: pack.bandId,
            renderUnitId: entry.renderUnitId,
            sortOrder,
            cachedAt: options.cachedAt,
            entry
          } satisfies StoredAssetRenderUnitRow);
        });

        pack.lexemes.forEach((entry, sortOrder) => {
          lexemeStore.put({
            identity: buildAssetRowIdentity(identity, "lexeme", entry.lexemeId),
            packIdentity: identity,
            languagePair: pack.languagePair,
            assetVersion: pack.assetVersion,
            bandId: pack.bandId,
            lexemeId: entry.lexemeId,
            sortOrder,
            cachedAt: options.cachedAt,
            entry
          } satisfies StoredAssetLexemeRow);
        });
      }
      await done;
      return true;
    } catch (error) {
      console.warn("ImmersionKit IndexedDB asset pack write failed.", error);
      return false;
    }
  }

  async retainOnly(identities: readonly string[]): Promise<void> {
    if (!isIndexedDbAvailable()) {
      return;
    }

    try {
      const retain = new Set(identities);
      const transaction = await getIndexedDbTransaction(
        [
          INDEXEDDB_STORES.assetPacks,
          INDEXEDDB_STORES.assetPackRenderUnits,
          INDEXEDDB_STORES.assetPackLexemes
        ],
        "readwrite"
      );
      const done = transactionDone(transaction);
      const store = transaction.objectStore(INDEXEDDB_STORES.assetPacks);
      const renderUnitStore = transaction.objectStore(
        INDEXEDDB_STORES.assetPackRenderUnits
      );
      const lexemeStore = transaction.objectStore(
        INDEXEDDB_STORES.assetPackLexemes
      );
      const allPacks = (await requestToPromise(store.getAll()))
        .map((entry) => normalizeStoredAssetPackMetadata(entry))
        .filter((entry): entry is StoredAssetPackMetadata => Boolean(entry));
      const rowDeletionPromises: Promise<void>[] = [];

      for (const pack of allPacks) {
        if (!retain.has(pack.identity)) {
          store.delete(pack.identity);
          rowDeletionPromises.push(
            deleteStoredRowsForPack(renderUnitStore, pack.identity),
            deleteStoredRowsForPack(lexemeStore, pack.identity)
          );
        }
      }

      await Promise.all(rowDeletionPromises);
      await done;
    } catch (error) {
      console.warn("ImmersionKit IndexedDB asset pack cleanup failed.", error);
    }
  }
}

export function resolveActiveAssetBandWindow(
  config: Partial<CurriculumConfig> | null | undefined,
  profile?: CurriculumRuntimeProfileInput | null
): string[] {
  const resolvedConfig = resolveCurriculumConfig(config);
  const orderedBands = [...resolvedConfig.bands]
    .filter((band) => band && typeof band.bandId === "string")
    .sort((left, right) => left.order - right.order);

  if (orderedBands.length === 0) {
    return [];
  }

  const wordBand = resolveActiveCurriculumBand(resolvedConfig, "word", profile);
  const phraseBand =
    profile?.activePhraseBandId &&
    profile.activePhraseBandId !== wordBand?.bandId
      ? resolveActiveCurriculumBand(resolvedConfig, "phrase", profile)
      : null;
  const activeBands = [wordBand, phraseBand].flatMap((band) =>
    band ? [band] : []
  );
  if (activeBands.length === 0 && orderedBands[0]) {
    activeBands.push(orderedBands[0]);
  }
  const windowIds = new Set<string>();

  for (const activeBand of activeBands) {
    const activeIndex = Math.max(
      0,
      activeBand
        ? orderedBands.findIndex((band) => band.bandId === activeBand.bandId)
        : 0
    );
    const clampedIndex = activeIndex >= 0 ? activeIndex : 0;
    for (
      let index = Math.max(0, clampedIndex - 1);
      index <= Math.min(orderedBands.length - 1, clampedIndex + 1);
      index += 1
    ) {
      const bandId = orderedBands[index]?.bandId;
      if (bandId) {
        windowIds.add(bandId);
      }
    }
  }

  return orderedBands
    .map((band) => band.bandId)
    .filter((bandId) => windowIds.has(bandId));
}

export function validateAssetPackManifest(
  input: unknown,
  expectedLanguagePair?: LanguagePairId
): AssetPackManifest | null {
  if (!isRecord(input)) {
    return null;
  }

  const schemaVersion = readString(input.schemaVersion);
  const assetVersion = readString(input.assetVersion);
  const languagePair = readLanguagePair(input.languagePair);
  if (!schemaVersion || !assetVersion || !languagePair || !Array.isArray(input.packs)) {
    return null;
  }
  if (expectedLanguagePair && languagePair !== expectedLanguagePair) {
    return null;
  }

  const packs = input.packs.flatMap((entry): AssetPackManifestEntry[] => {
    if (!isRecord(entry)) {
      return [];
    }

    const bandId = readString(entry.bandId);
    const url = readString(entry.url);
    const entryLanguagePair = readLanguagePair(entry.languagePair);
    if (!bandId || !url) {
      return [];
    }
    if (entryLanguagePair && entryLanguagePair !== languagePair) {
      return [];
    }

    return [
      {
        bandId,
        url,
        assetVersion: readString(entry.assetVersion) ?? undefined,
        languagePair: entryLanguagePair ?? undefined
      }
    ];
  });

  if (packs.length !== input.packs.length) {
    return null;
  }

  return {
    schemaVersion,
    assetVersion,
    languagePair,
    packs
  };
}

export function validateAssetPack(
  input: unknown,
  expected: {
    bandId?: string;
    assetVersion?: string;
    languagePair?: LanguagePairId;
  } = {}
): AssetPack | null {
  if (!isRecord(input)) {
    return null;
  }

  const schemaVersion = readString(input.schemaVersion);
  const assetVersion = readString(input.assetVersion);
  const bandId = readString(input.bandId);
  const languagePair = readLanguagePair(input.languagePair);
  if (!schemaVersion || !assetVersion || !bandId || !languagePair) {
    return null;
  }

  if (
    (expected.bandId && expected.bandId !== bandId) ||
    (expected.assetVersion && expected.assetVersion !== assetVersion) ||
    (expected.languagePair && expected.languagePair !== languagePair)
  ) {
    return null;
  }

  const renderUnits = parseRenderUnitAsset({
    schemaVersion,
    assetVersion,
    languagePair,
    entries: input.renderUnits
  });
  if (!renderUnits || renderUnits.entries.length === 0) {
    return null;
  }

  if (renderUnits.entries.some((entry) => entry.minBand !== bandId)) {
    return null;
  }

  const rawLexemes = Array.isArray(input.lexemes) ? input.lexemes : null;
  if (!rawLexemes) {
    return null;
  }

  const parsedLexemes =
    rawLexemes.length === 0
      ? {
          entries: [] as LexemeEntry[],
          languagePair,
          assetVersion,
          schemaVersion
        }
      : parseLexemeAsset({
          schemaVersion,
          assetVersion,
          languagePair,
          entries: rawLexemes
        });
  if (!parsedLexemes) {
    return null;
  }

  const lexemeIds = new Set(parsedLexemes.entries.map((entry) => entry.lexemeId));
  const unresolvedLexemeIds = renderUnits.entries.flatMap((entry) =>
    entry.lexemeIds.filter((lexemeId) => !lexemeIds.has(lexemeId))
  );
  if (unresolvedLexemeIds.length > 0) {
    return null;
  }

  return {
    schemaVersion,
    assetVersion,
    languagePair,
    bandId,
    renderUnits: renderUnits.entries,
    lexemes: parsedLexemes.entries,
    generatedAt: readString(input.generatedAt) ?? undefined
  };
}

export function buildManifestUrl(
  baseUrl: string,
  languagePair: LanguagePairId = DEFAULT_LANGUAGE_PAIR_ID
): string {
  return `${baseUrl.replace(/\/+$/, "")}/${languagePair}/manifest.json`;
}

export function resolvePackUrl(url: string, manifestUrl: string): string {
  return new URL(url, manifestUrl).toString();
}

export function buildAssetPackIdentity(pack: Pick<
  AssetPack,
  "languagePair" | "assetVersion" | "bandId"
>): string {
  return `${pack.languagePair}:${pack.assetVersion}:${pack.bandId}`;
}

function buildBandWindowKey(
  languagePair: LanguagePairId,
  bandIds: readonly string[]
): string {
  return `${languagePair}\u0000${bandIds.join("\u0000")}`;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Asset pack request failed: ${response.status}`);
  }

  return response.json();
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T | null> {
  if (timeoutMs <= 0) {
    return Promise.resolve(null);
  }

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return new Promise((resolve) => {
    timeoutId = setTimeout(() => {
      resolve(null);
    }, timeoutMs);

    promise
      .then((value) => {
        resolve(value);
      })
      .catch(() => {
        resolve(null);
      })
      .finally(() => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      });
  });
}

function createActiveAssetContext(input: {
  languagePair: LanguagePairId;
  packs: readonly AssetPack[];
  source: AssetContextLoadSource;
  bandIds: readonly string[];
  missingBandIds?: readonly string[];
  assetVersion?: string | null;
}): ActiveAssetContext {
  const renderUnits = input.packs.flatMap((pack) => pack.renderUnits);
  const loadedBandIds = new Set(input.packs.map((pack) => pack.bandId));
  const assetVersions = [
    ...new Set(input.packs.map((pack) => pack.assetVersion).filter(Boolean))
  ];
  return {
    languagePair: input.languagePair,
    renderUnits,
    sentenceHintPhrases: getRenderUnitSentenceHints(renderUnits),
    source: input.source,
    assetVersion:
      input.assetVersion ??
      (assetVersions.length === 1 ? assetVersions[0] ?? null : null),
    bandIds: [...input.bandIds],
    missingBandIds:
      input.missingBandIds?.length
        ? [...input.missingBandIds]
        : input.bandIds.filter((bandId) => !loadedBandIds.has(bandId))
  };
}

async function readLatestPackMetadataForBands(
  store: IDBObjectStore,
  languagePair: LanguagePairId,
  bandIds: readonly string[]
): Promise<StoredAssetPackMetadata[]> {
  const latestByBandId = new Map<string, StoredAssetPackMetadata>();

  for (const bandId of bandIds) {
    const candidates = (await requestToPromise(
      store.index("bandId").getAll(IDBKeyRange.only(bandId))
    ))
      .map((entry) => normalizeStoredAssetPackMetadata(entry))
      .filter((entry): entry is StoredAssetPackMetadata => Boolean(entry))
      .filter((entry) => entry.languagePair === languagePair);

    for (const candidate of candidates) {
      const existing = latestByBandId.get(candidate.bandId);
      if (!existing || compareStoredPackMetadata(candidate, existing) > 0) {
        latestByBandId.set(candidate.bandId, candidate);
      }
    }
  }

  return bandIds.flatMap((bandId): StoredAssetPackMetadata[] => {
    const pack = latestByBandId.get(bandId);
    return pack ? [pack] : [];
  });
}

async function readStoredPacksForMetadata(
  metadata: readonly StoredAssetPackMetadata[]
): Promise<StoredAssetPack[]> {
  if (metadata.length === 0) {
    return [];
  }

  const transaction = await getIndexedDbTransaction(
    [INDEXEDDB_STORES.assetPackRenderUnits, INDEXEDDB_STORES.assetPackLexemes],
    "readonly"
  );
  const done = transactionDone(transaction);
  const renderUnitStore = transaction.objectStore(
    INDEXEDDB_STORES.assetPackRenderUnits
  );
  const lexemeStore = transaction.objectStore(INDEXEDDB_STORES.assetPackLexemes);
  const packs = await Promise.all(
    metadata.map((entry) =>
      readStoredPackForMetadata(entry, renderUnitStore, lexemeStore)
    )
  );
  await done;

  return packs.filter((pack): pack is StoredAssetPack => Boolean(pack));
}

async function readStoredPackForMetadata(
  metadata: StoredAssetPackMetadata,
  renderUnitStore: IDBObjectStore,
  lexemeStore: IDBObjectStore
): Promise<StoredAssetPack | null> {
  const [rawRenderUnitRows, rawLexemeRows] = await Promise.all([
    requestToPromise(
      renderUnitStore
        .index("packIdentity")
        .getAll(IDBKeyRange.only(metadata.identity))
    ),
    requestToPromise(
      lexemeStore.index("packIdentity").getAll(IDBKeyRange.only(metadata.identity))
    )
  ]);
  const renderUnitRows = rawRenderUnitRows
    .map((row) => normalizeStoredRenderUnitRow(row, metadata.identity))
    .filter((row): row is StoredAssetRenderUnitRow => Boolean(row))
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const lexemeRows = rawLexemeRows
    .map((row) => normalizeStoredLexemeRow(row, metadata.identity))
    .filter((row): row is StoredAssetLexemeRow => Boolean(row))
    .sort((left, right) => left.sortOrder - right.sortOrder);

  if (
    renderUnitRows.length === metadata.renderUnitCount &&
    lexemeRows.length === metadata.lexemeCount &&
    renderUnitRows.length > 0
  ) {
    return {
      schemaVersion: metadata.schemaVersion,
      assetVersion: metadata.assetVersion,
      languagePair: metadata.languagePair,
      bandId: metadata.bandId,
      generatedAt: metadata.generatedAt,
      renderUnits: renderUnitRows.map((row) => row.entry),
      lexemes: lexemeRows.map((row) => row.entry),
      identity: metadata.identity,
      cachedAt: metadata.cachedAt,
      sourceUrl: metadata.sourceUrl
    };
  }

  return null;
}

function normalizeStoredAssetPackMetadata(
  input: unknown
): StoredAssetPackMetadata | null {
  if (!isRecord(input)) {
    return null;
  }

  const identity = readString(input.identity);
  const cachedAt = readString(input.cachedAt);
  const schemaVersion = readString(input.schemaVersion);
  const assetVersion = readString(input.assetVersion);
  const bandId = readString(input.bandId);
  const languagePair = readLanguagePair(input.languagePair);
  if (
    !identity ||
    !cachedAt ||
    !schemaVersion ||
    !assetVersion ||
    !bandId ||
    !languagePair
  ) {
    return null;
  }

  const renderUnitCount = readNonNegativeInteger(input.renderUnitCount);
  const lexemeCount = readNonNegativeInteger(input.lexemeCount);
  if (renderUnitCount === null || lexemeCount === null) {
    return null;
  }

  return {
    schemaVersion,
    assetVersion,
    languagePair,
    bandId,
    generatedAt: readString(input.generatedAt) ?? undefined,
    identity,
    cachedAt,
    sourceUrl: readString(input.sourceUrl) ?? undefined,
    renderUnitCount,
    lexemeCount
  };
}

function normalizeStoredRenderUnitRow(
  input: unknown,
  packIdentity: string
): StoredAssetRenderUnitRow | null {
  if (!isRecord(input) || input.packIdentity !== packIdentity || !isRecord(input.entry)) {
    return null;
  }

  const identity = readString(input.identity);
  const languagePair = readLanguagePair(input.languagePair);
  const assetVersion = readString(input.assetVersion);
  const bandId = readString(input.bandId);
  const renderUnitId = readString(input.renderUnitId);
  const cachedAt = readString(input.cachedAt);
  const sortOrder = readNonNegativeInteger(input.sortOrder);
  if (
    !identity ||
    !languagePair ||
    !assetVersion ||
    !bandId ||
    !renderUnitId ||
    !cachedAt ||
    sortOrder === null
  ) {
    return null;
  }

  return {
    identity,
    packIdentity,
    languagePair,
    assetVersion,
    bandId,
    renderUnitId,
    sortOrder,
    cachedAt,
    entry: input.entry as RenderUnitEntry
  };
}

function normalizeStoredLexemeRow(
  input: unknown,
  packIdentity: string
): StoredAssetLexemeRow | null {
  if (!isRecord(input) || input.packIdentity !== packIdentity || !isRecord(input.entry)) {
    return null;
  }

  const identity = readString(input.identity);
  const languagePair = readLanguagePair(input.languagePair);
  const assetVersion = readString(input.assetVersion);
  const bandId = readString(input.bandId);
  const lexemeId = readString(input.lexemeId);
  const cachedAt = readString(input.cachedAt);
  const sortOrder = readNonNegativeInteger(input.sortOrder);
  if (
    !identity ||
    !languagePair ||
    !assetVersion ||
    !bandId ||
    !lexemeId ||
    !cachedAt ||
    sortOrder === null
  ) {
    return null;
  }

  return {
    identity,
    packIdentity,
    languagePair,
    assetVersion,
    bandId,
    lexemeId,
    sortOrder,
    cachedAt,
    entry: input.entry as LexemeEntry
  };
}

function compareStoredPackMetadata(
  left: StoredAssetPackMetadata,
  right: StoredAssetPackMetadata
): number {
  const cachedAtComparison = left.cachedAt.localeCompare(right.cachedAt);
  if (cachedAtComparison !== 0) {
    return cachedAtComparison;
  }

  return left.assetVersion.localeCompare(right.assetVersion);
}

function buildAssetRowIdentity(
  packIdentity: string,
  rowKind: "render-unit" | "lexeme",
  entryId: string
): string {
  return `${packIdentity}:${rowKind}:${entryId}`;
}

function readNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function readLanguagePair(value: unknown): LanguagePairId | null {
  return isLanguagePairId(value) ? value : null;
}

function deleteStoredRowsForPack(
  store: IDBObjectStore,
  packIdentity: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = store
      .index("packIdentity")
      .openCursor(IDBKeyRange.only(packIdentity));
    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB asset row cleanup failed."));
    };
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }

      cursor.delete();
      cursor.continue();
    };
  });
}

function readConfiguredAssetBaseUrl(): string | null {
  const configured = normalizeBaseUrl(
    import.meta.env.VITE_IMMERSIONKIT_ASSET_BASE_URL
  );
  if (configured) {
    return configured;
  }

  return import.meta.env.DEV && import.meta.env.MODE !== "test"
    ? LOCAL_DEV_ASSET_BASE_URL
    : null;
}

function normalizeBaseUrl(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().replace(/\/+$/, "")
    : null;
}
