import bundledSeedLexiconAsset from "../assets/en-es.seed.v1.json";
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
const PRIMARY_SEED_LEXICON_STORAGE_KEY = SEED_LEXICON_STORAGE_KEYS[0];

type SeedLexiconBootstrapResult = {
  source: "existing" | "seeded" | "seeded-fallback";
  entryCount: number;
  assetVersion: string | null;
};

const BUNDLED_SEED_LEXICON = parseSeedLexiconInput(bundledSeedLexiconAsset);

export async function ensureSeedLexiconReady(): Promise<SeedLexiconBootstrapResult> {
  const storage = await readStorageValues(SEED_LEXICON_STORAGE_KEYS);
  const storedValue = pickFirstDefinedValue(storage, SEED_LEXICON_STORAGE_KEYS);
  const parsedStoredLexicon = parseSeedLexiconInput(storedValue);

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
      [PRIMARY_SEED_LEXICON_STORAGE_KEY]: bundledSeedLexiconAsset
    });

    const legacyStorageKeys = SEED_LEXICON_STORAGE_KEYS.slice(1);
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
    currentAssetVersion !== BUNDLED_SEED_LEXICON.assetVersion &&
    currentEntryCount <= bundledEntryCount
  ) {
    return true;
  }

  return false;
}
