import {
  useCallback,
  useState,
  type ComponentProps,
  type ReactNode
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger
} from "@/components/ui/hover-card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  IkIcon,
  ImmersionLogo,
  SentenceBlock
} from "./screen-primitives";

export type WordHelpStatus = "new" | "learning" | "known" | "ignored";
export type WordHelpAction = "learning" | "known" | "ignored";
export type SentenceHelpAction = "show-translation" | "toggle-source" | "details";
export type ExampleLanguage = "spanish" | "english";

export type SentenceHelpLearningNote = {
  summary: string;
  literalGloss?: string;
  keyPhrase?: string;
  canonicalUsage?: string;
  grammarFocus?: string;
};

export type SentenceHelpGrammarCard = {
  featureKey: string;
  sourceText: string;
  title: string;
  explanation: string;
  sourcePatternLabel: string;
  targetPatternLabel: string;
  exampleMapping?: string | null;
  curriculumReason: string;
  curriculumStatus: string;
};

export type WordHelpPopoverProps = {
  sourceText: string;
  targetText: string;
  status: WordHelpStatus;
  rationale: string;
  nativeExample?: string | null;
  englishExample?: string | null;
  pageSentence?: string | null;
  onClose?: () => void;
  onStatusAction?: (status: WordHelpAction) => void;
};

export type PhraseHelpPopoverProps = {
  sourceText: string;
  targetText: string;
  rationale: string;
  sentence?: string | null;
  onClose?: () => void;
};

export type SentenceHelpPopoverProps = {
  sourceText: string;
  translatedText: string;
  learningNote: SentenceHelpLearningNote;
  grammarCards?: readonly SentenceHelpGrammarCard[];
  initialSourceVisible?: boolean;
  onClose?: () => void;
  onAction?: (action: SentenceHelpAction) => void;
};

const INACTIVE_STATUS_BUTTON_CLASS =
  "ik-status-outline bg-background";
const TRANSLATION_UNAVAILABLE_TEXT = "Translation not available.";
const STATUS_BUTTONS: readonly {
  status: Exclude<WordHelpAction, "ignored">;
  label: string;
}[] = [
  { status: "learning", label: "Practicing" },
  { status: "known", label: "Comfortable" }
] as const;

