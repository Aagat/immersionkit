---
name: extension-visual-validation
description: Validate ImmersionKit extension screens in a real installed Chromium extension and capture browser screenshots. Use when Codex needs to visually inspect popup, options, injected word/phrase popovers, sentence help, or runtime extension behavior after UI/content-script changes.
---

# Extension Visual Validation

Use this skill for installed-extension visual QA. It launches Chromium with the built MV3 extension, seeds local settings, serves a small article fixture, clicks injected word/phrase/sentence targets, captures screenshots, and writes a JSON report.

Do not use old generated public-preview PNGs as a visual source of truth. Validate live UI surfaces and real installed-extension behavior.

## Quick Start

From the repo root:

```bash
pnpm build:local-assets
node .agents/skills/extension-visual-validation/scripts/installed-extension-visual-validation.mjs \
  --repo-root "$PWD" \
  --out-dir /tmp/immersionkit-visual-pass/extension
```

The script runs Chromium headless by default and still captures screenshots.
Pass `--headed` only when actively inspecting the browser. On Linux headed runs
use the repo helper that selects the user-owned headed display. In the current
local setup that means `DISPLAY=:1` when `DISPLAY` is missing or points at the
root-owned display.

## Outputs

The script writes:

- `01-installed-article.png`
- `02-installed-popup.png`
- `03-installed-options-general.png`
- `04-installed-options-translation.png`
- `05-clicked-injected-word.png`
- `06-clicked-injected-phrase.png`
- `07-clicked-sentence-help.png` when sentence help opens
- `07-clicked-sentence-help-failed.png` when the sentence note renders but does not open a popover
- `validation-report.json`

Treat `validation-report.json` as the run summary. A screenshot can exist even when an interaction failed; check the report booleans before calling validation complete.

## Workflow

1. Build the extension first with `pnpm build:local-assets` unless `apps/extension/dist/manifest.json` already reflects the current code.
2. Run the bundled script.
3. Inspect `validation-report.json` for counts and interaction success.
4. Open screenshots directly if the report shows missing tokens, missing phrases, or failed popover text checks.
5. Fix UI/runtime issues in the repo, rebuild, and rerun the script.

## Notes

- The script starts `tools/assets/asset-pack-server.mjs` on port `8787`; if the port is already in use, it assumes the local asset server is already running.
- The script creates an isolated Chromium user-data directory and removes it after the run.
- The script seeds IndexedDB user-data directly from the extension service worker so the fixture starts enabled with discovery rate `1`.
- Popup capture tries `chrome.action.openPopup()` first and falls back to opening `popup.html` directly.
