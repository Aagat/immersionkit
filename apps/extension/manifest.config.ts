import { defineManifest } from "@crxjs/vite-plugin";
import extensionIdentity from "./extension-identity.json";

declare const process: { env?: Record<string, string | undefined> };

interface ExtensionManifestOptions {
  extensionKey?: string | null;
}

export const STABLE_EXTENSION_ID = extensionIdentity.expectedExtensionId;
export const STABLE_EXTENSION_KEY =
  extensionIdentity.publicManifestKeyParts.join("");

export function resolveExtensionKey(extensionKey?: string | null): string {
  return extensionKey?.trim() || STABLE_EXTENSION_KEY;
}

export function createExtensionManifest(options: ExtensionManifestOptions = {}) {
  const extensionKey = resolveExtensionKey(options.extensionKey);
  return defineManifest({
    manifest_version: 3,
    name: "ImmersionKit",
    short_name: "ImmersionKit",
    version: "0.1.0",
    description:
      "Learn Spanish while browsing with calm inline word and phrase support, local progress, and optional sentence help.",
    key: extensionKey,
    icons: {
      16: "icons/icon-16.png",
      32: "icons/icon-32.png",
      48: "icons/icon-48.png",
      128: "icons/icon-128.png"
    },
    permissions: [
      "activeTab",
      "identity",
      "offscreen",
      "scripting",
      "storage",
      "tts"
    ],
    host_permissions: ["http://*/*", "https://*/*"],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
    },
    action: {
      default_title: "ImmersionKit",
      default_icon: {
        16: "icons/icon-16.png",
        32: "icons/icon-32.png",
        48: "icons/icon-48.png",
        128: "icons/icon-128.png"
      }
    },
    options_page: "options.html",
    background: {
      service_worker: "src/background/index.ts",
      type: "module"
    },
    web_accessible_resources: [
      {
        resources: ["popup.html", "debug.html", "assets/*"],
        matches: ["http://*/*", "https://*/*"]
      }
    ],
    content_scripts: [
      {
        matches: ["http://*/*", "https://*/*"],
        js: ["src/content/index.ts"],
        run_at: "document_idle"
      }
    ]
  });
}

export default createExtensionManifest({
  extensionKey: process.env?.VITE_IMMERSIONKIT_EXTENSION_KEY
});
