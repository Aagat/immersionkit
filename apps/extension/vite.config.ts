import { crx } from "@crxjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { createExtensionManifest } from "./manifest.config";

const extensionRoot = new URL(".", import.meta.url).pathname;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, extensionRoot, "");

  return {
    plugins: [
      react(),
      tailwindcss(),
      crx({
        manifest: createExtensionManifest({
          extensionKey: env.VITE_IMMERSIONKIT_EXTENSION_KEY
        })
      })
    ],
    resolve: {
      conditions: ["onnxruntime-web-use-extern-wasm"],
      alias: {
        "@": new URL("../../packages/ui/src", import.meta.url).pathname,
        "@immersionkit/ui/styles.css": new URL(
          "../../packages/ui/src/styles.css",
          import.meta.url
        ).pathname,
        "@immersionkit/ui": new URL(
          "../../packages/ui/src/index.ts",
          import.meta.url
        ).pathname
      }
    },
    build: {
      rollupOptions: {
        input: {
          debug: new URL("./debug.html", import.meta.url).pathname,
          options: new URL("./options.html", import.meta.url).pathname,
          popup: new URL("./popup.html", import.meta.url).pathname,
          ttsOffscreen: new URL("./tts-offscreen.html", import.meta.url).pathname
        }
      }
    },
    server: {
      port: 5173,
      strictPort: true,
      cors: {
        origin: [/chrome-extension:\/\//]
      }
    }
  };
});
