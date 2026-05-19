import {
  RuntimeMessageType,
  resolveSentenceGrammarCards,
  type SentenceGrammarCard,
  type SpeakTextSurface,
  type UserVocabEntry
} from "@immersionkit/shared";
import { applyTokenStatusUpdate } from "./annotate";
import type {
  PhraseActivatedDetail,
  TokenActivatedDetail,
  TokenStatusUpdatedDetail
} from "./contracts";
import { IMMERSIONKIT_TOKEN_STATUS_EVENT } from "./contracts";
import { IMMERSIONKIT_TOKEN_ATTRIBUTE, IMMERSIONKIT_WORD_SELECTOR } from "./constants";
import {
  closePopover,
  mountPopover,
  renderPhrasePopover,
  renderSentencePopover,
  renderWordPopover,
  setActiveToken,
  syncSentencePopoverActions,
  type InteractiveVocabStatus
} from "./popover";
import type { SentenceNoteMetadata } from "./sentence-renderer";
import { persistVocabStatus } from "./storage";
import type { CachedGrammarFeature } from "./runtime-analysis";
import type { RuntimeState } from "./state";
import { sendRuntimeMessage } from "../runtime-client";

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

  const popover = renderWordPopover(detail, {
    onClose: () => closePopover(runtimeState),
    onStatusAction: (status) => {
      void handlePopoverStatusAction(runtimeState, detail, status);
    },
    onSpeak: (text) => {
      return speakPopoverText("word", text);
    }
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
  const grammarCards = resolveGrammarCardsForPopover(
    runtimeState,
    detail,
    grammarFeatures
  );
  const deliveredGrammarFeatures = filterDeliveredGrammarFeatures(
    grammarFeatures,
    grammarCards
  );
  runtimeState.processing?.evidenceTracker.recordGrammarAssist(
    detail.sentenceHash,
    deliveredGrammarFeatures
  );
  const stopGrammarDetailDwell =
    runtimeState.processing?.evidenceTracker.watchGrammarDetailDwell({
      anchor: noteElement,
      sentenceHash: detail.sentenceHash,
      features: deliveredGrammarFeatures
    }) ?? (() => undefined);

  let popover: HTMLDivElement;
  popover = renderSentencePopover(noteElement, {
    ...detail,
    grammarCards
  }, {
    onClose: () => closePopover(runtimeState),
    onAction: (action) => {
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
    },
    onSpeak: (text) => {
      return speakPopoverText("sentence", text);
    }
  });

  mountPopover(runtimeState, popover, noteElement, stopGrammarDetailDwell);
}

function resolveGrammarCardsForPopover(
  runtimeState: RuntimeState,
  detail: SentenceNoteMetadata,
  grammarFeatures: readonly CachedGrammarFeature[]
): SentenceGrammarCard[] {
  if (detail.grammarCards.length > 0) {
    return detail.grammarCards;
  }

  const processing = runtimeState.processing;
  if (!processing || grammarFeatures.length === 0) {
    return [];
  }

  return resolveSentenceGrammarCards({
    sentenceHash: detail.sentenceHash,
    features: grammarFeatures,
    config: processing.curriculum.config,
    profile: processing.curriculum.profile,
    learningItemsByUnitRefId: processing.learningItemsByUnitRefId,
    translatedText: detail.translatedText
  });
}

function filterDeliveredGrammarFeatures(
  grammarFeatures: readonly CachedGrammarFeature[],
  grammarCards: readonly SentenceGrammarCard[]
): CachedGrammarFeature[] {
  const deliveredFeatureKeys = new Set(
    grammarCards.map((card) => card.featureKey.trim()).filter(Boolean)
  );
  if (deliveredFeatureKeys.size === 0) {
    return [];
  }

  const deliveredFeatures = grammarFeatures.filter((feature) =>
    deliveredFeatureKeys.has(feature.featureKey)
  );
  if (deliveredFeatures.length > 0) {
    return deliveredFeatures;
  }

  return grammarCards.map((card) => ({
    featureId: `grammar:${card.featureKey}`,
    featureKey: card.featureKey,
    label: card.title,
    category: "other" as const,
    sourceText: card.sourceText,
    normalizedSourceText: card.sourceText.toLowerCase(),
    span: card.sourceSpan,
    confidence: card.confidence
  }));
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

  const popover = renderPhrasePopover(detail, {
    onClose: () => closePopover(runtimeState),
    onSpeak: (text) => {
      return speakPopoverText("phrase", text);
    }
  });
  mountPopover(runtimeState, popover, phraseElement);
}

async function speakPopoverText(
  surface: SpeakTextSurface,
  text: string
): Promise<void> {
  const trimmedText = text.trim();
  if (!trimmedText) {
    return;
  }

  const response = await sendRuntimeMessage({
    type: RuntimeMessageType.SpeakText,
    text: trimmedText,
    language: "es-ES",
    surface
  });
  if (!response?.ok) {
    throw new Error(response?.error ?? "tts-unavailable");
  }
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
