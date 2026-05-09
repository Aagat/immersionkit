import type { ReactNode } from "react";
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
  return <div className={`ik-ui-frame ik-ui-frame--${variant}`}>{children}</div>;
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
    <div className={`ik-ui-browser${appFrame ? " ik-ui-browser--app" : ""}`}>
      <div className="ik-ui-browser-tabs">
        <div className="ik-ui-window-controls">
          <span />
          <span />
          <span />
        </div>
        <div className="ik-ui-browser-tab">
          <ImmersionLogo size="sm" />
          <span>{title}</span>
          <Icon name="close" />
        </div>
        <button type="button" className="ik-ui-tab-plus" aria-label="New tab">
          +
        </button>
      </div>
      <div className="ik-ui-browser-bar">
        <div className="ik-ui-browser-nav">{"<"} &nbsp; {">"} &nbsp; C</div>
        <div className="ik-ui-address">{url}</div>
        <Icon name="spark" />
        <div className="ik-ui-toolbar-logo is-active">
          <ImmersionLogo size="sm" />
        </div>
        <span className="ik-ui-menu-dots">...</span>
      </div>
      <div className={`ik-ui-browser-body${blurred ? " ik-ui-browser-body--blurred" : ""}`}>
        {blurred ? <BlurredPage supported={url !== "chrome://settings/privacy"} /> : null}
        {children}
      </div>
    </div>
  );
}

function BlurredPage({ supported }: { supported: boolean }) {
  if (!supported) {
    return (
      <div className="ik-ui-settings-blur">
        <h2>Settings</h2>
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
          <p key={item}>{item}</p>
        ))}
      </div>
    );
  }

  return (
    <div className="ik-ui-travel-blur">
      <h2>Kyoto in Slow Season</h2>
      <p>Enjoy temples, neighborhoods, and everyday moments when the city breathes.</p>
      <p>Kyoto is famous for its temples and gardens, but some of its best moments happen between the big sights.</p>
      <div className="ik-ui-article-photo" />
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
    <div className="ik-ui-metric">
      <Icon name={icon} />
      <div>
        <p>{value}</p>
        <span>{label}</span>
      </div>
    </div>
  );
}

export function SentenceBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="ik-ui-sentence-block">
      <p>{label}</p>
      <span>{text}</span>
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
    <footer className={`ik-ui-local-footer${compact ? " ik-ui-local-footer--compact" : ""}`}>
      <Icon name="lock" />
      <span>{text}</span>
      {action ? <button type="button" onClick={onAction}>{action}</button> : null}
    </footer>
  );
}
