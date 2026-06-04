# ImmersionKit API Example

`apps/api` is an optional Cloudflare Worker example for asset release metadata
and account-related API contracts. The public branch uses placeholder resource
names and IDs.

## Local Development

```bash
pnpm api:migrate:local
pnpm api:dev
```

Create `apps/api/.dev.vars` for local secrets. Do not commit secrets.

## Asset Release Shape

Asset releases use immutable pack objects plus a manifest pointer:

```text
assets/en-es/manifest.json
assets/en-es/packs/{assetVersion}/{bandId}.json
assets/tts/{languagePair}/piper/{voiceId}/{fileName}
```

`GET /asset-releases?channel=preview&languagePair=en-es` returns active release
metadata and public manifest URLs when `ASSET_PUBLIC_BASE_URL` is configured.

## Deployment

Before deploying, replace placeholder Worker, D1, R2, OAuth, and URL values in
`wrangler.toml` with resources you own.

