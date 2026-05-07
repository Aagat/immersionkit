import type { AssetContextLoadSource } from "@immersionkit/shared";

import { getBackgroundAssetPackService } from "./asset-packs";

type SeedLexiconBootstrapResult = {
  source: AssetContextLoadSource;
  entryCount: number;
  assetVersion: string | null;
};

export async function ensureSeedLexiconReady(): Promise<SeedLexiconBootstrapResult> {
  const context = await getBackgroundAssetPackService().loadActiveContext();
  return {
    source: context.source,
    entryCount: context.lexicon.length,
    assetVersion: context.assetVersion
  };
}
