import { useState } from "react";
import type { ReactNode } from "react";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  BrowserChrome,
  IkIcon,
  ImmersionFrame,
  ImmersionLogo,
  LocalFooter,
  MetricStat
} from "./screen-primitives";
import type { ExtensionPopupProps, SiteControlState } from "./types";

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
  firstRunIntro = false,
  errorMessage = null,
  sentenceHelpSummary,
  isSavingSite = false,
  onSiteToggle,
  onOpenSettings,
  onAdjustPace,
  onDismissIntro
}: ExtensionPopupProps) {
  const [localSiteState, setLocalSiteState] =
    useState<SiteControlState>(initialSiteState);
  const resolvedSiteState = siteState ?? localSiteState;
  const supported = state === "supported";
  const enabled = supported && resolvedSiteState === "on";
  const progress = Math.max(0, Math.min(100, progressValue));
  const popupContent = (
    <div
      className={
        chromeFrame
          ? "absolute inset-x-4 top-4 sm:inset-x-auto sm:right-8 sm:top-8 sm:w-[360px]"
          : "w-[360px]"
      }
    >
      <PopupPanel>
        <PopupHeader onOpenSettings={onOpenSettings} />
        {errorMessage ? (
          <Alert>
            <WarningCircleIcon aria-hidden="true" />
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}
        {firstRunIntro ? (
          <Card>
            <CardHeader className="flex-row gap-3">
              <IkIcon name="shield" className="mt-0.5 text-muted-foreground" />
              <div className="min-w-0">
                <CardTitle>Read normally with small doses of Spanish.</CardTitle>
                <CardDescription>
                  Words and phrases appear gently on supported pages. Progress
                  and reading history stay on this device. Pause any site, adjust
                  your starting point or pace in settings, and turn sentence help
                  on only when you want it.
                </CardDescription>
              </div>
            </CardHeader>
            <CardFooter>
              <Button variant="outline" size="sm" onClick={onDismissIntro}>
                Got it
              </Button>
            </CardFooter>
          </Card>
        ) : null}
        {supported ? (
          <SupportedPopup
            bandTitle={bandTitle}
            bandSubtitle={bandSubtitle}
            progress={progress}
            progressLabel={progressLabel}
            progressDetail={progressDetail}
            enabled={enabled}
            metrics={metrics}
            isSavingSite={isSavingSite}
            localFooterText={
              localFooterText ??
              sentenceHelpSummary ??
              (enabled
                ? "Stored on this device. Sentence help is off."
                : "Stored on this device. Reading mode is paused here.")
            }
            onSiteToggle={() => {
              if (onSiteToggle) {
                onSiteToggle();
                return;
              }
              setLocalSiteState((value) => (value === "on" ? "paused" : "on"));
            }}
            onOpenSettings={onOpenSettings}
            onAdjustPace={onAdjustPace ?? onOpenSettings}
          />
        ) : (
          <UnsupportedPopup
            unsupportedMessage={unsupportedMessage}
            bandTitle={bandTitle}
            progress={progress}
            progressLabel={progressLabel}
            onOpenSettings={onOpenSettings}
          />
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

function SupportedPopup({
  bandTitle,
  bandSubtitle,
  progress,
  progressLabel,
  progressDetail,
  enabled,
  metrics,
  localFooterText,
  isSavingSite,
  onSiteToggle,
  onOpenSettings,
  onAdjustPace
}: {
  bandTitle: string;
  bandSubtitle: string;
  progress: number;
  progressLabel: string;
  progressDetail: string;
  enabled: boolean;
  metrics: ExtensionPopupProps["metrics"];
  localFooterText: string;
  isSavingSite: boolean;
  onSiteToggle: () => void;
  onOpenSettings?: () => void;
  onAdjustPace?: () => void;
}) {
  return (
    <>
      <section className="flex items-center gap-3">
        <div className="grid size-12 place-items-center rounded-3xl bg-muted shadow-sm ring-1 ring-foreground/5">
          <IkIcon name="book" />
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-medium">{bandTitle}</h2>
          <p className="text-sm text-muted-foreground">{bandSubtitle}</p>
        </div>
      </section>
      <ProgressBlock
        value={progress}
        label={progressLabel}
        detail={progressDetail}
      />
      <Separator />
      <Card>
        <CardHeader className="flex-row items-center gap-3">
          <div className="min-w-0 flex-1">
            <Badge variant={enabled ? "default" : "secondary"}>
              {enabled ? "On for this site" : "Paused for this site"}
            </Badge>
            <CardTitle className="mt-3 text-base">
              {enabled
                ? "A few Spanish words will appear while you read."
                : "Spanish words are paused on this site."}
            </CardTitle>
          </div>
          <Button
            type="button"
            variant={enabled ? "default" : "outline"}
            size="icon-lg"
            aria-label={enabled ? "Pause reading mode" : "Resume reading mode"}
            aria-pressed={enabled}
            disabled={isSavingSite}
            onClick={onSiteToggle}
          >
            <IkIcon name="power" />
          </Button>
        </CardHeader>
      </Card>
      <div className="grid grid-cols-3 gap-2">
        {(metrics ?? [
          { label: "Comfortable", value: 0, icon: "check" },
          { label: "In practice", value: 0, icon: "pause" },
          { label: "Tracked words", value: 0, icon: "spark" }
        ]).map((metric) => (
          <MetricStat
            key={metric.label}
            label={metric.label}
            value={metric.value}
            icon={metric.icon ?? "spark"}
            compact
          />
        ))}
      </div>
      <LocalFooter text={localFooterText} action="Settings" onAction={onOpenSettings} />
      <Button
        variant={enabled ? "secondary" : "default"}
        onClick={enabled ? undefined : onSiteToggle}
      >
        {!enabled ? <IkIcon name="power" dataIcon="inline-start" /> : null}
        {enabled ? "Keep reading" : "Resume reading"}
      </Button>
      <Button variant="link" className="h-auto px-0" onClick={onAdjustPace}>
        Adjust pace
      </Button>
    </>
  );
}

function UnsupportedPopup({
  unsupportedMessage,
  bandTitle,
  progress,
  progressLabel,
  onOpenSettings
}: {
  unsupportedMessage: string;
  bandTitle: string;
  progress: number;
  progressLabel: string;
  onOpenSettings?: () => void;
}) {
  return (
    <>
      <Card>
        <CardHeader>
          <Badge variant="secondary" className="w-fit">
            Unavailable here
          </Badge>
          <CardTitle>This page is not supported</CardTitle>
          <CardDescription>{unsupportedMessage}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button size="icon-lg" variant="outline" aria-label="Controls unavailable" disabled>
            <IkIcon name="power" />
          </Button>
          <p className="mt-3 text-sm text-muted-foreground">Controls unavailable</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex-row gap-3">
          <IkIcon name="shield" className="text-muted-foreground" />
          <CardDescription>
            We skip private, browser, form-heavy, and sensitive pages. Reading
            mode works on normal articles, blogs, and docs.
          </CardDescription>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{bandTitle}</CardTitle>
          <CardDescription>{progressLabel}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProgressBlock
            value={progress}
            detail="Your progress is saved and will be ready when you return to a supported page."
          />
        </CardContent>
      </Card>
      <LocalFooter text="Your reading data stays on this device." />
      <Button variant="outline" onClick={onOpenSettings}>
        Open settings
      </Button>
    </>
  );
}

function ProgressBlock({
  value,
  label,
  detail
}: {
  value: number;
  label?: string;
  detail?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {label || detail ? (
        <div className="flex flex-col gap-1 text-sm">
          {label ? <span className="font-medium">{label}</span> : null}
          {detail ? <span className="text-muted-foreground">{detail}</span> : null}
        </div>
      ) : null}
      <Progress value={value} />
    </div>
  );
}

function PopupPanel({ children }: { children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-4xl bg-card p-4 shadow-md ring-1 ring-foreground/5">
      {children}
    </section>
  );
}

function PopupHeader({ onOpenSettings }: { onOpenSettings?: () => void }) {
  return (
    <header className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <ImmersionLogo className="size-7" />
        <span className="truncate font-medium">ImmersionKit</span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Open settings"
        onClick={onOpenSettings}
      >
        <IkIcon name="gear" />
      </Button>
    </header>
  );
}
