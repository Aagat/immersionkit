import { normalizeToken } from "@immersionkit/shared";
import {
  readPhraseMetadata,
  readTokenMetadata
} from "./annotate";
import { IMMERSIONKIT_TOKEN_ATTRIBUTE, IMMERSIONKIT_WORD_SELECTOR } from "./constants";
import type {
  PhraseMetadata,
  TokenMetadata
} from "./contracts";
import { readSentenceNoteMetadata } from "./sentence-renderer";
import type { RuntimeState } from "./state";
import type { DebugInspectorEvent } from "../shared/debug-overlay";
import {
  createSelectedDomSnapshot,
  createWordDecisionTrace,
  type DebugPhraseDecisionTrace,
  type DebugSelectionSnapshot,
  type DebugTraceExport,
  type DebugTraceSnapshot
} from "./debug-trace-store";

const DEBUG_INSPECT_MODE_ATTRIBUTE = "data-ik-debug-inspect-mode";
const DEBUG_SELECTED_ATTRIBUTE = "data-ik-debug-selected";
const SENTENCE_NOTE_SELECTOR = "[data-ik-sentence-note='true']";

export type DebugInspectorController = {
  setInspectMode(enabled: boolean): void;
  isInspectModeEnabled(): boolean;
  trySelectTarget(target: EventTarget | null, source: "click" | "keyboard"): boolean;
  selectTokenId(tokenId: string): boolean;
  selectSentenceHash(sentenceHash: string): boolean;
  clearSelection(): void;
  readSnapshot(): DebugTraceSnapshot;
  exportTrace(): DebugTraceExport;
  subscribe(listener: DebugInspectorEventListener): () => void;
  emitSnapshot(): void;
  destroy(): void;
};

export type DebugInspectorEventListener = (event: DebugInspectorEvent) => void;

