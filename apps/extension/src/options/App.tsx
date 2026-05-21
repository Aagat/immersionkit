import { useCallback, useEffect, useState } from "react";
import {
  ExtensionOptions,
  type OptionsAdvancedDiagnostics,
  type OptionsSection
} from "@immersionkit/ui";
import {
  RuntimeMessageType,
  clampTtsPlaybackRate,
  type PreviewAccountState as RuntimePreviewAccountState,
  type ProviderName,
  type TtsFallbackBehavior,
  type TtsPlaybackRateSettings,
  type TtsVoiceId
} from "@immersionkit/shared";
import {
  loadActivePageDiagnostics,
  loadActivePageSupportContext,
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
  ACCOUNT_REQUIRED,
  DIAGNOSTICS_ENABLED,
  EXTENSION_BUILD_PROFILE
} from "../build-profile";
import {
  createSupportReportBundle,
  createSupportReportFileName,
  createSupportSettingsSnapshot,
  createSupportSummary,
  type SupportIssueCategory,
  type SupportReportBundleV1
} from "../support/report";
import { sendRuntimeMessage } from "../runtime-client";

const EMPTY_STATS: VocabStats = {
  total: 0,
  newCount: 0,
  learning: 0,
  known: 0,
  ignored: 0,
  daily: []
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

type OptionsTab =
  | "overview"
  | "reading"
  | "sites"
  | "translation"
  | "support"
  | "advanced";

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
    getInitialOptionsTab(showAdvancedTab)
  );
  const [showFirstRunIntro, setShowFirstRunIntro] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGraduatingCheckpoint, setIsGraduatingCheckpoint] = useState(false);
  const [isGeneratingSupportReport, setIsGeneratingSupportReport] =
    useState(false);
  const [isSubmittingSupportFeedback, setIsSubmittingSupportFeedback] =
    useState(false);
  const [accountState, setAccountState] =
    useState<RuntimePreviewAccountState | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [supportCategory, setSupportCategory] =
    useState<SupportIssueCategory>("bug");
  const [supportDescription, setSupportDescription] = useState("");
  const [supportIncludeExcerpts, setSupportIncludeExcerpts] = useState(false);
  const [supportStatusMessage, setSupportStatusMessage] = useState<string | null>(
    null
  );
  const [supportErrorMessage, setSupportErrorMessage] = useState<string | null>(
    null
  );
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
        loadedActivePageDiagnostics,
        loadedAccountState
      ] =
        await Promise.all([
          loadSettingsState(),
          loadVocabStats(),
          loadSiteSettingsMap(),
          loadCheckpointEligibilityPreview(),
          loadFirstRunIntroVisible(),
          loadCurriculumDiagnostics(),
          showAdvancedTab ? loadActivePageDiagnostics() : Promise.resolve(null),
          loadPreviewAccountState()
        ]);

      setSettingsState(loadedSettings);
      setVocabStats(loadedVocabStats);
      setSiteSettings(loadedSiteSettings);
      setCheckpointPreview(loadedCheckpointPreview);
      setShowFirstRunIntro(loadedFirstRunIntroVisible);
      setCurriculumDiagnostics(loadedCurriculumDiagnostics);
      setActivePageDiagnostics(loadedActivePageDiagnostics);
      setAccountState(loadedAccountState);
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
    if (enabled) {
      void sendRuntimeMessage({
        type: RuntimeMessageType.QueueActivationEvent,
        eventName: "sentence_help_interest",
        properties: {
          surface: "options",
          action: "open"
        }
      });
    }

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

  const handleTtsVoiceChange = useCallback((ttsVoiceId: TtsVoiceId) => {
    setSettingsState((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        settings: {
          ...current.settings,
          ttsVoiceId
        }
      };
    });
    setStatusMessage(null);
    setErrorMessage(null);
  }, []);

  const handleTtsFallbackBehaviorChange = useCallback(
    (ttsFallbackBehavior: TtsFallbackBehavior) => {
      setSettingsState((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          settings: {
            ...current.settings,
            ttsFallbackBehavior
          }
        };
      });
      setStatusMessage(null);
      setErrorMessage(null);
    },
    []
  );

  const handleTtsPlaybackRateChange = useCallback(
    (surface: keyof TtsPlaybackRateSettings, rate: number) => {
      setSettingsState((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          settings: {
            ...current.settings,
            ttsPlaybackRates: {
              ...current.settings.ttsPlaybackRates,
              [surface]: clampTtsPlaybackRate(rate)
            }
          }
        };
      });
      setStatusMessage(null);
      setErrorMessage(null);
    },
    []
  );

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

  const handlePreviewSignIn = useCallback(async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const response = await sendRuntimeMessage({
        type: RuntimeMessageType.StartAccountLogin,
        provider: "google"
      });
      if (!response?.ok) {
        throw new Error(response?.error ?? "preview-sign-in-failed");
      }
      setAccountState(response.state);
      setStatusMessage("Signed in for preview.");
      await loadState();
    } catch {
      setErrorMessage("Could not start Google preview sign-in. Try again.");
    }
  }, [loadState]);

  const handlePreviewLogout = useCallback(async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const response = await sendRuntimeMessage({
        type: RuntimeMessageType.LogoutAccount
      });
      if (!response?.ok) {
        throw new Error(response?.error ?? "preview-logout-failed");
      }
      setAccountState(response.state);
      setStatusMessage("Signed out. Local learning data is still on this device.");
      await loadState();
    } catch {
      setErrorMessage("Could not sign out right now.");
    }
  }, [loadState]);

  const siteEntries = Object.values(siteSettings).sort(
    (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
  );
  const disabledSiteCount = siteEntries.filter((entry) => !entry.enabled).length;

  const createSupportBundle = useCallback(async (): Promise<SupportReportBundleV1> => {
    if (!settingsState) {
      throw new Error("settings-unavailable");
    }

    const activePage = await loadActivePageSupportContext(supportIncludeExcerpts);
    const contentContext = activePage?.context ?? null;
    const activePageUrl = contentContext?.pageUrl ?? activePage?.url ?? null;
    const activePageHostname =
      contentContext?.pageHostname ?? readHostname(activePageUrl);
    const currentSiteSetting = activePageHostname
      ? siteEntries.find((entry) => entry.hostname === activePageHostname) ?? null
      : null;

    return createSupportReportBundle({
      issueCategory: supportCategory,
      issueDescription: supportDescription,
      extension: {
        version: getExtensionVersion(),
        buildProfile: EXTENSION_BUILD_PROFILE
      },
      browser: getBrowserSupportSnapshot(),
      activePageUrl,
      activePageHostname,
      activePageSupported: Boolean(contentContext),
      activePageSupportMessage:
        activePage?.message ??
        "No active supported page was available for this report.",
      contentContext,
      settings: createSupportSettingsSnapshot({
        settings: settingsState.settings,
        proficiencySeed: settingsState.proficiencySeed,
        providerApiKey: settingsState.providerApiKey
      }),
      progress: {
        vocabTotal: vocabStats.total,
        newCount: vocabStats.newCount,
        learning: vocabStats.learning,
        known: vocabStats.known,
        ignored: vocabStats.ignored,
        activeBandId: checkpointPreview.activeBandId,
        activeBandLabel: checkpointPreview.activeBandLabel,
        nextBandId: checkpointPreview.nextBandId,
        nextBandLabel: checkpointPreview.nextBandLabel,
        unmetRequirementCount: checkpointPreview.unmetRequirements.length
      },
      sites: {
        savedSiteCount: siteEntries.length,
        pausedSiteCount: disabledSiteCount,
        currentHostname: activePageHostname,
        currentSiteEnabled: currentSiteSetting?.enabled ?? null
      }
    });
  }, [
    checkpointPreview.activeBandId,
    checkpointPreview.activeBandLabel,
    checkpointPreview.nextBandId,
    checkpointPreview.nextBandLabel,
    checkpointPreview.unmetRequirements.length,
    disabledSiteCount,
    settingsState,
    siteEntries,
    supportCategory,
    supportDescription,
    supportIncludeExcerpts,
    vocabStats.ignored,
    vocabStats.known,
    vocabStats.learning,
    vocabStats.newCount,
    vocabStats.total
  ]);

  const handleDownloadSupportReport = useCallback(async () => {
    setSupportStatusMessage(null);
    setSupportErrorMessage(null);
    setIsGeneratingSupportReport(true);

    try {
      const bundle = await createSupportBundle();
      downloadSupportReportBundle(bundle);
      setSupportStatusMessage("Support report downloaded.");
    } catch {
      setSupportErrorMessage("Unable to create a support report right now.");
    } finally {
      setIsGeneratingSupportReport(false);
    }
  }, [createSupportBundle]);

  const handleCopySupportSummary = useCallback(async () => {
    setSupportStatusMessage(null);
    setSupportErrorMessage(null);
    setIsGeneratingSupportReport(true);

    try {
      const bundle = await createSupportBundle();
      await copyTextToClipboard(createSupportSummary(bundle));
      setSupportStatusMessage("Support summary copied.");
    } catch {
      setSupportErrorMessage("Unable to copy a support summary right now.");
    } finally {
      setIsGeneratingSupportReport(false);
    }
  }, [createSupportBundle]);

  const handleSubmitSupportFeedback = useCallback(async () => {
    setSupportStatusMessage(null);
    setSupportErrorMessage(null);
    setIsSubmittingSupportFeedback(true);

    try {
      const bundle = await createSupportBundle();
      const response = await sendRuntimeMessage({
        type: RuntimeMessageType.SubmitFeedback,
        category: supportCategory,
        description: supportDescription,
        diagnostics: bundle
      });
      if (!response?.ok) {
        throw new Error(response?.error ?? "support-submit-failed");
      }
      setSupportStatusMessage(
        response.submitted
          ? "Feedback sent."
          : "Feedback prepared. Add an API URL to send it from this build."
      );
    } catch {
      setSupportErrorMessage("Unable to send feedback right now.");
    } finally {
      setIsSubmittingSupportFeedback(false);
    }
  }, [createSupportBundle, supportCategory, supportDescription]);

  useEffect(() => {
    if (!showAdvancedTab && activeTab === "advanced") {
      setActiveTab("overview");
    }
  }, [activeTab, showAdvancedTab]);

  const discoveryRatePercent = Math.round(
    (settingsState?.settings.discoveryRate ?? 0) * 100
  );
  const providerKeyValid = settingsState
    ? isProviderKeyValid(settingsState.settings.provider, settingsState.providerApiKey)
    : false;
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
        progressLabel: `${formatCount(countPublicSignalsLeft(checkpointPreview))} reading evidence item${countPublicSignalsLeft(checkpointPreview) === 1 ? "" : "s"} left`,
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
      ttsVoiceId={
        settingsState?.settings.ttsVoiceId ?? "es_ES-sharvard-medium-m"
      }
      ttsFallbackBehavior={
        settingsState?.settings.ttsFallbackBehavior ??
        "piper-with-system-fallback"
      }
      ttsPlaybackRates={settingsState?.settings.ttsPlaybackRates}
      savedSiteCount={formatCount(siteEntries.length)}
      pausedSiteCount={formatCount(disabledSiteCount)}
      advancedDiagnostics={advancedDiagnostics}
      exactActiveBandId={getExactActiveBandId(curriculumDiagnostics?.profile)}
      bandOptions={CURRICULUM_BAND_OPTIONS}
      account={toUiAccountState(accountState)}
      supportCategory={supportCategory}
      supportDescription={supportDescription}
      supportIncludeExcerpts={supportIncludeExcerpts}
      supportStatusMessage={supportStatusMessage}
      supportErrorMessage={supportErrorMessage}
      isGeneratingSupportReport={isGeneratingSupportReport}
      isSubmittingSupportFeedback={isSubmittingSupportFeedback}
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
      onTtsVoiceChange={handleTtsVoiceChange}
      onTtsFallbackBehaviorChange={handleTtsFallbackBehaviorChange}
      onTtsPlaybackRateChange={handleTtsPlaybackRateChange}
      onSupportCategoryChange={(category) => {
        setSupportCategory(category);
        setSupportStatusMessage(null);
        setSupportErrorMessage(null);
      }}
      onSupportDescriptionChange={(description) => {
        setSupportDescription(description);
        setSupportStatusMessage(null);
        setSupportErrorMessage(null);
      }}
      onSupportIncludeExcerptsChange={(include) => {
        setSupportIncludeExcerpts(include);
        setSupportStatusMessage(null);
        setSupportErrorMessage(null);
      }}
      onDownloadSupportReport={() => {
        void handleDownloadSupportReport();
      }}
      onCopySupportSummary={() => {
        void handleCopySupportSummary();
      }}
      onSubmitSupportFeedback={() => {
        void handleSubmitSupportFeedback();
      }}
      onPreviewSignIn={handlePreviewSignIn}
      onPreviewLogout={handlePreviewLogout}
    />
  );
}

