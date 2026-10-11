import type { ActionId, InputSnapshot } from './types';
import { emptyInput } from './types';
import { DOUBLE_TAP_WINDOW } from '../config/constants';
import { useSettings, type Bindings } from '../config/settings';

/**
 * Keyboard, gamepad, and virtual touch input for up to two players.
 * Produces one InputSnapshot per player per sim frame with:
 *  - held states
 *  - single-frame press edges (consumed by the sim's input buffer)
 *  - double-tap dash detection
 * Browser scrolling from game keys is suppressed while combat is active.
 * 
 * Gamepad support:
 *  - P1 uses first connected gamepad (index 0)
 *  - P2 uses second connected gamepad (index 1)
 *  - Standard gamepad layout (Xbox/PlayStation style)
 *  - Automatic detection and hot-plug support
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

/** Gamepad button/axis mapping for standard layout */
interface GamepadState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  lp: boolean;  // X / Square
  hp: boolean;  // Y / Triangle
  lk: boolean;  // A / Cross
  hk: boolean;  // B / Circle
  special: boolean;  // LB / L1
  super: boolean;    // RB / R1
  ability: boolean;  // LT / L2
  block: boolean;    // RT / R2
}

class InputManager {
  private p1: PlayerInput = { down: new Set(), prevEdge: {}, tapHistory: [], frame: 0 };
  private p2: PlayerInput = { down: new Set(), prevEdge: {}, tapHistory: [], frame: 0 };
  /** virtual buttons (mobile touch controls) */
  virtual: Record<'p1' | 'p2', Partial<Record<ActionId, boolean>>> = { p1: {}, p2: {} };
  /** gamepad previous state for edge detection */
  private gamepadPrev: [GamepadState | null, GamepadState | null] = [null, null];
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

  /** Read current gamepad state for a player (if gamepad enabled and connected) */
  private readGamepad(playerIndex: 0 | 1): GamepadState | null {
    if (!useSettings.getState().gamepadEnabled) return null;
    
    const gamepads = navigator.getGamepads?.();
    if (!gamepads) return null;
    
    const gp = gamepads[playerIndex];
    if (!gp || !gp.connected) return null;

    // Log once when we first detect a gamepad
    if (!this.gamepadPrev[playerIndex]) {
      console.log(`[InputManager] ✓ Gamepad ${playerIndex} connected: ${gp.id}`);
    }

    const buttons = gp.buttons;
    const axes = gp.axes;
    
    // Dead zone for analog sticks
    const DEAD_ZONE = 0.25;
    const axisLeft = axes[0] ?? 0;
    const axisUp = axes[1] ?? 0;
    
    return {
      // D-pad and left stick
      left: (buttons[14]?.pressed ?? false) || axisLeft < -DEAD_ZONE,
      right: (buttons[15]?.pressed ?? false) || axisLeft > DEAD_ZONE,
      up: (buttons[12]?.pressed ?? false) || axisUp < -DEAD_ZONE,
      down: (buttons[13]?.pressed ?? false) || axisUp > DEAD_ZONE,
      
      // Face buttons (Xbox layout: A=0, B=1, X=2, Y=3)
      lk: buttons[0]?.pressed ?? false,  // A / Cross
      hk: buttons[1]?.pressed ?? false,  // B / Circle
      lp: buttons[2]?.pressed ?? false,  // X / Square
      hp: buttons[3]?.pressed ?? false,  // Y / Triangle
      
      // Shoulder buttons
      special: buttons[4]?.pressed ?? false,  // LB / L1
      super: buttons[5]?.pressed ?? false,    // RB / R1
      
      // Triggers (some browsers report as buttons, some as axes)
      ability: (buttons[6]?.pressed ?? false) || (axes[2] ?? 0) > 0.5,  // LT / L2
      block: (buttons[7]?.pressed ?? false) || (axes[5] ?? 0) > 0.5,    // RT / R2
    };
  }

  /** Build the snapshot for this sim frame; must be called exactly once per frame per player. */
  sample(slot: 'p1' | 'p2'): InputSnapshot {
    const pad = slot === 'p1' ? this.p1 : this.p2;
    const playerIndex = slot === 'p1' ? 0 : 1;
    pad.frame++;
    const snap = emptyInput();

    // Read gamepad state
    const gpState = this.readGamepad(playerIndex as 0 | 1);
    const gpPrev = this.gamepadPrev[playerIndex];

    const held = (a: ActionId): boolean => {
      // Keyboard/touch
      if (this.isDown(pad, slot, a)) return true;
      // Gamepad
      if (gpState && a in gpState) return gpState[a as keyof GamepadState];
      return false;
    };

    const edge = (a: ActionId): boolean => {
      // Keyboard/touch edge
      const kbNow = this.isDown(pad, slot, a);
      const kbPrev = pad.prevEdge[a] ?? false;
      pad.prevEdge[a] = kbNow;
      const kbEdge = kbNow && !kbPrev;
      
      // Gamepad edge
      let gpEdge = false;
      if (gpState && a in gpState) {
        const gpNow = gpState[a as keyof GamepadState];
        const gpWas = gpPrev ? gpPrev[a as keyof GamepadState] : false;
        gpEdge = gpNow && !gpWas;
      }
      
      return kbEdge || gpEdge;
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
    snap.ability = edge('ability');
    snap.upEdge = edge('up');

    // Store gamepad state for next frame
    this.gamepadPrev[playerIndex] = gpState;

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
    const playerIndex = slot === 'p1' ? 0 : 1;
    pad.prevEdge = {};
    pad.tapHistory = [];
    this.virtual[slot] = {};
    this.gamepadPrev[playerIndex] = null;
  }

  /** Get connected gamepad info for UI display */
  getConnectedGamepads(): { index: number; id: string }[] {
    const gamepads = navigator.getGamepads?.();
    if (!gamepads) return [];
    
    const connected: { index: number; id: string }[] = [];
    for (let i = 0; i < gamepads.length; i++) {
      const gp = gamepads[i];
      if (gp && gp.connected) {
        connected.push({ index: i, id: gp.id });
      }
    }
    return connected;
  }
}

export const inputManager = new InputManager();
