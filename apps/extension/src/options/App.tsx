import { useCallback, useEffect, useState } from "react";
import {
  ExtensionOptions,
  type OptionsAdvancedDiagnostics,
  type OptionsSection
} from "@immersionkit/ui";
import type { ProviderName } from "@immersionkit/shared";
import {
  loadActivePageDiagnostics,
  isProviderKeyValid,
  loadCheckpointEligibilityPreview,
  loadCurriculumDiagnostics,
  loadFirstRunIntroVisible,
  loadSettingsState,
  loadSiteSettingsMap,
  loadVocabStats,
  graduateCheckpoint,
  createCurriculumDiagnosticsForProfile,
  createLearningProfileForBand,
  createLearningProfileForProficiencySeed,
  getExactActiveBandId,
  formatCurriculumProgressRequirement,
  markFirstRunIntroSeen,
  normalizeDiscoveryRate,
  notifySettingsRefresh,
  parseProficiencySeed,
  saveSettingsState,
  saveLearningProfile,
  CURRICULUM_BAND_OPTIONS,
  type SettingsState,
  type SiteSettingsMap,
  type VocabStats,
  type CheckpointEligibilityPreview,
  type ProficiencySeed,
  type CurriculumDiagnostics,
  type ActivePageDiagnostics,
  type StoredSiteSetting
} from "../app-state/settings-state";
import {
  DIAGNOSTICS_ENABLED,
  EXTENSION_BUILD_PROFILE
} from "../build-profile";

