import { ExtensionPopup } from "@immersionkit/ui";
import { describe, expect, it } from "vitest";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { withFixtureDom } from "./helpers/fixture-dom";

describe("extension popup asset loading feedback", () => {
  it("renders a compact spinner row while reading assets are loading", async () => {
    await withFixtureDom("article-basic.html", async ({ document, wait }) => {
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);

      try {
        flushSync(() => {
          root.render(
            <ExtensionPopup
              chromeFrame={false}
              state="supported"
              account={{ status: "not-required" }}
              assetPackStatus={{ state: "loading" }}
            />
          );
        });

        const row = host.querySelector("[data-ik-asset-pack-status='loading']");
        expect(row).toBeTruthy();
        expect(row?.textContent).toContain("Getting reading assets...");
        expect(row?.querySelector("svg.animate-spin")).toBeTruthy();
      } finally {
        flushSync(() => {
          root.unmount();
        });
        await wait(0);
        await waitForReactScheduler();
      }
    });
  });
});

function waitForReactScheduler(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}
