import { useState } from "react";
import type { ReactNode } from "react";
import {
  Badge,
  Button,
  Card,
  Icon,
  ImmersionLogo,
  ProgressBar
} from "../components/primitives";
import {
  BrowserChrome,
  ImmersionFrame,
  LocalFooter,
  MetricStat
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
  const popupContent = (
    <div className={chromeFrame ? "ik-ui-popup-anchor" : undefined}>
      <PopupPanel>
        <PopupHeader onOpenSettings={onOpenSettings} />
        {errorMessage ? (
          <div className="ik-ui-warning-banner" role="status">
            <Icon name="info" />
            {errorMessage}
          </div>
        ) : null}
        {firstRunIntro ? (
          <Card className="ik-ui-note-card ik-ui-note-card--blue">
            <Icon name="shield" />
            <div>
              <h3>Read normally with small doses of Spanish.</h3>
              <p>
                Words and phrases appear gently on supported pages. Progress
                and reading history stay on this device. Pause any site, adjust
                your starting point or pace in settings, and turn sentence help
                on only when you want it.
              </p>
              <button type="button" className="ik-ui-popover-link" onClick={onDismissIntro}>
                Got it
              </button>
            </div>
          </Card>
        ) : null}
        {supported ? (
          <>
            <div className="ik-ui-band-hero">
              <div className="ik-ui-band-icon">
                <Icon name="book" />
              </div>
              <div>
                <h2>{bandTitle}</h2>
                <p>{bandSubtitle}</p>
              </div>
            </div>
            <ProgressBar
              value={progressValue}
              label={progressLabel}
              detail={progressDetail}
            />
            <div className="ik-ui-popup-rule" />
            <Card className={`ik-ui-site-card${enabled ? "" : " is-paused"}`}>
              <div>
                <Badge tone={enabled ? "accent" : "muted"}>
                  {enabled ? "On for this site" : "Paused for this site"}
                </Badge>
                <h1>
                  {enabled
                    ? "A few Spanish words will appear while you read."
                    : "Spanish words are paused on this site."}
                </h1>
              </div>
              <button
                type="button"
                className={`ik-ui-power-button${enabled ? " is-on" : ""}`}
                aria-label={enabled ? "Pause reading mode" : "Resume reading mode"}
                aria-pressed={enabled}
                disabled={isSavingSite}
                onClick={() => {
                  if (onSiteToggle) {
                    onSiteToggle();
                    return;
                  }
                  setLocalSiteState((value) => (value === "on" ? "paused" : "on"));
                }}
              >
                <Icon name="power" />
              </button>
            </Card>
            <div className="ik-ui-metric-grid ik-ui-metric-grid--three">
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
              onClick={enabled ? undefined : onSiteToggle}
            >
              {enabled ? "Keep reading" : "Resume reading"}
            </Button>
            <button
              type="button"
              className="ik-ui-standalone-link"
              onClick={onAdjustPace ?? onOpenSettings}
            >
              Adjust pace
            </button>
          </>
        ) : (
          <>
            <div className="ik-ui-unsupported-block">
              <Badge tone="muted">Unavailable here</Badge>
              <h1>This page is not supported</h1>
              <p>{unsupportedMessage}</p>
              <button
                type="button"
                className="ik-ui-power-button ik-ui-power-button--disabled"
                aria-label="Controls unavailable"
                disabled
              >
                <Icon name="power" />
              </button>
              <span>Controls unavailable</span>
            </div>
            <Card className="ik-ui-note-card">
              <Icon name="shield" />
              <p>We skip private, browser, form-heavy, and sensitive pages. Reading mode works on normal articles, blogs, and docs.</p>
            </Card>
            <Card className="ik-ui-progress-card">
              <div className="ik-ui-card-row">
                <h3>{bandTitle}</h3>
                <span>{progressLabel}</span>
              </div>
              <ProgressBar
                value={progressValue}
                detail="Your progress is saved and will be ready when you return to a supported page."
              />
            </Card>
            <LocalFooter text="Your reading data stays on this device." />
            <Button variant="secondary" onClick={onOpenSettings}>Open settings</Button>
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
  return <section className="ik-ui-popup">{children}</section>;
}

function PopupHeader({ onOpenSettings }: { onOpenSettings?: () => void }) {
  return (
    <header className="ik-ui-popup-header">
      <div className="ik-ui-brand">
        <ImmersionLogo />
        <span>ImmersionKit</span>
      </div>
      <button
        type="button"
        className="ik-ui-icon-button"
        aria-label="Open settings"
        onClick={onOpenSettings}
      >
        <Icon name="gear" />
      </button>
    </header>
  );
}
