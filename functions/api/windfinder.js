import { fetchWithTimeout } from '../_lib/fetch.js';
import { json, optionsResponse } from '../_lib/http.js';

const WINDFINDER_URL = 'https://www.windfinder.com/forecast/stanley_point_devonport';

/**
 * Parse Windfinder's astro-island JSON props from HTML.
 * Data is embedded in <astro-island props="..."> attributes.
 * Key islands:
 *   - Island with "initCC": current conditions snapshot
 *   - Island with "layoutData": 3-hourly compact forecast rows
 */
function parseWFIslands(html) {
  const islandRe = /props="([^"]*)"/g;
  const islands = [];
  let m;
  while ((m = islandRe.exec(html)) !== null) {
    try {
      const raw = m[1]
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&#x27;/g, "'");
      islands.push(JSON.parse(raw));
    } catch {
      // skip non-JSON or partial props
    }
  }
  return islands;
}

/** Decode Windfinder's [0, value] or [1, array] encoded props values */
function decode(v) {
  if (!Array.isArray(v)) return v;
  if (v[0] === 0) return v[1];
  if (v[0] === 1) return v[1].map(decode);
  return v[1];
}

function msToKnots(ms) {
  return ms * 1.94384;
}

function kelvinToCelsius(k) {
  return k - 273.15;
}

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') return optionsResponse();

  try {
    const upstream = await fetchWithTimeout(WINDFINDER_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      cf: {
        cacheTtl: 180,
        cacheEverything: false,
      },
    }, 15000);

    if (!upstream.ok) {
      throw new Error(`Windfinder returned HTTP ${upstream.status}`);
    }

    const html = await upstream.text();
    const islands = parseWFIslands(html);

    // --- Current conditions from island with "initCC" ---
    const currentIsland = islands.find(i => i.initCC);
    if (!currentIsland) {
      throw new Error('initCC island not found in Windfinder page');
    }

    const cc = decode(currentIsland.initCC);
    const current = {
      windMs:  cc.ws,
      gustMs:  cc.wg,
      windKn:  msToKnots(cc.ws),
      gustKn:  msToKnots(cc.wg),
      dir:     cc.wd,
      tempC:   kelvinToCelsius(cc.at),
      precipPct: Math.round((cc.p || 0) * 100),
      dtl:     cc.dtl,
      // GFS model data — label clearly as modelled
      source:  'Windfinder / GFS model — Stanley Point, Devonport',
      isModelled: true,
    };

    // --- Compact forecast from island with "layoutData" ---
    const layoutIsland = islands.find(i => i.layoutData);
    let forecast = [];
    if (layoutIsland) {
      const layoutData = decode(layoutIsland.layoutData);
      for (const day of layoutData) {
        const dayDecoded = decode(day);
        const horizons = decode(dayDecoded.horizons);
        for (const h of horizons) {
          const hd = decode(h);
          forecast.push({
            dtl:    hd.dtl,
            windKn: msToKnots(hd.ws),
            gustKn: msToKnots(hd.wg),
            dir:    hd.wd,
          });
        }
      }
    }

    return json({
      ok: true,
      current,
      forecast,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error) }, { status: 502 });
  }
}
