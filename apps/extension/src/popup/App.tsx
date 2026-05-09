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
} from "../app-state/settings-state";

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
        errorMessage={errorMessage}
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
    </>
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
