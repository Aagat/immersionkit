const UI_THEME_ATTRIBUTE = "data-ik-theme";

type UiTheme = "light" | "dark";

type RgbaColor = {
  r: number;
  g: number;
  b: number;
  a: number;
};

export function applyUiTheme(): void {
  const theme = detectUiTheme();
  document.documentElement.setAttribute(UI_THEME_ATTRIBUTE, theme);
}

function detectUiTheme(): UiTheme {
  const bodyColor = readCssColor(
    document.body ? window.getComputedStyle(document.body).backgroundColor : null
  );
  const rootColor = readCssColor(
    window.getComputedStyle(document.documentElement).backgroundColor
  );
  const resolved = chooseBackgroundColor(bodyColor, rootColor);
  const luminance = getRelativeLuminance(resolved.r, resolved.g, resolved.b);
  return luminance < 0.42 ? "dark" : "light";
}

function chooseBackgroundColor(
  bodyColor: RgbaColor | null,
  rootColor: RgbaColor | null
): RgbaColor {
  if (bodyColor && bodyColor.a > 0.99) {
    return bodyColor;
  }

  if (rootColor && rootColor.a > 0.99) {
    return rootColor;
  }

  if (bodyColor && rootColor) {
    return blendRgba(bodyColor, rootColor);
  }

  if (bodyColor) {
    return bodyColor;
  }

  if (rootColor) {
    return rootColor;
  }

  return { r: 255, g: 255, b: 255, a: 1 };
}

function readCssColor(input: string | null): RgbaColor | null {
  if (!input || input === "transparent") {
    return null;
  }

  const rgbaMatch = input
    .trim()
    .match(
      /^rgba?\(\s*([0-9]{1,3}(?:\.[0-9]+)?)\s*,\s*([0-9]{1,3}(?:\.[0-9]+)?)\s*,\s*([0-9]{1,3}(?:\.[0-9]+)?)(?:\s*,\s*([01](?:\.[0-9]+)?|0?\.[0-9]+))?\s*\)$/i
    );

  if (rgbaMatch) {
    const r = clampChannel(Number(rgbaMatch[1]));
    const g = clampChannel(Number(rgbaMatch[2]));
    const b = clampChannel(Number(rgbaMatch[3]));
    const a = clampAlpha(rgbaMatch[4] ? Number(rgbaMatch[4]) : 1);

    return { r, g, b, a };
  }

  const hexMatch = input.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!hexMatch) {
    return null;
  }

  const hex = hexMatch[1];
  if (hex.length === 3) {
    return {
      r: Number.parseInt(hex[0] + hex[0], 16),
      g: Number.parseInt(hex[1] + hex[1], 16),
      b: Number.parseInt(hex[2] + hex[2], 16),
      a: 1
    };
  }

  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
    a: 1
  };
}

function clampChannel(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(255, Math.max(0, Math.round(value)));
}

function clampAlpha(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(1, Math.max(0, value));
}

function blendRgba(foreground: RgbaColor, background: RgbaColor): RgbaColor {
  const alpha = foreground.a + background.a * (1 - foreground.a);
  if (alpha <= 0) {
    return { r: 255, g: 255, b: 255, a: 1 };
  }

  const r =
    (foreground.r * foreground.a +
      background.r * background.a * (1 - foreground.a)) /
    alpha;
  const g =
    (foreground.g * foreground.a +
      background.g * background.a * (1 - foreground.a)) /
    alpha;
  const b =
    (foreground.b * foreground.a +
      background.b * background.a * (1 - foreground.a)) /
    alpha;

  return {
    r: clampChannel(r),
    g: clampChannel(g),
    b: clampChannel(b),
    a: clampAlpha(alpha)
  };
}

function getRelativeLuminance(r: number, g: number, b: number): number {
  const red = normalizeSrgbChannel(r);
  const green = normalizeSrgbChannel(g);
  const blue = normalizeSrgbChannel(b);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function normalizeSrgbChannel(value: number): number {
  const channel = value / 255;
  if (channel <= 0.04045) {
    return channel / 12.92;
  }

  return ((channel + 0.055) / 1.055) ** 2.4;
}
