import type { AssetContextLoadSource } from "@immersionkit/shared";

import { getBackgroundAssetPackService } from "./asset-packs";

type RenderAssetBootstrapResult = {
  source: AssetContextLoadSource;
  renderUnitCount: number;
  assetVersion: string | null;
};

export async function ensureRenderAssetsReady(): Promise<RenderAssetBootstrapResult> {
  const context = await getBackgroundAssetPackService().loadActiveContext();
  return {
    source: context.source,
    renderUnitCount: context.renderUnits.length,
    assetVersion: context.assetVersion
  };
}
