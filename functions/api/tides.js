import { fetchWithTimeout } from '../_lib/fetch.js';
import { json, optionsResponse } from '../_lib/http.js';
import { parseTideForecastHtml } from '../_lib/tides.js';

const TIDE_URL = 'https://www.tide-forecast.com/locations/Auckland-New-Zealand/tides/latest';
const CACHE_TTL_SECONDS = 60 * 30;

async function fetchTidesHtml() {
  const resp = await fetchWithTimeout(TIDE_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    },
    cf: {
      cacheTtl: CACHE_TTL_SECONDS,
      cacheEverything: true,
    },
  }, 15000);

  if (!resp.ok) throw new Error(`Tide upstream returned ${resp.status}`);
  return resp.text();
}

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') return optionsResponse();

  try {
    const html = await fetchTidesHtml();
    const parsed = parseTideForecastHtml(await html);
    return json(parsed, {
      headers: {
        'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
      },
    });
  } catch (error) {
    const status = String(error?.name || '').includes('Abort') ? 504 : 502;
    return json({ error: String(error?.message || error) }, { status });
  }
}
