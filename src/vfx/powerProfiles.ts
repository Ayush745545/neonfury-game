import { vfx } from './vfxManager';
import type { CharId } from '../game/types';

/* ================================================================== */
/*  Per-fighter power signatures. Every one of the 15 fighters gets   */
/*  a distinct world-space VFX recipe built from different particle   */
/*  behaviors (embers, debris, glitch shards, spirals, smoke veils,   */
/*  slash crescents, lightning arcs, rings). Recipes fire ONLY from    */
/*  real combat events (confirmed hits, activations, live             */
/*  projectiles) — nothing here is cosmetic-only.                     */
/* ================================================================== */

export type TrailKind =
  | 'flame' | 'spark' | 'smoke' | 'bubble' | 'ice' | 'electric' | 'glitch'
  | 'plasma' | 'holy' | 'claw' | 'psychic' | 'metal' | 'shadow' | 'dust' | 'petal';

export interface PowerProfile {
  trail: TrailKind;
  accent: string;           // secondary color for layered effects
  /** confirmed clean hit */
  hit(x: number, y: number, dir: number, color: string, power: number): void;
  /** blocked hit */
  block(x: number, y: number, dir: number): void;
  /** special / super / ability activation at the fighter */
  activate(x: number, y: number, dir: number, color: string): void;
  /** projectile body trail, called per frame while orb is alive */
  projTrail(x: number, y: number, color: string): void;
}

const prof = (p: PowerProfile): PowerProfile => p;

