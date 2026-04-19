# Cloudflare setup and recovery notes for sailing dashboard

## Repo and deploy source of truth
- Local repo: `/Users/mea/.openclaw/workspace/bbyc-sailing`
- Git remote: `https://github.com/RodMac/sailing-race-dashboard.git`
- Cloudflare account: `Rodney.mea@gmail.com's Account`
- Account ID: `59b0288679754a624b2eabd8715be8bb`
- Wrangler auth verified with `npx wrangler whoami`
- Pages project in local config: `bbyc-sailing`
- Main live custom-domain project: `sailing-dashboard`
- Config file: `wrangler.toml`
- Deploy command for preview path used locally: `npx wrangler pages deploy .`
- Deploy command for the real live custom domain: `npx wrangler pages deploy . --project-name sailing-dashboard`

## Public hosts observed serving the same app
- `https://digitalworks.nz`
- `https://bbyc-sailing.pages.dev`
- `https://sailing-dashboard.pages.dev`

All three currently serve the same landing page at `/` and redirect to `/sailing/`, where the race dashboard lives.

## Important caveat
The local repo is configured around `bbyc-sailing`, but the real custom domain `digitalworks.nz` is attached to the Cloudflare Pages project `sailing-dashboard`. If the goal is to update the live main page, deploy to `sailing-dashboard`, not just `bbyc-sailing`.

## Latest known good previews
- live-project preview: `https://072ef25d.sailing-dashboard.pages.dev`
- `https://2725c14b.bbyc-sailing.pages.dev`
- `https://e94435c0.bbyc-sailing.pages.dev`
- `https://e12bed2e.bbyc-sailing.pages.dev`
- `https://1fa41efd.bbyc-sailing.pages.dev`
- `https://c850f187.bbyc-sailing.pages.dev`
- older preview from prior work: `https://73da666f.bbyc-sailing.pages.dev`

## Current dashboard behavior to remember
1. Course geometry includes the final finish leg in the rendered route geometry.
2. Rum race and other dynamic-start courses use the same route geometry pipeline as normal courses.
3. Final-leg handling toward Karaka Light is included in the displayed route geometry.
4. Weathercloud and WeatherLink were removed entirely because they were not reliable.
5. MetService is the default selected wind source, with Open-Meteo and Windfinder retained as model fallbacks.
6. Forecast panel is now a 3-day wind forecast, not 5-day.
7. Forecast model switching must only use a source with actual forecast data, with fallback order from the selected model to the other model sources.
8. Tactics are intended to refresh when the selected model changes.
9. Tactics summary now focuses on readable decision-driving text, not raw data dump.
10. Per-leg tactics explicitly use wind angle and classify each leg into modes like very tight beat, open beat, tight reach, beam reach, broad reach, hot run, square-ish run, and deep run.
11. Tactics now separate tide direction from tide strength/confidence and recompute tide state per timestamp from bracketed tide events.
12. Ebb/flood must be derived from high/low event order:
   - Low → High = flood
   - High → Low = ebb
13. Start-line system now has two states:
   - Estimated start line (default, planning only)
   - Captured start line (committee boat end + pin/buoy end)
14. Captured start line should use phone GPS from the start-line buttons, not map taps.
15. When committee boat end is captured, the start/boat icon should move to that real captured location.
16. Start-line tactics should separate:
   - Line bias
   - Tactical view
   - Why
17. For live custom-domain updates to `digitalworks.nz/sailing/`, deploy with the live Pages project name: `sailing-dashboard`.

## Where to inspect the fixes
- Main app: `sailing/index.html`
- Important frontend sections inside `sailing/index.html`:
  - map control stack buttons
  - `deriveTideState(data)`
  - `getCourseGeometry(course)`
  - `renderTactics(course, geometry)`
  - GPS capture helpers / location watch logic
- Pages Functions:
  - `functions/api/metservice.js`
  - `functions/api/tides.js`
  - `functions/api/windfinder.js`

