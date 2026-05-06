const DEFAULT_LINUX_HEADED_DISPLAY = ":1";
const ROOT_OWNED_DISPLAY = ":0";

export function ensureLinuxHeadedBrowserDisplay(env = process.env) {
  if (process.platform !== "linux") {
    return env.DISPLAY ?? null;
  }

  const configuredDisplay =
    normalizeDisplay(env.IK_LINUX_HEADED_DISPLAY) ?? DEFAULT_LINUX_HEADED_DISPLAY;
  const currentDisplay = normalizeDisplay(env.DISPLAY);

  if (!currentDisplay || currentDisplay === ROOT_OWNED_DISPLAY) {
    env.DISPLAY = configuredDisplay;
    return configuredDisplay;
  }

  return currentDisplay;
}

function normalizeDisplay(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
