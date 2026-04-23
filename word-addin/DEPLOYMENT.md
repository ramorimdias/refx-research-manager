# Refx Word Add-in Deployment

Production now uses path-based hosting:

- Public Refx homepage: `https://refx.667764.xyz/`
- Word add-in frontend: `https://refx.667764.xyz/word/`
- Local companion bridge: `http://127.0.0.1:38474`

Local development remains unchanged:

- Dev frontend: `https://localhost:5174`
- Dev manifest: `word-addin/manifest.xml`

## Central Hosting Config

Hosting values live in:

```text
word-addin/config/hosting.mjs
```

The manifest generator and Vite production build both consume this file. For the current path-based deployment, production is:

```js
origin: 'https://refx.667764.xyz'
basePath: '/word/'
```

If the add-in later moves to a dedicated host such as `https://word.667764.xyz/`, change only:

```js
origin: 'https://word.667764.xyz'
basePath: '/'
```

Then regenerate manifests and rebuild production assets.

## Build Production Assets

From the repository root:

```powershell
pnpm --dir word-addin manifests
pnpm --dir word-addin build:production
```

Deploy the contents of:

```text
word-addin/dist/
```

to the VM location served at:

```text
https://refx.667764.xyz/
```

Expected production URLs after deployment:

- `https://refx.667764.xyz/index.html`
- `https://refx.667764.xyz/download/index.html`
- `https://refx.667764.xyz/tutorials/index.html`
- `https://refx.667764.xyz/about/index.html`
- `https://refx.667764.xyz/word/index.html`
- `https://refx.667764.xyz/word/assets/icon-16.png`
- `https://refx.667764.xyz/word/assets/icon-32.png`
- `https://refx.667764.xyz/word/assets/icon-64.png`
- `https://refx.667764.xyz/word/assets/icon-80.png`

## Manifest Strategy

Generate manifests with:

```powershell
pnpm --dir word-addin manifests
```

Generated files:

- `word-addin/manifest.xml`: local development manifest pointing to `https://localhost:5174`.
- `word-addin/manifest.production.xml`: production manifest pointing to `https://refx.667764.xyz/word/`.

Use `manifest.xml` for local sideloading and debugging. Use `manifest.production.xml` for hosted private beta, organizational deployment, and later Marketplace validation.

## Cloudflare and VM Setup

1. Create a DNS record in Cloudflare:
   - Type: `A` or `CNAME`
   - Name: `refx`
   - Target: your VM IP or hostname.
   - Proxy: either proxied or DNS-only is acceptable, but Office clients must be able to load HTTPS assets without challenge pages.
2. Configure the VM web server/reverse proxy:
   - `/` serves `word-addin/dist/` so the public Refx homepage and pages are available.
   - `/word/` serves the Word add-in task pane page from the same `word-addin/dist/` output.
   - `/privacy`, `/terms`, and `/support` serve the public legal/support pages.
3. Ensure HTTPS is active for `https://refx.667764.xyz`.
4. Avoid auth gates, IP restrictions, Cloudflare bot challenges, or redirects to login for `/word/index.html`, `/word/assets/*`, and the legal/support pages.

## Example Reverse Proxy Shape

The exact syntax depends on Nginx/Caddy/Traefik, but the routing intent is:

```text
https://refx.667764.xyz/        -> homepage web root
https://refx.667764.xyz/word/   -> word-addin/dist/
https://refx.667764.xyz/privacy -> privacy page
https://refx.667764.xyz/terms   -> terms page
https://refx.667764.xyz/support -> support page
```

For path-based static hosting, make sure `/word/` keeps the trailing slash behavior and serves `/word/index.html` correctly.

## Verify Hosting

Before using the production manifest, verify these in a browser:

```text
https://refx.667764.xyz/
https://refx.667764.xyz/download/
https://refx.667764.xyz/tutorials/
https://refx.667764.xyz/about/
https://refx.667764.xyz/word/index.html
https://refx.667764.xyz/word/assets/icon-32.png
https://refx.667764.xyz/privacy
https://refx.667764.xyz/terms
https://refx.667764.xyz/support
```

Then inspect `word-addin/manifest.production.xml` and confirm all add-in asset URLs use `https://refx.667764.xyz/word/`.

## Windows Download Link

The Windows CTA is centralized in:

```text
word-addin/src/site/config.ts
```

Update `windowsDownload.url` when a new GitHub release asset is published. The current link is a stable GitHub `releases/latest/download/...` URL, so only the asset filename/version should need to change when release packaging changes.

## Validate the Production Manifest

Recommended checks:

```powershell
pnpm --dir word-addin manifests
pnpm --dir word-addin build:production
```

If using Microsoft's validation tooling locally, validate:

```text
word-addin/manifest.production.xml
```

## Local Bridge Model

The hosted frontend still calls:

```text
http://127.0.0.1:38474
```

That means the Refx desktop app must be open on the same computer as Word. If the bridge is unavailable, the task pane shows a disconnected banner, recovery steps, and the bridge URL.

This is suitable for controlled beta/private deployment, but it remains the main architecture item to explain before public Marketplace submission.

## Moving Later to `https://word.667764.xyz/`

Change `word-addin/config/hosting.mjs`:

```js
production: {
  origin: 'https://word.667764.xyz',
  basePath: '/',
  supportUrl: 'https://refx.667764.xyz/support',
  privacyUrl: 'https://refx.667764.xyz/privacy',
  termsUrl: 'https://refx.667764.xyz/terms',
}
```

Then run:

```powershell
pnpm --dir word-addin manifests
pnpm --dir word-addin build:production
```

The citation architecture, local bridge URL, task pane code, and Word document state model should remain unchanged.

## Development Flow Remains Unchanged

For local development:

```powershell
pnpm --dir word-addin certs:install
pnpm --dir word-addin dev
```

Then sideload:

```text
word-addin/manifest.xml
```
