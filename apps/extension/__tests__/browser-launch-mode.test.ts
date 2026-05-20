import { describe, expect, it } from "vitest";

import {
  getBrowserLaunchOptions,
  getExtensionLaunchOptions,
  getPlaywrightTestModeArgs,
  shouldRunBrowserHeaded
} from "../../../tools/browser-launch-mode.mjs";

const defaultOptions = {
  argv: ["node", "script.mjs"],
  env: {}
};

describe("browser launch mode", () => {
  it("runs browser harnesses headless by default", () => {
    expect(shouldRunBrowserHeaded(defaultOptions)).toBe(false);
    expect(getBrowserLaunchOptions(defaultOptions)).toMatchObject({
      headless: true
    });
    expect(
      getExtensionLaunchOptions("/tmp/extension", defaultOptions)
    ).toMatchObject({
      headless: true
    });
    expect(getPlaywrightTestModeArgs(defaultOptions)).toEqual([]);
  });

  it("requires an explicit headed opt-in", () => {
    expect(
      shouldRunBrowserHeaded({
        argv: ["node", "script.mjs", "--headed"],
        env: {}
      })
    ).toBe(true);
    expect(
      shouldRunBrowserHeaded({
        argv: ["node", "script.mjs"],
        env: { IK_BROWSER_HEADED: "1" }
      })
    ).toBe(true);
    expect(
      shouldRunBrowserHeaded({
        argv: ["node", "script.mjs"],
        env: { IK_BROWSER_HEADLESS: "0" }
      })
    ).toBe(true);
  });

  it("lets automated runs force headless with IK_BROWSER_HEADLESS=1", () => {
    expect(
      shouldRunBrowserHeaded({
        argv: ["node", "script.mjs"],
        env: {
          IK_BROWSER_HEADLESS: "1",
          IK_BROWSER_HEADED: "1",
          PWDEBUG: "1"
        }
      })
    ).toBe(false);
    expect(
      shouldRunBrowserHeaded({
        argv: ["node", "script.mjs", "--headed"],
        env: { IK_BROWSER_HEADLESS: "1" }
      })
    ).toBe(true);
    expect(
      shouldRunBrowserHeaded({
        argv: ["node", "script.mjs", "--headless"],
        env: { IK_BROWSER_HEADED: "1" }
      })
    ).toBe(false);
  });
});
