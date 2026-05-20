import type {
  ContentSupportContextSnapshot,
  SupportReplacementExcerpt
} from "../support/report";
import type { ContentDiagnosticsRuntimeState } from "./diagnostics";
import { updateDiagnostics } from "./diagnostics";
import { IMMERSIONKIT_TOKEN_ATTRIBUTE } from "./constants";

const SUPPORT_EXCERPT_LIMIT = 8;
const SUPPORT_EXCERPT_TEXT_LIMIT = 240;

export function readContentSupportContext(
  runtimeState: ContentDiagnosticsRuntimeState,
  includeExcerpts: boolean
): ContentSupportContextSnapshot {
  updateDiagnostics(runtimeState);

  const diagnostics = runtimeState.diagnostics;
  return {
    pageUrl: window.location.href,
    pageHostname: window.location.hostname,
    pagePathname: window.location.pathname,
    siteEnabled: diagnostics.siteEnabled,
    sentenceTranslationEnabled: diagnostics.sentenceTranslationEnabled,
    renderCounts: {
      processedTextNodes: diagnostics.processedTextNodes,
      injectedTokens: diagnostics.injectedTokens,
      injectedPhrases: diagnostics.injectedPhrases,
      rejectedPhrases: diagnostics.rejectedPhrases,
      sentenceCandidatesSeen: diagnostics.sentenceCandidatesSeen,
      sentenceCandidatesQueued: diagnostics.sentenceCandidatesQueued,
      sentenceNotesRendered: diagnostics.sentenceNotesRendered,
      sentenceNotesVisible: diagnostics.sentenceNotesVisible,
      contextSkippedTokens: diagnostics.contextSkippedTokens,
      analysisSuppressedTokens: diagnostics.analysisSuppressedTokens
    },
    replacementExcerpts: includeExcerpts ? collectReplacementExcerpts() : [],
    excerptsIncluded: includeExcerpts,
    updatedAt: new Date().toISOString()
  };
}

function collectReplacementExcerpts(): SupportReplacementExcerpt[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      `[${IMMERSIONKIT_TOKEN_ATTRIBUTE}]`
    )
  )
    .slice(0, SUPPORT_EXCERPT_LIMIT)
    .map((element) => ({
      unitKind: readUnitKind(element.getAttribute("data-ik-unit-kind")),
      sourceText: sanitizeExcerptText(element.getAttribute("data-ik-source-token")),
      targetText: sanitizeExcerptText(element.getAttribute("data-ik-target-token")),
      sentenceExcerpt: sanitizeExcerptText(element.getAttribute("data-ik-sentence"))
    }));
}

function readUnitKind(value: string | null): SupportReplacementExcerpt["unitKind"] {
  if (value === "word" || value === "phrase") {
    return value;
  }

  return "unknown";
}

function sanitizeExcerptText(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  if (normalized.length <= SUPPORT_EXCERPT_TEXT_LIMIT) {
    return normalized;
  }

  return `${normalized.slice(0, SUPPORT_EXCERPT_TEXT_LIMIT).trimEnd()}...`;
}
