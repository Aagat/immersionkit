import { useState, type ComponentProps, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger
} from "@/components/ui/hover-card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  BrowserChrome,
  IkIcon,
  ImmersionFrame,
  ImmersionLogo,
  InlineMark,
  SentenceBlock
} from "./screen-primitives";
import type { ArticleState } from "./types";

const INACTIVE_STATUS_BUTTON_CLASS =
  "ik-status-outline bg-background";
type ExampleLanguage = "spanish" | "english";

export function ReadingPage({ state = "supported" }: { state?: ArticleState }) {
  const travel = state === "supported";

  return (
    <ImmersionFrame variant="browser">
      <BrowserChrome
        title={travel ? "Kyoto in Slow Season: A Local's Guide" : "The Power of Small Habits"}
        url={travel ? "travelmag.es/kyoto-slow-season-guide" : "example.com/blog/small-habits"}
      >
        {travel ? <TravelArticle /> : <HabitsArticle active={state} />}
        {state === "word" ? <WordHelpPopover /> : null}
        {state === "phrase" ? <PhraseHelpPopover /> : null}
        {state === "sentence" ? <SentenceHelpPopover /> : null}
        {travel ? (
          <div className="absolute bottom-5 right-5 flex items-center gap-2 rounded-3xl bg-card px-4 py-2.5 text-sm shadow-md ring-1 ring-foreground/5">
            <IkIcon name="check" />
            <span>Reading mode is on for this site</span>
            <IkIcon name="close" className="text-muted-foreground" />
          </div>
        ) : null}
      </BrowserChrome>
    </ImmersionFrame>
  );
}

function TravelArticle() {
  return (
    <article className="bg-background">
      <header className="flex items-center gap-5 border-b px-8 py-4 text-sm">
        <strong>TRAVELMAG</strong>
        <nav className="hidden flex-1 gap-4 text-muted-foreground md:flex">
          <span>Destinations</span>
          <span>Inspiration</span>
          <span>Guides</span>
          <span>About</span>
        </nav>
        <div className="rounded-3xl bg-muted px-3 py-2 text-muted-foreground">Search...</div>
      </header>
      <main className="grid gap-8 p-8 lg:grid-cols-[minmax(0,1fr)_260px]">
        <section className="mx-auto flex max-w-3xl flex-col gap-5 text-base leading-7">
          <p className="text-sm font-medium uppercase text-muted-foreground">Guides</p>
          <h1 className="text-4xl font-medium leading-tight">
            Kyoto in Slow Season: A Local's Guide
          </h1>
          <p className="text-xl text-muted-foreground">
            Enjoy temples, neighborhoods, and everyday moments when the city breathes.
          </p>
          <p className="text-sm text-muted-foreground">By Aiko Tanaka | May 10, 2024 | 6 min read</p>
          <p>
            Kyoto is famous for its temples and gardens, but some of its best moments
            happen between the big sights. On quiet mornings, the city invites you to
            move <InlineMark kind="phrase" status="known">con calma</InlineMark> and notice the small details.
          </p>
          <p>
            Start with a short <InlineMark status="learning">lectura</InlineMark> in a local cafe. A few pages
            can shift your mood for the whole day.
          </p>
          <p>
            Travel days go better with <InlineMark kind="phrase" status="new">pequenas decisiones</InlineMark>.
            Take the side street, choose the tiny shop, say yes to tea.
          </p>
          <p>
            Kyoto keeps things simple, and that's what <InlineMark status="known">mantiene</InlineMark> its charm.
          </p>
          <div className="aspect-[16/9] rounded-4xl bg-muted" />
        </section>
        <aside className="hidden flex-col gap-4 lg:flex">
          <Card>
            <CardHeader>
              <CardTitle>On this page</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
              <p>Morning quiet</p>
              <p>Neighborhood walks</p>
              <p>Food without crowds</p>
              <p>A simple plan</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Simple travel, good stories</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-2">
              <div className="flex-1 rounded-3xl bg-muted px-3 py-2 text-sm text-muted-foreground">
                Email address
              </div>
              <Button size="sm">Subscribe</Button>
            </CardContent>
          </Card>
        </aside>
      </main>
    </article>
  );
}

