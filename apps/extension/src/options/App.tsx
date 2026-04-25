import { useCallback, useEffect, useState } from "react";
import type { ProviderName } from "@immersionkit/shared";
import {
  PROFICIENCY_SEED_OPTIONS,
  isProviderKeyValid,
  loadActiveTabContext,
  loadPageDiagnostics,
  loadSentenceStats,
  loadSettingsState,
  loadSiteSettingsMap,
  loadVocabStats,
  normalizeDiscoveryRate,
  notifySettingsRefresh,
  parseProficiencySeed,
  saveSettingsState,
  type SentenceStats,
  type SettingsState,
  type SiteSettingsMap,
  type VocabStats,
  type ActiveTabContext,
  type PageDiagnostics
} from "./state";

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

const EMPTY_ACTIVE_TAB_CONTEXT: ActiveTabContext = {
  tabId: null,
  hostname: null,
  url: null,
  isSupportedPage: false,
  supportMessage: "Active tab has not been checked yet."
};

const SHOW_ADVANCED_TAB = true;

type OptionsTab = "general" | "translation" | "advanced";

export function OptionsApp() {
  const [settingsState, setSettingsState] = useState<SettingsState | null>(null);
  const [vocabStats, setVocabStats] = useState<VocabStats>(EMPTY_STATS);
  const [siteSettings, setSiteSettings] = useState<SiteSettingsMap>({});
  const [sentenceStats, setSentenceStats] = useState<SentenceStats>(EMPTY_SENTENCE_STATS);
  const [activeTabContext, setActiveTabContext] = useState<ActiveTabContext>(
    EMPTY_ACTIVE_TAB_CONTEXT
  );
  const [pageDiagnostics, setPageDiagnostics] = useState<PageDiagnostics | null>(null);
  const [activeTab, setActiveTab] = useState<OptionsTab>("general");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    setIsLoading(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const [
        loadedSettings,
        loadedVocabStats,
        loadedSiteSettings,
        loadedSentenceStats,
        loadedActiveTabContext
      ] =
        await Promise.all([
          loadSettingsState(),
          loadVocabStats(),
          loadSiteSettingsMap(),
          loadSentenceStats(),
          loadActiveTabContext()
        ]);

      const loadedPageDiagnostics = loadedActiveTabContext.isSupportedPage
        ? await loadPageDiagnostics(loadedActiveTabContext.tabId)
        : null;

      setSettingsState(loadedSettings);
      setVocabStats(loadedVocabStats);
      setSiteSettings(loadedSiteSettings);
      setSentenceStats(loadedSentenceStats);
      setActiveTabContext(loadedActiveTabContext);
      setPageDiagnostics(loadedPageDiagnostics);
    } catch {
      setErrorMessage("Could not load extension settings.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const handleDiscoveryRateChange = useCallback((percent: number) => {
    setSettingsState((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        settings: {
          ...current.settings,
          discoveryRate: normalizeDiscoveryRate(percent / 100)
        }
      };
    });
    setStatusMessage(null);
    setErrorMessage(null);
  }, []);

  const handleProficiencySeedChange = useCallback((nextSeed: string) => {
    setSettingsState((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        proficiencySeed: parseProficiencySeed(nextSeed)
      };
    });
    setStatusMessage(null);
    setErrorMessage(null);
  }, []);

  const handleProviderChange = useCallback((provider: ProviderName) => {
    setSettingsState((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        settings: {
          ...current.settings,
          provider,
          sentenceTranslationEnabled:
            provider === "none" ? false : current.settings.sentenceTranslationEnabled
        }
      };
    });
    setStatusMessage(null);
    setErrorMessage(null);
  }, []);

  const handleApiKeyChange = useCallback((apiKey: string) => {
    setSettingsState((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        providerApiKey: apiKey
      };
    });
    setStatusMessage(null);
    setErrorMessage(null);
  }, []);

  const handleSentenceTranslationChange = useCallback((enabled: boolean) => {
    setStatusMessage(null);
    setErrorMessage(null);

    setSettingsState((current) => {
      if (!current) {
        return current;
      }

      if (enabled && !isProviderKeyValid(current.settings.provider, current.providerApiKey)) {
        setErrorMessage(
          "Add a valid OpenAI API key before turning sentence help on."
        );
        return {
          ...current,
          settings: {
            ...current.settings,
            sentenceTranslationEnabled: false
          }
        };
      }

      return {
        ...current,
        settings: {
          ...current.settings,
          sentenceTranslationEnabled: enabled
        }
      };
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!settingsState) {
      return;
    }

    setErrorMessage(null);
    setStatusMessage(null);

    const providerKeyValid = isProviderKeyValid(
      settingsState.settings.provider,
      settingsState.providerApiKey
    );

    if (settingsState.settings.provider === "openai" && !providerKeyValid) {
      setErrorMessage("Enter a valid OpenAI API key before saving.");
      setActiveTab("translation");
      return;
    }

    const normalizedState: SettingsState = {
      ...settingsState,
      settings: {
        ...settingsState.settings,
        targetLanguage: "es",
        discoveryRate: normalizeDiscoveryRate(settingsState.settings.discoveryRate),
        sentenceTranslationEnabled:
          settingsState.settings.provider === "openai"
            ? settingsState.settings.sentenceTranslationEnabled && providerKeyValid
            : false
      }
    };

    setIsSaving(true);

    try {
      const savedState = await saveSettingsState(normalizedState);
      setSettingsState(savedState);
      await notifySettingsRefresh();
      setStatusMessage("Settings saved.");
    } catch {
      setErrorMessage("Unable to save settings. Try again.");
    } finally {
      setIsSaving(false);
    }
  }, [settingsState]);

  const handleClearApiKey = useCallback(() => {
    setSettingsState((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        providerApiKey: "",
        settings: {
          ...current.settings,
          sentenceTranslationEnabled: false
        }
      };
    });
    setStatusMessage(null);
    setErrorMessage(null);
  }, []);

  const discoveryRatePercent = Math.round(
    (settingsState?.settings.discoveryRate ?? 0) * 100
  );
  const providerKeyValid = settingsState
    ? isProviderKeyValid(settingsState.settings.provider, settingsState.providerApiKey)
    : false;
  const siteEntries = Object.values(siteSettings).sort(
    (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
  );
  const disabledSiteCount = siteEntries.filter((entry) => !entry.enabled).length;
  const translationReady =
    settingsState?.settings.provider === "openai" && providerKeyValid;
  const translationSummary = getTranslationSummary({
    provider: settingsState?.settings.provider ?? "none",
    sentenceTranslationEnabled: Boolean(settingsState?.settings.sentenceTranslationEnabled),
    providerKeyValid
  });

  return (
    <main className="panel-shell options-shell">
      <section className="panel-card options-hero">
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <p className="eyebrow">ImmersionKit</p>
            <h1>Make reading feel guided, not crowded.</h1>
          </div>
          <p className="muted">
            Keep the popup focused on a quick on or off decision, and use this page
            when you want to tune how much Spanish appears, how much help you get,
            and any advanced behavior behind the scenes.
          </p>
        </div>

        <div className="toolbar-actions">
          <button
            type="button"
            className="button-primary"
            disabled={!settingsState || isLoading || isSaving}
            onClick={() => {
              void handleSave();
            }}
          >
            {isSaving ? "Saving..." : "Save changes"}
          </button>
          <button
            type="button"
            className="button-secondary"
            disabled={isLoading || isSaving}
            onClick={() => {
              void loadState();
            }}
          >
            Reload
          </button>
        </div>
      </section>

      <nav className="tab-strip" aria-label="Settings sections">
        <TabButton
          label="General"
          isActive={activeTab === "general"}
          onClick={() => {
            setActiveTab("general");
          }}
        />
        <TabButton
          label="Translation"
          isActive={activeTab === "translation"}
          onClick={() => {
            setActiveTab("translation");
          }}
        />
        {SHOW_ADVANCED_TAB ? (
          <TabButton
            label="Advanced"
            isActive={activeTab === "advanced"}
            onClick={() => {
              setActiveTab("advanced");
            }}
          />
        ) : null}
      </nav>

      {statusMessage ? (
        <section className="status-banner status-banner--success" role="status">
          <p>{statusMessage}</p>
        </section>
      ) : null}

      {errorMessage ? (
        <section className="status-banner status-banner--error" role="status">
          <p>{errorMessage}</p>
        </section>
      ) : null}

      {activeTab === "general" ? (
        <div className="settings-grid">
          <div className="settings-grid settings-grid--two">
            <section className="panel-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Reading Feel</p>
                  <h2>Discovery rate</h2>
                </div>
                <span className="badge-soft">{describeDiscoveryRate(discoveryRatePercent)}</span>
              </div>

              <div className="slider-wrap">
                <p className="slider-value">
                  Inject new words at <strong>{discoveryRatePercent}%</strong>
                </p>
                <input
                  id="settings-discovery-rate"
                  type="range"
                  min={0}
                  max={20}
                  step={1}
                  value={discoveryRatePercent}
                  disabled={!settingsState || isLoading || isSaving}
                  onChange={(event) => {
                    handleDiscoveryRateChange(Number(event.target.value));
                  }}
                />
                <div className="slider-scale" aria-hidden="true">
                  <span>Subtle</span>
                  <span>Balanced</span>
                  <span>Bold</span>
                </div>
              </div>

              <p className="helper-line muted">
                Lower values keep pages closer to the original text. Higher values
                surface more new vocabulary while you read.
              </p>
            </section>

            <section className="panel-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Starting Point</p>
                  <h2>Current level</h2>
                </div>
              </div>

              <div className="choice-grid">
                {PROFICIENCY_SEED_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`choice-card${settingsState?.proficiencySeed === option.id ? " is-selected" : ""}`}
                    disabled={!settingsState || isLoading || isSaving}
                    onClick={() => {
                      handleProficiencySeedChange(option.id);
                    }}
                  >
                    <p className="choice-card-title">{option.label}</p>
                    <p className="choice-card-text muted">{option.description}</p>
                  </button>
                ))}
              </div>
            </section>
          </div>

          <div className="settings-grid settings-grid--two">
            <section className="panel-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Your Progress</p>
                  <h2>Learning snapshot</h2>
                </div>
              </div>

              <div className="metric-grid metric-grid--wide">
                <MetricCard label="Known words" value={formatCount(vocabStats.known)} />
                <MetricCard label="Learning now" value={formatCount(vocabStats.learning)} />
                <MetricCard label="Still new" value={formatCount(vocabStats.newCount)} />
                <MetricCard label="Tracked total" value={formatCount(vocabStats.total)} />
              </div>

              <p className="support-line muted">
                This is the same user-facing snapshot the popup keeps visible, just
                with a little more breathing room.
              </p>
            </section>

            <section className="panel-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Site Controls</p>
                  <h2>Popup behavior</h2>
                </div>
                <span className="mini-badge">{formatCount(siteEntries.length)} saved</span>
              </div>

              <p className="helper-line muted" style={{ marginTop: 0 }}>
                The popup is now just a quick site power button plus your learning
                snapshot. Use it when a page needs an immediate pause, and come here
                for everything global.
              </p>

              <div className="metric-grid metric-grid--wide" style={{ marginTop: 14 }}>
                <MetricCard label="Sites paused" value={formatCount(disabledSiteCount)} />
                <MetricCard
                  label="Translation"
                  value={translationReady ? "Ready" : "Needs setup"}
                />
              </div>

              {siteEntries.length > 0 ? (
                <p className="support-line muted">
                  Recent site choices:{" "}
                  {siteEntries
                    .slice(0, 3)
                    .map((entry) => entry.hostname)
                    .join(", ")}
                  .
                </p>
              ) : (
                <p className="support-line muted">
                  No site-specific overrides yet.
                </p>
              )}
            </section>
          </div>
        </div>
      ) : null}

      {activeTab === "translation" ? (
        <div className="settings-grid">
          <section className="panel-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Sentence Help</p>
                <h2>Translation and grammar notes</h2>
              </div>
              <span className={translationSummary.badgeClass}>{translationSummary.badgeLabel}</span>
            </div>

            <div className="switch-row">
              <div className="switch-copy">
                <p className="choice-card-title">Enable sentence translation</p>
                <p className="muted">
                  Show translated sentences and grammar hints when the provider is ready.
                </p>
              </div>
              <ToggleSwitch
                checked={Boolean(settingsState?.settings.sentenceTranslationEnabled)}
                disabled={!settingsState || isLoading || isSaving}
                ariaLabel="Enable sentence translation and grammar notes"
                onChange={(checked) => {
                  handleSentenceTranslationChange(checked);
                }}
              />
            </div>

            <p className="support-line muted">{translationSummary.description}</p>
          </section>

          <div className="settings-grid settings-grid--two">
            <section className="panel-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Provider</p>
                  <h2>Connection</h2>
                </div>
              </div>

              <label className="field-grid">
                <span className="field-label">Provider</span>
                <select
                  className="select-input"
                  value={settingsState?.settings.provider ?? "none"}
                  disabled={!settingsState || isLoading || isSaving}
                  onChange={(event) => {
                    const provider = event.target.value as ProviderName;
                    if (provider !== "none" && provider !== "openai") {
                      return;
                    }

                    handleProviderChange(provider);
                  }}
                >
                  <option value="none">None</option>
                  <option value="openai">OpenAI</option>
                </select>
              </label>

              <p className="support-line muted">
                Leave this off if you only want vocabulary swaps and no sentence-level help.
              </p>
            </section>

            <section className="panel-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">API Key</p>
                  <h2>Credentials</h2>
                </div>
                <span className={providerKeyValid ? "badge-soft badge-soft--on" : "badge-soft badge-soft--off"}>
                  {providerKeyValid ? "Looks valid" : "Needs key"}
                </span>
              </div>

              <label className="field-grid">
                <span className="field-label">OpenAI API key</span>
                <input
                  className="text-input"
                  type={showApiKey ? "text" : "password"}
                  value={settingsState?.providerApiKey ?? ""}
                  disabled={!settingsState || isLoading || isSaving}
                  onChange={(event) => {
                    handleApiKeyChange(event.target.value);
                  }}
                  placeholder="sk-..."
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>

              <div className="field-action-row">
                <button
                  type="button"
                  className="field-button"
                  onClick={() => {
                    setShowApiKey((current) => !current);
                  }}
                >
                  {showApiKey ? "Hide key" : "Show key"}
                </button>
                <button
                  type="button"
                  className="field-button"
                  disabled={!settingsState || settingsState.providerApiKey.length === 0 || isSaving}
                  onClick={handleClearApiKey}
                >
                  Clear key
                </button>
              </div>

              <p className="support-line muted">
                {settingsState?.settings.provider === "none"
                  ? "Provider is off, so sentence help will stay disabled."
                  : providerKeyValid
                    ? "Your key format looks ready for OpenAI."
                    : "Enter a valid OpenAI key to unlock sentence translation."}
              </p>
            </section>
          </div>
        </div>
      ) : null}

      {SHOW_ADVANCED_TAB && activeTab === "advanced" ? (
        <div className="settings-grid">
          <div className="settings-grid settings-grid--two">
            <section className="panel-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Troubleshooting</p>
                  <h2>Runtime snapshot</h2>
                </div>
              </div>

              <div className="metric-grid metric-grid--wide">
                <MetricCard
                  label="Cached sentences"
                  value={formatCount(sentenceStats.cacheSize)}
                />
                <MetricCard
                  label="Pending sentences"
                  value={formatCount(sentenceStats.pendingCount)}
                />
                <MetricCard
                  label="Provider"
                  value={settingsState?.settings.provider ?? "none"}
                />
                <MetricCard
                  label="Translation"
                  value={Boolean(settingsState?.settings.sentenceTranslationEnabled) ? "On" : "Off"}
                />
              </div>

              <p className="support-line muted">
                This tab is intended for lower-signal details that do not need to live in the popup.
              </p>
            </section>

            <section className="panel-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Active Page</p>
                  <h2>Diagnostics</h2>
                </div>
                <span className={pageDiagnostics ? "badge-soft badge-soft--on" : "badge-soft badge-soft--off"}>
                  {pageDiagnostics ? "Live" : "Unavailable"}
                </span>
              </div>

              <p className="helper-line muted" style={{ marginTop: 0 }}>
                {pageDiagnostics
                  ? `${pageDiagnostics.pageHostname}${pageDiagnostics.pagePathname}`
                  : activeTabContext.supportMessage}
              </p>

              <div className="metric-grid metric-grid--wide" style={{ marginTop: 14 }}>
                <MetricCard
                  label="Context skips"
                  value={formatCount(pageDiagnostics?.contextSkippedTokens ?? 0)}
                />
                <MetricCard
                  label="Suppressed"
                  value={formatCount(pageDiagnostics?.analysisSuppressedTokens ?? 0)}
                />
                <MetricCard
                  label="Phrases"
                  value={formatCount(pageDiagnostics?.injectedPhrases ?? 0)}
                />
                <MetricCard
                  label="Phrase rejects"
                  value={formatCount(pageDiagnostics?.rejectedPhrases ?? 0)}
                />
                <MetricCard
                  label="Seen sentences"
                  value={formatCount(pageDiagnostics?.sentenceCandidatesSeen ?? 0)}
                />
                <MetricCard
                  label="Queued sentences"
                  value={formatCount(pageDiagnostics?.sentenceCandidatesQueued ?? 0)}
                />
              </div>

              <p className="support-line muted">
                Queue storage has {formatCount(sentenceStats.pendingCount)} pending and{" "}
                {formatCount(sentenceStats.cacheSize)} cached sentence records.
              </p>
            </section>

            <section className="panel-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Site Overrides</p>
                  <h2>Saved site decisions</h2>
                </div>
                <span className="mini-badge">{formatCount(siteEntries.length)} total</span>
              </div>

              {siteEntries.length > 0 ? (
                <div className="list-stack">
                  {siteEntries.map((entry) => (
                    <div key={entry.hostname} className="list-item">
                      <div className="list-row">
                        <p className="list-title">{entry.hostname}</p>
                        <span
                          className={
                            entry.enabled
                              ? "badge-soft badge-soft--on"
                              : "badge-soft badge-soft--off"
                          }
                        >
                          {entry.enabled ? "On" : "Paused"}
                        </span>
                      </div>
                      <p className="list-subtitle">
                        Updated {formatUpdatedAt(entry.updatedAt)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="helper-line muted" style={{ marginTop: 0 }}>
                  No site-specific overrides have been saved yet.
                </p>
              )}
            </section>
          </div>

          <section className="panel-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Sentence Queue</p>
                <h2>Ranking reasons</h2>
              </div>
              <span className="mini-badge">
                {formatCount(getSentenceRankingReasons(pageDiagnostics).length)} shown
              </span>
            </div>

            {getSentenceRankingReasons(pageDiagnostics).length ? (
              <div className="list-stack">
                {getSentenceRankingReasons(pageDiagnostics).map((reason) => (
                  <div
                    key={`${reason.sentenceHash}-${reason.rank}`}
                    className="list-item"
                  >
                    <div className="list-row">
                      <p className="list-title">
                        #{reason.rank} sentence {shortenHash(reason.sentenceHash)}
                      </p>
                      <span className="mini-badge">{reason.primaryReason}</span>
                    </div>
                    <p className="list-subtitle">
                      {formatRankingSignals(reason)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="helper-line muted" style={{ marginTop: 0 }}>
                No sentence ranking sample is available from the active page.
              </p>
            )}
          </section>

          <section className="panel-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Token Decisions</p>
                <h2>Sampled render attributes</h2>
              </div>
              <span className="mini-badge">
                {formatCount(getTokenDecisionSamples(pageDiagnostics).length)} shown
              </span>
            </div>

            {getTokenDecisionSamples(pageDiagnostics).length ? (
              <div className="list-stack">
                {getTokenDecisionSamples(pageDiagnostics).map((sample, index) => (
                  <div
                    key={`${sample.lemmaId ?? "token"}-${sample.sentenceHash ?? index}-${index}`}
                    className="list-item"
                  >
                    <div className="list-row">
                      <p className="list-title">
                        {formatTokenPair(sample.sourceToken, sample.targetToken)}
                      </p>
                      <span className="mini-badge">
                        {sample.contextDecision ?? "unknown"}
                      </span>
                    </div>
                    <p className="list-subtitle">
                      {[
                        sample.lemmaId ? `lemma ${sample.lemmaId}` : null,
                        sample.unitKind ? `unit ${sample.unitKind}` : null,
                        sample.wordKind ? `kind ${sample.wordKind}` : null,
                        sample.dueStatus ? `due ${sample.dueStatus}` : null,
                        sample.schedulerReason ? `scheduler ${sample.schedulerReason}` : null,
                        sample.sentenceHash ? `sentence ${shortenHash(sample.sentenceHash)}` : null
                      ].filter(Boolean).join(" · ")}
                    </p>
                    {sample.contextRationale ? (
                      <p className="list-subtitle">{sample.contextRationale}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="helper-line muted" style={{ marginTop: 0 }}>
                No annotated tokens are available from the active page.
              </p>
            )}
          </section>
        </div>
      ) : null}
    </main>
  );
}

type TabButtonProps = {
  label: string;
  isActive: boolean;
  onClick: () => void;
};

function TabButton({ label, isActive, onClick }: TabButtonProps) {
  return (
    <button
      type="button"
      className={`button-chip${isActive ? " is-active" : ""}`}
      aria-pressed={isActive}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

type ToggleSwitchProps = {
  checked: boolean;
  disabled?: boolean;
  ariaLabel: string;
  onChange: (checked: boolean) => void;
};

function ToggleSwitch({ checked, disabled, ariaLabel, onChange }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      className={`switch${checked ? " is-on" : ""}`}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => {
        onChange(!checked);
      }}
    >
      <span className="switch-thumb" />
    </button>
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

function getTokenDecisionSamples(
  diagnostics: PageDiagnostics | null
): PageDiagnostics["tokenDecisionSamples"] {
  return Array.isArray(diagnostics?.tokenDecisionSamples)
    ? diagnostics.tokenDecisionSamples
    : [];
}

function getSentenceRankingReasons(
  diagnostics: PageDiagnostics | null
): PageDiagnostics["sentenceRankingReasons"] {
  return Array.isArray(diagnostics?.sentenceRankingReasons)
    ? diagnostics.sentenceRankingReasons
    : [];
}

function formatRankingSignals(
  reason: PageDiagnostics["sentenceRankingReasons"][number]
): string {
  const signals = reason.signals;
  if (!signals) {
    return `score ${reason.score.toFixed(3)}`;
  }

  return [
    `score ${reason.score.toFixed(3)}`,
    `vocab ${signals.vocabularyFit.toFixed(2)}`,
    `grammar ${signals.grammarFit.toFixed(2)}`,
    `due ${signals.dueTargetValue.toFixed(2)}`,
    `phrase ${signals.chunkUsefulness.toFixed(2)}`,
    `ambiguity ${signals.ambiguityPenalty.toFixed(2)}`
  ].join(" · ");
}

function formatTokenPair(sourceToken: string | null, targetToken: string | null): string {
  if (sourceToken && targetToken) {
    return `${sourceToken} -> ${targetToken}`;
  }

  return sourceToken ?? targetToken ?? "Unknown token";
}

function shortenHash(value: string): string {
  return value.length > 12 ? `${value.slice(0, 12)}...` : value;
}

function formatCount(value: number): string {
  return value.toLocaleString();
}

function describeDiscoveryRate(percent: number): string {
  if (percent <= 5) {
    return "Subtle";
  }

  if (percent <= 12) {
    return "Balanced";
  }

  return "Bold";
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "recently";
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function getTranslationSummary(input: {
  provider: ProviderName;
  sentenceTranslationEnabled: boolean;
  providerKeyValid: boolean;
}): {
  badgeClass: string;
  badgeLabel: string;
  description: string;
} {
  if (input.provider === "none") {
    return {
      badgeClass: "badge-soft badge-soft--off",
      badgeLabel: "Off",
      description: "Choose a provider and add a key when you want translated sentences and grammar notes."
    };
  }

  if (!input.providerKeyValid) {
    return {
      badgeClass: "status-badge status-badge--warning",
      badgeLabel: "Needs key",
      description: "The provider is selected, but sentence help will stay off until a valid OpenAI key is saved."
    };
  }

  if (!input.sentenceTranslationEnabled) {
    return {
      badgeClass: "badge-soft badge-soft--off",
      badgeLabel: "Ready",
      description: "Your provider is connected. Turn sentence help on when you want extra context while reading."
    };
  }

  return {
    badgeClass: "badge-soft badge-soft--on",
    badgeLabel: "Active",
    description: "Translated sentences and grammar notes can appear when the extension requests them."
  };
}
