import {
  DEFAULT_CURRICULUM_CONFIG,
  resolveExtensionSettings,
  type CurriculumConfig,
  type LexemeEntry,
  type RenderUnitEntry
} from "@immersionkit/shared";
import { describe, expect, it } from "vitest";

import {
  BackgroundAssetPackService,
  buildAssetPackIdentity,
  resolveActiveAssetBandWindow,
  resolvePackUrl,
  validateAssetPack,
  validateAssetPackManifest,
  type AssetPack,
  type AssetPackRepository,
  type StoredAssetPack
} from "../src/background/asset-packs";
import type { BackgroundRuntimeConfig } from "../src/background/settings";
import { installChromeStub } from "./helpers/chrome-stub";

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
      validateAssetPack({
        ...createPack("level-1a", "asset-v1"),
        lexemes: []
      })
    ).toBeNull();
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
    expect(context.lexicon[0]).toMatchObject({
      sourceLemma: "city",
      targetLemma: "ciudad"
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
    expect(context.lexicon[0]).toMatchObject({
      sourceLemma: "city",
      targetLemma: "ciudad"
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
    expect(context.lexicon).toEqual([]);
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
    expect(context.lexicon).toHaveLength(1);
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
    expect(context.lexicon.map((entry) => entry.sourceLemma)).toEqual(["bridge"]);
    await waitFor(() =>
      repository.packs.some((pack) => pack.identity === buildAssetPackIdentity(remotePack))
    );
    expect(repository.packs.map((pack) => pack.identity).sort()).toEqual(
      [remotePack, staleActivePack].map((pack) => buildAssetPackIdentity(pack)).sort()
    );
  });

  it("removes generated storage asset copies without using them as a fallback", async () => {
    const customSeed = createSeedAsset(2, "custom-small");
    const chromeStub = installChromeStub({
      "immersionkit.renderUnits": createRenderUnitAsset(100, "legacy-generated"),
      "immersionkit.lexemes": createLexemeAsset(100, "legacy-generated"),
      "immersionkit.seedLexicon": createSeedAsset(100, "legacy-generated"),
      seedLexicon: customSeed
    });
    const repository = new InMemoryAssetPackRepository();
    const service = new BackgroundAssetPackService({
      assetBaseUrl: null,
      repository,
      loadRuntimeConfig: () => Promise.resolve(createRuntimeConfig())
    });

    try {
      const context = await service.loadActiveContext();
      const snapshot = chromeStub.getStorageSnapshot();

      expect(context.source).toBe("empty");
      expect(context.lexicon).toHaveLength(0);
      expect(snapshot["immersionkit.renderUnits"]).toBeUndefined();
      expect(snapshot["immersionkit.lexemes"]).toBeUndefined();
      expect(snapshot["immersionkit.seedLexicon"]).toBeUndefined();
      expect(snapshot.seedLexicon).toEqual(customSeed);
      expect(repository.packs).toEqual([]);
    } finally {
      chromeStub.restore();
    }
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
    languagePair: "en-es",
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

function createRuntimeConfig(config: CurriculumConfig = DEFAULT_CURRICULUM_CONFIG): BackgroundRuntimeConfig {
  return {
    settings: resolveExtensionSettings(null),
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
  targetLemma = "ciudad"
): AssetPack {
  return {
    schemaVersion: "1.0.0",
    assetVersion,
    languagePair: "en-es",
    bandId,
    renderUnits: [createRenderUnit(0, bandId, sourceLemma, targetLemma)],
    lexemes: [createLexeme(0, sourceLemma, targetLemma)]
  };
}

function createRenderUnitAsset(count: number, assetVersion: string) {
  return {
    schemaVersion: "1.0.0",
    assetVersion,
    languagePair: "en-es",
    entries: Array.from({ length: count }, (_, index) =>
      createRenderUnit(index, "level-1a", `word-${index}`, `palabra-${index}`)
    )
  };
}

function createLexemeAsset(count: number, assetVersion: string) {
  return {
    schemaVersion: "1.0.0",
    assetVersion,
    languagePair: "en-es",
    entries: Array.from({ length: count }, (_, index) =>
      createLexeme(index, `word-${index}`, `palabra-${index}`)
    )
  };
}

function createSeedAsset(count: number, assetVersion: string) {
  return {
    schemaVersion: "1.0.0",
    assetVersion,
    entries: Array.from({ length: count }, (_, index) => ({
      lemmaId: `lx:word-${index}:noun`,
      sourceLemma: `word-${index}`,
      targetLemma: `palabra-${index}`,
      pos: "noun",
      frequencyRank: index + 1,
      confidence: 0.9
    }))
  };
}

function createRenderUnit(
  index: number,
  bandId: string,
  sourceLemma: string,
  targetLemma: string
): RenderUnitEntry {
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
    targetLanguage: "es"
  };
}

function createLexeme(
  index: number,
  sourceLemma: string,
  targetLemma: string
): LexemeEntry {
  return {
    lexemeId: `lx:${sourceLemma}:noun`,
    sourceLemma,
    targetLemma,
    pos: "noun",
    frequencyRank: index + 1,
    confidence: 0.95,
    sourceLanguage: "en",
    targetLanguage: "es"
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
