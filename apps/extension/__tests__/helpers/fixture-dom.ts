import { JSDOM, type DOMWindow } from "jsdom";

import { readFixturePage } from "./fixtures";

export type FixtureDomContext = {
  dom: JSDOM;
  document: Document;
  window: DOMWindow;
  wait: (milliseconds: number) => Promise<void>;
};

export type FixtureDomOptions = {
  url?: string;
  runInlineScripts?: boolean;
  waitForMs?: number;
};

type FixtureDomCallback<T> = (context: FixtureDomContext) => Promise<T> | T;

const WINDOW_GLOBAL_KEYS = [
  "window",
  "document",
  "Node",
  "Text",
  "Element",
  "HTMLElement",
  "HTMLSpanElement",
  "NodeFilter",
  "CustomEvent",
  "MutationObserver",
  "getComputedStyle"
] as const;

type WindowGlobalKey = (typeof WINDOW_GLOBAL_KEYS)[number];

type Snapshot = {
  hadKey: boolean;
  value: unknown;
};

export async function withFixtureDom<T>(
  fixtureFileName: string,
  callback: FixtureDomCallback<T>
): Promise<T>;
export async function withFixtureDom<T>(
  fixtureFileName: string,
  options: FixtureDomOptions,
  callback: FixtureDomCallback<T>
): Promise<T>;
export async function withFixtureDom<T>(
  fixtureFileName: string,
  optionsOrCallback: FixtureDomOptions | FixtureDomCallback<T>,
  maybeCallback?: FixtureDomCallback<T>
): Promise<T> {
  const options =
    typeof optionsOrCallback === "function" ? {} : optionsOrCallback;
  const callback =
    typeof optionsOrCallback === "function"
      ? optionsOrCallback
      : maybeCallback;

  if (!callback) {
    throw new Error("Fixture callback is required.");
  }

  const dom = new JSDOM(readFixturePage(fixtureFileName), {
    url: options.url ?? `https://fixtures.immersionkit.test/${fixtureFileName}`,
    pretendToBeVisual: true,
    ...(options.runInlineScripts
      ? { runScripts: "dangerously" as const, resources: "usable" as const }
      : {})
  });

  const restoreGlobals = installWindowGlobals(dom.window);
  const wait = async (milliseconds: number) => {
    await new Promise<void>((resolve) => {
      dom.window.setTimeout(resolve, milliseconds);
    });
  };

  try {
    if (options.waitForMs && options.waitForMs > 0) {
      await wait(options.waitForMs);
    }

    return await callback({
      dom,
      document: dom.window.document,
      window: dom.window,
      wait
    });
  } finally {
    restoreGlobals();
    dom.window.close();
  }
}

function installWindowGlobals(window: DOMWindow): () => void {
  const globalObject = globalThis as Record<string, unknown>;
  const snapshots = new Map<WindowGlobalKey, Snapshot>();

  for (const key of WINDOW_GLOBAL_KEYS) {
    snapshots.set(key, {
      hadKey: key in globalObject,
      value: globalObject[key]
    });

    if (key === "getComputedStyle") {
      globalObject[key] = window.getComputedStyle.bind(window);
      continue;
    }

    globalObject[key] = window[key as keyof DOMWindow] as unknown;
  }

  return () => {
    for (const key of WINDOW_GLOBAL_KEYS) {
      const snapshot = snapshots.get(key);
      if (!snapshot) {
        continue;
      }

      if (snapshot.hadKey) {
        globalObject[key] = snapshot.value;
        continue;
      }

      delete globalObject[key];
    }
  };
}
