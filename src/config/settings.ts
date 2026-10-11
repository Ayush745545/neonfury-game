import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ActionId } from '../game/types';

export type Difficulty = 'easy' | 'normal' | 'hard';
export type Quality = 'low' | 'medium' | 'high';

export interface Bindings { p1: Record<ActionId, string>; p2: Record<ActionId, string> }

export const DEFAULT_BINDINGS: Bindings = {
  p1: {
    left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS',
    lp: 'KeyJ', hp: 'KeyK', lk: 'KeyU', hk: 'KeyI',
    block: 'KeyL', special: 'KeyO', super: 'Space', ability: 'KeyP',
  },
  p2: {
    left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown',
    lp: 'Numpad1', hp: 'Numpad2', lk: 'Numpad4', hk: 'Numpad5',
    block: 'Numpad0', special: 'NumpadEnter', super: 'Numpad3', ability: 'Numpad6',
  },
};

interface SettingsState {
  difficulty: Difficulty;
  quality: Quality;
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  showHitboxes: boolean;
  screenShake: boolean;
  exposure: number;          // renderer tone-mapping exposure (0.7–1.6)
  showFps: boolean;          // performance monitor overlay
  autoQuality: boolean;      // degrade preset on sustained low FPS
  reduceFlashes: boolean;    // accessibility: cap screen-flash intensity
  colorblindBars: boolean;   // accessibility: blue/orange health bars
  uiScale: number;           // HUD/menu scale (0.85–1.3)
  gamepadEnabled: boolean;   // poll gamepads for P1/P2
  vibrationIntensity: number; // haptic feedback strength (0.0–1.0, 0=off)
  bindings: Bindings;
  set: (partial: Partial<Omit<SettingsState, 'set' | 'resetBindings'>>) => void;
  bind: (player: 'p1' | 'p2', action: ActionId, code: string) => void;
  resetBindings: () => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      difficulty: 'normal',
      quality: 'high',
      masterVolume: 0.8,
      sfxVolume: 0.9,
      musicVolume: 0.5,
      showHitboxes: false,
      screenShake: true,
      exposure: 1.12,
      showFps: false,
      autoQuality: true,
      reduceFlashes: false,
      colorblindBars: false,
      uiScale: 1,
      gamepadEnabled: true,
      vibrationIntensity: 1.0,
      bindings: DEFAULT_BINDINGS,
      set: (partial) => set(partial),
      bind: (player, action, code) =>
        set((s) => {
          const next = { ...s.bindings[player], [action]: code };
          // avoid two actions sharing one key on the same pad
          for (const k of Object.keys(next) as ActionId[]) {
            if (k !== action && next[k] === code) next[k] = 'Unbound';
          }
          return { bindings: { ...s.bindings, [player]: next } };
        }),
      resetBindings: () => set({ bindings: DEFAULT_BINDINGS }),
    }),
    { name: 'neon-fury-settings' },
  ),
);

export function prettyKey(code: string): string {
  if (code === 'Unbound') return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  if (code.startsWith('Arrow')) return `${code.slice(5)} Arrow`;
  const map: Record<string, string> = {
    Space: 'SPACE', Enter: 'ENTER', ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT',
    ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL', AltLeft: 'L-ALT', Escape: 'ESC',
    Slash: '/', Period: '.', Comma: ',', Minus: '-', Equal: '=',
  };
  return map[code] ?? code;
}
