import { ExtensionOptions, ExtensionPopup } from "@immersionkit/ui";
import { describe, expect, it, vi } from "vitest";
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

describe("extension popup first-run setup", () => {
  it("points setup back to settings without dismissing first-run state", async () => {
    await withFixtureDom("article-basic.html", async ({ document, wait }) => {
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      const openSettings = vi.fn();
      const dismissIntro = vi.fn();

      try {
        flushSync(() => {
          root.render(
            <ExtensionPopup
              chromeFrame={false}
              state="supported"
              account={{ status: "not-required" }}
              firstRunIntro
              onOpenSettings={openSettings}
              {...({ onDismissIntro: dismissIntro } as Record<string, never>)}
            />
          );
        });

        expect(host.textContent).toContain("Finish setup in Settings");
        expect(host.textContent).toContain("choose your starting level");
        expect(host.textContent).not.toContain("Got it");
        host.querySelectorAll("button").forEach((button) => {
          if (button.textContent?.includes("Open settings")) {
            button.click();
          }
        });
        expect(openSettings).toHaveBeenCalledTimes(1);
        expect(dismissIntro).not.toHaveBeenCalled();
      } finally {
        flushSync(() => {
          root.unmount();
        });
        await wait(0);
        await waitForReactScheduler();
      }
    });
  });

  it("shows setup guidance even when the active page is unsupported", async () => {
    await withFixtureDom("article-basic.html", async ({ document, wait }) => {
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);

      try {
        flushSync(() => {
          root.render(
            <ExtensionPopup
              chromeFrame={false}
              state="unsupported"
              account={{ status: "not-required" }}
              firstRunIntro
            />
          );
        });

        expect(host.textContent).toContain("Finish setup in Settings");
        expect(host.textContent).toContain("This page is not supported");
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

describe("extension options first-run wizard", () => {
  it("keeps signed-out account-required users on the signup step", async () => {
    const restoreAnimationFrame = installAnimationFrameStub();
    try {
      await withFixtureDom("article-basic.html", async ({ document, wait }) => {
        const host = document.createElement("div");
        document.body.append(host);
        const root = createRoot(host);
        const previewSignIn = vi.fn();
        const completeFirstRun = vi.fn();

        try {
          flushSync(() => {
            root.render(
              <ExtensionOptions
                chromeFrame={false}
                firstRunIntro
                account={{ status: "signed-out" }}
                onPreviewSignIn={previewSignIn}
                onCompleteFirstRun={completeFirstRun}
              />
            );
          });
          await wait(0);
          await waitForReactScheduler();

          expect(document.body.textContent).toContain("Sign in for preview");
          expect(document.body.textContent).toContain("Preview sign-in unlocks reading mode");
          clickButtonByText(document, "Sign in with Google");
          expect(previewSignIn).toHaveBeenCalledTimes(1);
          expect(completeFirstRun).not.toHaveBeenCalled();
          expect(document.body.textContent).not.toContain("Choose your starting point");
        } finally {
          flushSync(() => {
            root.unmount();
          });
          await wait(0);
          await waitForReactScheduler();
        }
      });
    } finally {
      restoreAnimationFrame();
    }
  });

  it("lets signed-in users choose level, continue through density, and finish", async () => {
    const restoreAnimationFrame = installAnimationFrameStub();
    try {
      await withFixtureDom("article-basic.html", async ({ document, wait }) => {
        const host = document.createElement("div");
        document.body.append(host);
        const root = createRoot(host);
        const readingLevelChange = vi.fn();
        const completeFirstRun = vi.fn();

        try {
          flushSync(() => {
            root.render(
              <ExtensionOptions
                chromeFrame={false}
                firstRunIntro
                account={{
                  status: "signed-in",
                  email: "reader@example.com",
                  previewStatus: "active"
                }}
                onReadingLevelChange={readingLevelChange}
                onCompleteFirstRun={completeFirstRun}
              />
            );
          });
          await wait(0);
          await waitForReactScheduler();

          expect(document.body.textContent).toContain("Choose your starting point");
          document.getElementById("first-run-reading-level-intermediate")?.click();
          expect(readingLevelChange).toHaveBeenCalledWith("Intermediate");
          clickButtonByText(document, "Continue");
          await wait(0);
          expect(document.body.textContent).toContain("Set the Spanish density");
          clickButtonByText(document, "Continue");
          await wait(0);
          expect(document.body.textContent).toContain("Start reading normally");
          clickButtonByText(document, "Start reading");
          expect(completeFirstRun).toHaveBeenCalledTimes(1);
        } finally {
          flushSync(() => {
            root.unmount();
          });
          await wait(0);
          await waitForReactScheduler();
        }
      });
    } finally {
      restoreAnimationFrame();
    }
  });
});

function waitForReactScheduler(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

function clickButtonByText(document: Document, label: string): void {
  const button = [...document.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === label
  );
  expect(button).toBeTruthy();
  button?.click();
}

function installAnimationFrameStub(): () => void {
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  let nextHandle = 1;

  globalThis.requestAnimationFrame = ((callback) => {
    const handle = nextHandle;
    nextHandle += 1;
    const timer = setTimeout(() => {
      timers.delete(handle);
      callback(Date.now());
    }, 0);
    timers.set(handle, timer);
    return handle;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((handle) => {
    const timer = timers.get(handle);
    if (timer) {
      clearTimeout(timer);
      timers.delete(handle);
    }
  }) as typeof cancelAnimationFrame;

  return () => {
    for (const timer of timers.values()) {
      clearTimeout(timer);
    }
    timers.clear();

    if (originalRequestAnimationFrame) {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    } else {
      Reflect.deleteProperty(globalThis, "requestAnimationFrame");
    }

    if (originalCancelAnimationFrame) {
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    } else {
      Reflect.deleteProperty(globalThis, "cancelAnimationFrame");
    }
  };
}
