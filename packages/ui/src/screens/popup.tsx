import { useState } from "react";
import type { ReactNode } from "react";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
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
import {
  ChartContainer,
  type ChartConfig
} from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";
import {
  BrowserChrome,
  IkIcon,
  ImmersionFrame,
  LocalFooter
} from "./screen-primitives";
import type {
  ExtensionPopupProps,
  PopupAssetPackStatus,
  PopupLearningDayStats,
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

const DEFAULT_POPUP_LEARNING_DAYS: readonly PopupLearningDayStats[] = [
  { label: "Mon", comfortable: 4, practice: 3, newCount: 2, ignored: 0, total: 9 },
  { label: "Tue", comfortable: 3, practice: 4, newCount: 1, ignored: 0, total: 8 },
  { label: "Wed", comfortable: 6, practice: 5, newCount: 2, ignored: 1, total: 14 },
  { label: "Thu", comfortable: 5, practice: 6, newCount: 1, ignored: 0, total: 12 },
  { label: "Fri", comfortable: 7, practice: 5, newCount: 2, ignored: 0, total: 14 },
  { label: "Sat", comfortable: 3, practice: 4, newCount: 2, ignored: 0, total: 9 },
  { label: "Sun", comfortable: 5, practice: 3, newCount: 1, ignored: 0, total: 9 }
];

const weeklyWordsChartConfig = {
  comfortable: {
    label: "Comfortable",
    color: "var(--chart-1)"
  },
  practice: {
    label: "Practicing",
    color: "var(--chart-2)"
  },
  newCount: {
    label: "New",
    color: "var(--chart-3)"
  },
  ignored: {
    label: "Muted",
    color: "var(--chart-5)"
  }
} satisfies ChartConfig;

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
  progressDetail = "A few more reading evidence items will widen your range.",
  metrics,
  learningStats,
  learningDays,
  account = { status: "signed-in", email: "", previewStatus: "Active" },
  unsupportedMessage = "Open a normal HTTP(S) article, blog, or docs page to use reading mode.",
  firstRunIntro = false,
  errorMessage = null,
  isSavingSite = false,
  assetPackStatus = { state: "idle" },
  debugAvailable = false,
  onSiteToggle,
  onOpenSettings,
  onOpenDebug,
  onReportIssue,
  onDismissIntro,
  onPreviewSignIn
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
          ? "absolute inset-x-3 top-3 sm:inset-x-auto sm:right-6 sm:top-6 sm:w-[360px]"
          : "w-[360px] min-w-[360px] overflow-x-hidden"
      }
    >
      {supported ? (
        <PopupPanel>
          <PopupHeader
            onOpenSettings={onOpenSettings}
            debugAvailable={debugAvailable}
            onOpenDebug={onOpenDebug}
            onReportIssue={onReportIssue}
          />
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
          {account.status === "signed-out" ? (
            <SignedOutPopup
              onPreviewSignIn={onPreviewSignIn}
              onOpenSettings={onOpenSettings}
            />
          ) : (
            <SupportedPopup
              bandTitle={bandTitle}
              bandSubtitle={bandSubtitle}
              progress={progress}
              progressDetail={progressDetail}
              enabled={enabled}
              metrics={metrics}
              learningStats={learningStats}
              learningDays={learningDays}
              isSavingSite={isSavingSite}
              assetPackStatus={assetPackStatus}
              onSiteToggle={() => {
                if (onSiteToggle) {
                  onSiteToggle();
                  return;
                }
                setLocalSiteState((value) => (value === "on" ? "paused" : "on"));
              }}
            />
          )}
        </PopupPanel>
      ) : (
        <UnsupportedPopup
          unsupportedMessage={unsupportedMessage}
          onOpenSettings={onOpenSettings}
        />
      )}
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

function SignedOutPopup({
  onPreviewSignIn,
  onOpenSettings
}: {
  onPreviewSignIn?: () => void;
  onOpenSettings?: () => void;
}) {
  return (
    <>
      <Card>
        <CardHeader>
          <Badge variant="secondary" className="w-fit">
            Preview account required
          </Badge>
          <CardTitle>Sign in for preview</CardTitle>
          <CardDescription>
            ImmersionKit requires preview sign-in before reading mode turns on.
            Your learning progress and reading history stay local on this device.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button onClick={onPreviewSignIn}>
            <IkIcon name="link" dataIcon="inline-start" />
            Sign in for preview with Google
          </Button>
          <Button variant="outline" onClick={onOpenSettings}>
            Open settings
          </Button>
        </CardContent>
      </Card>
      <LocalFooter text="Preview sign-in is for access and support; it does not sync learning progress." />
    </>
  );
}

