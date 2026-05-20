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
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../components/ui/select";
import {
  Tabs,
  TabsContent
} from "../components/ui/tabs";
import { cn } from "../lib/utils";
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
  currentFocus,
  learningPath = [],
  sentenceHelpEnabled = false,
  provider = "none",
  apiKey = "",
  apiKeyValid = false,
  showApiKey = false,
  translationSummary,
  siteSummary,
  pausedSiteCount = 0,
  savedSiteCount = 0,
  advancedDiagnostics,
  exactActiveBandId,
  bandOptions = [],
  onSectionChange,
  onSave,
  onReload,
  onDismissIntro,
  onDiscoveryRateChange,
  onReadingLevelChange,
  onExactBandChange,
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
    <div className="grid min-h-[790px] grid-cols-[240px_minmax(0,1fr)] bg-background max-lg:grid-cols-1">
      <OptionsSidebar active={active} setActive={setActive} tabs={visibleTabs} />
      <main className="grid content-start gap-6 p-8 max-sm:p-4">
        <OptionsHeader
          active={active}
          isSaving={isSaving}
          isLoading={isLoading}
          onSave={onSave}
          onReload={onReload}
        />
        {firstRunIntro ? (
          <Card className="flex gap-3 border-blue-100 bg-blue-50 text-blue-950">
            <Icon name="shield" className="mt-1 size-5 shrink-0 text-blue-700" />
            <div className="grid gap-2">
              <h2 className="text-lg font-semibold tracking-normal">Start with normal reading</h2>
              <p className="text-sm leading-6 text-blue-900/80">
                ImmersionKit adds small doses of Spanish on supported pages.
                Progress and reading history stay on this device, you can pause
                any site, and your starting point and pace stay adjustable.
                Sentence help is optional and sends selected text only after you
                turn it on.
              </p>
              <Button variant="secondary" size="sm" className="w-fit" onClick={onDismissIntro}>
                Got it
              </Button>
            </div>
          </Card>
        ) : null}
        {statusMessage ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
            {statusMessage}
          </div>
        ) : null}
        {errorMessage ? (
          <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <Icon name="info" />
            {errorMessage}
          </div>
        ) : null}
        <Tabs value={active} onValueChange={(value) => setActive(value as OptionsSection)}>
          <div
            className="inline-flex w-full max-w-full flex-wrap items-center gap-8 border-b text-muted-foreground"
            aria-label="Options sections"
          >
            {visibleTabs.map((tab) => (
              <button
                type="button"
                key={tab}
                className={cn(
                  "appearance-none border-0 border-b-2 border-transparent bg-transparent px-6 py-4 text-base font-medium text-muted-foreground transition-colors hover:text-primary",
                  tab === active && "border-primary text-primary"
                )}
                onClick={() => setActive(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
          <TabsContent value="General" className="mt-6">
            <OptionsGeneralPanel
              discoveryRatePercent={discoveryRatePercent}
              readingLevel={readingLevel}
              stats={stats}
              checkpoint={checkpoint}
              currentFocus={currentFocus}
              learningPath={learningPath}
              siteSummary={siteSummary}
              pausedSiteCount={pausedSiteCount}
              savedSiteCount={savedSiteCount}
              onDiscoveryRateChange={onDiscoveryRateChange}
              onReadingLevelChange={onReadingLevelChange}
            />
          </TabsContent>
          <TabsContent value="Translation" className="mt-6">
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
          </TabsContent>
          <TabsContent value="Advanced" className="mt-6">
            <OptionsAdvancedPanel
              diagnostics={advancedDiagnostics ?? null}
              exactActiveBandId={exactActiveBandId}
              bandOptions={bandOptions}
              onExactBandChange={onExactBandChange}
            />
          </TabsContent>
        </Tabs>
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
    <aside className="grid content-start gap-6 border-r bg-muted/30 p-6 max-lg:border-b max-lg:border-r-0">
      <div className="flex items-center gap-2 text-lg font-semibold">
        <ImmersionLogo />
        <span>ImmersionKit</span>
      </div>
      <nav className="grid gap-1" aria-label="Options navigation">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab}
            className={cn(
              "inline-flex appearance-none items-center gap-3 rounded-md border-0 bg-transparent px-4 py-3 text-left text-base font-medium text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary",
              tab === active && "bg-primary/10 text-primary shadow-[inset_4px_0_0_hsl(var(--primary))]"
            )}
            onClick={() => setActive(tab)}
          >
            <Icon name={tab === "General" ? "gear" : tab === "Translation" ? "link" : "band"} />
            {tab}
          </button>
        ))}
      </nav>
      {active === "Advanced" ? (
        <div className="grid gap-2 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          <strong className="text-foreground">Build profile</strong>
          <span>Active page</span>
          <span>Curriculum state</span>
          <span>Local data</span>
        </div>
      ) : null}
      <div className="flex gap-2 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        <Icon name="lock" className="mt-0.5 shrink-0" />
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
      "Diagnostics for release validation.",
      "Inspect build profile, active-page signals, and local state snapshots."
    ]
  }[active];

  return (
    <header className="flex items-start justify-between gap-4 max-md:flex-col">
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold leading-tight tracking-normal">{copy[0]}</h1>
        <p className="max-w-2xl text-muted-foreground">{copy[1]}</p>
      </div>
      <div className="flex flex-wrap gap-2">
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
  currentFocus,
  learningPath = [],
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
  | "currentFocus"
  | "learningPath"
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
    <div className="grid gap-6">
      {currentFocus ? <CurrentFocusCard focus={currentFocus} /> : null}
      <div className="grid grid-cols-2 gap-5 max-xl:grid-cols-1">
        <Card className="grid gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold tracking-normal">New word pace</h2>
            <Badge tone="accent">Gentle pace</Badge>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            Choose how many new Spanish words appear while you read.
          </p>
          <div className="grid grid-cols-[1fr_auto] items-center gap-4">
            <Input
              id="settings-discovery-rate"
              type="range"
              min={0}
              max={20}
              value={discoveryRatePercent}
              className="h-2 cursor-pointer appearance-none accent-primary"
              onChange={(event) => {
                onDiscoveryRateChange?.(Number(event.target.value));
              }}
            />
            <strong className="text-lg">{discoveryRatePercent}%</strong>
          </div>
          <div className="flex justify-between text-xs font-medium text-muted-foreground">
            <span>Subtle</span>
            <span>Balanced</span>
            <span>Bold</span>
          </div>
        </Card>
        <Card className="grid gap-4">
          <div className="grid gap-1">
            <h2 className="text-xl font-semibold tracking-normal">Starting point</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Pick the option that best matches your current reading in Spanish.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1" role="radiogroup" aria-label="Reading level">
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
      <div className="grid grid-cols-2 gap-5 max-xl:grid-cols-1">
        <Card className="grid gap-4">
          <div className="grid gap-1">
            <h2 className="text-xl font-semibold tracking-normal">Learning snapshot</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Progress starts from normal reading on supported pages and builds local history across sites.
            </p>
          </div>
          <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2">
            <MetricStat label="Comfortable" value={stats?.comfortable ?? 0} icon="check" />
            <MetricStat label="In practice" value={stats?.practice ?? 0} icon="spark" />
            <MetricStat label="Still new" value={stats?.newCount ?? 0} icon="band" />
            <MetricStat label="Tracked total" value={stats?.total ?? 0} icon="book" />
          </div>
        </Card>
        <Card className="grid gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="grid gap-1">
              <h2 className="text-xl font-semibold tracking-normal">Reading band</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Normal reading on supported pages builds the local evidence that widens your reading range.
              </p>
            </div>
            <span className="max-w-[180px] text-right text-xs text-muted-foreground">
              {checkpoint?.progressLabel ?? "Progress starts as you read"}
            </span>
          </div>
          <ProgressBar value={checkpoint?.progressValue ?? 0} />
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-3">
            <span className="font-medium">{checkpoint?.currentBand ?? "Starting"}</span>
            <Icon name="chevron" className="text-muted-foreground" />
            <span className="font-medium">{checkpoint?.nextBand ?? "Next band"}</span>
            <Button
              variant="secondary"
              disabled={!checkpoint?.canWiden || checkpoint.isWidening}
              icon={checkpoint?.canWiden ? "band" : "lock"}
              onClick={checkpoint?.onWiden}
            >
              {checkpoint?.isWidening ? "Widening..." : "Widen reading band"}
            </Button>
          </div>
          {checkpoint?.description ? (
            <p className="text-sm text-muted-foreground">{checkpoint.description}</p>
          ) : null}
        </Card>
      </div>
      <LearningPathView path={learningPath} />
      <div className="grid grid-cols-2 gap-5 max-xl:grid-cols-1">
        <Card className="grid gap-4">
          <div className="grid gap-1">
            <h2 className="text-xl font-semibold tracking-normal">Site controls</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Pause or resume ImmersionKit per site from the popup on supported pages.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <MetricStat label="saved choices" value={savedSiteCount} icon="link" />
            <MetricStat label="paused site" value={pausedSiteCount} icon="pause" />
            <Button variant="secondary">Manage saved sites</Button>
          </div>
          {siteSummary ? <p className="text-sm text-muted-foreground">{siteSummary}</p> : null}
        </Card>
        <div className="flex items-center gap-3 rounded-lg border bg-primary/5 p-5 text-primary">
          <Icon name="band" className="size-5 shrink-0" />
          <div>
            <strong>Small steps add up.</strong>
            <p className="text-sm text-primary/80">You can always adjust these settings as your reading grows.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function CurrentFocusCard({
  focus
}: {
  focus: NonNullable<ExtensionOptionsProps["currentFocus"]>;
}) {
  return (
    <Card className="grid gap-4 border-primary/20 bg-primary/5">
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="text-xl font-semibold tracking-normal">
            {focus.levelLabel}: {focus.learnerTitle}
          </h2>
          <p className="text-sm text-muted-foreground">{focus.bandLabel}</p>
        </div>
        <Badge tone="accent">Current focus</Badge>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{focus.shortGoal}</p>
      <div className="grid grid-cols-5 gap-3 max-xl:grid-cols-2 max-sm:grid-cols-1">
        <FocusList title="Words" items={focus.wordFocusLabels} />
        <FocusList title="Examples" items={focus.wordExampleLabels ?? []} />
        <FocusList title="Word patterns" items={focus.wordPatternLabels} />
        <FocusList title="Phrases" items={focus.phraseFocusExamples} />
        <FocusList title="Grammar" items={focus.grammarFocusLabels} />
      </div>
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <div className="grid gap-1 rounded-lg border bg-card p-3">
          <strong className="text-sm">Sentence style</strong>
          <span className="text-sm text-muted-foreground">{focus.sentenceFocusLabel}</span>
        </div>
        <div className="grid gap-1 rounded-lg border bg-card p-3">
          <strong className="text-sm">Next focus</strong>
          <span className="text-sm text-muted-foreground">{focus.nextFocusPreview}</span>
        </div>
      </div>
    </Card>
  );
}

function FocusList({
  title,
  items
}: {
  title: string;
  items: readonly string[];
}) {
  return (
    <div className="grid gap-1 rounded-lg border bg-card p-3">
      <strong className="text-sm">{title}</strong>
      <span className="text-sm leading-5 text-muted-foreground">
        {items.length > 0 ? items.slice(0, 5).join(", ") : "Review and consolidation"}
      </span>
    </div>
  );
}

function LearningPathView({
  path
}: {
  path: NonNullable<ExtensionOptionsProps["learningPath"]>;
}) {
  if (path.length === 0) {
    return null;
  }

  return (
    <section className="grid gap-4" aria-label="Learning path">
      <div className="grid gap-1">
        <h2 className="text-xl font-semibold tracking-normal">Learning path</h2>
        <p className="text-sm text-muted-foreground">
          Five reading levels widen vocabulary, phrases, grammar, and sentence complexity.
        </p>
      </div>
      <div className="grid gap-3">
        {path.map((level) => (
          <details
            key={level.levelId}
            className="rounded-lg border bg-card p-4 shadow-sm"
            open={level.active}
          >
            <summary className="flex cursor-pointer items-center justify-between gap-3">
              <span className="grid gap-1">
                <strong>{level.levelLabel}</strong>
                <small className="text-sm text-muted-foreground">{level.stageSummary}</small>
              </span>
              <Badge tone={level.active ? "accent" : level.unlocked ? "info" : "muted"}>
                {level.active ? "Now" : level.unlocked ? "Open" : "Later"}
              </Badge>
            </summary>
            <div className="mt-4 grid gap-3">
              <div className="grid grid-cols-5 gap-3 max-xl:grid-cols-2 max-sm:grid-cols-1">
                <PathDetail label="Words" value={level.vocabularySummary} />
                <PathDetail label="Phrases" value={level.phraseSummary} />
                <PathDetail label="Grammar" value={level.grammarSummary} />
                <PathDetail label="Sentences" value={level.sentenceSummary} />
                <PathDetail label="Boundary step" value={level.checkpointSummary} />
              </div>
              <div className="grid grid-cols-4 gap-2 max-lg:grid-cols-2 max-sm:grid-cols-1">
                {level.bands.map((band) => (
                  <div
                    key={band.bandId}
                    className={cn(
                      "grid gap-1 rounded-md border bg-muted/30 p-3",
                      band.active && "border-primary bg-primary/10"
                    )}
                  >
                    <strong className="text-sm">{band.bandLabel}</strong>
                    <span className="text-sm text-muted-foreground">{band.learnerTitle}</span>
                  </div>
                ))}
              </div>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function PathDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-md border bg-muted/30 p-3">
      <strong className="text-sm">{label}</strong>
      <span className="text-sm leading-5 text-muted-foreground">{value}</span>
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
    <div className="grid gap-6">
      {!apiKeyValid && provider === "openai" ? (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <Icon name="shield" />
          Add a valid OpenAI API key before turning sentence help on.
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-5 max-xl:grid-cols-1">
        <div className="grid content-start gap-5">
          <Card className="flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-semibold tracking-normal">Sentence help</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Show selected sentence translations and short grammar notes after provider setup.
              </p>
            </div>
            <Toggle
              checked={sentenceHelpEnabled}
              label="Enable sentence help"
              onChange={onSentenceHelpChange}
            />
            <span className="text-sm font-medium">{sentenceHelpEnabled ? "On" : "Off"}</span>
          </Card>
          <Card className="flex gap-3 border-blue-100 bg-blue-50 text-blue-950">
            <Icon name="lock" className="mt-1 size-5 shrink-0 text-blue-700" />
            <p className="text-sm leading-6 text-blue-900/80">
              Selected sentence text is sent to OpenAI only when sentence help is enabled.
              Page text is not sent automatically.
            </p>
          </Card>
          <Card className="grid gap-3">
            <div className="grid gap-1">
              <h2 className="text-xl font-semibold tracking-normal">Provider</h2>
              <p className="text-sm text-muted-foreground">Choose a provider for sentence help.</p>
            </div>
            <Label htmlFor="sentence-help-provider">Provider</Label>
            <Select
              value={provider}
              onValueChange={(value) => {
                const nextProvider = value === "openai" ? "openai" : "none";
                onProviderChange?.(nextProvider);
              }}
            >
              <SelectTrigger id="sentence-help-provider">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
              </SelectContent>
            </Select>
            <label className="ik-ui-field absolute size-px overflow-hidden">
              Provider
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
            {translationSummary ? <p className="text-sm text-muted-foreground">{translationSummary}</p> : null}
          </Card>
          <Card className="grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold tracking-normal">OpenAI API key</h2>
              <Badge tone={apiKeyValid ? "accent" : "danger"}>
                {apiKeyValid ? "Looks valid" : "Needs key"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">Enter your OpenAI API key.</p>
            <Label htmlFor="openai-api-key">API key</Label>
            <Input
              id="openai-api-key"
              placeholder="sk-..."
              type={showApiKey ? "text" : "password"}
              value={apiKey}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                onApiKeyChange?.(event.target.value);
              }}
            />
            <div className="flex flex-wrap gap-2">
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
        <div className="grid content-start gap-5">
          <Card className="grid gap-4">
            <div className="grid gap-1">
              <h2 className="text-xl font-semibold tracking-normal">Sentence note preview</h2>
              <p className="text-sm text-muted-foreground">This is an example of what you'll see.</p>
            </div>
            <div className="grid gap-3 rounded-lg border bg-muted/30 p-4">
              <header className="flex items-center gap-2 text-sm font-semibold">
                <Icon name="spark" className="text-primary" />
                <span>Sentence help</span>
                <Icon name="close" className="ml-auto text-muted-foreground" />
              </header>
              <SentenceBlock label="Original" text="Me tomo un momento para respirar." />
              <SentenceBlock label="Translation" text="I take a moment to breathe." />
              <div className="flex gap-2 rounded-md border bg-card p-3 text-sm">
                <Icon name="spark" className="mt-0.5 shrink-0 text-primary" />
                <span>Take a moment to + verb is a common pattern for making time for an action.</span>
              </div>
            </div>
          </Card>
          <div className="flex items-center gap-3 rounded-lg border bg-primary/5 p-5 text-primary">
            <Icon name="check" className="size-5 shrink-0" />
            <p className="text-sm text-primary/80">
              You can turn sentence help on or off any time. Vocabulary help will keep working locally.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function OptionsAdvancedPanel({
  diagnostics,
  exactActiveBandId,
  bandOptions = [],
  onExactBandChange
}: {
  diagnostics: ExtensionOptionsProps["advancedDiagnostics"];
  exactActiveBandId?: ExtensionOptionsProps["exactActiveBandId"];
  bandOptions?: ExtensionOptionsProps["bandOptions"];
  onExactBandChange?: ExtensionOptionsProps["onExactBandChange"];
}) {
  const activePageMetrics = diagnostics?.activePageMetrics ?? [];
  const storageMetrics = diagnostics?.storageMetrics ?? [];

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-5 max-xl:grid-cols-1">
        <Card className="grid gap-4">
          <div className="grid gap-1">
            <h2 className="text-xl font-semibold tracking-normal">Build diagnostics</h2>
            <p className="text-sm text-muted-foreground">
              {diagnostics?.diagnosticsEnabled ? "Diagnostics are available in this build." : "Diagnostics are disabled in this build."}
            </p>
          </div>
          <DiagnosticRow
            title="Build profile"
            status={diagnostics?.buildProfile ?? "unknown"}
          />
          <DiagnosticRow
            title="Advanced access"
            status={diagnostics?.diagnosticsEnabled ? "On" : "Off"}
          />
          <DiagnosticRow
            title="Active page updated"
            detail={diagnostics?.activePageUpdatedAt ?? "not available"}
          />
        </Card>
        <Card className="grid gap-4">
          <div className="grid gap-1">
            <h2 className="text-xl font-semibold tracking-normal">Active page</h2>
            <p className="text-sm text-muted-foreground">
              {diagnostics?.activePageMessage ?? "No active-page diagnostics loaded."}
            </p>
          </div>
          {diagnostics?.activePageUrl ? (
            <div className="break-all rounded-md border bg-muted/35 p-3 text-sm text-muted-foreground">
              {diagnostics.activePageUrl}
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            {activePageMetrics.map((metric) => (
              <MetricStat
                key={metric.label}
                label={metric.label}
                value={metric.value}
                icon="spark"
              />
            ))}
          </div>
        </Card>
      </div>
      <div className="grid grid-cols-2 gap-5 max-xl:grid-cols-1">
        <Card className="grid gap-3">
          <div className="grid gap-1">
            <h2 className="text-xl font-semibold tracking-normal">Exact reading band</h2>
            <p className="text-sm text-muted-foreground">
              Diagnostic override for vocabulary, phrase, and grammar placement.
            </p>
          </div>
          <Label htmlFor="exact-reading-band">Reading band</Label>
          <Select
            value={exactActiveBandId ?? undefined}
            onValueChange={(value) => {
              onExactBandChange?.(value);
            }}
          >
            <SelectTrigger id="exact-reading-band">
              <SelectValue placeholder="Select band" />
            </SelectTrigger>
            <SelectContent>
              {bandOptions.map((band) => (
                <SelectItem key={band.id} value={band.id}>
                  {band.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Card>
        <Card className="flex gap-3 bg-muted/35">
          <Icon name="band" className="mt-1 size-5 shrink-0 text-primary" />
          <div className="grid gap-1">
            <h2 className="text-xl font-semibold tracking-normal">Placement state</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              {exactActiveBandId
                ? `${exactActiveBandId} is active across all curriculum tracks.`
                : "No exact active band is selected."}
            </p>
          </div>
        </Card>
      </div>
      <div className="grid grid-cols-2 gap-5 max-xl:grid-cols-1">
        <Card className="flex gap-3">
          <Icon name="book" className="mt-1 size-5 shrink-0 text-primary" />
          <div className="grid gap-3">
            <h2 className="text-xl font-semibold tracking-normal">Curriculum state</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              {diagnostics?.curriculumSummary ?? "No curriculum diagnostics loaded."}
            </p>
            <div className="rounded-md border bg-muted/35 p-3 text-sm text-muted-foreground">
              {diagnostics?.progressionSummary ?? "No progression decision recorded."}
            </div>
          </div>
        </Card>
        <Card className="flex gap-3">
          <Icon name="lock" className="mt-1 size-5 shrink-0 text-primary" />
          <div className="grid gap-3">
            <h2 className="text-xl font-semibold tracking-normal">Local data snapshot</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Settings, site choices, vocabulary state, phrases, and review history stay on this device.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {storageMetrics.map((metric) => (
                <MetricStat
                  key={metric.label}
                  label={metric.label}
                  value={metric.value}
                  icon="shield"
                />
              ))}
            </div>
          </div>
        </Card>
      </div>
      <Card className="flex items-center justify-between gap-4 bg-muted/35">
        <div>
          <h2 className="text-xl font-semibold tracking-normal">
            Advanced diagnostics <Badge tone="accent">Optional</Badge>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Use #advanced, ?debug=1, or ?advanced=1 in diagnostic builds.
          </p>
        </div>
        <Icon name="chevron" className="text-muted-foreground" />
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
      className={cn(
        "grid min-h-32 gap-2 rounded-lg border bg-card p-4 text-left text-sm shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground",
        selected && "border-primary bg-primary/10"
      )}
      role="radio"
      aria-checked={selected}
      aria-label={title}
      onClick={onSelect}
    >
      <span
        className={cn(
          "size-4 rounded-full border",
          selected && "border-primary bg-primary shadow-[inset_0_0_0_3px_hsl(var(--background))]"
        )}
      />
      <strong>{title}</strong>
      <small className="text-sm leading-5 text-muted-foreground">{copy}</small>
    </button>
  );
}

function DiagnosticRow({
  title,
  detail,
  status
}: {
  title: string;
  detail?: string;
  status?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/35 p-3">
      <div className="grid gap-1">
        <strong className="text-sm">{title}</strong>
        {detail ? <span className="text-sm text-muted-foreground">{detail}</span> : null}
      </div>
      {status ? <Badge tone={status === "On" ? "accent" : "warning"}>{status}</Badge> : null}
    </div>
  );
}
