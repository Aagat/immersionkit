import { randomToken } from "./crypto";
import {
  assertNoForbiddenTelemetryFields,
  assertOnlyKeys,
  assertPlainObject,
  enumField,
  numberField,
  stringField,
} from "./validation";
import type { D1Database } from "./types";

const FEEDBACK_CATEGORIES = ["bug", "quality", "translation", "page-compatibility", "other"] as const;

export interface FeedbackPayload {
  installId?: string;
  category: (typeof FEEDBACK_CATEGORIES)[number];
  message: string;
  contactEmail?: string;
  diagnostics: Record<string, string | number | boolean>;
}

export function validateFeedbackPayload(input: unknown): FeedbackPayload {
  assertNoForbiddenTelemetryFields(input);
  const object = assertPlainObject(input, "payload");
  assertOnlyKeys(object, "payload", [
    "installId",
    "category",
    "description",
    "message",
    "contactEmail",
    "diagnostics",
  ]);

  const diagnostics = assertPlainObject(object.diagnostics ?? {}, "diagnostics");
  assertOnlyKeys(diagnostics, "diagnostics", [
    "extensionVersion",
    "appVersion",
    "buildProfile",
    "locale",
    "timezoneOffsetMinutes",
  ]);

  const parsedDiagnostics: FeedbackPayload["diagnostics"] = {};
  if (diagnostics.extensionVersion !== undefined) {
    parsedDiagnostics.extensionVersion = stringField(
      diagnostics.extensionVersion,
      "diagnostics.extensionVersion",
      { max: 64 },
    ) as string;
  }
  if (diagnostics.appVersion !== undefined) {
    parsedDiagnostics.appVersion = stringField(diagnostics.appVersion, "diagnostics.appVersion", {
      max: 64,
    }) as string;
  }
  if (diagnostics.buildProfile !== undefined) {
    parsedDiagnostics.buildProfile = enumField(
      diagnostics.buildProfile,
      "diagnostics.buildProfile",
      ["development", "preview", "production"] as const,
    );
  }
  if (diagnostics.locale !== undefined) {
    parsedDiagnostics.locale = stringField(diagnostics.locale, "diagnostics.locale", {
      max: 35,
    }) as string;
  }
  if (diagnostics.timezoneOffsetMinutes !== undefined) {
    parsedDiagnostics.timezoneOffsetMinutes = numberField(
      diagnostics.timezoneOffsetMinutes,
      "diagnostics.timezoneOffsetMinutes",
    );
  }

  return {
    installId: stringField(object.installId, "installId", { max: 80, optional: true }),
    category: enumField(object.category, "category", FEEDBACK_CATEGORIES),
    message: stringField(object.message ?? object.description, "description", {
      min: 1,
      max: 4000,
    }) as string,
    contactEmail: stringField(object.contactEmail, "contactEmail", {
      max: 320,
      optional: true,
    }),
    diagnostics: parsedDiagnostics,
  };
}

export async function insertFeedback(
  db: D1Database,
  payload: FeedbackPayload,
  userId: string | null,
): Promise<string> {
  const id = `fbk_${randomToken(24)}`;
  await db
    .prepare(
      `INSERT INTO feedback (
        id,
        user_id,
        install_id,
        category,
        message,
        contact_email,
        diagnostic_context_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      userId,
      payload.installId ?? null,
      payload.category,
      payload.message,
      payload.contactEmail ?? null,
      JSON.stringify(payload.diagnostics),
    )
    .run();
  return id;
}
