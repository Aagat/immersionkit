import {
  DEFAULT_LANGUAGE_PAIR_ID,
  DEFAULT_EXTENSION_SETTINGS,
  isLanguagePairId,
  isTtsVoiceId,
  type LanguagePairId,
  type TtsVoiceId
} from "@immersionkit/shared";

import {
  getIndexedDbStore,
  INDEXEDDB_STORES,
  isIndexedDbAvailable,
  requestToPromise
} from "../storage/indexeddb";
import { isRecord, readString } from "../storage/serialization";

export type PiperTtsVoiceLanguage = "es-ES" | "es-AR" | "es-MX";
export type PiperTtsAssetId =
  | "es_ES-davefx-medium"
  | "es_ES-carlfm-x_low"
  | "es_AR-daniela-high"
  | "es_MX-claude-high"
  | "es_ES-sharvard-medium";

export type PiperTtsVoiceInfo = {
  voiceId: TtsVoiceId;
  assetId: PiperTtsAssetId;
  language: PiperTtsVoiceLanguage;
  label: string;
  modelFileName: string;
  configFileName: string;
  speakerId?: number;
};

export const PIPER_TTS_DEFAULT_VOICE_ID = DEFAULT_EXTENSION_SETTINGS.ttsVoiceId;
export const PIPER_TTS_VOICE_ID = PIPER_TTS_DEFAULT_VOICE_ID;
export const PIPER_TTS_LANGUAGE = "es-ES";
export const PIPER_TTS_VOICES: readonly PiperTtsVoiceInfo[] = [
  {
    voiceId: "es_ES-davefx-medium",
    assetId: "es_ES-davefx-medium",
    language: "es-ES",
    label: "DaveFX (Spain, medium)",
    modelFileName: "es_ES-davefx-medium.onnx",
    configFileName: "es_ES-davefx-medium.onnx.json"
  },
  {
    voiceId: "es_ES-carlfm-x_low",
    assetId: "es_ES-carlfm-x_low",
    language: "es-ES",
    label: "CarlFM (Spain, x-low)",
    modelFileName: "es_ES-carlfm-x_low.onnx",
    configFileName: "es_ES-carlfm-x_low.onnx.json"
  },
  {
    voiceId: "es_AR-daniela-high",
    assetId: "es_AR-daniela-high",
    language: "es-AR",
    label: "Daniela (Argentina, high)",
    modelFileName: "es_AR-daniela-high.onnx",
    configFileName: "es_AR-daniela-high.onnx.json"
  },
  {
    voiceId: "es_MX-claude-high",
    assetId: "es_MX-claude-high",
    language: "es-MX",
    label: "Claude (Mexico, high)",
    modelFileName: "es_MX-claude-high.onnx",
    configFileName: "es_MX-claude-high.onnx.json"
  },
  {
    voiceId: "es_ES-sharvard-medium-m",
    assetId: "es_ES-sharvard-medium",
    language: "es-ES",
    label: "Sharvard M (Spain, medium)",
    modelFileName: "es_ES-sharvard-medium.onnx",
    configFileName: "es_ES-sharvard-medium.onnx.json",
    speakerId: 0
  },
  {
    voiceId: "es_ES-sharvard-medium-f",
    assetId: "es_ES-sharvard-medium",
    language: "es-ES",
    label: "Sharvard F (Spain, medium)",
    modelFileName: "es_ES-sharvard-medium.onnx",
    configFileName: "es_ES-sharvard-medium.onnx.json",
    speakerId: 1
  }
];
export const LOCAL_DEV_ASSET_BASE_URL = "http://127.0.0.1:8787/assets";

export type PiperTtsVoiceManifest = {
  schemaVersion: string;
  assetVersion: string;
  languagePair: LanguagePairId;
  engine: "piper";
  voiceId: PiperTtsAssetId;
  language: PiperTtsVoiceLanguage;
  voiceName?: string;
  sampleRate: number;
  speakerCount?: number;
  speakerIdMap?: Record<string, number>;
  modelUrl: string;
  configUrl: string;
  modelBytes: number;
  configBytes: number;
  modelSha256: string;
  configSha256: string;
  source?: string;
};

export type PiperVoiceConfig = {
  audio?: {
    sample_rate?: number;
    quality?: string;
  };
  espeak?: {
    voice?: string;
  };
  inference?: {
    noise_scale?: number;
    length_scale?: number;
    noise_w?: number;
  };
  num_speakers?: number;
  speaker_id_map?: Record<string, number>;
  phoneme_id_map?: Record<string, readonly number[]>;
};

