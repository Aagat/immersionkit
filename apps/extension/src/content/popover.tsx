import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import type {
  SentenceGrammarCard,
  SentenceLearningNote,
  VocabStatus
} from "@immersionkit/shared";
import {
  PhraseHelpPopoverContent,
  SentenceHelpPopoverContent,
  WordHelpPopoverContent
} from "@immersionkit/ui";
import uiStyles from "../../../../packages/ui/src/styles.css?inline";
import type {
  PhraseActivatedDetail,
  TokenActivatedDetail
} from "./contracts";
import type { SentenceNoteMetadata } from "./sentence-renderer";

export type ContentPopoverRuntimeState = {
  activeToken: HTMLElement | null;
  popover: HTMLDivElement | null;
  popoverCleanup: (() => void) | null;
};

export type InteractiveVocabStatus = Exclude<VocabStatus, "new">;
export type SentencePopoverAction =
  | "show-translation"
  | "toggle-source"
  | "details"
  | "close";

type PopoverPlacement = "right" | "left" | "top" | "bottom";
type PopoverAnchorRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};
type PopoverViewportMonitor = ((event?: Event) => void) & {
  cancel: () => void;
};
type TopLayerPopoverElement = HTMLDivElement & {
  showPopover?: () => void;
  hidePopover?: () => void;
};
type ReactPopoverHost = HTMLDivElement & {
  __ikUnmountReact?: () => void;
};

const POPOVER_ATTRIBUTE = "data-ik-popover";
const POPOVER_ACTION_ATTRIBUTE = "data-ik-status-action";
const POPOVER_SENTENCE_ACTION_ATTRIBUTE = "data-ik-sentence-action";
export const POPOVER_SPEAK_ACTION_ATTRIBUTE = "data-ik-speak-action";
const POPOVER_VIEWPORT_MARGIN = 10;
const POPOVER_ANCHOR_OFFSET = 12;
const STATUS_BUTTONS: readonly {
  status: InteractiveVocabStatus;
  label: string;
}[] = [
  { status: "learning", label: "Practicing" },
  { status: "known", label: "Comfortable" }
] as const;
const TRANSLATION_UNAVAILABLE_TEXT = "Translation not available.";

const CONTENT_POPOVER_STYLES = `
  :host {
    --font-mono: "JetBrains Mono Variable", "JetBrains Mono", ui-monospace,
      SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New",
      monospace;
    --font-heading: var(--font-mono);
    box-sizing: border-box;
    display: block;
    width: clamp(232px, 24vw, 308px);
    max-width: calc(100vw - 20px);
    max-height: min(78vh, calc(100vh - 20px), 500px);
    margin: 0;
    border: 0;
    padding: 0;
    background: transparent;
    color: inherit;
    font-family: var(--font-mono);
    outline: none;
    z-index: 2147483647;
  }

  :host *,
  :host ::slotted(*) {
    font-family: var(--font-mono);
  }

  :host([data-ik-popover-kind="sentence"]) {
    width: clamp(280px, 34vw, 430px);
    max-height: min(78vh, calc(100vh - 20px), 560px);
  }

  .ik-content-popover-card {
    max-height: inherit;
    overflow: auto;
    overscroll-behavior: contain;
  }

  :host(:not([data-ik-popover-kind="sentence"])) .ik-content-popover-card {
    overflow: visible;
  }

  @media (max-height: 620px), (max-width: 760px) {
    :host {
      width: clamp(220px, 32vw, 292px);
      max-height: calc(100vh - 20px);
    }

    :host([data-ik-popover-kind="sentence"]) {
      width: clamp(260px, 42vw, 390px);
    }

    .ik-content-popover-card {
      gap: 0.5rem;
      padding: 0.625rem;
    }
  }

  .ik-popover-light-dom-mirror-slot {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    border: 0;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }
`;

