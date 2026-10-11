import type { NetMsg } from './protocol';
import { useMatchStore } from '../game/matchStore';
import type { CharId } from '../game/types';

/* ================================================================== */
/*  Net session: lobby connection lifecycle + match-config exchange.   */
/*  A tiny observable store so React screens can subscribe.            */
/* ================================================================== */

export type NetStatus =
  | 'idle' | 'connecting' | 'waiting-peer' | 'paired'
  | 'waiting-cfg' | 'ready' | 'in-match' | 'peer-left' | 'error';

export interface NetConfig { char: CharId; stage: string; seed: number }

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
    this.disconnect();
    this.role = role;
    this.room = room.toUpperCase();
    this.peerCfg = {};
    this.myChar = null;
    this.myStage = null;
    this.mySeed = (Math.random() * 0xffffff) | 0;
    this.setStatus('connecting');
    const wsAddr = role === 'host'
      ? `ws://localhost:${this.portOf(addr) || 4173}/lobby?room=${encodeURIComponent(this.room)}&role=host`
      : `ws://${this.hostOf(addr)}:${this.portOf(addr) || 4173}/lobby?room=${encodeURIComponent(this.room)}&role=guest`;
    try {
      this.ws = new WebSocket(wsAddr);
    } catch (e) {
      this.setStatus('error', String(e));
      return;
    }
    this.ws.onopen = () => this.setStatus('waiting-peer');
    this.ws.onerror = () => this.setStatus('error', 'Cannot reach the host server. Is `npm run host` running?');
    this.ws.onclose = () => {
      if (this.status !== 'idle') {
        if (this.status === 'in-match') this.setStatus('peer-left');
        else if (this.status !== 'error') this.setStatus('idle');
      }
      this.ws = null;
    };
    this.ws.onmessage = (ev) => {
      let msg: NetMsg;
      try { msg = JSON.parse(String(ev.data)) as NetMsg; } catch { return; }
      switch (msg.t) {
        case 'welcome':
          this.lanUrl = msg.lan.url;
          this.setStatus('waiting-peer');
          break;
        case 'paired':
          useMatchStore.getState().setNet(this.role);
          this.setStatus('paired');
          break;
        case 'error':
          this.setStatus('error', msg.msg);
          break;
        case 'peer-left':
          if (this.status === 'in-match') this.setStatus('peer-left');
          else this.setStatus('peer-left');
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
    if (this.ws) {
      this.send({ t: 'bye' });
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.onMsg = null;
    this.setStatus('idle');
    useMatchStore.getState().setNet(null);
  }
}

export const netSession = new NetSession();
