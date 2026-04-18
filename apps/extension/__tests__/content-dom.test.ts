import { describe, expect, it } from "vitest";

import { collectEligibleTextNodes, shouldSkipDocument } from "../src/content/dom";
import { withFixtureDom } from "./helpers/fixture-dom";

describe("document skip rules", () => {
  it("keeps normal article pages eligible", async () => {
    await withFixtureDom(
      "article-basic.html",
      {
        url: "https://news.example.test/articles/city-garden"
      },
      ({ document, window }) => {
        expect(
          shouldSkipDocument(new URL(window.location.href), document)
        ).toEqual({
          shouldSkip: false,
          reason: null
        });
      }
    );
  });

  it("skips sensitive login and checkout paths", async () => {
    await withFixtureDom(
      "article-basic.html",
      {
        url: "https://accounts.example.test/user/login"
      },
      ({ document, window }) => {
        expect(
          shouldSkipDocument(new URL(window.location.href), document)
        ).toEqual({
          shouldSkip: true,
          reason: "sensitive-path"
        });
      }
    );

    await withFixtureDom(
      "article-basic.html",
      {
        url: "https://shop.example.test/checkout/review"
      },
      ({ document, window }) => {
        expect(
          shouldSkipDocument(new URL(window.location.href), document)
        ).toEqual({
          shouldSkip: true,
          reason: "sensitive-path"
        });
      }
    );
  });

  it("skips unsupported protocols and missing bodies", async () => {
    await withFixtureDom("article-basic.html", ({ document }) => {
      expect(
        shouldSkipDocument(new URL("chrome-extension://abc123/popup.html"), document)
      ).toEqual({
        shouldSkip: true,
        reason: "unsupported-protocol"
      });
    });

    expect(
      shouldSkipDocument(
        new URL("https://news.example.test/story"),
        { body: null } as Document
      )
    ).toEqual({
      shouldSkip: true,
      reason: "missing-body"
    });
  });
});

describe("eligible text-node collection", () => {
  it("collects rich plain-article text from fixture pages", async () => {
    await withFixtureDom("article-basic.html", ({ document }) => {
      const combinedText = joinText(collectEligibleTextNodes(document.body));

      expect(combinedText).toContain("City Garden Volunteers Expand Weekend Program");
      expect(combinedText).toContain("The local garden opens early on Saturday morning");
      expect(combinedText).toContain("Morning cleanup begins at 8:00.");
    });

    await withFixtureDom("article-longform.html", ({ document }) => {
      const combinedText = joinText(collectEligibleTextNodes(document.body));

      expect(combinedText).toContain("Regional Rail Service Adds New Coastal Stops");
      expect(combinedText).toContain("A new timetable gives commuters faster options");
      expect(combinedText).toContain("The rail authority tested the same plan");
    });
  });

  it("excludes editor, form, hidden, code, and existing annotation regions", async () => {
    await withFixtureDom("article-exclusions.html", ({ document }) => {
      const combinedText = joinText(collectEligibleTextNodes(document.body));

      expect(combinedText).toContain("Harbor Volunteers Prepare Spring Cleanup");
      expect(combinedText).toContain("Public summary: teams meet at sunrise");

      expect(combinedText).not.toContain("hunter2");
      expect(combinedText).not.toContain("account number 881122");
      expect(combinedText).not.toContain("billing code 7719");
      expect(combinedText).not.toContain("one-time code 123456");
      expect(combinedText).not.toContain("sk-live-never-collect");
      expect(combinedText).not.toContain("Bearer secret");
      expect(combinedText).not.toContain("credit card 5555 4444 3333 2222");
      expect(combinedText).not.toContain("Aria-hidden password reminder text");
      expect(combinedText).not.toContain("Ignore this annotation island");
      expect(combinedText).not.toContain(
        "Previously annotated content that should not be reprocessed."
      );
    });
  });

  it("captures dynamic public updates while excluding dynamic private drafts", async () => {
    await withFixtureDom(
      "article-dynamic.html",
      {
        runInlineScripts: true
      },
      async ({ document, wait }) => {
        const beforeUpdate = joinText(collectEligibleTextNodes(document.body));
        expect(beforeUpdate).not.toContain("Neighbors shared helpful updates");

        await wait(140);

        const afterUpdate = joinText(collectEligibleTextNodes(document.body));
        expect(afterUpdate).toContain("Neighbors shared helpful updates");
        expect(afterUpdate).not.toContain("Private draft: card number 4242");
        expect(afterUpdate).not.toContain("password reset details");
      }
    );
  });
});

function joinText(nodes: Text[]): string {
  return nodes
    .map((node) => normalizeNodeText(node.nodeValue))
    .filter((value): value is string => value.length > 0)
    .join("\n");
}

function normalizeNodeText(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  return value.replace(/\s+/g, " ").trim();
}
