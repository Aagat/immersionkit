import { RuntimeMessageType } from "@immersionkit/shared";
import type {
  QueueSentenceCandidatesMessage,
  RefreshActiveTabMessage,
  RuntimeMessage
} from "@immersionkit/shared";

import {
  SentenceQueueOrchestrator,
  type QueueSentenceCandidatesResponse
} from "./sentence-queue";

type RefreshActiveTabResponse =
  | {
      ok: true;
      refreshed: true;
      tabId: number;
    }
  | {
      ok: false;
      refreshed: false;
      reason: string;
      tabId: number | null;
    };

type PingResponse = {
  ok: true;
  source: "background";
  timestamp: string;
};

type ErrorResponse = {
  ok: false;
  error: string;
};

const RUNTIME_MESSAGE_TYPES = new Set<string>(Object.values(RuntimeMessageType));

export class BackgroundRuntimeCoordinator {
  private readonly sentenceQueue = new SentenceQueueOrchestrator();
  private isBooted = false;

  boot() {
    if (this.isBooted) {
      return;
    }

    this.isBooted = true;

    chrome.runtime.onInstalled.addListener(() => {
      console.info("ImmersionKit background service worker installed.");
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!isRuntimeMessage(message)) {
        return false;
      }

      if (message.type === RuntimeMessageType.Ping) {
        const response: PingResponse = {
          ok: true,
          source: "background",
          timestamp: new Date().toISOString()
        };
        sendResponse(response);
        return false;
      }

      if (message.type === RuntimeMessageType.RefreshActiveTab) {
        void this.handleRefreshActiveTab(sendResponse);
        return true;
      }

      if (message.type === RuntimeMessageType.QueueSentenceCandidates) {
        void this.handleQueueSentenceCandidates(message, sender, sendResponse);
        return true;
      }

      return false;
    });
  }

  private async handleRefreshActiveTab(
    sendResponse: (response: RefreshActiveTabResponse | ErrorResponse) => void
  ) {
    try {
      const activeTabId = await getActiveTabId();
      if (activeTabId === null) {
        sendResponse({
          ok: false,
          refreshed: false,
          tabId: null,
          reason: "no-active-tab"
        });
        return;
      }

      const sent = await sendRefreshMessageToTab(activeTabId, {
        type: RuntimeMessageType.RefreshActiveTab
      });
      if (!sent) {
        sendResponse({
          ok: false,
          refreshed: false,
          tabId: activeTabId,
          reason: "refresh-delivery-failed"
        });
        return;
      }

      sendResponse({
        ok: true,
        refreshed: true,
        tabId: activeTabId
      });
    } catch (error) {
      console.warn("ImmersionKit active-tab refresh failed.", error);
      sendResponse({
        ok: false,
        error: "refresh-active-tab-failed"
      });
    }
  }

  private async handleQueueSentenceCandidates(
    message: QueueSentenceCandidatesMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: QueueSentenceCandidatesResponse | ErrorResponse) => void
  ) {
    try {
      const response = await this.sentenceQueue.queueMessage(message, sender.tab?.id);
      sendResponse(response);
    } catch (error) {
      console.warn("ImmersionKit sentence queue handling failed.", error);
      sendResponse({
        ok: false,
        error: "sentence-queue-failed"
      });
    }
  }
}

function isRuntimeMessage(message: unknown): message is RuntimeMessage {
  if (!message || typeof message !== "object" || !("type" in message)) {
    return false;
  }

  return (
    typeof message.type === "string" && RUNTIME_MESSAGE_TYPES.has(message.type)
  );
}

async function getActiveTabId(): Promise<number | null> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }

      const activeTabId = tabs[0]?.id;
      resolve(typeof activeTabId === "number" ? activeTabId : null);
    });
  });
}

async function sendRefreshMessageToTab(
  tabId: number,
  message: RefreshActiveTabMessage
): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, () => {
      resolve(!chrome.runtime.lastError);
    });
  });
}
