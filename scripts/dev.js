// Local development server with live reload.
//   npm run dev   ->  http://localhost:5173
// Edit any .tex file in content/ (or the design in src/) and the browser reloads.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build.js';
import { makePreview } from './preview.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 5173;
const BASE = '/';
process.env.BASE_PATH = BASE;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.pdf': 'application/pdf',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

const clients = new Set();

async function rebuild(reason) {
  try {
    if (reason) console.log(`\n↻ ${reason}`);
    await build({ dev: true });
    try { await makePreview({ build: false }); } catch (e) { console.error('\x1b[33m⚠ preview.html could not be updated:\x1b[0m', e.message); }
    for (const res of clients) res.write('data: reload\n\n');
  } catch (e) {
    console.error('\x1b[31m✗ Build failed:\x1b[0m', e.message);
  }
}

await rebuild();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === `${BASE}__reload`) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(': connected\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  let file = path.join(DIST, rel);
  if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  let status = 200;
  if (!fs.existsSync(file)) { file = path.join(DIST, '404.html'); status = 404; }
  res.writeHead(status, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, () => {
  console.log(`\n  Portfolio running at \x1b[36mhttp://localhost:${PORT}\x1b[0m`);
  console.log('  Watching content/ and src/ for changes. Press Ctrl+C to stop.\n');
});

let timer = null;
let lastFile = '';
for (const dir of ['content', 'src', 'public']) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) continue;
  fs.watch(full, { recursive: true }, (_evt, filename) => {
    if (!filename || /(^|[\\/])\.|\.(aux|log|out|synctex\.gz|fls|fdb_latexmk|toc|pdf)$/.test(filename) && !filename.includes('figures')) return;
    lastFile = `${dir}/${filename}`;
    clearTimeout(timer);
    timer = setTimeout(() => rebuild(`${lastFile} changed`), 150);
  });
}