function HabitsArticle({ active }: { active: ArticleState }) {
  const sentence = active === "sentence";

  return (
    <article className="bg-background">
      {sentence ? (
        <header className="flex items-center gap-5 border-b px-8 py-4 text-sm">
          <strong>TravelMag</strong>
          <nav className="hidden flex-1 gap-4 text-muted-foreground md:flex">
            <span>Destinations</span>
            <span>Inspiration</span>
            <span>Guides</span>
            <span>About</span>
          </nav>
          <IkIcon name="spark" />
        </header>
      ) : null}
      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-8 py-12 text-base leading-7">
        <h1 className="text-4xl font-medium leading-tight">
          {sentence ? "The Art of Slow Travel" : "The Power of Small Habits"}
        </h1>
        {sentence ? (
          <p className="text-xl text-muted-foreground">Go gently. Notice more. Remember longer.</p>
        ) : null}
        <p className="text-sm text-muted-foreground">By Ana Lewis | May 10, 2024 | 5 min read</p>
        <p>Big changes don't happen overnight. Real progress comes from small, consistent actions.</p>
        <p>
          Start with a short <InlineMark status="new">lectura</InlineMark> each morning. Ten minutes is enough
          to reset your mind.
        </p>
        <p>
          The magic is in <InlineMark kind="phrase" status="learning">pequenas decisiones</InlineMark> you repeat
          every day.
        </p>
        <p>
          You don't need more time; you need focus, and the willingness to move{" "}
          <InlineMark kind="phrase" status="known">con calma</InlineMark>.
        </p>
        {sentence ? (
          <p>
            A few minutes of <InlineMark status="learning">lectura</InlineMark> can make the day feel slower.
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              className="ml-2 align-middle"
              aria-label="Open sentence help"
            >
              <IkIcon name="spark" />
            </Button>
          </p>
        ) : null}
        <p>Small steps, taken today, shape where you'll be tomorrow.</p>
      </main>
    </article>
  );
}

function WordHelpPopover() {
  const [exampleLanguage, setExampleLanguage] = useState<"spanish" | "english">(
    "spanish"
  );
  const exampleText =
    exampleLanguage === "spanish"
      ? "Una lectura corta en un cafe puede reiniciar el dia."
      : "A short reading in a cafe can reset the day.";

  return (
    <PopoverFrame className="top-[215px] md:left-[48%] md:right-auto md:w-[340px]">
      <header className="flex items-start gap-2">
        <IkIcon name="volume" className="mt-1 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex flex-1 flex-wrap items-center gap-2">
          <h3 className="min-w-0 text-base font-medium leading-6">lectura</h3>
          <Badge className="shrink-0">new</Badge>
        </div>
        <RationaleHoverAction aria-label="Why this word appears">
          This word fits your current reading band and appeared in a safe local
          context.
        </RationaleHoverAction>
        <PopoverCloseButton className="-mr-1 -mt-1 shrink-0" />
      </header>
      <TokenPair source="reading" target="lectura" />
      <p className="text-sm text-muted-foreground">Used for reading or a piece of reading.</p>
      <Tabs
        aria-label="Example sentence language"
        className="w-full"
        onValueChange={(value) => {
          if (value === "spanish" || value === "english") {
            setExampleLanguage(value);
          }
        }}
        value={exampleLanguage}
      >
        <TabsList className="h-8 w-full justify-start p-0" variant="line">
          <TabsTrigger
            className="flex-none px-2.5 text-xs"
            onClick={() => setExampleLanguage("spanish")}
            value="spanish"
          >
            Spanish
          </TabsTrigger>
          <TabsTrigger
            className="flex-none px-2.5 text-xs"
            onClick={() => setExampleLanguage("english")}
            value="english"
          >
            English
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex gap-2 rounded-3xl bg-muted/50 p-4 text-sm">
        <IkIcon
          name={exampleLanguage === "english" ? "translate" : "message"}
          className="mt-0.5 shrink-0 text-muted-foreground"
        />
        <span>{exampleText}</span>
      </div>
      <div className="flex flex-nowrap justify-center gap-2">
        <Button
          className={INACTIVE_STATUS_BUTTON_CLASS}
          variant="outline"
          size="xs"
        >
          Still new
        </Button>
        <Button
          className={INACTIVE_STATUS_BUTTON_CLASS}
          variant="outline"
          size="xs"
        >
          Practicing
        </Button>
        <Button
          className={INACTIVE_STATUS_BUTTON_CLASS}
          variant="outline"
          size="xs"
        >
          Comfortable
        </Button>
      </div>
      <footer className="flex items-center justify-between gap-3 border-t pt-4 text-sm">
        <Button type="button" variant="link" size="sm" className="h-auto px-0">
          <IkIcon name="eyeOff" dataIcon="inline-start" />
          Hide word
        </Button>
        <span className="flex items-center gap-1 text-muted-foreground">
          <ImmersionLogo className="size-5 rounded-xl" /> ImmersionKit
        </span>
      </footer>
    </PopoverFrame>
  );
}

