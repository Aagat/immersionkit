import type {
  SentenceLearningNote,
  VocabStatus
} from "@immersionkit/shared";
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

type PopoverIconName =
  | "book"
  | "check"
  | "chevron"
  | "close"
  | "document"
  | "eyeOff"
  | "info"
  | "link"
  | "lock"
  | "message"
  | "spark"
  | "translate"
  | "volume";
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

const POPOVER_ATTRIBUTE = "data-ik-popover";
export const POPOVER_ACTION_ATTRIBUTE = "data-ik-status-action";
export const POPOVER_SENTENCE_ACTION_ATTRIBUTE = "data-ik-sentence-action";
const POPOVER_CLOSE_ATTRIBUTE = "data-ik-popover-close";
const POPOVER_VIEWPORT_MARGIN = 10;
const POPOVER_ANCHOR_OFFSET = 12;
const STATUS_BUTTONS: readonly {
  status: InteractiveVocabStatus;
  label: string;
}[] = [
  { status: "learning", label: "Practicing" },
  { status: "known", label: "Comfortable" }
] as const;

export function handlePopoverCloseClick(
  runtimeState: ContentPopoverRuntimeState,
  event: MouseEvent
): boolean {
  if (!(event.target instanceof Element)) {
    return false;
  }

  if (!event.target.closest(`[${POPOVER_CLOSE_ATTRIBUTE}]`)) {
    return false;
  }

  event.preventDefault();
  closePopover(runtimeState);
  return true;
}

export function renderWordPopover(detail: TokenActivatedDetail): HTMLDivElement {
  const popover = createUiPopover("word");
  popover.append(
    createPopoverHeading({
      title: detail.targetToken,
      badge: wordStatusLabel(detail.status),
      icon: "volume"
    })
  );

  const pair = document.createElement("div");
  pair.className = "ik-ui-token-pair";
  pair.append(createTokenBox(detail.sourceToken));
  pair.append(createTokenArrow());
  pair.append(createTokenBox(detail.targetToken));
  popover.append(pair);

  const nativeExample = readNonEmptyString(detail.exampleSentenceNative);
  const englishExample = readNonEmptyString(detail.exampleSentenceEnglish);
  const pageSentence = readNonEmptyString(detail.sentence);

  if (nativeExample) {
    const sentence = document.createElement("div");
    sentence.className = "ik-ui-example-line";
    sentence.append(createSvgIcon("message"));
    const text = document.createElement("span");
    text.textContent = nativeExample;
    sentence.append(text);
    popover.append(sentence);
  }

  if (englishExample) {
    const sentence = document.createElement("p");
    sentence.className = nativeExample ? "ik-content-popover-muted" : "";
    sentence.textContent = englishExample;
    popover.append(sentence);
  } else if (pageSentence) {
    const sentence = document.createElement("p");
    sentence.textContent = pageSentence;
    popover.append(sentence);
  }

  const info = document.createElement("div");
  info.className = "ik-ui-info-line";
  info.append(createSvgIcon("info"));
  const infoText = document.createElement("span");
  infoText.textContent = "Opening this helps ImmersionKit adapt.";
  info.append(infoText);
  popover.append(info);

  const actions = document.createElement("div");
  actions.className = "ik-ui-quiet-actions";

  const stillNew = document.createElement("button");
  stillNew.type = "button";
  stillNew.className = "ik-ui-button ik-ui-button--secondary ik-ui-button--sm";
  stillNew.textContent = "Still new";
  stillNew.disabled = detail.status === "new";
  actions.append(stillNew);

  for (const action of STATUS_BUTTONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ik-ui-button ik-ui-button--secondary ik-ui-button--sm";
    button.setAttribute(POPOVER_ACTION_ATTRIBUTE, action.status);
    button.setAttribute(
      "aria-pressed",
      action.status === detail.status ? "true" : "false"
    );
    button.textContent = action.label;

    if (action.status === detail.status) {
      button.classList.add("is-active");
    }

    actions.append(button);
  }

  popover.append(actions);
  popover.append(createWordPopoverFooter());
  return popover;
}

