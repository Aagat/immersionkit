import { describe, expect, it } from "vitest";

import {
  createSupportReportBundle,
  createSupportSettingsSnapshot,
  redactUrl,
  type ContentSupportContextSnapshot
} from "../src/support/report";
import { createDefaultDiagnostics } from "../src/content/diagnostics";
import { readContentSupportContext } from "../src/content/support-context";
import { openSupportOptionsPage } from "../src/popup/App";
import { installChromeStub } from "./helpers/chrome-stub";
import { withFixtureDom } from "./helpers/fixture-dom";

const baseSettings = {
  languagePair: "en-es",
  sourceLanguage: "en",
  targetLanguage: "es",
  discoveryRate: 0.08,
  provider: "openai",
  sentenceTranslationEnabled: true,
  ttsVoiceId: "es_ES-sharvard-medium-m",
  ttsFallbackBehavior: "piper-with-system-fallback",
  ttsPlaybackRates: {
    word: 0.8,
    phrase: 1,
    sentence: 1
  }
};

describe("support report", () => {
  it("redacts URL query/hash values and excludes provider API keys", () => {
    const settings = createSupportSettingsSnapshot({
      settings: baseSettings,
      proficiencySeed: "false-beginner",
      providerApiKey: "sk-secret-key-that-must-not-appear"
    });
    const bundle = createSupportReportBundle({
      generatedAt: "2026-05-20T10:00:00.000Z",
      issueCategory: "quality",
      issueDescription: "Bad phrase choice near the first paragraph.",
      extension: {
        version: "0.1.0",
        buildProfile: "production"
      },
      browser: {
        userAgent: "test-agent",
        language: "en-US",
        platform: "MacIntel"
      },
      activePageUrl:
        "https://example.com/article/read?session=secret#private-section",
      activePageHostname: "example.com",
      activePageSupported: true,
      activePageSupportMessage: "Active-page support context loaded.",
      contentContext: null,
      settings,
      progress: {
        vocabTotal: 12,
        newCount: 3,
        learning: 4,
        known: 5,
        ignored: 0,
        activeBandId: "level-1b",
        activeBandLabel: "Level 1B",
        nextBandId: "level-1c",
        nextBandLabel: "Level 1C",
        unmetRequirementCount: 2
      },
      sites: {
        savedSiteCount: 2,
        pausedSiteCount: 1,
        currentHostname: "example.com",
        currentSiteEnabled: true
      }
    });

    expect(bundle.activePage.url).toBe("https://example.com/article/read");
    expect(bundle.settings.hasProviderApiKey).toBe(true);
    expect(JSON.stringify(bundle)).not.toContain("sk-secret");
    expect(JSON.stringify(bundle)).not.toContain("session=secret");
    expect(JSON.stringify(bundle)).not.toContain("private-section");
  });

  it("includes replacement excerpts only when the content context opted in", () => {
    const context = createContentContext({
      excerptsIncluded: false
    });
    const withoutExcerpts = createSupportReportBundle(
      createBundleInput({ context })
    );
    expect(withoutExcerpts.activePage.replacementExcerpts).toEqual([]);
    expect(withoutExcerpts.activePage.excerptsIncluded).toBe(false);

    const withExcerpts = createSupportReportBundle(
      createBundleInput({
        context: createContentContext({
          excerptsIncluded: true
        })
      })
    );
    expect(withExcerpts.activePage.excerptsIncluded).toBe(true);
    expect(withExcerpts.activePage.replacementExcerpts).toEqual([
      {
        unitKind: "phrase",
        sourceText: "right now",
        targetText: "ahora mismo",
        sentenceExcerpt: "We need help right now."
      }
    ]);
  });

  it("collects bounded replacement excerpts without reading full page text", async () => {
    await withFixtureDom(
      "public-preview/news-river-morning.html",
      {
        url: "https://news.example/story?account=secret#billing"
      },
      ({ document }) => {
        document.body.innerHTML = `
          <main>
            <p>Outside private page text should not be collected.</p>
            <p>
              <span
                data-ik-token-id="token-1"
                data-ik-unit-kind="word"
                data-ik-source-token="morning"
                data-ik-target-token="mañana"
                data-ik-sentence="The morning route changed near the river."
              >mañana</span>
            </p>
          </main>
        `;
        const diagnostics = createDefaultDiagnostics();
        diagnostics.injectedTokens = 1;

        const withoutExcerpts = readContentSupportContext(
          {
            diagnostics,
            processing: null
          },
          false
        );
        expect(withoutExcerpts.replacementExcerpts).toEqual([]);

        const withExcerpts = readContentSupportContext(
          {
            diagnostics,
            processing: null
          },
          true
        );
        expect(withExcerpts.pageUrl).toBe(
          "https://news.example/story?account=secret#billing"
        );
        expect(redactUrl(withExcerpts.pageUrl)).toBe("https://news.example/story");
        expect(JSON.stringify(withExcerpts.replacementExcerpts)).toContain("morning");
        expect(JSON.stringify(withExcerpts.replacementExcerpts)).not.toContain(
          "Outside private page text"
        );
      }
    );
  });

  it("opens the support tab from the popup entry point", () => {
    const chromeStub = installChromeStub();

    try {
      openSupportOptionsPage();
      expect(chromeStub.createdTabs).toEqual([
        {
          url: "chrome-extension://test-extension/options.html#support"
        }
      ]);
      expect(chromeStub.openedOptionsPageCount()).toBe(0);
    } finally {
      chromeStub.restore();
    }
  });
});

