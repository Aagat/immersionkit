import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const languagePair = "en-es";
const defaultChannel = "preview";
const defaultBucket = "immersionkit-asset-releases";
const defaultD1Database = "immersionkit-preview";

const options = parseArgs(process.argv.slice(2));
const channel = String(
  options.channel ?? process.env.IK_ASSET_RELEASE_CHANNEL ?? defaultChannel
);
const releaseRoot = await resolveReleaseRoot({
  channel,
  releaseDir: options.releaseDir ?? process.env.IK_ASSET_RELEASE_DIR
});
const metadata = JSON.parse(
  await readFile(join(releaseRoot, "release-metadata.json"), "utf8")
);
const bucket = String(
  options.bucket ?? process.env.IK_ASSET_RELEASE_BUCKET ?? defaultBucket
);
const d1Database = String(
  options.d1Database ??
    process.env.IK_ASSET_RELEASE_D1_DATABASE ??
    defaultD1Database
);
const useLocalD1 =
  options.local === "true" ||
  options.local === "1" ||
  process.env.IK_ASSET_RELEASE_D1_LOCAL === "1";
const dryRun =
  options.dryRun === "true" ||
  options.dryRun === "1" ||
  process.env.IK_ASSET_RELEASE_DRY_RUN === "1";

assertMetadata(metadata, releaseRoot);

const manifestFile = metadata.uploadFiles.find(
  (file) => file.key === metadata.manifestObjectKey
);
if (!manifestFile) {
  throw new Error(`Release metadata is missing ${metadata.manifestObjectKey}.`);
}

const immutableFiles = metadata.uploadFiles
  .filter((file) => file.key !== metadata.manifestObjectKey)
  .sort(compareUploadOrder);

console.log(
  [
    `Publishing ImmersionKit ${metadata.channel} asset release ${metadata.assetVersion}.`,
    `Release root: ${releaseRoot}`,
    `Bucket: ${bucket}`,
    `D1: ${d1Database} (${useLocalD1 ? "local" : "remote"})`
  ].join("\n")
);

for (const file of immutableFiles) {
  await putR2Object(bucket, file);
}

await putR2Object(bucket, manifestFile);

const sqlPath = join(releaseRoot, "activate-release.sql");
await writeFile(sqlPath, buildActivationSql(metadata));
await runWrangler([
  "d1",
  "execute",
  d1Database,
  useLocalD1 ? "--local" : "--remote",
  "--file",
  sqlPath
]);

console.log(
  dryRun
    ? `Dry-run completed for ${metadata.channel}/${metadata.languagePair}/${metadata.assetVersion}.`
    : `Published and activated ${metadata.channel}/${metadata.languagePair}/${metadata.assetVersion}.`
);

async function putR2Object(bucketName, file) {
  await runWrangler([
    "r2",
    "object",
    "put",
    `${bucketName}/${file.key}`,
    "--file",
    file.path,
    "--content-type",
    file.contentType
  ]);
}

async function runWrangler(args) {
  const command = process.env.WRANGLER_BIN ?? "wrangler";
  if (dryRun) {
    console.log(["[dry-run]", command, ...args.map(formatShellArg)].join(" "));
    return;
  }

  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: "inherit"
    });
    child.once("error", rejectRun);
    child.once("exit", (code) => {
      if (code === 0) {
        resolveRun();
      } else {
        rejectRun(new Error(`${command} ${args.join(" ")} failed with ${code}.`));
      }
    });
  });
}

async function resolveReleaseRoot({ channel: releaseChannel, releaseDir }) {
  if (releaseDir) {
    return resolve(releaseDir);
  }

  const releaseBase = join(
    repoRoot,
    "release",
    "asset-release",
    releaseChannel,
    languagePair
  );
  const entries = await readdir(releaseBase, { withFileTypes: true }).catch(() => []);
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const candidate = join(releaseBase, entry.name);
    const metadataPath = join(candidate, "release-metadata.json");
    const candidateStat = await stat(metadataPath).catch(() => null);
    if (candidateStat) {
      candidates.push({ path: candidate, mtimeMs: candidateStat.mtimeMs });
    }
  }
  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
  const latest = candidates[0]?.path;
  if (!latest) {
    throw new Error(
      `No built asset release found under ${releaseBase}. Run pnpm assets:release:build first.`
    );
  }
  return latest;
}

