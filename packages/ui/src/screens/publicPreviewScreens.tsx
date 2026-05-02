import {
  Badge,
  BrowserShell,
  Button,
  Card,
  Icon,
  IconButton,
  ImmersionLogo,
  MetricCard,
  Popover,
  PopupShell,
  ProgressBar,
  ProgressRing,
  SectionHeader,
  Tabs,
  Toggle,
  WordMark
} from "../components/primitives";
import type { ReactNode } from "react";

const settingsTabs = ["General", "Translation", "Advanced"];

export function SupportedSitePopupScreen() {
  return (
    <PublicPreviewFrame variant="browser">
      <BrowserBackdrop>
        <PopupShell>
          <PopupHeader />
          <div className="ik-ui-popup-band">
            <div>
              <p>Reading band 1</p>
              <span>Words + phrases</span>
            </div>
            <Badge tone="accent" icon="check">
              On
            </Badge>
          </div>
          <ProgressBar
            value={38}
            label="42 / 120 local signals"
            detail="A few more signals will widen your band."
          />
          <Card className="ik-ui-site-card">
            <div>
              <Badge tone="accent">On for this site</Badge>
              <h1>A few Spanish words will appear while you read.</h1>
            </div>
            <Toggle checked label="Pause reading mode on this site" />
          </Card>
          <div className="ik-ui-metric-grid ik-ui-metric-grid--three">
            <MetricCard label="Comfortable" value="0" icon="check" />
            <MetricCard label="In practice" value="0" icon="book" />
            <MetricCard label="New today" value="0" icon="spark" />
          </div>
          <div className="ik-ui-popup-actions">
            <Button variant="primary" icon="chevron">
              Keep reading
            </Button>
            <Button variant="ghost" size="sm">
              Adjust pace
            </Button>
          </div>
          <LocalFooter text="Stored on this device. Sentence help is off." />
        </PopupShell>
      </BrowserBackdrop>
    </PublicPreviewFrame>
  );
}

export function UnsupportedPagePopupScreen() {
  return (
    <PublicPreviewFrame variant="browser">
      <BrowserBackdrop url="chrome://settings/privacy">
        <PopupShell>
          <PopupHeader />
          <Card className="ik-ui-empty-state">
            <Badge tone="muted" icon="shield">
              Unavailable here
            </Badge>
            <h1>This page is not supported</h1>
            <p>Open a normal HTTP(S) page to manage reading mode for that site.</p>
            <div className="ik-ui-disabled-toggle">
              <Toggle checked={false} label="Controls unavailable" disabled />
              <span>Controls unavailable</span>
            </div>
          </Card>
          <Card className="ik-ui-note-card">
            <Icon name="shield" />
            <p>We skip private, browser, form-heavy, and sensitive pages.</p>
          </Card>
          <ProgressBar value={38} label="Reading band 1" detail="42 / 120 local signals" />
          <Button variant="secondary">Open settings</Button>
          <LocalFooter text="Your reading data stays on this device." />
        </PopupShell>
      </BrowserBackdrop>
    </PublicPreviewFrame>
  );
}

export function SupportedArticleScreen() {
  return (
    <PublicPreviewFrame variant="browser">
      <BrowserShell>
        <ArticleLayout>
          <div className="ik-ui-toast">
            <Icon name="check" />
            Reading mode is on for this site
          </div>
          <ArticleContent />
        </ArticleLayout>
      </BrowserShell>
    </PublicPreviewFrame>
  );
}

export function InlineWordHelpScreen() {
  return (
    <PublicPreviewFrame variant="browser">
      <BrowserShell>
        <ArticleLayout>
          <ArticleContent active="word" />
          <Popover className="ik-ui-word-popover">
            <div className="ik-ui-popover-title">
              <Icon name="volume" />
              <div>
                <h3>lectura</h3>
                <Badge tone="info">learning</Badge>
              </div>
            </div>
            <TokenPair source="reading" target="lectura" />
            <p className="ik-ui-popover-copy">
              Used for reading or a piece of reading.
            </p>
            <p className="ik-ui-example">
              A short lectura in a cafe can reset the day.
            </p>
            <p className="ik-ui-muted-note">
              Opening this helps ImmersionKit adapt.
            </p>
            <div className="ik-ui-quiet-actions">
              <Button variant="chip" size="sm">
                Still new
              </Button>
              <Button variant="chip" size="sm">
                Practicing
              </Button>
              <Button variant="chip" size="sm">
                Comfortable
              </Button>
            </div>
            <button type="button" className="ik-ui-text-link">
              Hide word
            </button>
          </Popover>
        </ArticleLayout>
      </BrowserShell>
    </PublicPreviewFrame>
  );
}

