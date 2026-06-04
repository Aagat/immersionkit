# ImmersionKit

ImmersionKit is a Chrome MV3 extension for local-first English-to-Spanish
immersion while browsing. It replaces selected words and phrases inline, keeps
learning state in the browser profile, and uses background sentence analysis to
avoid doing expensive language work in the content script.

This public repository contains the extension, shared runtime packages, tests,
benchmarks, and a small set of example English-to-Spanish assets. It does not
include private curriculum/content packs, private import or curation tooling, or
large first-party TTS voice model files.

## Workspace

- `apps/extension`: Chrome extension, content script, background worker, popup,
  options, storage, and extension tests.
- `packages/shared`: shared domain types, curriculum gates, phrase detection,
  scheduler logic, and validation helpers.
- `packages/ui`: shared React UI surfaces used by extension screens.
- `apps/api`: optional Cloudflare Worker example for asset release metadata and
  account-related API contracts.
- `apps/share-site`: optional static site for hosting a packaged extension zip
  and example asset packs.
- `tools/assets`: local asset-pack server and example release-pack builders.
- `tools/smoke`, `tools/benchmarks`: runtime smoke checks and validation lanes.
- `fixtures`: deterministic pages and evaluation fixtures.
- `docs`: public-safe development, architecture, and validation notes.

## Public Assets

The checked-in assets under `apps/extension/src/assets` are compact examples.
They are intended to make the extension runnable and to show the expected asset
schemas. They are not a complete learning deck.

To use your own content, provide assets with the same schemas and point
`VITE_IMMERSIONKIT_ASSET_BASE_URL` at your own asset endpoint or run the local
asset-pack server.

## Quick Start

```bash
pnpm install
pnpm asset-packs:serve
pnpm dev
```

Useful checks:

```bash
pnpm typecheck
pnpm test
pnpm build:local-assets
pnpm smoke:extension:build
```

`pnpm build:local-assets` builds the extension against the local asset-pack
server URL. `pnpm smoke:extension:build` builds the extension and runs a
headless browser smoke test against public example fixtures.

## Documentation

- [Docs index](./docs/README.md)
- [Getting started](./docs/development/getting-started.md)
- [Architecture](./docs/engineering/architecture.md)
- [Extension assets](./apps/extension/src/assets/README.md)
- [Validation](./docs/validation/README.md)
- [Agent guide](./AGENTS.md)

