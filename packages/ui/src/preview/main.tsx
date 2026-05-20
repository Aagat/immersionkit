import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
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
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ExtensionOptions,
  ExtensionPopup,
  PhraseHelpPopoverContent,
  ReadingPage,
  SentenceHelpPopoverContent,
  WordHelpPopoverContent
} from "../index";
import {
  BrowserChrome,
  IkIcon,
  ImmersionFrame,
  InlineMark
} from "../screens/screen-primitives";
import {
  baseOptionsProps,
  phrasePopoverProps,
  sentencePopoverProps,
  supportedPopupProps,
  wordPopoverProps
} from "./fixtures";
import "../styles.css";
import "./preview.css";

type ScenarioGroup = "Popup" | "Reading" | "Popovers" | "Options" | "Components";
type ViewportKind = "popup" | "desktop" | "mobile" | "popover" | "free";
type PreviewTheme = "light" | "dark";

type WorkshopScenario = {
  id: string;
  title: string;
  group: ScenarioGroup;
  viewport: ViewportKind;
  description: string;
  render: () => ReactElement;
};

const scenarios: readonly WorkshopScenario[] = [
  {
    id: "popup-supported-on",
    title: "Supported Site On",
    group: "Popup",
    viewport: "popup",
    description: "Normal supported-page popup with reading mode enabled.",
    render: () => (
      <ExtensionPopup
        {...supportedPopupProps}
        chromeFrame={false}
        siteState="on"
      />
    )
  },
  {
    id: "popup-supported-paused",
    title: "Supported Site Paused",
    group: "Popup",
    viewport: "popup",
    description: "Supported-page popup after the current site is paused.",
    render: () => (
      <ExtensionPopup
        {...supportedPopupProps}
        chromeFrame={false}
        siteState="paused"
      />
    )
  },
  {
    id: "popup-unsupported-page",
    title: "Unsupported Page",
    group: "Popup",
    viewport: "popup",
    description: "Unsupported browser page guidance and disabled site controls.",
    render: () => (
      <ExtensionPopup
        {...supportedPopupProps}
        chromeFrame={false}
        state="unsupported"
        unsupportedMessage="This page is not supported. Open a normal HTTP(S) article, blog, or docs page."
      />
    )
  },
  {
    id: "popup-first-run",
    title: "First Run Intro",
    group: "Popup",
    viewport: "popup",
    description: "Compact first-run explanation in the popup shell.",
    render: () => (
      <ExtensionPopup
        {...supportedPopupProps}
        chromeFrame={false}
        firstRunIntro
      />
    )
  },
  {
    id: "popup-saving",
    title: "Saving Site State",
    group: "Popup",
    viewport: "popup",
    description: "Popup site toggle while a pause/resume write is in flight.",
    render: () => (
      <ExtensionPopup
        {...supportedPopupProps}
        chromeFrame={false}
        isSavingSite
      />
    )
  },
  {
    id: "popup-error",
    title: "Popup Error",
    group: "Popup",
    viewport: "popup",
    description: "Recoverable popup error without hiding local progress.",
    render: () => (
      <ExtensionPopup
        {...supportedPopupProps}
        chromeFrame={false}
        errorMessage="ImmersionKit could not read this tab yet. Reload the page and try again."
      />
    )
  },
  {
    id: "reading-supported-article",
    title: "Supported Article",
    group: "Reading",
    viewport: "desktop",
    description: "Normal article page with inline words and phrases.",
    render: () => <ReadingPage state="supported" />
  },
  {
    id: "reading-word-help",
    title: "Inline Word Help",
    group: "Reading",
    viewport: "desktop",
    description: "Article state with the shared word popover presentation.",
    render: () => <ReadingPage state="word" />
  },
  {
    id: "reading-phrase-help",
    title: "Phrase Help",
    group: "Reading",
    viewport: "desktop",
    description: "Article state with phrase help and no phrase-memory action.",
    render: () => <ReadingPage state="phrase" />
  },
  {
    id: "reading-sentence-help",
    title: "Sentence Help",
    group: "Reading",
    viewport: "desktop",
    description: "Article state with selected sentence help controls.",
    render: () => <ReadingPage state="sentence" />
  },
  {
    id: "reading-dense-narrow",
    title: "Dense Narrow Article",
    group: "Reading",
    viewport: "mobile",
    description: "Mobile-width dense article review for wrapping and popover pressure.",
    render: () => <DenseNarrowArticle />
  },
  {
    id: "word-popover-new",
    title: "Word Popover New",
    group: "Popovers",
    viewport: "popover",
    description: "Shared actual word popover in the new-word state.",
    render: () => (
      <WordHelpPopoverContent {...wordPopoverProps} status="new" />
    )
  },
  {
    id: "word-popover-learning",
    title: "Word Popover Learning",
    group: "Popovers",
    viewport: "popover",
    description: "Shared actual word popover in the practice state.",
    render: () => <WordHelpPopoverContent {...wordPopoverProps} status="learning" />
  },
  {
    id: "word-popover-known",
    title: "Word Popover Known",
    group: "Popovers",
    viewport: "popover",
    description: "Shared actual word popover in the comfortable state.",
    render: () => <WordHelpPopoverContent {...wordPopoverProps} status="known" />
  },
  {
    id: "phrase-popover",
    title: "Phrase Popover",
    group: "Popovers",
    viewport: "popover",
    description: "Shared actual phrase popover with Close help copy.",
    render: () => <PhraseHelpPopoverContent {...phrasePopoverProps} />
  },
  {
    id: "sentence-popover-translation",
    title: "Sentence Popover Translation",
    group: "Popovers",
    viewport: "popover",
    description: "Shared actual sentence popover starting on translation.",
    render: () => <SentenceHelpPopoverContent {...sentencePopoverProps} />
  },
  {
    id: "sentence-popover-original",
    title: "Sentence Popover Original",
    group: "Popovers",
    viewport: "popover",
    description: "Shared actual sentence popover starting on original/source.",
    render: () => (
      <SentenceHelpPopoverContent
        {...sentencePopoverProps}
        initialSourceVisible
      />
    )
  },
  {
    id: "options-general",
    title: "Options Overview",
    group: "Options",
    viewport: "desktop",
    description: "Top-level Options overview with page-level navigation.",
    render: () => (
      <ExtensionOptions
        {...baseOptionsProps}
        initialSection="Overview"
        activeSection="Overview"
      />
    )
  },
  {
    id: "options-reading",
    title: "Options Reading",
    group: "Options",
    viewport: "desktop",
    description: "Reading pace, starting point, and density preview.",
    render: () => (
      <ExtensionOptions
        {...baseOptionsProps}
        initialSection="Reading"
        activeSection="Reading"
      />
    )
  },
  {
    id: "options-curriculum",
    title: "Options Curriculum",
    group: "Options",
    viewport: "desktop",
    description: "Curriculum roadmap with current focus and next band.",
    render: () => (
      <ExtensionOptions
        {...baseOptionsProps}
        initialSection="Curriculum"
        activeSection="Curriculum"
      />
    )
  },
  {
    id: "options-sites",
    title: "Options Sites",
    group: "Options",
    viewport: "desktop",
    description: "Saved site controls and exclusions.",
    render: () => (
      <ExtensionOptions
        {...baseOptionsProps}
        initialSection="Sites"
        activeSection="Sites"
      />
    )
  },
  {
    id: "options-translation-off",
    title: "Translation Off",
    group: "Options",
    viewport: "desktop",
    description: "Sentence help off with provider set to none.",
    render: () => (
      <ExtensionOptions
        {...baseOptionsProps}
        initialSection="Translation"
        activeSection="Translation"
        sentenceHelpEnabled={false}
        provider="none"
      />
    )
  },
  {
    id: "options-translation-invalid-key",
    title: "OpenAI Invalid Key",
    group: "Options",
    viewport: "desktop",
    description: "Provider selected with invalid key guidance.",
    render: () => (
      <ExtensionOptions
        {...baseOptionsProps}
        initialSection="Translation"
        activeSection="Translation"
        provider="openai"
        apiKey="bad-key"
        apiKeyValid={false}
        errorMessage="Add a valid OpenAI API key before turning sentence help on."
      />
    )
  },
  {
    id: "options-translation-configured",
    title: "OpenAI Configured",
    group: "Options",
    viewport: "desktop",
    description: "Sentence help enabled after provider setup.",
    render: () => (
      <ExtensionOptions
        {...baseOptionsProps}
        initialSection="Translation"
        activeSection="Translation"
        sentenceHelpEnabled
        provider="openai"
        apiKey="sk-...preview"
        apiKeyValid
        translationSummary="Sentence help is enabled for selected sentences only."
        statusMessage="Settings saved."
      />
    )
  },
  {
    id: "options-advanced-diagnostics",
    title: "Advanced Diagnostics",
    group: "Options",
    viewport: "desktop",
    description: "Diagnostic build surface behind deliberate access.",
    render: () => (
      <ExtensionOptions
        {...baseOptionsProps}
        initialSection="Advanced"
        activeSection="Advanced"
        showAdvanced
      />
    )
  },
  {
    id: "options-first-run",
    title: "Options First Run",
    group: "Options",
    viewport: "desktop",
    description: "First-run explanation in Options.",
    render: () => (
      <ExtensionOptions
        {...baseOptionsProps}
        initialSection="Overview"
        activeSection="Overview"
        firstRunIntro
      />
    )
  },
  {
    id: "options-saving",
    title: "Options Saving",
    group: "Options",
    viewport: "desktop",
    description: "Saving state for options controls.",
    render: () => (
      <ExtensionOptions
        {...baseOptionsProps}
        initialSection="Overview"
        activeSection="Overview"
        isSaving
      />
    )
  },
  {
    id: "options-loading-error",
    title: "Options Loading Error",
    group: "Options",
    viewport: "desktop",
    description: "Loading and recoverable error messaging.",
    render: () => (
      <ExtensionOptions
        {...baseOptionsProps}
        initialSection="Overview"
        activeSection="Overview"
        isLoading
        errorMessage="Local settings are temporarily unavailable."
      />
    )
  },
  {
    id: "components-catalog",
    title: "Component Catalog",
    group: "Components",
    viewport: "free",
    description: "Compact shadcn component inventory used by ImmersionKit UI.",
    render: () => <ComponentCatalog />
  }
] as const;

