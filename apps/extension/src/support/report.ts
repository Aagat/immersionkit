import type { TtsPlaybackRateSettings } from "@immersionkit/shared";

export const SUPPORT_CONTEXT_MESSAGE_TYPE =
  "immersionkit/content/get-support-context";

const SUPPORT_REPORT_SCHEMA_VERSION = "immersionkit-support-report-v1";

const SUPPORT_EXCERPT_LIMIT = 8;
const SUPPORT_TEXT_FIELD_LIMIT = 2_000;
const SUPPORT_EXCERPT_TEXT_LIMIT = 240;

export type SupportIssueCategory =
  | "bug"
  | "quality"
  | "translation"
  | "page-compatibility"
  | "other";

export type SupportContextMessage = {
  type: typeof SUPPORT_CONTEXT_MESSAGE_TYPE;
  includeExcerpts?: boolean;
};

export type SupportReplacementExcerpt = {
  unitKind: "word" | "phrase" | "unknown";
  sourceText: string | null;
  targetText: string | null;
  sentenceExcerpt: string | null;
};

export type SupportRenderCounts = {
  processedTextNodes: number;
  injectedTokens: number;
  injectedPhrases: number;
  rejectedPhrases: number;
  sentenceCandidatesSeen: number;
  sentenceCandidatesQueued: number;
  sentenceNotesRendered: number;
  sentenceNotesVisible: number;
  contextSkippedTokens: number;
  analysisSuppressedTokens: number;
};

export type ContentSupportContextSnapshot = {
  pageUrl: string;
  pageHostname: string;
  pagePathname: string;
  siteEnabled: boolean;
  sentenceTranslationEnabled: boolean;
  renderCounts: SupportRenderCounts;
  replacementExcerpts: SupportReplacementExcerpt[];
  excerptsIncluded: boolean;
  updatedAt: string;
};

export type SupportExtensionSnapshot = {
  version: string;
  buildProfile: string;
};

export type SupportBrowserSnapshot = {
  userAgent: string;
  language: string;
  platform: string;
};

export type SupportSettingsSnapshot = {
  languagePair: string;
  sourceLanguage: string;
  targetLanguage: string;
  discoveryRate: number;
  proficiencySeed: string;
  provider: string;
  sentenceTranslationEnabled: boolean;
  ttsVoiceId: string;
  ttsFallbackBehavior: string;
  ttsPlaybackRates: TtsPlaybackRateSettings | null;
  hasProviderApiKey: boolean;
};

export type SupportProgressSnapshot = {
  vocabTotal: number;
  newCount: number;
  learning: number;
  known: number;
  ignored: number;
  activeBandId: string | null;
  activeBandLabel: string | null;
  nextBandId: string | null;
  nextBandLabel: string | null;
  unmetRequirementCount: number;
};

export type SupportSitesSnapshot = {
  savedSiteCount: number;
  pausedSiteCount: number;
  currentHostname: string | null;
  currentSiteEnabled: boolean | null;
};

export type SupportReportBundleV1 = {
  schemaVersion: typeof SUPPORT_REPORT_SCHEMA_VERSION;
  generatedAt: string;
  issue: {
    category: SupportIssueCategory;
    description: string;
  };
  extension: SupportExtensionSnapshot;
  browser: SupportBrowserSnapshot;
  activePage: {
    url: string | null;
    hostname: string | null;
    isSupportedPage: boolean;
    supportMessage: string;
    siteEnabled: boolean | null;
    sentenceTranslationEnabled: boolean | null;
    renderCounts: SupportRenderCounts | null;
    excerptsIncluded: boolean;
    replacementExcerpts: SupportReplacementExcerpt[];
  };
  settings: SupportSettingsSnapshot;
  progress: SupportProgressSnapshot;
  sites: SupportSitesSnapshot;
};

export type CreateSupportReportBundleInput = {
  generatedAt?: string;
  issueCategory: SupportIssueCategory;
  issueDescription: string;
  extension: SupportExtensionSnapshot;
  browser: SupportBrowserSnapshot;
  activePageUrl: string | null;
  activePageHostname: string | null;
  activePageSupported: boolean;
  activePageSupportMessage: string;
  contentContext: ContentSupportContextSnapshot | null;
  settings: SupportSettingsSnapshot;
  progress: SupportProgressSnapshot;
  sites: SupportSitesSnapshot;
};

export function isSupportContextMessage(
  message: unknown
): message is SupportContextMessage {
  return (
    Boolean(message) &&
    typeof message === "object" &&
    !Array.isArray(message) &&
    (message as { type?: unknown }).type === SUPPORT_CONTEXT_MESSAGE_TYPE
  );
}

