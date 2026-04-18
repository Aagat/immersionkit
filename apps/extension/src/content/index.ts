import {
  RuntimeMessageType,
  normalizeToken,
  tokenizePlainText
} from "@immersionkit/shared";
import "./styles.css";

const ROOT_ATTRIBUTE = "data-immersionkit-root";

function boot() {
  if (document.documentElement.hasAttribute(ROOT_ATTRIBUTE)) {
    return;
  }

  document.documentElement.setAttribute(ROOT_ATTRIBUTE, "true");

  const sampleText = document.body?.innerText.slice(0, 240) ?? "";
  const normalizedPreview = tokenizePlainText(sampleText)
    .slice(0, 5)
    .map((token) => normalizeToken(token))
    .filter(Boolean);

  chrome.runtime.sendMessage({ type: RuntimeMessageType.Ping }, () => {
    if (chrome.runtime.lastError) {
      return;
    }
  });

  console.info("ImmersionKit content script booted.", {
    normalizedPreview
  });
}

boot();

