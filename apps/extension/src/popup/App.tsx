import { useCallback, useEffect, useState } from "react";
import {
  getSiteEnabledForHost,
  isProviderKeyValid,
  loadActiveTabContext,
  loadPageDiagnostics,
  loadSentenceStats,
  loadSettingsState,
  loadSiteSettingsMap,
  loadVocabStats,
  normalizeDiscoveryRate,
  notifySettingsRefresh,
  pingBackground,
  saveSettingsState,
  upsertSiteEnabledState,
  type ActiveTabContext,
  type PageDiagnostics,
  type SentenceStats,
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

const EMPTY_SENTENCE_STATS: SentenceStats = {
  cacheSize: 0,
  pendingCount: 0
};

const DEFAULT_TAB_CONTEXT: ActiveTabContext = {
  tabId: null,
  hostname: null,
  url: null,
  isSupportedPage: false,
  supportMessage: "Open an HTTP(S) page to configure site controls."
};

export function PopupApp() {
  const [activeTab, setActiveTab] = useState<ActiveTabContext>(DEFAULT_TAB_CONTEXT);
  const [settingsState, setSettingsState] = useState<SettingsState | null>(null);
  const [siteSettings, setSiteSettings] = useState<SiteSettingsMap>({});
  const [vocabStats, setVocabStats] = useState<VocabStats>(EMPTY_STATS);
  const [sentenceStats, setSentenceStats] = useState<SentenceStats>(EMPTY_SENTENCE_STATS);
  const [pageDiagnostics, setPageDiagnostics] = useState<PageDiagnostics | null>(null);
  const [backgroundHealthy, setBackgroundHealthy] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingSite, setIsSavingSite] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isRefreshingTab, setIsRefreshingTab] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadSnapshot = useCallback(async () => {
    const tabContext = await loadActiveTabContext();
    const [
      loadedSettingsState,
      loadedSiteSettings,
      loadedVocabStats,
      loadedSentenceStats,
      backgroundOk,
      diagnostics
    ] = await Promise.all([
      loadSettingsState(),
      loadSiteSettingsMap(),
      loadVocabStats(),
      loadSentenceStats(),
      pingBackground(),
      loadPageDiagnostics(tabContext.tabId)
    ]);

    return {
      tabContext,
      loadedSettingsState,
      loadedSiteSettings,
      loadedVocabStats,
      loadedSentenceStats,
      backgroundOk,
      diagnostics
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
      setSentenceStats(snapshot.loadedSentenceStats);
      setPageDiagnostics(snapshot.diagnostics);
      setBackgroundHealthy(snapshot.backgroundOk);
    } catch {
      setErrorMessage("Unable to load popup state. Try reopening the popup.");
    } finally {
      setIsLoading(false);
    }
  }, [loadSnapshot]);

  useEffect(() => {
    void refreshSnapshot();
  }, [refreshSnapshot]);

  const handleSiteToggle = useCallback(
    async (nextEnabled: boolean) => {
      if (!activeTab.hostname) {
        return;
      }

      setErrorMessage(null);
      setIsSavingSite(true);

      try {
        const nextSiteSettings = await upsertSiteEnabledState(
          activeTab.hostname,
          nextEnabled,
          siteSettings
        );

        setSiteSettings(nextSiteSettings);
        await notifySettingsRefresh(activeTab.tabId);
      } catch {
        setErrorMessage("Could not update the site toggle.");
      } finally {
        setIsSavingSite(false);
      }
    },
    [activeTab.hostname, activeTab.tabId, siteSettings]
  );

  const handleDiscoveryRateChange = useCallback(
    async (nextPercent: number) => {
      if (!settingsState) {
        return;
      }

      const nextRate = normalizeDiscoveryRate(nextPercent / 100);
      const nextState: SettingsState = {
        ...settingsState,
        settings: {
          ...settingsState.settings,
          discoveryRate: nextRate
        }
      };

      setSettingsState(nextState);
      setErrorMessage(null);
      setIsSavingSettings(true);

      try {
        const savedState = await saveSettingsState(nextState);
        setSettingsState(savedState);
        await notifySettingsRefresh(activeTab.tabId);
      } catch {
        setErrorMessage("Discovery rate could not be saved.");
      } finally {
        setIsSavingSettings(false);
      }
    },
    [activeTab.tabId, settingsState]
  );

  const handleSentenceTranslationToggle = useCallback(
    async (nextEnabled: boolean) => {
      if (!settingsState) {
        return;
      }

      if (
        nextEnabled &&
        !isProviderKeyValid(settingsState.settings.provider, settingsState.providerApiKey)
      ) {
        setErrorMessage(
          "Add a valid provider key in Settings before enabling sentence translation."
        );
        return;
      }

      const nextState: SettingsState = {
        ...settingsState,
        settings: {
          ...settingsState.settings,
          sentenceTranslationEnabled: nextEnabled
        }
      };

      setSettingsState(nextState);
      setErrorMessage(null);
      setIsSavingSettings(true);

      try {
        const savedState = await saveSettingsState(nextState);
        setSettingsState(savedState);
        await notifySettingsRefresh(activeTab.tabId);
      } catch {
        setErrorMessage("Sentence translation preference could not be saved.");
      } finally {
        setIsSavingSettings(false);
      }
    },
    [activeTab.tabId, settingsState]
  );

  const handleRefreshActiveTab = useCallback(async () => {
    setErrorMessage(null);
    setIsRefreshingTab(true);

    try {
      await notifySettingsRefresh(activeTab.tabId);
      setBackgroundHealthy(await pingBackground());
      setPageDiagnostics(await loadPageDiagnostics(activeTab.tabId));
    } catch {
      setErrorMessage("Could not request a tab refresh.");
    } finally {
      setIsRefreshingTab(false);
    }
  }, [activeTab.tabId]);

  const handleOpenOptions = useCallback(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.openOptionsPage) {
      return;
    }

    chrome.runtime.openOptionsPage();
  }, []);

  const siteEnabled = getSiteEnabledForHost(siteSettings, activeTab.hostname);
  const providerReady = settingsState
    ? isProviderKeyValid(settingsState.settings.provider, settingsState.providerApiKey)
    : false;

  const discoveryRatePercent = Math.round(
    (settingsState?.settings.discoveryRate ?? 0) * 100
  );

  const sentenceToggleDisabled =
    !settingsState ||
    settingsState.settings.provider === "none" ||
    !providerReady ||
    isSavingSettings;

  return (
    <main className="panel-shell" style={{ width: 360, boxSizing: "border-box" }}>
      <header className="panel-header">
        <p className="eyebrow">ImmersionKit</p>
        <h1>Session Controls</h1>
        <p className="muted" style={{ marginTop: 8 }}>
          {activeTab.isSupportedPage
            ? `Current site: ${activeTab.supportMessage}`
            : activeTab.supportMessage}
        </p>
      </header>

      <section className="panel-card" aria-live="polite">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Site Toggle</h2>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: "0.9rem" }}>Enabled</span>
            <input
              type="checkbox"
              checked={siteEnabled}
              disabled={!activeTab.isSupportedPage || isSavingSite || isLoading}
              onChange={(event) => {
                void handleSiteToggle(event.target.checked);
              }}
            />
          </label>
        </div>
        <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
          {activeTab.isSupportedPage
            ? "Control whether ImmersionKit injects Spanish vocabulary on this hostname."
            : "Open a normal web page to enable the per-site toggle."}
        </p>
      </section>

      <section className="panel-card">
        <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: "1.05rem" }}>Snapshot</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 10
          }}
        >
          <Metric label="Known" value={vocabStats.known} />
          <Metric label="Learning" value={vocabStats.learning} />
          <Metric label="Ignored" value={vocabStats.ignored} />
          <Metric label="Tracked Words" value={vocabStats.total} />
          <Metric label="Cached Sentences" value={sentenceStats.cacheSize} />
          <Metric label="Pending Sentences" value={sentenceStats.pendingCount} />
        </div>
        <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>
          Background service: {backgroundHealthy ? "online" : "waiting"}
        </p>
      </section>

      <section className="panel-card">
        <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: "1.05rem" }}>
          Current Page Diagnostics
        </h2>
        {pageDiagnostics ? (
          <div style={{ display: "grid", gap: 8 }}>
            <p style={{ margin: 0 }}>
              Lexicon source:{" "}
              <strong>{formatLexiconSource(pageDiagnostics.lexiconSource)}</strong> (
              {pageDiagnostics.lexiconEntryCount.toLocaleString()} entries)
            </p>
            <p className="muted" style={{ margin: 0 }}>
              Sentence candidates on page: {pageDiagnostics.sentenceCandidatesSeen}
            </p>
            <p className="muted" style={{ margin: 0 }}>
              Sentence notes rendered: {pageDiagnostics.sentenceNotesRendered} (
              visible now: {pageDiagnostics.sentenceNotesVisible})
            </p>
          </div>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            Page diagnostics unavailable. Open and refresh a supported page.
          </p>
        )}
      </section>

      <section className="panel-card">
        <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: "1.05rem" }}>Quick Controls</h2>

        <label htmlFor="popup-discovery-rate" style={{ display: "grid", gap: 6 }}>
          <span>
            Discovery Rate <strong>{discoveryRatePercent}%</strong>
          </span>
          <input
            id="popup-discovery-rate"
            type="range"
            min={0}
            max={20}
            step={1}
            disabled={!settingsState || isSavingSettings}
            value={discoveryRatePercent}
            onChange={(event) => {
              void handleDiscoveryRateChange(Number(event.target.value));
            }}
          />
        </label>

        <label
          style={{
            marginTop: 12,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12
          }}
        >
          <span>Sentence Translation</span>
          <input
            type="checkbox"
            disabled={sentenceToggleDisabled}
            checked={Boolean(settingsState?.settings.sentenceTranslationEnabled)}
            onChange={(event) => {
              void handleSentenceTranslationToggle(event.target.checked);
            }}
          />
        </label>

        <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
          Provider: {settingsState?.settings.provider ?? "none"}. Configure API key in
          Settings.
        </p>

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button type="button" onClick={handleOpenOptions} style={{ flex: 1 }}>
            Open Settings
          </button>
          <button
            type="button"
            onClick={() => {
              void handleRefreshActiveTab();
            }}
            disabled={isRefreshingTab || !activeTab.isSupportedPage}
            style={{ flex: 1 }}
          >
            {isRefreshingTab ? "Refreshing..." : "Refresh Tab"}
          </button>
          <button
            type="button"
            onClick={() => {
              void refreshSnapshot();
            }}
            disabled={isLoading}
            style={{ flex: 1 }}
          >
            Reload
          </button>
        </div>
      </section>

      {errorMessage ? (
        <section className="panel-card" role="status">
          <p style={{ margin: 0 }}>{errorMessage}</p>
        </section>
      ) : null}
    </main>
  );
}

type MetricProps = {
  label: string;
  value: number;
};

function Metric({ label, value }: MetricProps) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 12,
        background: "rgba(25, 48, 64, 0.06)"
      }}
    >
      <p className="muted" style={{ margin: 0, fontSize: "0.75rem", textTransform: "uppercase" }}>
        {label}
      </p>
      <p style={{ margin: "4px 0 0", fontSize: "1.15rem", fontWeight: 600 }}>{value}</p>
    </div>
  );
}

function formatLexiconSource(source: string): string {
  if (source === "storage-wrapped-asset") {
    return "Imported asset (storage)";
  }

  if (source === "storage-legacy-array") {
    return "Legacy array (storage)";
  }

  if (source === "bundled-asset") {
    return "Bundled generated asset";
  }

  if (source === "fallback") {
    return "Emergency fallback";
  }

  return source;
}