export function renderWordPopover(
  detail: TokenActivatedDetail,
  callbacks: {
    onClose: () => void;
    onStatusAction: (status: InteractiveVocabStatus) => void;
    onSpeak?: (text: string) => void | Promise<void>;
  }
): HTMLDivElement {
  const nativeExample = readNonEmptyString(detail.exampleSentenceNative);
  const englishExample = readNonEmptyString(detail.exampleSentenceEnglish);
  const pageSentence = readNonEmptyString(detail.sentence);

  return createReactPopover(
    "word",
    <WordHelpPopoverContent
      sourceText={detail.sourceToken}
      targetText={detail.targetToken}
      status={detail.status}
      rationale={
        readNonEmptyString(detail.curriculumReason) ??
        "Opening this helps ImmersionKit adapt."
      }
      nativeExample={nativeExample}
      englishExample={englishExample}
      pageSentence={pageSentence}
      onClose={callbacks.onClose}
      onStatusAction={callbacks.onStatusAction}
      onSpeak={callbacks.onSpeak}
    />,
    {
      textMirror: [
        detail.sourceToken,
        detail.targetToken,
        nativeExample,
        englishExample ?? pageSentence,
        readNonEmptyString(detail.curriculumReason) ??
          "Opening this helps ImmersionKit adapt.",
        "Still new",
        "Practicing",
        "Comfortable",
        "Hide word",
        "ImmersionKit"
      ],
      statusActions: [
        ...STATUS_BUTTONS.map((action) => ({
          ...action,
          pressed: action.status === detail.status,
          onClick: () => callbacks.onStatusAction(action.status)
        })),
        {
          status: "ignored" as const,
          label: "Hide word",
          pressed: detail.status === "ignored",
          onClick: () => callbacks.onStatusAction("ignored")
        }
      ],
      speakAction: callbacks.onSpeak
        ? {
            label: "Play pronunciation",
            onClick: () => callbacks.onSpeak?.(detail.targetToken)
          }
        : undefined
    }
  );
}

export function renderSentencePopover(
  noteElement: HTMLElement,
  detail: SentenceNoteMetadata,
  callbacks: {
    onClose: () => void;
    onAction: (action: SentencePopoverAction) => void;
    onSpeak?: (text: string) => void | Promise<void>;
  }
): HTMLDivElement {
  return createReactPopover(
    "sentence",
    <SentenceHelpPopoverContent
      sourceText={detail.sourceText}
      translatedText={detail.translatedText}
      learningNote={detail.learningNote}
      grammarCards={detail.grammarCards}
      initialSourceVisible={
        noteElement.getAttribute("data-ik-source-visible") === "true"
      }
      onClose={callbacks.onClose}
      onAction={callbacks.onAction}
      onSpeak={callbacks.onSpeak}
    />,
    {
      textMirror: [
        "Sentence help",
        "optional",
        "Uses OpenAI only when enabled.",
        "Original",
        detail.sourceText,
        "Translation",
        detail.translatedText,
        ...detail.grammarCards.flatMap((card) => [
          card.title,
          card.sourceText,
          card.sourcePatternLabel,
          card.targetPatternLabel,
          card.explanation,
          card.exampleMapping,
          card.curriculumReason
        ]),
        "Why this helps",
        sentenceHelpDetail(detail.learningNote),
        "Details",
        "Close help",
        "ImmersionKit"
      ],
      sentenceActions: [
        {
          action: "show-translation",
          label: "Translation",
          pressed: noteElement.getAttribute("data-ik-source-visible") !== "true",
          onClick: () => callbacks.onAction("show-translation")
        },
        {
          action: "toggle-source",
          label: "Original",
          pressed: noteElement.getAttribute("data-ik-source-visible") === "true",
          onClick: () => callbacks.onAction("toggle-source")
        },
        {
          action: "details",
          label: "Details",
          pressed: false,
          onClick: () => callbacks.onAction("details")
        }
      ],
      grammarCards: detail.grammarCards,
      speakAction: callbacks.onSpeak
        ? {
            label: "Play pronunciation",
            onClick: () => callbacks.onSpeak?.(detail.translatedText)
          }
        : undefined
    }
  );
}