export function PhraseHelpScreen() {
  return (
    <PublicPreviewFrame variant="browser">
      <BrowserShell>
        <ArticleLayout>
          <ArticleContent active="phrase" />
          <Popover className="ik-ui-phrase-popover">
            <div className="ik-ui-popover-title">
              <Icon name="link" />
              <div>
                <h3>con calma</h3>
                <Badge tone="accent">phrase</Badge>
              </div>
            </div>
            <TokenPair source="with calm" target="con calma" />
            <p className="ik-ui-popover-copy">
              A reusable phrase for doing something at an easy pace.
            </p>
            <p className="ik-ui-example">Read con calma when the page feels dense.</p>
            <p className="ik-ui-muted-note">
              You may see this again when it fits the page.
            </p>
            <div className="ik-ui-quiet-actions">
              <Button variant="secondary" size="sm">
                Got it
              </Button>
              <Button variant="ghost" size="sm">
                Hide phrase
              </Button>
            </div>
          </Popover>
        </ArticleLayout>
      </BrowserShell>
    </PublicPreviewFrame>
  );
}

export function SentenceHelpScreen() {
  return (
    <PublicPreviewFrame variant="browser">
      <BrowserShell>
        <ArticleLayout>
          <ArticleContent active="sentence" />
          <Popover className="ik-ui-sentence-popover">
            <div className="ik-ui-popover-title">
              <Icon name="spark" />
              <div>
                <h3>Sentence help</h3>
                <Badge tone="info">optional</Badge>
              </div>
            </div>
            <p className="ik-ui-muted-note">Uses OpenAI only when enabled.</p>
            <div className="ik-ui-segmented">
              <button type="button" className="is-active">
                Translation
              </button>
              <button type="button">Original</button>
              <button type="button">Details</button>
            </div>
            <SentenceBlock
              label="Original"
              text="A few minutes of lectura can make the day feel slower."
            />
            <SentenceBlock
              label="Translation"
              text="Unos minutos de lectura pueden hacer que el dia se sienta mas lento."
            />
            <SentenceBlock
              label="Why this helps"
              text="Puede + infinitive expresses that something can happen."
            />
            <LocalFooter text="Selected sentence only." compact />
          </Popover>
        </ArticleLayout>
      </BrowserShell>
    </PublicPreviewFrame>
  );
}

export function OptionsGeneralScreen() {
  return (
    <PublicPreviewFrame>
      <SettingsShell active="General">
        <SettingsHero
          title="Make reading feel guided, not crowded."
          copy="Tune how much Spanish appears while keeping normal reading first."
        />
        <div className="ik-ui-settings-grid ik-ui-settings-grid--two">
          <Card>
            <SectionHeader
              eyebrow="Reading feel"
              title="New word pace"
              action={<Badge tone="accent">Gentle pace</Badge>}
            />
            <div className="ik-ui-slider-readout">
              <strong>8%</strong>
              <span>Show new words</span>
            </div>
            <input type="range" min={0} max={20} value={8} readOnly />
            <div className="ik-ui-scale">
              <span>Subtle</span>
              <span>Balanced</span>
              <span>Bold</span>
            </div>
          </Card>
          <Card>
            <SectionHeader eyebrow="Starting point" title="Reading level" />
            <div className="ik-ui-choice-grid">
              <Choice title="Beginner" copy="Start with the most familiar words." />
              <Choice
                title="False beginner"
                copy="You know basics, but want help seeing them in real pages."
                selected
              />
              <Choice title="Intermediate" copy="Bring in wider everyday language." />
            </div>
          </Card>
        </div>
        <div className="ik-ui-settings-grid ik-ui-settings-grid--two">
          <Card>
            <SectionHeader eyebrow="Your progress" title="Learning snapshot" />
            <div className="ik-ui-metric-grid ik-ui-metric-grid--four">
              <MetricCard label="Comfortable" value="18" />
              <MetricCard label="In practice" value="43" />
              <MetricCard label="Still new" value="72" />
              <MetricCard label="Tracked total" value="133" />
            </div>
          </Card>
          <Card>
            <SectionHeader
              eyebrow="Reading band"
              title="Ready for what is next?"
              action={<ProgressRing value={72} label="local" />}
            />
            <ProgressBar
              value={72}
              label="Band 1 -> Band 2"
              detail="86 / 120 local signals"
            />
            <p className="ik-ui-card-copy">
              ImmersionKit can widen the reading band when local evidence is ready.
            </p>
            <Button variant="secondary" disabled>
              Widen reading band
            </Button>
          </Card>
        </div>
        <Card>
          <SectionHeader
            eyebrow="Site controls"
            title="Saved choices"
            action={<Badge tone="muted">2 saved</Badge>}
          />
          <div className="ik-ui-inline-summary">
            <MetricCard label="Paused site" value="1" icon="pause" />
            <Button variant="secondary">Manage saved sites</Button>
          </div>
          <LocalFooter text="Progress is stored on this device." compact />
        </Card>
      </SettingsShell>
    </PublicPreviewFrame>
  );
}

