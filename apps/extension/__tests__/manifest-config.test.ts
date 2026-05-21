import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createExtensionManifest,
  EXTENSION_VERSION,
  resolveExtensionKey,
  STABLE_EXTENSION_ID,
  STABLE_EXTENSION_KEY
} from "../manifest.config";

describe("extension manifest identity", () => {
  it("uses the committed public manifest key by default", () => {
    const manifest = createExtensionManifest();

    expect(manifest.key).toBe(STABLE_EXTENSION_KEY);
    expect(extensionIdFromKey(manifest.key)).toBe(STABLE_EXTENSION_ID);
    expect(manifest.version).toBe(EXTENSION_VERSION);
  });

  it("keeps explicit public key overrides deliberate", () => {
    expect(resolveExtensionKey(" custom-public-key ")).toBe("custom-public-key");
  });

  it("falls back to the committed public key for blank overrides", () => {
    expect(resolveExtensionKey("   ")).toBe(STABLE_EXTENSION_KEY);
  });

  it("declares the native popup as the unsupported-page fallback", () => {
    const manifest = createExtensionManifest();

    expect(manifest.action?.default_popup).toBe("popup.html");
  });
});

function extensionIdFromKey(key: string | undefined): string {
  expect(key).toBeTruthy();
  const hash = createHash("sha256")
    .update(Buffer.from(key ?? "", "base64"))
    .digest();
  return Array.from(hash.subarray(0, 16), (byte) => {
    return (
      String.fromCharCode(97 + (byte >> 4)) +
      String.fromCharCode(97 + (byte & 15))
    );
  }).join("");
}
