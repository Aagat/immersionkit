import { describe, expect, it } from "vitest";
import { handleRequest, validateTelemetryBatch } from "../src";
import type { D1Database, D1PreparedStatement, Env } from "../src/types";

class EmptyStatement implements D1PreparedStatement {
  bind(): D1PreparedStatement {
    return this;
  }

  async first<T = unknown>(): Promise<T | null> {
    return null;
  }

  async all<T = unknown>(): Promise<{ results: T[] }> {
    return { results: [] };
  }

  async run(): Promise<{ success: boolean }> {
    return { success: true };
  }
}

const db: D1Database = {
  prepare() {
    return new EmptyStatement();
  },
};

const env: Env = {
  DB: db,
  GOOGLE_CLIENT_ID: "client",
  GOOGLE_CLIENT_SECRET: "secret",
  GOOGLE_REDIRECT_URI: "https://api.example.test/auth/google/callback",
};

describe("telemetry validation", () => {
  it("accepts fixed activation event schemas", () => {
    const batch = validateTelemetryBatch({
      installId: "ins_123",
      events: [
        {
          eventId: "evt_123",
          eventName: "reading_rendered",
          occurredAt: "2026-05-20T12:00:00.000Z",
          installId: "ins_123",
          extensionVersion: "0.1.0",
          languagePair: "en-es",
          assetVersion: "2026-05-20",
          properties: {
            surface: "content",
            assetSource: "remote-pack",
            assetVersion: "2026-05-20",
            count: 3,
          },
        },
      ],
    });

    expect(batch.events[0]?.eventName).toBe("reading_rendered");
  });

  it("rejects forbidden private reading fields anywhere in the payload", () => {
    expect(() =>
      validateTelemetryBatch({
        installId: "ins_123",
        events: [
          {
            eventId: "evt_123",
            eventName: "supported_page_seen",
            occurredAt: "2026-05-20T12:00:00.000Z",
            installId: "ins_123",
            extensionVersion: "0.1.0",
            languagePair: "en-es",
            assetVersion: null,
            properties: {
              surface: "content",
              fullUrl: "https://example.com/private-article",
            },
          },
        ],
      }),
    ).toThrow(/not allowed/);
  });

  it("rejects arbitrary event property expansion", () => {
    expect(() =>
      validateTelemetryBatch({
        installId: "ins_123",
        events: [
          {
            eventId: "evt_123",
            eventName: "help_opened",
            occurredAt: "2026-05-20T12:00:00.000Z",
            installId: "ins_123",
            extensionVersion: "0.1.0",
            languagePair: "en-es",
            assetVersion: null,
            properties: {
              surface: "content",
              helpSurface: "word",
              word: "private",
            },
          },
        ],
      }),
    ).toThrow(/not supported/);
  });

  it("returns a route-level 400 before writing forbidden telemetry", async () => {
    const response = await handleRequest(
      new Request("https://api.example.test/events/batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          installId: "ins_123",
          events: [
            {
              eventId: "evt_123",
              eventName: "active_day",
              occurredAt: "2026-05-20T12:00:00.000Z",
              installId: "ins_123",
              extensionVersion: "0.1.0",
              languagePair: "en-es",
              assetVersion: null,
              properties: { surface: "background", dayIndex: 2, sentenceText: "private sentence" },
            },
          ],
        }),
      }),
      env,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "forbidden_field" },
    });
  });
});
