import { describe, expect, it, vi } from "vitest";

import { withFixtureDom } from "./helpers/fixture-dom";

describe("extension options reading bands", () => {
  it("lets users select an exact band without Advanced diagnostics", async () => {
    const restoreAnimationFrame = installAnimationFrameStub();

    try {
      await withFixtureDom("article-basic.html", async ({ document, wait }) => {
        const restoreResizeObserver = installResizeObserverStub();
        // Radix determines DOM availability when its modules load.
        const { ExtensionOptions } = await import("@immersionkit/ui");
        const { flushSync } = await import("react-dom");
        const { createRoot } = await import("react-dom/client");
        const host = document.createElement("div");
        document.body.append(host);
        const root = createRoot(host);
        const exactBandChange = vi.fn();
        const readingLevelChange = vi.fn();
        const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
        HTMLElement.prototype.scrollIntoView = vi.fn();
        const renderOptions = (exactActiveBandId: string) => (
          <ExtensionOptions
            chromeFrame={false}
            activeSection="Reading"
            showAdvanced={false}
            readingLevel="Beginner"
            isReadingLevelPresetActive={exactActiveBandId === "level-1a"}
            exactActiveBandId={exactActiveBandId}
            bandOptions={[
              { id: "level-1a", label: "Level 1A" },
              { id: "level-1b", label: "Level 1B" }
            ]}
            onExactBandChange={exactBandChange}
            onReadingLevelChange={readingLevelChange}
          />
        );

        try {
          flushSync(() => {
            root.render(renderOptions("level-1a"));
          });
          await wait(0);
          await waitForReactScheduler();

          expect(document.body.textContent).toContain("Current reading band");
          expect(document.body.textContent).not.toContain("Advanced diagnostics");

          const selectedPreset = document.querySelector(
            "[role='radio'][aria-checked='true']"
          ) as HTMLElement | null;
          selectedPreset?.click();
          expect(readingLevelChange).toHaveBeenCalledWith("Beginner");

          const bandSelect = document.getElementById("settings-exact-reading-band");
          expect(bandSelect?.getAttribute("role")).toBe("combobox");
          bandSelect?.click();
          await wait(0);
          await waitForReactScheduler();

          const levelOneA = [...document.querySelectorAll("[role='option']")].find(
            (option) => option.textContent?.includes("Level 1A")
          );
          expect(levelOneA).toBeTruthy();
          (levelOneA as HTMLElement | undefined)?.click();
          expect(exactBandChange).toHaveBeenCalledWith("level-1a");

          bandSelect?.click();
          await wait(0);
          await waitForReactScheduler();

          const levelOneB = [...document.querySelectorAll("[role='option']")].find(
            (option) => option.textContent?.includes("Level 1B")
          );
          expect(levelOneB).toBeTruthy();
          (levelOneB as HTMLElement | undefined)?.click();

          expect(exactBandChange).toHaveBeenCalledWith("level-1b");

          flushSync(() => {
            root.render(renderOptions("level-1b"));
          });

          const selectedPresets = document.querySelectorAll(
            "[role='radio'][aria-checked='true']"
          );
          expect(selectedPresets).toHaveLength(0);

          flushSync(() => {
            root.render(
              <ExtensionOptions
                chromeFrame={false}
                activeSection="Reading"
                showAdvanced={false}
                isSaving
                readingLevel="Beginner"
                isReadingLevelPresetActive
                exactActiveBandId="level-1a"
                bandOptions={[{ id: "level-1a", label: "Level 1A" }]}
              />
            );
          });
          expect(
            (document.getElementById("settings-exact-reading-band") as HTMLButtonElement)
              .disabled
          ).toBe(true);
          expect(
            (document.querySelector("[role='radio']") as HTMLButtonElement).disabled
          ).toBe(true);
        } finally {
          flushSync(() => {
            root.unmount();
          });
          HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
          restoreResizeObserver();
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

function installResizeObserverStub(): () => void {
  const originalResizeObserver = globalThis.ResizeObserver;

  globalThis.ResizeObserver = class ResizeObserverStub {
    disconnect(): void {}
    observe(): void {}
    unobserve(): void {}
  } as typeof ResizeObserver;

  return () => {
    if (originalResizeObserver) {
      globalThis.ResizeObserver = originalResizeObserver;
    } else {
      Reflect.deleteProperty(globalThis, "ResizeObserver");
    }
  };
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
