export type IdentityProvider = "google" | "github";

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; meta?: unknown }>;
}

export interface R2Bucket {
  get(key: string): Promise<unknown>;
}

export interface Env {
  DB: D1Database;
  ASSET_BUCKET?: R2Bucket;
  ASSET_PUBLIC_BASE_URL?: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
  OAUTH_STATE_TTL_MINUTES?: string;
  SESSION_TTL_DAYS?: string;
}

export interface SessionRecord {
  id: string;
  user_id: string;
  expires_at: string;
  revoked_at: string | null;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = "bad_request",
  ) {
    super(message);
  }
}