## Recommended documentation location
Do not rely on GitHub alone for this operational setup note.

Reason:
- GitHub is fine for code and general docs
- but this setup note contains account structure, deployment behavior, and recovery details tied to Rod's logged-in environment
- keeping the recovery note local is safer and faster for incident recovery

## Local recovery doc location
- `/Users/mea/.openclaw/workspace/bbyc-sailing/CLOUDFLARE-SETUP-NOTES.md`

## Quick recovery checklist
1. `cd /Users/mea/.openclaw/workspace/bbyc-sailing`
2. `git status`
3. `npx wrangler whoami`
4. `python3 - <<'PY' ... extract inline script ... PY` then `node --check /tmp/dashboard-script.js`
5. If start-line capture/GPS behavior is under test, make sure the latest code is on the live custom-domain project, not only a preview URL.
6. For preview testing on the local-config project: `npx wrangler pages deploy . --commit-dirty=true`
7. For real live update to `digitalworks.nz/sailing/`: `npx wrangler pages deploy . --project-name sailing-dashboard --commit-dirty=true`
8. Verify both:
   - preview `/sailing/`
   - live `https://digitalworks.nz/sailing/`
9. On phone, confirm:
   - GPS permission granted
   - `Mark committee boat end` captures current device location
   - `Mark pin/buoy end` captures current device location
   - boat icon moves to committee boat end after capture
   - course/tactics redraw immediately after capture
10. If starting cold, the main files to inspect first are:
   - `sailing/index.html`
   - `wrangler.toml`
   - `CLOUDFLARE-SETUP-NOTES.md`

## Cleanup and documentation note
- On 2026-04-15, transient workspace artifacts were cleaned up from the workspace root and `tmp/`, mainly old browser screenshots and annotated setup captures.
- These images were treated as disposable because the useful recovery information is now recorded in this file and `../TOOLS.md`.
- Going forward, prefer updating these local docs over retaining batches of screenshots.

## Open question still worth checking later
Rationalize or document the overlapping `bbyc-sailing` and `sailing-dashboard` Pages projects so future deploys are less confusing.

## 2026-04-19 dashboard iteration notes
- Trends section was simplified to focus on race-day use: Live Conditions now emphasizes wind speed, direction, gusts, tide now, temperature, and rain. Trends Over Race Period now emphasizes wind, tide, and estimated race length.
- Race timing display was refined to show hours/minutes instead of decimal hours, and the forecast-window note now sits under estimated race length.
- Wind trend had a real bug where `getForecastWindowSummary()` returned an undefined `model` symbol, which could leave the trend stuck on loading despite visible forecast data. That was fixed locally in `sailing/index.html`.
- Tactics engine was iteratively reworked multiple times on 2026-04-19. The current direction is a scored wind-vs-tide method that should:
  - classify each leg as upwind / reach / run
  - score wind importance vs tide importance
  - avoid overusing `Tide matters most`
  - keep upwind legs wind-led by default unless current genuinely dominates
  - output compact `Focus / Call / Why` rows
- Tactics UI layout was also tightened to improve mobile readability: more separation between cards, clearer hierarchy, summary rows, and a visually separated start-line block.
- Map overlays now include both wind animation and a separate blue tide/current animation layer. Wind is brighter white; tide/current is darker blue and should move faster/more clearly when current is stronger.
- Label cleanup requested by Rod and applied in `sailing/index.html`:
  - `Karaka Light (Fl.G.3s)` -> `Karaka Light`
  - `Rangitoto Race Buoy (13)` -> `Rangitoto Race Buoy`
  - Trends heading -> `TRENDS OVER RACE PERIOD`
- If preview URLs appear inconsistent, verify the actual deployment with `wrangler pages deployment list`; some preview links have returned 404 even when Wrangler reported success. For stakeholder testing, prefer verifying the live custom-domain deploy at `https://digitalworks.nz/sailing/`.
