import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");

const extensionIdentity = JSON.parse(
  readFileSync(
    join(repoRoot, "apps/extension/extension-identity.json"),
    "utf8"
  )
);
const previewExtensionKey = extensionIdentity.publicManifestKeyParts.join("");
const extensionRelease = JSON.parse(
  readFileSync(
    join(repoRoot, "apps/extension/extension-release.json"),
    "utf8"
  )
);
const previewExtensionVersion = normalizeExtensionVersion(extensionRelease.version);

const defaults = {
  apiBaseUrl: "https://api.example.invalid",
  assetBaseUrl: "https://assets.example.invalid/assets",
  expectedExtensionId: extensionIdentity.expectedExtensionId,
  extensionFolderName: "immersionkit-extension-example",
  extensionKey: previewExtensionKey,
  extensionVersion: previewExtensionVersion,
  pagesBranch: "main",
  pagesProject: "immersionkit-preview-example",
  sitePublicBaseUrl: "https://immersionkit-preview-example.pages.dev"
};

const usage = `
Usage:
  node tools/deploy/preview-release.mjs release [--allow-dirty] [--dry-run]
  node tools/deploy/preview-release.mjs build-site
  node tools/deploy/preview-release.mjs deploy-site [--allow-dirty] [--dry-run]
  node tools/deploy/preview-release.mjs verify

Useful flags:
  --skip-migrations
  --skip-api
  --skip-assets
  --skip-site-build
  --skip-site-deploy
  --allow-same-extension-version
  --site-public-url=<url>
  --api-base-url=<url>
  --asset-base-url=<url>
  --pages-project=<name>
  --pages-branch=<branch>
`;

const [action = "release", ...rawArgs] = process.argv.slice(2);
const flags = parseArgs(rawArgs);
const config = resolveConfig(flags, process.env);

if (flags.help === "true" || action === "help") {
  console.log(usage.trim());
  process.exit(0);
}

await main(action, flags, config);

async function main(command, parsedFlags, resolvedConfig) {
  switch (command) {
    case "release":
      await releasePreview(parsedFlags, resolvedConfig);
      break;
    case "build-site":
      await buildShareSite(parsedFlags, resolvedConfig);
      break;
    case "deploy-site":
      await deployShareSite(parsedFlags, resolvedConfig);
      break;
    case "verify":
      await verifyPreview(resolvedConfig);
      break;
    default:
      throw new Error(`Unknown preview release action: ${command}\n\n${usage.trim()}`);
  }
}

async function releasePreview(parsedFlags, resolvedConfig) {
  const dryRun = isEnabled(parsedFlags["dry-run"]);
  if (!dryRun && !isEnabled(parsedFlags["allow-dirty"])) {
    await assertCleanGit();
  }

  assertPreviewExtensionId(resolvedConfig);
  await assertPreviewExtensionVersionIsNew(parsedFlags, resolvedConfig);

  if (!isEnabled(parsedFlags["skip-migrations"])) {
    await run("pnpm", ["api:migrate:remote"], { dryRun });
  }
  if (!isEnabled(parsedFlags["skip-api"])) {
    await run("pnpm", ["api:deploy:preview"], { dryRun });
  }
  if (!isEnabled(parsedFlags["skip-assets"])) {
    await run("pnpm", ["assets:release:publish"], {
      dryRun,
      env: {
        IK_ASSET_RELEASE_CHANNEL: "preview"
      }
    });
  }
  if (!isEnabled(parsedFlags["skip-site-build"])) {
    await buildShareSite(parsedFlags, resolvedConfig);
  }
  if (!isEnabled(parsedFlags["skip-site-deploy"])) {
    await deployShareSite(parsedFlags, resolvedConfig);
  }
  if (!dryRun) {
    await verifyPreview(resolvedConfig);
  }
}

async function buildShareSite(parsedFlags, resolvedConfig) {
  const dryRun = isEnabled(parsedFlags["dry-run"]);
  assertPreviewExtensionId(resolvedConfig);
  await run("pnpm", ["share-site:build"], {
    dryRun,
    env: previewShareSiteEnv(resolvedConfig)
  });
}

