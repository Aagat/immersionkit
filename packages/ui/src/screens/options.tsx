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
import { Textarea } from "@/components/ui/textarea";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  BrowserChrome,
  IkIcon,
  ImmersionFrame,
  ImmersionLogo,
  InlineMark,
  SentenceBlock
} from "./screen-primitives";
import {
  type MetricIconName,
  settingsTabs,
  type ExtensionOptionsProps,
  type OptionsSection,
  type ReadingLevel,
  type SupportIssueCategory,
  type TtsPlaybackRateSettings
} from "./types";

const DEFAULT_TTS_PLAYBACK_RATES: TtsPlaybackRateSettings = {
  word: 0.8,
  phrase: 1,
  sentence: 1
};

export function ExtensionOptions({
  initialSection = "Overview",
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
  ttsVoiceId = "es_ES-sharvard-medium-m",
  ttsFallbackBehavior = "piper-with-system-fallback",
  ttsPlaybackRates = DEFAULT_TTS_PLAYBACK_RATES,
  siteSummary,
  pausedSiteCount = 0,
  savedSiteCount = 0,
  advancedDiagnostics,
  exactActiveBandId,
  bandOptions = [],
  account = { status: "signed-out" },
  supportCategory = "bug",
  supportDescription = "",
  supportIncludeExcerpts = false,
  supportStatusMessage,
  supportErrorMessage,
  isGeneratingSupportReport = false,
  isSubmittingSupportFeedback = false,
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
  onClearApiKey,
  onTtsVoiceChange,
  onTtsFallbackBehaviorChange,
  onTtsPlaybackRateChange,
  onSupportCategoryChange,
  onSupportDescriptionChange,
  onSupportIncludeExcerptsChange,
  onDownloadSupportReport,
  onCopySupportSummary,
  onSubmitSupportFeedback,
  onPreviewSignIn,
  onPreviewLogout
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
            <TabsContent value="Overview" className="m-0">
              <OptionsOverviewPanel
                discoveryRatePercent={discoveryRatePercent}
                readingLevel={readingLevel}
                stats={stats}
                checkpoint={checkpoint}
                currentFocus={currentFocus}
                siteSummary={siteSummary}
                pausedSiteCount={pausedSiteCount}
                savedSiteCount={savedSiteCount}
                sentenceHelpEnabled={sentenceHelpEnabled}
                provider={provider}
                account={account}
                onOpenSection={setActive}
              />
            </TabsContent>
            <TabsContent value="Account" className="m-0">
              <OptionsAccountPanel
                account={account}
                onPreviewSignIn={onPreviewSignIn}
                onPreviewLogout={onPreviewLogout}
              />
            </TabsContent>
            <TabsContent value="Reading" className="m-0">
              <OptionsReadingPanel
                discoveryRatePercent={discoveryRatePercent}
                readingLevel={readingLevel}
                onDiscoveryRateChange={onDiscoveryRateChange}
                onReadingLevelChange={onReadingLevelChange}
              />
            </TabsContent>
            <TabsContent value="Curriculum" className="m-0">
              <OptionsCurriculumPanel
                checkpoint={checkpoint}
                currentFocus={currentFocus}
                learningPath={learningPath}
              />
            </TabsContent>
            <TabsContent value="Sites" className="m-0">
              <OptionsSitesPanel
                siteSummary={siteSummary}
                pausedSiteCount={pausedSiteCount}
                savedSiteCount={savedSiteCount}
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
                ttsVoiceId={ttsVoiceId}
                ttsFallbackBehavior={ttsFallbackBehavior}
                ttsPlaybackRates={ttsPlaybackRates}
                onSentenceHelpChange={onSentenceHelpChange}
                onProviderChange={onProviderChange}
                onApiKeyChange={onApiKeyChange}
                onToggleApiKeyVisibility={onToggleApiKeyVisibility}
                onClearApiKey={onClearApiKey}
                onTtsVoiceChange={onTtsVoiceChange}
                onTtsFallbackBehaviorChange={onTtsFallbackBehaviorChange}
                onTtsPlaybackRateChange={onTtsPlaybackRateChange}
              />
            </TabsContent>
            <TabsContent value="Support" className="m-0">
              <OptionsSupportPanel
                category={supportCategory}
                description={supportDescription}
                includeExcerpts={supportIncludeExcerpts}
                statusMessage={supportStatusMessage}
                errorMessage={supportErrorMessage}
                isGenerating={isGeneratingSupportReport}
                isSubmitting={isSubmittingSupportFeedback}
                onCategoryChange={onSupportCategoryChange}
                onDescriptionChange={onSupportDescriptionChange}
                onIncludeExcerptsChange={onSupportIncludeExcerptsChange}
                onDownloadReport={onDownloadSupportReport}
                onCopySummary={onCopySupportSummary}
                onSubmitFeedback={onSubmitSupportFeedback}
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
        url={`chrome-extension://immersionkit/options.html${active === "Advanced" ? "#advanced" : active === "Support" ? "#support" : active === "Account" ? "#account" : ""}`}
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
    Overview: [
      "Options",
      "Quick status across reading, curriculum, sites, and local progress."
    ],
    Account: [
      "Account",
      "Preview access, account status, and local learning data."
    ],
    Reading: [
      "Reading",
      "Spanish density, starting point, and inline preview."
    ],
    Curriculum: [
      "Curriculum",
      "Roadmap through the current focus and next band."
    ],
    Sites: [
      "Sites",
      "Saved site choices and exclusions."
    ],
    Translation: [
      "Sentence help",
      "Optional provider setup for selected sentence notes."
    ],
    Support: [
      "Support",
      "Export a local issue report for the support channel."
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

function OptionsOverviewPanel({
  discoveryRatePercent = 8,
  readingLevel,
  stats,
  checkpoint,
  currentFocus,
  siteSummary,
  pausedSiteCount = 0,
  savedSiteCount = 0,
  sentenceHelpEnabled,
  provider,
  account,
  onOpenSection
}: Pick<
  ExtensionOptionsProps,
  | "discoveryRatePercent"
  | "readingLevel"
  | "stats"
  | "checkpoint"
  | "currentFocus"
  | "siteSummary"
  | "pausedSiteCount"
  | "savedSiteCount"
  | "sentenceHelpEnabled"
  | "provider"
  | "account"
> & {
  onOpenSection: (section: OptionsSection) => void;
}) {
  const readingLevelLabel = readingLevel ?? "False beginner";
  const sentenceHelpLabel =
    provider === "openai"
      ? sentenceHelpEnabled
        ? "Sentence help on"
        : "Provider selected"
      : "Sentence help off";

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.7fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
          <CardDescription>
            The main loop stays in the browser; these pages control pace,
            curriculum, local progress, and site behavior.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <OverviewTile
            title="Account"
            value={account?.status === "signed-in" ? "Signed in" : "Sign in required"}
            detail={
              account?.status === "signed-in"
                ? `${account.email}. Learning progress stays local.`
                : "Preview sign-in unlocks reading mode; learning progress stays local."
            }
            icon="shield"
            action="Open Account"
            onAction={() => onOpenSection("Account")}
          />
          <OverviewTile
            title="Reading"
            value={`${discoveryRatePercent}% new word pace`}
            detail={`${readingLevelLabel} starting point with a density preview.`}
            icon="book"
            action="Open Reading"
            onAction={() => onOpenSection("Reading")}
          />
          <OverviewTile
            title="Curriculum"
            value={checkpoint?.currentBand ?? "Starting"}
            detail={
              currentFocus
                ? `${currentFocus.levelLabel}: ${currentFocus.learnerTitle}`
                : "Current focus appears after curriculum loads."
            }
            icon="band"
            action="Open Curriculum"
            onAction={() => onOpenSection("Curriculum")}
          />
          <OverviewTile
            title="Sites"
            value={`${pausedSiteCount} paused`}
            detail={`${savedSiteCount} saved site choices. ${siteSummary ?? ""}`.trim()}
            icon="link"
            action="Open Sites"
            onAction={() => onOpenSection("Sites")}
          />
        </CardContent>
      </Card>
      <div className="flex flex-col gap-4">
        <LearningSnapshotCard stats={stats} />
        <Card>
          <CardHeader>
            <CardTitle>Preview state</CardTitle>
            <CardDescription>
              Quick release-facing checks before final screenshots.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <CompactMetric
              label="Reading band"
              value={checkpoint?.nextBand ?? "Next band"}
              icon="band"
            />
            <CompactMetric
              label="Sentence help"
              value={sentenceHelpLabel}
              icon="translate"
            />
            <CompactMetric
              label="Site choices"
              value={savedSiteCount}
              icon="link"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function OptionsAccountPanel({
  account = { status: "signed-out" },
  onPreviewSignIn,
  onPreviewLogout
}: Pick<
  ExtensionOptionsProps,
  "account" | "onPreviewSignIn" | "onPreviewLogout"
>) {
  const signedIn = account.status === "signed-in";
  const notRequired = account.status === "not-required";

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Preview account</CardTitle>
          <CardDescription>
            {notRequired
              ? "This build can use local reading mode without preview sign-in."
              : signedIn
                ? "You are signed in for the ImmersionKit preview."
                : "Preview sign-in is required before reading mode turns on."}
          </CardDescription>
          <CardAction>
            <Badge variant={signedIn ? "default" : "secondary"}>
              {notRequired ? "Local preview" : signedIn ? account.previewStatus : "Signed out"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {notRequired ? (
            <p className="text-sm text-muted-foreground">
              Account-required preview builds use Google sign-in for access,
              support, and activation measurement. This build keeps reading mode
              available locally.
            </p>
          ) : signedIn ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <CompactMetric label="Email" value={account.email} icon="message" />
              <CompactMetric
                label="Preview status"
                value={account.previewStatus}
                icon="check"
              />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Sign in with Google to activate preview access for this install.
                ImmersionKit keeps learning progress and reading history on this
                device.
              </p>
              <Button className="w-fit" onClick={onPreviewSignIn}>
                <IkIcon name="link" dataIcon="inline-start" />
                Continue with Google
              </Button>
            </div>
          )}
        </CardContent>
        {signedIn ? (
          <CardFooter className="flex-wrap gap-2 border-t pt-3">
            <Button variant="outline" onClick={onPreviewLogout}>
              Log out
            </Button>
            <span className="text-sm text-muted-foreground">
              Logging out stops account-required reading mode but keeps local
              learning data on this device.
            </span>
          </CardFooter>
        ) : null}
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Local learning data</CardTitle>
          <CardDescription>
            Account identity is separate from learning progress.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <CompactMetric label="Learning progress" value="Local" icon="shield" />
          <CompactMetric label="Reading history" value="Local" icon="book" />
          <CompactMetric label="Preview access" value="Account" icon="lock" />
          <p className="text-sm text-muted-foreground">
            Preview sign-in supports access, support, and high-level activation
            measurement. It does not sync vocabulary, review history, or page
            text.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function OverviewTile({
  title,
  value,
  detail,
  icon,
  action,
  onAction
}: {
  title: string;
  value: string | number;
  detail: string;
  icon: MetricIconName;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border bg-background p-3">
      <div className="flex min-w-0 items-start gap-2">
        <IkIcon name={icon} className="mt-0.5 text-muted-foreground" />
        <div className="min-w-0">
          <h3 className="text-sm font-medium">{title}</h3>
          <p className="text-sm font-medium">{value}</p>
          <p className="text-sm text-muted-foreground">{detail}</p>
        </div>
      </div>
      <Button variant="outline" size="sm" className="w-fit" onClick={onAction}>
        {action}
      </Button>
    </div>
  );
}

function OptionsReadingPanel({
  discoveryRatePercent = 8,
  readingLevel,
  onDiscoveryRateChange,
  onReadingLevelChange
}: Pick<
  ExtensionOptionsProps,
  | "discoveryRatePercent"
  | "readingLevel"
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
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Reading pace</CardTitle>
            <CardDescription>
              Set the Spanish dose for normal browsing and preview the expected
              inline density.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
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
            <DensityPreview discoveryRatePercent={discoveryRatePercent} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Starting point</CardTitle>
            <CardDescription>
              Choose the current reading band seed. You can adjust this later.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldSet>
              <FieldLegend className="sr-only">Starting point</FieldLegend>
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
      </div>
    </div>
  );
}

function OptionsCurriculumPanel({
  checkpoint,
  currentFocus,
  learningPath = []
}: Pick<ExtensionOptionsProps, "checkpoint" | "currentFocus" | "learningPath">) {
  const activeLevel = learningPath.find((level) => level.active);

  return (
    <div className="flex flex-col gap-4">
      <CurrentFocusSummaryCard
        checkpoint={checkpoint}
        currentFocus={currentFocus}
        activeLevel={activeLevel}
      />
      <UnlockRoadmapCard
        checkpoint={checkpoint}
        currentFocus={currentFocus}
        learningPath={learningPath}
        activeLevel={activeLevel}
      />
    </div>
  );
}

function OptionsSitesPanel({
  siteSummary,
  pausedSiteCount = 0,
  savedSiteCount = 0
}: Pick<
  ExtensionOptionsProps,
  "siteSummary" | "pausedSiteCount" | "savedSiteCount"
>) {
  return (
    <SiteControlsCard
      siteSummary={siteSummary}
      pausedSiteCount={pausedSiteCount}
      savedSiteCount={savedSiteCount}
    />
  );
}

function DensityPreview({
  discoveryRatePercent
}: {
  discoveryRatePercent: number;
}) {
  const densityLabel =
    discoveryRatePercent <= 4
      ? "Subtle"
      : discoveryRatePercent >= 14
        ? "Bold"
        : "Balanced";
  const showBalanced = discoveryRatePercent >= 6;
  const showBold = discoveryRatePercent >= 12;

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Density preview</h3>
        <Badge variant="outline">{densityLabel}</Badge>
      </div>
      <div className="flex flex-col gap-3 text-sm leading-relaxed">
        <p>
          The morning{" "}
          <InlineMark status="learning">rutina</InlineMark>{" "}
          stays readable while the page introduces a few useful words.
        </p>
        <p>
          You can follow the main idea, notice a familiar{" "}
          {showBalanced ? (
            <InlineMark kind="phrase" status="learning">frase</InlineMark>
          ) : (
            "phrase"
          )}
          , and keep moving through the article.
        </p>
        <p>
          At a {densityLabel.toLowerCase()} pace,{" "}
          {showBold ? (
            <InlineMark status="new">palabras nuevas</InlineMark>
          ) : (
            "new words"
          )}{" "}
          still appear only when context looks safe.
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        Real pages may be sparser when ambiguity, forms, code, or sensitive
        areas are skipped.
      </p>
    </div>
  );
}

function LearningSnapshotCard({
  stats
}: Pick<ExtensionOptionsProps, "stats">) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Learning snapshot</CardTitle>
        <CardDescription>
          Local progress from normal reading on supported pages.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        <CompactMetric label="Comfortable" value={stats?.comfortable ?? 0} icon="check" />
        <CompactMetric label="In practice" value={stats?.practice ?? 0} icon="spark" />
        <CompactMetric label="Still new" value={stats?.newCount ?? 0} icon="band" />
        <CompactMetric label="Tracked total" value={stats?.total ?? 0} icon="book" />
      </CardContent>
    </Card>
  );
}

function SiteControlsCard({
  siteSummary,
  pausedSiteCount = 0,
  savedSiteCount = 0
}: Pick<
  ExtensionOptionsProps,
  "siteSummary" | "pausedSiteCount" | "savedSiteCount"
>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Site controls</CardTitle>
        <CardDescription>
          Pause or resume ImmersionKit per site from the popup.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <CompactMetric label="Saved choices" value={savedSiteCount} icon="link" />
          <CompactMetric label="Paused sites" value={pausedSiteCount} icon="pause" />
        </div>
        {siteSummary ? <p className="text-sm text-muted-foreground">{siteSummary}</p> : null}
        <Button variant="outline" className="w-fit">Manage saved sites</Button>
      </CardContent>
    </Card>
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
      <strong className="min-w-0 truncate text-right text-sm font-medium">{value}</strong>
    </div>
  );
}

