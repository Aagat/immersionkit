import { normalizeToken } from "../text/normalize";

export type CognatePatternExample = {
  source: string;
  target: string;
};

export type CognatePattern = {
  patternId: string;
  minBand: string;
  learnerLabel: string;
  learnerExplanation: string;
  examples: readonly CognatePatternExample[];
  boostEligible: boolean;
  contrastOnly?: boolean;
};

export type CognatePatternMatch = {
  pattern: CognatePattern;
  source: string;
  target: string;
};

const BAND_ORDER = [
  "level-1a",
  "level-1b",
  "level-1c",
  "level-2a",
  "level-2b",
  "level-2c",
  "level-3a",
  "level-3b",
  "level-3c",
  "level-4a",
  "level-4b",
  "level-5a",
  "level-5b"
] as const;

const FALSE_FRIEND_SOURCES = new Set([
  "actual",
  "embarrassed",
  "exit",
  "sensible"
]);

export const DEFAULT_COGNATE_PATTERNS: readonly CognatePattern[] = [
  {
    patternId: "cog-01-near-identical",
    minBand: "level-1a",
    learnerLabel: "identical or near-identical international words",
    learnerExplanation:
      "Some Spanish words look almost the same as English. These are good early confidence builders.",
    examples: [
      { source: "animal", target: "animal" },
      { source: "hospital", target: "hospital" },
      { source: "hotel", target: "hotel" },
      { source: "captain", target: "capitán" }
    ],
    boostEligible: true
  },
  {
    patternId: "cog-02-final-e-descriptors",
    minBand: "level-1a",
    learnerLabel: "final -e and familiar descriptive words",
    learnerExplanation:
      "Many descriptive words have a familiar shape. English important becomes Spanish importante.",
    examples: [
      { source: "important", target: "importante" },
      { source: "possible", target: "posible" },
      { source: "different", target: "diferente" },
      { source: "simple", target: "simple" }
    ],
    boostEligible: true
  },
  {
    patternId: "cog-03-tion-sion",
    minBand: "level-1c",
    learnerLabel: "-tion and -sion -> -ción and -sión",
    learnerExplanation:
      "English words ending in -tion often become Spanish -ción.",
    examples: [
      { source: "nation", target: "nación" },
      { source: "action", target: "acción" },
      { source: "information", target: "información" },
      { source: "decision", target: "decisión" }
    ],
    boostEligible: true
  },
  {
    patternId: "cog-04-ty-dad",
    minBand: "level-2c",
    learnerLabel: "-ty -> -dad word families",
    learnerExplanation: "Many English -ty nouns become Spanish -dad nouns.",
    examples: [
      { source: "activity", target: "actividad" },
      { source: "possibility", target: "posibilidad" },
      { source: "community", target: "comunidad" },
      { source: "reality", target: "realidad" }
    ],
    boostEligible: true
  },
  {
    patternId: "cog-05-ly-mente",
    minBand: "level-3a",
    learnerLabel: "-ly -> -mente adverbs",
    learnerExplanation:
      "Many adverbs use -mente in Spanish, similar to English -ly.",
    examples: [
      { source: "clearly", target: "claramente" },
      { source: "normally", target: "normalmente" },
      { source: "finally", target: "finalmente" }
    ],
    boostEligible: true
  },
  {
    patternId: "cog-06-ph-f",
    minBand: "level-1c",
    learnerLabel: "ph -> f word families",
    learnerExplanation:
      "English ph often appears as Spanish f in approved word families.",
    examples: [
      { source: "pharmacy", target: "farmacia" },
      { source: "photograph", target: "fotografía" },
      { source: "philosophy", target: "filosofía" },
      { source: "phrase", target: "frase" }
    ],
    boostEligible: true
  },
  {
    patternId: "cog-07-ist-ism",
    minBand: "level-3c",
    learnerLabel: "-ist and -ism -> -ista and -ismo",
    learnerExplanation:
      "Many people and idea words keep a familiar shape: artist -> artista, tourism -> turismo.",
    examples: [
      { source: "artist", target: "artista" },
      { source: "specialist", target: "especialista" },
      { source: "tourism", target: "turismo" }
    ],
    boostEligible: true
  },
  {
    patternId: "cog-08-ic-ical",
    minBand: "level-3c",
    learnerLabel: "-ic and -ical -> -ico / -ica",
    learnerExplanation:
      "Many academic or descriptive words have Spanish forms ending in -ico or -ica.",
    examples: [
      { source: "public", target: "público" },
      { source: "economic", target: "económico" },
      { source: "political", target: "político" }
    ],
    boostEligible: true
  },
  {
    patternId: "cog-09-verb-families",
    minBand: "level-4a",
    learnerLabel: "-ate / -ize verbs -> -ar / -izar families",
    learnerExplanation:
      "Some English verb families map to common Spanish verb endings. These are useful later because verbs need more grammar context.",
    examples: [
      { source: "organize", target: "organizar" },
      { source: "modernize", target: "modernizar" },
      { source: "participate", target: "participar" }
    ],
    boostEligible: true
  },
  {
    patternId: "cog-10-false-friend-contrast",
    minBand: "level-3b",
    learnerLabel: "false-friend contrast cards",
    learnerExplanation:
      "Some words look familiar but mean something different. ImmersionKit avoids using them as easy cognates unless the card explicitly teaches the contrast.",
    examples: [
      { source: "actual", target: "actual" },
      { source: "embarrassed", target: "embarazada" },
      { source: "success", target: "éxito" }
    ],
    boostEligible: false,
    contrastOnly: true
  }
] as const;