export type PiperVoiceAsset = {
  manifest: PiperTtsVoiceManifest;
  manifestUrl: string;
  modelUrl: string;
  configUrl: string;
  modelBuffer: ArrayBuffer;
  configText: string;
  config: PiperVoiceConfig;
  cachedAt?: string;
};

export type StoredTtsVoiceAsset = {
  voiceId: PiperTtsAssetId;
  languagePair: LanguagePairId;
  assetVersion: string;
  engine: "piper";
  language: PiperTtsVoiceLanguage;
  sampleRate: number;
  modelBytes: number;
  configBytes: number;
  modelSha256: string;
  configSha256: string;
  modelBuffer: ArrayBuffer;
  configText: string;
  sourceManifestUrl: string;
  sourceModelUrl: string;
  sourceConfigUrl: string;
  cachedAt: string;
};

export interface TtsVoiceAssetRepository {
  get(voiceId: string): Promise<StoredTtsVoiceAsset | null>;
  put(asset: StoredTtsVoiceAsset): Promise<boolean>;
}

type FetchJson = (url: string) => Promise<unknown>;
type FetchArrayBuffer = (url: string) => Promise<ArrayBuffer>;
type ComputeSha256 = (buffer: ArrayBuffer) => Promise<string>;

export type PiperVoiceAssetClientOptions = {
  assetBaseUrl?: string | null;
  fetchJson?: FetchJson;
  fetchArrayBuffer?: FetchArrayBuffer;
  repository?: TtsVoiceAssetRepository;
  computeSha256?: ComputeSha256;
  now?: () => Date;
};

let singletonClient: PiperVoiceAssetClient | null = null;

export function getPiperVoiceAssetClient(): PiperVoiceAssetClient {
  singletonClient ??= new PiperVoiceAssetClient();
  return singletonClient;
}

export async function ensurePiperVoiceAsset(
  options: PiperVoiceAssetClientOptions & { voiceId?: TtsVoiceId } = {}
): Promise<PiperVoiceAsset> {
  return new PiperVoiceAssetClient(options).ensureVoice(options.voiceId);
}

export class PiperVoiceAssetClient {
  private readonly assetBaseUrl: string | null;
  private readonly fetchJson: FetchJson;
  private readonly fetchArrayBuffer: FetchArrayBuffer;
  private readonly repository: TtsVoiceAssetRepository;
  private readonly computeSha256: ComputeSha256;
  private readonly now: () => Date;

  constructor(options: PiperVoiceAssetClientOptions = {}) {
    this.assetBaseUrl =
      options.assetBaseUrl === undefined
        ? readConfiguredAssetBaseUrl()
        : normalizeAssetBaseUrl(options.assetBaseUrl);
    this.fetchJson = options.fetchJson ?? fetchJson;
    this.fetchArrayBuffer = options.fetchArrayBuffer ?? fetchArrayBuffer;
    this.repository = options.repository ?? new IndexedDbTtsVoiceAssetRepository();
    this.computeSha256 = options.computeSha256 ?? computeSha256;
    this.now = options.now ?? (() => new Date());
  }