export function renderPhrasePopover(
  detail: PhraseActivatedDetail,
  callbacks: {
    onClose: () => void;
    onSpeak?: (text: string) => void | Promise<void>;
  }
): HTMLDivElement {
  return createReactPopover(
    "phrase",
    <PhraseHelpPopoverContent
      sourceText={detail.sourceText}
      targetText={detail.targetText}
      rationale={
        readNonEmptyString(detail.curriculumReason) ??
        "You may see this again when it fits the page."
      }
      sentence={readNonEmptyString(detail.sentence)}
      onClose={callbacks.onClose}
      onSpeak={callbacks.onSpeak}
    />,
    {
      textMirror: [
        detail.sourceText,
        detail.targetText,
        TRANSLATION_UNAVAILABLE_TEXT,
        readNonEmptyString(detail.sentence),
        readNonEmptyString(detail.curriculumReason) ??
          "You may see this again when it fits the page.",
        "Close help",
        "ImmersionKit"
      ],
      speakAction: callbacks.onSpeak
        ? {
            label: "Play pronunciation",
            onClick: () => callbacks.onSpeak?.(detail.targetText)
          }
        : undefined
    }
  );
}

export function mountPopover(
  runtimeState: ContentPopoverRuntimeState,
  popover: HTMLDivElement,
  anchorElement: HTMLElement,
  extraCleanup?: () => void
) {
  document.body.append(popover);
  showPopoverInTopLayer(popover);

  const monitorPopover = createPopoverViewportMonitor(
    runtimeState,
    popover,
    anchorElement
  );

  runtimeState.popover = popover;
  runtimeState.popoverCleanup = () => {
    monitorPopover.cancel();
    window.removeEventListener("scroll", monitorPopover, true);
    window.removeEventListener("resize", monitorPopover);
    extraCleanup?.();
    (popover as ReactPopoverHost).__ikUnmountReact?.();
    hidePopoverFromTopLayer(popover);
  };

  if (!positionPopover(popover, anchorElement)) {
    closePopover(runtimeState);
    return;
  }

  window.addEventListener("scroll", monitorPopover, true);
  window.addEventListener("resize", monitorPopover);
}

export function closePopover(runtimeState: ContentPopoverRuntimeState) {
  if (runtimeState.popoverCleanup) {
    runtimeState.popoverCleanup();
  }

  runtimeState.popoverCleanup = null;
  runtimeState.popover?.remove();
  runtimeState.popover = null;
  clearActiveToken(runtimeState);
}

export function setActiveToken(
  runtimeState: ContentPopoverRuntimeState,
  token: HTMLElement
) {
  clearActiveToken(runtimeState);
  runtimeState.activeToken = token;
  token.setAttribute("data-ik-active", "true");
}

export function syncSentencePopoverActions(
  popover: HTMLElement,
  noteElement: HTMLElement
) {
  const sourceVisible = noteElement.getAttribute("data-ik-source-visible") === "true";
  for (const translationButton of queryPopoverButtons(
    popover,
    `[${POPOVER_SENTENCE_ACTION_ATTRIBUTE}="show-translation"]`
  )) {
    translationButton.setAttribute("aria-pressed", sourceVisible ? "false" : "true");
  }

  for (const toggleButton of queryPopoverButtons(
    popover,
    `[${POPOVER_SENTENCE_ACTION_ATTRIBUTE}="toggle-source"]`
  )) {
    toggleButton.setAttribute("aria-pressed", sourceVisible ? "true" : "false");
  }

  for (const detailsButton of queryPopoverButtons(
    popover,
    `[${POPOVER_SENTENCE_ACTION_ATTRIBUTE}="details"]`
  )) {
    const detailsActive = popover.getAttribute("data-ik-details-active") === "true";
    detailsButton.setAttribute("aria-pressed", detailsActive ? "true" : "false");
  }
}

export function isWithinPopover(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  if (target.closest(`[${POPOVER_ATTRIBUTE}]`)) {
    return true;
  }

  const root = target.getRootNode();
  const ShadowRootConstructor = globalThis.ShadowRoot;
  return typeof ShadowRootConstructor !== "undefined" &&
    root instanceof ShadowRootConstructor &&
    root.host instanceof Element
    ? Boolean(root.host.closest(`[${POPOVER_ATTRIBUTE}]`))
    : false;
}

function sentenceHelpDetail(note: SentenceLearningNote): string {
  return (
    readNonEmptyString(note.grammarFocus) ??
    readNonEmptyString(note.summary) ??
    readNonEmptyString(note.canonicalUsage) ??
    readNonEmptyString(note.keyPhrase) ??
    "This sentence note gives selected context for the sentence you opened."
  );
}

