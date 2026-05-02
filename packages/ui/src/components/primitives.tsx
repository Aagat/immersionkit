import type { CSSProperties, ReactNode } from "react";

type Tone = "accent" | "muted" | "warning" | "danger" | "info";
type Size = "sm" | "md" | "lg";

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

export function ImmersionLogo({ size = "md" }: { size?: Size }) {
  return (
    <span className={`ik-ui-logo ik-ui-logo--${size}`} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className={`ik-ui-icon ik-ui-icon--${name}`}
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {renderIcon(name)}
    </svg>
  );
}

function renderIcon(name: IconName): ReactNode {
  switch (name) {
    case "band":
      return (
        <>
          <path d="m12 3 8 4-8 4-8-4 8-4Z" />
          <path d="m4 12 8 4 8-4" />
          <path d="m4 17 8 4 8-4" />
        </>
      );
    case "book":
      return (
        <>
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H7a3 3 0 0 0-3 3V5.5Z" />
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M9 7h6" />
        </>
      );
    case "check":
      return <path d="m5 12 4 4L19 6" />;
    case "chevron":
      return <path d="m9 18 6-6-6-6" />;
    case "close":
      return (
        <>
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </>
      );
    case "document":
      return (
        <>
          <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z" />
          <path d="M14 2v5h5" />
          <path d="M9 13h6" />
          <path d="M9 17h4" />
        </>
      );
    case "eyeOff":
      return (
        <>
          <path d="m2 2 20 20" />
          <path d="M10.58 10.58A2 2 0 0 0 12 14a2 2 0 0 0 1.42-.58" />
          <path d="M9.88 5.09A10.8 10.8 0 0 1 12 5c5 0 8 4 9 7a11.5 11.5 0 0 1-2.12 3.19" />
          <path d="M6.61 6.61C3.98 8.08 2.55 10.42 2 12c1 3 4 7 10 7a10.6 10.6 0 0 0 4.39-.91" />
        </>
      );
    case "gear":
      return (
        <>
          <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.05.05a2 2 0 0 1-2.83 2.83l-.05-.05A1.7 1.7 0 0 0 15 19.37a1.7 1.7 0 0 0-1 .57V20a2 2 0 0 1-4 0v-.07a1.7 1.7 0 0 0-1-.57 1.7 1.7 0 0 0-1.88.34l-.05.05a2 2 0 1 1-2.83-2.83l.05-.05A1.7 1.7 0 0 0 4.63 15a1.7 1.7 0 0 0-.57-1H4a2 2 0 0 1 0-4h.07a1.7 1.7 0 0 0 .57-1 1.7 1.7 0 0 0-.34-1.88l-.05-.05a2 2 0 1 1 2.83-2.83l.05.05A1.7 1.7 0 0 0 9 4.63a1.7 1.7 0 0 0 1-.57V4a2 2 0 0 1 4 0v.07a1.7 1.7 0 0 0 1 .57 1.7 1.7 0 0 0 1.88-.34l.05-.05a2 2 0 1 1 2.83 2.83l-.05.05A1.7 1.7 0 0 0 19.37 9c.12.36.32.7.57 1H20a2 2 0 0 1 0 4h-.07c-.25.3-.45.64-.57 1Z" />
        </>
      );
    case "info":
      return (
        <>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </>
      );
    case "link":
      return (
        <>
          <path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L11 4.93" />
          <path d="M14 11a5 5 0 0 0-7.07 0L4.8 13.12a5 5 0 0 0 7.07 7.07L13 19.07" />
        </>
      );
    case "lock":
      return (
        <>
          <rect x="4" y="10" width="16" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </>
      );
    case "message":
      return (
        <>
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />
        </>
      );
    case "pause":
      return (
        <>
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </>
      );
    case "power":
      return (
        <>
          <path d="M12 2v10" />
          <path d="M18.36 6.64a9 9 0 1 1-12.72 0" />
        </>
      );
    case "shield":
      return (
        <>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
          <path d="m9 12 2 2 4-5" />
        </>
      );
    case "spark":
      return (
        <>
          <path d="M12 2v5" />
          <path d="M12 17v5" />
          <path d="M4.93 4.93 8.46 8.46" />
          <path d="m15.54 15.54 3.53 3.53" />
          <path d="M2 12h5" />
          <path d="M17 12h5" />
          <path d="m4.93 19.07 3.53-3.53" />
          <path d="m15.54 8.46 3.53-3.53" />
        </>
      );
    case "translate":
      return (
        <>
          <path d="m5 8 6 6" />
          <path d="m4 14 6-6 2-3" />
          <path d="M2 5h12" />
          <path d="M7 2h1" />
          <path d="m22 22-5-10-5 10" />
          <path d="M14 18h6" />
        </>
      );
    case "volume":
      return (
        <>
          <path d="M11 5 6 9H3v6h3l5 4V5Z" />
          <path d="M16 9.5a4 4 0 0 1 0 5" />
          <path d="M19 7a8 8 0 0 1 0 10" />
        </>
      );
  }
}