const groups: readonly ScenarioGroup[] = [
  "Popup",
  "Reading",
  "Popovers",
  "Options",
  "Components"
] as const;

function PreviewApp() {
  const params = new URLSearchParams(window.location.search);
  const scenarioId = params.get("scenario");
  const theme = readPreviewTheme(params);
  const focusedScenario = scenarioId
    ? scenarios.find((scenario) => scenario.id === scenarioId)
    : null;
  const visibleScenarios = focusedScenario ? [focusedScenario] : scenarios;

  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.dataset.previewTheme = theme;

  return (
    <main className="ik-workshop-shell" data-preview-theme={theme}>
      <header className="ik-workshop-header">
        <div>
          <p>ImmersionKit UI Workshop</p>
          <h1>Fast Browser Review Surface</h1>
        </div>
        <div className="ik-workshop-header-actions">
          <ThemeNav theme={theme} scenarioId={focusedScenario?.id ?? null} />
          <nav aria-label="Workshop groups">
            {groups.map((group) => (
              <a key={group} href={`#${group.toLowerCase()}`}>
                {group}
              </a>
            ))}
          </nav>
        </div>
      </header>

      {focusedScenario ? (
        <section className="ik-workshop-section">
          <SectionHeading
            id="focused"
            title={focusedScenario.title}
            description={`Focused scenario: ${focusedScenario.id}`}
          />
          <ScenarioCard scenario={focusedScenario} focused theme={theme} />
        </section>
      ) : (
        groups.map((group) => (
          <section key={group} className="ik-workshop-section">
            <SectionHeading
              id={group.toLowerCase()}
              title={group}
              description={groupDescription(group)}
            />
            <div className="ik-workshop-grid">
              {visibleScenarios
                .filter((scenario) => scenario.group === group)
                .map((scenario) => (
                  <ScenarioCard key={scenario.id} scenario={scenario} theme={theme} />
                ))}
            </div>
          </section>
        ))
      )}
    </main>
  );
}

