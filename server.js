// Simple proxy server for BBYC Race Dashboard
// Serves the HTML and proxies weather APIs to avoid CORS issues
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8765;

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
