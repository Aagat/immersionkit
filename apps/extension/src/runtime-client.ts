import type {
  RuntimeMessage,
  RuntimeResponseFor
} from "@immersionkit/shared";

export async function sendRuntimeMessage<TMessage extends RuntimeMessage>(
  message: TMessage
): Promise<RuntimeResponseFor<TMessage> | null> {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    return null;
  }

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response?: unknown) => {
      if (chrome.runtime.lastError || !isRuntimeResponse(response)) {
        resolve(null);
        return;
      }

      resolve(response as RuntimeResponseFor<TMessage>);
    });
  });
}

export async function sendTabMessage<TMessage extends RuntimeMessage>(
  tabId: number,
  message: TMessage
): Promise<RuntimeResponseFor<TMessage> | null> {
  if (typeof chrome === "undefined" || !chrome.tabs?.sendMessage) {
    return null;
  }

  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response?: unknown) => {
      if (chrome.runtime.lastError || !isRuntimeResponse(response)) {
        resolve(null);
        return;
      }

      resolve(response as RuntimeResponseFor<TMessage>);
    });
  });
}

function isRuntimeResponse(value: unknown): value is { ok: boolean } {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { ok?: unknown }).ok === "boolean"
  );
}
