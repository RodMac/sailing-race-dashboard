// Simple proxy server for BBYC Race Dashboard
// Serves the HTML and proxies weather APIs to avoid CORS issues
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8765;

let tideCache = { fetchedAt: 0, data: null };
let metserviceCache = new Map();

function proxyGet(options, res) {
  const proxyReq = https.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    proxyRes.pipe(res);
  });
  proxyReq.on('error', (e) => {
    res.writeHead(502);
    res.end(JSON.stringify({ error: e.message }));
  });
  proxyReq.end();
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      }
    }, (resp) => {
      let data = '';
      resp.on('data', chunk => data += chunk);
      resp.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.end();
  });
}

function fetchJsonUrl(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'GET',
      headers,
    }, (resp) => {
      let data = '';
      resp.on('data', chunk => data += chunk);
      resp.on('end', () => {
        if (resp.statusCode < 200 || resp.statusCode >= 300) {
          reject(new Error(`Upstream returned ${resp.statusCode}: ${data.slice(0, 160)}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

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
      // skip non-JSON props
    }
  }
  return islands;
}

function decode(v) {
  if (!Array.isArray(v)) return v;
  if (v[0] === 0) return v[1];
  if (v[0] === 1) return v[1].map(decode);
  return v[1];
}

function unwrapScalar(v) {
  if (Array.isArray(v) && v.length >= 2 && (v[0] === 0 || v[0] === 1)) return unwrapScalar(v[1]);
  return v;
}

function msToKnots(ms) {
  const n = Number(unwrapScalar(ms));
  return Number.isFinite(n) ? n * 1.94384 : null;
}

function kelvinToCelsius(k) {
  const n = Number(unwrapScalar(k));
  return Number.isFinite(n) ? n - 273.15 : null;
}

async function getWindfinderData() {
  const html = await fetchText('https://www.windfinder.com/forecast/stanley_point_devonport');
  const islands = parseWFIslands(html);
  const currentIsland = islands.find(i => i.initCC);
  if (!currentIsland) throw new Error('initCC island not found in Windfinder page');

  const cc = decode(currentIsland.initCC);
  const current = {
    windMs: Number(unwrapScalar(cc.ws)),
    gustMs: Number(unwrapScalar(cc.wg)),
    windKn: msToKnots(cc.ws),
    gustKn: msToKnots(cc.wg),
    dir: Number(unwrapScalar(cc.wd)),
    tempC: kelvinToCelsius(cc.at),
    precipPct: Math.round(Number(unwrapScalar(cc.p) || 0) * 100),
    dtl: unwrapScalar(cc.dtl),
    source: 'Windfinder / GFS model — Stanley Point, Devonport',
    isModelled: true,
  };

  const layoutIsland = islands.find(i => i.layoutData);
  const forecast = [];
  if (layoutIsland) {
    const layoutData = decode(layoutIsland.layoutData);
    for (const day of layoutData) {
      const dayDecoded = decode(day);
      const horizons = decode(dayDecoded.horizons);
      for (const h of horizons) {
        const hd = decode(h);
        forecast.push({
          dtl: unwrapScalar(hd.dtl),
          windKn: msToKnots(hd.ws),
          gustKn: msToKnots(hd.wg),
          dir: Number(unwrapScalar(hd.wd)),
        });
      }
    }
  }

  return { ok: true, current, forecast, fetchedAt: new Date().toISOString() };
}

async function getMetServiceData(hoursAhead = 12) {
  const apiKey = process.env.METSERVICE_API_KEY;
  if (!apiKey) throw new Error('METSERVICE_API_KEY is not configured');
  const safeHours = Math.max(1, Math.min(120, Math.round(Number(hoursAhead) || 12)));
  const cacheKey = String(safeHours);
  const cached = metserviceCache.get(cacheKey);
  if (cached && (Date.now() - cached.fetchedAt) < 5 * 60 * 1000) return cached.data;

  const from = new Date();
  from.setUTCMinutes(0, 0, 0);
  const to = new Date(from.getTime() + (safeHours * 60 * 60 * 1000));
  const url = new URL('https://forecast-v2.metoceanapi.com/point/time');
  url.search = new URLSearchParams({
    lat: '-36.831',
    lon: '174.791',
    variables: 'wind.speed.at-10m,wind.speed.gust.at-10m,wind.direction.at-10m,air.temperature.at-2m',
    interval: '1h',
    from: from.toISOString(),
    to: to.toISOString(),
  }).toString();

  const data = await fetchJsonUrl(url, {
    'x-api-key': apiKey,
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  });
  metserviceCache.set(cacheKey, { fetchedAt: Date.now(), data });
  return data;
}

function twelveTo24(time12) {
  const m = String(time12).trim().match(/^(\d{1,2}):(\d{2})(AM|PM)$/i);
  if (!m) return null;
  let hh = parseInt(m[1], 10);
  const mm = m[2];
  const ap = m[3].toUpperCase();
  if (ap === 'AM') {
    if (hh === 12) hh = 0;
  } else {
    if (hh !== 12) hh += 12;
  }
  return `${String(hh).padStart(2, '0')}:${mm}`;
}

function aucklandNowKey() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = t => parts.find(p => p.type === t)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

function parseTideForecastHtml(html) {
  const dateHeaderMatch = html.match(/<th class="tide-table__day" colspan="4"[\s\S]*?<\/tr>/i);
  if (!dateHeaderMatch) throw new Error('Could not find tide date headers');
  const dates = [...dateHeaderMatch[0].matchAll(/data-date="([0-9-]+)"/g)].map(m => m[1]);
  if (!dates.length) throw new Error('No tide dates found');

  const highRowMatch = html.match(/<tr class="tide-table__separator"><td class="tide-table__part tide-table__part--high[\s\S]*?<\/tr>/i);
  const lowRowMatch = html.match(/<tr class="tide-table__separator tide-table__separator--wide"><td class="tide-table__part tide-table__part--low[\s\S]*?<\/tr>/i);
  if (!highRowMatch || !lowRowMatch) throw new Error('Could not find tide rows');

  const cellRegex = /<td class="tide-table__part[^>]*>([\s\S]*?)<\/td>/g;
  const highCells = [...highRowMatch[0].matchAll(cellRegex)].map(m => m[1]);
  const lowCells = [...lowRowMatch[0].matchAll(cellRegex)].map(m => m[1]);

  const extractEvents = (cellHtml, type, date) => {
    const matches = [...cellHtml.matchAll(/<span class="tide-time__time[^>]*>\s*([^<]+)<\/span><span class="tide-time__height">\s*([^<]+)/g)];
    return matches.map(m => ({
      type,
      date,
      time12: m[1].trim(),
      time24: twelveTo24(m[1].trim()),
      height: parseFloat(m[2]),
    })).filter(e => e.time24);
  };

  const events = [];

  // First day: AM high=cell[1], PM high=cell[3], AM low=cell[2] (may be empty if passed), PM low=cell[2] or [3]
  // tide-forecast.com splits today into 4 columns: [0]=label, [1]=AM high, [2]=AM low, [3]=PM high, then PM low is also in [3] area
  // Based on observed structure: high[1]=AM high, high[3]=PM high; low[2]=PM low (AM low often past)
  events.push(...extractEvents(highCells[1] || '', 'High', dates[0]));
  events.push(...extractEvents(highCells[3] || '', 'High', dates[0]));
  events.push(...extractEvents(lowCells[2] || '', 'Low', dates[0]));
  events.push(...extractEvents(lowCells[3] || '', 'Low', dates[0]));

  // Following days are one cell per day (starting at index 4)
  for (let i = 1; i < dates.length; i++) {
    const cellIndex = i + 3;
    events.push(...extractEvents(highCells[cellIndex] || '', 'High', dates[i]));
    events.push(...extractEvents(lowCells[cellIndex] || '', 'Low', dates[i]));
  }

  events.sort((a, b) => `${a.date} ${a.time24}`.localeCompare(`${b.date} ${b.time24}`));

  const nowKey = aucklandNowKey();
  const past = events.filter(e => `${e.date} ${e.time24}` < nowKey).slice(-1);
  const future = events.filter(e => `${e.date} ${e.time24}` >= nowKey).slice(0, 5);
  const visible = [...past, ...future].map(e => ({
    ...e,
    past: `${e.date} ${e.time24}` < nowKey,
  }));
  const next = future[0] || null;

  return {
    source: 'tide-forecast.com',
    timezone: 'Pacific/Auckland',
    fetchedAt: new Date().toISOString(),
    nowKey,
    next,
    events: visible,
  };
}

async function getTideData() {
  const maxAgeMs = 30 * 60 * 1000;
  if (tideCache.data && (Date.now() - tideCache.fetchedAt) < maxAgeMs) return tideCache.data;
  const html = await fetchText('https://www.tide-forecast.com/locations/Auckland-New-Zealand/tides/latest');
  const parsed = parseTideForecastHtml(html);
  tideCache = { fetchedAt: Date.now(), data: parsed };
  return parsed;
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // PRIMARY: Weathercloud Devonport station (Davis Vantage Pro2, SW Hauraki Gulf)
  if (req.url === '/api/weathercloud') {
    proxyGet({
      hostname: 'app.weathercloud.net',
      path: '/device/values/0816548764',
      method: 'GET',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://app.weathercloud.net/d0816548764',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
      }
    }, res);
    return;
  }

  // BACKUP: WeatherLink ARKHQ station (Auckland Davis station)
  if (req.url === '/api/weatherlink') {
    proxyGet({
      hostname: 'www.weatherlink.com',
      path: '/embeddablePage/getData/3f5b1b7c23064def84b8b87f51dfc094',
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://www.weatherlink.com/embeddablePage/show/3f5b1b7c23064def84b8b87f51dfc094/wide',
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      }
    }, res);
    return;
  }

  // Tides: scrape live Auckland tide table from tide-forecast.com
  if (req.url === '/api/tides') {
    getTideData()
      .then(data => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      })
      .catch(err => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
    return;
  }

  if (req.url === '/api/windfinder') {
    getWindfinderData()
      .then(data => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      })
      .catch(err => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      });
    return;
  }

  if (req.url.startsWith('/api/metservice')) {
    const requestUrl = new URL(req.url, `http://localhost:${PORT}`);
    const hours = requestUrl.searchParams.get('hours') || '12';
    getMetServiceData(hours)
      .then(data => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      })
      .catch(err => {
        const status = /not configured/i.test(err.message) ? 500 : 502;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
    return;
  }

  // Serve static files
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
  };

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Sailing Race Dashboard running at http://localhost:${PORT}`);
  console.log(`Primary station: Weathercloud Devonport (Davis Vantage Pro2)`);
  console.log(`Backup station:  WeatherLink ARKHQ Auckland`);
});