function SupportedPopup({
  bandTitle,
  bandSubtitle,
  progress,
  progressDetail,
  metrics,
  learningStats,
  learningDays,
  enabled,
  isSavingSite,
  assetPackStatus,
  onSiteToggle
}: {
  bandTitle: string;
  bandSubtitle: string;
  progress: number;
  progressDetail: string;
  metrics: ExtensionPopupProps["metrics"];
  learningStats: ExtensionPopupProps["learningStats"];
  learningDays: ExtensionPopupProps["learningDays"];
  enabled: boolean;
  isSavingSite: boolean;
  assetPackStatus: PopupAssetPackStatus;
  onSiteToggle: () => void;
}) {
  const stats = resolvePopupLearningStats(learningStats, metrics);
  const days = resolvePopupLearningDays(learningDays);

  return (
    <>
      <AssetPackStatusRow status={assetPackStatus} />
      <LearningReportCard
        bandTitle={bandTitle}
        bandSubtitle={bandSubtitle}
        progress={progress}
        progressDetail={progressDetail}
        stats={stats}
        days={days}
      />
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
    </>
  );
}

function AssetPackStatusRow({ status }: { status: PopupAssetPackStatus }) {
  if (status.state === "idle" || status.state === "ready") {
    return null;
  }

  const loading = status.state === "loading";
  const label = loading
    ? "Getting reading assets..."
    : "Reading assets unavailable";

  return (
    <div
      aria-live="polite"
      className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground"
      data-ik-asset-pack-status={status.state}
    >
      <IkIcon
        name={loading ? "spinner" : "info"}
        className={loading ? "animate-spin" : undefined}
      />
      <span className="min-w-0 truncate">{label}</span>
    </div>
  );
}

function LearningReportCard({
  bandTitle,
  bandSubtitle,
  progress,
  progressDetail,
  stats,
  days
}: {
  bandTitle: string;
  bandSubtitle: string;
  progress: number;
  progressDetail: string;
  stats: PopupLearningStats;
  days: readonly PopupLearningDayStats[];
}) {
  const today = normalizeLearningDay(days[days.length - 1] ?? {
    label: "Today",
    comfortable: 0,
    practice: 0,
    newCount: 0,
    ignored: 0,
    total: 0
  });
  const total = Math.max(stats.total, 0);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex min-w-0 items-center gap-4">
          <h2 className="shrink-0 text-xl font-semibold">Reading report</h2>
          <Badge
            variant="outline"
            className="shrink-0 rounded-xl px-3 py-1 text-sm font-normal"
          >
            {formatStatCount(total)} tracked
          </Badge>
        </div>
        <p className="truncate text-sm text-muted-foreground">
          {bandTitle} · {bandSubtitle}
        </p>
      </div>
      <WeeklyWordBars days={days} />
      <TodayStats stats={today} />
      <BandProgress value={progress} detail={progressDetail} />
    </section>
  );
}

function WeeklyWordBars({ days }: { days: readonly PopupLearningDayStats[] }) {
  const chartData = days.map(normalizeLearningDay);
  const maxTotal = Math.max(1, ...chartData.map((day) => day.total));

  return (
    <ChartContainer
      config={weeklyWordsChartConfig}
      className="h-40 w-full"
      initialDimension={{ width: 328, height: 160 }}
    >
      <BarChart
        accessibilityLayer
        data={chartData}
        margin={{ left: 0, right: 0, top: 6, bottom: 0 }}
        barSize={18}
      >
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          interval={0}
        />
        <YAxis hide domain={[0, maxTotal]} />
        <Bar
          dataKey="comfortable"
          stackId="words"
          fill="var(--color-comfortable)"
          radius={[0, 0, 5, 5]}
          isAnimationActive={false}
        />
        <Bar
          dataKey="practice"
          stackId="words"
          fill="var(--color-practice)"
          radius={0}
          isAnimationActive={false}
        />
        <Bar
          dataKey="newCount"
          stackId="words"
          fill="var(--color-newCount)"
          radius={0}
          isAnimationActive={false}
        />
        <Bar
          dataKey="ignored"
          stackId="words"
          fill="var(--color-ignored)"
          radius={[2, 2, 0, 0]}
          isAnimationActive={false}
        />
      </BarChart>
    </ChartContainer>
  );
}