const COGNATE_PATTERNS_BY_ID = new Map(
  DEFAULT_COGNATE_PATTERNS.map((pattern) => [pattern.patternId, pattern] as const)
);

export function listCognatePatterns(): readonly CognatePattern[] {
  return DEFAULT_COGNATE_PATTERNS;
}

export function resolveCognatePattern(
  patternId: string | null | undefined
): CognatePattern | null {
  return patternId ? COGNATE_PATTERNS_BY_ID.get(patternId) ?? null : null;
}

export function isFalseFriendSource(source: string | null | undefined): boolean {
  const normalized = normalizeComparableCognateToken(source ?? "");
  return Boolean(normalized && FALSE_FRIEND_SOURCES.has(normalized));
}

export function matchEnglishSpanishCognatePattern(input: {
  source: string;
  target: string;
  activeBandId?: string | null;
  includeContrastOnly?: boolean;
}): CognatePatternMatch | null {
  const source = normalizeComparableCognateToken(input.source);
  const target = normalizeComparableCognateToken(input.target);
  if (!source || !target || source.includes(" ") || target.includes(" ")) {
    return null;
  }

  for (const pattern of orderedCognatePatterns()) {
    if (!input.includeContrastOnly && pattern.contrastOnly) {
      continue;
    }

    if (matchesCognatePattern(pattern.patternId, source, target)) {
      if (
        input.activeBandId &&
        !isCognatePatternEligibleForBand(pattern.patternId, input.activeBandId)
      ) {
        return null;
      }

      return {
        pattern,
        source: input.source,
        target: input.target
      };
    }
  }

  return null;
}

function orderedCognatePatterns(): readonly CognatePattern[] {
  const nearIdentical = resolveCognatePattern("cog-01-near-identical");
  return [
    ...DEFAULT_COGNATE_PATTERNS.filter(
      (pattern) => pattern.patternId !== "cog-01-near-identical"
    ),
    ...(nearIdentical ? [nearIdentical] : [])
  ];
}

export function explainCognatePatternMatch(input: {
  source: string;
  target: string;
  activeBandId?: string | null;
}): string | null {
  const match = matchEnglishSpanishCognatePattern(input);
  if (!match || !match.pattern.boostEligible) {
    return null;
  }

  return `Pattern: ${match.pattern.learnerExplanation}`;
}