async function loadPreviewAccountState(): Promise<RuntimePreviewAccountState | null> {
  const response = await sendRuntimeMessage({
    type: RuntimeMessageType.GetAccountState
  });
  return response?.ok ? response.state : null;
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

function formatCount(value: number): string {
  return value.toLocaleString();
}

function toUiOptionsSection(tab: OptionsTab): OptionsSection {
  if (tab === "reading") {
    return "Reading";
  }

  if (tab === "sites") {
    return "Sites";
  }

  if (tab === "translation") {
    return "Translation";
  }

  if (tab === "support") {
    return "Support";
  }

  if (tab === "advanced") {
    return "Advanced";
  }

  return "Overview";
}

function toLocalOptionsTab(section: OptionsSection): OptionsTab {
  if (section === "Reading") {
    return "reading";
  }

  if (section === "Account") {
    return "overview";
  }

  if (section === "Curriculum") {
    return "reading";
  }

  if (section === "Sites") {
    return "sites";
  }

  if (section === "Translation") {
    return "translation";
  }

  if (section === "Support") {
    return "support";
  }

  if (section === "Advanced") {
    return "advanced";
  }

  return "overview";
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

export function getCheckpointStatus(preview: CheckpointEligibilityPreview): {
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
    return {
      badgeClass: "status-badge status-badge--warning",
      badgeLabel: "Ready",
      description: `You have enough local reading evidence for ${preview.nextBandLabel ?? preview.nextBandId ?? "the next band"}. Widen the reading band when you want the next level.`
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
        ? `Keep reading to build ${blockers}; the reading band widens after that evidence is ready.`
        : "Keep reading to build local reading evidence; the reading band widens after that evidence is ready."
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

function getInitialOptionsTab(showAdvancedTab: boolean): OptionsTab {
  if (typeof window !== "undefined" && window.location.hash === "#account") {
    return "overview";
  }

  if (typeof window !== "undefined" && window.location.hash === "#curriculum") {
    return "reading";
  }

  if (typeof window !== "undefined" && window.location.hash === "#support") {
    return "support";
  }

  return showAdvancedTab ? "advanced" : "overview";
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

function getExtensionVersion(): string {
  if (typeof chrome === "undefined" || !chrome.runtime?.getManifest) {
    return "unknown";
  }

  return chrome.runtime.getManifest().version ?? "unknown";
}

function getBrowserSupportSnapshot() {
  if (typeof navigator === "undefined") {
    return {
      userAgent: "unknown",
      language: "unknown",
      platform: "unknown"
    };
  }

  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform
  };
}

function readHostname(url: string | null): string | null {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

function downloadSupportReportBundle(bundle: SupportReportBundleV1): void {
  if (typeof document === "undefined" || typeof URL === "undefined") {
    throw new Error("download-unavailable");
  }

  const blob = new Blob([`${JSON.stringify(bundle, null, 2)}\n`], {
    type: "application/json"
  });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = createSupportReportFileName(bundle);
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === "undefined") {
    throw new Error("clipboard-unavailable");
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "true");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.append(textArea);
  textArea.select();
  const copied = document.execCommand("copy");
  textArea.remove();

  if (!copied) {
    throw new Error("clipboard-unavailable");
  }
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
