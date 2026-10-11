#!/usr/bin/env node
/**
 * NEON FURY — lobby relay (shared).
 * Pairs exactly two peers (host + guest) per room code and
 * relays every JSON message between them verbatim.
 *
 * Used by BOTH transports:
 *  - `npm run host`  (server/host.mjs, LAN,  path /lobby)
 *  - Vercel Function (api/lobby.mjs, online, path /api/lobby)
 *
 * Each transport owns its own process/instance, so the room table
 * is per-attach — exactly like the original single-process host.
 */
import { WebSocketServer } from 'ws';

export function attachLobby(server, opts = {}) {
  const path = opts.path || '/lobby';
  const publicUrl = opts.publicUrl || (() => '');
  const rooms = new Map(); // roomCode -> { host: ws|null, guest: ws|null }

  const wss = new WebSocketServer({ server, path });

  function peerOf(room, ws) {
    return room.host === ws ? room.guest : room.host;
  }

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const room = (url.searchParams.get('room') || 'NF-DEFAULT').toUpperCase();
    const role = url.searchParams.get('role') === 'guest' ? 'guest' : 'host';

    if (!rooms.has(room)) rooms.set(room, { host: null, guest: null });
    const r = rooms.get(room);

    if (r[role]) {
      ws.send(JSON.stringify({ t: 'error', msg: `${role} slot already taken in room ${room}` }));
      ws.close();
      return;
    }
    r[role] = ws;
    ws._room = room;
    ws._role = role;

    ws.send(JSON.stringify({ t: 'welcome', you: role, room, lan: { ip: '', port: 0, url: publicUrl(req) } }));

    if (r.host && r.guest) {
      r.host.send(JSON.stringify({ t: 'paired', room }));
      r.guest.send(JSON.stringify({ t: 'paired', room }));
    }

    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      const other = peerOf(rooms.get(ws._room), ws);
      if (other && other.readyState === 1) {
        other.send(JSON.stringify(msg)); // relay everything else verbatim
      }
    });

    ws.on('close', () => {
      const rm = rooms.get(ws._room);
      if (!rm) return;
      if (rm[ws._role] === ws) rm[ws._role] = null;
      const other = peerOf(rm, ws);
      if (other && other.readyState === 1) other.send(JSON.stringify({ t: 'peer-left' }));
      if (!rm.host && !rm.guest) rooms.delete(ws._room);
    });
  });

  return wss;
}
