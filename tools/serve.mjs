// Mini-webserver voor lokaal testen: `npm start` en open http://localhost:8080
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.dat': 'application/octet-stream' };
const port = +process.env.PORT || 8080;
http.createServer((req, res) => {
  let p = path.normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (p.endsWith('/') || p.endsWith(path.sep)) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end('Niet gevonden'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(buf);
  });
}).listen(port, () => console.log(`Watt Blitz draait op http://localhost:${port}`));