function readPreviewTheme(params: URLSearchParams): PreviewTheme {
  return params.get("theme") === "dark" ? "dark" : "light";
}

function buildWorkshopUrl({
  scenarioId,
  theme
}: {
  scenarioId: string | null;
  theme: PreviewTheme;
}): string {
  const params = new URLSearchParams();
  if (scenarioId) {
    params.set("scenario", scenarioId);
  }
  if (theme === "dark") {
    params.set("theme", "dark");
  }
  const query = params.toString();
  return query ? `?${query}` : window.location.pathname;
}

function focusScenarioUrl(scenarioId: string, theme: PreviewTheme): string {
  const params = new URLSearchParams({ scenario: scenarioId });
  if (theme === "dark") {
    params.set("theme", "dark");
  }
  return `?${params.toString()}`;
}

function ThemeNav({
  scenarioId,
  theme
}: {
  scenarioId: string | null;
  theme: PreviewTheme;
}) {
  return (
    <nav className="ik-workshop-theme-nav" aria-label="Preview theme">
      <a
        href={buildWorkshopUrl({ scenarioId, theme: "light" })}
        aria-current={theme === "light" ? "page" : undefined}
      >
        Light
      </a>
      <a
        href={buildWorkshopUrl({ scenarioId, theme: "dark" })}
        aria-current={theme === "dark" ? "page" : undefined}
      >
        Dark
      </a>
    </nav>
  );
}

