// SOLANO HEAT 3D — local play-test server.
//
//   node serve.ts        then open http://localhost:8080/game/
//
// Serves this repository's root so the game can be played and
// screenshotted in a desktop browser. It also takes screenshot
// hand-backs: a staged page POSTs a JPEG to /__save/<name>.jpg and the
// bytes land in screenshots/ beside this file. This file is tooling for
// the maker; main.ts is the entry the bounty grades.

import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(import.meta.url));
const shotsDir = join(rootDir, 'screenshots');
const PORT = 8080;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ts': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (req.method === 'POST' && url.pathname.startsWith('/__save/')) {
    const name = url.pathname.slice('/__save/'.length);
    if (!/^[0-9a-z-]+\.jpg$/.test(name)) {
      res.writeHead(400).end('bad screenshot name');
      return;
    }
    const parts: Buffer[] = [];
    req.on('data', (chunk: Buffer) => parts.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(parts);
      writeFileSync(join(shotsDir, name), body);
      console.log(`saved screenshots/${name} (${body.length} bytes)`);
      res.writeHead(200, { 'content-type': 'text/plain' }).end('saved');
    });
    return;
  }

  if (req.method !== 'GET') {
    res.writeHead(405).end('method not allowed');
    return;
  }

  let rel = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '');
  if (rel === '' || rel === '.') rel = 'game/index.html';
  let full = join(rootDir, rel);
  if (existsSync(full) && statSync(full).isDirectory()) full = join(full, 'index.html');
  if (!full.startsWith(rootDir) || !existsSync(full) || !statSync(full).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    return;
  }
  res.writeHead(200, {
    'content-type': TYPES[extname(full).toLowerCase()] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  res.end(readFileSync(full));
});

server.listen(PORT, () => {
  console.log(`solano-heat-3d: serving ${rootDir} at http://localhost:${PORT}/ (game at /game/)`);
});
