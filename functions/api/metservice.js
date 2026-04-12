import { fetchWithTimeout } from '../_lib/fetch.js';
import { json, optionsResponse } from '../_lib/http.js';

const METSERVICE_POINT_URL = 'https://forecast-v2.metoceanapi.com/point/time';
const DEFAULT_HOURS = 12;
const MAX_HOURS = 120;
const LAT = '-36.831';
const LON = '174.791';
const VARIABLES = 'wind.speed.at-10m,wind.speed.gust.at-10m,wind.direction.at-10m,air.temperature.at-2m';

function buildTimeRange(hoursAhead) {
  const from = new Date();
  from.setUTCMinutes(0, 0, 0);
  const to = new Date(from.getTime() + (hoursAhead * 60 * 60 * 1000));
  return { from: from.toISOString(), to: to.toISOString() };
}

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') return optionsResponse();

  try {
    const apiKey = context.env?.METSERVICE_API_KEY;
    if (!apiKey) {
      return json({ error: 'METSERVICE_API_KEY is not configured' }, { status: 500 });
    }

    const url = new URL(context.request.url);
    const requestedHours = Number(url.searchParams.get('hours') || DEFAULT_HOURS);
    const hoursAhead = Number.isFinite(requestedHours)
      ? Math.max(1, Math.min(MAX_HOURS, Math.round(requestedHours)))
      : DEFAULT_HOURS;

    const { from, to } = buildTimeRange(hoursAhead);
    const upstreamUrl = new URL(METSERVICE_POINT_URL);
    upstreamUrl.search = new URLSearchParams({
      lat: LAT,
      lon: LON,
      variables: VARIABLES,
      interval: '1h',
      from,
      to,
    }).toString();

    const upstream = await fetchWithTimeout(upstreamUrl.toString(), {
      headers: {
        'x-api-key': apiKey,
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      cf: {
        cacheTtl: 300,
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
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (error) {
    const status = String(error?.name || '').includes('Abort') ? 504 : 502;
    return json({ error: String(error?.message || error) }, { status });
  }
}
