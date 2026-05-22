import { describe, expect, it } from "vitest";
import { handleRequest } from "../src";
import type { D1Database, D1PreparedStatement, Env } from "../src/types";

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
    return { results: this.db.results as T[] };
  }

  async run(): Promise<{ success: boolean }> {
    this.db.runs.push({ query: this.query, values: this.values });
    return { success: true };
  }
}

class RecordingD1 implements D1Database {
  runs: Array<{ query: string; values: unknown[] }> = [];
  results: unknown[] = [];

  prepare(query: string): D1PreparedStatement {
    return new RecordingStatement(this, query);
  }
}

function createEnv(db: D1Database): Env {
  return {
    DB: db,
    GOOGLE_CLIENT_ID: "client",
    GOOGLE_CLIENT_SECRET: "secret",
    GOOGLE_REDIRECT_URI: "https://api.example.test/auth/google/callback",
  };
}

describe("extension route contracts", () => {
  it("returns JSON OAuth start payloads for chrome.identity callers", async () => {
    const db = new RecordingD1();
    const response = await handleRequest(
      new Request(
        "https://api.example.test/auth/google/start?redirect_uri=https%3A%2F%2Fabcdefghijklmnop.chromiumapp.org%2Foauth%2Fgoogle&install_id=ins_123",
        { headers: { accept: "application/json" } },
      ),
      createEnv(db),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { authUrl?: string; state?: string };
    expect(body.authUrl).toContain("accounts.google.com");
    expect(body.state).toMatch(/^ost_/);
    expect(db.runs[0]?.values[3]).toBe(
      "https://abcdefghijklmnop.chromiumapp.org/oauth/google",
    );
  });

  it("accepts extension install identity payloads", async () => {
    const db = new RecordingD1();
    const response = await handleRequest(
      new Request("https://api.example.test/installs/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          install: {
            installId: "ins_123",
            languagePair: "en-es",
            extensionVersion: "0.1.0",
            assetVersion: null,
            registeredAt: null,
            registrationState: "local",
          },
        }),
      }),
      createEnv(db),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      install: { installId: "ins_123", registrationState: "registered" },
    });
    expect(db.runs[0]?.query).toContain("INSERT INTO installs");
    expect(db.runs[0]?.values.slice(0, 4)).toEqual([
      "ins_123",
      null,
      "ins_123",
      "chrome",
    ]);
  });

  it("returns asset release URLs for runtime-shaped R2 keys", async () => {
    const db = new RecordingD1();
    db.results = [
      {
        id: "rel_preview_en_es_asset-v1",
        channel: "preview",
        language_pair: "en-es",
        schema_version: 2,
        asset_version: "asset-v1",
        manifest_key: "assets/en-es/manifest.json",
        manifest_sha256:
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        manifest_byte_length: 128,
        minimum_extension_version: "0.1.0",
        published_at: "2026-05-21T00:00:00.000Z",
      },
    ];
    const response = await handleRequest(
      new Request(
        "https://api.example.test/asset-releases?channel=preview&languagePair=en-es",
      ),
      {
        ...createEnv(db),
        ASSET_PUBLIC_BASE_URL: "https://assets.example.test/assets",
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      releases: [
        {
          manifestKey: "assets/en-es/manifest.json",
          manifestUrl: "https://assets.example.test/assets/en-es/manifest.json",
        },
      ],
    });
  });
});
