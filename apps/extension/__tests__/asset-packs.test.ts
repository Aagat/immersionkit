import {
  DEFAULT_CURRICULUM_CONFIG,
  resolveExtensionSettings,
  type CurriculumConfig,
  type LanguagePairId,
  type LexemeEntry,
  type RenderUnitEntry
} from "@immersionkit/shared";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startAssetPackServer } from "../../../tools/assets/asset-pack-server.mjs";

import {
  BackgroundAssetPackService,
  buildAssetPackIdentity,
  buildManifestUrl,
  resolveActiveAssetBandWindow,
  resolvePackUrl,
  validateAssetPack,
  validateAssetPackManifest,
  type AssetPack,
  type AssetPackRepository,
  type StoredAssetPack
} from "../src/background/asset-packs";
import {
  buildPiperVoiceManifestUrl,
  PiperVoiceAssetClient,
  resolvePiperVoiceAssetUrls,
  validatePiperTtsManifest,
  type TtsVoiceAssetRepository
} from "../src/background/tts-assets";
import type { BackgroundRuntimeConfig } from "../src/background/settings";

describe("background asset packs", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolves previous/current/next band windows and unions diverged word and phrase bands", () => {
    expect(resolveActiveAssetBandWindow(DEFAULT_CURRICULUM_CONFIG, {})).toEqual([
      "level-1a",
      "level-1b"
    ]);
    expect(
      resolveActiveAssetBandWindow(DEFAULT_CURRICULUM_CONFIG, {
        activeVocabularyBandId: "level-2a"
      })
    ).toEqual(["level-1c", "level-2a", "level-2b"]);
    expect(
      resolveActiveAssetBandWindow(DEFAULT_CURRICULUM_CONFIG, {
        activeVocabularyBandId: "level-5b"
      })
    ).toEqual(["level-5a", "level-5b"]);
    expect(
      resolveActiveAssetBandWindow(DEFAULT_CURRICULUM_CONFIG, {
        activeVocabularyBandId: "level-1a",
        activePhraseBandId: "level-2a"
      })
    ).toEqual(["level-1a", "level-1b", "level-1c", "level-2a", "level-2b"]);
  });

  it("validates endpoint schemas and resolves pack URLs relative to the manifest", () => {
    const manifest = validateAssetPackManifest({
      schemaVersion: "1.0.0",
      assetVersion: "asset-v1",
      languagePair: "en-es",
      packs: [{ bandId: "level-1a", url: "packs/asset-v1/level-1a.json" }]
    });
    expect(manifest?.packs[0]).toMatchObject({
      bandId: "level-1a",
      url: "packs/asset-v1/level-1a.json"
    });
    expect(
      resolvePackUrl(
        "packs/asset-v1/level-1a.json",
        "https://cdn.example/assets/en-es/manifest.json"
      )
    ).toBe("https://cdn.example/assets/en-es/packs/asset-v1/level-1a.json");
    expect(validateAssetPack(createPack("level-1a", "asset-v1"))?.bandId).toBe(
      "level-1a"
    );
    expect(
      validateAssetPackManifest(
        {
          schemaVersion: "1.0.0",
          assetVersion: "asset-v1",
          languagePair: "en-fr",
          packs: [
            {
              bandId: "level-1a",
              url: "packs/asset-v1/level-1a.json",
              languagePair: "en-es"
            }
          ]
        },
        "en-fr"
      )
    ).toBeNull();
    expect(
      validateAssetPack({
        ...createPack("level-1a", "asset-v1"),
        lexemes: []
      })
    ).toBeNull();
  });

  it("resolves first-party Piper TTS asset URLs from the configured asset base URL", async () => {
    const urls = resolvePiperVoiceAssetUrls({
      assetBaseUrl: "https://cdn.example/assets/"
    });
    expect(urls).toEqual({
      manifestUrl:
        "https://cdn.example/assets/tts/en-es/piper/es_ES-sharvard-medium/manifest.json",
      modelUrl:
        "https://cdn.example/assets/tts/en-es/piper/es_ES-sharvard-medium/es_ES-sharvard-medium.onnx",
      configUrl:
        "https://cdn.example/assets/tts/en-es/piper/es_ES-sharvard-medium/es_ES-sharvard-medium.onnx.json"
    });
    expect(buildPiperVoiceManifestUrl("https://cdn.example/assets/")).toBe(
      urls.manifestUrl
    );
    expect(
      resolvePiperVoiceAssetUrls({
        assetBaseUrl: "https://cdn.example/assets/",
        voiceId: "es_AR-daniela-high"
      })
    ).toEqual({
      manifestUrl:
        "https://cdn.example/assets/tts/en-es/piper/es_AR-daniela-high/manifest.json",
      modelUrl:
        "https://cdn.example/assets/tts/en-es/piper/es_AR-daniela-high/es_AR-daniela-high.onnx",
      configUrl:
        "https://cdn.example/assets/tts/en-es/piper/es_AR-daniela-high/es_AR-daniela-high.onnx.json"
    });
    expect(
      resolvePiperVoiceAssetUrls({
        assetBaseUrl: "https://cdn.example/assets/",
        voiceId: "es_ES-sharvard-medium-f"
      })
    ).toEqual({
      manifestUrl:
        "https://cdn.example/assets/tts/en-es/piper/es_ES-sharvard-medium/manifest.json",
      modelUrl:
        "https://cdn.example/assets/tts/en-es/piper/es_ES-sharvard-medium/es_ES-sharvard-medium.onnx",
      configUrl:
        "https://cdn.example/assets/tts/en-es/piper/es_ES-sharvard-medium/es_ES-sharvard-medium.onnx.json"
    });

    vi.stubEnv("VITE_IMMERSIONKIT_ASSET_BASE_URL", "https://env.example/assets/");
    const requestedUrls: string[] = [];
    const client = new PiperVoiceAssetClient({
      repository: new InMemoryTtsVoiceAssetRepository(),
      fetchJson: async (url) => {
        requestedUrls.push(url);
        throw new Error("stop-after-url-resolution");
      }
    });

    await expect(client.ensureVoice()).rejects.toThrow(
      "stop-after-url-resolution"
    );
    expect(requestedUrls).toEqual([
      "https://env.example/assets/tts/en-es/piper/es_ES-sharvard-medium/manifest.json"
    ]);

    requestedUrls.length = 0;
    await expect(client.ensureVoice("es_ES-carlfm-x_low")).rejects.toThrow(
      "stop-after-url-resolution"
    );
    expect(requestedUrls).toEqual([
      "https://env.example/assets/tts/en-es/piper/es_ES-carlfm-x_low/manifest.json"
    ]);

    requestedUrls.length = 0;
    await expect(client.ensureVoice("es_ES-sharvard-medium-m")).rejects.toThrow(
      "stop-after-url-resolution"
    );
    expect(requestedUrls).toEqual([
      "https://env.example/assets/tts/en-es/piper/es_ES-sharvard-medium/manifest.json"
    ]);
  });

  it("serves first-party Piper TTS assets with content types and checksum metadata", async () => {
    const assetServer = await startAssetPackServer({ port: 0 });
    try {
      const manifestResponse = await fetch(
        assetServer.ttsManifestUrls["es_ES-davefx-medium"]
      );
      expect(manifestResponse.status).toBe(200);
      expect(manifestResponse.headers.get("content-type")).toContain(
        "application/json"
      );
      const manifest = validatePiperTtsManifest(await manifestResponse.json());
      expect(manifest).toMatchObject({
        voiceId: "es_ES-davefx-medium",
        language: "es-ES",
        engine: "piper",
        modelBytes: 63201294,
        configBytes: 4817,
        modelSha256:
          "6658b03b1a6c316ee4c265a9896abc1393353c2d9e1bca7d66c2c442e222a917"
      });

      const modelResponse = await fetch(
        `${assetServer.baseUrl}/tts/en-es/piper/es_ES-davefx-medium/es_ES-davefx-medium.onnx`
      );
      expect(modelResponse.status).toBe(200);
      expect(modelResponse.headers.get("content-type")).toContain(
        "application/octet-stream"
      );
      expect((await modelResponse.arrayBuffer()).byteLength).toBe(63201294);

      const configResponse = await fetch(
        `${assetServer.baseUrl}/tts/en-es/piper/es_ES-davefx-medium/es_ES-davefx-medium.onnx.json`
      );
      expect(configResponse.status).toBe(200);
      expect(configResponse.headers.get("content-type")).toContain(
        "application/json"
      );
      expect(await configResponse.json()).toHaveProperty("phoneme_id_map");

      const carlfmManifestResponse = await fetch(
        assetServer.ttsManifestUrls["es_ES-carlfm-x_low"]
      );
      expect(carlfmManifestResponse.status).toBe(200);
      expect(
        validatePiperTtsManifest(await carlfmManifestResponse.json())
      ).toMatchObject({
        voiceId: "es_ES-carlfm-x_low",
        language: "es-ES",
        modelBytes: 28130791
      });

      const danielaManifestResponse = await fetch(
        assetServer.ttsManifestUrls["es_AR-daniela-high"]
      );
      expect(danielaManifestResponse.status).toBe(200);
      expect(
        validatePiperTtsManifest(await danielaManifestResponse.json())
      ).toMatchObject({
        voiceId: "es_AR-daniela-high",
        language: "es-AR",
        modelBytes: 114199011,
        modelSha256:
          "7ceb1fc0dab349418c5b54a639ae9ee595212d7c9ea422220d8419163d5cc985"
      });

      const claudeManifestResponse = await fetch(
        assetServer.ttsManifestUrls["es_MX-claude-high"]
      );
      expect(claudeManifestResponse.status).toBe(200);
      expect(
        validatePiperTtsManifest(await claudeManifestResponse.json())
      ).toMatchObject({
        voiceId: "es_MX-claude-high",
        language: "es-MX",
        modelBytes: 63122309,
        modelSha256:
          "3ef40a71ea63852cd8ab7e6fa7d2ecdcfa67a0b47c9c48e3f10e02ee02083ea0"
      });

      const sharvardManifestResponse = await fetch(
        assetServer.ttsManifestUrls["es_ES-sharvard-medium"]
      );
      expect(sharvardManifestResponse.status).toBe(200);
      expect(
        validatePiperTtsManifest(
          await sharvardManifestResponse.json(),
          "es_ES-sharvard-medium-f"
        )
      ).toMatchObject({
        voiceId: "es_ES-sharvard-medium",
        language: "es-ES",
        modelBytes: 76733615,
        speakerCount: 2,
        speakerIdMap: {
          M: 0,
          F: 1
        }
      });

      const missingResponse = await fetch(
        `${assetServer.baseUrl}/tts/en-es/piper/missing/manifest.json`
      );
      expect(missingResponse.status).toBe(404);
    } finally {
      await closeServer(assetServer.server);
    }
  });

  it("loads and filters remote packs by the active non-en-es language pair", async () => {
    const requestedUrls: string[] = [];
    const remotePack = createPack("level-1a", "asset-fr", "city", "ville", "en-fr");
    const repository = new InMemoryAssetPackRepository([
      createPack("level-1a", "asset-es", "city", "ciudad", "en-es")
    ]);
    const service = new BackgroundAssetPackService({
      assetBaseUrl: "https://cdn.example/assets",
      repository,
      loadRuntimeConfig: () =>
        Promise.resolve(
          createRuntimeConfig(DEFAULT_CURRICULUM_CONFIG, {
            languagePair: "en-fr",
            sourceLanguage: "en",
            targetLanguage: "fr"
          })
        ),
      fetchJson: async (url) => {
        requestedUrls.push(url);
        if (url.endsWith("/manifest.json")) {
          return {
            schemaVersion: "1.0.0",
            assetVersion: "asset-fr",
            languagePair: "en-fr",
            packs: [{ bandId: "level-1a", url: "packs/asset-fr/level-1a.json" }]
          };
        }

        return remotePack;
      }
    });

    const manifest = validateAssetPackManifest({
      schemaVersion: "1.0.0",
      assetVersion: "asset-fr",
      languagePair: "en-fr",
      packs: [{ bandId: "level-1a", url: "packs/asset-fr/level-1a.json" }]
    });
    const validatedPack = validateAssetPack(remotePack, {
      bandId: "level-1a",
      assetVersion: "asset-fr",
      languagePair: "en-fr"
    });
    const context = await service.loadActiveContext();

    expect(buildManifestUrl("https://cdn.example/assets", "en-fr")).toBe(
      "https://cdn.example/assets/en-fr/manifest.json"
    );
    expect(requestedUrls[0]).toBe("https://cdn.example/assets/en-fr/manifest.json");
    expect(manifest?.languagePair).toBe("en-fr");
    expect(validatedPack?.languagePair).toBe("en-fr");
    expect(validatedPack?.renderUnits[0]).toMatchObject({
      sourceLanguage: "en",
      targetLanguage: "fr"
    });
    expect(context.languagePair).toBe("en-fr");
    expect(context.renderUnits[0]).toMatchObject({
      sourceText: "city",
      targetText: "ville",
      targetLanguage: "fr"
    });
    expect(repository.packs.map((pack) => pack.languagePair).sort()).toEqual([
      "en-fr"
    ]);
  });

  it("rejects remote manifests that point a requested pair at another pair", async () => {
    const requestedUrls: string[] = [];
    const repository = new InMemoryAssetPackRepository();
    const service = new BackgroundAssetPackService({
      assetBaseUrl: "https://cdn.example/assets",
      repository,
      loadRuntimeConfig: () =>
        Promise.resolve(
          createRuntimeConfig(DEFAULT_CURRICULUM_CONFIG, {
            languagePair: "en-fr",
            sourceLanguage: "en",
            targetLanguage: "fr"
          })
        ),
      fetchJson: async (url) => {
        requestedUrls.push(url);
        if (url.endsWith("/manifest.json")) {
          return {
            schemaVersion: "1.0.0",
            assetVersion: "asset-fr",
            languagePair: "en-fr",
            packs: [
              {
                bandId: "level-1a",
                url: "packs/asset-es/level-1a.json",
                languagePair: "en-es"
              }
            ]
          };
        }

        return createPack("level-1a", "asset-es", "city", "ciudad", "en-es");
      }
    });

    const context = await service.loadActiveContext();

    expect(context.languagePair).toBe("en-fr");
    expect(context.source).toBe("empty");
    expect(context.renderUnits).toEqual([]);
    expect(repository.packs).toEqual([]);
    expect(requestedUrls).toEqual([
      "https://cdn.example/assets/en-fr/manifest.json"
    ]);
  });

  it("falls back to stale cached packs when a remote replacement pack is invalid", async () => {
    const cachedPack = createPack("level-1a", "asset-old", "city", "ciudad");
    const repository = new InMemoryAssetPackRepository([cachedPack]);
    const service = new BackgroundAssetPackService({
      assetBaseUrl: "https://cdn.example/assets",
      repository,
      loadRuntimeConfig: () => Promise.resolve(createRuntimeConfig()),
      fetchJson: async (url) => {
        if (url.endsWith("/manifest.json")) {
          return {
            schemaVersion: "1.0.0",
            assetVersion: "asset-new",
            languagePair: "en-es",
            packs: [{ bandId: "level-1a", url: "packs/asset-new/level-1a.json" }]
          };
        }

        return {
          ...createPack("level-1a", "asset-new", "garden", "jardin"),
          lexemes: []
        };
      }
    });

    const context = await service.loadActiveContext();

    expect(context.source).toBe("cached-pack");
    expect(context.assetVersion).toBe("asset-old");
    expect(context.renderUnits[0]).toMatchObject({
      sourceText: "city",
      targetText: "ciudad"
    });
    expect(repository.packs.map((pack) => pack.assetVersion)).toEqual(["asset-old"]);
  });

  it("returns cached packs without waiting for a slow remote refresh", async () => {
    const cachedPack = createPack("level-1a", "asset-old", "city", "ciudad");
    const remotePack = createPack("level-1a", "asset-new", "garden", "jardin");
    const repository = new InMemoryAssetPackRepository([cachedPack]);
    let manifestRequested = false;
    let resolveManifest: ((value: unknown) => void) | null = null;
    const service = new BackgroundAssetPackService({
      assetBaseUrl: "https://cdn.example/assets",
      repository,
      loadRuntimeConfig: () => Promise.resolve(createRuntimeConfig()),
      fetchJson: async (url) => {
        if (url.endsWith("/manifest.json")) {
          manifestRequested = true;
          return new Promise((resolve) => {
            resolveManifest = resolve;
          });
        }

        return remotePack;
      }
    });

    const context = await Promise.race([
      service.loadActiveContext(),
      delay(25).then(() => {
        throw new Error("Expected cached asset context before remote refresh.");
      })
    ]);

    expect(context.source).toBe("cached-pack");
    expect(context.renderUnits[0]).toMatchObject({
      sourceText: "city",
      targetText: "ciudad"
    });
    expect(manifestRequested).toBe(true);
    expect(repository.packs.map((pack) => pack.assetVersion)).toEqual(["asset-old"]);

    resolveManifest?.({
      schemaVersion: "1.0.0",
      assetVersion: "asset-new",
      languagePair: "en-es",
      packs: [{ bandId: "level-1a", url: "packs/asset-new/level-1a.json" }]
    });
    await waitFor(() =>
      repository.packs.some((pack) => pack.assetVersion === "asset-new")
    );
  });

  it("bounds first-run remote loading when no cached packs exist", async () => {
    const service = new BackgroundAssetPackService({
      assetBaseUrl: "https://cdn.example/assets",
      repository: new InMemoryAssetPackRepository(),
      loadRuntimeConfig: () => Promise.resolve(createRuntimeConfig()),
      remoteLoadTimeoutMs: 5,
      fetchJson: async () => new Promise(() => undefined)
    });

    const context = await service.loadActiveContext();

    expect(context.source).toBe("empty");
    expect(context.renderUnits).toEqual([]);
  });

  it("writes valid remote packs before pruning stale cached packs", async () => {
    const repository = new InMemoryAssetPackRepository([
      createPack("level-5b", "asset-old", "world", "mundo")
    ]);
    const remotePack = createPack("level-1a", "asset-new", "city", "ciudad");
    const service = new BackgroundAssetPackService({
      assetBaseUrl: "https://cdn.example/assets",
      repository,
      loadRuntimeConfig: () => Promise.resolve(createRuntimeConfig()),
      fetchJson: async (url) => {
        if (url.endsWith("/manifest.json")) {
          return {
            schemaVersion: "1.0.0",
            assetVersion: "asset-new",
            languagePair: "en-es",
            packs: [{ bandId: "level-1a", url: "/packs/asset-new/level-1a.json" }]
          };
        }

        return remotePack;
      }
    });

    const context = await service.loadActiveContext();

    expect(context.source).toBe("remote-pack");
    expect(context.renderUnits).toHaveLength(1);
    expect(repository.packs.map((pack) => pack.identity)).toEqual([
      buildAssetPackIdentity(remotePack)
    ]);
  });

  it("retains stale cached packs for active bands without validated replacements", async () => {
    const staleActivePack = createPack(
      "level-1b",
      "asset-old",
      "bridge",
      "puente"
    );
    const staleInactivePack = createPack(
      "level-5b",
      "asset-old",
      "world",
      "mundo"
    );
    const remotePack = createPack("level-1a", "asset-new", "city", "ciudad");
    const repository = new InMemoryAssetPackRepository([
      staleActivePack,
      staleInactivePack
    ]);
    const service = new BackgroundAssetPackService({
      assetBaseUrl: "https://cdn.example/assets",
      repository,
      loadRuntimeConfig: () => Promise.resolve(createRuntimeConfig()),
      fetchJson: async (url) => {
        if (url.endsWith("/manifest.json")) {
          return {
            schemaVersion: "1.0.0",
            assetVersion: "asset-new",
            languagePair: "en-es",
            packs: [{ bandId: "level-1a", url: "packs/asset-new/level-1a.json" }]
          };
        }

        return remotePack;
      }
    });

    const context = await service.loadActiveContext();

    expect(context.source).toBe("cached-pack");
    expect(context.missingBandIds).toEqual(["level-1a"]);
    expect(context.renderUnits.map((entry) => entry.sourceText)).toEqual(["bridge"]);
    await waitFor(() =>
      repository.packs.some((pack) => pack.identity === buildAssetPackIdentity(remotePack))
    );
    expect(repository.packs.map((pack) => pack.identity).sort()).toEqual(
      [remotePack, staleActivePack].map((pack) => buildAssetPackIdentity(pack)).sort()
    );
  });

});