export function Badge({
  children,
  tone = "muted",
  icon
}: {
  children: ReactNode;
  tone?: Tone;
  icon?: IconName;
}) {
  return (
    <span className={`ik-ui-badge ik-ui-badge--${tone}`}>
      {icon ? <Icon name={icon} /> : null}
      {children}
    </span>
  );
}

export function Button({
  children,
  variant = "secondary",
  size = "md",
  icon,
  disabled = false,
  onClick
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "chip";
  size?: "sm" | "md";
  icon?: IconName;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`ik-ui-button ik-ui-button--${variant} ik-ui-button--${size}`}
      disabled={disabled}
      onClick={onClick}
    >
      {icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  icon,
  disabled = false
}: {
  label: string;
  icon: IconName;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="ik-ui-icon-button"
      aria-label={label}
      disabled={disabled}
    >
      <Icon name={icon} />
    </button>
  );
}

export function Card({
  children,
  className = ""
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`ik-ui-card ${className}`}>{children}</section>;
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
    <div className="ik-ui-section-header">
      <div>
        {eyebrow ? <p className="ik-ui-eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
      </div>
      {action ? <div className="ik-ui-section-action">{action}</div> : null}
    </div>
  );
}

export function ProgressBar({
  value,
  label,
  detail
}: {
  value: number;
  label?: string;
  detail?: string;
}) {
  const clampedValue = Math.max(0, Math.min(100, value));

  return (
    <div className="ik-ui-progress">
      {label || detail ? (
        <div className="ik-ui-progress-copy">
          {label ? <span>{label}</span> : null}
          {detail ? <span>{detail}</span> : null}
        </div>
      ) : null}
      <div
        className="ik-ui-progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clampedValue}
      >
        <span style={{ width: `${clampedValue}%` }} />
      </div>
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
      className="ik-ui-progress-ring"
      style={
        {
          "--ik-ui-ring-value": `${clampedValue}%`
        } as CSSProperties & Record<"--ik-ui-ring-value", string>
      }
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clampedValue}
    >
      <span>{clampedValue}%</span>
      <small>{label}</small>
    </div>
  );
}

export function Toggle({
  checked,
  label,
  disabled = false
}: {
  checked: boolean;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`ik-ui-toggle${checked ? " is-on" : ""}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
    >
      <span />
    </button>
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
    <div className="ik-ui-metric">
      {icon ? <Icon name={icon} /> : null}
      <div>
        <p>{value}</p>
        <span>{label}</span>
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
    <nav className="ik-ui-tabs" aria-label="Settings sections">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          className={tab === active ? "is-active" : ""}
          aria-pressed={tab === active}
        >
          {tab}
        </button>
      ))}
    </nav>
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
    <div className="ik-ui-browser">
      <div className="ik-ui-browser-bar">
        <div className="ik-ui-window-controls">
          <span />
          <span />
          <span />
        </div>
        <div className="ik-ui-address">{url}</div>
        <div className={`ik-ui-toolbar-logo${activeExtension ? " is-active" : ""}`}>
          <ImmersionLogo size="sm" />
        </div>
      </div>
      <div className="ik-ui-browser-body">{children}</div>
    </div>
  );
}

export function PopupShell({ children }: { children: ReactNode }) {
  return <div className="ik-ui-popup">{children}</div>;
}

export function Popover({
  children,
  className = ""
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`ik-ui-popover ${className}`}>
      <span className="ik-ui-popover-arrow" />
      {children}
    </div>
  );
}

export function WordMark({
  children,
  kind = "word"
}: {
  children: ReactNode;
  kind?: "word" | "phrase" | "sentence";
}) {
  return <span className={`ik-ui-mark ik-ui-mark--${kind}`}>{children}</span>;
}