function PhraseHelpPopover() {
  const [exampleLanguage, setExampleLanguage] =
    useState<ExampleLanguage>("spanish");
  const exampleText =
    exampleLanguage === "spanish"
      ? "Translation not available."
      : "Read with calm when the page feels dense.";

  return (
    <PopoverFrame className="top-[260px] md:left-[44%] md:right-auto md:w-[340px]">
      <header className="flex items-start gap-2">
        <IkIcon name="link" className="mt-1 text-muted-foreground" />
        <div className="min-w-0 flex flex-1 flex-wrap items-center gap-2">
          <h3 className="min-w-0 text-base font-medium leading-6">con calma</h3>
          <Badge className="shrink-0">phrase</Badge>
        </div>
        <RationaleHoverAction aria-label="Why this phrase appears">
          You may see this again when it fits the page.
        </RationaleHoverAction>
        <PopoverCloseButton className="-mr-1 -mt-1 shrink-0" />
      </header>
      <TokenPair source="with calm" target="con calma" />
      <LanguageTabs
        ariaLabel="Phrase example language"
        value={exampleLanguage}
        onValueChange={setExampleLanguage}
      />
      <div className="flex gap-2 rounded-3xl bg-muted/50 p-4 text-sm">
        <IkIcon
          name={exampleLanguage === "english" ? "message" : "translate"}
          className="mt-0.5 shrink-0 text-muted-foreground"
        />
        <span>{exampleText}</span>
      </div>
      <footer className="flex items-center justify-between gap-3 border-t pt-4">
        <Button type="button" variant="link" size="sm" className="h-auto px-0">
          <IkIcon name="eyeOff" dataIcon="inline-start" />
          Hide phrase
        </Button>
        <span className="flex items-center gap-1 text-muted-foreground">
          <ImmersionLogo className="size-5 rounded-xl" /> ImmersionKit
        </span>
      </footer>
    </PopoverFrame>
  );
}