  async ensureVoice(
    voiceId: TtsVoiceId = PIPER_TTS_DEFAULT_VOICE_ID
  ): Promise<PiperVoiceAsset> {
    const voiceInfo = getPiperTtsVoiceInfo(voiceId);
    const cached = await this.repository.get(voiceInfo.assetId);
    if (cached) {
      const asset = createVoiceAssetFromStored(cached);
      if (asset) {
        return asset;
      }
    }

    if (!this.assetBaseUrl) {
      throw new Error("tts-asset-base-url-unavailable");
    }

    const manifestUrl = buildPiperVoiceManifestUrl(
      this.assetBaseUrl,
      voiceInfo.voiceId
    );
    const manifest = validatePiperTtsManifest(
      await this.fetchJson(manifestUrl),
      voiceInfo.voiceId
    );
    if (!manifest) {
      throw new Error("invalid-tts-manifest");
    }

    const modelUrl = resolveFirstPartyAssetUrl(manifest.modelUrl, manifestUrl);
    const configUrl = resolveFirstPartyAssetUrl(manifest.configUrl, manifestUrl);
    const [modelBuffer, configBuffer] = await Promise.all([
      this.fetchArrayBuffer(modelUrl),
      this.fetchArrayBuffer(configUrl)
    ]);
    await validateAssetBytes(modelBuffer, {
      expectedBytes: manifest.modelBytes,
      expectedSha256: manifest.modelSha256,
      computeSha256: this.computeSha256,
      label: "piper-model"
    });
    await validateAssetBytes(configBuffer, {
      expectedBytes: manifest.configBytes,
      expectedSha256: manifest.configSha256,
      computeSha256: this.computeSha256,
      label: "piper-config"
    });

    const configText = new TextDecoder().decode(configBuffer);
    const config = validatePiperVoiceConfig(JSON.parse(configText));
    if (!config) {
      throw new Error("invalid-tts-config");
    }

    const cachedAt = this.now().toISOString();
    await this.repository.put({
      voiceId: manifest.voiceId,
      languagePair: manifest.languagePair,
      assetVersion: manifest.assetVersion,
      engine: manifest.engine,
      language: manifest.language,
      sampleRate: manifest.sampleRate,
      modelBytes: manifest.modelBytes,
      configBytes: manifest.configBytes,
      modelSha256: manifest.modelSha256,
      configSha256: manifest.configSha256,
      modelBuffer,
      configText,
      sourceManifestUrl: manifestUrl,
      sourceModelUrl: modelUrl,
      sourceConfigUrl: configUrl,
      cachedAt
    });

    return {
      manifest,
      manifestUrl,
      modelUrl,
      configUrl,
      modelBuffer,
      configText,
      config,
      cachedAt
    };
  }
}

export class IndexedDbTtsVoiceAssetRepository
  implements TtsVoiceAssetRepository
{
  async get(voiceId: string): Promise<StoredTtsVoiceAsset | null> {
    if (!isIndexedDbAvailable()) {
      return null;
    }

    try {
      const store = await getIndexedDbStore(INDEXEDDB_STORES.ttsVoices, "readonly");
      return normalizeStoredTtsVoiceAsset(await requestToPromise(store.get(voiceId)));
    } catch (error) {
      console.warn("ImmersionKit IndexedDB TTS voice read failed.", error);
      return null;
    }
  }

  async put(asset: StoredTtsVoiceAsset): Promise<boolean> {
    if (!isIndexedDbAvailable()) {
      return false;
    }

    try {
      const store = await getIndexedDbStore(INDEXEDDB_STORES.ttsVoices, "readwrite");
      await requestToPromise(store.put(asset));
      return true;
    } catch (error) {
      console.warn("ImmersionKit IndexedDB TTS voice write failed.", error);
      return false;
    }
  }
}

export function buildPiperVoiceManifestUrl(
  assetBaseUrl: string,
  voiceId: TtsVoiceId = PIPER_TTS_DEFAULT_VOICE_ID,
  languagePair: LanguagePairId = DEFAULT_LANGUAGE_PAIR_ID
): string {
  const assetId = getPiperTtsVoiceInfo(voiceId).assetId;
  return `${assetBaseUrl.replace(/\/+$/, "")}/tts/${languagePair}/piper/${assetId}/manifest.json`;
}

export function resolvePiperVoiceAssetUrls(input: {
  assetBaseUrl: string;
  voiceId?: TtsVoiceId;
  languagePair?: LanguagePairId;
  modelUrl?: string;
  configUrl?: string;
}): {
  manifestUrl: string;
  modelUrl: string;
  configUrl: string;
} {
  const voiceInfo = getPiperTtsVoiceInfo(input.voiceId);
  const manifestUrl = buildPiperVoiceManifestUrl(
    input.assetBaseUrl,
    voiceInfo.voiceId,
    input.languagePair
  );
  return {
    manifestUrl,
    modelUrl: resolveFirstPartyAssetUrl(
      input.modelUrl ?? voiceInfo.modelFileName,
      manifestUrl
    ),
    configUrl: resolveFirstPartyAssetUrl(
      input.configUrl ?? voiceInfo.configFileName,
      manifestUrl
    )
  };
}

export function getPiperTtsVoiceInfo(
  voiceId: TtsVoiceId = PIPER_TTS_DEFAULT_VOICE_ID
): PiperTtsVoiceInfo {
  return (
    PIPER_TTS_VOICES.find((voice) => voice.voiceId === voiceId) ??
    PIPER_TTS_VOICES[0]!
  );
}