export function WordHelpPopoverContent({
  sourceText,
  targetText,
  status,
  rationale,
  nativeExample,
  englishExample,
  pageSentence,
  onClose,
  onStatusAction
}: WordHelpPopoverProps) {
  const [exampleLanguage, setExampleLanguage] =
    useState<ExampleLanguage>("spanish");
  const canToggleExampleLanguage = Boolean(nativeExample && englishExample);
  const visibleExampleText = canToggleExampleLanguage
    ? exampleLanguage === "english"
      ? englishExample
      : nativeExample
    : nativeExample ?? englishExample ?? pageSentence;
  const visibleExampleLanguage: ExampleLanguage = canToggleExampleLanguage
    ? exampleLanguage
    : nativeExample
      ? "spanish"
      : "english";

  return (
    <PopoverCard>
      <PopoverHeading
        actions={
          <RationaleHoverAction
            aria-label="Why this word appears"
            contentAttribute="data-ik-word-rationale"
            triggerAttribute="data-ik-word-rationale-trigger"
          >
            {rationale}
          </RationaleHoverAction>
        }
        icon="volume"
        title={targetText}
        badge={wordStatusLabel(status)}
        onClose={onClose}
      />
      <TokenPair source={sourceText} target={targetText} />
      {canToggleExampleLanguage ? (
        <LanguageTabs
          ariaLabel="Example sentence language"
          value={exampleLanguage}
          onValueChange={setExampleLanguage}
          optionAttribute="data-ik-example-language-option"
        />
      ) : null}
      {visibleExampleText ? (
        <div
          className="flex gap-2 rounded-3xl bg-muted/50 p-4 text-sm"
          data-ik-example-language={visibleExampleLanguage}
          data-ik-example-sentence="true"
        >
          <IkIcon
            name={visibleExampleLanguage === "english" ? "translate" : "message"}
            className="mt-0.5 shrink-0 text-muted-foreground"
          />
          <span>{visibleExampleText}</span>
        </div>
      ) : null}
      <div className="flex flex-nowrap justify-center gap-2">
        <Button
          className={INACTIVE_STATUS_BUTTON_CLASS}
          variant="outline"
          size="xs"
          disabled={status === "new"}
        >
          Still new
        </Button>
        {STATUS_BUTTONS.map((action) => (
          <Button
            key={action.status}
            variant={action.status === status ? "secondary" : "outline"}
            size="xs"
            className={
              action.status === status
                ? undefined
                : INACTIVE_STATUS_BUTTON_CLASS
            }
            aria-pressed={action.status === status}
            data-ik-status-action={action.status}
            onClick={() => onStatusAction?.(action.status)}
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
          onClick={() => onStatusAction?.("ignored")}
        >
          <IkIcon name="eyeOff" dataIcon="inline-start" />
          Hide word
        </Button>
        <PopoverBrand />
      </CardFooter>
    </PopoverCard>
  );
}

export function PhraseHelpPopoverContent({
  sourceText,
  targetText,
  rationale,
  sentence,
  onClose
}: PhraseHelpPopoverProps) {
  const [exampleLanguage, setExampleLanguage] =
    useState<ExampleLanguage>("spanish");
  const visibleExampleText =
    exampleLanguage === "english" ? sentence : TRANSLATION_UNAVAILABLE_TEXT;

  return (
    <PopoverCard>
      <PopoverHeading
        actions={
          <RationaleHoverAction
            aria-label="Why this phrase appears"
            contentAttribute="data-ik-phrase-rationale"
            triggerAttribute="data-ik-phrase-rationale-trigger"
          >
            {rationale}
          </RationaleHoverAction>
        }
        icon="link"
        title={targetText}
        badge="phrase"
        onClose={onClose}
      />
      <TokenPair source={sourceText} target={targetText} />
      {sentence ? (
        <>
          <LanguageTabs
            ariaLabel="Phrase example language"
            value={exampleLanguage}
            onValueChange={setExampleLanguage}
            optionAttribute="data-ik-example-language-option"
          />
          <div
            className="flex gap-2 rounded-3xl bg-muted/50 p-4 text-sm"
            data-ik-example-language={exampleLanguage}
            data-ik-phrase-example-sentence="true"
            data-ik-translation-available={
              exampleLanguage === "english" ? "true" : "false"
            }
          >
            <IkIcon
              name={exampleLanguage === "english" ? "message" : "translate"}
              className="mt-0.5 shrink-0 text-muted-foreground"
            />
            <span>{visibleExampleText}</span>
          </div>
        </>
      ) : null}
      <CardFooter className="justify-between gap-3 border-t pt-4">
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto px-0"
          data-ik-popover-close="true"
          onClick={onClose}
        >
          <IkIcon name="close" dataIcon="inline-start" />
          Close help
        </Button>
        <PopoverBrand />
      </CardFooter>
    </PopoverCard>
  );
}

export function SentenceHelpPopoverContent({
  sourceText,
  translatedText,
  learningNote,
  grammarCards = [],
  initialSourceVisible = false,
  onClose,
  onAction
}: SentenceHelpPopoverProps) {
  const [sourceVisible, setSourceVisible] = useState(initialSourceVisible);
  const [detailsActive, setDetailsActive] = useState(false);
  const [sentenceLanguage, setSentenceLanguage] =
    useState<ExampleLanguage>("spanish");
  const visibleSentenceText =
    sentenceLanguage === "spanish" ? translatedText : sourceText;

  return (
    <PopoverCard>
      <PopoverHeading
        actions={
          <RationaleHoverAction
            aria-label="Why sentence help appears"
            contentAttribute="data-ik-sentence-rationale"
            triggerAttribute="data-ik-sentence-rationale-trigger"
          >
            Uses OpenAI only when enabled.
          </RationaleHoverAction>
        }
        icon="book"
        title="Sentence help"
        badge="optional"
        onClose={onClose}
      />
      <LanguageTabs
        ariaLabel="Sentence language"
        value={sentenceLanguage}
        onValueChange={setSentenceLanguage}
        optionAttribute="data-ik-sentence-language-option"
      />
      <SentenceBlock
        label={sentenceLanguage === "spanish" ? "Spanish" : "English"}
        text={visibleSentenceText}
      />
      {grammarCards.map((grammarCard) => (
        <GrammarCard key={grammarCard.featureKey} card={grammarCard} />
      ))}
      <SentenceBlock
        label="Why this helps"
        text={sentenceHelpDetail(learningNote)}
      />
      <div className="flex flex-nowrap justify-center gap-2">
        <Button
          variant={!sourceVisible ? "secondary" : "outline"}
          size="sm"
          className={sourceVisible ? INACTIVE_STATUS_BUTTON_CLASS : undefined}
          aria-pressed={!sourceVisible}
          data-ik-sentence-action="show-translation"
          onClick={() => {
            setSourceVisible(false);
            setSentenceLanguage("spanish");
            onAction?.("show-translation");
          }}
        >
          <IkIcon name="translate" dataIcon="inline-start" />
          Translation
        </Button>
        <Button
          variant={sourceVisible ? "secondary" : "outline"}
          size="sm"
          className={sourceVisible ? undefined : INACTIVE_STATUS_BUTTON_CLASS}
          aria-pressed={sourceVisible}
          data-ik-sentence-action="toggle-source"
          onClick={() => {
            setSourceVisible(true);
            setSentenceLanguage("english");
            onAction?.("toggle-source");
          }}
        >
          <IkIcon name="document" dataIcon="inline-start" />
          Original
        </Button>
        <Button
          variant={detailsActive ? "secondary" : "outline"}
          size="sm"
          className={detailsActive ? undefined : INACTIVE_STATUS_BUTTON_CLASS}
          aria-pressed={detailsActive}
          data-ik-sentence-action="details"
          onClick={() => {
            setDetailsActive(true);
            onAction?.("details");
          }}
        >
          <IkIcon name="info" dataIcon="inline-start" />
          Details
        </Button>
      </div>
      <CardFooter className="justify-between gap-3 border-t pt-4">
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto px-0"
          data-ik-popover-close="true"
          onClick={onClose}
        >
          <IkIcon name="close" dataIcon="inline-start" />
          Close help
        </Button>
        <PopoverBrand />
      </CardFooter>
    </PopoverCard>
  );
}

function GrammarCard({ card }: { card: SentenceHelpGrammarCard }) {
  return (
    <div
      className="flex flex-col gap-3 rounded-3xl bg-muted/50 p-4"
      data-ik-grammar-card="true"
      data-ik-grammar-feature-key={card.featureKey}
      data-ik-grammar-status={card.curriculumStatus}
    >
      <h4 className="flex items-center gap-2 text-sm font-medium">
        <IkIcon name="spark" />
        {card.title}
      </h4>
      <p className="w-fit max-w-full rounded-2xl bg-background px-2.5 py-1 text-sm font-medium shadow-sm ring-1 ring-foreground/5">
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
    <span className="min-w-0 rounded-3xl bg-background p-3 text-sm ring-1 ring-foreground/5">
      <strong className="block text-xs uppercase text-muted-foreground">{label}</strong>
      {value}
    </span>
  );
}

function PopoverCard({ children }: { children: ReactNode }) {
  return (
    <Card className="ik-content-popover-card flex flex-col gap-3 p-4 text-sm shadow-xl">
      {children}
    </Card>
  );
}

function PopoverHeading({
  actions,
  icon,
  title,
  badge,
  onClose
}: {
  actions?: ReactNode;
  icon: "book" | "link" | "volume";
  title: string;
  badge: string;
  onClose?: () => void;
}) {
  return (
    <CardHeader className="flex flex-row items-start gap-2 p-0">
      <IkIcon name={icon} className="mt-1 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex flex-1 flex-wrap items-center gap-2">
        <CardTitle className="min-w-0 break-words text-base leading-6">
          {title}
        </CardTitle>
        <Badge className="shrink-0">{badge}</Badge>
      </div>
      {actions}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="-mr-1 -mt-1 shrink-0"
        aria-label="Close help"
        data-ik-popover-close="true"
        onClick={onClose}
      >
        <IkIcon name="close" />
      </Button>
    </CardHeader>
  );
}

function PopoverBrand() {
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <ImmersionLogo className="size-5 rounded-xl" />
      ImmersionKit
    </span>
  );
}

function TokenPair({ source, target }: { source: string; target: string }) {
  return (
    <CardContent className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 p-0">
      <span className="min-w-0 rounded-3xl bg-muted/50 p-3 text-sm">{source}</span>
      <IkIcon name="chevron" className="text-muted-foreground" />
      <span className="min-w-0 rounded-3xl bg-muted/50 p-3 text-sm">{target}</span>
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

function RationaleHoverAction({
  children,
  contentAttribute,
  triggerAttribute,
  ...triggerProps
}: {
  children: ReactNode;
  contentAttribute: string;
  triggerAttribute: string;
} & Pick<ComponentProps<typeof Button>, "aria-label">) {
  const [portalContainer, setPortalContainer] =
    useState<ComponentProps<typeof HoverCardContent>["container"]>(undefined);
  const handleTriggerRef = useCallback((node: HTMLButtonElement | null) => {
    if (!node) {
      return;
    }

    const root = node.getRootNode();
    if (typeof ShadowRoot !== "undefined" && root instanceof ShadowRoot) {
      setPortalContainer(root);
    }
  }, []);

  return (
    <HoverCard openDelay={10} closeDelay={100}>
      <HoverCardTrigger asChild>
        <Button
          ref={handleTriggerRef}
          type="button"
          variant="ghost"
          size="icon-xs"
          {...triggerProps}
          {...{ [triggerAttribute]: "true" }}
        >
          <IkIcon name="info" />
        </Button>
      </HoverCardTrigger>
      <HoverCardContent
        align="end"
        side="top"
        className="flex w-64 gap-2 p-3 text-xs text-muted-foreground"
        container={portalContainer}
        {...{ [contentAttribute]: "true" }}
      >
        <IkIcon name="info" className="mt-0.5 shrink-0" />
        <span>{children}</span>
      </HoverCardContent>
    </HoverCard>
  );
}

function LanguageTabs({
  ariaLabel,
  value,
  onValueChange,
  optionAttribute
}: {
  ariaLabel: string;
  value: ExampleLanguage;
  onValueChange: (value: ExampleLanguage) => void;
  optionAttribute: string;
}) {
  return (
    <Tabs
      aria-label={ariaLabel}
      className="w-full"
      onValueChange={(nextValue) => {
        if (nextValue === "spanish" || nextValue === "english") {
          onValueChange(nextValue);
        }
      }}
      value={value}
    >
      <TabsList className="h-8 w-full justify-start p-0" variant="line">
        <TabsTrigger
          className="flex-none px-2.5 text-xs"
          onClick={() => onValueChange("spanish")}
          value="spanish"
          {...{ [optionAttribute]: "spanish" }}
        >
          Spanish
        </TabsTrigger>
        <TabsTrigger
          className="flex-none px-2.5 text-xs"
          onClick={() => onValueChange("english")}
          value="english"
          {...{ [optionAttribute]: "english" }}
        >
          English
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

function sentenceHelpDetail(note: SentenceHelpLearningNote): string {
  return (
    readNonEmptyString(note.grammarFocus) ??
    readNonEmptyString(note.summary) ??
    readNonEmptyString(note.canonicalUsage) ??
    readNonEmptyString(note.keyPhrase) ??
    "This sentence note gives selected context for the sentence you opened."
  );
}

function wordStatusLabel(status: WordHelpStatus): string {
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
