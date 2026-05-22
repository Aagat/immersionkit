import { handleRequest } from "./routes";
import type { Env } from "./types";

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
};

export { createSession } from "./auth";
export { createOAuthState } from "./oauth";
export { handleRequest } from "./routes";
export { validateFeedbackPayload } from "./feedback";
export { validateTelemetryBatch } from "./telemetry";
export type { Env } from "./types";
