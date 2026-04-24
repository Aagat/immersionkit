import { hashString } from "@immersionkit/shared";

import { IMMERSIONKIT_WORD_SELECTOR } from "./constants";
import type { TokenMetadata } from "./contracts";

export const CONTENT_ASSIST_EVENT_MESSAGE_TYPE = "evidence/assist-event";
export const CONTENT_QUALIFIED_EXPOSURE_MESSAGE_TYPE =
  "evidence/qualified-exposure-event";

const QUALIFIED_DWELL_MS = 1_500;
const QUALIFIED_INTERSECTION_RATIO = 0.6;
const EVIDENCE_DEDUPE_WINDOW_MS = 5 * 60 * 1000;

type EvidenceMessage = Record<string, unknown>;

type ExposureWatch = {
  element: HTMLElement;
  visibleSince: number | null;
  timer: number | null;
};

export class ContentEvidenceTracker {
  private readonly sessionId = createSessionId();
  private readonly observedTokens = new WeakSet<HTMLElement>();
  private readonly watches = new Map<string, ExposureWatch>();
  private readonly emittedExposureAt = new Map<string, number>();
  private readonly assistedAt = new Map<string, number>();
  private readonly observer: IntersectionObserver | null;
  private sequence = 0;

  constructor(private readonly now: () => number = () => Date.now()) {
    this.observer = createIntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!(entry.target instanceof HTMLElement)) {
          continue;
        }

        this.updateVisibility(
          entry.target,
          entry.isIntersecting && entry.intersectionRatio >= QUALIFIED_INTERSECTION_RATIO
        );
      }
    });
  }

  registerRenderedTokens(root: ParentNode = document): void {
    if (!this.observer || !isActiveSession()) {
      return;
    }

    const tokens = root.querySelectorAll<HTMLElement>(IMMERSIONKIT_WORD_SELECTOR);
    for (const token of tokens) {
      if (this.observedTokens.has(token)) {
        continue;
      }

      this.observedTokens.add(token);
      this.observer.observe(token);
    }
  }

  recordAssist(metadata: TokenMetadata, assistType = "manual-lookup"): void {
    const itemId = wordItemId(metadata.lemmaId);
    const contextSentenceHash = metadata.sentenceHash ?? undefined;
    const key = evidenceDedupeKey(itemId, contextSentenceHash);
    this.assistedAt.set(key, this.now());

    emitEvidenceMessage({
      type: CONTENT_ASSIST_EVENT_MESSAGE_TYPE,
      eventId: this.nextEventId("assist", key),
      itemId,
      assistType,
      contextSentenceHash,
      hostname: window.location.hostname,
      sessionId: this.sessionId,
      createdAt: new Date(this.now()).toISOString(),
      source: "content-word-interaction"
    });
  }

  stop(): void {
    this.observer?.disconnect();
    for (const watch of this.watches.values()) {
      if (watch.timer !== null) {
        window.clearTimeout(watch.timer);
      }
    }

    this.watches.clear();
  }

  private updateVisibility(element: HTMLElement, isVisible: boolean): void {
    const tokenId = element.getAttribute("data-ik-token-id");
    if (!tokenId) {
      return;
    }

    let watch = this.watches.get(tokenId);
    if (!watch) {
      watch = {
        element,
        visibleSince: null,
        timer: null
      };
      this.watches.set(tokenId, watch);
    }

    if (!isVisible || !isActiveSession()) {
      if (watch.timer !== null) {
        window.clearTimeout(watch.timer);
      }

      watch.visibleSince = null;
      watch.timer = null;
      return;
    }

    if (watch.visibleSince !== null) {
      return;
    }

    watch.visibleSince = this.now();
    watch.timer = window.setTimeout(() => {
      watch.timer = null;
      this.emitQualifiedExposure(watch.element, watch.visibleSince);
    }, QUALIFIED_DWELL_MS);
  }

  private emitQualifiedExposure(
    element: HTMLElement,
    visibleSince: number | null
  ): void {
    if (visibleSince === null || !isActiveSession()) {
      return;
    }

    const lemmaId = element.getAttribute("data-ik-lemma-id");
    const sentenceHash = element.getAttribute("data-ik-sentence-hash");
    if (!lemmaId || !sentenceHash) {
      return;
    }

    const itemId = wordItemId(lemmaId);
    const key = evidenceDedupeKey(itemId, sentenceHash);
    const now = this.now();
    const lastEmittedAt = this.emittedExposureAt.get(key);
    if (
      typeof lastEmittedAt === "number" &&
      now - lastEmittedAt < EVIDENCE_DEDUPE_WINDOW_MS
    ) {
      return;
    }

    const dwellMs = now - visibleSince;
    if (dwellMs < QUALIFIED_DWELL_MS) {
      return;
    }

    this.emittedExposureAt.set(key, now);
    emitEvidenceMessage({
      type: CONTENT_QUALIFIED_EXPOSURE_MESSAGE_TYPE,
      eventId: this.nextEventId("exposure", key),
      itemId,
      sentenceHash,
      hostname: window.location.hostname,
      sessionId: this.sessionId,
      occurredAt: new Date(now).toISOString(),
      wasAssisted: this.wasRecentlyAssisted(key, now),
      confidence: 0.72,
      distinctContextKey: `${window.location.hostname}:${sentenceHash}`,
      dwellMs,
      viewportRatio: QUALIFIED_INTERSECTION_RATIO,
      source: "content-viewport-dwell"
    });
  }

  private wasRecentlyAssisted(key: string, now: number): boolean {
    const lastAssistedAt = this.assistedAt.get(key);
    return (
      typeof lastAssistedAt === "number" &&
      now - lastAssistedAt < EVIDENCE_DEDUPE_WINDOW_MS
    );
  }

  private nextEventId(kind: string, key: string): string {
    this.sequence += 1;
    return `ik-${kind}-${this.sequence.toString(36)}-${hashString(
      `${this.sessionId}:${key}:${this.sequence}`
    ).slice(0, 10)}`;
  }
}

function createIntersectionObserver(
  callback: IntersectionObserverCallback
): IntersectionObserver | null {
  if (typeof IntersectionObserver === "undefined") {
    return null;
  }

  return new IntersectionObserver(callback, {
    threshold: [QUALIFIED_INTERSECTION_RATIO]
  });
}

function isActiveSession(): boolean {
  return document.visibilityState === "visible" && document.hasFocus();
}

function wordItemId(lemmaId: string): string {
  return `word:${lemmaId}`;
}

function evidenceDedupeKey(itemId: string, sentenceHash?: string): string {
  return `${itemId}:${sentenceHash ?? "no-sentence"}`;
}

function createSessionId(): string {
  return `iks-${Date.now().toString(36)}-${hashString(window.location.href).slice(0, 8)}`;
}

function emitEvidenceMessage(message: EvidenceMessage): void {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    return;
  }

  chrome.runtime.sendMessage(message, () => {
    void chrome.runtime.lastError;
  });
}
