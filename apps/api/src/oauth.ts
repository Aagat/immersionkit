import { createSession, sessionCookie } from "./auth";
import { futureIso, randomToken, sha256Base64Url } from "./crypto";
import { noStoreJson, readJson } from "./http";
import type { D1Database, Env, IdentityProvider } from "./types";
import { HttpError } from "./types";
import { assertOnlyKeys, assertPlainObject, stringField } from "./validation";

interface OAuthStateRecord {
  state: string;
  provider: IdentityProvider;
  code_verifier: string;
  redirect_uri: string;
  return_to: string | null;
  expires_at: string;
  consumed_at: string | null;
}

interface GoogleProfile {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

export async function createOAuthState(
  db: D1Database,
  env: Pick<Env, "GOOGLE_CLIENT_ID" | "GOOGLE_REDIRECT_URI" | "OAUTH_STATE_TTL_MINUTES">,
  options: { provider: IdentityProvider; returnTo?: string | null; redirectUri?: string | null },
): Promise<{ state: string; codeVerifier: string; authorizationUrl: string; expiresAt: string }> {
  if (options.provider !== "google") {
    throw new HttpError(400, "Only Google OAuth is enabled", "provider_not_enabled");
  }

  const redirectUri = normalizeOAuthRedirectUri(options.redirectUri, env.GOOGLE_REDIRECT_URI);
  const state = `ost_${randomToken(32)}`;
  const codeVerifier = randomToken(64);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const ttlMinutes = Number(env.OAUTH_STATE_TTL_MINUTES ?? "10");
  const expiresAt = futureIso((Number.isFinite(ttlMinutes) ? ttlMinutes : 10) * 60 * 1000);

  await db
    .prepare(
      `INSERT INTO oauth_states (
        state,
        provider,
        code_verifier,
        redirect_uri,
        return_to,
        expires_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      state,
      options.provider,
      codeVerifier,
      redirectUri,
      options.returnTo ?? null,
      expiresAt,
    )
    .run();

  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", "openid email profile");
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("code_challenge", codeChallenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");
  authorizationUrl.searchParams.set("access_type", "offline");
  authorizationUrl.searchParams.set("prompt", "consent");

  return { state, codeVerifier, authorizationUrl: authorizationUrl.toString(), expiresAt };
}

function normalizeOAuthRedirectUri(value: string | null | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new HttpError(400, "OAuth redirect URI is invalid", "invalid_redirect_uri");
  }

  if (value === fallback) {
    return value;
  }

  if (parsed.protocol === "https:" && parsed.hostname.endsWith(".chromiumapp.org")) {
    return value;
  }

  throw new HttpError(400, "OAuth redirect URI is not allowed", "invalid_redirect_uri");
}

async function consumeOAuthState(
  db: D1Database,
  provider: IdentityProvider,
  state: string,
): Promise<OAuthStateRecord> {
  const record = await db
    .prepare(
      `SELECT state, provider, code_verifier, redirect_uri, return_to, expires_at, consumed_at
       FROM oauth_states
       WHERE state = ? AND provider = ?
       LIMIT 1`,
    )
    .bind(state, provider)
    .first<OAuthStateRecord>();

  if (!record || record.consumed_at || Date.parse(record.expires_at) <= Date.now()) {
    throw new HttpError(400, "OAuth state is invalid or expired", "invalid_oauth_state");
  }

  await db
    .prepare(
      `UPDATE oauth_states
       SET consumed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE state = ?`,
    )
    .bind(state)
    .run();

  return record;
}

async function exchangeGoogleCode(
  env: Env,
  code: string,
  state: OAuthStateRecord,
  fetcher: typeof fetch = fetch,
): Promise<GoogleProfile> {
  const tokenResponse = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code,
      code_verifier: state.code_verifier,
      grant_type: "authorization_code",
      redirect_uri: state.redirect_uri,
    }),
  });
  if (!tokenResponse.ok) {
    throw new HttpError(401, "Google token exchange failed", "oauth_exchange_failed");
  }

  const tokenJson = (await tokenResponse.json()) as { access_token?: unknown };
  if (typeof tokenJson.access_token !== "string") {
    throw new HttpError(401, "Google token response was incomplete", "oauth_exchange_failed");
  }

  const profileResponse = await fetcher("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!profileResponse.ok) {
    throw new HttpError(401, "Google profile fetch failed", "oauth_profile_failed");
  }

  const profile = (await profileResponse.json()) as Partial<GoogleProfile>;
  if (typeof profile.sub !== "string" || typeof profile.email !== "string") {
    throw new HttpError(401, "Google profile was incomplete", "oauth_profile_failed");
  }

  return {
    sub: profile.sub,
    email: profile.email,
    name: typeof profile.name === "string" ? profile.name : undefined,
    picture: typeof profile.picture === "string" ? profile.picture : undefined,
  };
}

async function upsertUserForIdentity(
  db: D1Database,
  provider: IdentityProvider,
  profile: GoogleProfile,
): Promise<string> {
  const existingIdentity = await db
    .prepare(
      `SELECT user_id
       FROM identities
       WHERE provider = ? AND provider_subject = ?
       LIMIT 1`,
    )
    .bind(provider, profile.sub)
    .first<{ user_id: string }>();

  if (existingIdentity) {
    await db
      .prepare(
        `UPDATE users
         SET email = ?, display_name = ?, avatar_url = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?`,
      )
      .bind(profile.email, profile.name ?? null, profile.picture ?? null, existingIdentity.user_id)
      .run();
    return existingIdentity.user_id;
  }

  const existingUser = await db
    .prepare("SELECT id FROM users WHERE email = ? LIMIT 1")
    .bind(profile.email)
    .first<{ id: string }>();
  const userId = existingUser?.id ?? `usr_${randomToken(24)}`;

  if (!existingUser) {
    await db
      .prepare(
        `INSERT INTO users (id, email, display_name, avatar_url)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(userId, profile.email, profile.name ?? null, profile.picture ?? null)
      .run();
  }

  await db
    .prepare(
      `INSERT INTO identities (id, user_id, provider, provider_subject, email)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(`idt_${randomToken(24)}`, userId, provider, profile.sub, profile.email)
    .run();

  return userId;
}

export async function handleGoogleStart(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const returnTo = url.searchParams.get("returnTo");
  const state = await createOAuthState(env.DB, env, {
    provider: "google",
    returnTo,
    redirectUri: url.searchParams.get("redirect_uri") ?? url.searchParams.get("redirectUri"),
  });

  if (wantsJsonOAuthStart(request, url)) {
    return noStoreJson({
      authUrl: state.authorizationUrl,
      state: state.state,
      expiresAt: state.expiresAt,
    });
  }

  return Response.redirect(state.authorizationUrl, 302);
}

export async function handleGoogleCallback(
  request: Request,
  env: Env,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateValue = url.searchParams.get("state");
  if (!code || !stateValue) {
    throw new HttpError(400, "OAuth callback requires code and state", "invalid_oauth_callback");
  }

  const completed = await completeGoogleOAuth(env, code, stateValue, fetcher);
  const redirectTo = completed.returnTo ?? "/";
  return new Response(null, {
    status: 302,
    headers: {
      location: redirectTo,
      "set-cookie": sessionCookie(completed.session.token, completed.session.expiresAt),
      "cache-control": "no-store",
    },
  });
}

export async function handleGoogleExtensionCallback(
  request: Request,
  env: Env,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const body = assertPlainObject(await readJson(request), "payload");
  assertOnlyKeys(body, "payload", ["callbackUrl", "state", "installId"]);

  const callbackUrl = stringField(body.callbackUrl, "callbackUrl", { max: 2048 }) as string;
  const expectedState = stringField(body.state, "state", { max: 128 }) as string;
  const installId = stringField(body.installId, "installId", { max: 80, optional: true });

  let parsedCallback: URL;
  try {
    parsedCallback = new URL(callbackUrl);
  } catch {
    throw new HttpError(400, "OAuth callback URL is invalid", "invalid_oauth_callback");
  }
  const code = parsedCallback.searchParams.get("code");
  const stateValue = parsedCallback.searchParams.get("state");
  if (!code || !stateValue || stateValue !== expectedState) {
    throw new HttpError(400, "OAuth callback requires matching code and state", "invalid_oauth_callback");
  }

  const completed = await completeGoogleOAuth(env, code, stateValue, fetcher);
  if (installId) {
    await env.DB
      .prepare(
        `UPDATE installs
         SET user_id = ?, last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? OR install_key = ?`,
      )
      .bind(completed.userId, installId, installId)
      .run();
  }

  return noStoreJson({
    profile: {
      userId: completed.userId,
      email: completed.profile.email,
      provider: "google",
      previewStatus: "active",
      signedInAt: completed.signedInAt,
    },
    session: {
      accessToken: completed.session.token,
      expiresAt: completed.session.expiresAt,
    },
  });
}

async function completeGoogleOAuth(
  env: Env,
  code: string,
  stateValue: string,
  fetcher: typeof fetch,
): Promise<{
  userId: string;
  profile: GoogleProfile;
  session: { sessionId: string; token: string; expiresAt: string };
  returnTo: string | null;
  signedInAt: string;
}> {
  const state = await consumeOAuthState(env.DB, "google", stateValue);
  const profile = await exchangeGoogleCode(env, code, state, fetcher);
  const userId = await upsertUserForIdentity(env.DB, "google", profile);
  const ttlDays = Number(env.SESSION_TTL_DAYS ?? "30");
  const session = await createSession(
    env.DB,
    userId,
    Number.isFinite(ttlDays) && ttlDays > 0 ? ttlDays : 30,
  );

  return {
    userId,
    profile,
    session,
    returnTo: state.return_to,
    signedInAt: new Date().toISOString(),
  };
}

function wantsJsonOAuthStart(request: Request, url: URL): boolean {
  return (
    request.headers.get("accept")?.includes("application/json") === true ||
    url.searchParams.has("redirect_uri") ||
    url.searchParams.has("redirectUri")
  );
}
