import { fetchWithTimeout } from '../_lib/fetch.js';
import { json, optionsResponse } from '../_lib/http.js';

const UPSTREAM_URL = 'https://www.weatherlink.com/embeddablePage/getData/3f5b1b7c23064def84b8b87f51dfc094';

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') return optionsResponse();

  try {
    const upstream = await fetchWithTimeout(UPSTREAM_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://www.weatherlink.com/embeddablePage/show/3f5b1b7c23064def84b8b87f51dfc094/wide',
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      cf: {
        cacheTtl: 120,
        cacheEverything: false,
      },
    }, 15000);

    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        ...Object.fromEntries(upstream.headers),
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    });
  } catch (error) {
    const status = String(error?.name || '').includes('Abort') ? 504 : 502;
    return json({ error: String(error?.message || error) }, { status });
  }
}
