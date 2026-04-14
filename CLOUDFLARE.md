# Cloudflare deployment notes

This app runs as a **Cloudflare Pages** site with **Pages Functions**.

## Active project layout

- `index.html` = root landing page / redirect entry
- `sailing/index.html` = main dashboard frontend
- `functions/api/metservice.js` = preferred forecast proxy
- `functions/api/windfinder.js` = fallback forecast/parser proxy
- `functions/api/tides.js` = Auckland tide proxy/parser endpoint

## Important deployment reality

There are two relevant Pages projects in play:

- **`bbyc-sailing`**: the project named in local `wrangler.toml`
- **`sailing-dashboard`**: the live Pages project attached to `digitalworks.nz`

That means:
- `npx wrangler pages deploy .` deploys to the local-config project
- `npx wrangler pages deploy . --project-name sailing-dashboard` deploys to the live custom-domain project

If the goal is to update `https://digitalworks.nz/sailing/`, use the explicit `--project-name sailing-dashboard` deploy.

## Local dev

```bash
npm install
npm run dev
```

That serves the static site and `/api/*` locally via Wrangler.

## Cloudflare Pages settings

- **Framework preset:** None
- **Build command:** leave blank
- **Build output directory:** `.`

## Required secret

Set this Pages secret/variable before deploying:

- `METSERVICE_API_KEY`

## Recommended deploy commands

### Preview / local-config project

```bash
npx wrangler pages deploy . --commit-dirty=true
```

### Live custom-domain project

```bash
npx wrangler pages deploy . --project-name sailing-dashboard --commit-dirty=true
```

## Current app notes worth knowing

- Wind source preference is now forecast-first: MetService, then Open-Meteo, then Windfinder.
- Tactics are intended to blend wind angle plus tide, not just summarize tide.
- The route renderer includes finish legs and dynamic-start geometry.
- `server.js` and `render.yaml` are legacy and mainly useful for local fallback or historical context.

## Recovery

For a cold restart on this machine, read these first:
- `README.md`
- `CLOUDFLARE-SETUP-NOTES.md`
- `sailing/index.html`
