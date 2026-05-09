import type { UserVocabEntry } from "@immersionkit/shared";
import { applyTokenStatusUpdate } from "./annotate";
import type {
  PhraseActivatedDetail,
  TokenActivatedDetail,
  TokenStatusUpdatedDetail
} from "./contracts";
import { IMMERSIONKIT_TOKEN_STATUS_EVENT } from "./contracts";
import { IMMERSIONKIT_TOKEN_ATTRIBUTE, IMMERSIONKIT_WORD_SELECTOR } from "./constants";
import {
  POPOVER_ACTION_ATTRIBUTE,
  POPOVER_SENTENCE_ACTION_ATTRIBUTE,
  closePopover,
  handlePopoverCloseClick,
  mountPopover,
  readInteractiveStatus,
  readSentencePopoverAction,
  renderPhrasePopover,
  renderSentencePopover,
  renderWordPopover,
  setActiveToken,
  syncSentencePopoverActions,
  type InteractiveVocabStatus
} from "./popover";
import type { SentenceNoteMetadata } from "./sentence-renderer";
import { persistVocabStatus } from "./storage";
import type { RuntimeState } from "./state";

export function openWordPopover(
  runtimeState: RuntimeState,
  tokenElement: HTMLElement,
  detail: TokenActivatedDetail
) {
  if (runtimeState.activeToken === tokenElement && runtimeState.popover) {
    closePopover(runtimeState);
    return;
  }

  closePopover(runtimeState);
  setActiveToken(runtimeState, tokenElement);

  const popover = renderWordPopover(detail);
  popover.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }

    if (handlePopoverCloseClick(runtimeState, event)) {
      return;
    }

    const actionButton = event.target.closest<HTMLButtonElement>(
      `[${POPOVER_ACTION_ATTRIBUTE}]`
    );
    if (!actionButton) {
      return;
    }

    const status = readInteractiveStatus(
      actionButton.getAttribute(POPOVER_ACTION_ATTRIBUTE)
    );
    if (!status) {
      return;
    }

    event.preventDefault();
    void handlePopoverStatusAction(runtimeState, detail, status);
  });

  mountPopover(runtimeState, popover, tokenElement);
}

export function openSentenceNotePopover(
  runtimeState: RuntimeState,
  noteElement: HTMLElement,
  detail: SentenceNoteMetadata
) {
  if (runtimeState.activeToken === noteElement && runtimeState.popover) {
    closePopover(runtimeState);
    return;
  }

  closePopover(runtimeState);
  setActiveToken(runtimeState, noteElement);
  const grammarFeatures =
    runtimeState.processing?.analysisCache.cachedGrammarFeaturesBySentenceHash.get(
      detail.sentenceHash
    ) ?? [];
  runtimeState.processing?.evidenceTracker.recordGrammarAssist(
    detail.sentenceHash,
    grammarFeatures
  );
  const stopGrammarDetailDwell =
    runtimeState.processing?.evidenceTracker.watchGrammarDetailDwell({
      anchor: noteElement,
      sentenceHash: detail.sentenceHash,
      features: grammarFeatures
    }) ?? (() => undefined);

  const popover = renderSentencePopover(noteElement, detail);
  popover.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }

    if (handlePopoverCloseClick(runtimeState, event)) {
      return;
    }

    const actionButton = event.target.closest<HTMLButtonElement>(
      `[${POPOVER_SENTENCE_ACTION_ATTRIBUTE}]`
    );
    if (!actionButton) {
      return;
    }

    const action = readSentencePopoverAction(
      actionButton.getAttribute(POPOVER_SENTENCE_ACTION_ATTRIBUTE)
    );
    if (!action) {
      return;
    }

    event.preventDefault();

    if (action === "show-translation") {
      noteElement.setAttribute("data-ik-source-visible", "false");
      syncSentencePopoverActions(popover, noteElement);
      return;
    }

    if (action === "toggle-source") {
      noteElement.setAttribute("data-ik-source-visible", "true");
      syncSentencePopoverActions(popover, noteElement);
      return;
    }

    if (action === "details") {
      popover.setAttribute("data-ik-details-active", "true");
      syncSentencePopoverActions(popover, noteElement);
      return;
    }

    closePopover(runtimeState);
  });

  mountPopover(runtimeState, popover, noteElement, stopGrammarDetailDwell);
}

