import { HttpError } from "./types";

const FORBIDDEN_FIELD_NAMES = new Set([
  "url",
  "fullUrl",
  "full_url",
  "pageUrl",
  "page_url",
  "pageText",
  "page_text",
  "sentenceText",
  "sentence_text",
  "sourceText",
  "source_text",
  "targetText",
  "target_text",
  "providerKey",
  "provider_key",
  "apiKey",
  "api_key",
  "userVocabulary",
  "user_vocabulary",
  "phraseRegistry",
  "phrase_registry",
  "reviewHistory",
  "review_history",
  "html",
  "pageHtml",
  "page_html",
]);

export function assertPlainObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HttpError(400, `${label} must be an object`, "invalid_payload");
  }
  return value as Record<string, unknown>;
}

export function assertNoForbiddenTelemetryFields(value: unknown, path = "payload"): void {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      assertNoForbiddenTelemetryFields(item, `${path}[${index}]`);
    }
    return;
  }

  if (typeof value !== "object" || value === null) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_FIELD_NAMES.has(key)) {
      throw new HttpError(
        400,
        `Field ${path}.${key} is not allowed in backend payloads`,
        "forbidden_field",
      );
    }
    assertNoForbiddenTelemetryFields(child, `${path}.${key}`);
  }
}

export function stringField(
  value: unknown,
  label: string,
  options: { min?: number; max?: number; optional?: boolean } = {},
): string | undefined {
  if (value === undefined || value === null) {
    if (options.optional) {
      return undefined;
    }
    throw new HttpError(400, `${label} is required`, "invalid_payload");
  }
  if (typeof value !== "string") {
    throw new HttpError(400, `${label} must be a string`, "invalid_payload");
  }
  const trimmed = value.trim();
  const min = options.min ?? 1;
  if (trimmed.length < min) {
    throw new HttpError(400, `${label} is too short`, "invalid_payload");
  }
  if (options.max !== undefined && trimmed.length > options.max) {
    throw new HttpError(400, `${label} is too long`, "invalid_payload");
  }
  return trimmed;
}

export function numberField(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new HttpError(400, `${label} must be a finite number`, "invalid_payload");
  }
  return value;
}

export function enumField<T extends string>(
  value: unknown,
  label: string,
  allowed: readonly T[],
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new HttpError(400, `${label} has an unsupported value`, "invalid_payload");
  }
  return value as T;
}

export function assertOnlyKeys(
  object: Record<string, unknown>,
  label: string,
  allowedKeys: readonly string[],
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) {
      throw new HttpError(400, `${label}.${key} is not supported`, "invalid_payload");
    }
  }
}
