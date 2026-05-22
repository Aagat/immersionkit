import { describe, expect, it } from "vitest";
import migrationSql from "../migrations/0001_initial.sql?raw";

describe("D1 migration", () => {
  it("creates the backend foundation tables", () => {
    for (const table of [
      "users",
      "identities",
      "installs",
      "sessions",
      "oauth_states",
      "events",
      "asset_releases",
      "feedback",
    ]) {
      expect(migrationSql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
    }
  });

  it("keeps identity provider and telemetry schemas constrained", () => {
    expect(migrationSql).toContain("provider IN ('google', 'github')");
    expect(migrationSql).toContain("event_schema_version INTEGER NOT NULL CHECK");
    expect(migrationSql).toContain("'reading_rendered'");
    expect(migrationSql).toContain("'feedback_submitted'");
  });

  it("stores immutable asset release metadata and rollback pointers", () => {
    expect(migrationSql).toContain("manifest_key TEXT NOT NULL UNIQUE");
    expect(migrationSql).toContain("manifest_sha256 TEXT NOT NULL");
    expect(migrationSql).toContain("manifest_byte_length INTEGER NOT NULL");
    expect(migrationSql).toContain("rollback_of_release_id TEXT REFERENCES asset_releases");
  });
});
