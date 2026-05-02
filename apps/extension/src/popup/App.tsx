import { useCallback, useEffect, useState } from "react";
import { ExtensionPopup } from "@immersionkit/ui";
import {
  PROFICIENCY_SEED_OPTIONS,
  getSiteEnabledForHost,
  loadActiveTabContext,
  loadCheckpointEligibilityPreview,
  loadFirstRunIntroVisible,
  loadSettingsState,
  loadSiteSettingsMap,
  loadVocabStats,
  markFirstRunIntroSeen,
  notifySettingsRefresh,
  upsertSiteEnabledState,
  type ActiveTabContext,
  type CheckpointEligibilityPreview,
  type SettingsState,
  type SiteSettingsMap,
  type VocabStats
} from "../options/state";

const EMPTY_STATS: VocabStats = {
  total: 0,
  newCount: 0,
  learning: 0,
  known: 0,
  ignored: 0
};

const DEFAULT_TAB_CONTEXT: ActiveTabContext = {
  tabId: null,
  hostname: null,
  url: null,
  isSupportedPage: false,
  supportMessage: "Open an HTTP(S) page to manage this site."
};

const EMPTY_CHECKPOINT_PREVIEW: CheckpointEligibilityPreview = {
  activeBandId: null,
  activeBandLabel: null,
  nextBandId: null,
  nextBandLabel: null,
  checkpointRequired: false,
  checkpointIsOnlyBlocker: false,
  unmetRequirements: []
};

export function PopupApp() {
  const [activeTab, setActiveTab] = useState<ActiveTabContext>(DEFAULT_TAB_CONTEXT);
  const [settingsState, setSettingsState] = useState<SettingsState | null>(null);
  const [siteSettings, setSiteSettings] = useState<SiteSettingsMap>({});
  const [vocabStats, setVocabStats] = useState<VocabStats>(EMPTY_STATS);
  const [checkpointPreview, setCheckpointPreview] =
    useState<CheckpointEligibilityPreview>(EMPTY_CHECKPOINT_PREVIEW);
  const [showFirstRunIntro, setShowFirstRunIntro] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingSite, setIsSavingSite] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadSnapshot = useCallback(async () => {
    const tabContext = await loadActiveTabContext();
    const [
      loadedSettingsState,
      loadedSiteSettings,
      loadedVocabStats,
      loadedCheckpointPreview,
      loadedFirstRunIntroVisible
    ] = await Promise.all([
      loadSettingsState(),
      loadSiteSettingsMap(),
      loadVocabStats(),
      loadCheckpointEligibilityPreview(),
      loadFirstRunIntroVisible()
    ]);

    return {
      tabContext,
      loadedSettingsState,
      loadedSiteSettings,
      loadedVocabStats,
      loadedCheckpointPreview,
      loadedFirstRunIntroVisible
    };
  }, []);

  const refreshSnapshot = useCallback(async () => {
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const snapshot = await loadSnapshot();
      setActiveTab(snapshot.tabContext);
      setSettingsState(snapshot.loadedSettingsState);
      setSiteSettings(snapshot.loadedSiteSettings);
      setVocabStats(snapshot.loadedVocabStats);
      setCheckpointPreview(snapshot.loadedCheckpointPreview);
      setShowFirstRunIntro(snapshot.loadedFirstRunIntroVisible);
    } catch {
      setErrorMessage("Unable to load your reading controls right now.");
    } finally {
      setIsLoading(false);
    }
  }, [loadSnapshot]);

  useEffect(() => {
    void refreshSnapshot();
  }, [refreshSnapshot]);

  const handleSiteToggle = useCallback(async () => {
    if (!activeTab.hostname) {
      return;
    }

    setErrorMessage(null);
    setIsSavingSite(true);

    try {
      const nextEnabled = !getSiteEnabledForHost(siteSettings, activeTab.hostname);
      const nextSiteSettings = await upsertSiteEnabledState(
        activeTab.hostname,
        nextEnabled,
        siteSettings
      );

      setSiteSettings(nextSiteSettings);
      await notifySettingsRefresh(activeTab.tabId);
    } catch {
      setErrorMessage("Could not update this site's reading mode.");
    } finally {
      setIsSavingSite(false);
    }
  }, [activeTab.hostname, activeTab.tabId, siteSettings]);

  const handleOpenOptions = useCallback(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.openOptionsPage) {
      return;
    }

    chrome.runtime.openOptionsPage();
  }, []);

  const handleDismissFirstRunIntro = useCallback(async () => {
    setShowFirstRunIntro(false);
    await markFirstRunIntroSeen();
  }, []);

  const siteEnabled = getSiteEnabledForHost(siteSettings, activeTab.hostname);
  const proficiencyLabel =
    PROFICIENCY_SEED_OPTIONS.find((option) => option.id === settingsState?.proficiencySeed)
      ?.label ?? "Beginner";
  const translationEnabled = Boolean(settingsState?.settings.sentenceTranslationEnabled);
  const discoverySummary = describeDiscoveryRate(settingsState?.settings.discoveryRate ?? 0);
  const progressDetail = formatPopupCheckpointHint(checkpointPreview);

  return (
    <>
      <ExtensionPopup
        chromeFrame={false}
        state={activeTab.isSupportedPage && !isLoading ? "supported" : "unsupported"}
        siteState={siteEnabled ? "on" : "paused"}
        bandTitle={checkpointPreview.activeBandLabel ?? proficiencyLabel}
        bandSubtitle={`${discoverySummary}. Words + phrases.`}
        progressValue={estimateProgressValue(checkpointPreview)}
        progressLabel={progressDetail}
        progressDetail={progressDetail}
        unsupportedMessage={activeTab.supportMessage}
        firstRunIntro={showFirstRunIntro}
        isSavingSite={isSavingSite}
        metrics={[
          { label: "Comfortable", value: formatCount(vocabStats.known), icon: "check" },
          { label: "In practice", value: formatCount(vocabStats.learning), icon: "pause" },
          { label: "Tracked words", value: formatCount(vocabStats.total), icon: "spark" }
        ]}
        sentenceHelpSummary={
          translationEnabled
            ? "Stored on this device. Sentence help is enabled."
            : "Stored on this device. Sentence help is off."
        }
        onSiteToggle={() => {
          void handleSiteToggle();
        }}
        onOpenSettings={handleOpenOptions}
        onAdjustPace={handleOpenOptions}
        onDismissIntro={() => {
          void handleDismissFirstRunIntro();
        }}
      />
      {errorMessage ? (
        <section className="status-banner status-banner--error" role="status">
          <p>{errorMessage}</p>
        </section>
      ) : null}
    </>
  );
}

