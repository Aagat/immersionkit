import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const extensionRoot = path.resolve(__dirname, "../..");
const workspaceRoot = path.resolve(__dirname, "../../../..");

export default defineConfig({
  root: extensionRoot,
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
    fs: {
      allow: [workspaceRoot]
    }
  }
});
