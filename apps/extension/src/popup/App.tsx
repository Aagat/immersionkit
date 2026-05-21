import { useCallback, useEffect, useState } from "react";
import { ExtensionPopup } from "@immersionkit/ui";
import {
  RuntimeMessageType,
  type PreviewAccountState as RuntimePreviewAccountState
} from "@immersionkit/shared";
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
import { sendRuntimeMessage } from "../runtime-client";
import { POPUP_OVERLAY_RESIZE_MESSAGE_TYPE } from "../shared/popup-overlay";
import { ACCOUNT_REQUIRED, DIAGNOSTICS_ENABLED } from "../build-profile";
import {
  DEBUG_OVERLAY_TOGGLE_MESSAGE_TYPE,
  type DebugOverlayToggleResponse
} from "../shared/debug-overlay";

const EMPTY_STATS: VocabStats = {
  total: 0,
  newCount: 0,
  learning: 0,
  known: 0,
  ignored: 0,
  daily: []
};

const DEFAULT_TAB_CONTEXT: ActiveTabContext = {
  tabId: null,
  hostname: null,
  url: null,
  isSupportedPage: false,
  supportMessage:
    "Open a normal HTTP(S) article, blog, or docs page to use reading mode."
};

const EMPTY_CHECKPOINT_PREVIEW: CheckpointEligibilityPreview = {
  activeBandId: null,
  activeBandLabel: null,
  nextBandId: null,
  nextBandLabel: null,
  checkpointBlueprint: null,
  checkpointScopeLabels: [],
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
  const [accountState, setAccountState] =
    useState<RuntimePreviewAccountState | null>(null);
  const [showFirstRunIntro, setShowFirstRunIntro] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingSite, setIsSavingSite] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  usePopupOverlayResizeBridge();

  const loadSnapshot = useCallback(async () => {
    const tabContext = await loadActiveTabContext();
    const [
      loadedSettingsState,
      loadedSiteSettings,
      loadedVocabStats,
      loadedCheckpointPreview,
      loadedFirstRunIntroVisible,
      loadedAccountState
    ] = await Promise.all([
      loadSettingsState(),
      loadSiteSettingsMap(),
      loadVocabStats(),
      loadCheckpointEligibilityPreview(),
      loadFirstRunIntroVisible(),
      loadPreviewAccountState()
    ]);

    return {
      tabContext,
      loadedSettingsState,
      loadedSiteSettings,
      loadedVocabStats,
      loadedCheckpointPreview,
      loadedFirstRunIntroVisible,
      loadedAccountState
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
      setAccountState(snapshot.loadedAccountState);
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
      void sendRuntimeMessage({
        type: RuntimeMessageType.QueueActivationEvent,
        eventName: "pause_resume",
        properties: {
          surface: "popup",
          action: nextEnabled ? "resume" : "pause"
        }
      });
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

  const handleOpenDebug = useCallback(async () => {
    if (
      !DIAGNOSTICS_ENABLED ||
      typeof activeTab.tabId !== "number" ||
      typeof chrome === "undefined" ||
      !chrome.tabs?.sendMessage
    ) {
      return;
    }

    await new Promise<DebugOverlayToggleResponse | null>((resolve) => {
      chrome.tabs.sendMessage(
        activeTab.tabId as number,
        { type: DEBUG_OVERLAY_TOGGLE_MESSAGE_TYPE },
        (response?: DebugOverlayToggleResponse) => {
          if (chrome.runtime.lastError || !response?.ok) {
            resolve(null);
            return;
          }
          resolve(response);
        }
      );
    });
  }, [activeTab.tabId]);

  const handleReportIssue = useCallback(() => {
    openSupportOptionsPage();
  }, []);

  const handlePreviewSignIn = useCallback(() => {
    setErrorMessage(null);
    void startPreviewSignIn()
      .then((state) => {
        setAccountState(state);
        void refreshSnapshot();
      })
      .catch(() => {
        setErrorMessage("Could not start preview sign-in. Open Account settings and try again.");
      });
  }, [refreshSnapshot]);

  const handleDismissFirstRunIntro = useCallback(async () => {
    setShowFirstRunIntro(false);
    await markFirstRunIntroSeen();
  }, []);

  const siteEnabled = getSiteEnabledForHost(siteSettings, activeTab.hostname);
  const proficiencyLabel =
    PROFICIENCY_SEED_OPTIONS.find((option) => option.id === settingsState?.proficiencySeed)
      ?.label ?? "False beginner";
  const discoverySummary = describeDiscoveryRate(settingsState?.settings.discoveryRate ?? 0);
  const progressCopy = formatPopupProgressCopy({
    checkpointPreview,
    vocabStats
  });

  return (
    <>
      <ExtensionPopup
        chromeFrame={false}
        state={activeTab.isSupportedPage && !isLoading ? "supported" : "unsupported"}
        siteState={siteEnabled ? "on" : "paused"}
        bandTitle={checkpointPreview.activeBandLabel ?? proficiencyLabel}
        bandSubtitle={`${discoverySummary}. Words + phrases.`}
        progressValue={estimateProgressValue(checkpointPreview)}
        progressLabel={progressCopy.progressLabel}
        progressDetail={progressCopy.progressDetail}
        unsupportedMessage={activeTab.supportMessage}
        firstRunIntro={showFirstRunIntro}
        errorMessage={errorMessage}
        isSavingSite={isSavingSite}
        learningStats={{
          comfortable: vocabStats.known,
          practice: vocabStats.learning,
          newCount: vocabStats.newCount,
          ignored: vocabStats.ignored,
          total: vocabStats.total
        }}
        learningDays={vocabStats.daily}
        account={toUiAccountState(accountState)}
        onSiteToggle={() => {
          void handleSiteToggle();
        }}
        onOpenSettings={handleOpenOptions}
        debugAvailable={DIAGNOSTICS_ENABLED && activeTab.isSupportedPage}
        onOpenDebug={() => {
          void handleOpenDebug();
        }}
        onReportIssue={handleReportIssue}
        onDismissIntro={() => {
          void handleDismissFirstRunIntro();
        }}
        onPreviewSignIn={handlePreviewSignIn}
      />
    </>
  );
}

async function loadPreviewAccountState(): Promise<RuntimePreviewAccountState | null> {
  const response = await sendRuntimeMessage({
    type: RuntimeMessageType.GetAccountState
  });
  return response?.ok ? response.state : null;
}

async function startPreviewSignIn(): Promise<RuntimePreviewAccountState | null> {
  const response = await sendRuntimeMessage({
    type: RuntimeMessageType.StartAccountLogin,
    provider: "google"
  });
  if (!response?.ok) {
    throw new Error(response?.error ?? "preview-sign-in-failed");
  }
  return response.state;
}

function toUiAccountState(state: RuntimePreviewAccountState | null) {
  if (!state) {
    return ACCOUNT_REQUIRED
      ? { status: "signed-out" as const }
      : { status: "not-required" as const };
  }
  if (state && !state.accountRequired) {
    return { status: "not-required" as const };
  }
  if (state.status !== "signed-in" || !state.profile) {
    return { status: "signed-out" as const };
  }
  return {
    status: "signed-in" as const,
    email: state.profile.email,
    previewStatus: state.profile.previewStatus
  };
}

export function openAccountOptionsPage(): void {
  if (typeof chrome === "undefined" || !chrome.runtime) {
    return;
  }

  const accountUrl = chrome.runtime.getURL?.("options.html#account");
  if (accountUrl && chrome.tabs?.create) {
    chrome.tabs.create({ url: accountUrl });
    return;
  }

  chrome.runtime.openOptionsPage?.();
}

export function openSupportOptionsPage(): void {
  if (typeof chrome === "undefined" || !chrome.runtime) {
    return;
  }

  const supportUrl = chrome.runtime.getURL?.("options.html#support");
  if (supportUrl && chrome.tabs?.create) {
    chrome.tabs.create({ url: supportUrl });
    return;
  }

  chrome.runtime.openOptionsPage?.();
}

function usePopupOverlayResizeBridge(): void {
  useEffect(() => {
    if (window.parent === window || typeof ResizeObserver === "undefined") {
      return;
    }

    let animationFrameId: number | null = null;
    const root = document.getElementById("root");

    const postHeight = () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }

      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null;
        const rootHeight = root
          ? Math.max(root.scrollHeight, root.getBoundingClientRect().height)
          : 0;
        const height = Math.ceil(
          Math.max(
            rootHeight,
            document.body.scrollHeight
          )
        );

        window.parent.postMessage(
          {
            type: POPUP_OVERLAY_RESIZE_MESSAGE_TYPE,
            height
          },
          "*"
        );
      });
    };

    const resizeObserver = new ResizeObserver(postHeight);
    if (root) {
      resizeObserver.observe(root);
    }
    resizeObserver.observe(document.body);

    postHeight();
    const timeoutIds = [
      window.setTimeout(postHeight, 50),
      window.setTimeout(postHeight, 250)
    ];

    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      for (const timeoutId of timeoutIds) {
        window.clearTimeout(timeoutId);
      }
      resizeObserver.disconnect();
    };
  }, []);
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