function createPopoverViewportMonitor(
  runtimeState: ContentPopoverRuntimeState,
  popover: HTMLDivElement,
  anchorElement: HTMLElement
): PopoverViewportMonitor {
  let frameId: number | null = null;

  const monitorPopover = (() => {
    if (frameId !== null) {
      return;
    }

    frameId = window.requestAnimationFrame(() => {
      frameId = null;
      if (runtimeState.popover !== popover || !popover.isConnected) {
        return;
      }

      if (!anchorElement.isConnected || !positionPopover(popover, anchorElement)) {
        closePopover(runtimeState);
      }
    });
  }) as PopoverViewportMonitor;

  monitorPopover.cancel = () => {
    if (frameId === null) {
      return;
    }

    window.cancelAnimationFrame(frameId);
    frameId = null;
  };

  return monitorPopover;
}

function positionPopover(
  popover: HTMLDivElement,
  anchorElement: HTMLElement
): boolean {
  const viewportWidth = Math.max(
    window.innerWidth,
    document.documentElement.clientWidth
  );
  const viewportHeight = Math.max(
    window.innerHeight,
    document.documentElement.clientHeight
  );
  const maxLeft = viewportWidth - POPOVER_VIEWPORT_MARGIN;
  const maxTop = viewportHeight - POPOVER_VIEWPORT_MARGIN;
  const anchorRect = getPopoverAnchorRect(anchorElement);

  if (
    !anchorRect ||
    !isAnchorVisibleInViewport(anchorRect, viewportWidth, viewportHeight)
  ) {
    return false;
  }

  const popoverRect = popover.getBoundingClientRect();
  const popoverWidth = Math.ceil(popoverRect.width || popover.offsetWidth || 280);
  const popoverHeight = Math.ceil(popoverRect.height || popover.offsetHeight || 160);

  if (
    popoverWidth > viewportWidth - POPOVER_VIEWPORT_MARGIN * 2 ||
    popoverHeight > viewportHeight - POPOVER_VIEWPORT_MARGIN * 2
  ) {
    return false;
  }

  const anchorMiddleX = anchorRect.left + anchorRect.width / 2;
  const anchorMiddleY = anchorRect.top + anchorRect.height / 2;
  const candidates: Array<{
    placement: PopoverPlacement;
    left: number;
    top: number;
  }> = [
    {
      placement: "right",
      left: anchorRect.right + POPOVER_ANCHOR_OFFSET,
      top: anchorMiddleY - popoverHeight / 2
    },
    {
      placement: "left",
      left: anchorRect.left - POPOVER_ANCHOR_OFFSET - popoverWidth,
      top: anchorMiddleY - popoverHeight / 2
    },
    {
      placement: "bottom",
      left: anchorMiddleX - popoverWidth / 2,
      top: anchorRect.bottom + POPOVER_ANCHOR_OFFSET
    },
    {
      placement: "top",
      left: anchorMiddleX - popoverWidth / 2,
      top: anchorRect.top - POPOVER_ANCHOR_OFFSET - popoverHeight
    }
  ];

  for (const candidate of candidates) {
    const left = clamp(
      candidate.left,
      POPOVER_VIEWPORT_MARGIN,
      maxLeft - popoverWidth
    );
    const top = clamp(
      candidate.top,
      POPOVER_VIEWPORT_MARGIN,
      maxTop - popoverHeight
    );

    if (
      left < POPOVER_VIEWPORT_MARGIN ||
      top < POPOVER_VIEWPORT_MARGIN ||
      left + popoverWidth > maxLeft ||
      top + popoverHeight > maxTop
    ) {
      continue;
    }

    popover.style.position = "fixed";
    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
    popover.setAttribute("data-ik-placement", candidate.placement);
    return true;
  }

  return false;
}

