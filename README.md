# BBYC Sailing Race Dashboard

A live race-day conditions dashboard for **Bucklands Beach Yacht Club** (BBYC), built as a static site with serverless API proxies. Displays real-time and forecast wind, tides, a course map, and tactical commentary — all in a single-page layout optimised for tablet use on a club screen or race officer's device.

**Live site:** [digitalworks.nz/sailing/](https://digitalworks.nz/sailing/)

---

## Features

| Feature | Description |
|---|---|
| 🌬️ **Live wind** | Real-time readings from Weathercloud (Devonport North Head) and WeatherLink (ARKHQ Auckland), with auto-fallback |
| 📡 **GFS forecast** | 3-hourly modelled wind via Windfinder (Stanley Point, Devonport) |
| 🌊 **Tides** | Scraped from tide-forecast.com — shows 1 past + up to 5 upcoming tide events |
| 🗺️ **Course map** | Interactive Leaflet map with animated course overlay |
| 📍 **Location** | Auckland Harbour / Hauraki Gulf context |
| 🧭 **Tactics panel** | Auto-generated tactical commentary based on current conditions |

---

## Architecture

```
sailing-race-dashboard/
├── index.html                  # Root redirect page → /sailing/
├── sailing/
│   └── index.html              # Main dashboard SPA (all JS/CSS inline)
├── functions/
│   ├── _lib/
│   │   ├── fetch.js            # fetchWithTimeout helper
│   │   ├── http.js             # json() + CORS helpers
│   │   └── tides.js            # tide-forecast.com HTML parser
│   └── api/
│       ├── weathercloud.js     # Proxy: Weathercloud device values
│       ├── weatherlink.js      # Proxy: WeatherLink current conditions
│       ├── windfinder.js       # Proxy + parser: Windfinder GFS forecast
│       └── tides.js            # Proxy: tide scraper endpoint
├── server.js                   # Legacy Node.js server (Render / local dev)
├── package.json
├── wrangler.toml               # Cloudflare Pages config
├── render.yaml                 # Render.com config (legacy)
└── CLOUDFLARE.md               # Deployment notes
```

### Frontend (`sailing/index.html`)

A fully self-contained single-page app — no build step, no bundler. All CSS and JavaScript are inline. Dependencies loaded from CDN:

- **Leaflet 1.9.4** — interactive course map
- **Chart.js 4.4** — wind history/forecast chart

The dashboard polls the `/api/*` proxy endpoints every ~2 minutes for fresh data.

### Serverless Functions (`functions/api/`)

Each file is a [Cloudflare Pages Function](https://developers.cloudflare.com/pages/functions/) (`export async function onRequest(context)`). They handle CORS and act as a server-side proxy to avoid browser cross-origin restrictions.

| Endpoint | Source | Notes |
|---|---|---|
| `/api/weathercloud` | `app.weathercloud.net` | Device ID `0816548764` (Devonport North Head). Requires `X-Requested-With` spoof. 2-min CF cache. |
| `/api/weatherlink` | WeatherLink API | ARKHQ Auckland station. |
| `/api/windfinder` | `windfinder.com` | HTML-scraped; parses `<astro-island>` JSON props for current + 3-hourly forecast. GFS model data. |
| `/api/tides` | `tide-forecast.com` | HTML-scraped; parses tide table for Auckland. 30-min CF cache. Returns 1 past + 5 upcoming events. |

### Shared Libraries (`functions/_lib/`)

- **`fetch.js`** — `fetchWithTimeout(url, opts, ms)` wrapper
- **`http.js`** — `json(data, init)` response helper with CORS headers baked in; `optionsResponse()` for OPTIONS preflight
- **`tides.js`** — `parseTideForecastHtml(html)` — parses the tide-forecast.com table format, handles the current-day split-column layout, converts 12h → 24h times, sorts by Auckland time, and returns `{ next, events, nowKey, ... }`

---

## Wind Source Priority

The dashboard tries sources in this order:

1. **Weathercloud — Devonport North Head** (live station, preferred)
2. **WeatherLink — ARKHQ Auckland** (live station, fallback)
3. **Windfinder GFS** (modelled, fallback when stations are down)

The active source is shown in the wind panel header.

---

## Local Development

Requires Node.js ≥ 18 and Wrangler.

```bash
npm install
npm run dev       # starts Wrangler Pages dev server (includes /api/* functions)
```

The dev server runs at `http://localhost:8788` by default.

> **Legacy:** `server.js` is a plain Node.js HTTP server (used on Render.com) that serves the same HTML and proxies the same APIs. It still works for local testing without Wrangler:
> ```bash
> npm start        # starts Node server on port 8765
> ```

---

## Deployment

The project is deployed on **Cloudflare Pages**.

```bash
npm run deploy    # wrangler pages deploy .
```

Or push to the connected Git repo — Cloudflare auto-deploys on push to `main`.

**Cloudflare Pages settings:**
- Framework preset: None
- Build command: *(leave blank)*
- Build output directory: `.`
- Custom domain: `digitalworks.nz`

See [`CLOUDFLARE.md`](./CLOUDFLARE.md) for more detail.

---

## Key Design Decisions

- **No build step** — the dashboard HTML is a single file so it's easy to edit and debug without a bundler
- **Cloudflare caching** — tide data cached 30 min, weather 2–3 min; keeps upstream request rate low
- **Graceful fallback** — if a wind station is unavailable, the next source is tried automatically
- **Tide display** — shows 1 past tide (dimmed) + up to 5 upcoming, so race officers always have immediate context
- **GFS labelled clearly** — Windfinder data is flagged `isModelled: true` and shown with a disclaimer in the UI

---

## Data Sources

| Source | URL | Type |
|---|---|---|
| Weathercloud | app.weathercloud.net | Live weather station |
| WeatherLink | weatherlink.com | Live weather station |
| Windfinder | windfinder.com/forecast/stanley_point_devonport | GFS model forecast |
| Tide Forecast | tide-forecast.com/locations/Auckland-New-Zealand | Scraped tide table |