export function formatPopupProgressCopy(input: {
  checkpointPreview: CheckpointEligibilityPreview;
  vocabStats: VocabStats;
}): {
  progressLabel: string;
  progressDetail: string;
} {
  if (input.vocabStats.total === 0 || !input.checkpointPreview.activeBandId) {
    return {
      progressLabel: "Progress starts as you read",
      progressDetail:
        "Reading history and local evidence build while you browse supported pages."
    };
  }

  const progressDetail = formatPopupCheckpointHint(input.checkpointPreview);
  return {
    progressLabel: progressDetail,
    progressDetail
  };
}

function formatPopupCheckpointHint(preview: CheckpointEligibilityPreview): string {
  if (!preview.activeBandId) {
    return "Next step: build reading history on supported pages.";
  }

  if (preview.checkpointIsOnlyBlocker) {
    return "Ready to widen your reading range in settings.";
  }

  if (preview.unmetRequirements.length > 0) {
    const missingCount = preview.unmetRequirements.filter(
      (requirement) => requirement !== "checkpoint"
    ).length;
    return `${formatCount(missingCount)} reading evidence item${missingCount === 1 ? "" : "s"} left before the next range.`;
  }

  if (preview.nextBandId) {
    return "Keep reading to widen your range.";
  }

  return "You are at the latest available range.";
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
