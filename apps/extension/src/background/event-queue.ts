import type {
  ActivationEventName,
  ActivationEventProperties,
  PreviewInstallIdentity
} from "@immersionkit/shared";

import {
  loadUserDataValues,
  setUserDataValues
} from "../storage/user-data-repository";
import { USER_DATA_KEYS } from "../shared/user-data-keys";
import type { ImmersionKitApiClient } from "./api-client";
import type { BackgroundAccountService } from "./account-service";

const MAX_PENDING_EVENTS = 100;
const TELEMETRY_STATE_SCHEMA_VERSION = 1;
const ALLOWED_EVENT_NAMES = new Set<ActivationEventName>([
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
  "error_bucket"
]);
const ALLOWED_PROPERTY_KEYS = new Set<keyof ActivationEventProperties>([
  "surface",
  "helpSurface",
  "action",
  "assetSource",
  "assetVersion",
  "errorBucket",
  "count",
  "dayIndex"
]);
const FORBIDDEN_KEY_PATTERN =
  /(url|href|text|sentence|source|target|provider.*key|api.*key|vocab|phrase|review|history|item|hash|context)/i;

export type PendingActivationEvent = {
  eventId: string;
  eventName: ActivationEventName;
  occurredAt: string;
  installId: string;
  extensionVersion: string;
  languagePair: string;
  assetVersion: string | null;
  properties: ActivationEventProperties;
};

type TelemetryState = {
  schemaVersion: typeof TELEMETRY_STATE_SCHEMA_VERSION;
  pendingEvents: PendingActivationEvent[];
  retryCount: number;
  lastFlushAt: string | null;
  updatedAt: string;
};

export class BackgroundActivationEventQueue {
  private readonly accountService: BackgroundAccountService;
  private readonly apiClient: ImmersionKitApiClient;
  private flushPromise: Promise<void> | null = null;

  constructor(options: {
    accountService: BackgroundAccountService;
    apiClient: ImmersionKitApiClient;
  }) {
    this.accountService = options.accountService;
    this.apiClient = options.apiClient;
  }

  async queueEvent(input: {
    eventName: ActivationEventName;
    properties?: ActivationEventProperties;
  }): Promise<boolean> {
    const eventName = normalizeEventName(input.eventName);
    const properties = sanitizeActivationProperties(input.properties);
    const install = await this.accountService.ensureInstallIdentity();
    const state = await this.loadState();
    const nextEvent = createPendingEvent(eventName, properties, install);
    const pendingEvents = [...state.pendingEvents, nextEvent].slice(
      -MAX_PENDING_EVENTS
    );

    await this.saveState({
      ...state,
      pendingEvents,
      updatedAt: new Date().toISOString()
    });
    void this.flush();
    return true;
  }

  async flush(): Promise<void> {
    if (this.flushPromise) {
      return this.flushPromise;
    }

    this.flushPromise = this.flushNow().finally(() => {
      this.flushPromise = null;
    });
    return this.flushPromise;
  }

