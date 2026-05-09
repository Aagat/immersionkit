import {
  DEFAULT_CURRICULUM_CONFIG,
  resolveExtensionSettings,
  type CurriculumConfig,
  type LanguagePairId,
  type LexemeEntry,
  type RenderUnitEntry
} from "@immersionkit/shared";
import { describe, expect, it } from "vitest";

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
import type { BackgroundRuntimeConfig } from "../src/background/settings";

describe("background asset packs", () => {
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
