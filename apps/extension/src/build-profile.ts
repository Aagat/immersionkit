export type ExtensionBuildProfile = "diagnostic" | "production";

const rawProfile = import.meta.env.VITE_IMMERSIONKIT_BUILD_PROFILE;

export const EXTENSION_BUILD_PROFILE: ExtensionBuildProfile =
  rawProfile === "production" ? "production" : "diagnostic";

export const DIAGNOSTICS_ENABLED =
  EXTENSION_BUILD_PROFILE === "diagnostic";

export function normalizeBuildProfile(
  value: string | undefined
): ExtensionBuildProfile {
  return value === "production" ? "production" : "diagnostic";
}

export function areDiagnosticsEnabled(
  profile: ExtensionBuildProfile = EXTENSION_BUILD_PROFILE
): boolean {
  return profile === "diagnostic";
}
