export type PopupState = "supported" | "unsupported";
export type SiteControlState = "on" | "paused";
export type ArticleState = "supported" | "word" | "phrase" | "sentence";
export type OptionsSection =
  | "Overview"
  | "Reading"
  | "Curriculum"
  | "Sites"
  | "Translation"
  | "Support"
  | "Advanced";
export type ReadingLevel = "Beginner" | "False beginner" | "Intermediate";
export type SupportIssueCategory =
  | "bug"
  | "quality"
  | "translation"
  | "page-compatibility"
  | "other";
export type TtsVoiceId =
  | "es_ES-davefx-medium"
  | "es_ES-carlfm-x_low"
  | "es_AR-daniela-high"
  | "es_MX-claude-high"
  | "es_ES-sharvard-medium-m"
  | "es_ES-sharvard-medium-f";
export type TtsFallbackBehavior =
  | "piper-with-system-fallback"
  | "piper-only"
  | "system-only";
export type TtsPlaybackRateSettings = {
  word: number;
  phrase: number;
  sentence: number;
};

export type MetricIconName =
  | "band"
  | "book"
  | "check"
  | "chevron"
  | "close"
  | "document"
  | "eyeOff"
  | "gear"
  | "info"
  | "link"
  | "lock"
  | "message"
  | "pause"
  | "power"
  | "shield"
  | "spark"
  | "terminal"
  | "translate"
  | "volume";

export const settingsTabs: OptionsSection[] = [
  "Overview",
  "Reading",
  "Curriculum",
  "Sites",
  "Translation",
  "Support",
  "Advanced"
];

export type PopupMetric = {
  label: string;
  value: string | number;
  icon?: MetricIconName;
};

export type PopupLearningStats = {
  comfortable: number;
  practice: number;
  newCount: number;
  ignored?: number;
  total: number;
};

export type PopupLearningDayStats = PopupLearningStats & {
  date?: string;
  label: string;
};

export type OptionsStats = {
  comfortable: string | number;
  practice: string | number;
  newCount: string | number;
  total: string | number;
};

export type OptionsCheckpoint = {
  currentBand: string;
  nextBand: string;
  progressValue: number;
  progressLabel: string;
  description: string;
  canWiden: boolean;
  isWidening?: boolean;
  onWiden?: () => void;
};

export type OptionsCurrentFocus = {
  levelLabel: string;
  bandLabel: string;
  learnerTitle: string;
  shortGoal: string;
  wordFocusLabels: readonly string[];
  wordExampleLabels?: readonly string[];
  allowedPartOfSpeechPolicy?: string;
  wordPatternLabels: readonly string[];
  phraseFocusExamples: readonly string[];
  grammarFocusLabels: readonly string[];
  sentenceFocusLabel: string;
  nextFocusPreview: string;
};

export type OptionsLearningPathBand = {
  bandId: string;
  bandLabel: string;
  learnerTitle: string;
  learnerSummary: string;
  active: boolean;
  unlocked: boolean;
};

export type OptionsLearningPathLevel = {
  levelId: string;
  levelLabel: string;
  active: boolean;
  unlocked: boolean;
  stageSummary: string;
  vocabularySummary: string;
  phraseSummary: string;
  grammarSummary: string;
  sentenceSummary: string;
  checkpointSummary: string;
  bands: readonly OptionsLearningPathBand[];
};

export type OptionsAdvancedDiagnosticsMetric = {
  label: string;
  value: string | number;
};

export type OptionsAdvancedDiagnostics = {
  buildProfile: string;
  diagnosticsEnabled: boolean;
  activePageMessage: string;
  activePageUrl?: string | null;
  activePageUpdatedAt?: string | null;
  activePageMetrics: OptionsAdvancedDiagnosticsMetric[];
  curriculumSummary: string;
  progressionSummary: string;
  storageMetrics: OptionsAdvancedDiagnosticsMetric[];
};

export type OptionsBandOption = {
  id: string;
  label: string;
};

export type ExtensionOptionsProps = {
  initialSection?: OptionsSection;
  activeSection?: OptionsSection;
  chromeFrame?: boolean;
  showAdvanced?: boolean;
  firstRunIntro?: boolean;
  statusMessage?: string | null;
  errorMessage?: string | null;
  isSaving?: boolean;
  isLoading?: boolean;
  discoveryRatePercent?: number;
  readingLevel?: ReadingLevel;
  stats?: OptionsStats;
  checkpoint?: OptionsCheckpoint;
  currentFocus?: OptionsCurrentFocus | null;
  learningPath?: readonly OptionsLearningPathLevel[];
  sentenceHelpEnabled?: boolean;
  provider?: "none" | "openai";
  apiKey?: string;
  apiKeyValid?: boolean;
  showApiKey?: boolean;
  translationSummary?: string;
  ttsVoiceId?: TtsVoiceId;
  ttsFallbackBehavior?: TtsFallbackBehavior;
  ttsPlaybackRates?: TtsPlaybackRateSettings;
  siteSummary?: string;
  pausedSiteCount?: string | number;
  savedSiteCount?: string | number;
  advancedDiagnostics?: OptionsAdvancedDiagnostics | null;
  exactActiveBandId?: string | null;
  bandOptions?: readonly OptionsBandOption[];
  supportCategory?: SupportIssueCategory;
  supportDescription?: string;
  supportIncludeExcerpts?: boolean;
  supportStatusMessage?: string | null;
  supportErrorMessage?: string | null;
  isGeneratingSupportReport?: boolean;
  onSectionChange?: (section: OptionsSection) => void;
  onSave?: () => void;
  onReload?: () => void;
  onDismissIntro?: () => void;
  onDiscoveryRateChange?: (percent: number) => void;
  onReadingLevelChange?: (level: ReadingLevel) => void;
  onExactBandChange?: (bandId: string) => void;
  onSentenceHelpChange?: (enabled: boolean) => void;
  onProviderChange?: (provider: "none" | "openai") => void;
  onApiKeyChange?: (apiKey: string) => void;
  onToggleApiKeyVisibility?: () => void;
  onClearApiKey?: () => void;
  onTtsVoiceChange?: (voiceId: TtsVoiceId) => void;
  onTtsFallbackBehaviorChange?: (behavior: TtsFallbackBehavior) => void;
  onTtsPlaybackRateChange?: (
    surface: keyof TtsPlaybackRateSettings,
    rate: number
  ) => void;
  onSupportCategoryChange?: (category: SupportIssueCategory) => void;
  onSupportDescriptionChange?: (description: string) => void;
  onSupportIncludeExcerptsChange?: (include: boolean) => void;
  onDownloadSupportReport?: () => void;
  onCopySupportSummary?: () => void;
};

export type ExtensionPopupProps = {
  state?: PopupState;
  siteState?: SiteControlState;
  initialSiteState?: SiteControlState;
  chromeFrame?: boolean;
  title?: string;
  url?: string;
  bandTitle?: string;
  bandSubtitle?: string;
  progressValue?: number;
  progressLabel?: string;
  progressDetail?: string;
  metrics?: PopupMetric[];
  learningStats?: PopupLearningStats;
  learningDays?: readonly PopupLearningDayStats[];
  unsupportedMessage?: string;
  firstRunIntro?: boolean;
  errorMessage?: string | null;
  isSavingSite?: boolean;
  debugAvailable?: boolean;
  onSiteToggle?: () => void;
  onOpenSettings?: () => void;
  onOpenDebug?: () => void;
  onReportIssue?: () => void;
  onDismissIntro?: () => void;
};
