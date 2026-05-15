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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger
} from "@/components/ui/sidebar";
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
  MetricStat,
  SentenceBlock,
  StatusBadge
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
  const containedFrame = chromeFrame;

  const optionsContent = (
    <TooltipProvider>
      <SidebarProvider
        defaultOpen
        className={containedFrame ? "h-[720px] min-h-[720px]" : undefined}
      >
        <OptionsSidebar
          active={active}
          containedFrame={containedFrame}
          setActive={setActive}
          tabs={visibleTabs}
        />
        <SidebarInset
          className={containedFrame ? "h-[720px] min-h-0" : "min-h-svh"}
        >
          <OptionsHeader
            active={active}
            isSaving={isSaving}
            isLoading={isLoading}
            onSave={onSave}
            onReload={onReload}
          />
          <ScrollArea className="min-h-0 flex-1">
            <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 pt-0 md:p-6 md:pt-0">
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
                className="flex flex-col gap-5"
              >
                <TabsList className="w-fit">
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
          </ScrollArea>
        </SidebarInset>
      </SidebarProvider>
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

function OptionsSidebar({
  active,
  containedFrame = false,
  setActive,
  tabs = settingsTabs
}: {
  active: OptionsSection;
  containedFrame?: boolean;
  setActive: (section: OptionsSection) => void;
  tabs?: OptionsSection[];
}) {
  return (
    <Sidebar collapsible="icon" className={containedFrame ? "h-[720px]" : undefined}>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1">
          <ImmersionLogo className="size-8" />
          <div className="grid min-w-0 text-sm leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate font-medium">ImmersionKit</span>
            <span className="truncate text-xs text-muted-foreground">Reading settings</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Options</SidebarGroupLabel>
          <SidebarMenu aria-label="Options sections">
            {tabs.map((tab) => (
              <SidebarMenuItem key={tab}>
                <SidebarMenuButton
                  tooltip={tab}
                  isActive={tab === active}
                  onClick={() => setActive(tab)}
                >
                  <IkIcon name={tab === "General" ? "gear" : tab === "Translation" ? "translate" : "band"} />
                  <span>{tab}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
        {active === "Advanced" ? (
          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel>Diagnostics</SidebarGroupLabel>
            <div className="flex flex-col gap-1 px-3 text-sm text-muted-foreground">
              <span>Build profile</span>
              <span>Active page</span>
              <span>Curriculum state</span>
              <span>Local data</span>
            </div>
          </SidebarGroup>
        ) : null}
      </SidebarContent>
      <SidebarFooter>
        <div className="flex gap-2 rounded-3xl bg-card p-3 text-sm shadow-sm ring-1 ring-foreground/5 group-data-[collapsible=icon]:hidden">
          <IkIcon name="lock" className="mt-0.5 text-muted-foreground" />
          <p className="text-muted-foreground">
            {active === "Advanced"
              ? "Private by default"
              : "Progress is stored on this device."}
          </p>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
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
    <header className="flex min-h-16 shrink-0 flex-col gap-3 border-b p-4 md:h-16 md:flex-row md:items-center md:gap-2 md:px-6 md:py-0">
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="hidden data-[orientation=vertical]:h-4 md:block"
        />
        <div className="min-w-0 flex-1">
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
    <div className="flex flex-col gap-5">
      {currentFocus ? <CurrentFocusCard focus={currentFocus} /> : null}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>New word pace</CardTitle>
            <CardDescription>Choose how many new Spanish words appear while you read.</CardDescription>
            <CardAction>
              <StatusBadge>Gentle pace</StatusBadge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <div className="flex items-center justify-between gap-3">
                  <FieldLabel htmlFor="settings-discovery-rate">Discovery rate</FieldLabel>
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
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Starting point</CardTitle>
            <CardDescription>
              Pick the option that best matches your current reading in Spanish.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldSet>
              <FieldLegend className="sr-only">Reading level</FieldLegend>
              <RadioGroup
                value={resolvedReadingLevel}
                onValueChange={(value) => chooseReadingLevel(value as ReadingLevel)}
                className="grid gap-3"
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
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Learning snapshot</CardTitle>
            <CardDescription>
              Progress starts from normal reading on supported pages and builds
              local history across sites.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricStat label="Comfortable" value={stats?.comfortable ?? 0} icon="check" />
              <MetricStat label="In practice" value={stats?.practice ?? 0} icon="spark" />
              <MetricStat label="Still new" value={stats?.newCount ?? 0} icon="band" />
              <MetricStat label="Tracked total" value={stats?.total ?? 0} icon="book" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Reading band</CardTitle>
            <CardDescription>
              Normal reading on supported pages builds the local evidence that
              widens your reading range.
            </CardDescription>
            <CardAction>
              <Badge variant="outline">
                {checkpoint?.progressLabel ?? "Progress starts as you read"}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Progress value={checkpoint?.progressValue ?? 0} />
            <div className="flex flex-wrap items-center gap-2 rounded-3xl bg-muted/50 p-4">
              <span className="font-medium">{checkpoint?.currentBand ?? "Starting"}</span>
              <IkIcon name="chevron" className="text-muted-foreground" />
              <span className="font-medium">{checkpoint?.nextBand ?? "Next band"}</span>
              <Button
                variant="outline"
                disabled={!checkpoint?.canWiden || checkpoint.isWidening}
                onClick={checkpoint?.onWiden}
              >
                <IkIcon
                  name={checkpoint?.canWiden ? "band" : "lock"}
                  dataIcon="inline-start"
                />
                {checkpoint?.isWidening ? "Widening..." : "Widen reading band"}
              </Button>
            </div>
            {checkpoint?.description ? (
              <p className="text-sm text-muted-foreground">{checkpoint.description}</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
      <LearningPathView path={learningPath} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Site controls</CardTitle>
            <CardDescription>
              Pause or resume ImmersionKit per site from the popup on supported pages.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricStat label="saved choices" value={savedSiteCount} icon="link" />
              <MetricStat label="paused site" value={pausedSiteCount} icon="pause" />
            </div>
            <Button variant="outline" className="w-fit">Manage saved sites</Button>
            {siteSummary ? <p className="text-sm text-muted-foreground">{siteSummary}</p> : null}
          </CardContent>
        </Card>
        <Alert>
          <IkIcon name="band" />
          <AlertDescription>
            <span className="block font-medium text-foreground">Small steps add up.</span>
            You can always adjust these settings as your reading grows.
          </AlertDescription>
        </Alert>
      </div>
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
      className="rounded-3xl bg-muted/40 p-4 ring-1 ring-foreground/5 has-data-[state=checked]:bg-card has-data-[state=checked]:ring-primary/40"
    >
      <RadioGroupItem id={id} value={value} />
      <FieldContent>
        <FieldLabel htmlFor={id}>{title}</FieldLabel>
        <FieldDescription>{copy}</FieldDescription>
      </FieldContent>
    </Field>
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
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{focus.shortGoal}</p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <FocusList title="Words" items={focus.wordFocusLabels} />
          <FocusList title="Examples" items={focus.wordExampleLabels ?? []} />
          <FocusList title="Word patterns" items={focus.wordPatternLabels} />
          <FocusList title="Phrases" items={focus.phraseFocusExamples} />
          <FocusList title="Grammar" items={focus.grammarFocusLabels} />
        </div>
      </CardContent>
      <CardFooter className="grid gap-3 border-t pt-4 md:grid-cols-2">
        <FocusFooter label="Sentence style" value={focus.sentenceFocusLabel} />
        <FocusFooter label="Next focus" value={focus.nextFocusPreview} />
      </CardFooter>
    </Card>
  );
}

function FocusList({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <div className="rounded-3xl bg-muted/50 p-4">
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
          Five reading levels widen vocabulary, phrases, grammar, and sentence complexity.
        </p>
      </div>
      <div className="grid gap-3">
        {path.map((level) => (
          <details
            key={level.levelId}
            className="rounded-4xl bg-card p-5 text-card-foreground shadow-sm ring-1 ring-foreground/5"
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
            <div className="mt-4 grid gap-3">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
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
                      "rounded-3xl bg-background p-3 ring-1 ring-foreground/5",
                      band.active && "ring-primary/40"
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
    <div className="min-w-0 rounded-3xl bg-background p-3 ring-1 ring-foreground/5">
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
    <div className="flex flex-col gap-5">
      {!apiKeyValid && provider === "openai" ? (
        <Alert variant="destructive">
          <IkIcon name="shield" />
          <AlertDescription>
            Add a valid OpenAI API key before turning sentence help on.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-5">
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
            <CardFooter className="border-t pt-4">
              <Badge variant={sentenceHelpEnabled ? "default" : "secondary"}>
                {sentenceHelpEnabled ? "On" : "Off"}
              </Badge>
            </CardFooter>
          </Card>
          <Alert>
            <IkIcon name="lock" />
            <AlertDescription>
              Selected sentence text is sent to OpenAI only when sentence help is
              enabled. Page text is not sent automatically.
            </AlertDescription>
          </Alert>
          <Card>
            <CardHeader>
              <CardTitle>Provider</CardTitle>
              <CardDescription>Choose a provider for sentence help.</CardDescription>
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
              </FieldGroup>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>OpenAI API key</CardTitle>
              <CardDescription>Enter your OpenAI API key.</CardDescription>
              <CardAction>
                <Badge variant={apiKeyValid ? "default" : "destructive"}>
                  {apiKeyValid ? "Looks valid" : "Needs key"}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field data-invalid={!apiKeyValid && provider === "openai" ? true : undefined}>
                  <FieldLabel htmlFor="openai-api-key">API key</FieldLabel>
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
            <CardFooter className="gap-2 border-t pt-4">
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
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Sentence note preview</CardTitle>
              <CardDescription>This is an example of what you'll see.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 rounded-4xl bg-muted/50 p-4">
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
              You can turn sentence help on or off any time. Vocabulary help will keep working locally.
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
              <div className="break-all rounded-3xl bg-muted/50 p-4 text-sm text-muted-foreground">
                {diagnostics.activePageUrl}
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              {activePageMetrics.map((metric) => (
                <MetricStat key={metric.label} label={metric.label} value={metric.value} icon="spark" />
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
            <div className="rounded-3xl bg-muted/50 p-4 text-sm text-muted-foreground">
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
            <div className="grid gap-3 sm:grid-cols-2">
              {storageMetrics.map((metric) => (
                <MetricStat key={metric.label} label={metric.label} value={metric.value} icon="shield" />
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
    <div className="flex items-center justify-between gap-3 rounded-3xl bg-background p-3 ring-1 ring-foreground/5">
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