const EMPTY_STATS: VocabStats = {
  total: 0,
  newCount: 0,
  learning: 0,
  known: 0,
  ignored: 0
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

type OptionsTab = "general" | "translation" | "advanced";

export function OptionsApp() {
  const [settingsState, setSettingsState] = useState<SettingsState | null>(null);
  const [vocabStats, setVocabStats] = useState<VocabStats>(EMPTY_STATS);
  const [siteSettings, setSiteSettings] = useState<SiteSettingsMap>({});
  const [checkpointPreview, setCheckpointPreview] =
    useState<CheckpointEligibilityPreview>(EMPTY_CHECKPOINT_PREVIEW);
  const showAdvancedTab = shouldShowAdvancedTab();
  const [curriculumDiagnostics, setCurriculumDiagnostics] =
    useState<CurriculumDiagnostics | null>(null);
  const [activePageDiagnostics, setActivePageDiagnostics] =
    useState<ActivePageDiagnostics | null>(null);
  const [activeTab, setActiveTab] = useState<OptionsTab>(
    showAdvancedTab ? "advanced" : "general"
  );
  const [showFirstRunIntro, setShowFirstRunIntro] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGraduatingCheckpoint, setIsGraduatingCheckpoint] = useState(false);
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
        loadedCheckpointPreview,
        loadedFirstRunIntroVisible,
        loadedCurriculumDiagnostics,
        loadedActivePageDiagnostics
      ] =
        await Promise.all([
          loadSettingsState(),
          loadVocabStats(),
          loadSiteSettingsMap(),
          loadCheckpointEligibilityPreview(),
          loadFirstRunIntroVisible(),
          loadCurriculumDiagnostics(),
          showAdvancedTab ? loadActivePageDiagnostics() : Promise.resolve(null)
        ]);

      setSettingsState(loadedSettings);
      setVocabStats(loadedVocabStats);
      setSiteSettings(loadedSiteSettings);
      setCheckpointPreview(loadedCheckpointPreview);
      setShowFirstRunIntro(loadedFirstRunIntroVisible);
      setCurriculumDiagnostics(loadedCurriculumDiagnostics);
      setActivePageDiagnostics(loadedActivePageDiagnostics);
    } catch {
      setErrorMessage("Could not load extension settings.");
    } finally {
      setIsLoading(false);
    }
  }, [showAdvancedTab]);

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
    const proficiencySeed = parseProficiencySeed(nextSeed);
    const profile = createLearningProfileForProficiencySeed(proficiencySeed);
    setSettingsState((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        proficiencySeed
      };
    });
    setCurriculumDiagnostics((current) =>
      createCurriculumDiagnosticsForProfile(
        profile,
        current?.lastProgressionDecision ?? null
      )
    );
    setStatusMessage(null);
    setErrorMessage(null);
  }, []);

  const handleExactBandChange = useCallback((bandId: string) => {
    const profile = createLearningProfileForBand(bandId);
    setCurriculumDiagnostics((current) =>
      createCurriculumDiagnosticsForProfile(
        profile,
        current?.lastProgressionDecision ?? null
      )
    );
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
        languagePair: settingsState.settings.languagePair,
        sourceLanguage: settingsState.settings.sourceLanguage,
        targetLanguage: settingsState.settings.targetLanguage,
        discoveryRate: normalizeDiscoveryRate(settingsState.settings.discoveryRate),
        sentenceTranslationEnabled:
          settingsState.settings.provider === "openai"
            ? settingsState.settings.sentenceTranslationEnabled && providerKeyValid
            : false
      }
    };

    setIsSaving(true);

    try {
      const profileToPersist =
        curriculumDiagnostics?.profile ??
        createLearningProfileForProficiencySeed(normalizedState.proficiencySeed);
      const savedState = await saveSettingsState(normalizedState);
      await saveLearningProfile(profileToPersist);
      setSettingsState(savedState);
      setCurriculumDiagnostics((current) =>
        createCurriculumDiagnosticsForProfile(
          profileToPersist,
          current?.lastProgressionDecision ?? null
        )
      );
      await notifySettingsRefresh();
      setStatusMessage("Settings saved.");
    } catch {
      setErrorMessage("Unable to save settings. Try again.");
    } finally {
      setIsSaving(false);
    }
  }, [curriculumDiagnostics?.profile, settingsState]);

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

  const handleCheckpointGraduation = useCallback(async () => {
    setStatusMessage(null);
    setErrorMessage(null);
    setIsGraduatingCheckpoint(true);

    try {
      const result = await graduateCheckpoint();
      if (!result.advanced) {
        await loadState();
        setErrorMessage(formatCheckpointGraduationBlock(result));
        return;
      }

      await loadState();
      setStatusMessage(
        `Reading band widened to ${result.nextBandId ?? "the next band"}.`
      );
    } catch {
      setErrorMessage("Unable to widen the reading band right now. Try again.");
    } finally {
      setIsGraduatingCheckpoint(false);
    }
  }, [loadState]);

  const handleDismissFirstRunIntro = useCallback(async () => {
    setShowFirstRunIntro(false);
    await markFirstRunIntroSeen();
  }, []);

  useEffect(() => {
    if (!showAdvancedTab && activeTab === "advanced") {
      setActiveTab("general");
    }
  }, [activeTab, showAdvancedTab]);

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
  const translationSummary = getTranslationSummary({
    provider: settingsState?.settings.provider ?? "none",
    sentenceTranslationEnabled: Boolean(settingsState?.settings.sentenceTranslationEnabled),
    providerKeyValid
  });
  const checkpointStatus = getCheckpointStatus(checkpointPreview);
  const advancedDiagnostics = createAdvancedDiagnostics({
    vocabStats,
    siteEntries,
    activePageDiagnostics,
    curriculumDiagnostics
  });

  return (
    <ExtensionOptions
      chromeFrame={false}
      activeSection={toUiOptionsSection(activeTab)}
      showAdvanced={showAdvancedTab}
      firstRunIntro={showFirstRunIntro}
      statusMessage={statusMessage}
      errorMessage={errorMessage}
      isSaving={isSaving}
      isLoading={isLoading}
      discoveryRatePercent={discoveryRatePercent}
      readingLevel={toUiReadingLevel(settingsState?.proficiencySeed)}
      stats={{
        comfortable: formatCount(vocabStats.known),
        practice: formatCount(vocabStats.learning),
        newCount: formatCount(vocabStats.newCount),
        total: formatCount(vocabStats.total)
      }}
      checkpoint={{
        currentBand: checkpointPreview.activeBandLabel ?? "Starting",
        nextBand: checkpointPreview.nextBandLabel ?? "Next band",
        progressValue: estimateCheckpointProgress(checkpointPreview),
        progressLabel: `${formatCount(countPublicSignalsLeft(checkpointPreview))} reading signal${countPublicSignalsLeft(checkpointPreview) === 1 ? "" : "s"} left`,
        description: checkpointStatus.description,
        canWiden: checkpointPreview.checkpointIsOnlyBlocker,
        isWidening: isGraduatingCheckpoint,
        onWiden: () => {
          void handleCheckpointGraduation();
        }
      }}
      currentFocus={curriculumDiagnostics?.currentFocus ?? null}
      learningPath={curriculumDiagnostics?.path ?? []}
      sentenceHelpEnabled={Boolean(settingsState?.settings.sentenceTranslationEnabled)}
      provider={settingsState?.settings.provider ?? "none"}
      apiKey={settingsState?.providerApiKey ?? ""}
      apiKeyValid={providerKeyValid}
      showApiKey={showApiKey}
      translationSummary={translationSummary.description}
      savedSiteCount={formatCount(siteEntries.length)}
      pausedSiteCount={formatCount(disabledSiteCount)}
      advancedDiagnostics={advancedDiagnostics}
      exactActiveBandId={getExactActiveBandId(curriculumDiagnostics?.profile)}
      bandOptions={CURRICULUM_BAND_OPTIONS}
      siteSummary={
        siteEntries.length > 0
          ? `Recent site choices: ${siteEntries.slice(0, 3).map((entry) => entry.hostname).join(", ")}.`
          : "No site-specific overrides yet."
      }
      onSectionChange={(section) => {
        setActiveTab(toLocalOptionsTab(section));
      }}
      onSave={() => {
        void handleSave();
      }}
      onReload={() => {
        void loadState();
      }}
      onDismissIntro={() => {
        void handleDismissFirstRunIntro();
      }}
      onDiscoveryRateChange={handleDiscoveryRateChange}
      onReadingLevelChange={(level) => {
        handleProficiencySeedChange(toProficiencySeed(level));
      }}
      onExactBandChange={handleExactBandChange}
      onSentenceHelpChange={handleSentenceTranslationChange}
      onProviderChange={handleProviderChange}
      onApiKeyChange={handleApiKeyChange}
      onToggleApiKeyVisibility={() => {
        setShowApiKey((current) => !current);
      }}
      onClearApiKey={handleClearApiKey}
    />
  );
}

