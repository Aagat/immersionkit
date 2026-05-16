import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "ImmersionKit",
  version: "0.1.0",
  description: "English-to-Spanish browsing immersion extension MVP.",
  permissions: ["activeTab", "scripting", "storage"],
  host_permissions: ["http://*/*", "https://*/*"],
  action: {},
  options_page: "options.html",
  background: {
    service_worker: "src/background/index.ts",
    type: "module"
  },
  web_accessible_resources: [
    {
      resources: ["popup.html", "assets/*"],
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
