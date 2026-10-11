#!/usr/bin/env node
/**
 * NEON FURY — Vercel lobby relay (online multiplayer).
 *
 * Vercel Function (Fluid Compute) that upgrades requests to WebSockets
 * and runs the same room relay as the LAN host. Both players connect
 * to wss://<this-site>/api/lobby — works on the same WiFi AND over
 * the internet, no signaling server to run.
 *
 * Note: a Vercel WebSocket connection is pinned to one Function
 * instance for its life and closes at the function's max duration.
 * The game client reconnects automatically; the room is re-paired.
 */
import { createServer } from 'node:http';
import { attachLobby } from '../server/lobbyRelay.mjs';

const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('NEON FURY lobby relay');
});

attachLobby(server, {
  path: '/api/lobby',
  publicUrl: (req) => {
    const host = req.headers.host || 'neon-fury.vercel.app';
    const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
    return `${proto}://${host}`;
  },
});

export default server;
