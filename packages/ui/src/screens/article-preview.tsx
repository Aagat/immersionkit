import type { ReactNode } from "react";
import {
  Badge,
  Button,
  Card,
  Icon,
  ImmersionLogo,
  WordMark
} from "../components/primitives";
import { Button as ShadcnButton } from "../components/ui/button";
import { cn } from "../lib/utils";
import {
  BrowserChrome,
  ImmersionFrame,
  LocalFooter,
  SentenceBlock
} from "./screen-primitives";
import type { ArticleState } from "./types";

export function ReadingPage({
  state = "supported"
}: {
  state?: ArticleState;
}) {
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
          <div className="absolute bottom-6 right-6 flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm shadow-panel">
            <Icon name="check" className="text-primary" />
            <span>Reading mode is on for this site</span>
            <Icon name="close" className="text-muted-foreground" />
          </div>
        ) : null}
      </BrowserChrome>
    </ImmersionFrame>
  );
}

function TravelArticle() {
  return (
    <article className="min-h-[690px] bg-background">
      <header className="flex items-center justify-between gap-6 border-b px-10 py-5 text-sm">
        <strong className="tracking-[0.18em]">TRAVELMAG</strong>
        <nav className="flex flex-wrap gap-5 text-muted-foreground">
          <span>Destinations</span>
          <span>Inspiration</span>
          <span>Guides</span>
          <span>About</span>
        </nav>
        <div className="rounded-md border bg-muted/30 px-3 py-1.5 text-muted-foreground">
          Search...
        </div>
      </header>
      <main className="grid grid-cols-[minmax(0,1fr)_280px] gap-8 px-10 py-8 max-lg:grid-cols-1">
        <section className="grid max-w-3xl gap-5">
          <p className="text-xs font-bold uppercase text-primary">Guides</p>
          <h1 className="text-5xl font-semibold leading-tight tracking-normal">
            Kyoto in Slow Season: A Local's Guide
          </h1>
          <p className="text-xl text-muted-foreground">
            Enjoy temples, neighborhoods, and everyday moments when the city breathes.
          </p>
          <p className="text-sm text-muted-foreground">By Aiko Tanaka | May 10, 2024 | 6 min read</p>
          <p className="text-lg leading-8">
            Kyoto is famous for its temples and gardens, but some of its best moments
            happen between the big sights. On quiet mornings, the city invites you to
            move <WordMark kind="phrase" status="known">con calma</WordMark> and notice the small details.
          </p>
          <p className="text-lg leading-8">
            Start with a short <WordMark status="learning">lectura</WordMark> in a local cafe. A few pages
            can shift your mood for the whole day.
          </p>
          <p className="text-lg leading-8">
            Travel days go better with <WordMark kind="phrase" status="new">pequenas decisiones</WordMark>.
            Take the side street, choose the tiny shop, say yes to tea.
          </p>
          <p className="text-lg leading-8">
            Kyoto keeps things simple, and that's what <WordMark status="known">mantiene</WordMark> its charm.
          </p>
          <div className="h-72 rounded-lg border bg-[url('/design-assets/kyoto-slow-season.png')] bg-cover bg-center shadow-soft" />
        </section>
        <aside className="grid content-start gap-4">
          <Card className="grid gap-3">
            <h3 className="font-semibold">On this page</h3>
            <p className="text-sm text-muted-foreground">Morning quiet</p>
            <p className="text-sm text-muted-foreground">Neighborhood walks</p>
            <p className="text-sm text-muted-foreground">Food without crowds</p>
            <p className="text-sm text-muted-foreground">A simple plan</p>
          </Card>
          <Card className="grid gap-3">
            <h3 className="font-semibold">Simple travel, good stories</h3>
            <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 p-2 text-sm text-muted-foreground">
              <span>Email address</span>
              <ShadcnButton type="button" size="sm">Subscribe</ShadcnButton>
            </div>
          </Card>
        </aside>
      </main>
    </article>
  );
}

function HabitsArticle({ active }: { active: ArticleState }) {
  const sentence = active === "sentence";

  return (
    <article className={cn("min-h-[690px] bg-background", sentence && "bg-slate-50")}>
      {sentence ? (
        <header className="flex items-center justify-between gap-6 border-b bg-card px-10 py-5 text-sm">
          <strong>TravelMag</strong>
          <nav className="flex flex-wrap gap-5 text-muted-foreground">
            <span>Destinations</span>
            <span>Inspiration</span>
            <span>Guides</span>
            <span>About</span>
          </nav>
          <Icon name="spark" className="text-primary" />
        </header>
      ) : null}
      <main className="grid max-w-3xl gap-5 px-12 py-10">
        <h1 className="text-5xl font-semibold leading-tight tracking-normal">
          {sentence ? "The Art of Slow Travel" : "The Power of Small Habits"}
        </h1>
        {sentence ? (
          <p className="text-xl text-muted-foreground">Go gently. Notice more. Remember longer.</p>
        ) : null}
        <p className="text-sm text-muted-foreground">By Ana Lewis | May 10, 2024 | 5 min read</p>
        <p className="text-lg leading-8">Big changes don't happen overnight. Real progress comes from small, consistent actions.</p>
        <p className="text-lg leading-8">
          Start with a short <WordMark status="new">lectura</WordMark> each morning. Ten minutes is enough
          to reset your mind.
        </p>
        <p className="text-lg leading-8">
          The magic is in <WordMark kind="phrase" status="learning">pequenas decisiones</WordMark> you repeat
          every day.
        </p>
        <p className="text-lg leading-8">
          You don't need more time; you need focus, and the willingness to move{" "}
          <WordMark kind="phrase" status="known">con calma</WordMark>.
        </p>
        {sentence ? (
          <p className="text-lg leading-8">
            A few minutes of <WordMark status="learning">lectura</WordMark> can make the day feel slower.
            <ShadcnButton type="button" variant="secondary" size="icon" className="ml-2 size-8 rounded-full" aria-label="Open sentence help">
              <Icon name="spark" />
            </ShadcnButton>
          </p>
        ) : null}
        <p className="text-lg leading-8">Small steps, taken today, shape where you'll be tomorrow.</p>
      </main>
    </article>
  );
}