function getPopoverAnchorRect(anchorElement: HTMLElement): PopoverAnchorRect | null {
  const clientRect = getBestVisibleClientRect(anchorElement);
  if (clientRect) {
    return clientRect;
  }

  const rect = anchorElement.getBoundingClientRect();
  const hasLayoutRect =
    rect.width > 0 ||
    rect.height > 0 ||
    rect.left !== 0 ||
    rect.top !== 0 ||
    rect.right !== 0 ||
    rect.bottom !== 0;

  if (hasLayoutRect) {
    return rect;
  }

  const style = window.getComputedStyle(anchorElement);
  if (style.display === "none" || style.visibility === "hidden") {
    return null;
  }

  return {
    left: POPOVER_VIEWPORT_MARGIN,
    top: POPOVER_VIEWPORT_MARGIN,
    right: POPOVER_VIEWPORT_MARGIN,
    bottom: POPOVER_VIEWPORT_MARGIN,
    width: 0,
    height: 0
  };
}

function getBestVisibleClientRect(element: HTMLElement): PopoverAnchorRect | null {
  const viewportWidth = Math.max(
    window.innerWidth,
    document.documentElement.clientWidth
  );
  const viewportHeight = Math.max(
    window.innerHeight,
    document.documentElement.clientHeight
  );
  const visibleRects = Array.from(element.getClientRects())
    .filter((rect) => hasUsableRect(rect))
    .map((rect) => toPopoverAnchorRect(rect))
    .filter((rect) => isAnchorVisibleInViewport(rect, viewportWidth, viewportHeight));

  if (visibleRects.length === 0) {
    return null;
  }

  return visibleRects.reduce((best, rect) =>
    getVisibleRectArea(rect, viewportWidth, viewportHeight) >
    getVisibleRectArea(best, viewportWidth, viewportHeight)
      ? rect
      : best
  );
}

function hasUsableRect(rect: DOMRect): boolean {
  return rect.width > 0 && rect.height > 0;
}

function toPopoverAnchorRect(rect: DOMRect): PopoverAnchorRect {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height
  };
}

function getVisibleRectArea(
  rect: PopoverAnchorRect,
  viewportWidth: number,
  viewportHeight: number
): number {
  const visibleWidth = Math.max(
    0,
    Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0)
  );
  const visibleHeight = Math.max(
    0,
    Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0)
  );
  return visibleWidth * visibleHeight;
}

function isAnchorVisibleInViewport(
  rect: PopoverAnchorRect,
  viewportWidth: number,
  viewportHeight: number
): boolean {
  return (
    rect.right >= 0 &&
    rect.bottom >= 0 &&
    rect.left <= viewportWidth &&
    rect.top <= viewportHeight
  );
}

function showPopoverInTopLayer(popover: HTMLDivElement) {
  const topLayerPopover = popover as TopLayerPopoverElement;
  if (typeof topLayerPopover.showPopover !== "function") {
    return;
  }

  try {
    topLayerPopover.showPopover();
    popover.setAttribute("data-ik-top-layer", "true");
  } catch {
    popover.removeAttribute("popover");
  }
}

