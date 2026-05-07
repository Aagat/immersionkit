import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = resolve(scriptDir, "../..");
const languagePair = "en-es";

export async function startAssetPackServer(options = {}) {
  const host = options.host ?? process.env.IK_ASSET_PACK_HOST ?? "127.0.0.1";
  const port = Number(options.port ?? process.env.IK_ASSET_PACK_PORT ?? 8787);
  const repoRoot = options.repoRoot ?? defaultRepoRoot;
  const assetPacks = await buildAssetPacks(repoRoot);

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://${host}`);
    const payload = routeAssetRequest(url.pathname, assetPacks);

    response.setHeader("access-control-allow-origin", "*");
    response.setHeader("access-control-allow-methods", "GET, OPTIONS");
    response.setHeader("access-control-allow-headers", "content-type");
    response.setHeader("cache-control", "no-store");

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    if (!payload) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(`${JSON.stringify(payload)}\n`);
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

  return {
    server,
    baseUrl: `http://${host}:${address.port}/assets`,
    manifestUrl: `http://${host}:${address.port}/assets/${languagePair}/manifest.json`,
    packCount: assetPacks.packsByBandId.size
  };
}

async function buildAssetPacks(repoRoot) {
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
    packsByBandId.set(bandId, pack);
    manifestEntries.push({
      bandId,
      assetVersion,
      languagePair,
      renderUnitCount: renderUnits.length,
      lexemeCount: lexemes.length,
      url: `packs/${encodeURIComponent(assetVersion)}/${encodeURIComponent(bandId)}.json`
    });
  }

  return {
    manifest: {
      schemaVersion,
      assetVersion,
      languagePair,
      generatedAt: renderUnitAsset.generatedAt,
      packs: manifestEntries
    },
    assetVersion,
    packsByBandId
  };
}

function routeAssetRequest(pathname, assetPacks) {
  if (pathname === `/assets/${languagePair}/manifest.json`) {
    return assetPacks.manifest;
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

  return assetPacks.packsByBandId.get(bandId) ?? null;
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
