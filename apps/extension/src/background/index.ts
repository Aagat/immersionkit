import { RuntimeMessageType } from "@immersionkit/shared";

chrome.runtime.onInstalled.addListener(() => {
  console.info("ImmersionKit installed.");
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === RuntimeMessageType.Ping) {
    sendResponse({ ok: true, source: "background" });
    return true;
  }

  return false;
});

