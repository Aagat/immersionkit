import { getSessionFromRequest } from "./auth";
import { randomToken } from "./crypto";
import { insertFeedback, validateFeedbackPayload } from "./feedback";
import { handleGoogleCallback, handleGoogleExtensionCallback, handleGoogleStart } from "./oauth";
import { insertTelemetryBatch, validateTelemetryBatch } from "./telemetry";
import { handleError, jsonResponse, methodNotAllowed, noStoreJson, readJson } from "./http";
import type { Env } from "./types";
import { HttpError } from "./types";
import { assertOnlyKeys, assertPlainObject, enumField, stringField } from "./validation";

function normalizePublicBaseUrl(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function buildPublicAssetUrl(publicBaseUrl: string | null, key: string): string | null {
  if (!publicBaseUrl) {
    return null;
  }

  const normalizedKey = key.replace(/^\/+/, "");
  const assetPrefix = "assets/";
  if (publicBaseUrl.endsWith("/assets") && normalizedKey.startsWith(assetPrefix)) {
    return `${publicBaseUrl}/${normalizedKey.slice(assetPrefix.length)}`;
  }

  return `${publicBaseUrl}/${normalizedKey}`;
}

async function registerInstall(request: Request, env: Env): Promise<Response> {
  const body = assertPlainObject(await readJson(request), "payload");
  assertOnlyKeys(body, "payload", [
    "install",
    "installId",
    "installKey",
    "platform",
    "extensionVersion",
  ]);
  const install = body.install === undefined ? body : assertPlainObject(body.install, "install");
  assertOnlyKeys(install, "install", [
    "installId",
    "installKey",
    "platform",
    "extensionVersion",
    "languagePair",
    "assetVersion",
    "registeredAt",
    "registrationState",
  ]);

  const installId = stringField(install.installId, "installId", {
    max: 80,
    optional: true,
  }) ?? `ins_${randomToken(24)}`;
  const installKey =
    stringField(install.installKey, "installKey", { max: 128, optional: true }) ?? installId;
  const platform = enumField(install.platform ?? "chrome", "platform", ["chrome"] as const);
  const extensionVersion = stringField(install.extensionVersion, "extensionVersion", {
    max: 64,
  }) as string;
  const session = await getSessionFromRequest(env.DB, request);
  const registeredAt = new Date().toISOString();

  await env.DB
    .prepare(
      `INSERT INTO installs (id, user_id, install_key, platform, extension_version)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(install_key) DO UPDATE SET
         user_id = COALESCE(excluded.user_id, installs.user_id),
         extension_version = excluded.extension_version,
         last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    )
    .bind(installId, session?.user_id ?? null, installKey, platform, extensionVersion)
    .run();

  return noStoreJson(
    {
      install: {
        installId,
        registrationState: "registered",
        registeredAt,
      },
    },
    { status: 201 },
  );
}

async function ingestEvents(request: Request, env: Env): Promise<Response> {
  const batch = validateTelemetryBatch(await readJson(request));
  const session = await getSessionFromRequest(env.DB, request);
  await insertTelemetryBatch(env.DB, batch, session?.user_id ?? null);
  return noStoreJson({ accepted: batch.events.length }, { status: 202 });
}

async function ingestFeedback(request: Request, env: Env): Promise<Response> {
  const payload = validateFeedbackPayload(await readJson(request));
  const session = await getSessionFromRequest(env.DB, request);
  const feedbackId = await insertFeedback(env.DB, payload, session?.user_id ?? null);
  return noStoreJson({ feedbackId }, { status: 202 });
}

async function listAssetReleases(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const channel = url.searchParams.get("channel") ?? "production";
  if (channel !== "preview" && channel !== "production") {
    throw new HttpError(400, "Unsupported asset release channel", "invalid_channel");
  }
  const languagePair = url.searchParams.get("languagePair");
  const publicBaseUrl = normalizePublicBaseUrl(env.ASSET_PUBLIC_BASE_URL);

  const statement = languagePair
    ? env.DB
        .prepare(
          `SELECT id, channel, language_pair, schema_version, asset_version, manifest_key,
                  manifest_sha256, manifest_byte_length, minimum_extension_version, published_at
           FROM asset_releases
           WHERE channel = ? AND language_pair = ? AND is_active = 1
           ORDER BY published_at DESC`,
        )
        .bind(channel, languagePair)
    : env.DB
        .prepare(
          `SELECT id, channel, language_pair, schema_version, asset_version, manifest_key,
                  manifest_sha256, manifest_byte_length, minimum_extension_version, published_at
           FROM asset_releases
           WHERE channel = ? AND is_active = 1
           ORDER BY language_pair ASC, published_at DESC`,
        )
        .bind(channel);

  const { results } = await statement.all<{
    id: string;
    channel: string;
    language_pair: string;
    schema_version: number;
    asset_version: string;
    manifest_key: string;
    manifest_sha256: string;
    manifest_byte_length: number;
    minimum_extension_version: string;
    published_at: string;
  }>();

  return jsonResponse({
    releases: results.map((release) => ({
      id: release.id,
      channel: release.channel,
      languagePair: release.language_pair,
      schemaVersion: release.schema_version,
      assetVersion: release.asset_version,
      manifestKey: release.manifest_key,
      manifestUrl: buildPublicAssetUrl(publicBaseUrl, release.manifest_key),
      sha256: release.manifest_sha256,
      byteLength: release.manifest_byte_length,
      minimumExtensionVersion: release.minimum_extension_version,
      publishedAt: release.published_at,
    })),
  });
}

export async function handleRequest(
  request: Request,
  env: Env,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  try {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      if (request.method !== "GET") {
        return methodNotAllowed();
      }
      return noStoreJson({ ok: true });
    }

    if (url.pathname === "/auth/google/start") {
      if (request.method !== "GET") {
        return methodNotAllowed();
      }
      return await handleGoogleStart(request, env);
    }

    if (url.pathname === "/auth/google/callback") {
      if (request.method === "GET") {
        return await handleGoogleCallback(request, env, fetcher);
      }
      if (request.method === "POST") {
        return await handleGoogleExtensionCallback(request, env, fetcher);
      }
      return methodNotAllowed();
    }

    if (url.pathname === "/installs/register") {
      if (request.method !== "POST") {
        return methodNotAllowed();
      }
      return await registerInstall(request, env);
    }

    if (url.pathname === "/events/batch") {
      if (request.method !== "POST") {
        return methodNotAllowed();
      }
      return await ingestEvents(request, env);
    }

    if (url.pathname === "/feedback") {
      if (request.method !== "POST") {
        return methodNotAllowed();
      }
      return await ingestFeedback(request, env);
    }

    if (url.pathname === "/asset-releases") {
      if (request.method !== "GET") {
        return methodNotAllowed();
      }
      return await listAssetReleases(request, env);
    }

    return noStoreJson(
      { error: { code: "not_found", message: "Not found" } },
      { status: 404 },
    );
  } catch (error) {
    return handleError(error);
  }
}
