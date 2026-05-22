import type { ComponentType, ReactNode } from "react";
import {
  BookOpenIcon,
  CaretRightIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  EyeSlashIcon,
  FileTextIcon,
  GearIcon,
  InfoIcon,
  LinkIcon,
  LockIcon,
  PauseIcon,
  PowerIcon,
  ShieldCheckIcon,
  SparkleIcon,
  SpeakerHighIcon,
  TerminalWindowIcon,
  TranslateIcon,
  XIcon
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MetricIconName } from "./types";

type PhosphorIcon = ComponentType<{
  className?: string;
  "data-icon"?: "inline-start" | "inline-end";
  "aria-hidden"?: boolean;
  weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
}>;

const iconMap = {
  band: SparkleIcon,
  book: BookOpenIcon,
  check: CheckCircleIcon,
  chevron: CaretRightIcon,
  close: XIcon,
  document: FileTextIcon,
  eyeOff: EyeSlashIcon,
  gear: GearIcon,
  info: InfoIcon,
  link: LinkIcon,
  lock: LockIcon,
  message: FileTextIcon,
  pause: PauseIcon,
  power: PowerIcon,
  shield: ShieldCheckIcon,
  spark: SparkleIcon,
  spinner: CircleNotchIcon,
  terminal: TerminalWindowIcon,
  translate: TranslateIcon,
  volume: SpeakerHighIcon
} satisfies Record<MetricIconName, PhosphorIcon>;

export function IkIcon({
  name,
  className,
  dataIcon,
  weight
}: {
  name: MetricIconName;
  className?: string;
  dataIcon?: "inline-start" | "inline-end";
  weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
}) {
  const Icon = iconMap[name];
  return (
    <Icon
      aria-hidden="true"
      className={className}
      data-icon={dataIcon}
      weight={weight}
    />
  );
}

export function ImmersionLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid size-8 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm",
        className
      )}
      aria-hidden="true"
    >
      <SparkleIcon weight="fill" />
    </span>
  );
}

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
        "min-h-svh bg-muted text-foreground",
        variant === "popup" && "mx-auto min-h-0 h-auto w-[360px] min-w-[360px] overflow-x-hidden bg-transparent",
        variant === "browser" && "p-4 sm:p-6",
        variant === "settings" && "min-h-svh"
      )}
      data-ik-frame={variant}
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
        "mx-auto overflow-hidden rounded-4xl bg-background text-foreground shadow-md ring-1 ring-foreground/5",
        appFrame ? "min-h-[720px] max-w-6xl" : "max-w-6xl"
      )}
    >
      <div className="flex h-11 items-center gap-2 border-b bg-muted/60 px-3">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="size-3 rounded-full bg-muted-foreground/30" />
          <span className="size-3 rounded-full bg-muted-foreground/25" />
          <span className="size-3 rounded-full bg-muted-foreground/20" />
        </div>
        <div className="flex min-w-0 max-w-80 items-center gap-2 rounded-t-2xl bg-background px-3 py-2 text-sm shadow-sm ring-1 ring-foreground/5">
          <ImmersionLogo className="size-5 rounded-xl" />
          <span className="min-w-0 truncate">{title}</span>
          <XIcon aria-hidden="true" className="shrink-0" />
        </div>
      </div>
      <div className="flex h-12 items-center gap-2 border-b px-3">
        <Button variant="ghost" size="icon-sm" aria-label="Back">
          <CaretRightIcon className="rotate-180" />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Forward">
          <CaretRightIcon />
        </Button>
        <div className="min-w-0 flex-1 rounded-3xl bg-muted px-3 py-2 text-sm text-muted-foreground">
          <span className="block truncate">{url}</span>
        </div>
        <ImmersionLogo className="size-7" />
      </div>
      <div
        className={cn(
          "relative",
          appFrame
            ? "min-h-[720px]"
            : blurred
              ? "min-h-[950px] sm:min-h-[860px]"
              : "min-h-[640px]",
          (blurred || appFrame) && "overflow-hidden",
          appFrame && "transform-gpu"
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
      <div className="absolute inset-0 grid grid-cols-[220px_1fr] gap-8 bg-muted/50 p-8 text-muted-foreground blur-[1px]">
        <div className="flex flex-col gap-3">
          {[
            "You and Google",
            "Autofill and passwords",
            "Privacy and security",
            "Performance",
            "Appearance",
            "Languages",
            "Extensions"
          ].map((item) => (
            <span key={item} className="rounded-2xl bg-background px-3 py-2 shadow-sm ring-1 ring-foreground/5">
              {item}
            </span>
          ))}
        </div>
        <div className="flex flex-col gap-4">
          <span className="h-9 w-56 rounded-2xl bg-background shadow-sm ring-1 ring-foreground/5" />
          <span className="h-28 rounded-3xl bg-background shadow-sm ring-1 ring-foreground/5" />
          <span className="h-28 rounded-3xl bg-background shadow-sm ring-1 ring-foreground/5" />
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 bg-background p-10 blur-[1px]">
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        <span className="h-5 w-24 rounded bg-muted" />
        <span className="h-12 w-2/3 rounded bg-muted" />
        <span className="h-5 w-1/2 rounded bg-muted" />
        <span className="h-48 rounded-4xl bg-muted" />
        <span className="h-24 rounded bg-muted" />
      </div>
    </div>
  );
}

export function SentenceBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-3xl bg-muted/50 p-4">
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <span className="text-sm leading-relaxed">{text}</span>
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
        "flex items-center gap-2 rounded-3xl bg-muted/50 px-4 py-2.5 text-sm text-muted-foreground",
        compact && "text-xs"
      )}
    >
      <LockIcon aria-hidden="true" />
      <span className="min-w-0 flex-1">{text}</span>
      {action ? (
        <Button variant="link" size="sm" className="h-auto px-1" onClick={onAction}>
          {action}
        </Button>
      ) : null}
    </footer>
  );
}

export function InlineMark({
  children,
  kind = "word",
  status = "learning"
}: {
  children: ReactNode;
  kind?: "word" | "phrase" | "sentence";
  status?: "new" | "learning" | "known" | "muted";
}) {
  return (
    <span
      className={cn(
        `ik-ui-mark ik-ui-mark--${kind}`,
        kind === "sentence" && "ik-sentence-note"
      )}
      data-kind={kind}
      data-ik-unit-kind={kind === "sentence" ? undefined : kind}
      data-ik-sentence-note={kind === "sentence" ? "true" : undefined}
      data-ik-source-visible={kind === "sentence" ? "false" : undefined}
      data-ik-token-id={kind === "sentence" ? undefined : "preview-inline-mark"}
      data-status={status}
      role="button"
      tabIndex={0}
    >
      {children}
    </span>
  );
}