type CurriculumLevel = NonNullable<ExtensionOptionsProps["learningPath"]>[number];
type RoadmapState = "completed" | "current" | "gate" | "locked" | "later";
type RoadmapMilestoneData = {
  id: string;
  state: RoadmapState;
  label: string;
  badge: string;
  title: string;
  detail: string;
  showProgress?: boolean;
};

function CurrentFocusSummaryCard({
  checkpoint,
  currentFocus,
  activeLevel
}: Pick<ExtensionOptionsProps, "checkpoint" | "currentFocus"> & {
  activeLevel?: CurriculumLevel;
}) {
  const currentTitle = currentFocus
    ? `${currentFocus.levelLabel}: ${currentFocus.learnerTitle}`
    : "Start reading to set a focus";
  const currentBand = currentFocus?.bandLabel ?? checkpoint?.currentBand ?? "Starting";
  const wordSummary = compactSummary(
    currentFocus?.allowedPartOfSpeechPolicy ?? activeLevel?.vocabularySummary,
    "Word categories unlock from safe local evidence."
  ).replace(/\s+only$/i, "");
  const phraseSummary = compactSummary(
    activeLevel?.phraseSummary,
    "Fixed reusable chunks."
  );
  const grammarSummary = compactSummary(
    activeLevel?.grammarSummary ?? currentFocus?.grammarFocusLabels.join(", "),
    "Core sentence patterns."
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Current focus</CardTitle>
        <CardDescription>
          {currentTitle}
        </CardDescription>
        <CardAction>
          <Badge variant="outline">{currentBand}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,0.75fr))]">
        <div className="min-w-0 rounded-lg border bg-background p-3">
          <h3 className="text-sm font-medium">{currentBand}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {currentFocus?.shortGoal ?? "Supported pages create the first local evidence."}
          </p>
        </div>
        <FocusCategory label="Words" value={wordSummary} />
        <FocusCategory label="Phrases" value={phraseSummary} />
        <FocusCategory label="Grammar" value={grammarSummary} />
      </CardContent>
    </Card>
  );
}

