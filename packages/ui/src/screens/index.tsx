import { useState } from "react";
import type { ReactNode } from "react";
import {
  Badge,
  Button,
  Card,
  Icon,
  IconButton,
  ImmersionLogo,
  ProgressBar,
  Toggle,
  WordMark
} from "../components/primitives";

export type PopupState = "supported" | "unsupported";
export type SiteControlState = "on" | "paused";
export type ArticleState = "supported" | "word" | "phrase" | "sentence";
export type OptionsSection = "General" | "Translation" | "Advanced";
type ReadingLevel = "Beginner" | "False beginner" | "Intermediate";

const settingsTabs: OptionsSection[] = ["General", "Translation", "Advanced"];

export function ExtensionPopup({
  state = "supported",
  initialSiteState = "on"
}: {
  state?: PopupState;
  initialSiteState?: SiteControlState;
}) {
  const [siteState, setSiteState] = useState<SiteControlState>(initialSiteState);
  const supported = state === "supported";
  const enabled = supported && siteState === "on";

  return (
    <ImmersionFrame variant="browser">
      <BrowserChrome
        title={supported ? "Kyoto in Slow Season" : "Settings"}
        url={supported ? "travelguide/kyoto" : "chrome://settings/privacy"}
        blurred
      >
        <div className="ik-ui-popup-anchor">
          <PopupPanel>
            <PopupHeader />
            {supported ? (
              <>
                <div className="ik-ui-band-hero">
                  <div className="ik-ui-band-icon">
                    <Icon name="book" />
                  </div>
                  <div>
                    <h2>Reading band 1</h2>
                    <p>Words + phrases</p>
                  </div>
                </div>
                <ProgressBar
                  value={38}
                  label="42 / 120 local signals"
                  detail="A few more reading signals will widen your band."
                />
                <div className="ik-ui-popup-rule" />
                <Card className={`ik-ui-site-card${enabled ? "" : " is-paused"}`}>
                  <div>
                    <Badge tone={enabled ? "accent" : "muted"}>
                      {enabled ? "On for this site" : "Paused for this site"}
                    </Badge>
                    <h1>
                      {enabled
                        ? "A few Spanish words will appear while you read."
                        : "Spanish words are paused on this site."}
                    </h1>
                  </div>
                  <button
                    type="button"
                    className={`ik-ui-power-button${enabled ? " is-on" : ""}`}
                    aria-label={enabled ? "Pause reading mode" : "Resume reading mode"}
                    aria-pressed={enabled}
                    onClick={() =>
                      setSiteState((value) => (value === "on" ? "paused" : "on"))
                    }
                  >
                    <Icon name="power" />
                  </button>
                </Card>
                <div className="ik-ui-metric-grid ik-ui-metric-grid--three">
                  <MetricStat label="Comfortable" value="0" icon="check" />
                  <MetricStat label="In practice" value="0" icon="pause" />
                  <MetricStat label="New today" value="0" icon="spark" />
                </div>
                <LocalFooter
                  text={
                    enabled
                      ? "Stored on this device. Sentence help is off."
                      : "Stored on this device. Reading mode is paused here."
                  }
                  action="Settings"
                />
                <Button
                  variant="primary"
                  icon={enabled ? undefined : "power"}
                  onClick={enabled ? undefined : () => setSiteState("on")}
                >
                  {enabled ? "Keep reading" : "Resume reading"}
                </Button>
                <button type="button" className="ik-ui-standalone-link">
                  Adjust pace
                </button>
              </>
            ) : (
              <>
                <div className="ik-ui-unsupported-block">
                  <Badge tone="muted">Unavailable here</Badge>
                  <h1>This page is not supported</h1>
                  <p>Open a normal HTTP(S) page to manage reading mode for that site.</p>
                  <button
                    type="button"
                    className="ik-ui-power-button ik-ui-power-button--disabled"
                    aria-label="Controls unavailable"
                    disabled
                  >
                    <Icon name="power" />
                  </button>
                  <span>Controls unavailable</span>
                </div>
                <Card className="ik-ui-note-card">
                  <Icon name="shield" />
                  <p>We skip private, browser, form-heavy, and sensitive pages.</p>
                </Card>
                <Card className="ik-ui-progress-card">
                  <div className="ik-ui-card-row">
                    <h3>Reading band 1</h3>
                    <span>42 / 120 local signals</span>
                  </div>
                  <ProgressBar
                    value={38}
                    detail="Your progress is saved and will be ready when you return to a supported page."
                  />
                </Card>
                <LocalFooter text="Your reading data stays on this device." />
                <Button variant="secondary">Open settings</Button>
              </>
            )}
          </PopupPanel>
        </div>
      </BrowserChrome>
    </ImmersionFrame>
  );
}

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

