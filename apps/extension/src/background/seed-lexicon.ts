import type { AssetContextLoadSource } from "@immersionkit/shared";

import { getBackgroundAssetPackService } from "./asset-packs";

type SeedLexiconBootstrapResult = {
  source: AssetContextLoadSource;
  renderUnitCount: number;
  assetVersion: string | null;
};

export async function ensureSeedLexiconReady(): Promise<SeedLexiconBootstrapResult> {
  const context = await getBackgroundAssetPackService().loadActiveContext();
  return {
    source: context.source,
    renderUnitCount: context.renderUnits.length,
    assetVersion: context.assetVersion
  };
}
