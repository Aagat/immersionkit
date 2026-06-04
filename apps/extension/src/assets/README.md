# Extension Assets

This public branch ships compact example assets only. They are enough to run the
extension, local asset-pack server, tests, and smoke checks. They are not a
complete curriculum/content deck.

Included files:

- `en-es.lexemes.v1.json`
- `en-es.render-units.v1.json`
- `en-es.phrase-targets.v1.json`

Private content assets, private import/curation tooling, and large first-party
TTS voice model files are intentionally excluded.

## Format Notes

- Assets use deterministic schema versions and asset versions.
- Lexeme assets describe learning inventory.
- Render-unit assets describe approved inline or phrase render sources.
- Phrase target assets provide exact curated targets for runtime phrase matches.
- Fixed phrase examples live in
  `packages/shared/src/phrases/fixed-phrases.generated.ts`.

## Runtime Loading

1. Background loads versioned asset packs from
   `VITE_IMMERSIONKIT_ASSET_BASE_URL/en-es/manifest.json`.
2. Pack metadata, render units, and lexemes are cached in IndexedDB.
3. Content asks background for the active asset context.
4. If no cached pack exists and no asset endpoint is available, pack-backed
   rendering stays off for that page.
5. `pnpm asset-packs:serve` serves packs generated from these public examples.

To use your own content, create assets with the same schemas and point the
extension at your own asset endpoint.