async function deployShareSite(parsedFlags, resolvedConfig) {
  const dryRun = isEnabled(parsedFlags["dry-run"]);
  if (!dryRun && !isEnabled(parsedFlags["allow-dirty"])) {
    await assertCleanGit();
  }
  await assertPreviewExtensionVersionIsNew(parsedFlags, {
    ...resolvedConfig,
    extensionVersion:
      readBuiltShareSiteExtensionVersion() ?? resolvedConfig.extensionVersion
  });

  const args = [
    "exec",
    "wrangler",
    "pages",
    "deploy",
    "apps/share-site/dist",
    "--project-name",
    resolvedConfig.pagesProject,
    "--branch",
    resolvedConfig.pagesBranch
  ];

  if (!dryRun) {
    args.push("--commit-hash", await capture("git", ["rev-parse", "HEAD"]));
    args.push("--commit-message", await capture("git", ["log", "-1", "--pretty=%s"]));
  }
  if (isEnabled(parsedFlags["allow-dirty"])) {
    args.push("--commit-dirty=true");
  }

  await run("pnpm", args, { dryRun });
}

async function verifyPreview(resolvedConfig) {
  assertPreviewExtensionId(resolvedConfig);

  const health = await fetchJson(`${resolvedConfig.apiBaseUrl}/health`);
  assert(health?.ok === true, "Worker health endpoint did not return ok=true.");

  const releases = await fetchJson(
    `${resolvedConfig.apiBaseUrl}/asset-releases?channel=preview&languagePair=en-es`
  );
  assert(
    Array.isArray(releases?.releases) && releases.releases.length > 0,
    "Preview asset release endpoint returned no active releases."
  );
  const activeRelease = releases.releases[0];
  assert(
    activeRelease.manifestUrl?.startsWith(resolvedConfig.assetBaseUrl),
    "Preview asset release manifest URL does not use the configured asset base URL."
  );

  const [html, css, releaseMetadata] = await Promise.all([
    fetchText(`${resolvedConfig.sitePublicBaseUrl}/`),
    fetchText(`${resolvedConfig.sitePublicBaseUrl}/styles.css`),
    fetchJson(`${resolvedConfig.sitePublicBaseUrl}/release.json`)
  ]);

  assert(!html.includes("<dt>Assets</dt>"), "Share site still renders the Assets row.");
  assert(
    !html.includes(resolvedConfig.assetBaseUrl),
    "Share site HTML exposes the configured asset base URL."
  );
  assert(
    css.includes("spanish-plaza-preview.png"),
    "Share site CSS does not reference the Spanish plaza hero image."
  );
  assert(
    !css.includes("kyoto-slow-season.png"),
    "Share site CSS still references the previous Kyoto hero image."
  );
  assert(
    releaseMetadata.apiBaseUrl === resolvedConfig.apiBaseUrl,
    "Share site release metadata points at an unexpected API base URL."
  );
  assert(
    releaseMetadata.assetBaseUrl === resolvedConfig.assetBaseUrl,
    "Share site release metadata points at an unexpected asset base URL."
  );

  await assertReachable(
    `${resolvedConfig.sitePublicBaseUrl}/media/spanish-plaza-preview.png`,
    "image/png"
  );
  const zipUrl = `${resolvedConfig.sitePublicBaseUrl}/downloads/${releaseMetadata.downloadFileName}`;
  const zipBuffer = await fetchBuffer(zipUrl);
  const zipSha256 = sha256(zipBuffer);
  assert(
    zipSha256 === releaseMetadata.downloadSha256,
    "Downloaded extension zip checksum does not match release metadata."
  );

  const tempDir = join(tmpdir(), "immersionkit-preview-example-release");
  await mkdir(tempDir, { recursive: true });
  const zipPath = join(tempDir, "extension.zip");
  await writeFile(zipPath, zipBuffer);
  const manifestText = await capture("unzip", [
    "-p",
    zipPath,
    `${resolvedConfig.extensionFolderName}/manifest.json`
  ]);
  const manifest = JSON.parse(manifestText);
  const extensionId = extensionIdFromKey(manifest.key);
  assert(
    extensionId === resolvedConfig.expectedExtensionId,
    `Extension zip id ${extensionId} did not match ${resolvedConfig.expectedExtensionId}.`
  );

  console.log(
    [
      "Preview release verification passed.",
      `Site: ${resolvedConfig.sitePublicBaseUrl}`,
      `API: ${resolvedConfig.apiBaseUrl}`,
      `Asset release: ${activeRelease.assetVersion}`,
      `Extension id: ${extensionId}`,
      `Zip SHA-256: ${zipSha256}`
    ].join("\n")
  );
}

