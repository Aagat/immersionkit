import { useState } from "react";
import type { ReactNode } from "react";
import {
  Badge,
  Button,
  Card,
  Icon,
  IconButton,
  ImmersionLogo,
  ProgressBar
} from "../components/primitives";
import type { IconName } from "../components/primitives";
import { cn } from "../lib/utils";
import {
  BrowserChrome,
  ImmersionFrame,
  LocalFooter
} from "./screen-primitives";
import type {
  ExtensionPopupProps,
  SiteControlState
} from "./types";

export function ExtensionPopup({
  state = "supported",
  siteState,
  initialSiteState = "on",
  chromeFrame = true,
  title,
  url,
  bandTitle = "Reading band 1",
  bandSubtitle = "Words + phrases",
  progressValue = 38,
  progressLabel = "42 / 120 reading evidence items",
  progressDetail = "A few more reading evidence items will widen your band.",
  metrics,
  localFooterText,
  unsupportedMessage = "Open a normal HTTP(S) article, blog, or docs page to use reading mode.",
  errorMessage = null,
  sentenceHelpSummary,
  isSavingSite = false,
  onSiteToggle,
  onOpenSettings,
  onAdjustPace
}: ExtensionPopupProps) {
  const [localSiteState, setLocalSiteState] =
    useState<SiteControlState>(initialSiteState);
  const resolvedSiteState = siteState ?? localSiteState;
  const supported = state === "supported";
  const enabled = supported && resolvedSiteState === "on";
  const toggleSite = () => {
    if (onSiteToggle) {
      onSiteToggle();
      return;
    }
    setLocalSiteState((value) => (value === "on" ? "paused" : "on"));
  };
  const popupContent = (
    <div className={cn(chromeFrame && "absolute right-16 top-20 z-10")}>
      <PopupPanel>
        <PopupHeader onOpenSettings={onOpenSettings} />
        {errorMessage ? (
          <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="status">
            <Icon name="info" />
            {errorMessage}
          </div>
        ) : null}
        {supported ? (
          <>
            <div className="grid grid-cols-[88px_1fr] items-center gap-5 pt-1">
              <div className="grid size-20 place-items-center rounded-[18px] border-2 border-primary bg-primary/10 text-primary shadow-sm">
                <Icon name="book" className="size-9" />
              </div>
              <div>
                <h2 className="text-3xl font-semibold leading-tight tracking-normal">{bandTitle}</h2>
                <p className="mt-1 text-lg text-muted-foreground">{bandSubtitle}</p>
              </div>
            </div>
            <ProgressBar
              value={progressValue}
              label={progressLabel}
              detail={progressDetail}
            />
            <div className="h-px bg-border" />
            <Card className={cn("flex items-center justify-between gap-6 p-5", !enabled && "bg-muted/40")}>
              <div className="min-w-0">
                <Badge tone={enabled ? "accent" : "muted"} className="text-base">
                  {enabled ? "On for this site" : "Paused for this site"}
                </Badge>
                <h1 className="mt-4 max-w-sm text-2xl font-medium leading-9 tracking-normal">
                  {enabled
                    ? "A few Spanish words will appear while you read."
                    : "Spanish words are paused on this site."}
                </h1>
              </div>
              <button
                type="button"
                className={cn(
                  "grid size-28 shrink-0 place-items-center rounded-full border-[10px] bg-background text-muted-foreground shadow-sm transition-colors",
                  enabled && "border-primary/25 bg-primary text-primary-foreground",
                  isSavingSite && "cursor-default opacity-60"
                )}
                aria-label={enabled ? "Pause reading mode" : "Resume reading mode"}
                aria-pressed={enabled}
                disabled={isSavingSite}
                onClick={toggleSite}
              >
                <Icon name="power" className="size-12" />
              </button>
            </Card>
            <div className="grid grid-cols-3 gap-2">
              {(metrics ?? [
                { label: "Comfortable", value: 0, icon: "check" },
                { label: "In practice", value: 0, icon: "pause" },
                { label: "Tracked words", value: 0, icon: "spark" }
              ]).map((metric) => (
                <PopupMetric
                  key={metric.label}
                  label={metric.label}
                  value={metric.value}
                  icon={metric.icon ?? "spark"}
                />
              ))}
            </div>
            <LocalFooter
              text={
                localFooterText ??
                sentenceHelpSummary ??
                (enabled
                  ? "Stored on this device. Sentence help is off."
                  : "Stored on this device. Reading mode is paused here.")
              }
              action="Settings"
              onAction={onOpenSettings}
            />
            <Button
              variant="primary"
              icon={enabled ? undefined : "power"}
              className="h-16 text-xl"
              onClick={enabled ? undefined : toggleSite}
            >
              {enabled ? "Keep reading" : "Resume reading"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="justify-self-center"
              onClick={onAdjustPace ?? onOpenSettings}
            >
              Adjust pace
            </Button>
          </>
        ) : (
          <>
            <div className="grid justify-items-center gap-5 rounded-lg bg-transparent px-8 py-4 text-center">
              <Badge tone="muted" icon="power" className="text-base">Unavailable here</Badge>
              <h1 className="text-3xl font-semibold tracking-normal">
                This page is not supported
              </h1>
              <p className="max-w-md text-2xl leading-9 text-muted-foreground">
                {unsupportedMessage}
              </p>
              <button
                type="button"
                className="grid size-36 place-items-center rounded-full border-[10px] border-muted bg-background text-muted-foreground shadow-sm"
                aria-label="Controls unavailable"
                disabled
              >
                <Icon name="power" className="size-16" />
              </button>
              <span className="text-lg font-medium text-muted-foreground">
                Controls unavailable
              </span>
            </div>
            <Card className="flex items-center gap-5">
              <Icon name="shield" className="size-9 shrink-0 text-foreground" />
              <p className="text-xl leading-8 text-muted-foreground">
                We skip private, browser, form-heavy, and sensitive pages.
              </p>
            </Card>
            <Card className="grid gap-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold">{bandTitle}</h3>
                <span className="text-xs text-muted-foreground">{progressLabel}</span>
              </div>
              <ProgressBar
                value={progressValue}
                detail="Your progress is saved and will be ready when you return to a supported page."
              />
            </Card>
            <LocalFooter text="Your reading data stays on this device." />
            <Button variant="secondary" className="h-14 text-lg" onClick={onOpenSettings}>Open settings</Button>
          </>
        )}
      </PopupPanel>
    </div>
  );

  if (!chromeFrame) {
    return <ImmersionFrame variant="popup">{popupContent}</ImmersionFrame>;
  }

  return (
    <ImmersionFrame variant="browser">
      <BrowserChrome
        title={title ?? (supported ? "Kyoto in Slow Season" : "Settings")}
        url={url ?? (supported ? "travelguide/kyoto" : "chrome://settings/privacy")}
        blurred
      >
        {popupContent}
      </BrowserChrome>
    </ImmersionFrame>
  );
}

function PopupPanel({ children }: { children: ReactNode }) {
  return (
    <section className="grid w-[640px] max-w-[calc(100vw-16px)] gap-6 rounded-lg border bg-card p-8 text-card-foreground shadow-panel">
      {children}
    </section>
  );
}

function PopupHeader({ onOpenSettings }: { onOpenSettings?: () => void }) {
  return (
    <header className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-4 text-3xl font-semibold">
        <ImmersionLogo size="lg" />
        <span>ImmersionKit</span>
      </div>
      <IconButton label="Open settings" icon="gear" className="size-12 [&_svg]:size-8" onClick={onOpenSettings} />
    </header>
  );
}

function PopupMetric({
  label,
  value,
  icon
}: {
  label: string;
  value: string | number;
  icon: IconName;
}) {
  return (
    <div className="grid min-h-32 gap-3 rounded-lg border bg-card p-4 text-center shadow-sm">
      <div className="flex min-w-0 items-center justify-center gap-2 text-lg text-muted-foreground">
        <Icon name={icon} className="size-6 text-foreground" />
        <span className="min-w-0 truncate">{label}</span>
      </div>
      <p className="text-4xl font-semibold leading-none">{value}</p>
    </div>
  );
}
