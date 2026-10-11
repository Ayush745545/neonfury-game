#!/usr/bin/env node
/**
 * NEON FURY — LAN host server.
 * Serves the built game (dist/) AND runs the WebSocket lobby on the
 * same port, so a friend on the same WiFi just opens http://<your-ip>:4173
 *
 * Usage:  npm run host        (build first: npm run build)
 * Env:    PORT=4173
 *
 * The lobby relay itself lives in ./lobbyRelay.mjs and is shared with
 * the online Vercel Function (api/lobby.mjs).
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { attachLobby } from './lobbyRelay.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT || 4173);

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.map': 'application/json',
};

function lanAddress() {
  const ifaces = networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    let path = decodeURIComponent(url.pathname);
    if (path === '/' || path === '/index.html') path = '/index.html';
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
    const st = await stat(file).catch(() => null);
    if (!st || !st.isFile()) {
      // SPA fallback
      const index = await readFile(join(ROOT, 'index.html')).catch(() => null);
      if (!index) {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`<h1>NEON FURY host</h1><p>No build found. Run <code>npm run build</code> first, then <code>npm run host</code>.</p><p>Lobby WebSocket is active at <code>/lobby</code>.</p>`);
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(index);
      return;
    }
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(500);
    res.end('error');
  }
});

/* ---------------- lobby (shared relay) ---------------- */

const ip = lanAddress();
attachLobby(server, {
  path: '/lobby',
  publicUrl: () => `http://${ip}:${PORT}`,
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  ⚡ NEON FURY — LAN HOST');
  console.log('  -------------------------------------------');
  console.log(`  Game + lobby :  http://${ip}:${PORT}`);
  console.log(`  Lobby WS     :  ws://${ip}:${PORT}/lobby`);
  console.log('');
  console.log('  You  : open the URL above → NETWORK MULTIPLAYER → HOST');
  console.log(`  Friend (same WiFi): open the same URL → NETWORK MULTIPLAYER → JOIN`);
  console.log('  -------------------------------------------');
  console.log('');
});
