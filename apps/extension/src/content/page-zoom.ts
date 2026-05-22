import { RuntimeMessageType } from "@immersionkit/shared";
import { sendRuntimeMessage } from "../runtime-client";

const MIN_ZOOM_FACTOR = 0.25;
const MAX_ZOOM_FACTOR = 5;

let cachedPageZoomFactor = 1;
let pendingRefresh: Promise<number> | null = null;
let zoomTrackingInstalled = false;

export function getCachedPageZoomFactor(): number {
  return cachedPageZoomFactor;
}

export function getInversePageZoomFactor(zoomFactor = cachedPageZoomFactor): number {
  return 1 / normalizePageZoomFactor(zoomFactor);
}

export function setupPageZoomTracking(): void {
  if (zoomTrackingInstalled || typeof window === "undefined") {
    return;
  }

  zoomTrackingInstalled = true;
  const refresh = () => {
    void refreshPageZoomFactor();
  };
  window.addEventListener("resize", refresh);
  window.visualViewport?.addEventListener("resize", refresh);
  void refreshPageZoomFactor();
}

export async function refreshPageZoomFactor(): Promise<number> {
  if (pendingRefresh) {
    return pendingRefresh;
  }

  pendingRefresh = sendRuntimeMessage({ type: RuntimeMessageType.GetTabZoom })
    .then((response) => {
      cachedPageZoomFactor = normalizePageZoomFactor(
        response?.ok ? response.zoomFactor : 1
      );
      return cachedPageZoomFactor;
    })
    .finally(() => {
      pendingRefresh = null;
    });

  return pendingRefresh;
}

export function normalizePageZoomFactor(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(MAX_ZOOM_FACTOR, Math.max(MIN_ZOOM_FACTOR, value))
    : 1;
}
