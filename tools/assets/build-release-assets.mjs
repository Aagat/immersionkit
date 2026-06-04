import { createHash } from "node:crypto";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { buildAssetPacks } from "./asset-pack-server.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const languagePair = "en-es";
const defaultChannel = "preview";
const defaultMinimumExtensionVersion = "0.1.0";

const options = parseArgs(process.argv.slice(2));
const channel = String(
  options.channel ?? process.env.IK_ASSET_RELEASE_CHANNEL ?? defaultChannel
);
const minimumExtensionVersion = String(
  options.minimumExtensionVersion ??
    process.env.IK_ASSET_RELEASE_MINIMUM_EXTENSION_VERSION ??
    defaultMinimumExtensionVersion
);

const assetPacks = await buildAssetPacks(repoRoot);
const publishedAt = new Date().toISOString();
const releaseRoot = resolve(
  options.outDir ??
    process.env.IK_ASSET_RELEASE_DIR ??
    join(
      repoRoot,
      "release",
      "asset-release",
      channel,
      languagePair,
      assetPacks.assetVersion
    )
);
const assetsRoot = join(releaseRoot, "assets");
const languageRoot = join(assetsRoot, languagePair);
const packRoot = join(languageRoot, "packs", assetPacks.assetVersion);
const ttsSourceRoot = join(repoRoot, "apps/extension/src/assets/tts");
const ttsReleaseRoot = join(assetsRoot, "tts");

await rm(releaseRoot, { force: true, recursive: true });
await mkdir(packRoot, { recursive: true });

const manifest = {
  ...assetPacks.manifest,
  channel,
  publishedAt,
  minimumExtensionVersion,
  packs: assetPacks.manifest.packs.map((entry) => ({
    ...entry,
    url: `packs/${encodeURIComponent(assetPacks.assetVersion)}/${encodeURIComponent(entry.bandId)}.json`
  }))
};

for (const [bandId, packPayload] of assetPacks.packsByBandId.entries()) {
  await writeFile(join(packRoot, `${bandId}.json`), packPayload.body);
}

await cp(ttsSourceRoot, ttsReleaseRoot, {
  recursive: true,
  filter: (source) => !source.endsWith(`${sep}.DS_Store`)
}).catch((error) => {
  if (error?.code === "ENOENT") {
    return;
  }
  throw error;
});

const manifestBody = `${JSON.stringify(manifest)}\n`;
const manifestObjectKey = `assets/${languagePair}/manifest.json`;
await writeFile(join(languageRoot, "manifest.json"), manifestBody);

const uploadFiles = await collectFiles(assetsRoot);
const manifestSha256 = sha256(manifestBody);
const manifestByteLength = Buffer.byteLength(manifestBody);
const metadata = {
  channel,
  languagePair,
  assetVersion: assetPacks.assetVersion,
  schemaVersion: manifest.schemaVersion,
  schemaMajorVersion: getSchemaMajorVersion(manifest.schemaVersion),
  minimumExtensionVersion,
  publishedAt,
  releaseRoot,
  assetsRoot,
  manifestObjectKey,
  manifestSha256,
  manifestByteLength,
  uploadFiles: uploadFiles.map((filePath) => ({
    path: filePath,
    key: toObjectKey(relative(releaseRoot, filePath)),
    contentType: contentTypeForPath(filePath)
  }))
};
await writeFile(
  join(releaseRoot, "release-metadata.json"),
  `${JSON.stringify(metadata, null, 2)}\n`
);

console.log(
  [
    `Built ImmersionKit ${channel} asset release ${assetPacks.assetVersion}.`,
    `Release root: ${releaseRoot}`,
    `Manifest: ${manifestObjectKey} (${manifestByteLength} bytes, ${manifestSha256})`,
    `Upload files: ${metadata.uploadFiles.length}`
  ].join("\n")
);

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg?.startsWith("--")) {
      continue;
    }
    const [rawKey, rawValue] = arg.slice(2).split("=", 2);
    const key = rawKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const next = args[index + 1];
    if (rawValue !== undefined) {
      parsed[key] = rawValue;
    } else if (next && !next.startsWith("--")) {
      parsed[key] = next;
      index += 1;
    } else {
      parsed[key] = "true";
    }
  }
  return parsed;
}

async function collectFiles(root) {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(child)));
    } else if (entry.isFile()) {
      files.push(child);
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function toObjectKey(path) {
  return path.split(sep).join("/");
}

function contentTypeForPath(path) {
  if (path.endsWith(".json")) {
    return "application/json; charset=utf-8";
  }
  if (path.endsWith(".onnx")) {
    return "application/octet-stream";
  }
  return "application/octet-stream";
}

function getSchemaMajorVersion(value) {
  const major = Number.parseInt(String(value).split(".")[0] ?? "", 10);
  return Number.isFinite(major) && major > 0 ? major : 1;
}

function sha256(body) {
  return createHash("sha256").update(body).digest("hex");
}