export function renderSentencePopover(
  noteElement: HTMLElement,
  detail: SentenceNoteMetadata
): HTMLDivElement {
  const popover = createUiPopover("sentence");
  popover.append(
    createPopoverHeading({
      title: "Sentence help",
      badge: "optional",
      icon: "book"
    })
  );

  const summary = document.createElement("p");
  summary.textContent = "Uses OpenAI only when enabled.";
  popover.append(summary);

  popover.append(createSentenceBlock("Original", [detail.sourceText]));
  popover.append(createSentenceBlock("Translation", [detail.translatedText]));
  popover.append(
    createSentenceBlock("Why this helps", [
      sentenceHelpDetail(detail.learningNote)
    ])
  );

  const actions = document.createElement("div");
  actions.className = "ik-ui-sentence-actions";
  actions.append(createSentencePopoverActionButton("show-translation"));
  actions.append(createSentencePopoverActionButton("toggle-source"));
  actions.append(createSentencePopoverActionButton("details"));
  popover.append(actions);
  popover.append(createLocalFooter("Selected sentence only"));

  syncSentencePopoverActions(popover, noteElement);

  return popover;
}

export function renderPhrasePopover(detail: PhraseActivatedDetail): HTMLDivElement {
  const popover = createUiPopover("phrase");
  popover.append(
    createPopoverHeading({
      title: detail.targetText,
      badge: "phrase",
      icon: "link"
    })
  );

  const pair = document.createElement("div");
  pair.className = "ik-ui-token-pair";
  pair.append(createTokenBox(detail.sourceText));
  pair.append(createTokenArrow());
  pair.append(createTokenBox(detail.targetText));
  popover.append(pair);

  const help = document.createElement("p");
  help.textContent =
    "A reusable phrase you may see again when it fits the page.";
  popover.append(help);

  popover.append(createRule());

  const pageSentence = readNonEmptyString(detail.sentence);
  if (pageSentence) {
    const heading = document.createElement("h4");
    heading.append(createSvgIcon("spark"));
    heading.append("Example");
    popover.append(heading);

    const sentence = document.createElement("p");
    sentence.textContent = pageSentence;
    popover.append(sentence);
  }

  const info = document.createElement("div");
  info.className = "ik-ui-info-line";
  info.append(createSvgIcon("info"));
  const infoText = document.createElement("span");
  infoText.textContent = "You may see this again when it fits the page.";
  info.append(infoText);
  popover.append(info);

  const footer = document.createElement("footer");
  footer.className = "ik-ui-popover-actions";
  const hidePhrase = document.createElement("button");
  hidePhrase.type = "button";
  hidePhrase.className = "ik-ui-popover-link";
  hidePhrase.setAttribute(POPOVER_CLOSE_ATTRIBUTE, "true");
  hidePhrase.textContent = "Hide phrase";
  footer.append(hidePhrase);

  const gotIt = document.createElement("button");
  gotIt.type = "button";
  gotIt.className = "ik-ui-button ik-ui-button--secondary ik-ui-button--sm";
  gotIt.setAttribute(POPOVER_CLOSE_ATTRIBUTE, "true");
  gotIt.textContent = "Got it";
  footer.append(gotIt);
  popover.append(footer);

  return popover;
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

export function readInteractiveStatus(
  value: string | null
): InteractiveVocabStatus | null {
  if (value === "known" || value === "learning" || value === "ignored") {
    return value;
  }

  return null;
}

export function syncSentencePopoverActions(
  popover: HTMLElement,
  noteElement: HTMLElement
) {
  const sourceVisible = noteElement.getAttribute("data-ik-source-visible") === "true";
  const translationButton = popover.querySelector<HTMLButtonElement>(
    `[${POPOVER_SENTENCE_ACTION_ATTRIBUTE}="show-translation"]`
  );
  if (translationButton) {
    translationButton.setAttribute("aria-pressed", sourceVisible ? "false" : "true");
    translationButton.classList.toggle("is-active", !sourceVisible);
  }

  const toggleButton = popover.querySelector<HTMLButtonElement>(
    `[${POPOVER_SENTENCE_ACTION_ATTRIBUTE}="toggle-source"]`
  );
  if (toggleButton) {
    toggleButton.setAttribute("aria-pressed", sourceVisible ? "true" : "false");
    toggleButton.classList.toggle("is-active", sourceVisible);
  }

  const detailsButton = popover.querySelector<HTMLButtonElement>(
    `[${POPOVER_SENTENCE_ACTION_ATTRIBUTE}="details"]`
  );
  if (detailsButton) {
    const detailsActive = popover.getAttribute("data-ik-details-active") === "true";
    detailsButton.setAttribute("aria-pressed", detailsActive ? "true" : "false");
    detailsButton.classList.toggle("is-active", detailsActive);
  }

  const closeButton = popover.querySelector<HTMLButtonElement>(
    `[${POPOVER_SENTENCE_ACTION_ATTRIBUTE}="close"]`
  );
  if (closeButton) {
    closeButton.textContent = "Close";
    closeButton.removeAttribute("aria-pressed");
  }
}

export function readSentencePopoverAction(
  value: string | null
): SentencePopoverAction | null {
  if (
    value === "show-translation" ||
    value === "toggle-source" ||
    value === "details" ||
    value === "close"
  ) {
    return value;
  }

  return null;
}

export function isWithinPopover(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(`[${POPOVER_ATTRIBUTE}]`));
}