export function OptionsTranslationScreen() {
  return (
    <PublicPreviewFrame>
      <SettingsShell active="Translation">
        <SettingsHero
          title="Sentence help is optional."
          copy="Vocabulary help works locally. Sentence notes can use a provider only after setup."
        />
        <Card>
          <SectionHeader
            eyebrow="Sentence help"
            title="Translation and grammar notes"
            action={<Badge tone="muted">Off</Badge>}
          />
          <div className="ik-ui-switch-row">
            <div>
              <h3>Enable sentence help</h3>
              <p>Show selected sentence translations and short grammar notes.</p>
            </div>
            <Toggle checked={false} label="Enable sentence help" />
          </div>
        </Card>
        <Card className="ik-ui-note-card">
          <Icon name="lock" />
          <p>
            Selected sentence text is sent to OpenAI only when sentence help is
            enabled. Page text is not sent automatically.
          </p>
        </Card>
        <div className="ik-ui-settings-grid ik-ui-settings-grid--two">
          <Card>
            <SectionHeader eyebrow="Provider" title="Connection" />
            <label className="ik-ui-field">
              <span>Provider</span>
              <select defaultValue="none">
                <option>None</option>
                <option>OpenAI</option>
              </select>
            </label>
          </Card>
          <Card>
            <SectionHeader
              eyebrow="API key"
              title="Credentials"
              action={<Badge tone="muted">Needs key</Badge>}
            />
            <label className="ik-ui-field">
              <span>OpenAI API key</span>
              <input placeholder="sk-..." type="password" />
            </label>
            <div className="ik-ui-quiet-actions">
              <Button variant="secondary" size="sm">
                Show
              </Button>
              <Button variant="ghost" size="sm">
                Clear
              </Button>
            </div>
          </Card>
        </div>
        <div className="ik-ui-error-banner">
          Add a valid OpenAI API key before turning sentence help on.
        </div>
        <Card>
          <SectionHeader eyebrow="Preview" title="Sentence note" />
          <SentenceBlock
            label="Original"
            text="A few minutes of lectura can make the day feel slower."
          />
          <SentenceBlock
            label="Translation"
            text="Unos minutos de lectura pueden hacer que el dia se sienta mas lento."
          />
          <SentenceBlock
            label="Hint"
            text="Puede + infinitive expresses that something can happen."
          />
        </Card>
      </SettingsShell>
    </PublicPreviewFrame>
  );
}

export function RecoverabilityScreen() {
  return (
    <PublicPreviewFrame>
      <SettingsShell active="Advanced" subnav="Saved choices">
        <SettingsHero
          title="Every intervention is reversible."
          copy="Manage paused sites, hidden words, and local reading choices."
        />
        <div className="ik-ui-settings-grid ik-ui-settings-grid--two">
          <Card>
            <SectionHeader
              eyebrow="Site choices"
              title="Saved site decisions"
              action={<Badge tone="muted">3 total</Badge>}
            />
            <SavedRow title="example.com" status="On" tone="accent" action="Manage" />
            <SavedRow title="news.example" status="Paused" tone="muted" action="Resume" />
            <SavedRow title="docs.example" status="Paused" tone="muted" action="Resume" />
          </Card>
          <Card>
            <SectionHeader eyebrow="Hidden words" title="Recover vocabulary" />
            <SavedRow title="lectura" detail="Hidden from reading" action="Restore" />
            <SavedRow title="mantiene" detail="Hidden from keeps" action="Restore" />
          </Card>
        </div>
        <div className="ik-ui-settings-grid ik-ui-settings-grid--two">
          <Card className="ik-ui-note-card">
            <Icon name="shield" />
            <div>
              <h3>Sensitive pages</h3>
              <p>
                ImmersionKit skips private, browser, form-heavy, and sensitive pages.
              </p>
            </div>
          </Card>
          <Card className="ik-ui-note-card">
            <Icon name="lock" />
            <div>
              <h3>Local data</h3>
              <p>
                Settings, site choices, vocabulary state, phrases, and review history
                stay on this device.
              </p>
              <div className="ik-ui-quiet-actions">
                <Button variant="secondary" size="sm">
                  Export backup
                </Button>
                <Button variant="ghost" size="sm">
                  Reset preview data
                </Button>
              </div>
            </div>
          </Card>
        </div>
        <Card className="ik-ui-collapsed">
          <div>
            <h3>Advanced diagnostics</h3>
            <p>For support and release validation.</p>
          </div>
          <Icon name="chevron" />
        </Card>
      </SettingsShell>
    </PublicPreviewFrame>
  );
}

