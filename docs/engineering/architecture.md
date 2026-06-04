# Architecture

ImmersionKit is a Chrome MV3 extension with a local-first learning loop.

## Runtime Boundaries

- Content script: scans eligible page text, shortlists sentences, renders inline
  learning UI, and records local interaction evidence.
- Background worker: owns sentence analysis, asset context loading, caches,
  account/API contracts, TTS orchestration, and durable learning services.
- Shared package: provides domain models, curriculum gates, phrase detection,
  scheduling policy, text normalization, and validation helpers.
- UI package: provides shared React screens and UI components used by extension
  surfaces.

The content script should not perform expensive linguistic analysis. It should
ask the background worker for analysis and asset context.

## Asset Loading

The public branch includes compact example assets. Runtime lexeme and render
unit data is normally loaded through versioned asset packs from
`VITE_IMMERSIONKIT_ASSET_BASE_URL`. The local asset-pack server can serve packs
built from the public examples.

Phrase target examples are bundled so background sentence analysis can resolve
curated runtime phrase targets without a private content deck.

## Storage

Learning state is stored in the browser profile. Durable state includes
settings, vocabulary status, learning items, phrase registry entries, review
events, sentence analysis cache entries, and asset-pack cache data.

Page occurrences are ephemeral; durable learning items are keyed by stable
lexeme, render-unit, phrase, or grammar IDs.

## Privacy Constraints

Keep page text, sentence text, source/target inline text, full URLs, provider
keys, user vocabulary, phrase registry rows, and review history local unless a
future public design explicitly changes that boundary.

Content scripts must not receive account/API tokens or call backend APIs
directly.

## Optional Services

`apps/api` and `apps/share-site` are optional examples for asset metadata,
account/API contracts, and static extension package hosting. They use placeholder
resource names in this branch and should be configured with your own resources
before deployment.

