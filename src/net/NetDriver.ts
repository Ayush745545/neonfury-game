import type { GameEngine } from '../game/GameEngine';
import type { InputSnapshot, MatchRuntime } from '../game/types';
import { emptyInput } from '../game/types';
import { encodeInput, decodeInput, type NetMsg } from './protocol';
import { netSession } from './session';
import { inputManager } from '../game/inputManager';
import { SIM_DT } from '../config/constants';

/* ================================================================== */
/*  Deterministic lockstep netplay driver.                             */
/*  Both peers run the identical fixed-step simulation; only compact   */
/*  input bitmasks cross the wire. Input delay hides LAN jitter; a     */
/*  short stall window prevents hitches, then the last remote input    */
/*  is extrapolated so the game can never hard-freeze. Periodic        */
/*  checksums + host snapshots guard against desyncs.                  */
/* ================================================================== */

const INPUT_DELAY = 2;       // frames of pre-roll
const MAX_STALL = 40;        // frames to wait for a peer before extrapolating
const CHECKSUM_EVERY = 120;

export class NetDriver {
  private engine: GameEngine;
  private isHost: boolean;
  private localSlot: 'p1' | 'p2';
  private inbox = new Map<number, number>();
  private outbox = new Map<number, InputSnapshot>();
  private stepFrame = 0;
  private sendFrame = INPUT_DELAY;
  private acc = 0;
  private stall = 0;
  private lastRemote = 0;
  private remoteChk = new Map<number, string>();
  private lastChkSent = -1;
  disconnected = false;
  lagging = false;
  onRematch: (() => void) | null = null;

  constructor(engine: GameEngine) {
    this.engine = engine;
    this.isHost = netSession.role === 'host';
    this.localSlot = this.isHost ? 'p1' : 'p2';
    netSession.onMsg = (m) => this.onNet(m);
  }

  dispose(): void {
    netSession.onMsg = null;
    this.inbox.clear();
    this.outbox.clear();
  }

  private onNet(m: NetMsg): void {
    switch (m.t) {
      case 'input':
        this.inbox.set(m.f, m.i);
        if (this.inbox.size > 240) {
          const oldest = Math.min(...this.inbox.keys());
          this.inbox.delete(oldest);
        }
        break;
      case 'chk': {
        const mine = this.remoteChk.get(m.f);
        if (mine !== undefined && mine !== m.h && this.isHost) {
          // desync: host re-syncs the guest from authoritative state
          netSession.send({ t: 'snap', f: this.stepFrame, s: this.engine.getSnapshot() });
        }
        break;
      }
      case 'rematch':
        this.onRematch?.();
        break;
      case 'snap':
        if (!this.isHost) {
          this.engine.applySnapshot(m.s as never);
          this.stepFrame = this.engine.match.frame;
          this.sendFrame = this.stepFrame + INPUT_DELAY;
          this.inbox.clear();
          this.outbox.clear();
          this.acc = 0;
        }
        break;
      default: break;
    }
  }

  update(realDt: number): void {
    const m: MatchRuntime = this.engine.match;
    // mirror the engine's slow-mo easing so both peers ramp identically-ish
    m.timeScale += (m.timeScaleTarget - m.timeScale) * (1 - Math.exp(-7 * realDt));
    if (m.phase === 'paused') return;

    // pipeline: keep INPUT_DELAY frames of local input in flight
    while (this.sendFrame < this.stepFrame + INPUT_DELAY + 2) {
      const snap = inputManager.sample(this.localSlot);
      this.outbox.set(this.sendFrame, snap);
      netSession.send({ t: 'input', f: this.sendFrame, i: encodeInput(snap) });
      this.sendFrame++;
    }

    this.acc += Math.min(realDt, 0.1) * m.timeScale;
    let steps = 0;
    while (this.acc >= SIM_DT && steps < 6) {
      let remoteMask = this.inbox.get(this.stepFrame);
      if (remoteMask === undefined) {
        this.stall++;
        if (this.stall < MAX_STALL) { this.lagging = this.stall > 12; break; }
        remoteMask = this.lastRemote; // extrapolate — never hard-freeze
      } else {
        this.stall = 0;
        this.lastRemote = remoteMask;
        this.inbox.delete(this.stepFrame);
      }
      this.lagging = false;
      const local = this.outbox.get(this.stepFrame) ?? emptyInput();
      this.outbox.delete(this.stepFrame);
      const remote = decodeInput(remoteMask);
      if (this.isHost) this.engine.stepNet(local, remote);
      else this.engine.stepNet(remote, local);
      this.stepFrame++;
      this.acc -= SIM_DT;
      steps++;

      if (this.stepFrame % CHECKSUM_EVERY === 0 && this.stepFrame !== this.lastChkSent) {
        this.lastChkSent = this.stepFrame;
        const h = this.engine.checksum();
        this.remoteChk.set(this.stepFrame, h);
        netSession.send({ t: 'chk', f: this.stepFrame, h });
        if (this.remoteChk.size > 8) {
          const oldest = Math.min(...this.remoteChk.keys());
          this.remoteChk.delete(oldest);
        }
      }
    }
    if (steps >= 6) this.acc = 0;
  }
}