class InMemoryAssetPackRepository implements AssetPackRepository {
  packs: StoredAssetPack[] = [];

  constructor(packs: AssetPack[] = []) {
    this.packs = packs.map((pack) => ({
      ...pack,
      identity: buildAssetPackIdentity(pack),
      cachedAt: "2026-05-01T00:00:00.000Z"
    }));
  }

  async getLatestPacksForBands(
    languagePair: LanguagePairId,
    bandIds: readonly string[]
  ): Promise<StoredAssetPack[]> {
    const requestedBandIds = new Set(bandIds);
    return this.packs.filter(
      (pack) => pack.languagePair === languagePair && requestedBandIds.has(pack.bandId)
    );
  }

  async putPacks(
    packs: readonly AssetPack[],
    options: { cachedAt: string }
  ): Promise<boolean> {
    for (const pack of packs) {
      const identity = buildAssetPackIdentity(pack);
      this.packs = this.packs.filter((entry) => entry.identity !== identity);
      this.packs.push({
        ...pack,
        identity,
        cachedAt: options.cachedAt
      });
    }
    return true;
  }

  async retainOnly(identities: readonly string[]): Promise<void> {
    const retain = new Set(identities);
    this.packs = this.packs.filter((pack) => retain.has(pack.identity));
  }
}

