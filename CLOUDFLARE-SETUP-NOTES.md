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
9. Tactics summary now shows:
   - Tide now
   - Race period tide
   - Wind now
   - Race period wind
   - Overall impact
10. Per-leg tactics now explicitly use wind angle and classify each leg into modes like very tight beat, open beat, tight reach, beam reach, broad reach, hot run, square-ish run, and deep run.
11. Each leg now shows TWA in the title to help sanity-check the tactical read.
12. Tactics should blend wind mode with cross-tide and along-tide effects, so repeated legs should no longer all get the same tide-only advice.
13. Tide timing for tactics now depends on explicit parsed timestamps for past and next tide events. If that fails, the fallback text should be `Tide timing unavailable`, not `Tide timing loading`.
14. For live custom-domain updates to `digitalworks.nz/sailing/`, deploy with the live Pages project name: `sailing-dashboard`.

## Where to inspect the fixes
- Main app: `sailing/index.html`
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
5. For preview testing on the local-config project: `npx wrangler pages deploy . --commit-dirty=true`
6. For real live update to `digitalworks.nz/sailing/`: `npx wrangler pages deploy . --project-name sailing-dashboard --commit-dirty=true`
7. Verify both:
   - preview `/sailing/`
   - live `https://digitalworks.nz/sailing/`
8. If starting cold, the main files to inspect first are:
   - `sailing/index.html`
   - `wrangler.toml`
   - `CLOUDFLARE-SETUP-NOTES.md`

## Open question still worth checking later
Rationalize or document the overlapping `bbyc-sailing` and `sailing-dashboard` Pages projects so future deploys are less confusing.
