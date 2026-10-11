import type { ActionId, InputSnapshot } from './types';
import { emptyInput } from './types';
import { DOUBLE_TAP_WINDOW } from '../config/constants';
import { useSettings, type Bindings } from '../config/settings';

/**
 * Keyboard (and virtual touch) input for up to two players.
 * Produces one InputSnapshot per player per sim frame with:
 *  - held states
 *  - single-frame press edges (consumed by the sim's input buffer)
 *  - double-tap dash detection
 * Browser scrolling from game keys is suppressed while combat is active.
 */

const GAME_CODES = new Set<string>();
function rebuildGameCodes(b: Bindings): void {
  GAME_CODES.clear();
  for (const pad of [b.p1, b.p2]) {
    for (const code of Object.values(pad)) {
      if (code && code !== 'Unbound') GAME_CODES.add(code);
    }
  }
  GAME_CODES.add('ArrowUp'); GAME_CODES.add('ArrowDown');
  GAME_CODES.add('ArrowLeft'); GAME_CODES.add('ArrowRight');
}
rebuildGameCodes(useSettings.getState().bindings);
useSettings.subscribe((s) => rebuildGameCodes(s.bindings));

interface PlayerInput {
  down: Set<string>;
  prevEdge: Record<string, boolean>;
  tapHistory: { dir: 'left' | 'right'; frame: number; releasedSince: boolean }[];
  frame: number;
}

class InputManager {
  private p1: PlayerInput = { down: new Set(), prevEdge: {}, tapHistory: [], frame: 0 };
  private p2: PlayerInput = { down: new Set(), prevEdge: {}, tapHistory: [], frame: 0 };
  /** virtual buttons (mobile touch controls) */
  virtual: Record<'p1' | 'p2', Partial<Record<ActionId, boolean>>> = { p1: {}, p2: {} };
  private attached = false;
  suppressScroll = true;
  anyKeyPressed = false;

  private onKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    const interactive = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'SELECT';
    if (GAME_CODES.has(e.code) && this.suppressScroll && !interactive) e.preventDefault();
    if (e.repeat) return;
    this.p1.down.add(e.code);
    this.p2.down.add(e.code);
    this.anyKeyPressed = true;
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.p1.down.delete(e.code);
    this.p2.down.delete(e.code);
  };

  private onBlur = () => {
    this.p1.down.clear();
    this.p2.down.clear();
    this.virtual.p1 = {};
    this.virtual.p2 = {};
  };

  attach(): void {
    if (this.attached) return;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this.attached = true;
  }

  detach(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.attached = false;
    this.onBlur();
  }

  private isDown(pad: PlayerInput, slot: 'p1' | 'p2', action: ActionId): boolean {
    const code = useSettings.getState().bindings[slot][action];
    if (code !== 'Unbound' && pad.down.has(code)) return true;
    return this.virtual[slot][action] === true;
  }

  /** Build the snapshot for this sim frame; must be called exactly once per frame per player. */
  sample(slot: 'p1' | 'p2'): InputSnapshot {
    const pad = slot === 'p1' ? this.p1 : this.p2;
    pad.frame++;
    const snap = emptyInput();

    const held = (a: ActionId) => this.isDown(pad, slot, a);
    const edge = (a: ActionId): boolean => {
      const now = held(a);
      const prev = pad.prevEdge[a] ?? false;
      pad.prevEdge[a] = now;
      return now && !prev;
    };

    snap.left = held('left');
    snap.right = held('right');
    snap.down = held('down');
    snap.up = held('up');
    snap.block = held('block');
    snap.lp = edge('lp');
    snap.hp = edge('hp');
    snap.lk = edge('lk');
    snap.hk = edge('hk');
    snap.special = edge('special');
    snap.super = edge('super');
    snap.upEdge = edge('up');

    // tap history for dashes: press dir, release, press again quickly
    const dirEdge = (dir: 'left' | 'right', now: boolean): boolean => {
      const key = dir === 'right' ? 'right' : 'left';
      const prev = (pad.prevEdge[`dir_${key}`] as boolean | undefined) ?? false;
      pad.prevEdge[`dir_${key}`] = now;
      return now && !prev;
    };
    const rEdge = dirEdge('right', snap.right);
    const lEdge = dirEdge('left', snap.left);
    for (const [dir, pressedEdge] of [['right', rEdge], ['left', lEdge]] as const) {
      if (!pressedEdge) continue;
      const last = pad.tapHistory[pad.tapHistory.length - 1];
      const recent = last && last.dir === dir && pad.frame - last.frame <= DOUBLE_TAP_WINDOW && last.releasedSince;
      pad.tapHistory.push({ dir, frame: pad.frame, releasedSince: false });
      if (pad.tapHistory.length > 6) pad.tapHistory.shift();
      if (recent) {
        // dashF/dashB are screen-relative here; engine maps through facing
        if (dir === 'right') snap.dashF = true; else snap.dashB = true;
      }
    }
    // mark release on latest tap
    const cur = pad.tapHistory[pad.tapHistory.length - 1];
    if (cur && !snap.left && !snap.right) cur.releasedSince = true;

    return snap;
  }

  clearPad(slot: 'p1' | 'p2'): void {
    const pad = slot === 'p1' ? this.p1 : this.p2;
    pad.prevEdge = {};
    pad.tapHistory = [];
    this.virtual[slot] = {};
  }
}

export const inputManager = new InputManager();
