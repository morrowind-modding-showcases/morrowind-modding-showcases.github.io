// Static server mimicking GitHub Pages: directory index.html, extensionless
// .html resolution (/madness/mods -> madness/mods.html), 404.html fallback
// with 404 status. Needed to test the modathon deep-link routing and the
// madness clean URLs locally, since python -m http.server does neither.
import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2]) || 8123;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

async function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  if (clean.includes('..')) return null;
  let filePath = path.join(root, clean);
  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      if (!clean.endsWith('/')) return { redirect: clean + '/' };
      filePath = path.join(filePath, 'index.html');
      await fs.stat(filePath);
    }
    return { filePath };
  } catch {
    // GitHub Pages serves foo.html for a request to /foo
    if (!path.extname(clean) && !clean.endsWith('/')) {
      try {
        await fs.stat(filePath + '.html');
        return { filePath: filePath + '.html' };
      } catch {
        return null;
      }
    }
    return null;
  }
}

http.createServer(async (req, res) => {
  const resolved = await resolveFile(req.url);
  if (resolved?.redirect) {
    res.writeHead(301, { Location: resolved.redirect });
    res.end();
    return;
  }
  if (!resolved) {
    const body = await fs.readFile(path.join(root, '404.html'));
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(body);
    return;
  }
  const body = await fs.readFile(resolved.filePath);
  const type = MIME[path.extname(resolved.filePath).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  res.end(body);
}).listen(port, () => console.log(`gh-pages mimic on http://localhost:${port}`));
