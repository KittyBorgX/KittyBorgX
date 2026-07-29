#!/usr/bin/env node

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4173);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png'
};

const server = http.createServer((request, response) => {
  const requested = decodeURIComponent((request.url || '/').split('?')[0]);
  const relative = requested === '/' ? 'index.html' : requested.replace(/^\/+/, '');
  const target = path.resolve(root, relative);

  if (!target.startsWith(root)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  fs.stat(target, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': mime[path.extname(target)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    fs.createReadStream(target).pipe(response);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Preview running at http://127.0.0.1:${port}`);
});