function TodayStats({ stats }: { stats: PopupLearningDayStats }) {
  return (
    <div className="flex flex-col gap-3" aria-label="Today's words">
      <span className="text-sm text-muted-foreground">Today</span>
      <div className="grid grid-cols-4 text-center">
        {[
          { label: "Comfort", value: stats.comfortable, className: "text-chart-1" },
          { label: "Practice", value: stats.practice, className: "text-chart-2" },
          { label: "New", value: stats.newCount, className: "text-chart-3" },
          { label: "Muted", value: stats.ignored ?? 0, className: "text-chart-5" }
        ].map((item) => (
          <div
            key={item.label}
            className="min-w-0 border-l border-border first:border-l-0"
          >
            <div className={`truncate text-2xl font-medium leading-none ${item.className}`}>
              {formatStatCount(item.value)}
            </div>
            <div className="mt-1.5 truncate text-xs text-foreground">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BandProgress({ value, detail }: { value: number; detail: string }) {
  const percent = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">Band progress</span>
        <span>{Math.round(percent)}%</span>
      </div>
      <Progress
        value={percent}
        className="h-2 bg-muted [&_[data-slot=progress-indicator]]:bg-chart-1"
      />
      <p className="text-xs leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  );
}

function UnsupportedPopup({
  unsupportedMessage,
  onOpenSettings
}: {
  unsupportedMessage: string;
  onOpenSettings?: () => void;
}) {
  return (
    <section className="flex flex-col gap-4 bg-background p-4">
      <PopupBrand />
      <Card>
        <CardHeader>
          <Badge variant="secondary" className="w-fit">
            Unavailable here
          </Badge>
          <CardTitle>This page is not supported</CardTitle>
          <CardDescription>{unsupportedMessage}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Controls unavailable</p>
        </CardContent>
      </Card>
      <Button variant="outline" onClick={onOpenSettings}>
        Open settings
      </Button>
    </section>
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

function resolvePopupLearningDays(
  learningDays: ExtensionPopupProps["learningDays"]
): readonly PopupLearningDayStats[] {
  if (learningDays && learningDays.length > 0) {
    return learningDays.slice(-7).map(normalizeLearningDay);
  }

  return DEFAULT_POPUP_LEARNING_DAYS;
}

function normalizeLearningDay(day: PopupLearningDayStats): PopupLearningDayStats {
  const normalized = normalizeLearningStats(day);
  return {
    ...normalized,
    date: day.date,
    label: day.label
  };
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
    <section className="flex flex-col gap-4 overflow-x-hidden rounded-2xl bg-card p-4 shadow-xl ring-1 ring-foreground/10">
      {children}
    </section>
  );
}

function PopupBrand() {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-sm"
        aria-hidden="true"
      >
        IK
      </span>
      <span className="truncate text-base font-medium">ImmersionKit</span>
    </div>
  );
}

function PopupHeader({
  onOpenSettings,
  debugAvailable,
  onOpenDebug,
  onReportIssue
}: {
  onOpenSettings?: () => void;
  debugAvailable?: boolean;
  onOpenDebug?: () => void;
  onReportIssue?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <PopupBrand />
      <div className="flex shrink-0 items-center gap-2">
        {debugAvailable ? (
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            className="size-10 rounded-lg border-border bg-background shadow-sm [&_svg:not([class*='size-'])]:size-5"
            aria-label="Open debug inspector"
            title="Open debug inspector"
            onClick={onOpenDebug}
          >
            <IkIcon name="terminal" />
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          className="size-10 rounded-lg border-border bg-background shadow-sm [&_svg:not([class*='size-'])]:size-5"
          aria-label="Report issue"
          onClick={onReportIssue}
        >
          <IkIcon name="message" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          className="size-10 rounded-lg border-border bg-background shadow-sm [&_svg:not([class*='size-'])]:size-5"
          aria-label="Open settings"
          onClick={onOpenSettings}
        >
          <IkIcon name="gear" />
        </Button>
      </div>
    </div>
  );
}
