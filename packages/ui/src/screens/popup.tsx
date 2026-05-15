import { useState } from "react";
import type { ReactNode } from "react";
import { WarningCircleIcon } from "@phosphor-icons/react";
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
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  BrowserChrome,
  IkIcon,
  ImmersionFrame,
  ImmersionLogo,
  LocalFooter
} from "./screen-primitives";
import type {
  ExtensionPopupProps,
  PopupLearningStats,
  SiteControlState
} from "./types";

const DEFAULT_POPUP_LEARNING_STATS: PopupLearningStats = {
  comfortable: 18,
  practice: 16,
  newCount: 8,
  ignored: 0,
  total: 42
};

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
  progressDetail = "A few more reading evidence items will widen your range.",
  metrics,
  learningStats,
  unsupportedMessage = "Open a normal HTTP(S) article, blog, or docs page to use reading mode.",
  firstRunIntro = false,
  errorMessage = null,
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
        <PopupHeader />
        {errorMessage ? (
          <Alert>
            <WarningCircleIcon aria-hidden="true" />
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}
        {firstRunIntro ? (
          <Alert>
            <IkIcon name="shield" />
            <AlertTitle>Read normally with small doses of Spanish.</AlertTitle>
            <AlertDescription>
              Words and phrases appear gently on supported pages. Pause any site
              or adjust your pace in settings.
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-fit"
                onClick={onDismissIntro}
              >
                Got it
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
        {supported ? (
          <SupportedPopup
            bandTitle={bandTitle}
            bandSubtitle={bandSubtitle}
            progress={progress}
            progressDetail={progressDetail}
            enabled={enabled}
            metrics={metrics}
            learningStats={learningStats}
            isSavingSite={isSavingSite}
            onSiteToggle={() => {
              if (onSiteToggle) {
                onSiteToggle();
                return;
              }
              setLocalSiteState((value) => (value === "on" ? "paused" : "on"));
            }}
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
  progressDetail,
  metrics,
  learningStats,
  enabled,
  isSavingSite,
  onSiteToggle,
  onAdjustPace
}: {
  bandTitle: string;
  bandSubtitle: string;
  progress: number;
  progressDetail: string;
  metrics: ExtensionPopupProps["metrics"];
  learningStats: ExtensionPopupProps["learningStats"];
  enabled: boolean;
  isSavingSite: boolean;
  onSiteToggle: () => void;
  onAdjustPace?: () => void;
}) {
  const stats = resolvePopupLearningStats(learningStats, metrics);

  return (
    <>
      <LearningReportCard
        bandTitle={bandTitle}
        bandSubtitle={bandSubtitle}
        progress={progress}
        progressDetail={progressDetail}
        stats={stats}
      />
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant={enabled ? "outline" : "default"}
          aria-label={enabled ? "Pause reading mode" : "Resume reading mode"}
          aria-pressed={enabled}
          disabled={isSavingSite}
          onClick={onSiteToggle}
        >
          <IkIcon name="power" dataIcon="inline-start" />
          {enabled ? "Turn off" : "Turn on"}
        </Button>
        <Button type="button" variant="secondary" onClick={onAdjustPace}>
          <IkIcon name="gear" dataIcon="inline-start" />
          Adjust pace
        </Button>
      </div>
    </>
  );
}

function LearningReportCard({
  bandTitle,
  bandSubtitle,
  progress,
  progressDetail,
  stats
}: {
  bandTitle: string;
  bandSubtitle: string;
  progress: number;
  progressDetail: string;
  stats: PopupLearningStats;
}) {
  const segments = [
    {
      key: "comfortable",
      value: stats.comfortable,
      barClassName: "bg-chart-1"
    },
    {
      key: "practice",
      value: stats.practice,
      barClassName: "bg-chart-2"
    },
    {
      key: "new",
      value: stats.newCount,
      barClassName: "bg-chart-3"
    },
    {
      key: "ignored",
      value: stats.ignored ?? 0,
      barClassName: "bg-chart-5"
    }
  ].filter((segment) => segment.value > 0);
  const total = Math.max(stats.total, 0);
  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <h2 className="truncate text-lg font-medium">Reading report</h2>
          <Badge variant="outline" className="shrink-0">
            {formatStatCount(total)} tracked
          </Badge>
        </div>
        <p className="truncate text-sm text-muted-foreground">
          {bandTitle} · {bandSubtitle}
        </p>
      </header>
      <div className="grid grid-cols-[112px_1fr] gap-3">
        <ProgressRing value={progress} />
        <div className="flex min-w-0 flex-col justify-center gap-2">
          <p className="text-sm leading-snug">{progressDetail}</p>
          <div className="rounded-3xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            {total > 0
              ? `${formatStatCount(stats.comfortable + stats.practice)} words have usable evidence.`
              : "Word stats start after supported reading."}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div
          className="flex h-4 overflow-hidden rounded-full bg-muted"
          aria-label={`Vocabulary mix: ${formatStatCount(stats.comfortable)} comfortable, ${formatStatCount(stats.practice)} practicing, ${formatStatCount(stats.newCount)} new`}
        >
          {segments.length > 0 ? (
            segments.map((segment) => (
              <span
                key={segment.key}
                className={segment.barClassName}
                style={{
                  width: `${Math.max(6, (segment.value / Math.max(total, 1)) * 100)}%`
                }}
              />
            ))
          ) : (
            <span className="w-full bg-muted-foreground/20" />
          )}
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {[
            { label: "Comfortable", value: stats.comfortable, className: "bg-chart-1" },
            { label: "Practicing", value: stats.practice, className: "bg-chart-2" },
            { label: "New", value: stats.newCount, className: "bg-chart-3" },
            { label: "Muted", value: stats.ignored ?? 0, className: "bg-chart-5" }
          ].map((item) => (
            <span key={item.label} className="flex min-w-0 items-center gap-2">
              <span className={cn("size-2 shrink-0 rounded-full", item.className)} />
              <span className="truncate">
                {item.label}: {formatStatCount(item.value)}
              </span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProgressRing({ value }: { value: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const percent = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  const dashOffset = circumference - (percent / 100) * circumference;

  return (
    <div
      className="relative grid size-28 place-items-center"
      role="img"
      aria-label={`${Math.round(percent)} percent reading readiness`}
    >
      <svg className="size-28 -rotate-90" viewBox="0 0 112 112" aria-hidden="true">
        <circle
          className="text-muted"
          cx="56"
          cy="56"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="14"
        />
        <circle
          className="text-chart-1"
          cx="56"
          cy="56"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="14"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-2xl font-medium leading-none">{Math.round(percent)}%</div>
          <div className="mt-1 text-xs text-muted-foreground">ready</div>
        </div>
      </div>
    </div>
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

function resolvePopupLearningStats(
  learningStats: ExtensionPopupProps["learningStats"],
  metrics: ExtensionPopupProps["metrics"]
): PopupLearningStats {
  if (learningStats) {
    return normalizeLearningStats(learningStats);
  }

  if (!metrics) {
    return DEFAULT_POPUP_LEARNING_STATS;
  }

  const comfortable = readMetricNumber(metrics, "comfortable");
  const practice = readMetricNumber(metrics, "practice");
  const total = readMetricNumber(metrics, "tracked");
  const newCount = Math.max(total - comfortable - practice, 0);

  return normalizeLearningStats({
    comfortable,
    practice,
    newCount,
    total
  });
}

function normalizeLearningStats(stats: PopupLearningStats): PopupLearningStats {
  const comfortable = clampStatCount(stats.comfortable);
  const practice = clampStatCount(stats.practice);
  const newCount = clampStatCount(stats.newCount);
  const ignored = clampStatCount(stats.ignored ?? 0);
  const observedTotal = comfortable + practice + newCount + ignored;
  const total = Math.max(clampStatCount(stats.total), observedTotal);

  return {
    comfortable,
    practice,
    newCount,
    ignored,
    total
  };
}

function readMetricNumber(
  metrics: NonNullable<ExtensionPopupProps["metrics"]>,
  labelNeedle: string
): number {
  const metric = metrics.find((item) =>
    item.label.toLowerCase().includes(labelNeedle)
  );

  if (!metric) {
    return 0;
  }

  if (typeof metric.value === "number") {
    return clampStatCount(metric.value);
  }

  return clampStatCount(Number(metric.value.replace(/[^\d.-]/g, "")));
}

function clampStatCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function formatStatCount(value: number): string {
  return clampStatCount(value).toLocaleString();
}

function PopupPanel({ children }: { children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-4xl bg-card p-4 shadow-md ring-1 ring-foreground/5">
      {children}
    </section>
  );
}

function PopupHeader() {
  return (
    <header className="flex items-center gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <ImmersionLogo className="size-7" />
        <span className="truncate font-medium">ImmersionKit</span>
      </div>
    </header>
  );
}
