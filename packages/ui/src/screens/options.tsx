import { useState } from "react";
import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  WarningCircleIcon
} from "@phosphor-icons/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  BrowserChrome,
  IkIcon,
  ImmersionFrame,
  ImmersionLogo,
  SentenceBlock,
  StatusBadge
} from "./screen-primitives";
import {
  type MetricIconName,
  settingsTabs,
  type ExtensionOptionsProps,
  type OptionsSection,
  type ReadingLevel
} from "./types";

export function ExtensionOptions({
  initialSection = "General",
  activeSection,
  chromeFrame = false,
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
  const containedFrame = chromeFrame;

  const optionsContent = (
    <TooltipProvider>
      <div
        className={cn(
          "flex flex-col bg-background text-foreground",
          containedFrame ? "min-h-[720px]" : "min-h-svh"
        )}
      >
        <OptionsHeader
          active={active}
          isSaving={isSaving}
          isLoading={isLoading}
          onSave={onSave}
          onReload={onReload}
        />
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4 md:p-6">
          {firstRunIntro ? (
            <Alert>
              <IkIcon name="shield" />
              <AlertDescription>
                Start with normal reading. ImmersionKit adds small doses of
                Spanish on supported pages. Progress and reading history stay
                on this device, you can pause any site, and your starting point
                and pace stay adjustable. Sentence help is optional and sends
                selected text only after you turn it on.
              </AlertDescription>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-fit"
                onClick={onDismissIntro}
              >
                Got it
              </Button>
            </Alert>
          ) : null}
          {statusMessage ? (
            <Alert>
              <CheckCircleIcon aria-hidden="true" />
              <AlertDescription>{statusMessage}</AlertDescription>
            </Alert>
          ) : null}
          {errorMessage ? (
            <Alert variant="destructive">
              <WarningCircleIcon aria-hidden="true" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}
          <Tabs
            value={active}
            onValueChange={(value) => setActive(value as OptionsSection)}
            className="flex flex-col gap-4"
          >
            <TabsList className="w-full justify-start overflow-x-auto md:w-fit">
              {visibleTabs.map((tab) => (
                <TabsTrigger key={tab} value={tab}>
                  {tab}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="General" className="m-0">
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
            <TabsContent value="Translation" className="m-0">
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
            {showAdvanced ? (
              <TabsContent value="Advanced" className="m-0">
                <OptionsAdvancedPanel
                  diagnostics={advancedDiagnostics ?? null}
                  exactActiveBandId={exactActiveBandId}
                  bandOptions={bandOptions}
                  onExactBandChange={onExactBandChange}
                />
              </TabsContent>
            ) : null}
          </Tabs>
        </main>
      </div>
    </TooltipProvider>
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
      "Options",
      "Reading pace, starting point, progress, and site choices."
    ],
    Translation: [
      "Sentence help",
      "Optional provider setup for selected sentence notes."
    ],
    Advanced: [
      "Advanced diagnostics",
      "Build profile, active-page signals, and local state snapshots."
    ]
  }[active];

  return (
    <header className="shrink-0 border-b bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 p-4 md:flex-row md:items-center md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <ImmersionLogo className="size-8 rounded-lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-muted-foreground">ImmersionKit</p>
            <h1 className="truncate text-base font-medium">{copy[0]}</h1>
            <p className="truncate text-sm text-muted-foreground">{copy[1]}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 md:ml-auto">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 md:flex-none"
            disabled={isSaving}
            onClick={onReload}
          >
            <ArrowClockwiseIcon data-icon="inline-start" />
            Reload
          </Button>
          <Button
            size="sm"
            className="flex-1 md:flex-none"
            disabled={isSaving || isLoading}
            onClick={onSave}
          >
            {isSaving ? "Saving..." : "Save changes"}
          </Button>
        </div>
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
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(20rem,0.7fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Reading controls</CardTitle>
            <CardDescription>
              Set the Spanish dose and starting level for normal browsing.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.9fr)]">
            <FieldGroup className="min-w-0">
              <Field>
                <div className="flex items-center justify-between gap-3">
                  <FieldLabel htmlFor="settings-discovery-rate">New word pace</FieldLabel>
                  <span className="text-sm font-medium">{discoveryRatePercent}%</span>
                </div>
                <Slider
                  id="settings-discovery-rate"
                  min={0}
                  max={20}
                  step={1}
                  value={[discoveryRatePercent]}
                  onValueChange={(value) => onDiscoveryRateChange?.(value[0] ?? 0)}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Subtle</span>
                  <span>Balanced</span>
                  <span>Bold</span>
                </div>
              </Field>
            </FieldGroup>
            <FieldSet>
              <FieldLegend>Starting point</FieldLegend>
              <RadioGroup
                value={resolvedReadingLevel}
                onValueChange={(value) => chooseReadingLevel(value as ReadingLevel)}
                className="grid gap-2"
              >
                <ReadingLevelChoice
                  value="Beginner"
                  title="Beginner"
                  copy="Just starting. Simple words and phrases."
                />
                <ReadingLevelChoice
                  value="False beginner"
                  title="False beginner"
                  copy="I know some basics but need more exposure."
                />
                <ReadingLevelChoice
                  value="Intermediate"
                  title="Intermediate"
                  copy="Comfortable with most everyday reading."
                />
              </RadioGroup>
            </FieldSet>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Reading band</CardTitle>
            <CardDescription>
              Local reading evidence widens the active range.
            </CardDescription>
            <CardAction>
              <Badge variant="outline">
                {checkpoint?.progressLabel ?? "Progress starts as you read"}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Progress value={checkpoint?.progressValue ?? 0} />
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{checkpoint?.currentBand ?? "Starting"}</span>
              <IkIcon name="chevron" className="text-muted-foreground" />
              <span className="font-medium">{checkpoint?.nextBand ?? "Next band"}</span>
            </div>
            {checkpoint?.description ? (
              <p className="text-sm text-muted-foreground">{checkpoint.description}</p>
            ) : null}
            <Button
              variant="outline"
              className="w-fit"
              disabled={!checkpoint?.canWiden || checkpoint.isWidening}
              onClick={checkpoint?.onWiden}
            >
              <IkIcon
                name={checkpoint?.canWiden ? "band" : "lock"}
                dataIcon="inline-start"
              />
              {checkpoint?.isWidening ? "Widening..." : "Widen reading band"}
            </Button>
          </CardContent>
        </Card>
      </div>
      {currentFocus ? <CurrentFocusCard focus={currentFocus} /> : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.65fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Learning snapshot</CardTitle>
            <CardDescription>
              Progress builds from normal reading on supported pages.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            <CompactMetric label="Comfortable" value={stats?.comfortable ?? 0} icon="check" />
            <CompactMetric label="In practice" value={stats?.practice ?? 0} icon="spark" />
            <CompactMetric label="Still new" value={stats?.newCount ?? 0} icon="band" />
            <CompactMetric label="Tracked total" value={stats?.total ?? 0} icon="book" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Site controls</CardTitle>
            <CardDescription>
              Pause or resume per site from the popup.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              <CompactMetric label="Saved choices" value={savedSiteCount} icon="link" />
              <CompactMetric label="Paused sites" value={pausedSiteCount} icon="pause" />
            </div>
            {siteSummary ? <p className="text-sm text-muted-foreground">{siteSummary}</p> : null}
            <Button variant="outline" className="w-fit">Manage saved sites</Button>
          </CardContent>
        </Card>
      </div>
      <LearningPathView path={learningPath} />
    </div>
  );
}

function ReadingLevelChoice({
  value,
  title,
  copy
}: {
  value: ReadingLevel;
  title: string;
  copy: string;
}) {
  const id = `reading-level-${value.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <Field
      orientation="horizontal"
      className="rounded-lg bg-muted/30 p-3 ring-1 ring-foreground/5 has-data-[state=checked]:bg-card has-data-[state=checked]:ring-primary/40"
    >
      <RadioGroupItem id={id} value={value} />
      <FieldContent>
        <FieldLabel htmlFor={id}>{title}</FieldLabel>
        <FieldDescription>{copy}</FieldDescription>
      </FieldContent>
    </Field>
  );
}

function CompactMetric({
  label,
  value,
  icon
}: {
  label: string;
  value: string | number;
  icon: MetricIconName;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <IkIcon name={icon} className="text-muted-foreground" />
        <span className="truncate text-sm text-muted-foreground">{label}</span>
      </div>
      <strong className="shrink-0 text-sm font-medium">{value}</strong>
    </div>
  );
}

function CurrentFocusCard({
  focus
}: {
  focus: NonNullable<ExtensionOptionsProps["currentFocus"]>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {focus.levelLabel}: {focus.learnerTitle}
        </CardTitle>
        <CardDescription>{focus.bandLabel}</CardDescription>
        <CardAction>
          <StatusBadge>Current focus</StatusBadge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{focus.shortGoal}</p>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          <FocusList title="Words" items={focus.wordFocusLabels} />
          <FocusList title="Examples" items={focus.wordExampleLabels ?? []} />
          <FocusList title="Word patterns" items={focus.wordPatternLabels} />
          <FocusList title="Phrases" items={focus.phraseFocusExamples} />
          <FocusList title="Grammar" items={focus.grammarFocusLabels} />
        </div>
      </CardContent>
      <CardFooter className="grid gap-3 border-t pt-3 md:grid-cols-2">
        <FocusFooter label="Sentence style" value={focus.sentenceFocusLabel} />
        <FocusFooter label="Next focus" value={focus.nextFocusPreview} />
      </CardFooter>
    </Card>
  );
}

function FocusList({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <strong className="block text-sm">{title}</strong>
      <span className="text-sm text-muted-foreground">
        {items.length > 0 ? items.slice(0, 5).join(", ") : "Review and consolidation"}
      </span>
    </div>
  );
}

function FocusFooter({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <strong className="block text-sm">{label}</strong>
      <span className="text-sm text-muted-foreground">{value}</span>
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
    <section className="flex flex-col gap-3" aria-label="Learning path">
      <div>
        <h2 className="text-base font-medium">Learning path</h2>
        <p className="text-sm text-muted-foreground">
          Reading levels widen vocabulary, phrases, grammar, and sentence complexity.
        </p>
      </div>
      <div className="grid gap-3">
        {path.map((level) => (
          <details
            key={level.levelId}
            className="rounded-lg border bg-card p-4 text-card-foreground"
            open={level.active}
          >
            <summary className="flex cursor-pointer items-center justify-between gap-3">
              <span className="min-w-0">
                <strong className="block truncate">{level.levelLabel}</strong>
                <small className="text-muted-foreground">{level.stageSummary}</small>
              </span>
              <Badge
                variant={level.active ? "default" : level.unlocked ? "outline" : "secondary"}
              >
                {level.active ? "Now" : level.unlocked ? "Open" : "Later"}
              </Badge>
            </summary>
            <div className="mt-3 grid gap-3">
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
                <PathDetail label="Words" value={level.vocabularySummary} />
                <PathDetail label="Phrases" value={level.phraseSummary} />
                <PathDetail label="Grammar" value={level.grammarSummary} />
                <PathDetail label="Sentences" value={level.sentenceSummary} />
                <PathDetail label="Boundary step" value={level.checkpointSummary} />
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {level.bands.map((band) => (
                  <div
                    key={band.bandId}
                    className={cn(
                      "rounded-lg border bg-background p-3",
                      band.active && "border-primary/50"
                    )}
                  >
                    <strong className="block text-sm">{band.bandLabel}</strong>
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
    <div className="min-w-0 rounded-lg border bg-background p-3">
      <strong className="block text-sm">{label}</strong>
      <span className="text-sm text-muted-foreground">{value}</span>
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
    <div className="flex flex-col gap-4">
      {!apiKeyValid && provider === "openai" ? (
        <Alert variant="destructive">
          <IkIcon name="shield" />
          <AlertDescription>
            Add a valid OpenAI API key before turning sentence help on.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Sentence help</CardTitle>
              <CardDescription>
                Show selected sentence translations and short grammar notes after provider setup.
              </CardDescription>
              <CardAction>
                <Switch
                  checked={sentenceHelpEnabled}
                  aria-label="Enable sentence help"
                  onCheckedChange={onSentenceHelpChange}
                />
              </CardAction>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Vocabulary help works locally. Sentence help can add selected
                translations and short notes after provider setup.
              </p>
            </CardContent>
            <CardFooter className="flex-wrap gap-3 border-t pt-3">
              <Badge variant={sentenceHelpEnabled ? "default" : "secondary"}>
                {sentenceHelpEnabled ? "On" : "Off"}
              </Badge>
              <span className="text-sm text-muted-foreground">
                Selected sentence text is sent to OpenAI only when this is enabled.
              </span>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Provider setup</CardTitle>
              <CardDescription>
                Sentence help is off unless a valid provider key is saved.
              </CardDescription>
              <CardAction>
                <Badge variant={apiKeyValid ? "default" : "secondary"}>
                  {apiKeyValid ? "Ready" : "Needs key"}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="sentence-provider">Provider</FieldLabel>
                  <Select
                    value={provider}
                    onValueChange={(value) => {
                      const nextProvider = value === "openai" ? "openai" : "none";
                      onProviderChange?.(nextProvider);
                    }}
                  >
                    <SelectTrigger id="sentence-provider" className="w-full">
                      <SelectValue placeholder="Provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="openai">OpenAI</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {translationSummary ? (
                    <FieldDescription>{translationSummary}</FieldDescription>
                  ) : null}
                </Field>
                <Field data-invalid={!apiKeyValid && provider === "openai" ? true : undefined}>
                  <FieldLabel htmlFor="openai-api-key">OpenAI API key</FieldLabel>
                  <Input
                    id="openai-api-key"
                    placeholder="sk-..."
                    type={showApiKey ? "text" : "password"}
                    value={apiKey}
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={!apiKeyValid && provider === "openai"}
                    onChange={(event) => onApiKeyChange?.(event.target.value)}
                  />
                </Field>
              </FieldGroup>
            </CardContent>
            <CardFooter className="gap-2 border-t pt-3">
              <Button variant="outline" size="sm" onClick={onToggleApiKeyVisibility}>
                {showApiKey ? "Hide" : "Show"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!apiKey}
                onClick={onClearApiKey}
              >
                Clear
              </Button>
            </CardFooter>
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Sentence note preview</CardTitle>
              <CardDescription>Example selected-sentence help.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 rounded-lg bg-muted/40 p-3">
                <header className="flex items-center gap-2 text-sm font-medium">
                  <IkIcon name="spark" />
                  <span className="flex-1">Sentence help</span>
                  <IkIcon name="close" className="text-muted-foreground" />
                </header>
                <SentenceBlock label="Original" text="Me tomo un momento para respirar." />
                <SentenceBlock label="Translation" text="I take a moment to breathe." />
                <Alert>
                  <IkIcon name="spark" />
                  <AlertDescription>
                    Take a moment to + verb is a common pattern for making time for an action.
                  </AlertDescription>
                </Alert>
              </div>
            </CardContent>
          </Card>
          <Alert>
            <IkIcon name="check" />
            <AlertDescription>
              Vocabulary help keeps working locally even when sentence help is off.
            </AlertDescription>
          </Alert>
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
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Build diagnostics</CardTitle>
            <CardDescription>
              {diagnostics?.diagnosticsEnabled
                ? "Diagnostics are available in this build."
                : "Diagnostics are disabled in this build."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <DiagnosticRow title="Build profile" status={diagnostics?.buildProfile ?? "unknown"} />
            <DiagnosticRow title="Advanced access" status={diagnostics?.diagnosticsEnabled ? "On" : "Off"} />
            <DiagnosticRow title="Active page updated" detail={diagnostics?.activePageUpdatedAt ?? "not available"} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Active page</CardTitle>
            <CardDescription>
              {diagnostics?.activePageMessage ?? "No active-page diagnostics loaded."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {diagnostics?.activePageUrl ? (
              <div className="break-all rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
                {diagnostics.activePageUrl}
              </div>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2">
              {activePageMetrics.map((metric) => (
                <CompactMetric key={metric.label} label={metric.label} value={metric.value} icon="spark" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Exact reading band</CardTitle>
            <CardDescription>
              Diagnostic override for vocabulary, phrase, and grammar placement.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel>Reading band</FieldLabel>
                <Select
                  value={exactActiveBandId ?? ""}
                  onValueChange={(value) => {
                    if (value) {
                      onExactBandChange?.(value);
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select band" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {bandOptions.map((band) => (
                        <SelectItem key={band.id} value={band.id}>
                          {band.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
        <Alert>
          <IkIcon name="band" />
          <AlertDescription>
            {exactActiveBandId
              ? `${exactActiveBandId} is active across all curriculum tracks.`
              : "No exact active band is selected."}
          </AlertDescription>
        </Alert>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row gap-3">
            <IkIcon name="book" className="text-muted-foreground" />
            <div>
              <CardTitle>Curriculum state</CardTitle>
              <CardDescription>
                {diagnostics?.curriculumSummary ?? "No curriculum diagnostics loaded."}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
              {diagnostics?.progressionSummary ?? "No progression decision recorded."}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row gap-3">
            <IkIcon name="lock" className="text-muted-foreground" />
            <div>
              <CardTitle>Local data snapshot</CardTitle>
              <CardDescription>
                Settings, site choices, vocabulary state, phrases, and review
                history stay on this device.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2">
              {storageMetrics.map((metric) => (
                <CompactMetric key={metric.label} label={metric.label} value={metric.value} icon="shield" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>
            Advanced diagnostics <Badge className="ml-2">Optional</Badge>
          </CardTitle>
          <CardDescription>
            Use #advanced, ?debug=1, or ?advanced=1 in diagnostic builds.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
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
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3">
      <div className="min-w-0">
        <strong className="block truncate text-sm">{title}</strong>
        {detail ? (
          <span className="break-words text-sm text-muted-foreground">{detail}</span>
        ) : null}
      </div>
      {status ? (
        <Badge variant={status === "On" ? "default" : "secondary"}>
          {status}
        </Badge>
      ) : null}
    </div>
  );
}
