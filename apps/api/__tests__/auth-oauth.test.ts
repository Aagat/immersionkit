import { describe, expect, it } from "vitest";
import { createSession } from "../src/auth";
import { createOAuthState } from "../src/oauth";
import type { D1Database, D1PreparedStatement } from "../src/types";

class RecordingStatement implements D1PreparedStatement {
  values: unknown[] = [];

  constructor(
    private readonly db: RecordingD1,
    private readonly query: string,
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.values = values;
    return this;
  }

  async first<T = unknown>(): Promise<T | null> {
    return null;
  }

  async all<T = unknown>(): Promise<{ results: T[] }> {
    return { results: [] };
  }

  async run(): Promise<{ success: boolean }> {
    this.db.runs.push({ query: this.query, values: this.values });
    return { success: true };
  }
}

class RecordingD1 implements D1Database {
  runs: Array<{ query: string; values: unknown[] }> = [];

  prepare(query: string): D1PreparedStatement {
    return new RecordingStatement(this, query);
  }
}

describe("auth helpers", () => {
  it("creates hashed bearer sessions without storing the raw token", async () => {
    const db = new RecordingD1();
    const session = await createSession(db, "usr_123", 1);

    expect(session.token).toMatch(/^ik_/);
    expect(session.sessionId).toMatch(/^ses_/);
    expect(db.runs).toHaveLength(1);
    expect(db.runs[0]?.query).toContain("INSERT INTO sessions");
    expect(db.runs[0]?.values[1]).toBe("usr_123");
    expect(db.runs[0]?.values[2]).not.toBe(session.token);
    expect(String(db.runs[0]?.values[2])).toHaveLength(64);
  });

  it("creates Google OAuth state with PKCE challenge and provider-ready storage", async () => {
    const db = new RecordingD1();
    const state = await createOAuthState(
      db,
      {
        GOOGLE_CLIENT_ID: "google-client",
        GOOGLE_REDIRECT_URI: "https://api.example.test/auth/google/callback",
      },
      { provider: "google", returnTo: "https://app.example.test/after-login" },
    );

    const authorizationUrl = new URL(state.authorizationUrl);
    expect(authorizationUrl.origin).toBe("https://accounts.google.com");
    expect(authorizationUrl.searchParams.get("state")).toBe(state.state);
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorizationUrl.searchParams.get("scope")).toContain("openid");

    expect(db.runs).toHaveLength(1);
    expect(db.runs[0]?.query).toContain("INSERT INTO oauth_states");
    expect(db.runs[0]?.values[1]).toBe("google");
    expect(db.runs[0]?.values[4]).toBe("https://app.example.test/after-login");
  });
});