function formatCount(value: number): string {
  return value.toLocaleString();
}

function toUiOptionsSection(tab: OptionsTab): OptionsSection {
  if (tab === "translation") {
    return "Translation";
  }

  if (tab === "advanced") {
    return "Advanced";
  }

  return "General";
}

function toLocalOptionsTab(section: OptionsSection): OptionsTab {
  if (section === "Translation") {
    return "translation";
  }

  if (section === "Advanced") {
    return "advanced";
  }

  return "general";
}

function toUiReadingLevel(seed: ProficiencySeed | undefined) {
  if (seed === "intermediate") {
    return "Intermediate";
  }

  if (seed === "beginner") {
    return "Beginner";
  }

  return "False beginner";
}

function toProficiencySeed(
  level: "Beginner" | "False beginner" | "Intermediate"
): ProficiencySeed {
  if (level === "Intermediate") {
    return "intermediate";
  }

  if (level === "Beginner") {
    return "beginner";
  }

  return "false-beginner";
}

function estimateCheckpointProgress(preview: CheckpointEligibilityPreview): number {
  if (!preview.activeBandId) {
    return 0;
  }

  return Math.max(12, Math.min(100, 100 - countPublicSignalsLeft(preview) * 20));
}

function countPublicSignalsLeft(preview: CheckpointEligibilityPreview): number {
  return preview.unmetRequirements.filter(
    (requirement) => requirement !== "checkpoint"
  ).length;
}

function getCheckpointStatus(preview: CheckpointEligibilityPreview): {
  badgeClass: string;
  badgeLabel: string;
  description: string;
} {
  if (!preview.activeBandId) {
    return {
      badgeClass: "badge-soft badge-soft--off",
      badgeLabel: "Unavailable",
      description: "Reading progress will appear after your starting level is loaded."
    };
  }

  if (preview.checkpointIsOnlyBlocker) {
    const scope = formatCheckpointScope(preview.checkpointScopeLabels);
    return {
      badgeClass: "status-badge status-badge--warning",
      badgeLabel: "Ready",
      description: `You have enough local reading evidence for ${preview.nextBandLabel ?? preview.nextBandId ?? "the next band"}. The readiness check covers ${scope}.`
    };
  }

  if (preview.unmetRequirements.length > 0) {
    const blockers = preview.unmetRequirements
      .filter((requirement) => requirement !== "checkpoint")
      .map(formatCurriculumProgressRequirement)
      .join(", ");
    return {
      badgeClass: "badge-soft badge-soft--off",
      badgeLabel: "Building",
      description: blockers
        ? `Keep reading to build ${blockers}; the next level unlocks after those signals are met.`
        : "Keep reading to gather the signals needed for the next level."
    };
  }

  if (preview.nextBandId) {
    return {
      badgeClass: "badge-soft badge-soft--on",
      badgeLabel: "Open",
      description: `Nothing is blocking ${preview.nextBandLabel ?? preview.nextBandId} right now.`
    };
  }

  return {
    badgeClass: "badge-soft badge-soft--on",
    badgeLabel: "Complete",
    description: "There is no next curriculum band to unlock right now."
  };
}

