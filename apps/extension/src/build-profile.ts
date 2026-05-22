export type ExtensionBuildProfile = "diagnostic" | "production";

const rawProfile = import.meta.env.VITE_IMMERSIONKIT_BUILD_PROFILE;
const rawAccountRequired = import.meta.env.VITE_IMMERSIONKIT_ACCOUNT_REQUIRED;

export const EXTENSION_BUILD_PROFILE: ExtensionBuildProfile =
  rawProfile === "production" ? "production" : "diagnostic";

export const DIAGNOSTICS_ENABLED =
  EXTENSION_BUILD_PROFILE === "diagnostic";

export const ACCOUNT_REQUIRED =
  rawAccountRequired === "1" ||
  rawAccountRequired === "true" ||
  (rawAccountRequired === undefined && EXTENSION_BUILD_PROFILE === "production");

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

export function isAccountRequiredBuild(
  value: string | undefined = rawAccountRequired,
  profile: ExtensionBuildProfile = EXTENSION_BUILD_PROFILE
): boolean {
  return (
    value === "1" ||
    value === "true" ||
    (value === undefined && profile === "production")
  );
}
