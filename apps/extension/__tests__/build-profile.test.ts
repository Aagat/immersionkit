import { describe, expect, it } from "vitest";

import {
  areDiagnosticsEnabled,
  normalizeBuildProfile
} from "../src/build-profile";
import { shouldShowAdvancedTabForLocation } from "../src/options/App";

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
});
