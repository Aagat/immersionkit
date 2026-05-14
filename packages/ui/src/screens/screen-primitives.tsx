import type { ReactNode } from "react";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";
import {
  Icon,
  ImmersionLogo
} from "../components/primitives";
import type { IconName } from "../components/primitives";

export function ImmersionFrame({
  children,
  variant
}: {
  children: ReactNode;
  variant: "settings" | "browser" | "popup";
}) {
  return (
    <div
      className={cn(
        "ik-ui-frame w-full bg-background font-sans text-foreground tracking-normal",
        variant === "browser" && "min-h-[820px] bg-gradient-to-b from-slate-50 to-white p-3",
        variant === "settings" && "min-h-[900px] bg-gradient-to-b from-slate-50 to-white p-3",
        variant === "popup" && "min-h-0 bg-transparent p-0"
      )}
    >
      {children}
    </div>
  );
}

export function BrowserChrome({
  children,
  title,
  url,
  blurred = false,
  appFrame = false
}: {
  children: ReactNode;
  title: string;
  url: string;
  blurred?: boolean;
  appFrame?: boolean;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border bg-card text-card-foreground shadow-panel",
        appFrame ? "min-h-[860px]" : "min-h-[780px]"
      )}
    >
      <div className="flex items-center gap-2 border-b bg-muted/50 px-3 py-2">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="size-3 rounded-full bg-red-400" />
          <span className="size-3 rounded-full bg-amber-400" />
          <span className="size-3 rounded-full bg-emerald-400" />
        </div>
        <div className="flex min-w-0 max-w-sm items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm shadow-sm">
          <ImmersionLogo size="sm" />
          <span className="truncate">{title}</span>
          <Icon name="close" className="ml-auto size-3.5 text-muted-foreground" />
        </div>
        <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="New tab">
          +
        </Button>
      </div>
      <div className="flex items-center gap-3 border-b px-3 py-2 text-sm text-muted-foreground">
        <span className="font-mono">{"<  >  C"}</span>
        <div className="min-w-0 flex-1 truncate rounded-md border bg-background px-3 py-1.5">
          {url}
        </div>
        <Icon name="spark" className="text-primary" />
        <div className="grid size-8 place-items-center rounded-md border border-primary bg-primary/10">
          <ImmersionLogo size="sm" />
        </div>
        <span className="font-bold">...</span>
      </div>
      <div
        className={cn(
          "relative min-h-[690px] overflow-hidden bg-background",
          appFrame && "min-h-[790px]"
        )}
      >
        {blurred ? <BlurredPage supported={url !== "chrome://settings/privacy"} /> : null}
        {children}
      </div>
    </div>
  );
}

function BlurredPage({ supported }: { supported: boolean }) {
  if (!supported) {
    return (
      <div className="absolute inset-0 grid content-start gap-3 bg-muted/50 p-10 text-muted-foreground blur-[1px]">
        <h2 className="text-2xl font-semibold text-foreground">Settings</h2>
        {[
          "You and Google",
          "Autofill and passwords",
          "Privacy and security",
          "Performance",
          "Appearance",
          "Search engine",
          "Default browser",
          "On startup",
          "Languages",
          "Downloads",
          "Accessibility",
          "System",
          "Reset settings",
          "Extensions"
        ].map((item) => (
          <p key={item} className="rounded-md border bg-card px-4 py-3">
            {item}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className="absolute inset-0 grid content-start gap-5 bg-muted/40 p-12 blur-[1px]">
      <h2 className="max-w-xl text-4xl font-semibold tracking-normal">
        Kyoto in Slow Season
      </h2>
      <p className="max-w-xl text-lg text-muted-foreground">
        Enjoy temples, neighborhoods, and everyday moments when the city breathes.
      </p>
      <p className="max-w-2xl text-muted-foreground">
        Kyoto is famous for its temples and gardens, but some of its best moments
        happen between the big sights.
      </p>
      <div className="h-64 max-w-2xl rounded-lg border bg-[url('/design-assets/kyoto-slow-season.png')] bg-cover bg-center shadow-soft" />
    </div>
  );
}

export function MetricStat({
  label,
  value,
  icon
}: {
  label: string;
  value: string | number;
  icon: IconName;
}) {
  return (
    <div className="grid min-h-20 gap-2 rounded-lg border bg-card p-3 shadow-sm">
      <div className="grid min-w-0 gap-1 text-xs leading-tight text-muted-foreground">
        <Icon name={icon} className="size-4 text-primary" />
        <span className="min-w-0 whitespace-normal">{label}</span>
      </div>
      <p className="truncate text-2xl font-semibold leading-none">{value}</p>
    </div>
  );
}

export function SentenceBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="grid gap-1 rounded-md border bg-muted/35 p-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <span className="text-sm leading-6">{text}</span>
    </div>
  );
}

export function LocalFooter({
  text,
  action,
  compact = false,
  onAction
}: {
  text: string;
  action?: string;
  compact?: boolean;
  onAction?: () => void;
}) {
  return (
    <footer
      className={cn(
        "flex items-center gap-2 rounded-md border bg-muted/35 px-3 py-2 text-sm text-muted-foreground",
        compact && "text-xs"
      )}
    >
      <Icon name="lock" className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">{text}</span>
      {action ? (
        <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={onAction}>
          {action}
        </Button>
      ) : null}
    </footer>
  );
}
