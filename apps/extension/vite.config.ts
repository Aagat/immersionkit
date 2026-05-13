import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.config";

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
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
  server: {
    port: 5173,
    strictPort: true,
    cors: {
      origin: [/chrome-extension:\/\//]
    }
  }
});
