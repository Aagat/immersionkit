import { futureIso, randomToken, sha256Hex } from "./crypto";
import type { D1Database, SessionRecord } from "./types";

const DEFAULT_SESSION_TTL_DAYS = 30;

export async function createSession(
  db: D1Database,
  userId: string,
  ttlDays = DEFAULT_SESSION_TTL_DAYS,
): Promise<{ sessionId: string; token: string; expiresAt: string }> {
  const sessionId = `ses_${randomToken(24)}`;
  const token = `ik_${randomToken(48)}`;
  const tokenHash = await sha256Hex(token);
  const expiresAt = futureIso(ttlDays * 24 * 60 * 60 * 1000);

  await db
    .prepare(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(sessionId, userId, tokenHash, expiresAt)
    .run();

  return { sessionId, token, expiresAt };
}

export async function getSessionFromRequest(
  db: D1Database,
  request: Request,
): Promise<SessionRecord | null> {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : null;
  if (!token) {
    return null;
  }

  const tokenHash = await sha256Hex(token);
  const session = await db
    .prepare(
      `SELECT id, user_id, expires_at, revoked_at
       FROM sessions
       WHERE token_hash = ?
       LIMIT 1`,
    )
    .bind(tokenHash)
    .first<SessionRecord>();

  if (!session || session.revoked_at || Date.parse(session.expires_at) <= Date.now()) {
    return null;
  }

  return session;
}

export function sessionCookie(token: string, expiresAt: string): string {
  return [
    `ik_session=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Expires=${new Date(expiresAt).toUTCString()}`,
  ].join("; ");
}
