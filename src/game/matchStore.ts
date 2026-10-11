import { create } from 'zustand';
import type { CharId, MatchMode, MatchPhase } from './types';
import type { Difficulty } from '../config/settings';

export type Screen = 'menu' | 'select' | 'stage' | 'net' | 'game';

export interface HudCombo { count: number; damage: number }

interface MatchState {
  screen: Screen;
  mode: MatchMode;
  difficulty: Difficulty;
  p1Char: CharId | null;
  p2Char: CharId | null;
  stageId: string | null;
  /** netplay */
  netRole: 'host' | 'guest' | null;
  netAddr: string;
  /** live HUD mirror of the simulation (written by the engine each frame) */
  phase: MatchPhase;
  round: number;
  timeLeft: number;
  health: [number, number];
  meter: [number, number];
  roundsWon: [number, number];
  combo: [HudCombo, HudCombo];
  abilityCd: [number, number];
  matchWinner: 0 | 1 | 'double' | null;
  showResults: boolean;
  paused: boolean;
  introPlayed: boolean;

  gotoMenu: () => void;
  gotoSelect: (mode: MatchMode) => void;
  pickChar: (slot: 'p1' | 'p2', c: CharId) => void;
  startMatch: (opts?: { skipIntro?: boolean }) => void;
  setStage: (id: string) => void;
  setScreen: (s: Screen) => void;
  setDifficulty: (d: Difficulty) => void;
  setNet: (role: 'host' | 'guest' | null, addr?: string) => void;
}

export const useMatchStore = create<MatchState>((set) => ({
  screen: 'menu',
  mode: 'arcade',
  difficulty: 'normal',
  p1Char: null,
  p2Char: null,
  stageId: null,
  netRole: null,
  netAddr: '',
  phase: 'intro',
  round: 1,
  timeLeft: 99,
  health: [1000, 1000],
  meter: [0, 0],
  roundsWon: [0, 0],
  combo: [{ count: 0, damage: 0 }, { count: 0, damage: 0 }],
  abilityCd: [0, 0],
  matchWinner: null,
  showResults: false,
  paused: false,
  introPlayed: false,

  gotoMenu: () =>
    set({ screen: 'menu', showResults: false, paused: false, p1Char: null, p2Char: null, stageId: null, netRole: null }),

  gotoSelect: (mode) =>
    set({ screen: 'select', mode, p1Char: null, p2Char: null, showResults: false, paused: false }),

  pickChar: (slot, c) => {
    if (slot === 'p1') set({ p1Char: c });
    else set({ p2Char: c });
  },

  startMatch: () => set({ screen: 'game', showResults: false, paused: false }),

  setStage: (id) => set({ stageId: id }),

  setScreen: (sc) => set({ screen: sc }),

  setDifficulty: (d) => set({ difficulty: d }),

  setNet: (role, addr) => set({ netRole: role, netAddr: addr ?? '' }),
}));
