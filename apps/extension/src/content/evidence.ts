import {
  CONTENT_EVIDENCE_POLICY,
  RuntimeMessageType,
  buildLearningItemId,
  hashString
} from "@immersionkit/shared";

import { IMMERSIONKIT_WORD_SELECTOR } from "./constants";
import type { PhraseMetadata, TokenMetadata } from "./contracts";
import type { CachedGrammarFeature } from "./storage";

export const CONTENT_ASSIST_EVENT_MESSAGE_TYPE = RuntimeMessageType.AssistEvent;
const CONTENT_QUALIFIED_EXPOSURE_MESSAGE_TYPE =
  RuntimeMessageType.QualifiedExposureEvent;

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
          entry.isIntersecting &&
            entry.intersectionRatio >= CONTENT_EVIDENCE_POLICY.qualifiedIntersectionRatio
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
    const itemId = buildLearningItemId("word", metadata.lexemeId);
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

  recordPhraseAssist(
    metadata: PhraseMetadata,
    assistType = "phrase-gloss-reveal"
  ): void {
    const contextSentenceHash = metadata.sentenceHash ?? undefined;
    const key = evidenceDedupeKey(metadata.itemId, contextSentenceHash);
    this.assistedAt.set(key, this.now());

    emitEvidenceMessage({
      type: CONTENT_ASSIST_EVENT_MESSAGE_TYPE,
      eventId: this.nextEventId("assist", key),
      itemId: metadata.itemId,
      assistType,
      contextSentenceHash,
      hostname: window.location.hostname,
      sessionId: this.sessionId,
      createdAt: new Date(this.now()).toISOString(),
      phraseId: metadata.phraseId,
      source: "content-phrase-interaction"
    });
  }

  recordGrammarAssist(
    sentenceHash: string,
    features: readonly CachedGrammarFeature[]
  ): void {
    const uniqueFeatureKeys = new Set<string>();
    for (const feature of features) {
      const featureKey = feature.featureKey.trim();
      if (!featureKey || uniqueFeatureKeys.has(featureKey)) {
        continue;
      }

      uniqueFeatureKeys.add(featureKey);
      const itemId = buildLearningItemId("grammar-feature", featureKey);
      const key = evidenceDedupeKey(itemId, sentenceHash);
      this.assistedAt.set(key, this.now());

      emitEvidenceMessage({
        type: CONTENT_ASSIST_EVENT_MESSAGE_TYPE,
        eventId: this.nextEventId("assist", key),
        itemId,
        assistType: "grammar-note-reveal",
        contextSentenceHash: sentenceHash,
        hostname: window.location.hostname,
        sessionId: this.sessionId,
        createdAt: new Date(this.now()).toISOString(),
        source: "content-grammar-note"
      });
    }
  }

  watchGrammarDetailDwell(input: {
    anchor: HTMLElement;
    sentenceHash: string;
    features: readonly CachedGrammarFeature[];
  }): () => void {
    if (input.features.length === 0 || !isDocumentVisible()) {
      return () => undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled || !isDocumentVisible() || !document.body?.contains(input.anchor)) {
        return;
      }

      this.recordGrammarQualifiedExposure(input.sentenceHash, input.features);
    }, CONTENT_EVIDENCE_POLICY.grammarDetailDwellMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
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
    }, CONTENT_EVIDENCE_POLICY.qualifiedDwellMs);
  }

  private emitQualifiedExposure(
    element: HTMLElement,
    visibleSince: number | null
  ): void {
    if (visibleSince === null || !isActiveSession()) {
      return;
    }

    const unitKind = element.getAttribute("data-ik-unit-kind");
    const lexemeId = element.getAttribute("data-ik-lexeme-id");
    const phraseId = element.getAttribute("data-ik-phrase-id");
    const sentenceHash = element.getAttribute("data-ik-sentence-hash");
    if (!sentenceHash) {
      return;
    }

    const itemId =
      unitKind === "phrase" && phraseId
        ? buildLearningItemId("phrase", phraseId)
        : lexemeId
          ? buildLearningItemId("word", lexemeId)
          : null;
    if (!itemId) {
      return;
    }

    const key = evidenceDedupeKey(itemId, sentenceHash);
    const now = this.now();
    const lastEmittedAt = this.emittedExposureAt.get(key);
    if (
      typeof lastEmittedAt === "number" &&
      now - lastEmittedAt < CONTENT_EVIDENCE_POLICY.evidenceDedupeWindowMs
    ) {
      return;
    }

    const dwellMs = now - visibleSince;
    if (dwellMs < CONTENT_EVIDENCE_POLICY.qualifiedDwellMs) {
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
      confidence: CONTENT_EVIDENCE_POLICY.viewportDwellConfidence,
      distinctContextKey: `${window.location.hostname}:${sentenceHash}`,
      dwellMs,
      viewportRatio: CONTENT_EVIDENCE_POLICY.qualifiedIntersectionRatio,
      source: "content-viewport-dwell"
    });
  }

  private recordGrammarQualifiedExposure(
    sentenceHash: string,
    features: readonly CachedGrammarFeature[]
  ): void {
    const uniqueFeatureKeys = new Set<string>();
    const now = this.now();
    for (const feature of features) {
      const featureKey = feature.featureKey.trim();
      if (!featureKey || uniqueFeatureKeys.has(featureKey)) {
        continue;
      }

      uniqueFeatureKeys.add(featureKey);
      const itemId = buildLearningItemId("grammar-feature", featureKey);
      const key = evidenceDedupeKey(itemId, sentenceHash);
      const lastEmittedAt = this.emittedExposureAt.get(key);
      if (
        typeof lastEmittedAt === "number" &&
        now - lastEmittedAt < CONTENT_EVIDENCE_POLICY.evidenceDedupeWindowMs
      ) {
        continue;
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
        confidence: Math.max(
          CONTENT_EVIDENCE_POLICY.grammarDetailMinimumConfidence,
          Math.min(CONTENT_EVIDENCE_POLICY.grammarDetailMaximumConfidence, feature.confidence)
        ),
        distinctContextKey: `${window.location.hostname}:${sentenceHash}:grammar:${featureKey}`,
        dwellMs: CONTENT_EVIDENCE_POLICY.grammarDetailDwellMs,
        viewportRatio: 1,
        source: "content-grammar-detail-dwell"
      });
    }
  }

  private wasRecentlyAssisted(key: string, now: number): boolean {
    const lastAssistedAt = this.assistedAt.get(key);
    return (
      typeof lastAssistedAt === "number" &&
      now - lastAssistedAt < CONTENT_EVIDENCE_POLICY.evidenceDedupeWindowMs
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
    threshold: [CONTENT_EVIDENCE_POLICY.qualifiedIntersectionRatio]
  });
}

function isActiveSession(): boolean {
  return document.visibilityState === "visible" && document.hasFocus();
}

function isDocumentVisible(): boolean {
  return document.visibilityState === "visible";
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