export function openPhraseTokenPopover(
  runtimeState: RuntimeState,
  phraseElement: HTMLElement,
  detail: PhraseActivatedDetail
) {
  if (runtimeState.activeToken === phraseElement && runtimeState.popover) {
    closePopover(runtimeState);
    return;
  }

  closePopover(runtimeState);
  setActiveToken(runtimeState, phraseElement);

  const popover = renderPhrasePopover(detail);
  popover.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }

    handlePopoverCloseClick(runtimeState, event);
  });
  mountPopover(runtimeState, popover, phraseElement);
}

export function applyStatusToLexemeTokens(update: TokenStatusUpdatedDetail) {
  const tokens = document.querySelectorAll<HTMLElement>(IMMERSIONKIT_WORD_SELECTOR);
  let anyUpdated = false;

  for (const token of tokens) {
    if (token.getAttribute("data-ik-lexeme-id") !== update.lexemeId) {
      continue;
    }

    const tokenId = token.getAttribute(IMMERSIONKIT_TOKEN_ATTRIBUTE);
    if (!tokenId) {
      continue;
    }

    anyUpdated =
      applyTokenStatusUpdate({
        ...update,
        tokenId
      }) || anyUpdated;
  }

  if (anyUpdated) {
    return;
  }

  applyTokenStatusUpdate(update);
}

export function updateRuntimeVocabEntry(
  runtimeState: RuntimeState,
  update: TokenStatusUpdatedDetail
) {
  const processing = runtimeState.processing;
  if (!processing) {
    return;
  }

  const existingEntry = processing.vocabByLexemeId.get(update.lexemeId);
  processing.vocabByLexemeId.set(
    update.lexemeId,
    update.entry ?? createLocalVocabEntry(update, existingEntry)
  );
}

export function findTokenElement(tokenId: string): HTMLElement | null {
  const tokens = document.querySelectorAll<HTMLElement>(IMMERSIONKIT_WORD_SELECTOR);
  for (const token of tokens) {
    if (token.getAttribute(IMMERSIONKIT_TOKEN_ATTRIBUTE) === tokenId) {
      return token;
    }
  }

  return null;
}

async function handlePopoverStatusAction(
  runtimeState: RuntimeState,
  detail: TokenActivatedDetail,
  status: InteractiveVocabStatus
) {
  let persistedEntry: UserVocabEntry | null = null;

  try {
    persistedEntry = await persistVocabStatus({
      lexemeId: detail.lexemeId,
      status
    });
  } catch (error) {
    console.warn("ImmersionKit failed to persist vocab status update.", {
      error,
      lexemeId: detail.lexemeId,
      status
    });
  }

  const updateDetail: TokenStatusUpdatedDetail = {
    tokenId: detail.tokenId,
    lexemeId: detail.lexemeId,
    status,
    entry: persistedEntry ?? undefined
  };

  window.dispatchEvent(
    new CustomEvent<TokenStatusUpdatedDetail>(IMMERSIONKIT_TOKEN_STATUS_EVENT, {
      detail: updateDetail
    })
  );

  closePopover(runtimeState);
}

function createLocalVocabEntry(
  update: TokenStatusUpdatedDetail,
  existingEntry: UserVocabEntry | undefined
): UserVocabEntry {
  return {
    lexemeId: update.lexemeId,
    status: update.status,
    updatedAt: new Date().toISOString(),
    lastSeenAt: existingEntry?.lastSeenAt ?? null,
    exposureCount: existingEntry?.exposureCount ?? 0
  };
}