export function getPiperTtsVoiceInfoForAsset(
  assetId: PiperTtsAssetId
): PiperTtsVoiceInfo {
  return (
    PIPER_TTS_VOICES.find((voice) => voice.assetId === assetId) ??
    PIPER_TTS_VOICES[0]!
  );
}

export function normalizeAssetBaseUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().replace(/\/+$/, "");
  return normalized.length > 0 ? normalized : null;
}

export function validatePiperTtsManifest(
  input: unknown,
  expectedVoiceId?: TtsVoiceId
): PiperTtsVoiceManifest | null {
  if (!isRecord(input)) {
    return null;
  }

  const schemaVersion = readString(input.schemaVersion);
  const assetVersion = readString(input.assetVersion);
  const languagePair = isLanguagePairId(input.languagePair)
    ? input.languagePair
    : null;
  const engine = readString(input.engine);
  const voiceId = readString(input.voiceId);
  const language = readString(input.language);
  const assetInfo = isPiperTtsAssetId(voiceId)
    ? getPiperTtsVoiceInfoForAsset(voiceId)
    : null;
  const expectedAssetId =
    expectedVoiceId === undefined
      ? undefined
      : getPiperTtsVoiceInfo(expectedVoiceId).assetId;
  const sampleRate = readPositiveInteger(input.sampleRate);
  const speakerCount = readPositiveInteger(input.speakerCount);
  const speakerIdMap = readNumberMap(input.speakerIdMap);
  const modelUrl = readString(input.modelUrl);
  const configUrl = readString(input.configUrl);
  const modelBytes = readPositiveInteger(input.modelBytes);
  const configBytes = readPositiveInteger(input.configBytes);
  const modelSha256 = readSha256(input.modelSha256);
  const configSha256 = readSha256(input.configSha256);

  if (
    !schemaVersion ||
    !assetVersion ||
    !languagePair ||
    engine !== "piper" ||
    !assetInfo ||
    (expectedAssetId !== undefined && assetInfo.assetId !== expectedAssetId) ||
    language !== assetInfo.language ||
    sampleRate === null ||
    !modelUrl ||
    !configUrl ||
    modelBytes === null ||
    configBytes === null ||
    !modelSha256 ||
    !configSha256
  ) {
    return null;
  }

  return {
    schemaVersion,
    assetVersion,
    languagePair,
    engine,
    voiceId: assetInfo.assetId,
    language: assetInfo.language,
    voiceName: readString(input.voiceName) ?? undefined,
    sampleRate,
    speakerCount: speakerCount ?? undefined,
    speakerIdMap: speakerIdMap ?? undefined,
    modelUrl,
    configUrl,
    modelBytes,
    configBytes,
    modelSha256,
    configSha256,
    source: readString(input.source) ?? undefined
  };
}

function readConfiguredAssetBaseUrl(): string | null {
  const configuredBaseUrl = import.meta.env?.VITE_IMMERSIONKIT_ASSET_BASE_URL;
  if (typeof configuredBaseUrl === "string") {
    return normalizeAssetBaseUrl(configuredBaseUrl);
  }

  return normalizeAssetBaseUrl(LOCAL_DEV_ASSET_BASE_URL);
}

function createVoiceAssetFromStored(
  stored: StoredTtsVoiceAsset
): PiperVoiceAsset | null {
  let parsedConfig: unknown;
  try {
    parsedConfig = JSON.parse(stored.configText);
  } catch {
    return null;
  }

  const config = validatePiperVoiceConfig(parsedConfig);
  if (!config) {
    return null;
  }

  return {
    manifest: {
      schemaVersion: "1.0.0",
      assetVersion: stored.assetVersion,
      languagePair: stored.languagePair,
      engine: stored.engine,
      voiceId: stored.voiceId,
      language: stored.language,
      sampleRate: stored.sampleRate,
      speakerCount: readPositiveInteger(config.num_speakers) ?? undefined,
      speakerIdMap: readNumberMap(config.speaker_id_map) ?? undefined,
      modelUrl: stored.sourceModelUrl,
      configUrl: stored.sourceConfigUrl,
      modelBytes: stored.modelBytes,
      configBytes: stored.configBytes,
      modelSha256: stored.modelSha256,
      configSha256: stored.configSha256
    },
    manifestUrl: stored.sourceManifestUrl,
    modelUrl: stored.sourceModelUrl,
    configUrl: stored.sourceConfigUrl,
    modelBuffer: stored.modelBuffer,
    configText: stored.configText,
    config,
    cachedAt: stored.cachedAt
  };
}