function assertMetadata(input, expectedReleaseRoot) {
  const required = [
    "channel",
    "languagePair",
    "assetVersion",
    "schemaMajorVersion",
    "minimumExtensionVersion",
    "publishedAt",
    "manifestObjectKey",
    "manifestSha256",
    "manifestByteLength",
    "uploadFiles"
  ];
  for (const key of required) {
    if (input[key] === undefined || input[key] === null) {
      throw new Error(`Release metadata is missing ${key}.`);
    }
  }
  if (input.channel !== channel || input.languagePair !== languagePair) {
    throw new Error(
      `Release metadata is for ${input.channel}/${input.languagePair}, not ${channel}/${languagePair}.`
    );
  }
  if (resolve(input.releaseRoot) !== expectedReleaseRoot) {
    throw new Error(
      `Release metadata root ${input.releaseRoot} does not match ${expectedReleaseRoot}.`
    );
  }
  if (!Array.isArray(input.uploadFiles) || input.uploadFiles.length === 0) {
    throw new Error("Release metadata has no upload files.");
  }
}

function compareUploadOrder(left, right) {
  const leftRank = uploadRank(left.key);
  const rightRank = uploadRank(right.key);
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  return left.key.localeCompare(right.key);
}

function uploadRank(key) {
  if (key.startsWith(`assets/${languagePair}/packs/`)) {
    return 0;
  }
  return 1;
}

function buildActivationSql(input) {
  const releaseId = [
    "rel",
    input.channel,
    input.languagePair,
    input.assetVersion
  ]
    .join("_")
    .replace(/[^A-Za-z0-9_-]+/g, "_");

  return `
UPDATE asset_releases
SET is_active = 0
WHERE channel = ${sqlString(input.channel)}
  AND language_pair = ${sqlString(input.languagePair)}
  AND asset_version <> ${sqlString(input.assetVersion)};

INSERT INTO asset_releases (
  id,
  channel,
  language_pair,
  schema_version,
  asset_version,
  manifest_key,
  manifest_sha256,
  manifest_byte_length,
  minimum_extension_version,
  published_at,
  is_active,
  rollback_of_release_id
) VALUES (
  ${sqlString(releaseId)},
  ${sqlString(input.channel)},
  ${sqlString(input.languagePair)},
  ${Number(input.schemaMajorVersion)},
  ${sqlString(input.assetVersion)},
  ${sqlString(input.manifestObjectKey)},
  ${sqlString(input.manifestSha256)},
  ${Number(input.manifestByteLength)},
  ${sqlString(input.minimumExtensionVersion)},
  ${sqlString(input.publishedAt)},
  1,
  NULL
)
ON CONFLICT(channel, language_pair, asset_version) DO UPDATE SET
  manifest_key = excluded.manifest_key,
  manifest_sha256 = excluded.manifest_sha256,
  manifest_byte_length = excluded.manifest_byte_length,
  minimum_extension_version = excluded.minimum_extension_version,
  published_at = excluded.published_at,
  is_active = 1,
  rollback_of_release_id = excluded.rollback_of_release_id;

UPDATE asset_releases
SET is_active = CASE
  WHEN channel = ${sqlString(input.channel)}
    AND language_pair = ${sqlString(input.languagePair)}
    AND asset_version = ${sqlString(input.assetVersion)}
  THEN 1
  ELSE 0
END
WHERE channel = ${sqlString(input.channel)}
  AND language_pair = ${sqlString(input.languagePair)};
`.trimStart();
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function formatShellArg(value) {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(value)) {
    return value;
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
}

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
