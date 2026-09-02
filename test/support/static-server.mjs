/**
 * Minimal static file server for local preview and for the end-to-end suite.
 *
 * Purpose
 *   The page is a native ES module, so it must be served over HTTP; opening index.html from the
 *   filesystem fails on the module import. This serves public/ and nothing else, with no dependencies.
 *
 * Key responsibilities
 *   - Serve public/ over HTTP with correct MIME types, so module scripts load.
 *   - Refuse any path that escapes public/.
 *
 * Usage
 *   node test/support/static-server.mjs [port]     (npm run serve)
 *   Playwright starts this automatically; see playwright.config.js.
 *
 * Related files
 *   - playwright.config.js - launches this as its webServer.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', 'public');
const PORT = Number(process.argv[2] || process.env.PORT || 4173);

// A module script is only executed if it arrives with a JavaScript MIME type
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png'
};

const server = createServer(async (request, response) => {
  const requested = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const relativePath = normalize(requested === '/' ? '/index.html' : requested);

  // Reject traversal before touching the filesystem
  if (relativePath.includes('..')) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const body = await readFile(join(ROOT, relativePath));
    response.writeHead(200, {
      'Content-Type': TYPES[extname(relativePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
});

server.listen(PORT, () => {
  process.stdout.write(`Serving public/ at http://localhost:${PORT}/\n`);
});
