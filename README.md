# BBYC Sailing Race Dashboard

A live race-day conditions dashboard for **Bucklands Beach Yacht Club** (BBYC), built as a static site with Cloudflare Pages Functions. It combines wind, tide, course geometry, and per-leg tactical guidance in a single-page dashboard designed for race-day use.

**Live site:** [digitalworks.nz/sailing/](https://digitalworks.nz/sailing/)

---

## Features

| Feature | Description |
|---|---|
| 🌬️ **Wind panel** | Current wind from the selected forecast/model source, with source badge and status |
| 📈 **3-day forecast** | Forecast chart with MetService as preferred source, plus Open-Meteo and Windfinder fallbacks |
| 🌊 **Tides** | Live Auckland tide table from tide-forecast.com, showing 1 past plus multiple upcoming tides |
| 🗺️ **Course map** | Interactive Leaflet map with route animation, wind-dependent leg colouring, and waypoint markers |
| 🧭 **Tactics panel** | Per-leg tactical guidance that blends wind angle, tide set, current assistance, forecast trend, and clearer confidence-aware explanation |
| 🚦 **Start-line planner** | Estimated start line by default, plus captured committee boat end and pin/buoy end from phone GPS for real start geometry |
| 📍 **Race context** | Dynamic start positioning, mark order display, and Hauraki Gulf context for club racing |

---

## Architecture

```text
sailing-race-dashboard/
├── index.html                         # Root landing page / redirect to /sailing/
├── sailing/
│   └── index.html                     # Main dashboard SPA (HTML/CSS/JS inline)
├── functions/
│   ├── _lib/
│   │   ├── fetch.js                   # fetchWithTimeout helper
│   │   ├── http.js                    # JSON + CORS helpers
│   │   └── tides.js                   # tide-forecast.com parser helpers
│   └── api/
│       ├── metservice.js              # MetService proxy
│       ├── tides.js                   # Auckland tides proxy
│       └── windfinder.js              # Windfinder parser/proxy
├── server.js                          # Legacy local/dev server
├── package.json
├── wrangler.toml                      # Cloudflare Pages config
├── CLOUDFLARE.md                      # Cloudflare overview notes
├── CLOUDFLARE-SETUP-NOTES.md          # Local recovery + deploy notes
└── render.yaml                        # Legacy Render config
```

### Frontend (`sailing/index.html`)

The dashboard is intentionally a single self-contained page. There is no build step and no framework bundle. CSS and JavaScript are inline, which makes field edits and recovery simpler.

CDN dependencies:
- **Leaflet 1.9.4** for the map
- **Chart.js 4.4** for the forecast chart

Key frontend behavior:
- course geometry includes finish legs and dynamic-start handling
- route legs are classified from current wind angle
- tactics recalculate from selected course, forecast window, wind, tide state, and start-line state
- tide state is derived from surrounding tide events and recomputed per timestamp for later-leg accuracy
- wind and tide changes can trigger course redraws and tactic refreshes
- start-line UI defaults to an estimated line, but can capture real committee boat end and pin/buoy end from phone GPS

### Pages Functions (`functions/api/`)

Each endpoint runs as a Cloudflare Pages Function and keeps upstream fetches server-side.

| Endpoint | Source | Purpose |
|---|---|---|
| `/api/metservice` | MetService Point Forecast API | Preferred NZ forecast source |
| `/api/windfinder` | Windfinder forecast page | Forecast fallback and parser source |
| `/api/tides` | tide-forecast.com | Auckland tide events and current tide state |

### Shared helpers (`functions/_lib/`)

- **`fetch.js`**: timeout wrapper for upstream requests
- **`http.js`**: JSON response and CORS helpers
- **`tides.js`**: parser for Auckland tide table HTML and event normalization

---

## Wind and Tide Logic

### Wind source priority

The dashboard now prefers forecast/model sources in this order:

1. **MetService Point Forecast**
2. **Open-Meteo**
3. **Windfinder GFS**

The active source is shown in the UI, and forecast loading falls back across those sources when needed.

### Tactics model

The tactics panel is no longer meant to be tide-only commentary. It now combines:
- current wind direction and speed
- forecast wind trend over the estimated race window
- tide phase derived from bracketed high/low events, not just a cached ebb/flood label
- per-leg bearing and TWA classification
- cross-tide and along-tide impact per leg
- confidence-aware language near slack water or tide turns

The model now recomputes tide state per timestamp so later legs can differ materially from early legs when the tide is easing, near slack, or turning during the race window.

Typical leg modes include:
- very tight beat
- normal beat
- open beat
- tight reach
- beam reach
- broad reach
- hot run
- square-ish run
- deep run

Each leg also shows **TWA** so the tactical read can be sanity-checked quickly.

### Start-line model

There are now two start-line modes:

1. **Estimated start line**
   - used by default when no real line has been captured
   - placed about 1 NM downwind of Mark 1
   - oriented approximately square to true wind
   - clearly labeled as estimated and used only for planning guidance

2. **Captured start line**
   - uses phone GPS when the user taps:
     - `Mark committee boat end`
     - `Mark pin/buoy end`
   - redraws the course immediately
   - updates tactics/start-line advice immediately
   - moves the committee-boat/start icon to the captured committee boat end

The map distinguishes estimated vs captured line styles, and the tactics panel separates:
- **Line bias**
- **Tactical view**
- **Why**

---

## Local Development

Requires Node.js 18+ and Wrangler.

```bash
npm install
npm run dev
```

That starts the Wrangler Pages dev server with `/api/*` routes available locally.

Legacy local server if needed:

```bash
npm start
```

---

## Deployment

This project is deployed on **Cloudflare Pages**.

Required secret:
- `METSERVICE_API_KEY`

### Preview deploy

Deploy to the project named in `wrangler.toml`:

```bash
npx wrangler pages deploy . --commit-dirty=true
```

### Live deploy for `digitalworks.nz/sailing/`

Deploy explicitly to the live Pages project:

```bash
npx wrangler pages deploy . --project-name sailing-dashboard --commit-dirty=true
```

Important: local config points at `bbyc-sailing`, but the live custom domain is attached to **`sailing-dashboard`**.

See:
- [`CLOUDFLARE.md`](./CLOUDFLARE.md)
- [`CLOUDFLARE-SETUP-NOTES.md`](./CLOUDFLARE-SETUP-NOTES.md)

---

## Recovery Notes

If starting fresh on the machine, begin with:
- `sailing/index.html`
- `wrangler.toml`
- `CLOUDFLARE-SETUP-NOTES.md`

For recent feature context, also check:
- start-line controls in the map control stack inside `sailing/index.html`
- `renderTactics(course, geometry)`
- `getCourseGeometry(course)`
- `deriveTideState(data)`

Useful checks:

```bash
git status
npx wrangler whoami
```

Then deploy either preview or live depending on what needs updating.

---

## Key Design Decisions

- **Single-file frontend** for easy editing and recovery
- **Cloudflare Pages Functions** for safe server-side API access
- **Model-source fallback** instead of dependence on unreliable live station feeds
- **Per-leg tactical analysis** driven by wind angle plus tide interaction and timestamp-based tide state recomputation
- **Estimated vs captured start-line workflow** so phone GPS can be used on race day without waiting for official line data
- **Operational notes kept locally** because deployment structure is slightly confusing across multiple Pages projects

---

## Live URLs and project shape

Observed hosts have included:
- `https://digitalworks.nz`
- `https://bbyc-sailing.pages.dev`
- `https://sailing-dashboard.pages.dev`

The main user-facing dashboard lives at:
- `https://digitalworks.nz/sailing/`
