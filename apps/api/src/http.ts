import { HttpError } from "./types";

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function noStoreJson(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store");
  return jsonResponse(body, { ...init, headers });
}

export async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new HttpError(415, "Expected application/json", "unsupported_media_type");
  }

  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body", "invalid_json");
  }
}

export function handleError(error: unknown): Response {
  if (error instanceof HttpError) {
    return noStoreJson(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  return noStoreJson(
    { error: { code: "internal_error", message: "Internal server error" } },
    { status: 500 },
  );
}

export function methodNotAllowed(): Response {
  return noStoreJson(
    { error: { code: "method_not_allowed", message: "Method not allowed" } },
    { status: 405 },
  );
}
