import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  PhraseHelpPopoverContent,
  SentenceHelpPopoverContent,
  WordHelpPopoverContent
} from "./content-popovers";
import {
  BrowserChrome,
  IkIcon,
  ImmersionFrame,
  InlineMark,
} from "./screen-primitives";
import type { ArticleState } from "./types";

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
  return (
    <PopoverFrame className="top-[215px] md:left-[48%] md:right-auto md:w-[340px]">
      <WordHelpPopoverContent
        sourceText="reading"
        targetText="lectura"
        status="new"
        rationale="This word fits your current reading band and appeared in a safe local context."
        nativeExample="Una lectura corta en un cafe puede reiniciar el dia."
        englishExample="A short reading in a cafe can reset the day."
      />
    </PopoverFrame>
  );
}

function PhraseHelpPopover() {
  return (
    <PopoverFrame className="top-[260px] md:left-[44%] md:right-auto md:w-[340px]">
      <PhraseHelpPopoverContent
        sourceText="with calm"
        targetText="con calma"
        rationale="You may see this again when it fits the page."
        sentence="Read with calm when the page feels dense."
      />
    </PopoverFrame>
  );
}

function SentenceHelpPopover() {
  return (
    <PopoverFrame className="top-[120px] md:left-auto md:right-8 md:w-[440px]">
      <SentenceHelpPopoverContent
        sourceText="A few minutes of lectura can make the day feel slower."
        translatedText="Unos minutos de lectura pueden hacer que el dia se sienta mas lento."
        learningNote={{
          summary: "Puede + infinitive expresses something can happen.",
          grammarFocus: "Puede + infinitive expresses something can happen."
        }}
      />
    </PopoverFrame>
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
