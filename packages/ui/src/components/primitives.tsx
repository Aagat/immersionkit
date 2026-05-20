import type { CSSProperties, ReactNode } from "react";
import {
  BookOpen,
  Check,
  ChevronRight,
  EyeOff,
  FileText,
  Info,
  Languages,
  Layers3,
  Link2,
  Lock,
  MessageCircle,
  Pause,
  Power,
  Settings,
  ShieldCheck,
  Sparkles,
  Volume2,
  X
} from "lucide-react";
import { cn } from "../lib/utils";
import { Badge as ShadcnBadge } from "./ui/badge";
import { Button as ShadcnButton } from "./ui/button";
import { Card as ShadcnCard } from "./ui/card";
import { Progress } from "./ui/progress";
import { Switch } from "./ui/switch";
import {
  Tabs as ShadcnTabs,
  TabsList,
  TabsTrigger
} from "./ui/tabs";

type Tone = "accent" | "muted" | "warning" | "danger" | "info";
type Size = "sm" | "md" | "lg";
export type TokenKind = "word" | "phrase" | "sentence";
export type TokenStatus = "new" | "learning" | "known" | "muted";

export type IconName =
  | "band"
  | "book"
  | "check"
  | "chevron"
  | "close"
  | "document"
  | "eyeOff"
  | "gear"
  | "info"
  | "link"
  | "lock"
  | "message"
  | "pause"
  | "power"
  | "shield"
  | "spark"
  | "translate"
  | "volume";

const iconMap = {
  band: Layers3,
  book: BookOpen,
  check: Check,
  chevron: ChevronRight,
  close: X,
  document: FileText,
  eyeOff: EyeOff,
  gear: Settings,
  info: Info,
  link: Link2,
  lock: Lock,
  message: MessageCircle,
  pause: Pause,
  power: Power,
  shield: ShieldCheck,
  spark: Sparkles,
  translate: Languages,
  volume: Volume2
} satisfies Record<IconName, typeof BookOpen>;

export function ImmersionLogo({ size = "md" }: { size?: Size }) {
  return (
    <span
      className={cn(
        "relative inline-grid place-items-center rounded-md bg-primary text-primary-foreground shadow-sm",
        size === "sm" && "size-5",
        size === "md" && "size-7",
        size === "lg" && "size-9"
      )}
      aria-hidden="true"
    >
      <span className="absolute left-1/2 top-1/2 h-3/5 w-0.5 -translate-x-1.5 -translate-y-1/2 rotate-12 rounded-full bg-primary-foreground/95" />
      <span className="absolute left-1/2 top-1/2 h-3/5 w-0.5 -translate-x-0.5 -translate-y-1/2 rotate-12 rounded-full bg-primary-foreground/75" />
      <span className="absolute left-1/2 top-1/2 h-3/5 w-0.5 translate-x-0.5 -translate-y-1/2 rotate-12 rounded-full bg-primary-foreground/55" />
    </span>
  );
}

export function Icon({
  name,
  className
}: {
  name: IconName;
  className?: string;
}) {
  const IconComponent = iconMap[name];

  return <IconComponent className={cn("size-4", className)} aria-hidden="true" />;
}

export function Badge({
  children,
  tone = "muted",
  icon,
  className
}: {
  children: ReactNode;
  tone?: Tone;
  icon?: IconName;
  className?: string;
}) {
  const variant = {
    accent: "default",
    muted: "secondary",
    warning: "warning",
    danger: "destructive",
    info: "info"
  }[tone] as "default" | "secondary" | "warning" | "destructive" | "info";

  return (
    <ShadcnBadge variant={variant} className={className}>
      {icon ? <Icon name={icon} /> : null}
      {children}
    </ShadcnBadge>
  );
}

