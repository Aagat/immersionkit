import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  Icon,
  ImmersionLogo,
  ProgressBar,
  Toggle
} from "../components/primitives";
import {
  BrowserChrome,
  ImmersionFrame,
  MetricStat,
  SentenceBlock
} from "./screen-primitives";
import {
  settingsTabs,
  type ExtensionOptionsProps,
  type OptionsSection,
  type ReadingLevel
} from "./types";

export function ExtensionOptions({
  initialSection = "General",
  activeSection,
  chromeFrame = true,
  showAdvanced = true,
  firstRunIntro = false,
  statusMessage,
  errorMessage,
  isSaving = false,
  isLoading = false,
  discoveryRatePercent = 8,
  readingLevel,
  stats,
  checkpoint,
  sentenceHelpEnabled = false,
  provider = "none",
  apiKey = "",
  apiKeyValid = false,
  showApiKey = false,
  translationSummary,
  siteSummary,
  pausedSiteCount = 0,
  savedSiteCount = 0,
  onSectionChange,
  onSave,
  onReload,
  onDismissIntro,
  onDiscoveryRateChange,
  onReadingLevelChange,
  onSentenceHelpChange,
  onProviderChange,
  onApiKeyChange,
  onToggleApiKeyVisibility,
  onClearApiKey
}: ExtensionOptionsProps) {
  const [localActive, setLocalActive] = useState<OptionsSection>(initialSection);
  const active = activeSection ?? localActive;
  const visibleTabs = settingsTabs.filter((tab) => showAdvanced || tab !== "Advanced");
  const setActive = (section: OptionsSection) => {
    setLocalActive(section);
    onSectionChange?.(section);
  };

  const optionsContent = (
    <div className="ik-ui-options-layout">
      <OptionsSidebar active={active} setActive={setActive} tabs={visibleTabs} />
      <main className="ik-ui-options-main">
        <OptionsHeader
          active={active}
          isSaving={isSaving}
          isLoading={isLoading}
          onSave={onSave}
          onReload={onReload}
        />
        {firstRunIntro ? (
          <Card className="ik-ui-note-card ik-ui-note-card--blue">
            <Icon name="shield" />
            <div>
              <h2>What happens while you read</h2>
              <p>
                Spanish appears gently on supported pages, progress stays on
                this device, and selected sentence text is sent to OpenAI only
                if sentence help is enabled.
              </p>
              <Button variant="secondary" size="sm" onClick={onDismissIntro}>
                Got it
              </Button>
            </div>
          </Card>
        ) : null}
        {statusMessage ? (
          <div className="ik-ui-status-banner ik-ui-status-banner--success">
            {statusMessage}
          </div>
        ) : null}
        {errorMessage ? (
          <div className="ik-ui-warning-banner">
            <Icon name="info" />
            {errorMessage}
          </div>
        ) : null}
        <div className="ik-ui-tabs" role="tablist" aria-label="Options sections">
          {visibleTabs.map((tab) => (
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
        {active === "General" ? (
          <OptionsGeneralPanel
            discoveryRatePercent={discoveryRatePercent}
            readingLevel={readingLevel}
            stats={stats}
            checkpoint={checkpoint}
            siteSummary={siteSummary}
            pausedSiteCount={pausedSiteCount}
            savedSiteCount={savedSiteCount}
            onDiscoveryRateChange={onDiscoveryRateChange}
            onReadingLevelChange={onReadingLevelChange}
          />
        ) : null}
        {active === "Translation" ? (
          <OptionsTranslationPanel
            sentenceHelpEnabled={sentenceHelpEnabled}
            provider={provider}
            apiKey={apiKey}
            apiKeyValid={apiKeyValid}
            showApiKey={showApiKey}
            translationSummary={translationSummary}
            onSentenceHelpChange={onSentenceHelpChange}
            onProviderChange={onProviderChange}
            onApiKeyChange={onApiKeyChange}
            onToggleApiKeyVisibility={onToggleApiKeyVisibility}
            onClearApiKey={onClearApiKey}
          />
        ) : null}
        {active === "Advanced" ? <OptionsAdvancedPanel /> : null}
      </main>
    </div>
  );

  if (!chromeFrame) {
    return <ImmersionFrame variant="settings">{optionsContent}</ImmersionFrame>;
  }

  return (
    <ImmersionFrame variant="settings">
      <BrowserChrome
        title="ImmersionKit Options"
        url={`chrome-extension://immersionkit/options.html${active === "Advanced" ? "#advanced" : ""}`}
        appFrame
      >
        {optionsContent}
      </BrowserChrome>
    </ImmersionFrame>
  );
}

function OptionsSidebar({
  active,
  setActive,
  tabs = settingsTabs
}: {
  active: OptionsSection;
  setActive: (section: OptionsSection) => void;
  tabs?: OptionsSection[];
}) {
  return (
    <aside className="ik-ui-options-sidebar">
      <div className="ik-ui-brand ik-ui-brand--large">
        <ImmersionLogo />
        <span>ImmersionKit</span>
      </div>
      <nav aria-label="Options navigation">
        {tabs.map((tab) => (
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

function OptionsHeader({
  active,
  isSaving = false,
  isLoading = false,
  onSave,
  onReload
}: {
  active: OptionsSection;
  isSaving?: boolean;
  isLoading?: boolean;
  onSave?: () => void;
  onReload?: () => void;
}) {
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
        <Button variant="primary" disabled={isSaving || isLoading} onClick={onSave}>
          {isSaving ? "Saving..." : "Save changes"}
        </Button>
        <Button variant="secondary" icon="spark" disabled={isSaving} onClick={onReload}>
          Reload
        </Button>
      </div>
    </header>
  );
}

function OptionsGeneralPanel({
  discoveryRatePercent = 8,
  readingLevel,
  stats,
  checkpoint,
  siteSummary,
  pausedSiteCount = 0,
  savedSiteCount = 0,
  onDiscoveryRateChange,
  onReadingLevelChange
}: Pick<
  ExtensionOptionsProps,
  | "discoveryRatePercent"
  | "readingLevel"
  | "stats"
  | "checkpoint"
  | "siteSummary"
  | "pausedSiteCount"
  | "savedSiteCount"
  | "onDiscoveryRateChange"
  | "onReadingLevelChange"
>) {
  const [localReadingLevel, setLocalReadingLevel] =
    useState<ReadingLevel>("False beginner");
  const resolvedReadingLevel = readingLevel ?? localReadingLevel;
  const chooseReadingLevel = (level: ReadingLevel) => {
    setLocalReadingLevel(level);
    onReadingLevelChange?.(level);
  };

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
            <input
              id="settings-discovery-rate"
              type="range"
              min={0}
              max={20}
              value={discoveryRatePercent}
              onChange={(event) => {
                onDiscoveryRateChange?.(Number(event.target.value));
              }}
            />
            <strong>{discoveryRatePercent}%</strong>
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
              selected={resolvedReadingLevel === "Beginner"}
              onSelect={() => chooseReadingLevel("Beginner")}
            />
            <Choice
              title="False beginner"
              copy="I know some basics but need more exposure."
              selected={resolvedReadingLevel === "False beginner"}
              onSelect={() => chooseReadingLevel("False beginner")}
            />
            <Choice
              title="Intermediate"
              copy="Comfortable with most everyday reading."
              selected={resolvedReadingLevel === "Intermediate"}
              onSelect={() => chooseReadingLevel("Intermediate")}
            />
          </div>
        </Card>
      </div>
      <div className="ik-ui-settings-grid ik-ui-settings-grid--two">
        <Card>
          <h2>Learning snapshot</h2>
          <p>Your progress while reading across sites.</p>
          <div className="ik-ui-metric-grid ik-ui-metric-grid--four">
            <MetricStat label="Comfortable" value={stats?.comfortable ?? 0} icon="check" />
            <MetricStat label="In practice" value={stats?.practice ?? 0} icon="spark" />
            <MetricStat label="Still new" value={stats?.newCount ?? 0} icon="band" />
            <MetricStat label="Tracked total" value={stats?.total ?? 0} icon="book" />
          </div>
        </Card>
        <Card>
          <div className="ik-ui-card-row">
            <div>
              <h2>Reading band</h2>
              <p>Grow your reading range as you see more in context.</p>
            </div>
            <span>{checkpoint?.progressLabel ?? "0 local signals"}</span>
          </div>
          <ProgressBar value={checkpoint?.progressValue ?? 0} />
          <div className="ik-ui-band-step">
            <span>{checkpoint?.currentBand ?? "Starting"}</span>
            <Icon name="chevron" />
            <span>{checkpoint?.nextBand ?? "Next band"}</span>
            <Button
              variant="secondary"
              disabled={!checkpoint?.canWiden || checkpoint.isWidening}
              icon={checkpoint?.canWiden ? "band" : "lock"}
              onClick={checkpoint?.onWiden}
            >
              {checkpoint?.isWidening ? "Widening..." : "Widen reading band"}
            </Button>
          </div>
          <p>{checkpoint?.description}</p>
        </Card>
      </div>
      <div className="ik-ui-settings-grid ik-ui-settings-grid--two">
        <Card>
          <h2>Site controls</h2>
          <p>Decide where ImmersionKit is active.</p>
          <div className="ik-ui-inline-summary">
            <MetricStat label="saved choices" value={savedSiteCount} icon="link" />
            <MetricStat label="paused site" value={pausedSiteCount} icon="pause" />
            <Button variant="secondary">Manage saved sites</Button>
          </div>
          {siteSummary ? <p>{siteSummary}</p> : null}
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

function OptionsTranslationPanel({
  sentenceHelpEnabled = false,
  provider = "none",
  apiKey = "",
  apiKeyValid = false,
  showApiKey = false,
  translationSummary,
  onSentenceHelpChange,
  onProviderChange,
  onApiKeyChange,
  onToggleApiKeyVisibility,
  onClearApiKey
}: Pick<
  ExtensionOptionsProps,
  | "sentenceHelpEnabled"
  | "provider"
  | "apiKey"
  | "apiKeyValid"
  | "showApiKey"
  | "translationSummary"
  | "onSentenceHelpChange"
  | "onProviderChange"
  | "onApiKeyChange"
  | "onToggleApiKeyVisibility"
  | "onClearApiKey"
>) {
  return (
    <div className="ik-ui-options-panel ik-ui-options-panel--translation">
      {!apiKeyValid && provider === "openai" ? (
        <div className="ik-ui-warning-banner">
          <Icon name="shield" />
          Add a valid OpenAI API key before turning sentence help on.
        </div>
      ) : null}
      <div className="ik-ui-settings-grid ik-ui-settings-grid--two">
        <div className="ik-ui-settings-stack">
          <Card className="ik-ui-switch-row">
            <div>
              <h2>Sentence help</h2>
              <p>Show selected sentence translations and short grammar notes after provider setup.</p>
            </div>
            <Toggle
              checked={sentenceHelpEnabled}
              label="Enable sentence help"
              onChange={onSentenceHelpChange}
            />
            <span>{sentenceHelpEnabled ? "On" : "Off"}</span>
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
              <select
                value={provider}
                onChange={(event) => {
                  const nextProvider = event.target.value === "openai" ? "openai" : "none";
                  onProviderChange?.(nextProvider);
                }}
              >
                <option value="none">None</option>
                <option value="openai">OpenAI</option>
              </select>
            </label>
            {translationSummary ? <p>{translationSummary}</p> : null}
          </Card>
          <Card>
            <div className="ik-ui-card-row">
              <h2>OpenAI API key</h2>
              <Badge tone={apiKeyValid ? "accent" : "danger"}>
                {apiKeyValid ? "Looks valid" : "Needs key"}
              </Badge>
            </div>
            <p>Enter your OpenAI API key.</p>
            <label className="ik-ui-field">
              <input
                placeholder="sk-..."
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => {
                  onApiKeyChange?.(event.target.value);
                }}
              />
            </label>
            <div className="ik-ui-quiet-actions">
              <Button variant="secondary" size="sm" onClick={onToggleApiKeyVisibility}>
                {showApiKey ? "Hide" : "Show"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!apiKey}
                onClick={onClearApiKey}
              >
                Clear
              </Button>
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
      aria-label={title}
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