function createSentenceBlock(labelText: string, lines: string[]): HTMLDivElement {
  const block = document.createElement("div");
  block.className = "ik-ui-sentence-block";

  const label = document.createElement("p");
  label.textContent = labelText;
  block.append(label);

  for (const line of lines) {
    const text = document.createElement("span");
    text.textContent = line;
    block.append(text);
  }

  return block;
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

function createRule(): HTMLDivElement {
  const rule = document.createElement("div");
  rule.className = "ik-ui-popover-rule";
  return rule;
}

function createLocalFooter(text: string): HTMLElement {
  const footer = document.createElement("footer");
  footer.className = "ik-ui-local-footer ik-ui-local-footer--compact";
  footer.append(createSvgIcon("lock"));
  const copy = document.createElement("span");
  copy.textContent = text;
  footer.append(copy);
  return footer;
}

function createWordPopoverFooter(): HTMLElement {
  const footer = document.createElement("footer");
  footer.className = "ik-ui-popover-footer";

  const hide = document.createElement("button");
  hide.type = "button";
  hide.className = "ik-ui-popover-link";
  hide.setAttribute(POPOVER_ACTION_ATTRIBUTE, "ignored");
  hide.append(createSvgIcon("eyeOff"));
  hide.append("Hide word");
  footer.append(hide);

  const brand = document.createElement("span");
  brand.append(createMiniLogo());
  brand.append("ImmersionKit");
  footer.append(brand);

  return footer;
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
    const left =
      candidate.placement === "top" || candidate.placement === "bottom"
        ? clamp(
            candidate.left,
            POPOVER_VIEWPORT_MARGIN,
            maxLeft - popoverWidth
          )
        : candidate.left;
    const top =
      candidate.placement === "left" || candidate.placement === "right"
        ? clamp(
            candidate.top,
            POPOVER_VIEWPORT_MARGIN,
            maxTop - popoverHeight
          )
        : candidate.top;

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

function createUiPopover(kind: "word" | "phrase" | "sentence"): HTMLDivElement {
  const popover = document.createElement("div");
  popover.className = "ik-ui-popover ik-content-popover";
  popover.setAttribute(POPOVER_ATTRIBUTE, "true");
  popover.setAttribute("data-ik-popover-kind", kind);
  popover.setAttribute("data-immersionkit-ignore", "true");
  popover.setAttribute("popover", "manual");
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-live", "polite");
  if (kind !== "sentence") {
    const arrow = document.createElement("span");
    arrow.className = "ik-ui-popover-arrow";
    popover.append(arrow);
  }
  return popover;
}

function createPopoverHeading(input: {
  title: string;
  badge: string;
  icon: PopoverIconName;
}): HTMLElement {
  const heading = document.createElement("header");
  heading.className = "ik-ui-popover-heading";
  heading.append(createSvgIcon(input.icon));

  const headingText = document.createElement("h3");
  headingText.textContent = input.title;
  heading.append(headingText);

  const badgeElement = document.createElement("span");
  badgeElement.className = "ik-ui-badge ik-ui-badge--accent";
  badgeElement.textContent = input.badge;
  heading.append(badgeElement);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "ik-ui-popover-close";
  closeButton.setAttribute("aria-label", "Close help");
  closeButton.setAttribute(POPOVER_CLOSE_ATTRIBUTE, "true");
  closeButton.append(createSvgIcon("close"));
  heading.append(closeButton);

  return heading;
}

function createTokenBox(text: string): HTMLSpanElement {
  const element = document.createElement("span");
  element.textContent = text;
  return element;
}

function createTokenArrow(): HTMLSpanElement {
  const element = document.createElement("span");
  element.textContent = "→";
  return element;
}

function createMiniLogo(): HTMLSpanElement {
  const logo = document.createElement("span");
  logo.className = "ik-ui-logo ik-ui-logo--sm";
  logo.setAttribute("aria-hidden", "true");
  for (let index = 0; index < 3; index += 1) {
    logo.append(document.createElement("span"));
  }

  return logo;
}

function createSvgIcon(name: PopoverIconName): SVGSVGElement {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.classList.add("ik-ui-icon", `ik-ui-icon--${name}`);
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-width", "2");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round");

  for (const pathData of iconPaths(name)) {
    if (pathData.startsWith("circle:")) {
      const [, cx, cy, r] = pathData.split(":");
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", cx ?? "12");
      circle.setAttribute("cy", cy ?? "12");
      circle.setAttribute("r", r ?? "10");
      icon.append(circle);
      continue;
    }

    if (pathData.startsWith("rect:")) {
      const [, x, y, width, height, rx] = pathData.split(":");
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", x ?? "0");
      rect.setAttribute("y", y ?? "0");
      rect.setAttribute("width", width ?? "0");
      rect.setAttribute("height", height ?? "0");
      if (rx) {
        rect.setAttribute("rx", rx);
      }
      icon.append(rect);
      continue;
    }

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathData);
    icon.append(path);
  }

  return icon;
}