export function Button({
  children,
  variant = "secondary",
  size = "md",
  icon,
  disabled = false,
  className,
  onClick
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "chip";
  size?: "sm" | "md";
  icon?: IconName;
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  const shadcnVariant = {
    primary: "default",
    secondary: "outline",
    ghost: "ghost",
    chip: "secondary"
  }[variant] as "default" | "secondary" | "ghost" | "outline";

  return (
    <ShadcnButton
      type="button"
      variant={shadcnVariant}
      size={size === "sm" ? "sm" : "default"}
      disabled={disabled}
      className={className}
      onClick={onClick}
    >
      {icon ? <Icon name={icon} /> : null}
      {children}
    </ShadcnButton>
  );
}

export function IconButton({
  label,
  icon,
  disabled = false,
  onClick,
  className
}: {
  label: string;
  icon: IconName;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <ShadcnButton
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      disabled={disabled}
      className={className}
      onClick={onClick}
    >
      <Icon name={icon} />
    </ShadcnButton>
  );
}

export function Card({
  children,
  className = ""
}: {
  children: ReactNode;
  className?: string;
}) {
  return <ShadcnCard className={cn("p-5", className)}>{children}</ShadcnCard>;
}

export function SectionHeader({
  eyebrow,
  title,
  action
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="grid gap-1">
        {eyebrow ? (
          <p className="text-xs font-bold uppercase text-primary">{eyebrow}</p>
        ) : null}
        <h2 className="text-xl font-semibold tracking-normal">{title}</h2>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function ProgressBar({
  value,
  label,
  detail,
  className
}: {
  value: number;
  label?: string;
  detail?: string;
  className?: string;
}) {
  const clampedValue = Math.max(0, Math.min(100, value));

  return (
    <div className={cn("grid gap-2", className)}>
      {label || detail ? (
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          {label ? <span className="font-medium">{label}</span> : null}
          {detail ? <span className="text-muted-foreground">{detail}</span> : null}
        </div>
      ) : null}
      <Progress value={clampedValue} />
    </div>
  );
}

export function ProgressRing({
  value,
  label
}: {
  value: number;
  label: string;
}) {
  const clampedValue = Math.max(0, Math.min(100, value));

  return (
    <div
      className="grid size-28 place-items-center rounded-full text-center shadow-sm"
      style={
        {
          background: `conic-gradient(hsl(var(--primary)) ${clampedValue}%, hsl(var(--secondary)) 0)`
        } as CSSProperties
      }
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clampedValue}
    >
      <div className="grid size-20 place-items-center rounded-full bg-card">
        <span className="text-lg font-bold">{clampedValue}%</span>
        <small className="-mt-5 text-xs text-muted-foreground">{label}</small>
      </div>
    </div>
  );
}

export function Toggle({
  checked,
  label,
  disabled = false,
  onChange
}: {
  checked: boolean;
  label: string;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <Switch
      checked={checked}
      aria-label={label}
      disabled={disabled}
      onCheckedChange={onChange}
    />
  );
}

export function MetricCard({
  label,
  value,
  icon
}: {
  label: string;
  value: string | number;
  icon?: IconName;
}) {
  return (
    <div className="flex min-h-20 items-center gap-3 rounded-lg border bg-card p-4 shadow-sm">
      {icon ? <Icon name={icon} className="size-5 text-primary" /> : null}
      <div>
        <p className="text-xl font-semibold leading-none">{value}</p>
        <span className="text-xs font-medium uppercase text-muted-foreground">
          {label}
        </span>
      </div>
    </div>
  );
}

export function Tabs({
  tabs,
  active
}: {
  tabs: string[];
  active: string;
}) {
  return (
    <ShadcnTabs value={active}>
      <TabsList>
        {tabs.map((tab) => (
          <TabsTrigger key={tab} value={tab}>
            {tab}
          </TabsTrigger>
        ))}
      </TabsList>
    </ShadcnTabs>
  );
}

export function BrowserShell({
  children,
  url = "reading.example/article",
  activeExtension = true
}: {
  children: ReactNode;
  url?: string;
  activeExtension?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-panel">
      <div className="flex items-center gap-3 border-b bg-muted/50 px-4 py-3">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="size-3 rounded-full bg-red-400" />
          <span className="size-3 rounded-full bg-amber-400" />
          <span className="size-3 rounded-full bg-emerald-400" />
        </div>
        <div className="min-w-0 flex-1 truncate rounded-md border bg-background px-3 py-1.5 text-sm text-muted-foreground">
          {url}
        </div>
        <div
          className={cn(
            "grid size-8 place-items-center rounded-md border bg-background",
            activeExtension && "border-primary text-primary"
          )}
        >
          <ImmersionLogo size="sm" />
        </div>
      </div>
      <div className="relative min-h-[560px] bg-background">{children}</div>
    </div>
  );
}

export function PopupShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid w-[380px] max-w-full gap-4 rounded-xl border bg-card p-5 text-card-foreground shadow-panel">
      {children}
    </div>
  );
}

export function Popover({
  children,
  className = ""
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative grid gap-3 rounded-lg border bg-popover p-4 text-popover-foreground shadow-panel",
        className
      )}
    >
      <span className="absolute -top-2 left-8 size-4 rotate-45 border-l border-t bg-popover" />
      {children}
    </div>
  );
}

export function WordMark({
  children,
  kind = "word",
  status = "learning",
  label,
  onClick
}: {
  children: ReactNode;
  kind?: TokenKind;
  status?: TokenStatus;
  label?: string;
  onClick?: () => void;
}) {
  const className = cn(
    "inline rounded px-1 py-0.5 font-semibold underline decoration-2 underline-offset-2 transition-colors",
    kind === "word" && "bg-cyan-50 text-cyan-900 decoration-cyan-500",
    kind === "phrase" && "bg-blue-50 text-blue-900 decoration-blue-500",
    kind === "sentence" && "bg-violet-50 text-violet-900 decoration-violet-500",
    status === "new" && "bg-amber-50 text-amber-900 decoration-amber-500",
    status === "known" && "bg-emerald-50 text-emerald-900 decoration-emerald-500",
    status === "muted" && "bg-muted text-muted-foreground decoration-muted-foreground",
    onClick && "cursor-pointer"
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        aria-label={label}
        data-kind={kind}
        data-status={status}
        onClick={onClick}
      >
        {children}
      </button>
    );
  }

  return (
    <span className={className} aria-label={label} data-kind={kind} data-status={status}>
      {children}
    </span>
  );
}
