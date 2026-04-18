import { useCallback, useEffect, useState } from "react";
import type { ProviderName } from "@immersionkit/shared";
import {
  PROFICIENCY_SEED_OPTIONS,
  isProviderKeyValid,
  loadSettingsState,
  normalizeDiscoveryRate,
  notifySettingsRefresh,
  parseProficiencySeed,
  saveSettingsState,
  type SettingsState
} from "./state";

export function OptionsApp() {
  const [settingsState, setSettingsState] = useState<SettingsState | null>(null);
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
      const loaded = await loadSettingsState();
      setSettingsState(loaded);
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
  }, []);

  const handleSentenceTranslationChange = useCallback((enabled: boolean) => {
    setSettingsState((current) => {
      if (!current) {
        return current;
      }

      if (enabled && !isProviderKeyValid(current.settings.provider, current.providerApiKey)) {
        setErrorMessage(
          "Sentence translation requires a valid provider key before it can be enabled."
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
      setErrorMessage("Enter a valid OpenAI API key (starts with sk-) before saving.");
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
      setStatusMessage("Saved settings and notified runtime contexts.");
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

  const sentenceToggleDisabled =
    !settingsState ||
    settingsState.settings.provider === "none" ||
    !providerKeyValid;

  return (
    <main className="panel-shell" style={{ maxWidth: 760, margin: "0 auto" }}>
      <header className="panel-header">
        <p className="eyebrow">ImmersionKit</p>
        <h1>Settings</h1>
        <p className="muted" style={{ marginTop: 8 }}>
          Configure immersion intensity and sentence translation for the MVP.
        </p>
      </header>

      <section className="panel-card">
        <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: "1.1rem" }}>
          Discovery Rate
        </h2>
        <label htmlFor="settings-discovery-rate" style={{ display: "grid", gap: 8 }}>
          <span>
            Inject new words at <strong>{discoveryRatePercent}%</strong>
          </span>
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
        </label>
        <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
          Lower values reduce noise; higher values accelerate vocabulary discovery.
        </p>
      </section>

      <section className="panel-card">
        <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: "1.1rem" }}>
          Proficiency Seed
        </h2>
        <div style={{ display: "grid", gap: 10 }}>
          {PROFICIENCY_SEED_OPTIONS.map((option) => (
            <label
              key={option.id}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                alignItems: "start",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 12,
                background: "rgba(25, 48, 64, 0.05)"
              }}
            >
              <input
                type="radio"
                name="proficiency-seed"
                value={option.id}
                checked={settingsState?.proficiencySeed === option.id}
                disabled={!settingsState || isLoading || isSaving}
                onChange={(event) => {
                  handleProficiencySeedChange(event.target.value);
                }}
              />
              <span>
                <strong>{option.label}</strong>
                <br />
                <span className="muted">{option.description}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="panel-card">
        <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: "1.1rem" }}>
          Sentence Translation
        </h2>
        <label
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12
          }}
        >
          <span>Enable sentence translation + grammar notes</span>
          <input
            type="checkbox"
            checked={Boolean(settingsState?.settings.sentenceTranslationEnabled)}
            disabled={sentenceToggleDisabled || isSaving || isLoading}
            onChange={(event) => {
              handleSentenceTranslationChange(event.target.checked);
            }}
          />
        </label>
        <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
          Feature flag is off by default. A valid provider key is required before enabling.
        </p>
      </section>

      <section className="panel-card">
        <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: "1.1rem" }}>
          Provider API Key
        </h2>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Provider</span>
          <select
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
            <option value="none">None (sentence translation disabled)</option>
            <option value="openai">OpenAI</option>
          </select>
        </label>

        <label style={{ marginTop: 12, display: "grid", gap: 6 }}>
          <span>API Key</span>
          <input
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

        <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={showApiKey}
              onChange={(event) => {
                setShowApiKey(event.target.checked);
              }}
            />
            Show key
          </label>

          <button
            type="button"
            disabled={!settingsState || settingsState.providerApiKey.length === 0 || isSaving}
            onClick={handleClearApiKey}
          >
            Clear key
          </button>
        </div>

        <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
          {settingsState?.settings.provider === "none"
            ? "Provider is disabled. Sentence translation will remain off."
            : providerKeyValid
              ? "Key format looks valid for OpenAI."
              : "Enter a valid OpenAI key to unlock sentence translation."}
        </p>
      </section>

      <section className="panel-card" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => {
              void handleSave();
            }}
            disabled={!settingsState || isLoading || isSaving}
            style={{ minWidth: 120 }}
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </button>

          <button
            type="button"
            onClick={() => {
              void loadState();
            }}
            disabled={isLoading || isSaving}
          >
            Reload from Storage
          </button>
        </div>

        {statusMessage ? <p style={{ margin: 0 }}>{statusMessage}</p> : null}
        {errorMessage ? <p style={{ margin: 0 }}>{errorMessage}</p> : null}
      </section>
    </main>
  );
}
