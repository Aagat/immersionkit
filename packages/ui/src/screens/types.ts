import type { IconName } from "../components/primitives";

export type PopupState = "supported" | "unsupported";
export type SiteControlState = "on" | "paused";
export type ArticleState = "supported" | "word" | "phrase" | "sentence";
export type OptionsSection = "General" | "Translation" | "Advanced";
export type ReadingLevel = "Beginner" | "False beginner" | "Intermediate";

export const settingsTabs: OptionsSection[] = ["General", "Translation", "Advanced"];

export type PopupMetric = {
  label: string;
  value: string | number;
  icon?: IconName;
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
  sentenceHelpEnabled?: boolean;
  provider?: "none" | "openai";
  apiKey?: string;
  apiKeyValid?: boolean;
  showApiKey?: boolean;
  translationSummary?: string;
  siteSummary?: string;
  pausedSiteCount?: string | number;
  savedSiteCount?: string | number;
  advancedDiagnostics?: OptionsAdvancedDiagnostics | null;
  onSectionChange?: (section: OptionsSection) => void;
  onSave?: () => void;
  onReload?: () => void;
  onDismissIntro?: () => void;
  onDiscoveryRateChange?: (percent: number) => void;
  onReadingLevelChange?: (level: ReadingLevel) => void;
  onSentenceHelpChange?: (enabled: boolean) => void;
  onProviderChange?: (provider: "none" | "openai") => void;
  onApiKeyChange?: (apiKey: string) => void;
  onToggleApiKeyVisibility?: () => void;
  onClearApiKey?: () => void;
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
  localFooterText?: string;
  unsupportedMessage?: string;
  firstRunIntro?: boolean;
  errorMessage?: string | null;
  sentenceHelpSummary?: string;
  isSavingSite?: boolean;
  onSiteToggle?: () => void;
  onOpenSettings?: () => void;
  onAdjustPace?: () => void;
  onDismissIntro?: () => void;
};
