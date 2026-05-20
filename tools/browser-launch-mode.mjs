import { ensureLinuxHeadedBrowserDisplay } from "./headed-browser-display.mjs";

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

export function shouldRunBrowserHeaded({
  argv = process.argv,
  env = process.env
} = {}) {
  if (argv.includes("--headless")) {
    return false;
  }
  if (argv.includes("--headed")) {
    return true;
  }

  if (isTrue(env.IK_BROWSER_HEADLESS)) {
    return false;
  }
  if (isTrue(env.IK_BROWSER_HEADED) || isTrue(env.IK_HEADED) || isTrue(env.PWDEBUG)) {
    return true;
  }
  if (isFalse(env.IK_BROWSER_HEADLESS)) {
    return true;
  }

  return false;
}

export function getBrowserLaunchOptions(options = {}) {
  const env = options.env ?? process.env;
  const headed = shouldRunBrowserHeaded(options);
  if (headed) {
    ensureLinuxHeadedBrowserDisplay(env);
  }

  const launchOptions = {
    headless: !headed
  };
  const channel = normalizeBrowserChannel(env.IK_BROWSER_CHANNEL);
  if (channel) {
    launchOptions.channel = channel;
  }
  return launchOptions;
}

export function getExtensionLaunchOptions(extensionPath, options = {}) {
  const env = options.env ?? process.env;
  const headed = shouldRunBrowserHeaded(options);
  if (headed) {
    ensureLinuxHeadedBrowserDisplay(env);
  }

  return {
    channel: normalizeBrowserChannel(env.IK_EXTENSION_BROWSER_CHANNEL) ?? "chromium",
    headless: !headed,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      ...(options.args ?? [])
    ]
  };
}

export function getPlaywrightTestModeArgs(options = {}) {
  return shouldRunBrowserHeaded(options) ? ["--headed"] : [];
}

function isTrue(value) {
  return TRUE_VALUES.has(String(value ?? "").trim().toLowerCase());
}

function isFalse(value) {
  return FALSE_VALUES.has(String(value ?? "").trim().toLowerCase());
}

function normalizeBrowserChannel(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}
