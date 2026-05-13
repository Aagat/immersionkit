import type { ReactNode } from "react";
import {
  Badge,
  Button,
  Card,
  Icon,
  ImmersionLogo,
  WordMark
} from "../components/primitives";
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
          <div className="ik-ui-toast">
            <Icon name="check" />
            <span>Reading mode is on for this site</span>
            <Icon name="close" />
          </div>
        ) : null}
      </BrowserChrome>
    </ImmersionFrame>
  );
}

function TravelArticle() {
  return (
    <article className="ik-ui-travel-page">
      <header className="ik-ui-travel-nav">
        <strong>TRAVELMAG</strong>
        <nav>
          <span>Destinations</span>
          <span>Inspiration</span>
          <span>Guides</span>
          <span>About</span>
        </nav>
        <div className="ik-ui-search">Search...</div>
      </header>
      <main className="ik-ui-travel-grid">
        <section className="ik-ui-travel-copy">
          <p className="ik-ui-kicker">Guides</p>
          <h1>Kyoto in Slow Season: A Local's Guide</h1>
          <p className="ik-ui-subtitle">
            Enjoy temples, neighborhoods, and everyday moments when the city breathes.
          </p>
          <p className="ik-ui-byline">By Aiko Tanaka | May 10, 2024 | 6 min read</p>
          <p>
            Kyoto is famous for its temples and gardens, but some of its best moments
            happen between the big sights. On quiet mornings, the city invites you to
            move <WordMark kind="phrase" status="known">con calma</WordMark> and notice the small details.
          </p>
          <p>
            Start with a short <WordMark status="learning">lectura</WordMark> in a local cafe. A few pages
            can shift your mood for the whole day.
          </p>
          <p>
            Travel days go better with <WordMark kind="phrase" status="new">pequenas decisiones</WordMark>.
            Take the side street, choose the tiny shop, say yes to tea.
          </p>
          <p>
            Kyoto keeps things simple, and that's what <WordMark status="known">mantiene</WordMark> its charm.
          </p>
          <div className="ik-ui-article-photo" />
        </section>
        <aside className="ik-ui-travel-aside">
          <Card>
            <h3>On this page</h3>
            <p>Morning quiet</p>
            <p>Neighborhood walks</p>
            <p>Food without crowds</p>
            <p>A simple plan</p>
          </Card>
          <Card>
            <h3>Simple travel, good stories</h3>
            <div className="ik-ui-subscribe">
              <span>Email address</span>
              <button type="button">Subscribe</button>
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
    <article className={`ik-ui-habits-page${sentence ? " ik-ui-habits-page--sentence" : ""}`}>
      {sentence ? (
        <header className="ik-ui-travel-nav">
          <strong>TravelMag</strong>
          <nav>
            <span>Destinations</span>
            <span>Inspiration</span>
            <span>Guides</span>
            <span>About</span>
          </nav>
          <Icon name="spark" />
        </header>
      ) : null}
      <main>
        <h1>{sentence ? "The Art of Slow Travel" : "The Power of Small Habits"}</h1>
        {sentence ? <p className="ik-ui-subtitle">Go gently. Notice more. Remember longer.</p> : null}
        <p className="ik-ui-byline">By Ana Lewis | May 10, 2024 | 5 min read</p>
        <p>Big changes don't happen overnight. Real progress comes from small, consistent actions.</p>
        <p>
          Start with a short <WordMark status="new">lectura</WordMark> each morning. Ten minutes is enough
          to reset your mind.
        </p>
        <p>
          The magic is in <WordMark kind="phrase" status="learning">pequenas decisiones</WordMark> you repeat
          every day.
        </p>
        <p>
          You don't need more time; you need focus, and the willingness to move{" "}
          <WordMark kind="phrase" status="known">con calma</WordMark>.
        </p>
        {sentence ? (
          <p>
            A few minutes of <WordMark status="learning">lectura</WordMark> can make the day feel slower.
            <button type="button" className="ik-ui-sentence-chip" aria-label="Open sentence help">
              <Icon name="spark" />
            </button>
          </p>
        ) : null}
        <p>Small steps, taken today, shape where you'll be tomorrow.</p>
      </main>
    </article>
  );
}

function WordHelpPopover() {
  return (
    <PopoverFrame className="ik-ui-word-popover">
      <header className="ik-ui-popover-heading">
        <Icon name="volume" />
        <h3>lectura</h3>
        <Badge tone="accent">new</Badge>
        <PopoverCloseButton />
      </header>
      <TokenPair source="reading" target="lectura" />
      <p>Used for reading or a piece of reading.</p>
      <div className="ik-ui-example-line">
        <Icon name="message" />
        <span>A short <strong>lectura</strong> in a cafe can reset the day.</span>
      </div>
      <div className="ik-ui-info-line">
        <Icon name="info" />
        <span>Opening this helps ImmersionKit adapt.</span>
      </div>
      <div className="ik-ui-quiet-actions">
        <Button variant="secondary" size="sm">Still new</Button>
        <Button variant="secondary" size="sm">Practicing</Button>
        <Button variant="secondary" size="sm">Comfortable</Button>
      </div>
      <footer className="ik-ui-popover-footer">
        <button type="button" className="ik-ui-popover-link">
          <Icon name="eyeOff" />
          Hide word
        </button>
        <span><ImmersionLogo size="sm" /> ImmersionKit</span>
      </footer>
    </PopoverFrame>
  );
}

function PhraseHelpPopover() {
  return (
    <PopoverFrame className="ik-ui-phrase-popover">
      <header className="ik-ui-popover-heading">
        <Icon name="link" />
        <h3>con calma</h3>
        <Badge tone="accent">phrase</Badge>
      </header>
      <TokenPair source="with calm" target="con calma" />
      <p>A reusable phrase for doing something at an easy pace.</p>
      <div className="ik-ui-popover-rule" />
      <h4><Icon name="spark" /> Example</h4>
      <p>Read <strong>con calma</strong> when the page feels dense.</p>
      <div className="ik-ui-info-line">
        <Icon name="info" />
        <span>You may see this again when it fits the page.</span>
      </div>
      <footer className="ik-ui-popover-actions">
        <button type="button">Hide phrase</button>
        <Button variant="secondary" size="sm">Got it</Button>
      </footer>
    </PopoverFrame>
  );
}

function SentenceHelpPopover() {
  return (
    <PopoverFrame className="ik-ui-sentence-popover" arrow={false}>
      <header className="ik-ui-popover-heading">
        <Icon name="book" />
        <h3>Sentence help</h3>
        <Badge tone="accent">optional</Badge>
        <PopoverCloseButton />
      </header>
      <p>Uses OpenAI only when enabled.</p>
      <SentenceBlock label="Original" text="A few minutes of lectura can make the day feel slower." />
      <SentenceBlock label="Translation" text="Unos minutos de lectura pueden hacer que el dia se sienta mas lento." />
      <SentenceBlock label="Why this helps" text="Puede + infinitive expresses something can happen." />
      <div className="ik-ui-sentence-actions">
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
    <button type="button" className="ik-ui-popover-close" aria-label="Close help">
      <Icon name="close" />
    </button>
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
    <section className={`ik-ui-popover ${className}`}>
      {arrow ? <span className="ik-ui-popover-arrow" /> : null}
      {children}
    </section>
  );
}

function TokenPair({ source, target }: { source: string; target: string }) {
  return (
    <div className="ik-ui-token-pair">
      <span>{source}</span>
      <Icon name="chevron" />
      <span>{target}</span>
    </div>
  );
}