export function createDebugInspectorController(
  runtimeState: RuntimeState
): DebugInspectorController {
  const listeners = new Set<DebugInspectorEventListener>();
  let inspectModeEnabled = false;
  let selectedElement: HTMLElement | null = null;

  function emit(event: DebugInspectorEvent): void {
    for (const listener of listeners) {
      listener(event);
    }
  }

  function setSelectedElement(element: HTMLElement | null): void {
    if (selectedElement && selectedElement !== element) {
      selectedElement.removeAttribute(DEBUG_SELECTED_ATTRIBUTE);
    }
    selectedElement = element;
    if (selectedElement) {
      selectedElement.setAttribute(DEBUG_SELECTED_ATTRIBUTE, "true");
      selectedElement.scrollIntoView?.({
        block: "center",
        inline: "nearest",
        behavior: "smooth"
      });
    }
  }

  function selectElement(element: HTMLElement): boolean {
    const sentenceDetail = readSentenceNoteMetadata(element);
    if (sentenceDetail) {
      const selection: DebugSelectionSnapshot = {
        type: "sentence-note",
        sentenceHash: sentenceDetail.sentenceHash,
        sentence:
          runtimeState.debugTrace?.readSentenceTrace(sentenceDetail.sentenceHash) ??
          null,
        dom: createSelectedDomSnapshot(sentenceDetail.note)
      };
      setSelectedElement(sentenceDetail.note);
      runtimeState.debugTrace?.setSelection(selection);
      emit({ type: "selection", selection });
      emitSnapshot();
      return true;
    }

    const tokenElement = element.closest<HTMLElement>(IMMERSIONKIT_WORD_SELECTOR);
    if (!tokenElement) {
      return false;
    }

    const phraseMetadata = readPhraseMetadata(tokenElement);
    if (phraseMetadata) {
      const trace =
        runtimeState.debugTrace?.readPhraseTrace(phraseMetadata.tokenId) ??
        createFallbackPhraseTrace(phraseMetadata);
      const selection: DebugSelectionSnapshot = {
        type: "phrase",
        tokenId: phraseMetadata.tokenId,
        trace,
        dom: createSelectedDomSnapshot(tokenElement),
        sentence: phraseMetadata.sentenceHash
          ? runtimeState.debugTrace?.readSentenceTrace(phraseMetadata.sentenceHash) ??
            null
          : null
      };
      setSelectedElement(tokenElement);
      runtimeState.debugTrace?.setSelection(selection);
      emit({ type: "selection", selection });
      emitSnapshot();
      return true;
    }

    const tokenMetadata = readTokenMetadata(tokenElement);
    if (!tokenMetadata) {
      return false;
    }

    const trace =
      runtimeState.debugTrace?.readTokenTrace(tokenMetadata.tokenId) ??
      createFallbackWordTrace(tokenMetadata);
    const selection: DebugSelectionSnapshot = {
      type: "word",
      tokenId: tokenMetadata.tokenId,
      trace,
      dom: createSelectedDomSnapshot(tokenElement),
      sentence: tokenMetadata.sentenceHash
        ? runtimeState.debugTrace?.readSentenceTrace(tokenMetadata.sentenceHash) ??
          null
        : null
    };
    setSelectedElement(tokenElement);
    runtimeState.debugTrace?.setSelection(selection);
    emit({ type: "selection", selection });
    emitSnapshot();
    return true;
  }

  const controller: DebugInspectorController = {
    setInspectMode(enabled) {
      inspectModeEnabled = enabled;
      document.documentElement.setAttribute(
        DEBUG_INSPECT_MODE_ATTRIBUTE,
        String(enabled)
      );
      if (!enabled) {
        controller.clearSelection();
      }
      emit({ type: "inspect-mode", enabled });
      emitSnapshot();
    },
    isInspectModeEnabled() {
      return inspectModeEnabled;
    },
    trySelectTarget(target) {
      if (!inspectModeEnabled || !(target instanceof Element)) {
        return false;
      }
      return selectElement(target as HTMLElement);
    },
    selectTokenId(tokenId) {
      const element = findTokenElement(tokenId);
      if (element) {
        return selectElement(element);
      }

      const tokenTrace = runtimeState.debugTrace?.readTokenTrace(tokenId) ?? null;
      if (tokenTrace) {
        const selection: DebugSelectionSnapshot = {
          type: "word",
          tokenId,
          trace: tokenTrace,
          dom: createTraceOnlyDomSnapshot({
            "data-ik-token-id": tokenId,
            "data-ik-node-id": tokenTrace.nodeId
          }, `${tokenTrace.sourceToken} -> ${tokenTrace.targetToken ?? "no target"}`),
          sentence: tokenTrace.sentenceHash
            ? runtimeState.debugTrace?.readSentenceTrace(tokenTrace.sentenceHash) ??
              null
            : null
        };
        setSelectedElement(null);
        runtimeState.debugTrace?.setSelection(selection);
        emit({ type: "selection", selection });
        emitSnapshot();
        return true;
      }

      const phraseTrace = runtimeState.debugTrace?.readPhraseTrace(tokenId) ?? null;
      if (phraseTrace) {
        const selection: DebugSelectionSnapshot = {
          type: "phrase",
          tokenId,
          trace: phraseTrace,
          dom: createTraceOnlyDomSnapshot({
            "data-ik-token-id": tokenId,
            "data-ik-phrase-id": phraseTrace.phraseId
          }, `${phraseTrace.sourceText ?? phraseTrace.phraseId} -> ${phraseTrace.targetText ?? "no target"}`),
          sentence: phraseTrace.sentenceHash
            ? runtimeState.debugTrace?.readSentenceTrace(phraseTrace.sentenceHash) ??
              null
            : null
        };
        setSelectedElement(null);
        runtimeState.debugTrace?.setSelection(selection);
        emit({ type: "selection", selection });
        emitSnapshot();
        return true;
      }

      return false;
    },
    selectSentenceHash(sentenceHash) {
      const element = document.querySelector<HTMLElement>(
        `${SENTENCE_NOTE_SELECTOR}[data-ik-sentence-hash="${escapeSelectorValue(sentenceHash)}"]`
      );
      if (!element) {
        const sentence = runtimeState.debugTrace?.readSentenceTrace(sentenceHash) ?? null;
        if (!sentence) {
          return false;
        }
        const selection: DebugSelectionSnapshot = {
          type: "sentence-note",
          sentenceHash,
          sentence,
          dom: {
            tagName: "trace",
            textContentPreview: sentence.sourcePreview,
            boundingClientRect: {
              x: 0,
              y: 0,
              width: 0,
              height: 0
            },
            attributes: {
              "data-ik-sentence-hash": sentenceHash
            }
          }
        };
        runtimeState.debugTrace?.setSelection(selection);
        emit({ type: "selection", selection });
        emitSnapshot();
        return true;
      }
      return selectElement(element);
    },
    clearSelection() {
      setSelectedElement(null);
      runtimeState.debugTrace?.clearSelection();
      emit({ type: "selection", selection: null });
    },
    readSnapshot() {
      return runtimeState.debugTrace?.readSnapshot() ?? createEmptySnapshot();
    },
    exportTrace() {
      return runtimeState.debugTrace?.exportTrace() ?? {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        extensionBuildProfile: "diagnostic",
        trace: createEmptySnapshot(),
        redactions: ["debug trace store unavailable"]
      };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emitSnapshot,
    destroy() {
      inspectModeEnabled = false;
      document.documentElement.removeAttribute(DEBUG_INSPECT_MODE_ATTRIBUTE);
      setSelectedElement(null);
      runtimeState.debugTrace?.clearSelection();
      listeners.clear();
    }
  };

  function emitSnapshot(): void {
    emit({ type: "snapshot", snapshot: controller.readSnapshot() });
  }

  return controller;
}

function findTokenElement(tokenId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[${IMMERSIONKIT_TOKEN_ATTRIBUTE}="${escapeSelectorValue(tokenId)}"]`
  );
}

function createFallbackWordTrace(metadata: TokenMetadata) {
  return createWordDecisionTrace({
    tokenId: metadata.tokenId,
    nodeId: metadata.nodeId,
    sourceToken: metadata.sourceToken,
    normalizedSourceToken: normalizeToken(metadata.sourceToken),
    targetToken: metadata.targetToken,
    sentenceHash: metadata.sentenceHash,
    start: 0,
    end: metadata.sourceToken.length,
    wordEntry: {
      lexemeId: metadata.lexemeId,
      renderUnitId: metadata.renderUnitId ?? "",
      renderUnitMinBand: "",
      renderUnitMatchMode: "exact",
      normalizedSourceText: normalizeToken(metadata.sourceToken),
      targetText: metadata.targetToken,
      sourceLemma: metadata.sourceLemma,
      targetLemma: metadata.targetToken,
      pos: metadata.pos,
      frequencyRank: null,
      confidence: 1
    },
    status: metadata.status,
    finalAction: "injected",
    contextDecision: {
      evaluated: true,
      decision: "inject",
      rationale: metadata.curriculumReason
    },
    explanation: "Rendered DOM metadata was available before the full trace entry."
  });
}

function createFallbackPhraseTrace(
  metadata: PhraseMetadata
): DebugPhraseDecisionTrace {
  return {
    kind: "phrase",
    tokenId: metadata.tokenId,
    nodeId: metadata.nodeId,
    phraseId: metadata.phraseId,
    sourceText: metadata.sourceText,
    targetText: metadata.targetText,
    sentenceHash: metadata.sentenceHash,
    offset: null,
    match: {
      sourceKind: metadata.sourceKind,
      category: metadata.category,
      ruleId: metadata.ruleId,
      confidence: metadata.confidence
    },
    learningItem: {
      exists: true,
      itemId: metadata.itemId,
      due: metadata.dueStatus === "due"
    },
    gates: {
      renderPolicyOk: true,
      activeLearningItem: true,
      usableTarget: true,
      spanResolved: true,
      curriculumEligible: true,
      overlapSelected: true
    },
    rejectedReason: null,
    finalAction: "injected",
    explanation: metadata.curriculumReason ??
      "Rendered phrase DOM metadata was available before the full trace entry."
  };
}

function createEmptySnapshot(): DebugTraceSnapshot {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    runId: "ikr-unavailable",
    startedAt: now,
    updatedAt: now,
    page: {
      url: window.location.href,
      hostname: window.location.hostname,
      pathname: window.location.pathname
    },
    context: null,
    status: "stopped",
    stopReason: "debug-trace-store-unavailable",
    nodes: [],
    tokensByTokenId: {},
    phrasesByTokenId: {},
    sentencesByHash: {},
    events: [],
    selected: null,
    previousRun: null,
    dropped: {
      nodes: 0,
      tokens: 0,
      phrases: 0,
      sentences: 0,
      events: 0
    }
  };
}

function createTraceOnlyDomSnapshot(
  attributes: Record<string, string>,
  textContentPreview: string
) {
  return {
    tagName: "trace",
    textContentPreview,
    boundingClientRect: {
      x: 0,
      y: 0,
      width: 0,
      height: 0
    },
    attributes
  };
}

function escapeSelectorValue(value: string): string {
  return window.CSS?.escape ? window.CSS.escape(value) : value.replace(/["\\]/g, "\\$&");
}
