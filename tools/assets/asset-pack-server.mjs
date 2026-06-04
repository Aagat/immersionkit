import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = resolve(scriptDir, "../..");
const languagePair = "en-es";
const defaultTtsVoiceId = "es_ES-sharvard-medium";
const ttsAssetPathPrefix = `/assets/tts/${languagePair}/piper`;

export async function startAssetPackServer(options = {}) {
  const host = options.host ?? process.env.IK_ASSET_PACK_HOST ?? "127.0.0.1";
  const port = Number(options.port ?? process.env.IK_ASSET_PACK_PORT ?? 8787);
  const repoRoot = options.repoRoot ?? defaultRepoRoot;
  const assetPacks = await buildAssetPacks(repoRoot);
  const ttsAssets = await buildTtsAssets(repoRoot);

  const server = createServer((request, response) => {
    void handleAssetRequest(request, response, {
      assetPacks,
      ttsAssets,
      host
    });
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, host, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to start ImmersionKit asset pack server.");
  }

  const baseUrl = `http://${host}:${address.port}/assets`;
  const ttsManifestUrls = Object.fromEntries(
    [...ttsAssets.voicesById.keys()].map((voiceId) => [
      voiceId,
      `${baseUrl}/tts/${languagePair}/piper/${encodeURIComponent(voiceId)}/manifest.json`
    ])
  );

  return {
    server,
    baseUrl,
    manifestUrl: `${baseUrl}/${languagePair}/manifest.json`,
    packCount: assetPacks.packsByBandId.size,
    ttsManifestUrl:
      ttsManifestUrls[defaultTtsVoiceId] ??
      ttsManifestUrls[[...ttsAssets.voicesById.keys()][0]],
    ttsManifestUrls
  };
}

async function handleAssetRequest(
  request,
  response,
  { assetPacks, ttsAssets, host }
) {
  try {
    const url = new URL(request.url ?? "/", `http://${host}`);

    response.setHeader("access-control-allow-origin", "*");
    response.setHeader("access-control-allow-methods", "GET, OPTIONS");
    response.setHeader("access-control-allow-headers", "content-type");
    response.setHeader("cache-control", "no-store");

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    const payload = await routeAssetRequest(url.pathname, {
      assetPacks,
      ttsAssets
    });

    if (!payload) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, { "content-type": payload.contentType });
    response.end(payload.body);
  } catch (error) {
    console.error("ImmersionKit asset request failed.", error);
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end("Internal server error");
  }
}

export async function buildAssetPacks(repoRoot) {
  const renderUnitAsset = await readJson(
    join(repoRoot, "apps/extension/src/assets/en-es.render-units.v1.json")
  );
  const lexemeAsset = await readJson(
    join(repoRoot, "apps/extension/src/assets/en-es.lexemes.v1.json")
  );
  const assetVersion = String(renderUnitAsset.assetVersion || "local");
  const schemaVersion = String(renderUnitAsset.schemaVersion || "1.0.0");
  const lexemesById = new Map(
    (Array.isArray(lexemeAsset.entries) ? lexemeAsset.entries : [])
      .filter((entry) => entry && typeof entry.lexemeId === "string")
      .map((entry) => [entry.lexemeId, entry])
  );
  const renderUnitsByBandId = new Map();

  for (const renderUnit of Array.isArray(renderUnitAsset.entries)
    ? renderUnitAsset.entries
    : []) {
    if (!renderUnit || typeof renderUnit.minBand !== "string") {
      continue;
    }

    const entries = renderUnitsByBandId.get(renderUnit.minBand) ?? [];
    entries.push(renderUnit);
    renderUnitsByBandId.set(renderUnit.minBand, entries);
  }

  const packsByBandId = new Map();
  const manifestEntries = [];
  for (const [bandId, renderUnits] of [...renderUnitsByBandId.entries()].sort(
    ([left], [right]) => left.localeCompare(right)
  )) {
    const referencedLexemeIds = new Set(
      renderUnits.flatMap((renderUnit) =>
        Array.isArray(renderUnit.lexemeIds) ? renderUnit.lexemeIds : []
      )
    );
    const lexemes = [...referencedLexemeIds].flatMap((lexemeId) => {
      const lexeme = lexemesById.get(lexemeId);
      return lexeme ? [lexeme] : [];
    });
    const pack = {
      schemaVersion,
      assetVersion,
      languagePair,
      generatedAt: renderUnitAsset.generatedAt,
      bandId,
      renderUnits,
      lexemes
    };
    const packPayload = jsonPayload(pack);
    packsByBandId.set(bandId, {
      ...packPayload,
      pack
    });
    manifestEntries.push({
      bandId,
      assetVersion,
      languagePair,
      sha256: sha256(packPayload.body),
      byteLength: Buffer.byteLength(packPayload.body),
      renderUnitCount: renderUnits.length,
      lexemeCount: lexemes.length,
      url: `packs/${encodeURIComponent(assetVersion)}/${encodeURIComponent(bandId)}.json`
    });
  }

  return {
    manifest: {
      schemaVersion: "2.0.0",
      assetVersion,
      languagePair,
      publishedAt: renderUnitAsset.generatedAt,
      minimumExtensionVersion: "0.1.0",
      packs: manifestEntries
    },
    assetVersion,
    packsByBandId
  };
}