function previewShareSiteEnv(resolvedConfig) {
  return {
    IK_SHARE_EXTENSION_ACCOUNT_REQUIRED: "true",
    IK_SHARE_EXTENSION_API_BASE_URL: resolvedConfig.apiBaseUrl,
    IK_SHARE_EXTENSION_ASSET_BASE_URL: resolvedConfig.assetBaseUrl,
    IK_SHARE_EXTENSION_FOLDER_NAME: resolvedConfig.extensionFolderName,
    IK_SHARE_EXTENSION_KEY: resolvedConfig.extensionKey,
    IK_SHARE_SITE_INCLUDE_HOSTED_ASSETS: "false",
    IK_SHARE_SITE_PUBLIC_BASE_URL: resolvedConfig.sitePublicBaseUrl
  };
}

function resolveConfig(parsedFlags, env) {
  return {
    apiBaseUrl: normalizeUrl(
      parsedFlags["api-base-url"] ??
        env.IK_PREVIEW_API_BASE_URL ??
        env.IK_SHARE_EXTENSION_API_BASE_URL ??
        defaults.apiBaseUrl
    ),
    assetBaseUrl: normalizeUrl(
      parsedFlags["asset-base-url"] ??
        env.IK_PREVIEW_ASSET_BASE_URL ??
        env.IK_SHARE_EXTENSION_ASSET_BASE_URL ??
        defaults.assetBaseUrl
    ),
    expectedExtensionId:
      parsedFlags["expected-extension-id"] ??
      env.IK_PREVIEW_EXTENSION_ID ??
      defaults.expectedExtensionId,
    extensionFolderName:
      parsedFlags["extension-folder-name"] ??
      env.IK_SHARE_EXTENSION_FOLDER_NAME ??
      defaults.extensionFolderName,
    extensionKey:
      parsedFlags["extension-key"] ??
      env.IK_PREVIEW_EXTENSION_KEY ??
      env.IK_SHARE_EXTENSION_KEY ??
      defaults.extensionKey,
    extensionVersion: defaults.extensionVersion,
    pagesBranch:
      parsedFlags["pages-branch"] ??
      env.IK_PREVIEW_PAGES_BRANCH ??
      defaults.pagesBranch,
    pagesProject:
      parsedFlags["pages-project"] ??
      env.IK_PREVIEW_PAGES_PROJECT ??
      defaults.pagesProject,
    sitePublicBaseUrl: normalizeUrl(
      parsedFlags["site-public-url"] ??
        env.IK_PREVIEW_SITE_PUBLIC_BASE_URL ??
        env.IK_SHARE_SITE_PUBLIC_BASE_URL ??
        defaults.sitePublicBaseUrl
    )
  };
}

function assertPreviewExtensionId(resolvedConfig) {
  const actual = extensionIdFromKey(resolvedConfig.extensionKey);
  assert(
    actual === resolvedConfig.expectedExtensionId,
    `Configured extension key resolves to ${actual}, expected ${resolvedConfig.expectedExtensionId}.`
  );
}

async function assertPreviewExtensionVersionIsNew(parsedFlags, resolvedConfig) {
  if (isEnabled(parsedFlags["allow-same-extension-version"])) {
    return;
  }

  const candidateVersion = normalizeExtensionVersion(
    resolvedConfig.extensionVersion
  );
  const releaseMetadata = await fetchOptionalJson(
    `${resolvedConfig.sitePublicBaseUrl}/release.json`
  );
  const deployedVersion = normalizeOptionalExtensionVersion(
    releaseMetadata?.extensionVersion
  );

  if (deployedVersion !== candidateVersion) {
    return;
  }

  throw new Error(
    [
      `Preview release would redeploy extension version ${candidateVersion}, which is already live.`,
      "Bump apps/extension/extension-release.json before deploying a new extension zip.",
      "Use --allow-same-extension-version only for an intentional same-version rebuild."
    ].join("\n")
  );
}

