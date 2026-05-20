import {
  readPhraseMetadata,
  readTokenMetadata,
  restoreAnnotatedNodes
} from "./annotate";
import {
  IMMERSIONKIT_RESTORE_EVENT,
  IMMERSIONKIT_TOKEN_ACTIVATED_EVENT,
  IMMERSIONKIT_TOKEN_STATUS_EVENT,
  type PhraseActivatedDetail,
  type TokenActivatedDetail,
  type TokenStatusUpdatedDetail
} from "./contracts";
import { IMMERSIONKIT_WORD_SELECTOR } from "./constants";
import { closePopover, isWithinPopover } from "./popover";
import {
  applyStatusToLexemeTokens,
  findTokenElement,
  openPhraseTokenPopover,
  openSentenceNotePopover,
  openWordPopover,
  updateRuntimeVocabEntry
} from "./popover-controller";
import {
  clearSentenceTranslations,
  readSentenceNoteMetadata,
  toggleSentenceSourceReveal
} from "./sentence-renderer";
import type { RuntimeState } from "./state";

export function setupInteractionHooks(runtimeState: RuntimeState) {
  document.addEventListener(
    "click",
    (event) => {
      if (isWithinPopover(event.target)) {
        return;
      }

      if (runtimeState.debugInspector?.isInspectModeEnabled()) {
        const selected = runtimeState.debugInspector.trySelectTarget(
          event.target,
          "click"
        );
        if (selected) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }

      if (emitSentenceNoteActivated(runtimeState, event.target)) {
        event.preventDefault();
        return;
      }

      const activated = emitTokenActivatedEvent(runtimeState, event.target, "click");
      if (activated) {
        return;
      }

      closePopover(runtimeState);
    },
    true
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        closePopover(runtimeState);
        return;
      }

      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      if (runtimeState.debugInspector?.isInspectModeEnabled()) {
        const selected = runtimeState.debugInspector.trySelectTarget(
          event.target,
          "keyboard"
        );
        if (selected) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }

      if (emitSentenceNoteActivated(runtimeState, event.target)) {
        event.preventDefault();
        return;
      }

      if (!emitTokenActivatedEvent(runtimeState, event.target, "keyboard")) {
        return;
      }

      event.preventDefault();
    },
    true
  );

  document.addEventListener(
    "dblclick",
    (event) => {
      if (!toggleSentenceSourceReveal(event.target)) {
        return;
      }

      event.preventDefault();
      closePopover(runtimeState);
    },
    true
  );

  window.addEventListener(IMMERSIONKIT_TOKEN_ACTIVATED_EVENT, (event: Event) => {
    const detail = (event as CustomEvent<TokenActivatedDetail>).detail;
    if (!detail) {
      return;
    }

    const tokenElement = findTokenElement(detail.tokenId);
    if (!tokenElement) {
      return;
    }

    openWordPopover(runtimeState, tokenElement, detail);
  });

  window.addEventListener(IMMERSIONKIT_TOKEN_STATUS_EVENT, (event: Event) => {
    const detail = (event as CustomEvent<TokenStatusUpdatedDetail>).detail;
    if (!detail) {
      return;
    }

    applyStatusToLexemeTokens(detail);
    updateRuntimeVocabEntry(runtimeState, detail);
  });

  window.addEventListener(IMMERSIONKIT_RESTORE_EVENT, () => {
    closePopover(runtimeState);
    clearSentenceTranslations(document);
    restoreAnnotatedNodes(document);
  });
}

function emitTokenActivatedEvent(
  runtimeState: RuntimeState,
  target: EventTarget | null,
  sourceEvent: "click" | "keyboard"
): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  const tokenElement = target.closest<HTMLElement>(IMMERSIONKIT_WORD_SELECTOR);
  if (!tokenElement) {
    return false;
  }

  const metadata = readTokenMetadata(tokenElement);
  if (metadata) {
    const detail: TokenActivatedDetail = {
      ...metadata,
      sourceEvent
    };
    runtimeState.processing?.evidenceTracker.recordAssist(metadata);

    window.dispatchEvent(
      new CustomEvent<TokenActivatedDetail>(IMMERSIONKIT_TOKEN_ACTIVATED_EVENT, {
        detail
      })
    );

    return true;
  }

  const phraseMetadata = readPhraseMetadata(tokenElement);
  if (!phraseMetadata) {
    return false;
  }

  const detail: PhraseActivatedDetail = {
    ...phraseMetadata,
    sourceEvent
  };
  runtimeState.processing?.evidenceTracker.recordPhraseAssist(phraseMetadata);
  openPhraseTokenPopover(runtimeState, tokenElement, detail);

  return true;
}

function emitSentenceNoteActivated(
  runtimeState: RuntimeState,
  target: EventTarget | null
): boolean {
  const detail = readSentenceNoteMetadata(target);
  if (!detail) {
    return false;
  }

  openSentenceNotePopover(runtimeState, detail.note, detail);
  return true;
}