export function createSupportReportBundle(
  input: CreateSupportReportBundleInput
): SupportReportBundleV1 {
  const contentContext = input.contentContext;
  const activePageUrl = contentContext?.pageUrl ?? input.activePageUrl;
  const activePageHostname =
    contentContext?.pageHostname ?? input.activePageHostname;

  return {
    schemaVersion: SUPPORT_REPORT_SCHEMA_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    issue: {
      category: input.issueCategory,
      description: sanitizeSupportText(input.issueDescription, SUPPORT_TEXT_FIELD_LIMIT)
    },
    extension: input.extension,
    browser: input.browser,
    activePage: {
      url: redactUrl(activePageUrl),
      hostname: sanitizeHostname(activePageHostname),
      isSupportedPage: input.activePageSupported,
      supportMessage: sanitizeSupportText(
        input.activePageSupportMessage,
        SUPPORT_TEXT_FIELD_LIMIT
      ),
      siteEnabled: contentContext?.siteEnabled ?? input.sites.currentSiteEnabled,
      sentenceTranslationEnabled:
        contentContext?.sentenceTranslationEnabled ??
        input.settings.sentenceTranslationEnabled,
      renderCounts: contentContext?.renderCounts ?? null,
      excerptsIncluded: Boolean(contentContext?.excerptsIncluded),
      replacementExcerpts: contentContext?.excerptsIncluded
        ? sanitizeReplacementExcerpts(contentContext.replacementExcerpts)
        : []
    },
    settings: {
      ...input.settings,
      ttsPlaybackRates: input.settings.ttsPlaybackRates
        ? { ...input.settings.ttsPlaybackRates }
        : null
    },
    progress: input.progress,
    sites: input.sites
  };
}

export function createSupportSettingsSnapshot(input: {
  settings: {
    languagePair: string;
    sourceLanguage: string;
    targetLanguage: string;
    discoveryRate: number;
    provider: string;
    sentenceTranslationEnabled: boolean;
    ttsVoiceId: string;
    ttsFallbackBehavior: string;
    ttsPlaybackRates?: TtsPlaybackRateSettings;
  };
  proficiencySeed: string;
  providerApiKey: string;
}): SupportSettingsSnapshot {
  return {
    languagePair: input.settings.languagePair,
    sourceLanguage: input.settings.sourceLanguage,
    targetLanguage: input.settings.targetLanguage,
    discoveryRate: input.settings.discoveryRate,
    proficiencySeed: input.proficiencySeed,
    provider: input.settings.provider,
    sentenceTranslationEnabled: input.settings.sentenceTranslationEnabled,
    ttsVoiceId: input.settings.ttsVoiceId,
    ttsFallbackBehavior: input.settings.ttsFallbackBehavior,
    ttsPlaybackRates: input.settings.ttsPlaybackRates
      ? { ...input.settings.ttsPlaybackRates }
      : null,
    hasProviderApiKey: input.providerApiKey.trim().length > 0
  };
}

export function createSupportSummary(bundle: SupportReportBundleV1): string {
  const counts = bundle.activePage.renderCounts;
  const countSummary = counts
    ? `${counts.injectedTokens} words, ${counts.injectedPhrases} phrases, ${counts.sentenceNotesVisible} sentence notes`
    : "no active-page counts";
  const description = bundle.issue.description
    ? `\nDescription: ${bundle.issue.description}`
    : "";

  return [
    "ImmersionKit support report",
    `Generated: ${bundle.generatedAt}`,
    `Issue: ${formatSupportIssueCategory(bundle.issue.category)}`,
    `Extension: ${bundle.extension.version} (${bundle.extension.buildProfile})`,
    `Page: ${bundle.activePage.url ?? "not available"}`,
    `Status: ${bundle.activePage.supportMessage}`,
    `Counts: ${countSummary}`,
    `Excerpts included: ${bundle.activePage.excerptsIncluded ? "yes" : "no"}${description}`
  ].join("\n");
}

export function createSupportReportFileName(bundle: SupportReportBundleV1): string {
  const timestamp = bundle.generatedAt
    .replace(/[:.]/g, "-")
    .replace(/[^0-9A-Za-z-]/g, "_");
  return `immersionkit-support-report-${timestamp}.json`;
}

export function redactUrl(input: string | null | undefined): string | null {
  if (!input) {
    return null;
  }

  try {
    const parsed = new URL(input);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
    }

    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return null;
  }
}

function sanitizeReplacementExcerpts(
  excerpts: readonly SupportReplacementExcerpt[]
): SupportReplacementExcerpt[] {
  return excerpts.slice(0, SUPPORT_EXCERPT_LIMIT).map((excerpt) => ({
    unitKind:
      excerpt.unitKind === "word" || excerpt.unitKind === "phrase"
        ? excerpt.unitKind
        : "unknown",
    sourceText: sanitizeOptionalSupportText(
      excerpt.sourceText,
      SUPPORT_EXCERPT_TEXT_LIMIT
    ),
    targetText: sanitizeOptionalSupportText(
      excerpt.targetText,
      SUPPORT_EXCERPT_TEXT_LIMIT
    ),
    sentenceExcerpt: sanitizeOptionalSupportText(
      excerpt.sentenceExcerpt,
      SUPPORT_EXCERPT_TEXT_LIMIT
    )
  }));
}

function formatSupportIssueCategory(category: SupportIssueCategory): string {
  if (category === "quality") {
    return "Quality issue";
  }

  if (category === "translation") {
    return "Incorrect translation";
  }

  if (category === "page-compatibility") {
    return "Page compatibility";
  }

  if (category === "other") {
    return "Other";
  }

  return "Bug";
}

function sanitizeHostname(input: string | null | undefined): string | null {
  const sanitized = sanitizeOptionalSupportText(input, 255);
  return sanitized || null;
}

function sanitizeOptionalSupportText(
  input: string | null | undefined,
  maxLength: number
): string | null {
  if (input === null || input === undefined) {
    return null;
  }

  const sanitized = sanitizeSupportText(input, maxLength);
  return sanitized.length > 0 ? sanitized : null;
}

function sanitizeSupportText(input: string, maxLength: number): string {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}