function validatePiperVoiceConfig(input: unknown): PiperVoiceConfig | null {
  if (!isRecord(input) || !isRecord(input.phoneme_id_map)) {
    return null;
  }

  const audio = isRecord(input.audio) ? input.audio : null;
  const sampleRate = audio ? readPositiveInteger(audio.sample_rate) : null;
  if (sampleRate === null) {
    return null;
  }

  return input as PiperVoiceConfig;
}

async function validateAssetBytes(
  buffer: ArrayBuffer,
  options: {
    expectedBytes: number;
    expectedSha256: string;
    computeSha256: ComputeSha256;
    label: string;
  }
): Promise<void> {
  if (buffer.byteLength !== options.expectedBytes) {
    throw new Error(`${options.label}-size-mismatch`);
  }

  const actualSha256 = await options.computeSha256(buffer);
  if (actualSha256 !== options.expectedSha256) {
    throw new Error(`${options.label}-checksum-mismatch`);
  }
}

function resolveFirstPartyAssetUrl(url: string, manifestUrl: string): string {
  const resolved = new URL(url, manifestUrl);
  const manifest = new URL(manifestUrl);
  if (resolved.origin !== manifest.origin) {
    throw new Error("tts-asset-url-origin-mismatch");
  }

  const manifestDirectory = new URL("./", manifestUrl);
  if (!resolved.pathname.startsWith(manifestDirectory.pathname)) {
    throw new Error("tts-asset-url-path-mismatch");
  }

  return resolved.toString();
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`TTS manifest request failed: ${response.status}`);
  }

  return response.json();
}

async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`TTS asset request failed: ${response.status}`);
  }

  return response.arrayBuffer();
}

async function computeSha256(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeStoredTtsVoiceAsset(input: unknown): StoredTtsVoiceAsset | null {
  if (!isRecord(input)) {
    return null;
  }

  const voiceId = readString(input.voiceId);
  const assetInfo = isPiperTtsAssetId(voiceId)
    ? getPiperTtsVoiceInfoForAsset(voiceId)
    : null;
  const languagePair = isLanguagePairId(input.languagePair)
    ? input.languagePair
    : null;
  const assetVersion = readString(input.assetVersion);
  const engine = readString(input.engine);
  const language = readString(input.language);
  const sampleRate = readPositiveInteger(input.sampleRate);
  const modelBytes = readPositiveInteger(input.modelBytes);
  const configBytes = readPositiveInteger(input.configBytes);
  const modelSha256 = readSha256(input.modelSha256);
  const configSha256 = readSha256(input.configSha256);
  const configText = readString(input.configText);
  const sourceManifestUrl = readString(input.sourceManifestUrl);
  const sourceModelUrl = readString(input.sourceModelUrl);
  const sourceConfigUrl = readString(input.sourceConfigUrl);
  const cachedAt = readString(input.cachedAt);
  if (
    !assetInfo ||
    !languagePair ||
    !assetVersion ||
    engine !== "piper" ||
    language !== assetInfo.language ||
    sampleRate === null ||
    modelBytes === null ||
    configBytes === null ||
    !modelSha256 ||
    !configSha256 ||
    !(input.modelBuffer instanceof ArrayBuffer) ||
    !configText ||
    !sourceManifestUrl ||
    !sourceModelUrl ||
    !sourceConfigUrl ||
    !cachedAt
  ) {
    return null;
  }

  return {
    voiceId: assetInfo.assetId,
    languagePair,
    assetVersion,
    engine,
    language: assetInfo.language,
    sampleRate,
    modelBytes,
    configBytes,
    modelSha256,
    configSha256,
    modelBuffer: input.modelBuffer,
    configText,
    sourceManifestUrl,
    sourceModelUrl,
    sourceConfigUrl,
    cachedAt
  };
}

function readPositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function readNumberMap(value: unknown): Record<string, number> | null {
  if (!isRecord(value)) {
    return null;
  }

  const map: Record<string, number> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "number" || !Number.isInteger(entry)) {
      return null;
    }
    map[key] = entry;
  }

  return map;
}

function isPiperTtsAssetId(value: unknown): value is PiperTtsAssetId {
  return PIPER_TTS_VOICES.some((voice) => voice.assetId === value);
}

function readSha256(value: unknown): string | null {
  const input = readString(value);
  return input && /^[a-f0-9]{64}$/.test(input) ? input : null;
}
