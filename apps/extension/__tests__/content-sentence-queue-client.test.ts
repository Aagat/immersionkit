import { RuntimeMessageType } from "@immersionkit/shared";
import { describe, expect, it } from "vitest";

import {
  dedupeSentenceCandidates,
  sendSentenceCandidatesToQueue
} from "../src/content/sentence-queue-client";
import type { SentenceCandidateMetadata } from "../src/content/contracts";
import { installChromeStub } from "./helpers/chrome-stub";
import { withFixtureDom } from "./helpers/fixture-dom";

describe("content sentence queue client", () => {
  it("dedupes sentence candidates while preserving compact diagnostic metadata", async () => {
    await withFixtureDom("article-basic.html", async () => {
      const [candidate] = dedupeSentenceCandidates([
        createCandidate("hash-1", "The museum opens early."),
        createCandidate("hash-1", "The museum opens early again.")
      ]);

      expect(candidate).toMatchObject({
        sentenceHash: "hash-1",
        sourceText: "The museum opens early.",
        hostname: "fixtures.immersionkit.test",
        documentUrl: "https://fixtures.immersionkit.test/article-basic.html",
        reason: "fixed-phrase-hint",
        knownWordCount: 2,
        totalWordCount: 4,
        phraseHints: ["as soon as"]
      });
    });
  });

  it("sends typed queue messages and returns typed queue outcomes", async () => {
    await withFixtureDom("article-basic.html", async () => {
      const chromeStub = installChromeStub();
      chromeStub.setSendMessageHandler(() => ({
        ok: true,
        accepted: 1,
        analyzed: 0,
        analysisCacheHits: 0,
        queued: 0,
        skipped: 1,
        cacheHits: 0,
        translationAvailability: "feature-disabled",
        analysisResults: [],
        cachedResults: [],
        rankingReasons: [
          {
            sentenceHash: "hash-1",
            rank: 1,
            score: 0.4,
            primaryReason: "fallback-original-order"
          }
        ]
      }));

      try {
        const outcome = await sendSentenceCandidatesToQueue([
          createCandidate("hash-1", "The museum opens early.")
        ]);

        expect(chromeStub.sentMessages).toEqual([
          {
            type: RuntimeMessageType.QueueSentenceCandidates,
            candidates: [
              {
                sentenceHash: "hash-1",
                sourceText: "The museum opens early.",
                hostname: "fixtures.immersionkit.test",
                nodeId: "node-hash-1",
                documentUrl: "https://fixtures.immersionkit.test/article-basic.html",
                reason: "fixed-phrase-hint",
                knownWordCount: 2,
                totalWordCount: 4,
                phraseHints: ["as soon as"]
              }
            ]
          }
        ]);
        expect(outcome).toMatchObject({
          queuedCandidateCount: 1,
          rankingReasons: [
            {
              sentenceHash: "hash-1",
              primaryReason: "fallback-original-order"
            }
          ]
        });
      } finally {
        chromeStub.restore();
      }
    });
  });
});

function createCandidate(
  sentenceHash: string,
  sentence: string
): SentenceCandidateMetadata {
  return {
    sentenceHash,
    sentence,
    knownWordCount: 2,
    totalWordCount: 4,
    knownRatio: 0.5,
    nodeId: `node-${sentenceHash}`,
    reason: "fixed-phrase-hint",
    phraseHints: ["as soon as"]
  };
}