export function ExtensionOptions({
  initialSection = "General"
}: {
  initialSection?: OptionsSection;
}) {
  const [active, setActive] = useState<OptionsSection>(initialSection);

  return (
    <ImmersionFrame variant="settings">
      <BrowserChrome
        title="ImmersionKit Options"
        url={`chrome-extension://immersionkit/options.html${active === "Advanced" ? "#advanced" : ""}`}
        appFrame
      >
        <div className="ik-ui-options-layout">
          <OptionsSidebar active={active} setActive={setActive} />
          <main className="ik-ui-options-main">
            <OptionsHeader active={active} />
            <div className="ik-ui-tabs" role="tablist" aria-label="Options sections">
              {settingsTabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={tab === active ? "is-active" : ""}
                  aria-pressed={tab === active}
                  onClick={() => setActive(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>
            {active === "General" ? <OptionsGeneralPanel /> : null}
            {active === "Translation" ? <OptionsTranslationPanel /> : null}
            {active === "Advanced" ? <OptionsAdvancedPanel /> : null}
          </main>
        </div>
      </BrowserChrome>
    </ImmersionFrame>
  );
}

function ImmersionFrame({
  children,
  variant
}: {
  children: ReactNode;
  variant: "settings" | "browser";
}) {
  return <div className={`ik-ui-frame ik-ui-frame--${variant}`}>{children}</div>;
}

function BrowserChrome({
  children,
  title,
  url,
  blurred = false,
  appFrame = false
}: {
  children: ReactNode;
  title: string;
  url: string;
  blurred?: boolean;
  appFrame?: boolean;
}) {
  return (
    <div className={`ik-ui-browser${appFrame ? " ik-ui-browser--app" : ""}`}>
      <div className="ik-ui-browser-tabs">
        <div className="ik-ui-window-controls">
          <span />
          <span />
          <span />
        </div>
        <div className="ik-ui-browser-tab">
          <ImmersionLogo size="sm" />
          <span>{title}</span>
          <Icon name="close" />
        </div>
        <button type="button" className="ik-ui-tab-plus" aria-label="New tab">
          +
        </button>
      </div>
      <div className="ik-ui-browser-bar">
        <div className="ik-ui-browser-nav">{"<"} &nbsp; {">"} &nbsp; C</div>
        <div className="ik-ui-address">{url}</div>
        <Icon name="spark" />
        <div className="ik-ui-toolbar-logo is-active">
          <ImmersionLogo size="sm" />
        </div>
        <span className="ik-ui-menu-dots">...</span>
      </div>
      <div className={`ik-ui-browser-body${blurred ? " ik-ui-browser-body--blurred" : ""}`}>
        {blurred ? <BlurredPage supported={url !== "chrome://settings/privacy"} /> : null}
        {children}
      </div>
    </div>
  );
}

function BlurredPage({ supported }: { supported: boolean }) {
  if (!supported) {
    return (
      <div className="ik-ui-settings-blur">
        <h2>Settings</h2>
        {[
          "You and Google",
          "Autofill and passwords",
          "Privacy and security",
          "Performance",
          "Appearance",
          "Search engine",
          "Default browser",
          "On startup",
          "Languages",
          "Downloads",
          "Accessibility",
          "System",
          "Reset settings",
          "Extensions"
        ].map((item) => (
          <p key={item}>{item}</p>
        ))}
      </div>
    );
  }

  return (
    <div className="ik-ui-travel-blur">
      <h2>Kyoto in Slow Season</h2>
      <p>Enjoy temples, neighborhoods, and everyday moments when the city breathes.</p>
      <p>Kyoto is famous for its temples and gardens, but some of its best moments happen between the big sights.</p>
      <div className="ik-ui-article-photo" />
    </div>
  );
}

function PopupPanel({ children }: { children: ReactNode }) {
  return <section className="ik-ui-popup">{children}</section>;
}

function PopupHeader() {
  return (
    <header className="ik-ui-popup-header">
      <div className="ik-ui-brand">
        <ImmersionLogo />
        <span>ImmersionKit</span>
      </div>
      <IconButton label="Open settings" icon="gear" />
    </header>
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

function OptionsSidebar({
  active,
  setActive
}: {
  active: OptionsSection;
  setActive: (section: OptionsSection) => void;
}) {
  return (
    <aside className="ik-ui-options-sidebar">
      <div className="ik-ui-brand ik-ui-brand--large">
        <ImmersionLogo />
        <span>ImmersionKit</span>
      </div>
      <nav aria-label="Options navigation">
        {settingsTabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={tab === active ? "is-active" : ""}
            onClick={() => setActive(tab)}
          >
            <Icon name={tab === "General" ? "gear" : tab === "Translation" ? "link" : "band"} />
            {tab}
          </button>
        ))}
      </nav>
      {active === "Advanced" ? (
        <div className="ik-ui-subnav">
          <strong>Saved choices</strong>
          <span>Learning modes</span>
          <span>Reading band</span>
          <span>Pace & display</span>
          <span>Keyboard shortcuts</span>
        </div>
      ) : null}
      <div className="ik-ui-sidebar-note">
        <Icon name="lock" />
        <p>{active === "Advanced" ? "Private by default" : "Progress is stored on this device."}</p>
      </div>
    </aside>
  );
}

function OptionsHeader({ active }: { active: OptionsSection }) {
  const copy = {
    General: [
      "Make reading feel guided, not crowded.",
      "Tune how much Spanish appears while keeping normal reading first."
    ],
    Translation: [
      "Sentence help is optional.",
      "Vocabulary help works locally. Sentence notes can use a provider only after setup."
    ],
    Advanced: [
      "Every intervention is reversible.",
      "Manage paused sites, hidden words, and local reading choices."
    ]
  }[active];

  return (
    <header className="ik-ui-options-header">
      <div>
        <h1>{copy[0]}</h1>
        <p>{copy[1]}</p>
      </div>
      <div className="ik-ui-quiet-actions">
        <Button variant="primary">Save changes</Button>
        <Button variant="secondary" icon="spark">Reload</Button>
      </div>
    </header>
  );
}

function OptionsGeneralPanel() {
  const [readingLevel, setReadingLevel] = useState<ReadingLevel>("False beginner");

  return (
    <div className="ik-ui-options-panel">
      <div className="ik-ui-settings-grid ik-ui-settings-grid--two">
        <Card>
          <div className="ik-ui-card-row">
            <h2>New word pace</h2>
            <Badge tone="accent">Gentle pace</Badge>
          </div>
          <p>Choose how many new Spanish words appear while you read.</p>
          <div className="ik-ui-slider-row">
            <input type="range" min={0} max={20} value={8} readOnly />
            <strong>8%</strong>
          </div>
          <div className="ik-ui-scale">
            <span>Subtle</span>
            <span>Balanced</span>
            <span>Bold</span>
          </div>
        </Card>
        <Card>
          <h2>Starting point</h2>
          <p>Pick the option that best matches your current reading in Spanish.</p>
          <div className="ik-ui-choice-grid ik-ui-choice-grid--three" role="radiogroup" aria-label="Reading level">
            <Choice
              title="Beginner"
              copy="Just starting. Simple words and phrases."
              selected={readingLevel === "Beginner"}
              onSelect={() => setReadingLevel("Beginner")}
            />
            <Choice
              title="False beginner"
              copy="I know some basics but need more exposure."
              selected={readingLevel === "False beginner"}
              onSelect={() => setReadingLevel("False beginner")}
            />
            <Choice
              title="Intermediate"
              copy="Comfortable with most everyday reading."
              selected={readingLevel === "Intermediate"}
              onSelect={() => setReadingLevel("Intermediate")}
            />
          </div>
        </Card>
      </div>
      <div className="ik-ui-settings-grid ik-ui-settings-grid--two">
        <Card>
          <h2>Learning snapshot</h2>
          <p>Your progress while reading across sites.</p>
          <div className="ik-ui-metric-grid ik-ui-metric-grid--four">
            <MetricStat label="Comfortable" value="18" icon="check" />
            <MetricStat label="In practice" value="43" icon="spark" />
            <MetricStat label="Still new" value="72" icon="band" />
            <MetricStat label="Tracked total" value="133" icon="book" />
          </div>
        </Card>
        <Card>
          <div className="ik-ui-card-row">
            <div>
              <h2>Reading band</h2>
              <p>Grow your reading range as you see more in context.</p>
            </div>
            <span>86 / 120 local signals</span>
          </div>
          <ProgressBar value={72} />
          <div className="ik-ui-band-step">
            <span>Band 1</span>
            <Icon name="chevron" />
            <span>Band 2</span>
            <Button variant="secondary" disabled icon="lock">Widen reading band</Button>
          </div>
        </Card>
      </div>
      <div className="ik-ui-settings-grid ik-ui-settings-grid--two">
        <Card>
          <h2>Site controls</h2>
          <p>Decide where ImmersionKit is active.</p>
          <div className="ik-ui-inline-summary">
            <MetricStat label="saved choices" value="2" icon="link" />
            <MetricStat label="paused site" value="1" icon="pause" />
            <Button variant="secondary">Manage saved sites</Button>
          </div>
        </Card>
        <div className="ik-ui-soft-callout">
          <Icon name="band" />
          <div>
            <strong>Small steps add up.</strong>
            <p>You can always adjust these settings as your reading grows.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function OptionsTranslationPanel() {
  return (
    <div className="ik-ui-options-panel ik-ui-options-panel--translation">
      <div className="ik-ui-warning-banner">
        <Icon name="shield" />
        Add a valid OpenAI API key before turning sentence help on.
      </div>
      <div className="ik-ui-settings-grid ik-ui-settings-grid--two">
        <div className="ik-ui-settings-stack">
          <Card className="ik-ui-switch-row">
            <div>
              <h2>Sentence help</h2>
              <p>Show selected sentence translations and short grammar notes after provider setup.</p>
            </div>
            <Toggle checked={false} label="Enable sentence help" />
            <span>Off</span>
          </Card>
          <Card className="ik-ui-note-card ik-ui-note-card--blue">
            <Icon name="lock" />
            <p>
              Selected sentence text is sent to OpenAI only when sentence help is enabled.
              Page text is not sent automatically.
            </p>
          </Card>
          <Card>
            <h2>Provider</h2>
            <p>Choose a provider for sentence help.</p>
            <label className="ik-ui-field">
              <select defaultValue="none">
                <option value="none">None</option>
                <option value="openai">OpenAI</option>
              </select>
            </label>
          </Card>
          <Card>
            <div className="ik-ui-card-row">
              <h2>OpenAI API key</h2>
              <Badge tone="danger">Needs key</Badge>
            </div>
            <p>Enter your OpenAI API key.</p>
            <label className="ik-ui-field">
              <input placeholder="sk-..." type="password" />
            </label>
            <div className="ik-ui-quiet-actions">
              <Button variant="secondary" size="sm">Show</Button>
              <Button variant="secondary" size="sm">Clear</Button>
            </div>
          </Card>
        </div>
        <div className="ik-ui-settings-stack">
          <Card>
            <h2>Sentence note preview</h2>
            <p>This is an example of what you'll see.</p>
            <div className="ik-ui-note-preview">
              <header>
                <Icon name="spark" />
                <span>Sentence help</span>
                <Icon name="close" />
              </header>
              <SentenceBlock label="Original" text="Me tomo un momento para respirar." />
              <SentenceBlock label="Translation" text="I take a moment to breathe." />
              <div className="ik-ui-grammar-hint">
                <Icon name="spark" />
                <span>Take a moment to + verb is a common pattern for making time for an action.</span>
              </div>
            </div>
          </Card>
          <div className="ik-ui-soft-callout">
            <Icon name="check" />
            <p>You can turn sentence help on or off any time. Vocabulary help will keep working locally.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function OptionsAdvancedPanel() {
  return (
    <div className="ik-ui-options-panel">
      <div className="ik-ui-settings-grid ik-ui-settings-grid--two">
        <Card>
          <h2>Saved site decisions</h2>
          <p>Choose where ImmersionKit is on or paused.</p>
          <SavedRow title="example.com" status="On" action="Adjust" />
          <SavedRow title="news.example" status="Paused" action="Resume" />
          <SavedRow title="docs.example" status="Paused" action="Resume" />
          <div className="ik-ui-card-actions">
            <button type="button">Add site rule</button>
            <button type="button">View all sites</button>
          </div>
        </Card>
        <Card>
          <h2>Hidden words</h2>
          <p>Words you've hidden while reading.</p>
          <SavedRow title="lectura" detail={'hidden from "reading"'} action="Restore" />
          <SavedRow title="mantiene" detail={'hidden from "keeps"'} action="Restore" />
          <button type="button" className="ik-ui-wide-row">View all hidden words</button>
        </Card>
      </div>
      <div className="ik-ui-settings-grid ik-ui-settings-grid--two">
        <Card className="ik-ui-note-card">
          <Icon name="shield" />
          <div>
            <h2>Sensitive pages</h2>
            <p>ImmersionKit skips private, browser, form-heavy, and sensitive pages.</p>
            <div className="ik-ui-info-box">You're always in control. Nothing is changed on these pages.</div>
          </div>
        </Card>
        <Card className="ik-ui-note-card">
          <Icon name="lock" />
          <div>
            <h2>Local data</h2>
            <p>Settings, site choices, vocabulary state, phrases, and review history stay on this device.</p>
            <div className="ik-ui-quiet-actions">
              <Button variant="secondary" size="sm">Export backup</Button>
              <Button variant="secondary" size="sm">Reset preview data</Button>
            </div>
            <span className="ik-ui-small-note">No account. No cloud. Yours only.</span>
          </div>
        </Card>
      </div>
      <Card className="ik-ui-collapsed">
        <div>
          <h2>Advanced diagnostics <Badge tone="accent">Optional</Badge></h2>
          <p>For support and release validation.</p>
        </div>
        <Icon name="chevron" />
      </Card>
    </div>
  );
}

function MetricStat({
  label,
  value,
  icon
}: {
  label: string;
  value: string | number;
  icon: Parameters<typeof Icon>[0]["name"];
}) {
  return (
    <div className="ik-ui-metric">
      <Icon name={icon} />
      <div>
        <p>{value}</p>
        <span>{label}</span>
      </div>
    </div>
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

function SentenceBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="ik-ui-sentence-block">
      <p>{label}</p>
      <span>{text}</span>
    </div>
  );
}

function Choice({
  title,
  copy,
  selected = false,
  onSelect
}: {
  title: ReadingLevel;
  copy: string;
  selected?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`ik-ui-choice${selected ? " is-selected" : ""}`}
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
    >
      <span className="ik-ui-radio" />
      <strong>{title}</strong>
      <small>{copy}</small>
    </button>
  );
}

function SavedRow({
  title,
  detail,
  status,
  action
}: {
  title: string;
  detail?: string;
  status?: string;
  action: string;
}) {
  return (
    <div className="ik-ui-saved-row">
      <div>
        <strong>{title}</strong>
        {detail ? <span>{detail}</span> : null}
      </div>
      {status ? <Badge tone={status === "On" ? "accent" : "warning"}>{status}</Badge> : null}
      <Button variant="secondary" size="sm">{action}</Button>
    </div>
  );
}

function LocalFooter({
  text,
  action,
  compact = false
}: {
  text: string;
  action?: string;
  compact?: boolean;
}) {
  return (
    <footer className={`ik-ui-local-footer${compact ? " ik-ui-local-footer--compact" : ""}`}>
      <Icon name="lock" />
      <span>{text}</span>
      {action ? <button type="button">{action}</button> : null}
    </footer>
  );
}