  private async flushNow(): Promise<void> {
    if (!this.apiClient.isConfigured()) {
      return;
    }

    const state = await this.loadState();
    if (state.pendingEvents.length === 0) {
      return;
    }

    const session = await this.accountService.loadSessionForApi();
    try {
      await this.apiClient.submitActivationEvents(state.pendingEvents, {
        accessToken: session?.accessToken ?? null
      });
      await this.saveState({
        ...state,
        pendingEvents: [],
        retryCount: 0,
        lastFlushAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    } catch {
      await this.saveState({
        ...state,
        retryCount: Math.min(state.retryCount + 1, 10),
        updatedAt: new Date().toISOString()
      });
    }
  }

  private async loadState(): Promise<TelemetryState> {
    const values = await loadUserDataValues([USER_DATA_KEYS.telemetryState]);
    return parseTelemetryState(values[USER_DATA_KEYS.telemetryState]);
  }

  private async saveState(state: TelemetryState): Promise<void> {
    await setUserDataValues({ [USER_DATA_KEYS.telemetryState]: state });
  }
}

export function sanitizeActivationProperties(
  input: unknown
): ActivationEventProperties {
  if (!input) {
    return {};
  }
  if (!isRecord(input)) {
    throw new Error("telemetry-properties-invalid");
  }

  const output: ActivationEventProperties = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (!ALLOWED_PROPERTY_KEYS.has(key as never)) {
      if (FORBIDDEN_KEY_PATTERN.test(key)) {
        throw new Error("telemetry-property-forbidden");
      }
      throw new Error("telemetry-property-forbidden");
    }

    if (key === "surface" && isOneOf(value, ["popup", "options", "content", "background"])) {
      output.surface = value;
    } else if (key === "helpSurface" && isOneOf(value, ["word", "phrase", "sentence"])) {
      output.helpSurface = value;
    } else if (key === "action" && isOneOf(value, ["pause", "resume", "open", "close", "submit"])) {
      output.action = value;
    } else if (key === "assetSource" && isOneOf(value, ["remote-pack", "cached-pack", "empty"])) {
      output.assetSource = value;
    } else if (key === "assetVersion" && typeof value === "string") {
      output.assetVersion = value.slice(0, 80);
    } else if (key === "errorBucket" && typeof value === "string") {
      output.errorBucket = value.slice(0, 80);
    } else if (key === "count" && typeof value === "number" && Number.isFinite(value)) {
      output.count = Math.max(0, Math.min(10_000, Math.round(value)));
    } else if (key === "dayIndex" && isOneOf(value, [0, 1, 2, 7])) {
      output.dayIndex = value;
    } else {
      throw new Error("telemetry-property-invalid");
    }
  }

  return output;
}

function normalizeEventName(value: string): ActivationEventName {
  if (!ALLOWED_EVENT_NAMES.has(value as ActivationEventName)) {
    throw new Error("telemetry-event-forbidden");
  }
  return value as ActivationEventName;
}

function createPendingEvent(
  eventName: ActivationEventName,
  properties: ActivationEventProperties,
  install: PreviewInstallIdentity
): PendingActivationEvent {
  return {
    eventId: createId(),
    eventName,
    occurredAt: new Date().toISOString(),
    installId: install.installId,
    extensionVersion: install.extensionVersion,
    languagePair: install.languagePair,
    assetVersion: install.assetVersion,
    properties
  };
}

function parseTelemetryState(input: unknown): TelemetryState {
  if (!isRecord(input) || input.schemaVersion !== TELEMETRY_STATE_SCHEMA_VERSION) {
    return createEmptyState();
  }

  return {
    schemaVersion: TELEMETRY_STATE_SCHEMA_VERSION,
    pendingEvents: Array.isArray(input.pendingEvents)
      ? input.pendingEvents.flatMap(parsePendingActivationEvent).slice(-MAX_PENDING_EVENTS)
      : [],
    retryCount:
      typeof input.retryCount === "number" && Number.isFinite(input.retryCount)
        ? Math.max(0, Math.min(10, Math.round(input.retryCount)))
        : 0,
    lastFlushAt: readString(input.lastFlushAt),
    updatedAt: readString(input.updatedAt) ?? new Date().toISOString()
  };
}

function parsePendingActivationEvent(input: unknown): PendingActivationEvent[] {
  if (!isRecord(input)) {
    return [];
  }
  const eventId = readString(input.eventId);
  const occurredAt = readString(input.occurredAt);
  const installId = readString(input.installId);
  const extensionVersion = readString(input.extensionVersion);
  const languagePair = readString(input.languagePair);
  const eventName = readString(input.eventName);
  if (!eventId || !occurredAt || !installId || !extensionVersion || !languagePair || !eventName) {
    return [];
  }
  try {
    return [
      {
        eventId,
        eventName: normalizeEventName(eventName),
        occurredAt,
        installId,
        extensionVersion,
        languagePair,
        assetVersion: readString(input.assetVersion),
        properties: sanitizeActivationProperties(input.properties)
      }
    ];
  } catch {
    return [];
  }
}

function createEmptyState(): TelemetryState {
  return {
    schemaVersion: TELEMETRY_STATE_SCHEMA_VERSION,
    pendingEvents: [],
    retryCount: 0,
    lastFlushAt: null,
    updatedAt: new Date().toISOString()
  };
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ike-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function isOneOf<const T extends readonly (string | number)[]>(
  value: unknown,
  options: T
): value is T[number] {
  return options.includes(value as never);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