function WordHelpPopover() {
  return (
    <PopoverFrame className="left-[330px] top-[250px] w-[360px]">
      <header className="flex items-center gap-2">
        <Icon name="volume" className="text-primary" />
        <h3 className="text-lg font-semibold tracking-normal">lectura</h3>
        <Badge tone="accent">new</Badge>
        <PopoverCloseButton />
      </header>
      <TokenPair source="reading" target="lectura" />
      <p className="text-sm leading-6 text-muted-foreground">Used for reading or a piece of reading.</p>
      <div className="flex gap-2 rounded-md border bg-muted/30 p-3 text-sm">
        <Icon name="message" className="mt-0.5 shrink-0 text-primary" />
        <span>A short <strong>lectura</strong> in a cafe can reset the day.</span>
      </div>
      <div className="flex gap-2 rounded-md border bg-blue-50 p-3 text-sm text-blue-800">
        <Icon name="info" className="mt-0.5 shrink-0" />
        <span>Opening this helps ImmersionKit adapt.</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm">Still new</Button>
        <Button variant="secondary" size="sm">Practicing</Button>
        <Button variant="secondary" size="sm">Comfortable</Button>
      </div>
      <footer className="flex items-center justify-between gap-3 border-t pt-3 text-sm text-muted-foreground">
        <ShadcnButton type="button" variant="link" size="sm" className="h-auto px-0">
          <Icon name="eyeOff" />
          Hide word
        </ShadcnButton>
        <span className="flex items-center gap-1"><ImmersionLogo size="sm" /> ImmersionKit</span>
      </footer>
    </PopoverFrame>
  );
}

function PhraseHelpPopover() {
  return (
    <PopoverFrame className="left-[390px] top-[330px] w-[340px]">
      <header className="flex items-center gap-2">
        <Icon name="link" className="text-primary" />
        <h3 className="text-lg font-semibold tracking-normal">con calma</h3>
        <Badge tone="accent">phrase</Badge>
      </header>
      <TokenPair source="with calm" target="con calma" />
      <p className="text-sm leading-6 text-muted-foreground">A reusable phrase for doing something at an easy pace.</p>
      <div className="h-px bg-border" />
      <h4 className="flex items-center gap-2 font-semibold"><Icon name="spark" className="text-primary" /> Example</h4>
      <p className="text-sm leading-6">Read <strong>con calma</strong> when the page feels dense.</p>
      <div className="flex gap-2 rounded-md border bg-blue-50 p-3 text-sm text-blue-800">
        <Icon name="info" className="mt-0.5 shrink-0" />
        <span>You may see this again when it fits the page.</span>
      </div>
      <footer className="flex items-center justify-between gap-3 border-t pt-3">
        <ShadcnButton type="button" variant="ghost" size="sm">Hide phrase</ShadcnButton>
        <Button variant="secondary" size="sm">Got it</Button>
      </footer>
    </PopoverFrame>
  );
}

function SentenceHelpPopover() {
  return (
    <PopoverFrame className="right-12 top-28 w-[420px]" arrow={false}>
      <header className="flex items-center gap-2">
        <Icon name="book" className="text-primary" />
        <h3 className="text-lg font-semibold tracking-normal">Sentence help</h3>
        <Badge tone="accent">optional</Badge>
        <PopoverCloseButton />
      </header>
      <p className="text-sm text-muted-foreground">Uses OpenAI only when enabled.</p>
      <SentenceBlock label="Original" text="A few minutes of lectura can make the day feel slower." />
      <SentenceBlock label="Translation" text="Unos minutos de lectura pueden hacer que el dia se sienta mas lento." />
      <SentenceBlock label="Why this helps" text="Puede + infinitive expresses something can happen." />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" icon="translate">Translation</Button>
        <Button variant="secondary" size="sm" icon="document">Original</Button>
        <Button variant="secondary" size="sm" icon="info">Details</Button>
      </div>
      <LocalFooter text="Selected sentence only" compact />
    </PopoverFrame>
  );
}

function PopoverCloseButton() {
  return (
    <ShadcnButton type="button" variant="ghost" size="icon" className="ml-auto size-8" aria-label="Close help">
      <Icon name="close" />
    </ShadcnButton>
  );
}

function PopoverFrame({
  children,
  className,
  arrow = true
}: {
  children: ReactNode;
  className: string;
  arrow?: boolean;
}) {
  return (
    <section className={cn("absolute z-10 grid gap-3 rounded-lg border bg-popover p-4 text-popover-foreground shadow-panel", className)}>
      {arrow ? <span className="absolute -top-2 left-8 size-4 rotate-45 border-l border-t bg-popover" /> : null}
      {children}
    </section>
  );
}

function TokenPair({ source, target }: { source: string; target: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-md border bg-muted/30 p-3 text-sm">
      <span>{source}</span>
      <Icon name="chevron" className="text-muted-foreground" />
      <span className="font-semibold text-primary">{target}</span>
    </div>
  );
}
