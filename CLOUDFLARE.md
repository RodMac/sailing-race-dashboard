# Cloudflare deployment notes

This app is now shaped for **Cloudflare Pages + Pages Functions**:

- `index.html` = root landing page
- `sailing/index.html` = sailing dashboard frontend
- `functions/api/weathercloud.js` = Weathercloud proxy
- `functions/api/weatherlink.js` = WeatherLink proxy
- `functions/api/tides.js` = tide scraper/parser

## Local dev

```bash
npm install
npm run dev
```

That should serve the static site plus `/api/*` locally via Wrangler.

## Cloudflare Pages setup

1. Create a new **Pages** project in Cloudflare.
2. Connect the Git repo, or deploy this folder directly with Wrangler.
3. Build settings:
   - **Framework preset:** None
   - **Build command:** leave blank
   - **Build output directory:** `.`
4. Custom domain:
   - add `digitalworks.nz`
   - point DNS to Cloudflare if the domain is elsewhere

## Notes

- `server.js` is the old Node/Render version and can still be used locally if needed.
- For Cloudflare hosting, the active server-side code is in `functions/`.