function SentenceHelpPopover() {
  const [sentenceLanguage, setSentenceLanguage] =
    useState<ExampleLanguage>("spanish");
  const [detailsActive, setDetailsActive] = useState(false);
  const visibleSentenceText =
    sentenceLanguage === "spanish"
      ? "Unos minutos de lectura pueden hacer que el dia se sienta mas lento."
      : "A few minutes of lectura can make the day feel slower.";

  return (
    <PopoverFrame className="top-[120px] md:left-auto md:right-8 md:w-[440px]">
      <header className="flex items-start gap-2">
        <IkIcon name="book" className="mt-1 text-muted-foreground" />
        <h3 className="min-w-0 flex-1 text-base font-medium">Sentence help</h3>
        <Badge>optional</Badge>
        <RationaleHoverAction aria-label="Why sentence help appears">
          Uses OpenAI only when enabled.
        </RationaleHoverAction>
        <PopoverCloseButton />
      </header>
      <LanguageTabs
        ariaLabel="Sentence language"
        value={sentenceLanguage}
        onValueChange={setSentenceLanguage}
      />
      <SentenceBlock
        label={sentenceLanguage === "spanish" ? "Spanish" : "English"}
        text={visibleSentenceText}
      />
      <SentenceBlock label="Why this helps" text="Puede + infinitive expresses something can happen." />
      <div className="flex flex-nowrap justify-center gap-2">
        <Button
          variant={sentenceLanguage === "spanish" ? "secondary" : "outline"}
          size="sm"
          className={
            sentenceLanguage === "spanish"
              ? undefined
              : INACTIVE_STATUS_BUTTON_CLASS
          }
          aria-pressed={sentenceLanguage === "spanish"}
          onClick={() => setSentenceLanguage("spanish")}
        >
          <IkIcon name="translate" dataIcon="inline-start" />
          Translation
        </Button>
        <Button
          variant={sentenceLanguage === "english" ? "secondary" : "outline"}
          size="sm"
          className={
            sentenceLanguage === "english"
              ? undefined
              : INACTIVE_STATUS_BUTTON_CLASS
          }
          aria-pressed={sentenceLanguage === "english"}
          onClick={() => setSentenceLanguage("english")}
        >
          <IkIcon name="document" dataIcon="inline-start" />
          Original
        </Button>
        <Button
          variant={detailsActive ? "secondary" : "outline"}
          size="sm"
          className={detailsActive ? undefined : INACTIVE_STATUS_BUTTON_CLASS}
          aria-pressed={detailsActive}
          onClick={() => setDetailsActive(true)}
        >
          <IkIcon name="info" dataIcon="inline-start" />
          Details
        </Button>
      </div>
      <footer className="flex items-center justify-between gap-3 border-t pt-4 text-sm">
        <Button type="button" variant="link" size="sm" className="h-auto px-0">
          <IkIcon name="close" dataIcon="inline-start" />
          Close help
        </Button>
        <span className="flex items-center gap-1 text-muted-foreground">
          <ImmersionLogo className="size-5 rounded-xl" /> ImmersionKit
        </span>
      </footer>
    </PopoverFrame>
  );
}

function PopoverCloseButton({ className }: { className?: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Close help"
      className={className}
    >
      <IkIcon name="close" />
    </Button>
  );
}

function RationaleHoverAction({
  children,
  ...triggerProps
}: {
  children: ReactNode;
} & Pick<ComponentProps<typeof Button>, "aria-label">) {
  return (
    <HoverCard openDelay={10} closeDelay={100}>
      <HoverCardTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          {...triggerProps}
        >
          <IkIcon name="info" />
        </Button>
      </HoverCardTrigger>
      <HoverCardContent
        align="end"
        side="top"
        className="flex w-64 gap-2 p-3 text-xs text-muted-foreground"
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
  onValueChange
}: {
  ariaLabel: string;
  value: ExampleLanguage;
  onValueChange: (value: ExampleLanguage) => void;
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
        >
          Spanish
        </TabsTrigger>
        <TabsTrigger
          className="flex-none px-2.5 text-xs"
          onClick={() => onValueChange("english")}
          value="english"
        >
          English
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

function PopoverFrame({
  children,
  className
}: {
  children: ReactNode;
  className: string;
}) {
  return (
    <Card
      className={cn(
        "absolute left-4 right-4 z-10 flex w-auto max-w-[calc(100%-2rem)] flex-col gap-3 p-4 shadow-xl md:max-w-none",
        className
      )}
    >
      {children}
    </Card>
  );
}

function TokenPair({ source, target }: { source: string; target: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
      <span className="min-w-0 rounded-3xl bg-muted/50 p-3 text-sm">{source}</span>
      <IkIcon name="chevron" className="text-muted-foreground" />
      <span className="min-w-0 rounded-3xl bg-muted/50 p-3 text-sm">{target}</span>
    </div>
  );
}