type MetricCardProps = {
  label: string;
  value: number | string;
};

function MetricCard({ label, value }: MetricCardProps) {
  const valueIsText = typeof value === "string";

  return (
    <div className="metric-card">
      <p className="metric-label">{label}</p>
      <p className={`metric-value${valueIsText ? " metric-value--text" : ""}`}>{value}</p>
    </div>
  );
}

function describeDiscoveryRate(rate: number): string {
  const percent = Math.round(rate * 100);

  if (percent <= 5) {
    return "Gentle pace";
  }

  if (percent <= 12) {
    return "Balanced pace";
  }

  return "Bold pace";
}

function formatCount(value: number): string {
  return value.toLocaleString();
}

function formatPopupCheckpointHint(preview: CheckpointEligibilityPreview): string {
  if (!preview.activeBandId) {
    return "Next step: loading your reading progress.";
  }

  const activeBand = preview.activeBandLabel ?? preview.activeBandId;
  const nextBand = preview.nextBandLabel ?? preview.nextBandId;

  if (preview.checkpointIsOnlyBlocker) {
    return `Next step: ${activeBand} is ready to advance in settings.`;
  }

  if (preview.unmetRequirements.length > 0) {
    const missingCount = preview.unmetRequirements.filter(
      (requirement) => requirement !== "checkpoint"
    ).length;
    return `Next step: ${activeBand}${nextBand ? ` toward ${nextBand}` : ""}, ${formatCount(missingCount)} reading signal${missingCount === 1 ? "" : "s"} left.`;
  }

  if (nextBand) {
    return `Next step: keep building ${activeBand} toward ${nextBand}.`;
  }

  return `Next step: ${activeBand} is the latest available level.`;
}

function estimateProgressValue(preview: CheckpointEligibilityPreview): number {
  if (!preview.activeBandId) {
    return 0;
  }

  const publicSignalsLeft = preview.unmetRequirements.filter(
    (requirement) => requirement !== "checkpoint"
  ).length;
  return Math.max(12, Math.min(100, 100 - publicSignalsLeft * 20));
}

function getPageStatus(input: {
  activeTab: ActiveTabContext;
  isLoading: boolean;
  siteEnabled: boolean;
}): {
  badgeClass: string;
  badgeLabel: string;
  title: string;
  description: string;
} {
  if (input.isLoading) {
    return {
      badgeClass: "status-badge status-badge--warning",
      badgeLabel: "Checking",
      title: "Getting your current page ready.",
      description: "Loading your reading controls and saved progress."
    };
  }

  if (!input.activeTab.isSupportedPage) {
    return {
      badgeClass: "status-badge status-badge--warning",
      badgeLabel: "Unavailable",
      title: "Open a regular webpage to use the site toggle.",
      description: input.activeTab.supportMessage
    };
  }

  if (input.siteEnabled) {
    return {
      badgeClass: "status-badge status-badge--on",
      badgeLabel: "Active",
      title: "A few Spanish words will appear while you read.",
      description: "Use the power button any time this site feels too busy."
    };
  }

  return {
    badgeClass: "status-badge status-badge--off",
    badgeLabel: "Paused",
    title: "This site is taking a break.",
    description: "Turn it back on whenever you want vocabulary support here again."
  };
}

function PowerIcon() {
  return (
    <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3.5V11.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M7.2 5.8C5.2 7.2 4 9.5 4 12C4 16.4 7.6 20 12 20C16.4 20 20 16.4 20 12C20 9.5 18.8 7.2 16.8 5.8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 8.75C10.2 8.75 8.75 10.2 8.75 12C8.75 13.8 10.2 15.25 12 15.25C13.8 15.25 15.25 13.8 15.25 12C15.25 10.2 13.8 8.75 12 8.75Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M4.7 13.2L3.5 12L4.7 10.8L5.1 9.2L6.8 8.8L8 7.6L9.6 8L11.1 7.3L12 5.8L12.9 7.3L14.4 8L16 7.6L17.2 8.8L18.9 9.2L19.3 10.8L20.5 12L19.3 13.2L18.9 14.8L17.2 15.2L16 16.4L14.4 16L12.9 16.7L12 18.2L11.1 16.7L9.6 16L8 16.4L6.8 15.2L5.1 14.8L4.7 13.2Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
