// Simple proxy server for BBYC Race Dashboard
// Serves the HTML and proxies weather APIs to avoid CORS issues
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8765;

let tideCache = { fetchedAt: 0, data: null };

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

  // First day is split across AM/PM columns
  events.push(...extractEvents(highCells[0] || '', 'High', dates[0]));
  events.push(...extractEvents(highCells[2] || '', 'High', dates[0]));
  events.push(...extractEvents(lowCells[1] || '', 'Low', dates[0]));
  events.push(...extractEvents(lowCells[3] || '', 'Low', dates[0]));

  // Following days are one cell per day
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