function createBundleInput({
  context
}: {
  context: ContentSupportContextSnapshot | null;
}): Parameters<typeof createSupportReportBundle>[0] {
  return {
    generatedAt: "2026-05-20T10:00:00.000Z",
    issueCategory: "translation",
    issueDescription: "Wrong translation.",
    extension: {
      version: "0.1.0",
      buildProfile: "production"
    },
    browser: {
      userAgent: "test-agent",
      language: "en-US",
      platform: "MacIntel"
    },
    activePageUrl: "https://example.com/story?secret=1#part",
    activePageHostname: "example.com",
    activePageSupported: true,
    activePageSupportMessage: "Active-page support context loaded.",
    contentContext: context,
    settings: createSupportSettingsSnapshot({
      settings: baseSettings,
      proficiencySeed: "false-beginner",
      providerApiKey: ""
    }),
    progress: {
      vocabTotal: 0,
      newCount: 0,
      learning: 0,
      known: 0,
      ignored: 0,
      activeBandId: null,
      activeBandLabel: null,
      nextBandId: null,
      nextBandLabel: null,
      unmetRequirementCount: 0
    },
    sites: {
      savedSiteCount: 0,
      pausedSiteCount: 0,
      currentHostname: "example.com",
      currentSiteEnabled: true
    }
  };
}

function createContentContext(input: {
  excerptsIncluded: boolean;
}): ContentSupportContextSnapshot {
  return {
    pageUrl: "https://example.com/story?secret=1#part",
    pageHostname: "example.com",
    pagePathname: "/story",
    siteEnabled: true,
    sentenceTranslationEnabled: false,
    renderCounts: {
      processedTextNodes: 2,
      injectedTokens: 1,
      injectedPhrases: 1,
      rejectedPhrases: 0,
      sentenceCandidatesSeen: 1,
      sentenceCandidatesQueued: 1,
      sentenceNotesRendered: 0,
      sentenceNotesVisible: 0,
      contextSkippedTokens: 0,
      analysisSuppressedTokens: 0
    },
    excerptsIncluded: input.excerptsIncluded,
    replacementExcerpts: [
      {
        unitKind: "phrase",
        sourceText: "right now",
        targetText: "ahora mismo",
        sentenceExcerpt: "We need help right now."
      }
    ],
    updatedAt: "2026-05-20T10:00:00.000Z"
  };
}
