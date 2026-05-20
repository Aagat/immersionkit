import type {
  DebugSelectionSnapshot,
  DebugTraceExport,
  DebugTraceSnapshot
} from "../content/debug-trace-store";

export const DEBUG_OVERLAY_TOGGLE_MESSAGE_TYPE =
  "immersionkit/debug-overlay/toggle" as const;

export const DEBUG_OVERLAY_RESIZE_MESSAGE_TYPE =
  "immersionkit/debug-overlay/resize" as const;

export const DEBUG_INSPECTOR_COMMAND_MESSAGE_TYPE =
  "immersionkit/debug-inspector/command" as const;

export const DEBUG_INSPECTOR_EVENT_MESSAGE_TYPE =
  "immersionkit/debug-inspector/event" as const;

export type DebugOverlayToggleMessage = {
  type: typeof DEBUG_OVERLAY_TOGGLE_MESSAGE_TYPE;
};

export type DebugOverlayResizeMessage = {
  type: typeof DEBUG_OVERLAY_RESIZE_MESSAGE_TYPE;
  width?: number;
  height?: number;
  collapsed?: boolean;
};

export type DebugOverlayToggleResponse =
  | {
      ok: true;
      visible: boolean;
    }
  | {
      ok: false;
      reason: string;
    };

export type DebugInspectorCommand =
  | { type: "set-inspect-mode"; enabled: boolean }
  | { type: "request-snapshot" }
  | { type: "select-token"; tokenId: string }
  | { type: "select-sentence"; sentenceHash: string }
  | { type: "clear-selection" }
  | { type: "refresh-page" }
  | { type: "export-trace" }
  | { type: "collapse"; collapsed: boolean }
  | { type: "close" };

export type DebugInspectorCommandMessage = {
  type: typeof DEBUG_INSPECTOR_COMMAND_MESSAGE_TYPE;
  command: DebugInspectorCommand;
};

export type DebugInspectorEvent =
  | { type: "snapshot"; snapshot: DebugTraceSnapshot }
  | { type: "selection"; selection: DebugSelectionSnapshot | null }
  | { type: "inspect-mode"; enabled: boolean }
  | { type: "export"; fileName: string; payload: DebugTraceExport }
  | { type: "error"; reason: string; detail?: string };

export type DebugInspectorEventMessage = {
  type: typeof DEBUG_INSPECTOR_EVENT_MESSAGE_TYPE;
  event: DebugInspectorEvent;
};

export function isDebugOverlayToggleMessage(
  message: unknown
): message is DebugOverlayToggleMessage {
  return (
    isRecord(message) &&
    message.type === DEBUG_OVERLAY_TOGGLE_MESSAGE_TYPE
  );
}

export function isDebugOverlayResizeMessage(
  message: unknown
): message is DebugOverlayResizeMessage {
  return (
    isRecord(message) &&
    message.type === DEBUG_OVERLAY_RESIZE_MESSAGE_TYPE &&
    (message.width === undefined || typeof message.width === "number") &&
    (message.height === undefined || typeof message.height === "number") &&
    (message.collapsed === undefined || typeof message.collapsed === "boolean")
  );
}

export function isDebugInspectorCommandMessage(
  message: unknown
): message is DebugInspectorCommandMessage {
  if (
    !isRecord(message) ||
    message.type !== DEBUG_INSPECTOR_COMMAND_MESSAGE_TYPE ||
    !isRecord(message.command)
  ) {
    return false;
  }

  const command = message.command;
  switch (command.type) {
    case "set-inspect-mode":
      return typeof command.enabled === "boolean";
    case "request-snapshot":
    case "clear-selection":
    case "refresh-page":
    case "export-trace":
    case "close":
      return true;
    case "select-token":
      return typeof command.tokenId === "string";
    case "select-sentence":
      return typeof command.sentenceHash === "string";
    case "collapse":
      return typeof command.collapsed === "boolean";
    default:
      return false;
  }
}

export function isDebugInspectorEventMessage(
  message: unknown
): message is DebugInspectorEventMessage {
  return (
    isRecord(message) &&
    message.type === DEBUG_INSPECTOR_EVENT_MESSAGE_TYPE &&
    isRecord(message.event) &&
    typeof message.event.type === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}