export const POWER_PROFILES: Record<CharId, PowerProfile> = {
  /* RYDEN — crimson dragon fire: embers + heavy slash arcs */
  ryden: prof({
    trail: 'flame', accent: '#ff8a4d',
    hit(x, y, dir, color, power) {
      if (power > 0.95) vfx.spawnFlamePlume(x, y - 0.1, dir, Math.min(1.15, power * 0.65), 2);
      vfx.spawnSparks(x, y, 0.1, dir, color, Math.round(9 * power), power);
      vfx.spawnEmbers(x, y, '#ff6a3d', Math.round(5 * power), 0.5, 1.4);
      if (power > 1) vfx.spawnSlash(x, y, 0.12, dir > 0 ? -0.5 : Math.PI + 0.5, '#ff5a4d', 0.3, 1.5 * power, 0.16, 1.2);
    },
    block(x, y, dir) {
      vfx.spawnSparks(x, y, 0.1, dir, '#ffd0b0', 6, 0.5);
      vfx.spawnEmbers(x, y, '#ff8a4d', 3, 0.3, 1);
    },
    activate(x, y, dir, color) {
      vfx.spawnFlamePlume(x + dir * 0.25, y - 0.2, dir, 1.25);
      vfx.spawnSmokeVeil(x - dir * 0.15, y, '#3a302b', 5, 1.2);
      vfx.spawnEmbers(x, y + 0.4, '#ff4d2e', 20, 1.1, 2.4);
      vfx.spawnSpiral(x, y + 0.2, color, 14, 0.8, 6, 0.7);
      vfx.spawnSlash(x + dir * 0.6, y + 0.4, 0.1, dir > 0 ? -0.9 : Math.PI + 0.9, '#ff3d2e', 0.2, 2.1, 0.24, 1.4);
    },
    projTrail() { /* ryden has no projectile */ },
  }),
  /* KAITO — blue lightning: arcs + fast electric slashes */
  kaito: prof({
    trail: 'electric', accent: '#9fe8ff',
    hit(x, y, dir, color, power) {
      vfx.spawnSparks(x, y, 0.1, dir, '#d8f4ff', Math.round(8 * power), power);
      vfx.spawnElectric(x, y, color, Math.round(3 + 3 * power));
      if (power > 1) vfx.spawnSlash(x, y, 0.12, dir > 0 ? -0.3 : Math.PI + 0.3, '#66ccff', 0.25, 1.4 * power, 0.12, 0.8);
    },
    block(x, y, dir) {
      vfx.spawnSparks(x, y, 0.1, dir, '#bfe6ff', 6, 0.5);
      vfx.spawnArc(x - dir * 0.2, y + 0.2, 0, x + dir * 0.2, y - 0.2, 0.1, '#66ccff', 0.1);
    },
    activate(x, y, dir, color) {
      vfx.spawnElectric(x, y + 1, color, 8);
      vfx.spawnRing(x, y + 0.9, 0.05, '#66ccff', 0.2, 2.2, 0.3, true, 0);
      vfx.spawnSparks(x, y + 0.6, 0, dir, '#d8f4ff', 12, 1.1);
    },
    projTrail() {},
  }),
  /* VESPER — toxic bloom: bubbles + poison smoke */
  vesper: prof({
    trail: 'bubble', accent: '#b6ff5e',
    hit(x, y, dir, _color, power) {
      vfx.spawnSmokeVeil(x, y - 0.3, '#3d8a3d', Math.round(3 * power), 1.2);
      vfx.spawnSparks(x, y, 0.1, dir, '#b6ff5e', Math.round(6 * power), power * 0.8);
      for (let i = 0; i < Math.round(4 * power); i++) {
        vfx.spawnEmbers(x + (Math.random() - 0.5) * 0.4, y - 0.2, '#7dff8a', 1, 0.2, 1.1);
      }
    },
    block(x, y, dir) {
      vfx.spawnSmokeVeil(x, y - 0.2, '#2c5a2c', 2, 0.8);
      vfx.spawnSparks(x, y, 0.1, dir, '#bfe6ff', 4, 0.4);
    },
    activate(x, y, _dir, _color) {
      vfx.spawnSmokeVeil(x, y - 0.6, '#3d8a3d', 10, 2.4);
      vfx.spawnEmbers(x, y, '#7dff8a', 14, 0.9, 1.6);
      vfx.spawnRing(x, 0.06, 0, '#57ff6a', 0.3, 2.4, 0.6, false);
    },
    projTrail(x, y, color) {
      if (Math.random() < 0.6) vfx.spawnEmbers(x, y - 0.05, Math.random() < 0.5 ? color : '#b6ff5e', 1, 0.12, 0.5);
    },
  }),
  /* GRUUN — iron mountain: rock debris + dust */
  gruun: prof({
    trail: 'metal', accent: '#c26a1e',
    hit(x, y, dir, _color, power) {
      vfx.spawnDebris(x, y, '#8a6a4a', Math.round(4 * power), power);
      vfx.spawnDust(x, y - 0.4, '#b09878', power);
      vfx.spawnSparks(x, y, 0.1, dir, '#ffc46e', Math.round(5 * power), power * 0.9);
    },
    block(x, y, dir) {
      vfx.spawnDebris(x, y, '#6a5238', 3, 0.6);
      vfx.spawnSparks(x, y, 0.1, dir, '#ffd9a0', 5, 0.5);
    },
    activate(x, y, _dir, _color) {
      vfx.spawnDebris(x, y - 0.2, '#8a6a4a', 14, 1.5);
      vfx.spawnDust(x, 0.05, '#b09878', 2.4);
      vfx.spawnRing(x, 0.05, 0, '#ff9a2e', 0.3, 3.2, 0.55, false);
    },
    projTrail() {},
  }),
  /* YUKI — frost veil: ice shards + mist */
  yuki: prof({
    trail: 'ice', accent: '#d8f6ff',
    hit(x, y, dir, _color, power) {
      vfx.spawnDebris(x, y, '#cfeeff', Math.round(4 * power), power * 0.8);
      vfx.spawnSparks(x, y, 0.1, dir, '#e8faff', Math.round(6 * power), power * 0.9);
      vfx.spawnSmokeVeil(x, y - 0.2, '#7aa8c8', 2, 0.8);
      if (power > 1) vfx.spawnSlash(x, y, 0.12, dir > 0 ? -0.7 : Math.PI + 0.7, '#bfeaff', 0.2, 1.3 * power, 0.14, 0.7);
    },
    block(x, y, dir) {
      vfx.spawnSparks(x, y, 0.1, dir, '#e8faff', 6, 0.5);
      vfx.spawnSmokeVeil(x, y - 0.2, '#7aa8c8', 2, 0.6);
    },
    activate(x, y, _dir, _color) {
      vfx.spawnDebris(x, y + 0.6, '#cfeeff', 12, 1.2);
      vfx.spawnSmokeVeil(x, y - 0.4, '#9fd0e8', 8, 2.2);
      vfx.spawnRing(x, y + 0.6, 0.05, '#9fe8ff', 0.2, 2.2, 0.4, true, 0);
    },
    projTrail(x, y, _color) {
      if (Math.random() < 0.5) vfx.spawnDebris(x, y, '#d8f6ff', 1, 0.25);
    },
  }),
  /* EMBER — ash dancer: fire spirals + twin slashes */
  ember: prof({
    trail: 'flame', accent: '#ffc23d',
    hit(x, y, dir, _color, power) {
      vfx.spawnSpiral(x, y, '#ff8a3d', Math.round(6 * power), 0.4, 8, 0.4);
      vfx.spawnSparks(x, y, 0.1, dir, '#ffc23d', Math.round(7 * power), power);
      if (power > 1) {
        vfx.spawnSlash(x, y + 0.1, 0.12, dir > 0 ? -0.6 : Math.PI + 0.6, '#ff6a3d', 0.25, 1.4 * power, 0.15, 1);
        vfx.spawnSlash(x, y - 0.1, 0.1, dir > 0 ? 0.6 : Math.PI - 0.6, '#ffc23d', 0.2, 1.2 * power, 0.13, 0.8);
      }
    },
    block(x, y, dir) {
      vfx.spawnEmbers(x, y, '#ff8a3d', 4, 0.3, 1.2);
      vfx.spawnSparks(x, y, 0.1, dir, '#ffd0a0', 4, 0.4);
    },
    activate(x, y, dir, _color) {
      vfx.spawnSpiral(x, y + 0.3, '#ff6a3d', 20, 0.9, 7, 0.9);
      vfx.spawnEmbers(x, y, '#ffc23d', 14, 1, 2.2);
      vfx.spawnSlash(x + dir * 0.5, y + 0.5, 0.1, dir > 0 ? -1.1 : Math.PI + 1.1, '#ff8a3d', 0.2, 1.9, 0.22, 1.1);
    },
    projTrail() {},
  }),
  /* VOLT — storm runner: jagged yellow arcs + afterflash */
  volt: prof({
    trail: 'electric', accent: '#fff6a8',
    hit(x, y, dir, _color, power) {
      vfx.spawnElectric(x, y, '#ffe14d', Math.round(4 + 2 * power));
      if (power > 1) vfx.spawnLightningStrike(x, y, dir, Math.min(1.2, power * 0.7));
      vfx.spawnSparks(x, y, 0.1, dir, '#fff6a8', Math.round(8 * power), power * 1.1);
      vfx.spawnRing(x, y, 0.08, '#ffe14d', 0.1, 0.9 * power, 0.14, true, 0);
    },
    block(x, y, dir) {
      vfx.spawnArc(x - dir * 0.25, y + 0.25, 0, x + dir * 0.25, y - 0.25, 0.1, '#ffe14d', 0.09);
      vfx.spawnSparks(x, y, 0.1, dir, '#fff6a8', 5, 0.5);
    },
    activate(x, y, dir, _color) {
      vfx.spawnLightningStrike(x, y + 0.1, dir, 1.3);
      vfx.spawnElectric(x, y + 1, '#ffe14d', 10);
      vfx.spawnRing(x, 0.06, 0, '#fff07d', 0.2, 3, 0.4, false);
      vfx.spawnSparks(x, y + 0.5, 0, dir, '#fff6a8', 16, 1.3);
    },
    projTrail() {},
  }),
  /* NYX — shadow fang: imploding dark smoke + thin violet slashes */
  nyx: prof({
    trail: 'shadow', accent: '#e0a8ff',
    hit(x, y, dir, _color, power) {
      vfx.spawnSmokeVeil(x, y - 0.2, '#3a1a52', Math.round(3 * power), 1.1);
      vfx.spawnSparks(x, y, 0.1, dir, '#c97dff', Math.round(6 * power), power * 0.85);
      vfx.spawnSlash(x, y, 0.12, dir > 0 ? -0.25 : Math.PI + 0.25, '#b14dff', 0.2, 1.5 * power, 0.13, 0.6);
      // shadow motes collapsing inward
      vfx.spawnCharge(x, y, '#2a0a42', 0.35);
    },
    block(x, y, dir) {
      vfx.spawnSmokeVeil(x, y - 0.2, '#3a1a52', 2, 0.7);
      vfx.spawnSparks(x, y, 0.1, dir, '#c9a8e8', 4, 0.4);
    },
    activate(x, y, dir, _color) {
      vfx.spawnCharge(x, y + 0.4, '#b14dff', 0.8);
      vfx.spawnSmokeVeil(x, y - 0.5, '#2a0a42', 10, 2.4);
      vfx.spawnSlash(x + dir * 0.4, y + 0.6, 0.1, dir > 0 ? -1.3 : Math.PI + 1.3, '#e0a8ff', 0.2, 2.3, 0.2, 0.7);
    },
    projTrail(x, y, _color) {
      if (Math.random() < 0.7) vfx.spawnSmokeVeil(x, y - 0.05, '#3a1a52', 1, 0.4);
    },
  }),
  /* ORACLE — mind reader: concentric psychic rings */
  oracle: prof({
    trail: 'psychic', accent: '#a8fff0',
    hit(x, y, dir, _color, power) {
      vfx.spawnRing(x, y, 0.06, '#2effc9', 0.1, 0.8 * power, 0.18, true, 0);
      vfx.spawnRing(x, y, 0.1, '#a8fff0', 0.15, 1.2 * power, 0.26, true, 0);
      vfx.spawnSparks(x, y, 0.1, dir, '#d8fff4', Math.round(5 * power), power * 0.8);
    },
    block(x, y, dir) {
      vfx.spawnRing(x, y, 0.08, '#2effc9', 0.1, 0.6, 0.16, true, 0);
      vfx.spawnSparks(x, y, 0.1, dir, '#bfe6ff', 4, 0.4);
    },
    activate(x, y, _dir, _color) {
      for (let i = 0; i < 3; i++) vfx.spawnRing(x, y + 0.6, 0.05 + i * 0.04, '#2effc9', 0.2 + i * 0.3, 2 + i * 0.6, 0.5 + i * 0.15, true, 0);
      vfx.spawnSpiral(x, y + 0.5, '#a8fff0', 12, 0.7, 4, 0.8);
    },
    projTrail(x, y, _color) {
      if (Math.random() < 0.25) vfx.spawnRing(x, y, 0, '#2effc9', 0.08, 0.4, 0.2, true, 0);
    },
  }),
  /* SLAB — wrecking ball: heavy metal sparks + shock dust */
  slab: prof({
    trail: 'metal', accent: '#8fb8ff',
    hit(x, y, dir, _color, power) {
      vfx.spawnDebris(x, y, '#7d8aa0', Math.round(5 * power), power * 1.2);
      vfx.spawnSparks(x, y, 0.1, dir, '#dfe8f8', Math.round(7 * power), power);
      vfx.spawnDust(x, y - 0.5, '#9fb4c8', power * 1.3);
    },
    block(x, y, dir) {
      vfx.spawnSparks(x, y, 0.1, dir, '#dfe8f8', 8, 0.6);
      vfx.spawnDebris(x, y, '#5d6a80', 2, 0.5);
    },
    activate(x, y, _dir, _color) {
      vfx.spawnRing(x, 0.05, 0, '#8fb8ff', 0.3, 3.6, 0.55, false);
      vfx.spawnDust(x, 0.05, '#9fb4c8', 2.6);
      vfx.spawnDebris(x, y, '#7d8aa0', 10, 1.4);
    },
    projTrail() {},
  }),
  /* SABLE — silk assassin: multi slash fan, near-silent white */
  sable: prof({
    trail: 'claw', accent: '#ffffff',
    hit(x, y, dir, _color, power) {
      const rots = dir > 0 ? [-0.9, -0.2, 0.5] : [Math.PI + 0.9, Math.PI + 0.2, Math.PI - 0.5];
      for (let i = 0; i < (power > 1 ? 3 : 2); i++) {
        vfx.spawnSlash(x, y + (i - 1) * 0.14, 0.1 + i * 0.02, rots[i], '#f2f4ff', 0.15, 1.1 * power + i * 0.2, 0.12 + i * 0.02, 0.5);
      }
      vfx.spawnSparks(x, y, 0.1, dir, '#ffffff', Math.round(4 * power), power * 0.7);
    },
    block(x, y, dir) {
      vfx.spawnSlash(x, y, 0.1, dir > 0 ? -0.4 : Math.PI + 0.4, '#c2c8e8', 0.15, 0.7, 0.1, 0.4);
      vfx.spawnSparks(x, y, 0.1, dir, '#e8ecff', 4, 0.4);
    },
    activate(x, y, dir, _color) {
      for (let i = 0; i < 5; i++) {
        vfx.spawnSlash(x + dir * (0.3 + i * 0.12), y + 0.7 - i * 0.22, 0.08, dir > 0 ? -1.2 + i * 0.25 : Math.PI + 1.2 - i * 0.25, '#ffffff', 0.15, 1.6, 0.16, 0.5);
      }
      vfx.spawnSparks(x, y + 0.4, 0, dir, '#f2f4ff', 10, 0.9);
    },
    projTrail() {},
  }),
  /* HEX — glitch wizard: RGB-split shards + scan rings */
  hex: prof({
    trail: 'glitch', accent: '#4dfff2',
    hit(x, y, dir, _color, power) {
      vfx.spawnGlitch(x, y, '#ff4dd8', Math.round(7 * power), '#4dfff2');
      vfx.spawnSparks(x, y, 0.1, dir, '#ff9de2', Math.round(5 * power), power * 0.8);
      if (power > 1) vfx.spawnRing(x, y, 0.08, '#4dfff2', 0.15, 1.2, 0.16, true, 0);
    },
    block(x, y, _dir) {
      vfx.spawnGlitch(x, y, '#ff4dd8', 4, '#4dfff2');
    },
    activate(x, y, _dir, _color) {
      vfx.spawnGlitch(x, y + 0.4, '#ff4dd8', 18, '#4dfff2');
      vfx.spawnRing(x, y + 0.6, 0.05, '#4dfff2', 0.2, 2.4, 0.3, true, 0);
      vfx.spawnRing(x, y + 0.6, 0.09, '#ff4dd8', 0.3, 2.8, 0.42, true, 0);
    },
    projTrail(x, y, color) {
      if (Math.random() < 0.5) vfx.spawnGlitch(x, y, Math.random() < 0.5 ? color : '#4dfff2', 1);
    },
  }),
  /* SOLARA — sun saint: radial sunburst rays + golden flare */
  solara: prof({
    trail: 'holy', accent: '#fff6d8',
    hit(x, y, dir, _color, power) {
      vfx.spawnSparks(x, y, 0.1, dir, '#ffe9a8', Math.round(8 * power), power);
      vfx.spawnRing(x, y, 0.06, '#ffc93d', 0.1, 1.1 * power, 0.2, true, 0);
      if (power > 1) {
        vfx.spawnRing(x, y, 0.1, '#fff6d8', 0.15, 1.7 * power, 0.3, true, Math.PI / 3);
        vfx.spawnEmbers(x, y, '#ffd96e', 5, 0.4, 1.5);
      }
    },
    block(x, y, dir) {
      vfx.spawnSparks(x, y, 0.1, dir, '#ffe9a8', 6, 0.5);
      vfx.spawnRing(x, y, 0.08, '#ffc93d', 0.1, 0.6, 0.14, true, 0);
    },
    activate(x, y, _dir, _color) {
      for (let i = 0; i < 3; i++) vfx.spawnRing(x, y + 0.8, 0.05 + i * 0.03, i % 2 ? '#fff6d8' : '#ffc93d', 0.25, 2.6 + i * 0.8, 0.5 + i * 0.12, true, i * 0.5);
      vfx.spawnEmbers(x, y + 0.4, '#ffd96e', 16, 1, 2.2);
      vfx.spawnRing(x, 0.06, 0, '#ffc93d', 0.3, 3, 0.55, false);
    },
    projTrail(x, y, _color) {
      if (Math.random() < 0.5) vfx.spawnEmbers(x, y, '#ffe9a8', 1, 0.1, 0.35);
    },
  }),
  /* FEN — wild fang: green claw triple + feral dust */
  fen: prof({
    trail: 'claw', accent: '#d0ff9e',
    hit(x, y, dir, _color, power) {
      const rots = dir > 0 ? [-1.0, -0.55, -0.1] : [Math.PI + 1.0, Math.PI + 0.55, Math.PI + 0.1];
      for (let i = 0; i < 3; i++) {
        vfx.spawnSlash(x + (i - 1) * 0.06 * dir, y + (i - 1) * 0.16, 0.1, rots[i], '#8dff4d', 0.15, 1.1 * power, 0.13, 0.75);
      }
      vfx.spawnSparks(x, y, 0.1, dir, '#d0ff9e', Math.round(6 * power), power);
      vfx.spawnDust(x, y - 0.5, '#7a8a5a', power * 0.8);
    },
    block(x, y, dir) {
      vfx.spawnSlash(x, y, 0.1, dir > 0 ? -0.5 : Math.PI + 0.5, '#8dff4d', 0.15, 0.7, 0.1, 0.5);
      vfx.spawnSparks(x, y, 0.1, dir, '#d0ff9e', 4, 0.4);
    },
    activate(x, y, dir, _color) {
      for (let i = 0; i < 4; i++) {
        vfx.spawnSlash(x + dir * (0.3 + i * 0.14), y + 0.8 - i * 0.28, 0.08, dir > 0 ? -1.15 + i * 0.22 : Math.PI + 1.15 - i * 0.22, '#8dff4d', 0.15, 1.8, 0.17, 0.8);
      }
      vfx.spawnDust(x, 0.05, '#7a8a5a', 1.8);
      vfx.spawnSparks(x, y + 0.4, 0, dir, '#d0ff9e', 10, 1);
    },
    projTrail() {},
  }),
  /* ZERO — perfect machine: precise plasma geometry */
  zero: prof({
    trail: 'plasma', accent: '#d8f2ff',
    hit(x, y, dir, _color, power) {
      vfx.spawnRing(x, y, 0.06, '#7dd8ff', 0.08, 0.7 * power, 0.12, true, 0);
      vfx.spawnRing(x, y, 0.1, '#d8f2ff', 0.12, 1.05 * power, 0.18, true, Math.PI / 2);
      vfx.spawnSparks(x, y, 0.1, dir, '#d8f2ff', Math.round(6 * power), power * 0.9);
    },
    block(x, y, dir) {
      vfx.spawnRing(x, y, 0.08, '#7dd8ff', 0.08, 0.5, 0.1, true, 0);
      vfx.spawnSparks(x, y, 0.1, dir, '#bfe6ff', 4, 0.4);
    },
    activate(x, y, _dir, _color) {
      for (let i = 0; i < 4; i++) vfx.spawnRing(x, y + 0.4 + i * 0.35, 0.04, i % 2 ? '#d8f2ff' : '#7dd8ff', 0.5 - i * 0.08, 1.4 + i * 0.4, 0.4 + i * 0.08, false);
      vfx.spawnSpiral(x, y + 0.8, '#7dd8ff', 12, 0.6, 5, 0.7);
    },
    projTrail(x, y, _color) {
      if (Math.random() < 0.45) vfx.spawnRing(x, y, 0, '#7dd8ff', 0.06, 0.28, 0.14, true, Math.random() * Math.PI);
    },
  }),
};
