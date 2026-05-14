import { useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import type {
  SentenceGrammarCard,
  SentenceLearningNote,
  VocabStatus
} from "@immersionkit/shared";
import uiStyles from "../../../../packages/ui/src/styles.css?inline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  IkIcon,
  ImmersionLogo,
  SentenceBlock
} from "@/screens/screen-primitives";
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

const CONTENT_POPOVER_STYLES = `
  :host {
    box-sizing: border-box;
    display: block;
    width: clamp(260px, 28vw, 340px);
    max-width: calc(100vw - 20px);
    max-height: min(62vh, calc(100vh - 20px), 560px);
    margin: 0;
    z-index: 2147483647;
  }

  :host([data-ik-popover-kind="sentence"]) {
    width: clamp(300px, 36vw, 480px);
    max-height: min(68vh, calc(100vh - 20px), 620px);
  }

  .ik-content-popover-card {
    max-height: inherit;
    overflow: auto;
    overscroll-behavior: contain;
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

export function renderWordPopover(
  detail: TokenActivatedDetail,
  callbacks: {
    onClose: () => void;
    onStatusAction: (status: InteractiveVocabStatus) => void;
  }
): HTMLDivElement {
  const nativeExample = readNonEmptyString(detail.exampleSentenceNative);
  const englishExample = readNonEmptyString(detail.exampleSentenceEnglish);
  const pageSentence = readNonEmptyString(detail.sentence);

  return createReactPopover(
    "word",
    <WordPopoverContent detail={detail} {...callbacks} />,
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
      ]
    }
  );
}

export function renderSentencePopover(
  noteElement: HTMLElement,
  detail: SentenceNoteMetadata,
  callbacks: {
    onClose: () => void;
    onAction: (action: SentencePopoverAction) => void;
  }
): HTMLDivElement {
  return createReactPopover(
    "sentence",
    <SentencePopoverContent
      noteElement={noteElement}
      detail={detail}
      {...callbacks}
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
        "Selected sentence only"
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
      grammarCards: detail.grammarCards
    }
  );
}

export function renderPhrasePopover(
  detail: PhraseActivatedDetail,
  callbacks: { onClose: () => void }
): HTMLDivElement {
  return createReactPopover(
    "phrase",
    <PhrasePopoverContent detail={detail} {...callbacks} />,
    {
      textMirror: [
        detail.sourceText,
        detail.targetText,
        "A reusable phrase you may see again when it fits the page.",
        readNonEmptyString(detail.sentence),
        readNonEmptyString(detail.curriculumReason) ??
          "You may see this again when it fits the page.",
        "Hide phrase",
        "Got it"
      ]
    }
  );
}

function WordPopoverContent({
  detail,
  onClose,
  onStatusAction
}: {
  detail: TokenActivatedDetail;
  onClose: () => void;
  onStatusAction: (status: InteractiveVocabStatus) => void;
}) {
  const nativeExample = readNonEmptyString(detail.exampleSentenceNative);
  const englishExample = readNonEmptyString(detail.exampleSentenceEnglish);
  const pageSentence = readNonEmptyString(detail.sentence);

  return (
    <PopoverCard>
      <PopoverHeading
        icon="volume"
        title={detail.targetToken}
        badge={wordStatusLabel(detail.status)}
        onClose={onClose}
      />
      <TokenPair source={detail.sourceToken} target={detail.targetToken} />
      {nativeExample ? (
        <div className="flex gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
          <IkIcon name="message" className="mt-0.5 text-muted-foreground" />
          <span>{nativeExample}</span>
        </div>
      ) : null}
      {englishExample ? (
        <p className="text-sm text-muted-foreground">{englishExample}</p>
      ) : pageSentence ? (
        <p className="text-sm text-muted-foreground">{pageSentence}</p>
      ) : null}
      <InfoLine>
        {readNonEmptyString(detail.curriculumReason) ??
          "Opening this helps ImmersionKit adapt."}
      </InfoLine>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={detail.status === "new"}>
          Still new
        </Button>
        {STATUS_BUTTONS.map((action) => (
          <Button
            key={action.status}
            variant={action.status === detail.status ? "secondary" : "outline"}
            size="sm"
            aria-pressed={action.status === detail.status}
            data-ik-status-action={action.status}
            onClick={() => onStatusAction(action.status)}
          >
            {action.label}
          </Button>
        ))}
      </div>
      <CardFooter className="justify-between gap-3 border-t pt-4">
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto px-0"
          data-ik-status-action="ignored"
          onClick={() => onStatusAction("ignored")}
        >
          <IkIcon name="eyeOff" dataIcon="inline-start" />
          Hide word
        </Button>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <ImmersionLogo className="size-5 rounded-md" />
          ImmersionKit
        </span>
      </CardFooter>
    </PopoverCard>
  );
}

function PhrasePopoverContent({
  detail,
  onClose
}: {
  detail: PhraseActivatedDetail;
  onClose: () => void;
}) {
  const pageSentence = readNonEmptyString(detail.sentence);

  return (
    <PopoverCard>
      <PopoverHeading
        icon="link"
        title={detail.targetText}
        badge="phrase"
        onClose={onClose}
      />
      <TokenPair source={detail.sourceText} target={detail.targetText} />
      <p className="text-sm text-muted-foreground">
        A reusable phrase you may see again when it fits the page.
      </p>
      <Separator />
      {pageSentence ? (
        <>
          <h4 className="flex items-center gap-2 text-sm font-medium">
            <IkIcon name="spark" />
            Example
          </h4>
          <p className="text-sm">{pageSentence}</p>
        </>
      ) : null}
      <InfoLine>
        {readNonEmptyString(detail.curriculumReason) ??
          "You may see this again when it fits the page."}
      </InfoLine>
      <CardFooter className="justify-between gap-3 border-t pt-4">
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto px-0"
          data-ik-popover-close="true"
          onClick={onClose}
        >
          Hide phrase
        </Button>
        <Button
          variant="outline"
          size="sm"
          data-ik-popover-close="true"
          onClick={onClose}
        >
          Got it
        </Button>
      </CardFooter>
    </PopoverCard>
  );
}

function SentencePopoverContent({
  noteElement,
  detail,
  onClose,
  onAction
}: {
  noteElement: HTMLElement;
  detail: SentenceNoteMetadata;
  onClose: () => void;
  onAction: (action: SentencePopoverAction) => void;
}) {
  const [sourceVisible, setSourceVisible] = useState(
    noteElement.getAttribute("data-ik-source-visible") === "true"
  );
  const [detailsActive, setDetailsActive] = useState(false);

  return (
    <PopoverCard>
      <PopoverHeading
        icon="book"
        title="Sentence help"
        badge="optional"
        onClose={onClose}
      />
      <p className="text-sm text-muted-foreground">Uses OpenAI only when enabled.</p>
      <SentenceBlock label="Original" text={detail.sourceText} />
      <SentenceBlock label="Translation" text={detail.translatedText} />
      {detail.grammarCards.map((grammarCard) => (
        <GrammarCard key={grammarCard.featureKey} card={grammarCard} />
      ))}
      <SentenceBlock
        label="Why this helps"
        text={sentenceHelpDetail(detail.learningNote)}
      />
      <div className="grid grid-cols-3 gap-2">
        <Button
          variant={!sourceVisible ? "secondary" : "outline"}
          size="sm"
          aria-pressed={!sourceVisible}
          data-ik-sentence-action="show-translation"
          onClick={() => {
            setSourceVisible(false);
            onAction("show-translation");
          }}
        >
          <IkIcon name="translate" dataIcon="inline-start" />
          Translation
        </Button>
        <Button
          variant={sourceVisible ? "secondary" : "outline"}
          size="sm"
          aria-pressed={sourceVisible}
          data-ik-sentence-action="toggle-source"
          onClick={() => {
            setSourceVisible(true);
            onAction("toggle-source");
          }}
        >
          <IkIcon name="document" dataIcon="inline-start" />
          Original
        </Button>
        <Button
          variant={detailsActive ? "secondary" : "outline"}
          size="sm"
          aria-pressed={detailsActive}
          data-ik-sentence-action="details"
          onClick={() => {
            setDetailsActive(true);
            onAction("details");
          }}
        >
          <IkIcon name="info" dataIcon="inline-start" />
          Details
        </Button>
      </div>
      <footer className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <IkIcon name="lock" />
        <span>Selected sentence only</span>
      </footer>
    </PopoverCard>
  );
}

function GrammarCard({ card }: { card: SentenceGrammarCard }) {
  return (
    <div
      className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3"
      data-ik-grammar-card="true"
      data-ik-grammar-feature-key={card.featureKey}
      data-ik-grammar-status={card.curriculumStatus}
    >
      <h4 className="flex items-center gap-2 text-sm font-medium">
        <IkIcon name="spark" />
        {card.title}
      </h4>
      <p className="w-fit max-w-full rounded-md bg-background px-2 py-1 text-sm font-medium">
        {card.sourceText}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <GrammarPattern label="Source" value={card.sourcePatternLabel} />
        <GrammarPattern label="Spanish" value={card.targetPatternLabel} />
      </div>
      <p className="text-sm text-muted-foreground">{card.explanation}</p>
      {card.exampleMapping ? (
        <p className="text-sm text-muted-foreground">{card.exampleMapping}</p>
      ) : null}
      <InfoLine>{card.curriculumReason}</InfoLine>
    </div>
  );
}

function GrammarPattern({ label, value }: { label: string; value: string }) {
  return (
    <span className="min-w-0 rounded-lg border bg-background p-2 text-sm">
      <strong className="block text-xs uppercase text-muted-foreground">{label}</strong>
      {value}
    </span>
  );
}

function PopoverCard({ children }: { children: ReactNode }) {
  return (
    <Card className="ik-content-popover-card flex flex-col gap-3 rounded-lg p-4 text-sm shadow-lg">
      {children}
    </Card>
  );
}

function PopoverHeading({
  icon,
  title,
  badge,
  onClose
}: {
  icon: "book" | "link" | "volume";
  title: string;
  badge: string;
  onClose: () => void;
}) {
  return (
    <CardHeader className="flex-row items-start gap-2 p-0">
      <IkIcon name={icon} className="mt-1 text-muted-foreground" />
      <CardTitle className="min-w-0 flex-1 break-words text-base">
        {title}
      </CardTitle>
      <Badge className="rounded-md">{badge}</Badge>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Close help"
        data-ik-popover-close="true"
        onClick={onClose}
      >
        <IkIcon name="close" />
      </Button>
    </CardHeader>
  );
}

function TokenPair({ source, target }: { source: string; target: string }) {
  return (
    <CardContent className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 p-0">
      <span className="min-w-0 rounded-lg border bg-muted/40 p-3 text-sm">{source}</span>
      <IkIcon name="chevron" className="text-muted-foreground" />
      <span className="min-w-0 rounded-lg border bg-muted/40 p-3 text-sm">{target}</span>
    </CardContent>
  );
}

function InfoLine({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2 text-sm text-muted-foreground">
      <IkIcon name="info" className="mt-0.5" />
      <span>{children}</span>
    </div>
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
    const left =
      candidate.placement === "top" || candidate.placement === "bottom"
        ? clamp(candidate.left, POPOVER_VIEWPORT_MARGIN, maxLeft - popoverWidth)
        : candidate.left;
    const top =
      candidate.placement === "left" || candidate.placement === "right"
        ? clamp(candidate.top, POPOVER_VIEWPORT_MARGIN, maxTop - popoverHeight)
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
  }
) {
  const mirrorText = (options.textMirror ?? [])
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ");
  if (mirrorText) {
    const mirror = document.createElement("span");
    mirror.slot = "ik-popover-text-mirror";
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

function readNonEmptyString(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