export function isCognatePatternEligibleForBand(
  patternId: string,
  activeBandId: string | null | undefined
): boolean {
  const pattern = resolveCognatePattern(patternId);
  const activeOrder = bandOrder(activeBandId);
  const minOrder = bandOrder(pattern?.minBand);
  return (
    Boolean(pattern) &&
    activeOrder !== null &&
    minOrder !== null &&
    activeOrder >= minOrder
  );
}

function matchesCognatePattern(
  patternId: string,
  source: string,
  target: string
): boolean {
  if (patternId !== "cog-10-false-friend-contrast" && isFalseFriendSource(source)) {
    return false;
  }

  if (patternId === "cog-01-near-identical") {
    return (
      source === target ||
      isListedPatternExample(patternId, source, target) ||
      normalizedSimilarity(source, target) >= 0.9
    );
  }

  if (patternId === "cog-02-final-e-descriptors") {
    if (isListedPatternExample(patternId, source, target)) {
      return true;
    }

    if (source === target) {
      return false;
    }

    return (
      target === `${source}e` ||
      (source.endsWith("ant") && target.endsWith("ante")) ||
      (source.endsWith("ent") && target.endsWith("ente")) ||
      (source.endsWith("ble") && target.endsWith("ble")) ||
      (source.endsWith("al") && target.endsWith("al"))
    );
  }

  if (patternId === "cog-03-tion-sion") {
    return (
      (source.endsWith("tion") && target.endsWith("cion")) ||
      (source.endsWith("sion") && target.endsWith("sion"))
    );
  }

  if (patternId === "cog-04-ty-dad") {
    return source.endsWith("ty") && target.endsWith("dad");
  }

  if (patternId === "cog-05-ly-mente") {
    return source.endsWith("ly") && target.endsWith("mente");
  }

  if (patternId === "cog-06-ph-f") {
    return source.includes("ph") && target.includes("f");
  }

  if (patternId === "cog-07-ist-ism") {
    return (
      (source.endsWith("ist") && target.endsWith("ista")) ||
      (source.endsWith("ism") && target.endsWith("ismo"))
    );
  }

  if (patternId === "cog-08-ic-ical") {
    return (
      (source.endsWith("ic") &&
        (target.endsWith("ico") || target.endsWith("ica"))) ||
      (source.endsWith("ical") &&
        (target.endsWith("ico") || target.endsWith("ica")))
    );
  }

  if (patternId === "cog-09-verb-families") {
    return (
      (source.endsWith("ize") && target.endsWith("izar")) ||
      (source.endsWith("ate") && target.endsWith("ar"))
    );
  }

  if (patternId === "cog-10-false-friend-contrast") {
    return isFalseFriendSource(source);
  }

  return false;
}

function normalizeComparableCognateToken(value: string): string {
  return normalizeToken(
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ñ/g, "n")
      .replace(/Ñ/g, "n")
  );
}

function isListedPatternExample(
  patternId: string,
  source: string,
  target: string
): boolean {
  const pattern = resolveCognatePattern(patternId);
  return Boolean(
    pattern?.examples.some(
      (example) =>
        normalizeComparableCognateToken(example.source) === source &&
        normalizeComparableCognateToken(example.target) === target
    )
  );
}

function normalizedSimilarity(source: string, target: string): number {
  if (source === target) {
    return 1;
  }

  const maxLength = Math.max(source.length, target.length);
  if (maxLength === 0) {
    return 0;
  }

  return Math.max(0, Math.min(1, 1 - levenshteinDistance(source, target) / maxLength));
}

function levenshteinDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      );
    }

    for (let index = 0; index < previous.length; index += 1) {
      previous[index] = current[index] ?? 0;
    }
  }

  return previous[right.length] ?? 0;
}

function bandOrder(bandId: string | null | undefined): number | null {
  if (!bandId) {
    return null;
  }

  const index = BAND_ORDER.indexOf(bandId as (typeof BAND_ORDER)[number]);
  return index >= 0 ? index + 1 : null;
}
