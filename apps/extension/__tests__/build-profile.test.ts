import { describe, expect, it } from "vitest";

import {
  areDiagnosticsEnabled,
  isAccountRequiredBuild,
  normalizeBuildProfile
} from "../src/build-profile";
import { shouldShowAdvancedTabForLocation } from "../src/options/App";
import { settingsTabs } from "@immersionkit/ui";

describe("extension build profile", () => {
  it("defaults to diagnostic profile unless production is explicit", () => {
    expect(normalizeBuildProfile(undefined)).toBe("diagnostic");
    expect(normalizeBuildProfile("")).toBe("diagnostic");
    expect(normalizeBuildProfile("production")).toBe("production");
    expect(normalizeBuildProfile("debug")).toBe("diagnostic");
  });

  it("allows Advanced only in diagnostic builds with an explicit URL gate", () => {
    expect(areDiagnosticsEnabled("diagnostic")).toBe(true);
    expect(areDiagnosticsEnabled("production")).toBe(false);
    expect(
      shouldShowAdvancedTabForLocation({
        diagnosticsEnabled: true,
        hash: "",
        search: ""
      })
    ).toBe(false);
    expect(
      shouldShowAdvancedTabForLocation({
        diagnosticsEnabled: true,
        hash: "#advanced",
        search: ""
      })
    ).toBe(true);
    expect(
      shouldShowAdvancedTabForLocation({
        diagnosticsEnabled: true,
        hash: "",
        search: "?debug=1"
      })
    ).toBe(true);
    expect(
      shouldShowAdvancedTabForLocation({
        diagnosticsEnabled: false,
        hash: "#advanced",
        search: "?debug=1"
      })
    ).toBe(false);
  });

  it("keeps Support visible separately from gated Advanced diagnostics", () => {
    const productionTabs = settingsTabs.filter((tab) => tab !== "Advanced");

    expect(productionTabs).toContain("Support");
    expect(productionTabs).not.toContain("Advanced");
  });

  it("requires accounts by default only for production preview builds", () => {
    expect(isAccountRequiredBuild(undefined, "diagnostic")).toBe(false);
    expect(isAccountRequiredBuild(undefined, "production")).toBe(true);
    expect(isAccountRequiredBuild("false", "production")).toBe(false);
    expect(isAccountRequiredBuild("0", "production")).toBe(false);
    expect(isAccountRequiredBuild("true", "diagnostic")).toBe(true);
    expect(isAccountRequiredBuild("1", "diagnostic")).toBe(true);
  });
});
