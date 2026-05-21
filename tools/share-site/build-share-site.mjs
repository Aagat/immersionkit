import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const siteRoot = join(repoRoot, "apps/share-site");
const sourceRoot = join(siteRoot, "src");
const distRoot = join(siteRoot, "dist");
const publicBaseUrl = normalizePublicBaseUrl(
  process.env.IK_SHARE_SITE_PUBLIC_BASE_URL ?? "http://127.0.0.1:4175"
);
const assetBaseUrl = `${publicBaseUrl}/assets`;
const extensionFolderName =
  process.env.IK_SHARE_EXTENSION_FOLDER_NAME ?? "immersionkit-extension-preview";
const downloadFileName =
  process.env.IK_SHARE_EXTENSION_ZIP_NAME ?? `${extensionFolderName}.zip`;
const assetReleaseRoot = resolve(
  process.env.IK_SHARE_ASSET_RELEASE_DIR ??
    join(repoRoot, "release/share-site-assets")
);
const packageRoot = join(repoRoot, "release/share-site-package");
const packagedExtensionRoot = join(packageRoot, extensionFolderName);
const downloadPath = join(distRoot, "downloads", downloadFileName);

console.log(`Building ImmersionKit share site for ${publicBaseUrl}`);
if (publicBaseUrl.includes("127.0.0.1") || publicBaseUrl.includes("localhost")) {
  console.warn(
    "Local share-site build: rebuild with IK_SHARE_SITE_PUBLIC_BASE_URL before hosting."
  );
}

await rm(distRoot, { force: true, recursive: true });
await mkdir(join(distRoot, "downloads"), { recursive: true });
await mkdir(join(distRoot, "media"), { recursive: true });

await run("pnpm", ["--filter", "@immersionkit/shared", "build"]);
await run("pnpm", ["--filter", "@immersionkit/extension", "build:production"], {
  env: {
    VITE_IMMERSIONKIT_ACCOUNT_REQUIRED: "false",
    VITE_IMMERSIONKIT_ASSET_BASE_URL: assetBaseUrl
  }
});
await run(process.execPath, [
  "tools/assets/build-release-assets.mjs",
  "--out-dir",
  assetReleaseRoot
]);

await cp(join(assetReleaseRoot, "assets"), join(distRoot, "assets"), {
  recursive: true
});
await cp(
  join(repoRoot, "apps/extension/public/design-assets/kyoto-slow-season.png"),
  join(distRoot, "media/kyoto-slow-season.png")
);
await cp(
  join(repoRoot, "apps/extension/public/icons/icon-128.png"),
  join(distRoot, "media/icon-128.png")
);
await cp(join(sourceRoot, "styles.css"), join(distRoot, "styles.css"));

await packageExtensionZip();

const manifest = JSON.parse(
  await readFile(join(repoRoot, "apps/extension/dist/manifest.json"), "utf8")
);
const downloadStats = await stat(downloadPath);
const downloadSha256 = await sha256File(downloadPath);
const renderedHtml = applyTemplate(
  await readFile(join(sourceRoot, "index.html"), "utf8"),
  {
    ASSET_BASE_URL: assetBaseUrl,
    BUILD_DATE: new Date().toISOString().slice(0, 10),
    DOWNLOAD_FILE: downloadFileName,
    DOWNLOAD_SHA256: downloadSha256,
    DOWNLOAD_SIZE: formatBytes(downloadStats.size),
    EXTENSION_VERSION: String(manifest.version ?? "preview")
  }
);
await writeFile(join(distRoot, "index.html"), renderedHtml);
await writeFile(
  join(distRoot, "release.json"),
  `${JSON.stringify(
    {
      assetBaseUrl,
      builtAt: new Date().toISOString(),
      downloadFileName,
      downloadSha256,
      downloadSizeBytes: downloadStats.size,
      extensionVersion: manifest.version ?? null,
      publicBaseUrl
    },
    null,
    2
  )}\n`
);

console.log(
  [
    `Share site built at ${distRoot}`,
    `Download: downloads/${downloadFileName} (${formatBytes(downloadStats.size)})`,
    `SHA-256: ${downloadSha256}`,
    `Extension asset base: ${assetBaseUrl}`
  ].join("\n")
);

async function packageExtensionZip() {
  await rm(packageRoot, { force: true, recursive: true });
  await mkdir(packageRoot, { recursive: true });
  await cp(join(repoRoot, "apps/extension/dist"), packagedExtensionRoot, {
    recursive: true
  });
  await run("zip", ["-r", "-q", downloadPath, extensionFolderName], {
    cwd: packageRoot
  });
}

function applyTemplate(template, values) {
  return Object.entries(values).reduce(
    (html, [key, value]) => html.replaceAll(`__${key}__`, escapeHtml(value)),
    template
  );
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function normalizePublicBaseUrl(value) {
  const normalized = String(value).trim().replace(/\/+$/, "");
  if (!normalized) {
    throw new Error("IK_SHARE_SITE_PUBLIC_BASE_URL cannot be empty.");
  }
  return normalized;
}

async function run(command, args, options = {}) {
  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: { ...process.env, ...options.env },
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

async function sha256File(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}
