import { DIAGNOSTICS_ENABLED } from "../build-profile";

export function diagnosticInfo(message: string, details?: unknown): void {
  if (!DIAGNOSTICS_ENABLED) {
    return;
  }

  if (details === undefined) {
    console.info(message);
    return;
  }

  console.info(message, details);
}
