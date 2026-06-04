# Getting Started

## Prerequisites

- Node.js compatible with the workspace toolchain.
- `pnpm`.
- Chromium or Chrome for extension smoke and browser validation checks.

## Install

```bash
pnpm install
```

## Local Extension Development

Start the local asset-pack server:

```bash
pnpm asset-packs:serve
```

In another shell, start the extension dev server:

```bash
pnpm dev
```

The extension uses the public manifest key in
`apps/extension/extension-identity.json` for a stable unpacked extension ID.
Override it only for your own builds, and do not commit private keys.

## Build

```bash
pnpm build
pnpm build:local-assets
```

`pnpm build:local-assets` points the built extension at the local asset-pack
server URL. Use it when testing packaged extension behavior with the public
example assets.

## Optional API Example

The `apps/api` Worker is an example service for asset release metadata and
account-related contracts. It is configured with placeholder resource names.
Create your own `.dev.vars` and Cloudflare resources before deploying it.

```bash
pnpm api:migrate:local
pnpm api:dev
```

## Checks

```bash
pnpm typecheck
pnpm test
pnpm smoke:extension:build
```

