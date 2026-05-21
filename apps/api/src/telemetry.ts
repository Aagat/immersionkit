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
import { HttpError } from "./types";

const EVENT_NAMES = [
  "install_registered",
  "signup_completed",
  "supported_page_seen",
  "reading_rendered",
  "help_opened",
  "sentence_help_interest",
  "pause_resume",
  "active_day",
  "feedback_submitted",
  "asset_load",
  "asset_fallback",
  "error_bucket",
] as const;

type EventName = (typeof EVENT_NAMES)[number];

export interface TelemetryEvent {
  eventId: string;
  eventName: EventName;
  occurredAt: string;
  installId: string;
  extensionVersion: string;
  languagePair: "en-es";
  assetVersion: string | null;
  properties: Record<string, string | number | boolean>;
}

export interface TelemetryBatch {
  installId: string;
  sessionId?: string;
  extensionVersion: string;
  events: TelemetryEvent[];
}

type PropertyParser = (properties: Record<string, unknown>) => TelemetryEvent["properties"];

const propertyParsers: Record<EventName, PropertyParser> = {
  install_registered(properties) {
    return parseExtensionProperties(properties, ["surface"]);
  },
  signup_completed(properties) {
    return parseExtensionProperties(properties, ["surface"]);
  },
  supported_page_seen(properties) {
    return parseExtensionProperties(properties, ["surface", "assetSource", "assetVersion"]);
  },
  reading_rendered(properties) {
    return parseExtensionProperties(properties, [
      "surface",
      "assetSource",
      "assetVersion",
      "count",
    ]);
  },
  help_opened(properties) {
    return parseExtensionProperties(properties, ["surface", "helpSurface", "action"]);
  },
  sentence_help_interest(properties) {
    return parseExtensionProperties(properties, ["surface", "action"]);
  },
  pause_resume(properties) {
    return parseExtensionProperties(properties, ["surface", "action"]);
  },
  active_day(properties) {
    return parseExtensionProperties(properties, ["surface", "dayIndex"]);
  },
  feedback_submitted(properties) {
    return parseExtensionProperties(properties, ["surface", "action"]);
  },
  asset_load(properties) {
    return parseExtensionProperties(properties, [
      "surface",
      "assetSource",
      "assetVersion",
      "count",
    ]);
  },
  asset_fallback(properties) {
    return parseExtensionProperties(properties, [
      "surface",
      "assetSource",
      "assetVersion",
      "count",
    ]);
  },
  error_bucket(properties) {
    return parseExtensionProperties(properties, ["surface", "errorBucket"]);
  },
};

type ExtensionPropertyKey =
  | "surface"
  | "helpSurface"
  | "action"
  | "assetSource"
  | "assetVersion"
  | "errorBucket"
  | "count"
  | "dayIndex";

function parseExtensionProperties(
  properties: Record<string, unknown>,
  allowedKeys: ExtensionPropertyKey[],
): TelemetryEvent["properties"] {
  assertOnlyKeys(properties, "properties", allowedKeys);
  const parsed: TelemetryEvent["properties"] = {};

  if (allowedKeys.includes("surface") && properties.surface !== undefined) {
    parsed.surface = enumField(properties.surface, "properties.surface", [
      "popup",
      "options",
      "content",
      "background",
    ] as const);
  }
  if (allowedKeys.includes("helpSurface") && properties.helpSurface !== undefined) {
    parsed.helpSurface = enumField(properties.helpSurface, "properties.helpSurface", [
      "word",
      "phrase",
      "sentence",
    ] as const);
  }
  if (allowedKeys.includes("action") && properties.action !== undefined) {
    parsed.action = enumField(properties.action, "properties.action", [
      "pause",
      "resume",
      "open",
      "close",
      "submit",
    ] as const);
  }
  if (allowedKeys.includes("assetSource") && properties.assetSource !== undefined) {
    parsed.assetSource = enumField(properties.assetSource, "properties.assetSource", [
      "remote-pack",
      "cached-pack",
      "empty",
    ] as const);
  }
  if (allowedKeys.includes("assetVersion") && properties.assetVersion !== undefined) {
    parsed.assetVersion = stringField(properties.assetVersion, "properties.assetVersion", {
      max: 80,
    }) as string;
  }
  if (allowedKeys.includes("errorBucket") && properties.errorBucket !== undefined) {
    parsed.errorBucket = stringField(properties.errorBucket, "properties.errorBucket", {
      max: 80,
    }) as string;
  }
  if (allowedKeys.includes("count") && properties.count !== undefined) {
    parsed.count = numberField(properties.count, "properties.count");
  }
  if (allowedKeys.includes("dayIndex") && properties.dayIndex !== undefined) {
    const dayIndex = numberField(properties.dayIndex, "properties.dayIndex");
    if (![0, 1, 2, 7].includes(dayIndex)) {
      throw new HttpError(400, "properties.dayIndex has an unsupported value", "invalid_payload");
    }
    parsed.dayIndex = dayIndex;
  }

  return parsed;
}