function FocusCategory({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-background p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function UnlockRoadmapCard({
  checkpoint,
  currentFocus,
  learningPath,
  activeLevel
}: {
  checkpoint?: ExtensionOptionsProps["checkpoint"];
  currentFocus?: ExtensionOptionsProps["currentFocus"];
  learningPath: NonNullable<ExtensionOptionsProps["learningPath"]>;
  activeLevel?: CurriculumLevel;
}) {
  const [showFullRoadmap, setShowFullRoadmap] = useState(false);
  const milestones = buildRoadmapMilestones({
    checkpoint,
    currentFocus,
    learningPath,
    activeLevel
  });
  const bandCount = countLearningPathBands(learningPath);
  const shouldCollapseRoadmap = bandCount > 5;
  const visibleWindow = getRoadmapVisibleWindow({
    milestones,
    shouldCollapseRoadmap,
    showFullRoadmap
  });
  const visibleMilestones = milestones.slice(
    visibleWindow.start,
    visibleWindow.end
  );
  const hasHiddenBefore =
    shouldCollapseRoadmap && !showFullRoadmap && visibleWindow.start > 0;
  const hasHiddenAfter =
    shouldCollapseRoadmap &&
    !showFullRoadmap &&
    visibleWindow.end < milestones.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Roadmap</CardTitle>
        <CardDescription>
          Reading bands unlock through local evidence.
        </CardDescription>
        <CardAction>
          <Badge variant="outline">
            {checkpoint?.progressLabel ?? "Progress starts as you read"}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="relative overflow-hidden">
          <ol className="relative flex flex-col gap-3">
            <span
              aria-hidden="true"
              className="absolute left-8 top-5 bottom-5 w-px bg-border"
            />
            {visibleMilestones.map((milestone) => (
              <RoadmapMilestone
                key={milestone.id}
                milestone={milestone}
                checkpoint={checkpoint}
              />
            ))}
          </ol>
          {hasHiddenBefore ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 z-20 h-14 bg-gradient-to-b from-card via-card/90 to-transparent"
            />
          ) : null}
          {hasHiddenAfter ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-16 bg-gradient-to-t from-card via-card/90 to-transparent"
            />
          ) : null}
        </div>
      </CardContent>
      {shouldCollapseRoadmap ? (
        <CardFooter className="flex-wrap justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {showFullRoadmap
              ? `Showing all ${bandCount} bands`
              : `${bandCount} bands total`}
          </p>
          <Button
            variant="outline"
            size="sm"
            aria-expanded={showFullRoadmap}
            onClick={() => setShowFullRoadmap((value) => !value)}
          >
            <IkIcon
              name="chevron"
              dataIcon="inline-start"
              className={cn(
                "transition-transform",
                showFullRoadmap ? "-rotate-90" : "rotate-90"
              )}
            />
            {showFullRoadmap ? "Show current window" : "Show full roadmap"}
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}

function RoadmapMilestone({
  milestone,
  checkpoint
}: {
  milestone: RoadmapMilestoneData;
  checkpoint?: ExtensionOptionsProps["checkpoint"];
}) {
  const isGate = milestone.state === "gate";

  return (
    <li
      className={cn(
        "relative grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-4",
        isGate ? "min-h-24" : "min-h-20"
      )}
    >
      <div className="relative flex justify-center">
        <RoadmapMarker
          state={milestone.state}
          progressLabel={isGate ? compactProgressMarkerLabel(milestone.badge) : undefined}
        />
      </div>
      <div
        className={cn(
          "rounded-lg border bg-background p-3",
          milestone.state === "current" && "border-primary/50"
        )}
      >
        {isGate ? (
          <div className="grid gap-4 md:grid-cols-[9rem_minmax(0,1fr)_minmax(16rem,0.7fr)] md:items-center">
            <RoadmapMilestoneCopy milestone={milestone} showBadge={false} />
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Progress value={checkpoint?.progressValue ?? 0} />
                <span className="shrink-0 text-sm text-muted-foreground">
                  {milestone.badge}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
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
            </div>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-[9rem_minmax(0,1fr)] md:items-center">
            <RoadmapMilestoneCopy milestone={milestone} />
          </div>
        )}
      </div>
    </li>
  );
}

function RoadmapMilestoneCopy({
  milestone,
  showBadge = true
}: {
  milestone: RoadmapMilestoneData;
  showBadge?: boolean;
}) {
  return (
    <>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium">{milestone.label}</h3>
          {showBadge ? (
            <Badge
              variant={
                milestone.state === "current"
                  ? "default"
                  : milestone.state === "locked" || milestone.state === "later"
                    ? "secondary"
                    : "outline"
              }
            >
              {milestone.badge}
            </Badge>
          ) : null}
        </div>
      </div>
      <div className="min-w-0 md:border-l md:pl-5">
        <p className="text-sm font-medium">{milestone.title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{milestone.detail}</p>
      </div>
    </>
  );
}

function RoadmapMarker({
  state,
  progressLabel
}: {
  state: RoadmapState;
  progressLabel?: string;
}) {
  const icon: MetricIconName =
    state === "completed"
      ? "check"
      : state === "locked" || state === "later"
        ? "lock"
        : state === "gate"
          ? "band"
          : "spark";

  return (
    <span
      className={cn(
        "relative z-10 flex items-center justify-center rounded-full border bg-background",
        state === "gate" ? "size-14" : "size-9",
        state === "current" && "border-primary bg-primary text-primary-foreground",
        state === "completed" && "bg-primary text-primary-foreground",
        (state === "locked" || state === "later") && "bg-muted text-muted-foreground",
        state === "gate" && "border-primary/50"
      )}
    >
      {state === "gate" && progressLabel ? (
        <span className="text-sm font-medium">{progressLabel}</span>
      ) : (
        <IkIcon name={icon} />
      )}
    </span>
  );
}

function buildRoadmapMilestones({
  checkpoint,
  currentFocus,
  learningPath,
  activeLevel
}: {
  checkpoint?: ExtensionOptionsProps["checkpoint"];
  currentFocus?: ExtensionOptionsProps["currentFocus"];
  learningPath: NonNullable<ExtensionOptionsProps["learningPath"]>;
  activeLevel?: CurriculumLevel;
}) {
  const flattenedBands = learningPath.flatMap((level) =>
    level.bands.map((band) => ({
      band
    }))
  );

  if (flattenedBands.length === 0) {
    return buildFallbackRoadmapMilestones({ checkpoint, currentFocus, activeLevel });
  }

  const activeIndex = flattenedBands.findIndex(({ band }) => band.active);
  const firstLockedIndex = flattenedBands.findIndex(
    ({ band }, index) => !band.unlocked && index > activeIndex
  );
  const milestones: RoadmapMilestoneData[] = flattenedBands.flatMap(({ band }, index) => {
    const isCurrent = band.active;
    const isCompleted = band.unlocked && !band.active;
    const isNextLocked = index === firstLockedIndex;
    const state: RoadmapState = isCurrent
      ? "current"
      : isCompleted
        ? "completed"
        : isNextLocked
          ? "locked"
          : "later";
    const badge = isCurrent
      ? "Now"
      : isCompleted
        ? "Completed"
        : isNextLocked
          ? "Locked"
          : "Later";
    const title = isCurrent
      ? currentFocus?.learnerTitle ?? band.learnerTitle
      : band.learnerTitle;
    const detail = isCurrent
      ? currentFocus?.shortGoal ?? band.learnerSummary
      : band.learnerSummary;
    const rows: RoadmapMilestoneData[] = [
      {
        id: band.bandId,
        state,
        label: band.bandLabel,
        badge,
        title,
        detail
      }
    ];

    if (isCurrent) {
      rows.push(createEvidenceGateMilestone(checkpoint));
    }

    return rows;
  });

  if (milestones.some((milestone) => milestone.state === "gate")) {
    return milestones;
  }

  const insertionIndex =
    firstLockedIndex > 0 ? firstLockedIndex : Math.min(1, milestones.length);
  return [
    ...milestones.slice(0, insertionIndex),
    createEvidenceGateMilestone(checkpoint),
    ...milestones.slice(insertionIndex)
  ];
}

function buildFallbackRoadmapMilestones({
  checkpoint,
  currentFocus,
  activeLevel
}: {
  checkpoint?: ExtensionOptionsProps["checkpoint"];
  currentFocus?: ExtensionOptionsProps["currentFocus"];
  activeLevel?: CurriculumLevel;
}) {
  const activeBand = findActiveBand(activeLevel);
  const completedBand = findCompletedBand(activeLevel);

  return [
    {
      id: "completed-band",
      state: "completed" as const,
      label: completedBand?.bandLabel ?? "1A",
      badge: "Completed",
      title: completedBand?.learnerTitle ?? "First contact",
      detail: completedBand?.learnerSummary ?? "Foundation material is already open."
    },
    {
      id: "current-band",
      state: "current" as const,
      label: activeBand?.bandLabel ?? shortBandLabel(currentFocus?.bandLabel ?? checkpoint?.currentBand) ?? "1B",
      badge: "Now",
      title: currentFocus?.learnerTitle ?? activeBand?.learnerTitle ?? "Current focus",
      detail: currentFocus?.shortGoal ?? activeBand?.learnerSummary ?? "Keep reading supported pages."
    },
    createEvidenceGateMilestone(checkpoint),
    {
      id: "locked-band",
      state: "locked" as const,
      label: shortBandLabel(checkpoint?.nextBand) ?? "2A",
      badge: "Locked",
      title: "Next band",
      detail: "Unlocks when the evidence gate is ready."
    },
    {
      id: "later-level",
      state: "later" as const,
      label: "Level 2",
      badge: "Later",
      title: "Broader contexts",
      detail: "Later levels widen vocabulary, phrases, and sentence complexity."
    }
  ];
}

function createEvidenceGateMilestone(
  checkpoint?: ExtensionOptionsProps["checkpoint"]
) {
  return {
    id: "evidence-gate",
    state: "gate" as const,
    label: "Evidence gate",
    badge: checkpoint?.progressLabel ?? "0%",
    title: `${checkpoint?.currentBand ?? "Current band"} -> ${checkpoint?.nextBand ?? "Next band"}`,
    detail: checkpoint?.description ?? "Read supported pages to widen the active band.",
    showProgress: true
  };
}

function findActiveBand(level?: CurriculumLevel) {
  return level?.bands.find((band) => band.active);
}

function findCompletedBand(level?: CurriculumLevel) {
  return level?.bands.find((band) => band.unlocked && !band.active);
}

function shortBandLabel(label?: string) {
  return label?.replace(/^Band\s+/i, "").trim();
}

function compactSummary(value: string | undefined, fallback: string) {
  const summary = value?.trim() || fallback;
  return summary.replace(/\.$/, "");
}

function compactProgressMarkerLabel(label: string) {
  const trimmed = label.trim();
  return /^\d{1,3}%$/.test(trimmed) ? trimmed : undefined;
}

function countLearningPathBands(
  learningPath: NonNullable<ExtensionOptionsProps["learningPath"]>
) {
  return learningPath.reduce((count, level) => count + level.bands.length, 0);
}

function getRoadmapVisibleWindow({
  milestones,
  shouldCollapseRoadmap,
  showFullRoadmap
}: {
  milestones: RoadmapMilestoneData[];
  shouldCollapseRoadmap: boolean;
  showFullRoadmap: boolean;
}) {
  if (!shouldCollapseRoadmap || showFullRoadmap || milestones.length <= 5) {
    return {
      start: 0,
      end: milestones.length
    };
  }

  const gateIndex = milestones.findIndex(
    (milestone) => milestone.state === "gate"
  );
  const currentIndex = milestones.findIndex(
    (milestone) => milestone.state === "current"
  );
  const anchorIndex = gateIndex >= 0 ? gateIndex : Math.max(currentIndex, 0);
  const windowSize = 5;
  const maxStart = Math.max(0, milestones.length - windowSize);
  const start = clamp(anchorIndex - 2, 0, maxStart);

  return {
    start,
    end: Math.min(milestones.length, start + windowSize)
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function OptionsTranslationPanel({
  sentenceHelpEnabled = false,
  provider = "none",
  apiKey = "",
  apiKeyValid = false,
  showApiKey = false,
  translationSummary,
  ttsVoiceId = "es_ES-sharvard-medium-m",
  ttsFallbackBehavior = "piper-with-system-fallback",
  ttsPlaybackRates = DEFAULT_TTS_PLAYBACK_RATES,
  onSentenceHelpChange,
  onProviderChange,
  onApiKeyChange,
  onToggleApiKeyVisibility,
  onClearApiKey,
  onTtsVoiceChange,
  onTtsFallbackBehaviorChange,
  onTtsPlaybackRateChange
}: Pick<
  ExtensionOptionsProps,
  | "sentenceHelpEnabled"
  | "provider"
  | "apiKey"
  | "apiKeyValid"
  | "showApiKey"
  | "translationSummary"
  | "ttsVoiceId"
  | "ttsFallbackBehavior"
  | "ttsPlaybackRates"
  | "onSentenceHelpChange"
  | "onProviderChange"
  | "onApiKeyChange"
  | "onToggleApiKeyVisibility"
  | "onClearApiKey"
  | "onTtsVoiceChange"
  | "onTtsFallbackBehaviorChange"
  | "onTtsPlaybackRateChange"
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
          <Card>
            <CardHeader>
              <CardTitle>Speech</CardTitle>
              <CardDescription>
                Speaker buttons use the selected local Piper voice.
              </CardDescription>
              <CardAction>
                <Badge variant="secondary">Local</Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="tts-voice">Voice</FieldLabel>
                  <Select
                    value={ttsVoiceId}
                    onValueChange={(value) => {
                      if (
                        value === "es_ES-davefx-medium" ||
                        value === "es_ES-carlfm-x_low" ||
                        value === "es_AR-daniela-high" ||
                        value === "es_MX-claude-high" ||
                        value === "es_ES-sharvard-medium-m" ||
                        value === "es_ES-sharvard-medium-f"
                      ) {
                        onTtsVoiceChange?.(value);
                      }
                    }}
                  >
                    <SelectTrigger id="tts-voice" className="w-full">
                      <SelectValue placeholder="Voice" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="es_ES-davefx-medium">
                          DaveFX, Spain, medium
                        </SelectItem>
                        <SelectItem value="es_ES-carlfm-x_low">
                          CarlFM, Spain, x-low
                        </SelectItem>
                        <SelectItem value="es_AR-daniela-high">
                          Daniela, Argentina, high
                        </SelectItem>
                        <SelectItem value="es_MX-claude-high">
                          Claude, Mexico, high
                        </SelectItem>
                        <SelectItem value="es_ES-sharvard-medium-m">
                          Sharvard M, Spain, medium
                        </SelectItem>
                        <SelectItem value="es_ES-sharvard-medium-f">
                          Sharvard F, Spain, medium
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="tts-fallback">Fallback</FieldLabel>
                  <Select
                    value={ttsFallbackBehavior}
                    onValueChange={(value) => {
                      if (
                        value === "piper-with-system-fallback" ||
                        value === "piper-only" ||
                        value === "system-only"
                      ) {
                        onTtsFallbackBehaviorChange?.(value);
                      }
                    }}
                  >
                    <SelectTrigger id="tts-fallback" className="w-full">
                      <SelectValue placeholder="Fallback" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="piper-with-system-fallback">
                          Piper, then system voice
                        </SelectItem>
                        <SelectItem value="piper-only">Piper only</SelectItem>
                        <SelectItem value="system-only">System voice only</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    System voice uses Chrome TTS when available.
                  </FieldDescription>
                </Field>
                <SpeechRateControl
                  id="tts-word-speed"
                  label="Word speed"
                  value={ttsPlaybackRates.word}
                  onChange={(rate) => onTtsPlaybackRateChange?.("word", rate)}
                />
                <SpeechRateControl
                  id="tts-phrase-speed"
                  label="Phrase speed"
                  value={ttsPlaybackRates.phrase}
                  onChange={(rate) => onTtsPlaybackRateChange?.("phrase", rate)}
                />
                <SpeechRateControl
                  id="tts-sentence-speed"
                  label="Sentence speed"
                  value={ttsPlaybackRates.sentence}
                  onChange={(rate) => onTtsPlaybackRateChange?.("sentence", rate)}
                />
              </FieldGroup>
            </CardContent>
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

function SpeechRateControl({
  id,
  label,
  value,
  onChange
}: {
  id: string;
  label: string;
  value: number;
  onChange?: (value: number) => void;
}) {
  const percent = Math.round(value * 100);

  return (
    <Field>
      <div className="flex items-center justify-between gap-3">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <span className="text-sm font-medium">{percent}%</span>
      </div>
      <Slider
        id={id}
        min={50}
        max={125}
        step={5}
        value={[percent]}
        onValueChange={(values) => onChange?.((values[0] ?? 100) / 100)}
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Slower</span>
        <span>Normal</span>
        <span>Faster</span>
      </div>
    </Field>
  );
}

const supportIssueOptions: readonly {
  value: SupportIssueCategory;
  label: string;
}[] = [
  { value: "bug", label: "Bug" },
  { value: "quality", label: "Quality issue" },
  { value: "translation", label: "Incorrect translation" },
  { value: "page-compatibility", label: "Page compatibility" },
  { value: "other", label: "Other" }
];

function OptionsSupportPanel({
  category = "bug",
  description = "",
  includeExcerpts = false,
  statusMessage,
  errorMessage,
  isGenerating = false,
  isSubmitting = false,
  onCategoryChange,
  onDescriptionChange,
  onIncludeExcerptsChange,
  onDownloadReport,
  onCopySummary,
  onSubmitFeedback
}: {
  category?: SupportIssueCategory;
  description?: string;
  includeExcerpts?: boolean;
  statusMessage?: string | null;
  errorMessage?: string | null;
  isGenerating?: boolean;
  isSubmitting?: boolean;
  onCategoryChange?: (category: SupportIssueCategory) => void;
  onDescriptionChange?: (description: string) => void;
  onIncludeExcerptsChange?: (include: boolean) => void;
  onDownloadReport?: () => void;
  onCopySummary?: () => void;
  onSubmitFeedback?: () => void;
}) {
  const busy = isGenerating || isSubmitting;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Report an issue</CardTitle>
          <CardDescription>
            Create a local report file and send it through the support channel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="support-issue-category">Issue type</FieldLabel>
              <Select
                value={category}
                onValueChange={(value) =>
                  onCategoryChange?.(value as SupportIssueCategory)
                }
              >
                <SelectTrigger id="support-issue-category" className="w-full">
                  <SelectValue placeholder="Issue type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {supportIssueOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="support-description">What happened?</FieldLabel>
              <Textarea
                id="support-description"
                value={description}
                maxLength={2000}
                placeholder="Briefly describe the bug, bad translation, or page behavior."
                onChange={(event) => onDescriptionChange?.(event.target.value)}
              />
              <FieldDescription>
                Avoid pasting passwords, account data, or private page text.
              </FieldDescription>
            </Field>
            <Field orientation="horizontal" className="rounded-lg border p-3">
              <Switch
                id="support-include-excerpts"
                checked={includeExcerpts}
                onCheckedChange={onIncludeExcerptsChange}
              />
              <FieldContent>
                <FieldLabel htmlFor="support-include-excerpts">
                  Include replacement excerpts
                </FieldLabel>
                <FieldDescription>
                  Adds a few short snippets around rendered ImmersionKit words or phrases.
                </FieldDescription>
              </FieldContent>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
      <div className="flex flex-col gap-4">
        {statusMessage ? (
          <Alert>
            <IkIcon name="check" />
            <AlertDescription>{statusMessage}</AlertDescription>
          </Alert>
        ) : null}
        {errorMessage ? (
          <Alert variant="destructive">
            <WarningCircleIcon aria-hidden="true" />
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>Support bundle</CardTitle>
            <CardDescription>
              The report includes extension state and redacted page context.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <CompactMetric label="Page URL" value="Redacted" icon="shield" />
            <CompactMetric label="API keys" value="Excluded" icon="lock" />
            <CompactMetric
              label="Page excerpts"
              value={includeExcerpts ? "Opted in" : "Off"}
              icon="document"
            />
          </CardContent>
          <CardFooter className="flex-wrap gap-2 border-t pt-3">
            <Button
              disabled={busy}
              onClick={onDownloadReport}
            >
              <IkIcon name="document" dataIcon="inline-start" />
              {isGenerating ? "Preparing..." : "Download report"}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={onCopySummary}
            >
              <IkIcon name="message" dataIcon="inline-start" />
              Copy summary
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={onSubmitFeedback}
            >
              <IkIcon name="link" dataIcon="inline-start" />
              {isSubmitting ? "Sending..." : "Send feedback"}
            </Button>
          </CardFooter>
        </Card>
        <Alert>
          <IkIcon name="shield" />
          <AlertDescription>
            Reports are created on this device. They do not upload automatically.
          </AlertDescription>
        </Alert>
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