export async function buildTtsAssets(repoRoot) {
  const voicesRoot = join(repoRoot, "apps/extension/src/assets/tts/en-es/piper");
  const entries = await readdir(voicesRoot, { withFileTypes: true }).catch(() => []);
  const voicesById = new Map();

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const voiceDir = join(voicesRoot, entry.name);
    const manifest = await readJson(join(voiceDir, "manifest.json"));
    if (!manifest || manifest.engine !== "piper" || manifest.voiceId !== entry.name) {
      continue;
    }

    voicesById.set(entry.name, {
      manifest,
      voiceDir,
      modelFileName: basename(manifest.modelUrl),
      configFileName: basename(manifest.configUrl)
    });
  }

  return { voicesById };
}

async function routeAssetRequest(pathname, { assetPacks, ttsAssets }) {
  if (pathname === `/assets/${languagePair}/manifest.json`) {
    return jsonPayload(assetPacks.manifest);
  }

  const ttsMatch = pathname.match(
    new RegExp(`^${ttsAssetPathPrefix}/([^/]+)/([^/]+)$`)
  );
  if (ttsMatch) {
    const voiceId = decodeURIComponent(ttsMatch[1] ?? "");
    const fileName = decodeURIComponent(ttsMatch[2] ?? "");
    const voice = ttsAssets.voicesById.get(voiceId);
    if (!voice) {
      return null;
    }

    if (fileName === "manifest.json") {
      return jsonPayload(voice.manifest);
    }

    if (fileName === voice.configFileName) {
      return {
        body: await readFile(join(voice.voiceDir, voice.configFileName)),
        contentType: "application/json; charset=utf-8"
      };
    }

    if (fileName === voice.modelFileName) {
      return {
        body: await readFile(join(voice.voiceDir, voice.modelFileName)),
        contentType: "application/octet-stream"
      };
    }

    return null;
  }

  const match = pathname.match(
    new RegExp(`^/assets/${languagePair}/packs/([^/]+)/([^/]+)\\.json$`)
  );
  if (!match) {
    return null;
  }

  const assetVersion = decodeURIComponent(match[1] ?? "");
  const bandId = decodeURIComponent(match[2] ?? "");
  if (assetVersion !== assetPacks.assetVersion) {
    return null;
  }

  const pack = assetPacks.packsByBandId.get(bandId);
  return pack ?? null;
}

function jsonPayload(payload) {
  return {
    body: `${JSON.stringify(payload)}\n`,
    contentType: "application/json; charset=utf-8"
  };
}

function sha256(body) {
  return createHash("sha256").update(body).digest("hex");
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const server = await startAssetPackServer();
  console.log(
    `ImmersionKit asset packs: ${server.manifestUrl} (${server.packCount} packs)`
  );

  const shutdown = () => {
    server.server.close(() => {
      process.exit(0);
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
