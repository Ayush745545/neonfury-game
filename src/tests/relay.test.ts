import { describe, it, expect } from 'vitest';
import { createServer, type Server } from 'node:http';
import WebSocket from 'ws';
import { attachLobby } from '../../server/lobbyRelay.mjs';

/* Smoke test: the shared lobby relay pairs host+guest and relays
   messages verbatim - same code the LAN host and the Vercel
   online Function both run. */

type WS = WebSocket;

/** FIFO message queue attached at socket creation, so frames
    that arrive together with the open handshake are not lost. */
function mq(ws: WS): () => Promise<any> {
  const q: any[] = [];
  const waiters: ((m: any) => void)[] = [];
  ws.on('message', (data: WebSocket.RawData) => {
    let msg: any;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    const w = waiters.shift();
    if (w) w(msg); else q.push(msg);
  });
  return () => new Promise<any>((res) => {
    const m = q.shift();
    if (m !== undefined) res(m); else waiters.push(res);
  });
}

function waitOpen(ws: WS): Promise<void> {
  return new Promise((res, rej) => {
    ws.on('open', () => { res(); });
    ws.on('error', (e) => { rej(e); });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((res) => { server.close(() => { res(); }); });
}

describe('lobby relay', () => {
  it('pairs host and guest, relays messages, announces peer-left', async () => {
    const server: Server = createServer();
    attachLobby(server, { path: '/lobby', publicUrl: () => 'http://test:4173' });
    await new Promise<void>((res) => { server.listen(0, '127.0.0.1', () => { res(); }); });
    const port = (server.address() as { port: number }).port;
    const url = (role: string) => `ws://127.0.0.1:${port}/lobby?room=NF-TEST&role=${role}`;

    const host: WS = new WebSocket(url('host'));
    const guest: WS = new WebSocket(url('guest'));
    const nextHost = mq(host);
    const nextGuest = mq(guest);
    await waitOpen(host);

    // host welcomed
    const hw = await nextHost();
    expect(hw.t).toBe('welcome');
    expect(hw.you).toBe('host');
    expect(hw.lan.url).toBe('http://test:4173');

    // guest joins -> both paired
    await waitOpen(guest);
    const gw = await nextGuest();
    expect(gw.t).toBe('welcome');
    expect(gw.you).toBe('guest');
    expect((await nextHost()).t).toBe('paired');
    expect((await nextGuest()).t).toBe('paired');

    // host -> guest message relay
    host.send(JSON.stringify({ t: 'cfg', char: 'RYDEN', stage: 'DOWNTOWN', seed: 42 }));
    expect(await nextGuest()).toEqual({ t: 'cfg', char: 'RYDEN', stage: 'DOWNTOWN', seed: 42 });

    // guest leaves -> host notified
    guest.close();
    expect((await nextHost()).t).toBe('peer-left');

    // a second guest can take the freed slot
    const guest2: WS = new WebSocket(url('guest'));
    const nextGuest2 = mq(guest2);
    await waitOpen(guest2);
    expect((await nextHost()).t).toBe('paired');
    expect((await nextGuest2()).t).toBe('welcome');
    expect((await nextGuest2()).t).toBe('paired');

    host.close();
    guest2.close();
    await closeServer(server);
  }, 15000);

  it('rejects a second host in the same room', async () => {
    const server: Server = createServer();
    attachLobby(server, { path: '/lobby', publicUrl: () => '' });
    await new Promise<void>((res) => { server.listen(0, '127.0.0.1', () => { res(); }); });
    const port = (server.address() as { port: number }).port;

    const h1: WS = new WebSocket(`ws://127.0.0.1:${port}/lobby?room=NF-BUSY&role=host`);
    const h2: WS = new WebSocket(`ws://127.0.0.1:${port}/lobby?room=NF-BUSY&role=host`);
    const nextH1 = mq(h1);
    const nextH2 = mq(h2);
    await waitOpen(h1);
    await waitOpen(h2);

    const err = await nextH2();
    expect(err.t).toBe('error');
    expect(err.msg).toContain('already taken');
    expect((await nextH1()).t).toBe('welcome');

    h1.close();
    h2.close();
    await closeServer(server);
  }, 15000);
});
