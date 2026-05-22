import { RuntimeMessageType } from "@immersionkit/shared";
import { describe, expect, it } from "vitest";

import { refreshProcessing } from "../src/content/controller";
import { createRuntimeState } from "../src/content/state";
import { installChromeStub } from "./helpers/chrome-stub";
import { withFixtureDom } from "./helpers/fixture-dom";

describe("content asset loading feedback", () => {
  it("shows a delayed page indicator while asset packs are loading", async () => {
    const chromeStub = installChromeStub();
    let resolveContextLoad: (() => void) | null = null;
    chromeStub.setSendMessageHandler((message) => {
      if (
        message &&
        typeof message === "object" &&
        (message as { type?: unknown }).type === RuntimeMessageType.LoadContentContext
      ) {
        return new Promise<undefined>((resolve) => {
          resolveContextLoad = () => resolve(undefined);
        });
      }

      return undefined;
    });

    try {
      await withFixtureDom("article-basic.html", async ({ document, wait }) => {
        const refreshPromise = refreshProcessing(createRuntimeState());

        await wait(250);
        expect(queryAssetLoadingIndicator(document)).toBeNull();

        await wait(100);
        const indicator = queryAssetLoadingIndicator(document);
        expect(indicator).toBeTruthy();
        expect(indicator?.shadowRoot?.textContent).toContain(
          "Getting ImmersionKit assets..."
        );

        resolveContextLoad?.();
        await refreshPromise;

        expect(queryAssetLoadingIndicator(document)).toBeNull();
      });
    } finally {
      chromeStub.restore();
    }
  });
});

function queryAssetLoadingIndicator(document: Document): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-ik-asset-pack-loading='true']");
}
