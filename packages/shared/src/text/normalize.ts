const SMART_APOSTROPHE_PATTERN = /[\u2018\u2019]/g;
const DASH_VARIANT_PATTERN = /[\u2010-\u2015]/g;
const EDGE_PUNCTUATION_PATTERN = /^[^a-z0-9]+|[^a-z0-9]+$/gi;

export function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export function normalizeSentenceText(input: string): string {
  return normalizeWhitespace(
    input.replace(SMART_APOSTROPHE_PATTERN, "'").replace(DASH_VARIANT_PATTERN, "-")
  );
}

export function normalizeToken(input: string): string {
  const normalized = normalizeSentenceText(input).toLowerCase();

  if (!normalized) {
    return "";
  }

  return normalized.replace(EDGE_PUNCTUATION_PATTERN, "");
}
