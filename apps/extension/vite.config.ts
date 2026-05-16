import { crx } from "@crxjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import manifest from "./manifest.config";

export default defineConfig({
  plugins: [react(), tailwindcss(), crx({ manifest })],
  resolve: {
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
        options: new URL("./options.html", import.meta.url).pathname,
        popup: new URL("./popup.html", import.meta.url).pathname
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
});