export function validateTelemetryBatch(input: unknown): TelemetryBatch {
  assertNoForbiddenTelemetryFields(input);
  const object = assertPlainObject(input, "payload");
  assertOnlyKeys(object, "payload", ["installId", "sessionId", "events"]);

  const sessionId = stringField(object.sessionId, "sessionId", {
    max: 80,
    optional: true,
  });
  if (!Array.isArray(object.events) || object.events.length === 0 || object.events.length > 50) {
    throw new HttpError(400, "events must contain 1 to 50 items", "invalid_payload");
  }

  const events = object.events.map((item, index) => {
      const event = assertPlainObject(item, `events[${index}]`);
      assertOnlyKeys(event, `events[${index}]`, [
        "eventId",
        "eventName",
        "occurredAt",
        "installId",
        "extensionVersion",
        "languagePair",
        "assetVersion",
        "properties",
      ]);
      const eventName = enumField(event.eventName, `events[${index}].eventName`, EVENT_NAMES);
      const eventId = stringField(event.eventId, `events[${index}].eventId`, { max: 80 }) as string;
      const occurredAt = stringField(event.occurredAt, `events[${index}].occurredAt`, {
        max: 40,
      }) as string;
      if (Number.isNaN(Date.parse(occurredAt))) {
        throw new HttpError(400, "occurredAt must be an ISO timestamp", "invalid_payload");
      }
      const installId = stringField(event.installId, `events[${index}].installId`, {
        max: 80,
      }) as string;
      const extensionVersion = stringField(
        event.extensionVersion,
        `events[${index}].extensionVersion`,
        {
          max: 64,
        },
      ) as string;
      const languagePair = enumField(event.languagePair, `events[${index}].languagePair`, [
        "en-es",
      ] as const);
      const assetVersion =
        stringField(event.assetVersion, `events[${index}].assetVersion`, {
          max: 80,
          optional: true,
        }) ?? null;
      const properties = assertPlainObject(event.properties, `events[${index}].properties`);
      return {
        eventId,
        eventName,
        occurredAt,
        installId,
        extensionVersion,
        languagePair,
        assetVersion,
        properties: propertyParsers[eventName](properties),
      };
    });
  const batchInstallId =
    stringField(object.installId, "installId", { max: 80, optional: true }) ?? events[0]?.installId;
  if (!batchInstallId) {
    throw new HttpError(400, "installId is required", "invalid_payload");
  }
  for (const event of events) {
    if (event.installId !== batchInstallId) {
      throw new HttpError(400, "all events in a batch must share installId", "invalid_payload");
    }
  }

  return {
    installId: batchInstallId,
    sessionId,
    extensionVersion: events[0]?.extensionVersion ?? "unknown",
    events,
  };
}

export async function insertTelemetryBatch(
  db: D1Database,
  batch: TelemetryBatch,
  userId: string | null,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO installs (id, install_key, platform, extension_version)
       VALUES (?, ?, 'chrome', ?)
       ON CONFLICT(install_key) DO UPDATE SET
         extension_version = excluded.extension_version,
         last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    )
    .bind(batch.installId, batch.installId, batch.extensionVersion)
    .run();

  for (const event of batch.events) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO events (
          id,
          install_id,
          user_id,
          session_id,
          event_name,
          event_schema_version,
          occurred_at,
          properties_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        event.eventId || `evt_${randomToken(24)}`,
        batch.installId,
        userId,
        batch.sessionId ?? null,
        event.eventName,
        1,
        event.occurredAt,
        JSON.stringify(event.properties),
      )
      .run();
  }
}