function readBuiltShareSiteExtensionVersion() {
  try {
    const metadata = JSON.parse(
      readFileSync(join(repoRoot, "apps/share-site/dist/release.json"), "utf8")
    );
    return normalizeOptionalExtensionVersion(metadata?.extensionVersion);
  } catch {
    return null;
  }
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  assert(response.ok, `${url} returned HTTP ${response.status}.`);
  return response.json();
}

async function fetchOptionalJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (response.status === 404) {
    return null;
  }
  assert(response.ok, `${url} returned HTTP ${response.status}.`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, { cache: "no-store" });
  assert(response.ok, `${url} returned HTTP ${response.status}.`);
  return response.text();
}

async function fetchBuffer(url) {
  const response = await fetch(url, { cache: "no-store" });
  assert(response.ok, `${url} returned HTTP ${response.status}.`);
  return Buffer.from(await response.arrayBuffer());
}

async function assertReachable(url, expectedContentType) {
  const response = await fetch(url, { cache: "no-store", method: "HEAD" });
  assert(response.ok, `${url} returned HTTP ${response.status}.`);
  const contentType = response.headers.get("content-type") ?? "";
  assert(
    contentType.includes(expectedContentType),
    `${url} returned content-type ${contentType}, expected ${expectedContentType}.`
  );
}

async function assertCleanGit() {
  const status = await capture("git", ["status", "--short"]);
  if (status.trim()) {
    throw new Error(
      [
        "Working tree has uncommitted changes.",
        "Commit them first, or pass --allow-dirty for an intentional preview deploy.",
        status.trim()
      ].join("\n")
    );
  }
}

async function run(command, args, options = {}) {
  if (options.dryRun) {
    console.log(`[dry-run] ${formatCommand(command, args)}`);
    return;
  }

  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: { ...process.env, ...options.env },
      stdio: "inherit"
    });
    child.once("error", rejectRun);
    child.once("exit", (code) => {
      if (code === 0) {
        resolveRun();
      } else {
        rejectRun(new Error(`${formatCommand(command, args)} failed with ${code}.`));
      }
    });
  });
}

async function capture(command, args) {
  return await new Promise((resolveCapture, rejectCapture) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", rejectCapture);
    child.once("exit", (code) => {
      const stdoutText = Buffer.concat(stdout).toString("utf8").trim();
      if (code === 0) {
        resolveCapture(stdoutText);
      } else {
        const stderrText = Buffer.concat(stderr).toString("utf8").trim();
        rejectCapture(
          new Error(
            `${formatCommand(command, args)} failed with ${code}: ${stderrText}`
          )
        );
      }
    });
  });
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      continue;
    }
    if (!arg?.startsWith("--")) {
      continue;
    }
    const [rawKey, rawValue] = arg.slice(2).split("=", 2);
    const key = rawKey.trim();
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

function isEnabled(value) {
  return value === "1" || value === "true";
}

function normalizeUrl(value) {
  const normalized = String(value ?? "").trim().replace(/\/+$/, "");
  if (!normalized) {
    throw new Error("Expected a non-empty URL.");
  }
  return normalized;
}

function normalizeExtensionVersion(value) {
  const normalized = String(value ?? "").trim();
  if (!/^\d+(?:\.\d+){0,3}$/.test(normalized)) {
    throw new Error("Expected a Chrome extension version with 1-4 numeric parts.");
  }
  return normalized;
}

function normalizeOptionalExtensionVersion(value) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalizeExtensionVersion(normalized) : null;
}

function extensionIdFromKey(key) {
  const hash = createHash("sha256").update(Buffer.from(key, "base64")).digest();
  return Array.from(hash.subarray(0, 16), (byte) => {
    return (
      String.fromCharCode(97 + (byte >> 4)) +
      String.fromCharCode(97 + (byte & 15))
    );
  }).join("");
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function formatCommand(command, args) {
  return [command, ...args.map(formatShellArg)].join(" ");
}

function formatShellArg(value) {
  return /^[A-Za-z0-9_./:=@-]+$/.test(value)
    ? value
    : JSON.stringify(value);
}