function formatCheckpointScope(labels: readonly string[]): string {
  if (labels.length === 0) {
    return "words, phrases, grammar recognition, and sentence comprehension";
  }

  return labels.slice(0, 4).join(", ");
}

function formatCheckpointGraduationBlock(input: {
  reason: string;
  unmetRequirements: readonly string[];
}): string {
  if (input.unmetRequirements.length > 0) {
    return `The next reading band is still waiting on ${input.unmetRequirements.map(formatCurriculumProgressRequirement).join(", ")}.`;
  }

  if (input.reason === "no-checkpoint-boundary") {
    return "There is no manual reading-band step right now.";
  }

  if (input.reason === "no-next-band") {
    return "There is no next curriculum band available right now.";
  }

  return "Reading-band widening is not available yet.";
}

function shouldShowAdvancedTab(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return shouldShowAdvancedTabForLocation({
    diagnosticsEnabled: DIAGNOSTICS_ENABLED,
    hash: window.location.hash,
    search: window.location.search
  });
}

export function shouldShowAdvancedTabForLocation(input: {
  diagnosticsEnabled: boolean;
  hash: string;
  search: string;
}): boolean {
  if (!input.diagnosticsEnabled) {
    return false;
  }

  const params = new URLSearchParams(input.search);
  return (
    input.hash === "#advanced" ||
    params.get("debug") === "1" ||
    params.get("advanced") === "1"
  );
}

function createAdvancedDiagnostics(input: {
  vocabStats: VocabStats;
  siteEntries: StoredSiteSetting[];
  activePageDiagnostics: ActivePageDiagnostics | null;
  curriculumDiagnostics: CurriculumDiagnostics | null;
}): OptionsAdvancedDiagnostics | null {
  if (!DIAGNOSTICS_ENABLED) {
    return null;
  }

  const page = input.activePageDiagnostics?.diagnostics ?? null;
  const activeContent = input.curriculumDiagnostics?.activeContent ?? null;
  const progression =
    input.curriculumDiagnostics?.lastProgressionDecision ?? null;
  const pausedSiteCount = input.siteEntries.filter((entry) => !entry.enabled).length;

  return {
    buildProfile: EXTENSION_BUILD_PROFILE,
    diagnosticsEnabled: DIAGNOSTICS_ENABLED,
    activePageMessage:
      input.activePageDiagnostics?.message ??
      "Open a supported page, then reload diagnostics.",
    activePageUrl: input.activePageDiagnostics?.url ?? page?.pageUrl ?? null,
    activePageUpdatedAt: page?.updatedAt ?? null,
    activePageMetrics: page
      ? [
          { label: "Injected words", value: page.injectedTokens },
          { label: "Injected phrases", value: page.injectedPhrases },
          { label: "Context skips", value: page.contextSkippedTokens },
          { label: "Sentence candidates", value: page.sentenceCandidatesQueued },
          { label: "Sentence notes", value: page.sentenceNotesVisible },
          {
            label: "Decision samples",
            value: page.tokenDecisionSamples.length + page.phraseDecisionSamples.length
          }
        ]
      : [],
    curriculumSummary: activeContent
      ? `${activeContent.bandLabel} (${activeContent.bandId}) using ${input.curriculumDiagnostics?.profile.activeVocabularyBandId ?? "default"} vocabulary band.`
      : "Default curriculum profile is active.",
    progressionSummary: progression
      ? `${progression.reason}; next ${progression.nextBandId ?? "none"}; unmet ${progression.unmetRequirements.length}.`
      : "No progression decision recorded.",
    storageMetrics: [
      { label: "Vocab records", value: input.vocabStats.total },
      { label: "Known", value: input.vocabStats.known },
      { label: "Learning", value: input.vocabStats.learning },
      { label: "Site choices", value: input.siteEntries.length },
      { label: "Paused sites", value: pausedSiteCount }
    ]
  };
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
