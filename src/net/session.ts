import type { NetMsg } from './protocol';
import { useMatchStore } from '../game/matchStore';
import type { CharId } from '../game/types';

/* ================================================================== */
/*  Net session: lobby connection lifecycle + match-config exchange.   */
/*  A tiny observable store so React screens can subscribe.            */
/*                                                                   */
/*  Two transports, same relay protocol:                               */
/*   - ONLINE  — served over https (Vercel): both peers connect to   */
/*     wss://<this-site>/api/lobby (Vercel Function, api/lobby.mjs). */
/*     Works on the same WiFi AND over the internet.                 */
/*   - LAN     — served by `npm run host`: host relays on the local  */
/*     host server (ws://…:4173/lobby).                            */
/*                                                                   */
/*  Vercel closes WebSocket connections at the function's max        */
/*  duration, so unexpected closes reconnect with exponential        */
/*  backoff and the room re-pairs automatically.                     */
/* ================================================================== */

export type NetStatus =
  | 'idle' | 'connecting' | 'waiting-peer' | 'paired'
  | 'waiting-cfg' | 'ready' | 'in-match' | 'peer-left' | 'error';

export interface NetConfig { char: CharId; stage: string; seed: number }

/** True when the page is served by the online relay (Vercel / vercel dev). */
export function isOnlineLobby(): boolean {
  const loc = window.location;
  return loc.protocol === 'https:'
    || loc.hostname.endsWith('.vercel.app')
    || (loc.hostname === 'localhost' && loc.port === '3000');
}

const MAX_RECONNECTS = 12;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;
/** Vercel may route the two peers to different Function
    instances (the room table is per-instance). Keep
    retrying until both connections coincide on one. */
const PAIR_TIMEOUT_MS = 10000;
const PAIR_JITTER_MS = 4000;
const MAX_PAIR_ATTEMPTS = 15;

class NetSession {
  ws: WebSocket | null = null;
  role: 'host' | 'guest' = 'host';
  room = 'NF-DEFAULT';
  status: NetStatus = 'idle';
  error = '';
  lanUrl = '';
  peerCfg: Partial<NetConfig> = {};
  myChar: CharId | null = null;
  myStage: string | null = null;
  mySeed = (Math.random() * 0xffffff) | 0;
  onMsg: ((m: NetMsg) => void) | null = null;   // in-match driver hook
  private listeners = new Set<() => void>();
  private lastAddr = '';
  private reconnects = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pairTimer: ReturnType<typeof setTimeout> | null = null;
  private pairAttempts = 0;

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void { this.listeners.forEach((f) => f()); }

  private setStatus(s: NetStatus, err = ''): void {
    this.status = s;
    this.error = err;
    this.emit();
  }