function iconPaths(name: PopoverIconName): string[] {
  switch (name) {
    case "book":
      return [
        "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H7a3 3 0 0 0-3 3V5.5Z",
        "M4 19.5A2.5 2.5 0 0 1 6.5 17H20",
        "M9 7h6"
      ];
    case "check":
      return ["m5 12 4 4L19 6"];
    case "chevron":
      return ["m9 18 6-6-6-6"];
    case "close":
      return ["M18 6 6 18", "m6 6 12 12"];
    case "document":
      return [
        "M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z",
        "M14 2v5h5",
        "M9 13h6",
        "M9 17h4"
      ];
    case "eyeOff":
      return [
        "m2 2 20 20",
        "M10.58 10.58A2 2 0 0 0 12 14a2 2 0 0 0 1.42-.58",
        "M9.88 5.09A10.8 10.8 0 0 1 12 5c5 0 8 4 9 7a11.5 11.5 0 0 1-2.12 3.19",
        "M6.61 6.61C3.98 8.08 2.55 10.42 2 12c1 3 4 7 10 7a10.6 10.6 0 0 0 4.39-.91"
      ];
    case "info":
      return ["circle:12:12:10", "M12 16v-4", "M12 8h.01"];
    case "link":
      return [
        "M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L11 4.93",
        "M14 11a5 5 0 0 0-7.07 0L4.8 13.12a5 5 0 0 0 7.07 7.07L13 19.07"
      ];
    case "lock":
      return ["rect:4:10:16:10:2", "M8 10V7a4 4 0 0 1 8 0v3"];
    case "message":
      return ["M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"];
    case "spark":
      return [
        "M12 2v5",
        "M12 17v5",
        "M4.93 4.93 8.46 8.46",
        "m15.54 15.54 3.53 3.53",
        "M2 12h5",
        "M17 12h5",
        "m4.93 19.07 3.53-3.53",
        "m15.54 8.46 3.53-3.53"
      ];
    case "translate":
      return [
        "m5 8 6 6",
        "m4 14 6-6 2-3",
        "M2 5h12",
        "M7 2h1",
        "m22 22-5-10-5 10",
        "M14 18h6"
      ];
    case "volume":
      return [
        "M11 5 6 9H3v6h3l5 4V5Z",
        "M16 9.5a4 4 0 0 1 0 5",
        "M19 7a8 8 0 0 1 0 10"
      ];
  }
}

function wordStatusLabel(status: VocabStatus): string {
  if (status === "known") {
    return "comfortable";
  }

  if (status === "learning") {
    return "practicing";
  }

  if (status === "ignored") {
    return "hidden";
  }

  return "new";
}

function createSentencePopoverActionButton(
  action: SentencePopoverAction
): HTMLButtonElement {
  const metadata = {
    "show-translation": { label: "Translation", icon: "translate" },
    "toggle-source": { label: "Original", icon: "document" },
    details: { label: "Details", icon: "info" },
    close: { label: "Close", icon: "close" }
  } satisfies Record<SentencePopoverAction, { label: string; icon: PopoverIconName }>;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ik-ui-button ik-ui-button--secondary ik-ui-button--sm";
  button.setAttribute(POPOVER_SENTENCE_ACTION_ATTRIBUTE, action);
  button.append(createSvgIcon(metadata[action].icon));
  button.append(metadata[action].label);
  return button;
}

function readNonEmptyString(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
