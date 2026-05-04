import bundledLexemeAsset from "../assets/en-es.lexemes.v1.json";
import bundledRenderUnitAsset from "../assets/en-es.render-units.v1.json";
import {
  parseLexemeAsset,
  parseRenderUnitAsset,
  renderUnitsToSeedLexiconAsset
} from "../render-units/render-units";
import {
  isLikelyFallbackSeedLexicon,
  parseSeedLexiconInput
} from "../seed/seed-lexicon";
import {
  pickFirstDefinedValue,
  readStorageValues,
  removeStorageValues,
  writeStorageValues
} from "./storage";

const SEED_LEXICON_STORAGE_KEYS = [
  "immersionkit.seedLexicon",
  "seedLexicon",
  "lexicon"
] as const;
const RENDER_UNIT_STORAGE_KEYS = ["immersionkit.renderUnits", "renderUnits"] as const;
const LEXEME_STORAGE_KEYS = ["immersionkit.lexemes", "lexemes"] as const;
const PRIMARY_SEED_LEXICON_STORAGE_KEY = SEED_LEXICON_STORAGE_KEYS[0];
const PRIMARY_RENDER_UNIT_STORAGE_KEY = RENDER_UNIT_STORAGE_KEYS[0];
const PRIMARY_LEXEME_STORAGE_KEY = LEXEME_STORAGE_KEYS[0];

type SeedLexiconBootstrapResult = {
  source: "existing" | "seeded" | "seeded-fallback";
  entryCount: number;
  assetVersion: string | null;
};

const BUNDLED_RENDER_UNITS = parseRenderUnitAsset(bundledRenderUnitAsset);
const BUNDLED_LEXEMES = parseLexemeAsset(bundledLexemeAsset);
const BUNDLED_RENDER_LEXICON_ASSET = BUNDLED_RENDER_UNITS
  ? renderUnitsToSeedLexiconAsset(BUNDLED_RENDER_UNITS, BUNDLED_LEXEMES?.entries ?? [])
  : null;
const BUNDLED_SEED_LEXICON = parseSeedLexiconInput(BUNDLED_RENDER_LEXICON_ASSET);

export async function ensureSeedLexiconReady(): Promise<SeedLexiconBootstrapResult> {
  const storage = await readStorageValues([
    ...SEED_LEXICON_STORAGE_KEYS,
    ...RENDER_UNIT_STORAGE_KEYS,
    ...LEXEME_STORAGE_KEYS
  ]);
  const storedRenderUnits = parseRenderUnitAsset(
    pickFirstDefinedValue(storage, RENDER_UNIT_STORAGE_KEYS)
  );
  const storedLexemes =
    parseLexemeAsset(pickFirstDefinedValue(storage, LEXEME_STORAGE_KEYS)) ??
    BUNDLED_LEXEMES;
  const storedValue = pickFirstDefinedValue(storage, SEED_LEXICON_STORAGE_KEYS);
  const parsedStoredLexicon = storedRenderUnits
    ? parseSeedLexiconInput(
        renderUnitsToSeedLexiconAsset(storedRenderUnits, storedLexemes?.entries ?? [])
      )
    : parseSeedLexiconInput(storedValue);

  if (
    parsedStoredLexicon &&
    parsedStoredLexicon.entries.length > 0 &&
    !isLikelyFallbackSeedLexicon(parsedStoredLexicon.entries) &&
    !shouldRefreshStoredLexicon(parsedStoredLexicon.entries.length, parsedStoredLexicon.assetVersion)
  ) {
    return {
      source: "existing",
      entryCount: parsedStoredLexicon.entries.length,
      assetVersion: parsedStoredLexicon.assetVersion
    };
  }

  if (BUNDLED_SEED_LEXICON && BUNDLED_SEED_LEXICON.entries.length > 0) {
    await writeStorageValues({
      [PRIMARY_LEXEME_STORAGE_KEY]: bundledLexemeAsset,
      [PRIMARY_RENDER_UNIT_STORAGE_KEY]: bundledRenderUnitAsset,
      [PRIMARY_SEED_LEXICON_STORAGE_KEY]: BUNDLED_RENDER_LEXICON_ASSET
    });

    const legacyStorageKeys = [
      ...SEED_LEXICON_STORAGE_KEYS.slice(1),
      ...RENDER_UNIT_STORAGE_KEYS.slice(1),
      ...LEXEME_STORAGE_KEYS.slice(1)
    ];
    if (legacyStorageKeys.length > 0) {
      await removeStorageValues(legacyStorageKeys);
    }

    return {
      source: "seeded",
      entryCount: BUNDLED_SEED_LEXICON.entries.length,
      assetVersion: BUNDLED_SEED_LEXICON.assetVersion
    };
  }

  return {
    source: "seeded-fallback",
    entryCount: parsedStoredLexicon?.entries.length ?? 0,
    assetVersion: parsedStoredLexicon?.assetVersion ?? null
  };
}

function shouldRefreshStoredLexicon(
  currentEntryCount: number,
  currentAssetVersion: string | null
): boolean {
  if (!BUNDLED_SEED_LEXICON) {
    return false;
  }

  const bundledEntryCount = BUNDLED_SEED_LEXICON.entries.length;
  if (bundledEntryCount === 0) {
    return false;
  }

  // Replace tiny fallback or very small legacy lists with the bundled generated asset.
  if (currentEntryCount === 0 || currentEntryCount < 100) {
    return true;
  }

  if (
    currentAssetVersion &&
    BUNDLED_SEED_LEXICON.assetVersion &&
    currentAssetVersion !== BUNDLED_SEED_LEXICON.assetVersion
  ) {
    return true;
  }

  return false;
}