class InMemoryTtsVoiceAssetRepository implements TtsVoiceAssetRepository {
  async get() {
    return null;
  }

  async put() {
    return true;
  }
}

function createRuntimeConfig(
  config: CurriculumConfig = DEFAULT_CURRICULUM_CONFIG,
  settings: Parameters<typeof resolveExtensionSettings>[0] = null
): BackgroundRuntimeConfig {
  return {
    settings: resolveExtensionSettings(settings),
    credentials: { openAiApiKey: null },
    curriculum: {
      config,
      profile: {}
    }
  };
}

function createPack(
  bandId: string,
  assetVersion: string,
  sourceLemma = "city",
  targetLemma = "ciudad",
  languagePair: LanguagePairId = "en-es"
): AssetPack {
  return {
    schemaVersion: "1.0.0",
    assetVersion,
    languagePair,
    bandId,
    renderUnits: [
      createRenderUnit(0, bandId, sourceLemma, targetLemma, languagePair)
    ],
    lexemes: [createLexeme(0, sourceLemma, targetLemma, languagePair)]
  };
}

function createRenderUnit(
  index: number,
  bandId: string,
  sourceLemma: string,
  targetLemma: string,
  languagePair: LanguagePairId = "en-es"
): RenderUnitEntry {
  const targetLanguage = languagePair === "en-fr" ? "fr" : "es";
  return {
    renderUnitId: `ru:${sourceLemma}:noun:exact`,
    lexemeIds: [`lx:${sourceLemma}:noun`],
    kind: "single-token",
    renderPolicy: "inline",
    sourceText: sourceLemma,
    normalizedSourceText: sourceLemma,
    targetText: targetLemma,
    normalizedTargetText: targetLemma,
    sourcePattern: {
      matchMode: "exact",
      tokens: [{ normal: sourceLemma, lemma: sourceLemma, pos: "noun" }]
    },
    replacement: {
      startToken: 0,
      endToken: 1,
      targetText: targetLemma
    },
    pos: "noun",
    minBand: bandId,
    frequencyRank: index + 1,
    confidence: 0.95,
    provenance: { source: "manual" },
    sourceLanguage: "en",
    targetLanguage
  };
}

function createLexeme(
  index: number,
  sourceLemma: string,
  targetLemma: string,
  languagePair: LanguagePairId = "en-es"
): LexemeEntry {
  const targetLanguage = languagePair === "en-fr" ? "fr" : "es";
  return {
    lexemeId: `lx:${sourceLemma}:noun`,
    sourceLemma,
    targetLemma,
    pos: "noun",
    frequencyRank: index + 1,
    confidence: 0.95,
    sourceLanguage: "en",
    targetLanguage
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitFor(
  predicate: () => boolean,
  options: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 250;
  const intervalMs = options.intervalMs ?? 5;
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }
    await delay(intervalMs);
  }

  throw new Error("Timed out waiting for condition.");
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => {
      resolve();
    });
  });
}
