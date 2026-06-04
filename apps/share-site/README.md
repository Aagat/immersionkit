# ImmersionKit Share Site Example

`apps/share-site` builds a static page that can host a packaged extension zip
and optional example asset packs.

Build locally:

```bash
pnpm share-site:build
pnpm share-site:serve
```

Build with an explicit public URL:

```bash
IK_SHARE_SITE_PUBLIC_BASE_URL=https://example.com pnpm share-site:build
```

The generated `apps/share-site/dist` directory includes:

- `index.html`
- `downloads/immersionkit-extension-preview.zip`
- media used by the page
- `release.json` with machine-readable package metadata

When `IK_SHARE_EXTENSION_ASSET_BASE_URL` points outside
`IK_SHARE_SITE_PUBLIC_BASE_URL`, the extension uses that external asset
endpoint. When it points at the share-site `/assets` path, the build includes
hosted example asset packs for a self-contained static demo.