function SectionHeading({
  id,
  title,
  description
}: {
  id: string;
  title: string;
  description: string;
}) {
  return (
    <div id={id} className="ik-workshop-section-heading">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

function ScenarioCard({
  scenario,
  focused = false,
  theme
}: {
  scenario: WorkshopScenario;
  focused?: boolean;
  theme: PreviewTheme;
}) {
  return (
    <article
      id={scenario.id}
      className="ik-workshop-card"
      data-focused={focused ? "true" : undefined}
    >
      <header>
        <div>
          <h3>{scenario.title}</h3>
          <p>{scenario.description}</p>
        </div>
        <div className="ik-workshop-card-actions">
          <a href={`#${scenario.id}`}>#{scenario.id}</a>
          <a href={focusScenarioUrl(scenario.id, theme)}>Focus</a>
        </div>
      </header>
      <ViewportFrame viewport={scenario.viewport}>{scenario.render()}</ViewportFrame>
    </article>
  );
}

function ViewportFrame({
  children,
  viewport
}: {
  children: ReactElement;
  viewport: ViewportKind;
}) {
  return (
    <div className="ik-workshop-viewport" data-viewport={viewport}>
      {children}
    </div>
  );
}

function ComponentCatalog() {
  return (
    <ImmersionFrame variant="settings">
      <div className="ik-component-catalog">
        <Card>
          <CardHeader>
            <CardTitle>Buttons, Badges, And Alerts</CardTitle>
            <CardDescription>Core commands and status indicators.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="link">Link</Button>
              <Button size="icon-sm" aria-label="Icon button">
                <IkIcon name="gear" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>default</Badge>
              <Badge variant="secondary">secondary</Badge>
              <Badge variant="outline">outline</Badge>
            </div>
            <Alert>
              <IkIcon name="shield" />
              <AlertTitle>Local-first preview</AlertTitle>
              <AlertDescription>
                Sentence help is optional and selected-sentence only.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Inputs And Selection</CardTitle>
            <CardDescription>Settings controls used in Options.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <Input aria-label="API key" placeholder="OpenAI API key" />
            <div className="flex items-center justify-between gap-3 rounded-3xl bg-muted/50 p-4">
              <span>Enable sentence help</span>
              <Switch aria-label="Enable sentence help" />
            </div>
            <Slider value={[8]} min={0} max={20} aria-label="Discovery rate" />
            <RadioGroup defaultValue="False beginner" className="grid gap-2">
              <label className="flex items-center gap-2">
                <RadioGroupItem value="Beginner" /> Beginner
              </label>
              <label className="flex items-center gap-2">
                <RadioGroupItem value="False beginner" /> False beginner
              </label>
              <label className="flex items-center gap-2">
                <RadioGroupItem value="Intermediate" /> Intermediate
              </label>
            </RadioGroup>
            <Select defaultValue="openai">
              <SelectTrigger aria-label="Provider">
                <SelectValue placeholder="Provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tabs, Progress, And Dividers</CardTitle>
            <CardDescription>Compact layout primitives used across surfaces.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <Tabs defaultValue="general">
              <TabsList>
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="translation">Translation</TabsTrigger>
                <TabsTrigger value="advanced">Advanced</TabsTrigger>
              </TabsList>
              <TabsContent value="general">General settings panel.</TabsContent>
              <TabsContent value="translation">Translation settings panel.</TabsContent>
              <TabsContent value="advanced">Diagnostics panel.</TabsContent>
            </Tabs>
            <Progress value={68} />
            <Separator />
            <div className="grid gap-3 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Nested Card</CardTitle>
                </CardHeader>
                <CardContent>Repeated item card example.</CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Metric Card</CardTitle>
                </CardHeader>
                <CardContent>41 tracked items</CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      </div>
    </ImmersionFrame>
  );
}

function DenseNarrowArticle() {
  return (
    <ImmersionFrame variant="browser">
      <BrowserChrome
        title="Dense local notes"
        url="localnotes.example/archive/dense-reading"
      >
        <article className="bg-background">
          <main className="mx-auto flex max-w-3xl flex-col gap-4 px-5 py-8 text-base leading-7">
            <p className="text-sm font-medium uppercase text-muted-foreground">
              Local notes
            </p>
            <h1 className="text-3xl font-medium leading-tight">
              Small routines for dense reading days
            </h1>
            {[
              "The important new city has at least one small family house near the water, and the public safety update includes school board schedules, weather forecasts, and local route changes.",
              "As soon as we arrive at the old city, we read the important book right now, compare the simple notes, and keep the page readable while Spanish appears in small doses.",
              "The local train route gives every visitor enough time to find a quiet place, review a short reading, and continue with calm decisions instead of rushing."
            ].map((copy, index) => (
              <p key={copy}>
                {index === 0 ? (
                  <>
                    The <InlineMark status="learning">importante</InlineMark>{" "}
                    <InlineMark status="new">nuevo</InlineMark>{" "}
                    <InlineMark status="learning">ciudad</InlineMark> has{" "}
                    <InlineMark kind="phrase" status="known">al menos</InlineMark>{" "}
                    one small <InlineMark status="learning">familia</InlineMark>{" "}
                    house near the water, and the public safety update includes
                    school board schedules, weather forecasts, and local route
                    changes.
                  </>
                ) : (
                  copy
                )}
              </p>
            ))}
          </main>
        </article>
      </BrowserChrome>
    </ImmersionFrame>
  );
}

function groupDescription(group: ScenarioGroup): string {
  if (group === "Popup") {
    return "Extension popup states for supported, paused, unsupported, first-run, saving, and error flows.";
  }

  if (group === "Reading") {
    return "Browser-page reading states with inline words, phrases, and selected sentence help.";
  }

  if (group === "Popovers") {
    return "Shared actual popover presentation components rendered outside the extension runtime.";
  }

  if (group === "Options") {
    return "Settings, provider, progression, diagnostics, and feedback states.";
  }

  return "Compact shadcn component catalog for primitives used by ImmersionKit surfaces.";
}

createRoot(document.getElementById("root") as HTMLElement).render(<PreviewApp />);