  connect(role: 'host' | 'guest', addr: string, room: string): void {
    this.teardownSocket(false);
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.pairTimer) { clearTimeout(this.pairTimer); this.pairTimer = null; }
    this.role = role;
    this.room = room.toUpperCase();
    this.lastAddr = addr;
    this.peerCfg = {};
    this.myChar = null;
    this.myStage = null;
    this.mySeed = (Math.random() * 0xffffff) | 0;
    this.reconnects = 0;
    this.pairAttempts = 0;
    this.setStatus('connecting');
    this.openSocket();
  }

  private openSocket(): void {
    const role = this.role;
    const q = `room=${encodeURIComponent(this.room)}&role=${role}`;
    let wsAddr: string;
    if (isOnlineLobby()) {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      wsAddr = `${proto}://${window.location.host}/api/lobby?${q}`;
    } else if (role === 'host') {
      wsAddr = `ws://localhost:${this.portOf(this.lastAddr) || 4173}/lobby?${q}`;
    } else {
      wsAddr = `ws://${this.hostOf(this.lastAddr)}:${this.portOf(this.lastAddr) || 4173}/lobby?${q}`;
    }
    try {
      this.ws = new WebSocket(wsAddr);
    } catch (e) {
      this.setStatus('error', String(e));
      return;
    }
    this.ws.onopen = () => { this.reconnects = 0; this.setStatus('waiting-peer'); this.armPairTimer(); };
    this.ws.onerror = () => {
      this.setStatus(
        'error',
        isOnlineLobby() ? 'Cannot reach the online lobby relay.' : 'Cannot reach the host server. Is `npm run host` running?',
      );
    };
    this.ws.onclose = () => {
      if (this.ws) this.ws.onclose = null;
      this.ws = null;
      this.clearPairTimer();
      if (this.status === 'idle' || this.status === 'error') return; // user quit or rejected
      if (this.status === 'in-match') this.setStatus('peer-left');
      this.scheduleReconnect();
    };
    this.ws.onmessage = (ev) => {
      let msg: NetMsg;
      try { msg = JSON.parse(String(ev.data)) as NetMsg; } catch { return; }
      switch (msg.t) {
        case 'welcome':
          this.lanUrl = msg.lan.url;
          this.setStatus('waiting-peer');
          this.armPairTimer();
          break;
        case 'paired':
          this.pairAttempts = 0;
          this.clearPairTimer();
          useMatchStore.getState().setNet(this.role);
          this.setStatus('paired');
          // Re-paired while a match screen is up (connection was recycled
          // mid-match): bail both peers back to fighter select so they
          // re-lock fighters and start a fresh deterministic match.
          if (useMatchStore.getState().screen === 'game') {
            useMatchStore.getState().gotoSelect('net');
          }
          break;
        case 'error':
          // A stale socket of ours may still hold the slot on the
          // instance; the server closes us right after — treat it
          // as a retryable blip, not a hard failure.
          if (!String(msg.msg).includes('already taken')) {
            this.setStatus('error', msg.msg);
          }
          break;
        case 'peer-left':
          this.setStatus('peer-left');
          break;
        case 'cfg':
          this.peerCfg = { ...this.peerCfg, ...msg } as Partial<NetConfig>;
          this.tryReady();
          break;
        case 'bye':
          this.setStatus('peer-left');
          break;
        case 'rematch':
          this.onMsg?.(msg);
          break;
        default:
          this.onMsg?.(msg);
      }
      this.emit();
    };
  }

  /** Close the socket without touching store/screen state. */
  private teardownSocket(sendBye: boolean): void {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.pairTimer) { clearTimeout(this.pairTimer); this.pairTimer = null; }
    if (this.ws) {
      if (sendBye && this.ws.readyState === WebSocket.OPEN) {
        try { this.ws.send(JSON.stringify({ t: 'bye' })); } catch { /* already gone */ }
      }
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnects >= MAX_RECONNECTS) {
      this.setStatus('error', 'Connection lost.');
      return;
    }
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.reconnects, RECONNECT_MAX_MS);
    this.reconnects++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.status === 'idle' || this.status === 'error') return;
      this.setStatus('connecting');
      this.openSocket();
    }, delay);
  }

  /** While waiting for the opponent, periodically re-dial the
      relay so both peers eventually land on the same Function
      instance (Vercel routes connections per-instance). */
  private armPairTimer(): void {
    this.clearPairTimer();
    if (!isOnlineLobby()) return; // LAN host is a single process — always pairs
    this.pairTimer = setTimeout(() => {
      this.pairTimer = null;
      if (this.status !== 'waiting-peer') return;
      if (this.pairAttempts >= MAX_PAIR_ATTEMPTS) {
        this.teardownSocket(false);
        this.setStatus('error', 'Could not pair in this room. Check the room code and retry.');
        return;
      }
      this.pairAttempts++;
      this.teardownSocket(false);
      this.setStatus('connecting');
      this.openSocket();
    }, PAIR_TIMEOUT_MS + Math.random() * PAIR_JITTER_MS);
  }

  private clearPairTimer(): void {
    if (this.pairTimer) { clearTimeout(this.pairTimer); this.pairTimer = null; }
  }

  private hostOf(addr: string): string {
    let a = addr.trim();
    a = a.replace(/^wss?:\/\//, '').replace(/^https?:\/\//, '');
    return a.split(':')[0].split('/')[0] || 'localhost';
  }

  private portOf(addr: string): number {
    const m = addr.match(/:(\d+)/);
    return m ? Number(m[1]) : 4173;
  }

  /** Called by the pick screens when this peer has confirmed. */
  sendMyConfig(char: CharId, stage?: string): void {
    this.myChar = char;
    if (stage) this.myStage = stage;
    if (this.role === 'host') {
      if (!this.myStage) return; // wait until stage picked
      this.send({ t: 'cfg', char, stage: this.myStage, seed: this.mySeed });
    } else {
      this.send({ t: 'cfg', char });
    }
    this.setStatus('waiting-cfg');
    this.tryReady();
  }

  private tryReady(): void {
    if (this.status !== 'waiting-cfg' && this.status !== 'paired' && this.status !== 'in-match') return;
    const store = useMatchStore.getState();
    if (this.role === 'host') {
      const gChar = this.peerCfg.char as CharId | undefined;
      if (this.myChar && this.myStage && gChar) {
        store.pickChar('p1', this.myChar);
        store.pickChar('p2', gChar);
        store.setStage(this.myStage);
        store.setDifficulty(store.difficulty);
        this.setStatus('ready');
        this.beginMatch();
      }
    } else {
      const h = this.peerCfg as Partial<NetConfig>;
      if (this.myChar && h.char && h.stage && h.seed !== undefined) {
        store.pickChar('p1', h.char as CharId);   // host is P1
        store.pickChar('p2', this.myChar);        // guest is P2
        store.setStage(h.stage);
        this.mySeed = h.seed;
        this.setStatus('ready');
        this.beginMatch();
      }
    }
  }

  private beginMatch(): void {
    this.setStatus('in-match');
    useMatchStore.getState().startMatch();
  }

  send(msg: NetMsg): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  disconnect(): void {
    this.teardownSocket(true);
    this.onMsg = null;
    this.setStatus('idle');
    useMatchStore.getState().setNet(null);
  }
}

export const netSession = new NetSession();