export const publicPreviewScreens = [
  { id: "popup-supported-site", title: "Supported site popup", component: SupportedSitePopupScreen },
  { id: "popup-unsupported-page", title: "Unsupported page popup", component: UnsupportedPagePopupScreen },
  { id: "supported-article", title: "Supported article", component: SupportedArticleScreen },
  { id: "inline-word-help", title: "Inline word help", component: InlineWordHelpScreen },
  { id: "phrase-help", title: "Phrase help", component: PhraseHelpScreen },
  { id: "sentence-help", title: "Sentence help", component: SentenceHelpScreen },
  { id: "options-general", title: "Options general", component: OptionsGeneralScreen },
  { id: "options-translation", title: "Options translation", component: OptionsTranslationScreen },
  { id: "recoverability", title: "Recoverability", component: RecoverabilityScreen }
] as const;

function PublicPreviewFrame({
  children,
  variant = "settings"
}: {
  children: ReactNode;
  variant?: "settings" | "browser";
}) {
  return <div className={`ik-ui-frame ik-ui-frame--${variant}`}>{children}</div>;
}

function BrowserBackdrop({
  children,
  url = "reading.example/guide"
}: {
  children: ReactNode;
  url?: string;
}) {
  return (
    <BrowserShell url={url}>
      <div className="ik-ui-blurred-article">
        <ArticleContent />
      </div>
      <div className="ik-ui-popup-anchor">{children}</div>
    </BrowserShell>
  );
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

function SettingsShell({
  children,
  active,
  subnav
}: {
  children: ReactNode;
  active: string;
  subnav?: string;
}) {
  return (
    <div className="ik-ui-settings-shell">
      <aside className="ik-ui-settings-side">
        <div className="ik-ui-brand ik-ui-brand--large">
          <ImmersionLogo />
          <span>ImmersionKit</span>
        </div>
        <p>Public preview controls</p>
        {subnav ? <Badge tone="info">{subnav}</Badge> : null}
      </aside>
      <main className="ik-ui-settings-main">
        <Tabs tabs={settingsTabs} active={active} />
        {children}
      </main>
    </div>
  );
}

function SettingsHero({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="ik-ui-settings-hero">
      <div>
        <h1>{title}</h1>
        <p>{copy}</p>
      </div>
      <div className="ik-ui-quiet-actions">
        <Button variant="primary">Save changes</Button>
        <Button variant="secondary">Reload</Button>
      </div>
    </div>
  );
}

function ArticleLayout({ children }: { children: ReactNode }) {
  return (
    <div className="ik-ui-article-layout">
      <aside>
        <span>Guide</span>
        <strong>Reading notes</strong>
        <p>Navigation, forms, and private areas stay untouched.</p>
      </aside>
      <article>{children}</article>
    </div>
  );
}

function ArticleContent({ active }: { active?: "word" | "phrase" | "sentence" }) {
  return (
    <>
      <p className="ik-ui-kicker">Everyday reading</p>
      <h1>Small decisions that make an ordinary page easier to finish</h1>
      <p>
        A few minutes of{" "}
        <WordMark kind="word">{active === "word" ? "lectura" : "lectura"}</WordMark>{" "}
        can change how a busy day feels. The goal is not to translate the page,
        but to let useful Spanish appear inside the text you already wanted to read.
      </p>
      <p>
        When the paragraph gets dense, keep going{" "}
        <WordMark kind="phrase">con calma</WordMark>. Good replacements preserve
        meaning, skip uncertain cases, and keep the original page stable.
      </p>
      <p>
        ImmersionKit notices{" "}
        <WordMark kind="phrase">pequenas decisiones</WordMark> as you read and{" "}
        <WordMark kind="word">mantiene</WordMark> the experience light.
        {active === "sentence" ? (
          <button type="button" className="ik-ui-sentence-chip">
            sentence help
          </button>
        ) : null}
      </p>
      <div className="ik-ui-article-photo" />
    </>
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
  selected = false
}: {
  title: string;
  copy: string;
  selected?: boolean;
}) {
  return (
    <button
      type="button"
      className={`ik-ui-choice${selected ? " is-selected" : ""}`}
    >
      <strong>{title}</strong>
      <span>{copy}</span>
    </button>
  );
}

function SavedRow({
  title,
  detail,
  status,
  tone = "muted",
  action
}: {
  title: string;
  detail?: string;
  status?: string;
  tone?: "accent" | "muted";
  action: string;
}) {
  return (
    <div className="ik-ui-saved-row">
      <div>
        <strong>{title}</strong>
        {detail ? <span>{detail}</span> : null}
      </div>
      {status ? <Badge tone={tone}>{status}</Badge> : null}
      <Button variant="ghost" size="sm">
        {action}
      </Button>
    </div>
  );
}

function LocalFooter({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <footer className={`ik-ui-local-footer${compact ? " ik-ui-local-footer--compact" : ""}`}>
      <Icon name="lock" />
      <span>{text}</span>
    </footer>
  );
}