function hidePopoverFromTopLayer(popover: HTMLDivElement) {
  const topLayerPopover = popover as TopLayerPopoverElement;
  if (typeof topLayerPopover.hidePopover !== "function") {
    return;
  }

  try {
    topLayerPopover.hidePopover();
  } catch {
    // The popover may already have been removed by the page or browser.
  }
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function clearActiveToken(runtimeState: ContentPopoverRuntimeState) {
  if (!runtimeState.activeToken) {
    return;
  }

  runtimeState.activeToken.removeAttribute("data-ik-active");
  runtimeState.activeToken = null;
}

function createReactPopover(
  kind: "word" | "phrase" | "sentence",
  children: ReactNode,
  options: {
    textMirror?: readonly (string | null | undefined)[];
    grammarCards?: readonly SentenceGrammarCard[];
    statusActions?: readonly {
      status: InteractiveVocabStatus;
      label: string;
      pressed?: boolean;
      onClick: () => void;
    }[];
    sentenceActions?: readonly {
      action: SentencePopoverAction;
      label: string;
      pressed?: boolean;
      onClick: () => void;
    }[];
    speakAction?: {
      label: string;
      onClick: () => void;
    };
  } = {}
): HTMLDivElement {
  const popover = document.createElement("div") as ReactPopoverHost;
  popover.className = "ik-content-popover-host";
  popover.setAttribute(POPOVER_ATTRIBUTE, "true");
  popover.setAttribute("data-ik-popover-kind", kind);
  popover.setAttribute("data-immersionkit-ignore", "true");
  popover.setAttribute("popover", "manual");
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-live", "polite");
  appendLightDomMirror(popover, options);

  const shadowRoot = popover.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `${shadowSafeUiStyles()}\n${CONTENT_POPOVER_STYLES}`;
  shadowRoot.append(style);

  const mirrorSlot = document.createElement("slot");
  mirrorSlot.name = "ik-popover-text-mirror";
  mirrorSlot.className = "ik-popover-light-dom-mirror-slot";
  shadowRoot.append(mirrorSlot);

  const mount = document.createElement("div");
  shadowRoot.append(mount);
  const root: Root = createRoot(mount);
  flushSync(() => {
    root.render(children);
  });
  popover.__ikUnmountReact = () => root.unmount();
  return popover;
}

function appendLightDomMirror(
  popover: HTMLElement,
  options: {
    textMirror?: readonly (string | null | undefined)[];
    grammarCards?: readonly SentenceGrammarCard[];
    statusActions?: readonly {
      status: InteractiveVocabStatus;
      label: string;
      pressed?: boolean;
      onClick: () => void;
    }[];
    sentenceActions?: readonly {
      action: SentencePopoverAction;
      label: string;
      pressed?: boolean;
      onClick: () => void;
    }[];
    speakAction?: {
      label: string;
      onClick: () => void;
    };
  }
) {
  const mirrorText = (options.textMirror ?? [])
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ");
  if (mirrorText) {
    const mirror = document.createElement("span");
    mirror.slot = "ik-popover-text-mirror";
    mirror.hidden = true;
    mirror.setAttribute("aria-hidden", "true");
    mirror.textContent = mirrorText;
    popover.append(mirror);
  }

  for (const card of options.grammarCards ?? []) {
    const grammarMirror = document.createElement("div");
    grammarMirror.hidden = true;
    grammarMirror.setAttribute("data-ik-grammar-card", "true");
    grammarMirror.setAttribute("data-ik-grammar-feature-key", card.featureKey);
    grammarMirror.setAttribute("data-ik-grammar-status", card.curriculumStatus);
    grammarMirror.textContent = [
      card.title,
      card.sourceText,
      card.sourcePatternLabel,
      card.targetPatternLabel,
      card.explanation,
      card.exampleMapping,
      card.curriculumReason
    ]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .join(" ");
    popover.append(grammarMirror);
  }

  for (const action of options.statusActions ?? []) {
    const button = createProxyButton(action.label, action.onClick);
    button.setAttribute(POPOVER_ACTION_ATTRIBUTE, action.status);
    button.setAttribute("aria-pressed", action.pressed ? "true" : "false");
    popover.append(button);
  }

  for (const action of options.sentenceActions ?? []) {
    const button = createProxyButton(action.label, action.onClick);
    button.setAttribute(POPOVER_SENTENCE_ACTION_ATTRIBUTE, action.action);
    button.setAttribute("aria-pressed", action.pressed ? "true" : "false");
    popover.append(button);
  }

  if (options.speakAction) {
    const button = createProxyButton(
      options.speakAction.label,
      options.speakAction.onClick
    );
    button.setAttribute(POPOVER_SPEAK_ACTION_ATTRIBUTE, "true");
    popover.append(button);
  }
}

function createProxyButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.hidden = true;
  button.textContent = label;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    onClick();
  });
  return button;
}

function shadowSafeUiStyles(): string {
  return stripFontFaceRules(uiStyles)
    .replace(/:root\s*\{/g, ":host {")
    .replace(/\.dark\s*\{/g, ":host(.dark) {")
    .replace(/body\s*\{/g, ":host {")
    .replace(/html\s*\{/g, ":host {");
}

function stripFontFaceRules(styles: string): string {
  return styles.replace(/@font-face\s*\{[^}]*\}/g, "");
}

function queryPopoverButtons(
  popover: HTMLElement,
  selector: string
): HTMLButtonElement[] {
  const roots: ParentNode[] = [popover];
  if (popover.shadowRoot) {
    roots.push(popover.shadowRoot);
  }
  return roots.flatMap((root) => [...root.querySelectorAll<HTMLButtonElement>(selector)]);
}

function readNonEmptyString(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
