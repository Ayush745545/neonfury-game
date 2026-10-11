import type { CharId, CharacterStats, HurtboxDef, FighterState, AbilityKind } from '../game/types';

/* ================================================================== */
/*  15-character roster: gameplay stats, hurtboxes, unique abilities   */
/*  (15s cooldown), special-move configs and rendering palettes.       */
/* ================================================================== */

export type Build = 'muscular' | 'athletic' | 'heavy' | 'lean';
export type HairStyle = 'short' | 'spiky' | 'long' | 'ponytail' | 'mohawk' | 'bald' | 'hood';
export type Accessory = 'none' | 'headband' | 'visor' | 'scarf' | 'cape' | 'mask' | 'goggles';
export type Archetype = 'brawler' | 'quick' | 'heavy' | 'zoner';
export type SpecialKind = 'dash' | 'flurry' | 'projectile' | 'upper' | 'slam';

export interface AbilityDef {
  id: string;
  name: string;
  kind: AbilityKind;
  color: string;
  /** buff duration in frames (0 = instant) */
  duration: number;
  /** generic strength: multiplier / damage / amount */
  power: number;
  /** secondary parameter (drain per hit, radius, count…) */
  power2?: number;
  desc: string;
}

export interface CharacterDef {
  id: CharId;
  name: string;
  title: string;
  specialName: string;
  superName: string;
  special: { kind: SpecialKind; color: string; dmgMult?: number };
  ability: AbilityDef;
  archetype: Archetype;
  stats: CharacterStats;
  damageMult: number;      // outgoing damage
  defenseMult: number;     // incoming damage (>1 = takes more)
  reachMult: number;       // hitbox/hurtbox x-scale
  weightMult: number;      // knockback resistance (>1 = heavier)
  color: string;
  colorAlt: string;
  uiAccent: string;
  statBars: { power: number; speed: number; technique: number; defense: number };
  palette: {
    skin: string;
    clothMain: string;
    clothAlt: string;
    trim: string;
    hair: string;
    glove: string;
    belt?: string;
    energy: string;
  };
  build: Build;
  hair: HairStyle;
  accessory: Accessory;
  scale: number;
  /** 0 = square-on stance (ryden), 1 = fully bladed (kaito) */
  bladed: number;
  guard: number;           // guard height offset (deg)
  victoryStyle: 0 | 1 | 2;
}

const stand: HurtboxDef = { x: 0, y: 0.98, w: 0.62, h: 1.86 };
const crouch: HurtboxDef = { x: 0, y: 0.6, w: 0.66, h: 1.16 };
const air: HurtboxDef = { x: 0, y: 0.9, w: 0.6, h: 1.5 };

export function hurtboxFor(state: FighterState, crouching: boolean, airborne: boolean): HurtboxDef {
  if (airborne || state === 'jump' || state === 'airAttack' || state === 'airHitstun') return air;
  if (crouching || state === 'crouch' || state === 'blockCrouch' || state === 'crouchWalkF' || state === 'crouchWalkB') return crouch;
  if (state === 'knockdown' || state === 'ko' || state === 'getup') return { x: 0, y: 0.35, w: 1.3, h: 0.6 };
  return stand;
}

/* ---------------- archetype stat presets ---------------- */

const archStats = (a: Archetype, spd = 1): CharacterStats => {
  switch (a) {
    case 'brawler':
      return { walkF: 2.25 * spd, walkB: 1.85 * spd, crouchWalkF: 1.1, crouchWalkB: 0.95, jumpVY: 11.2, dashFSpeed: 6.6, dashFTime: 15, dashBSpeed: 6.2, dashBTime: 16 };
    case 'quick':
      return { walkF: 2.55 * spd, walkB: 2.1 * spd, crouchWalkF: 1.25, crouchWalkB: 1.1, jumpVY: 11.6, dashFSpeed: 7.6, dashFTime: 14, dashBSpeed: 7.2, dashBTime: 15 };
    case 'heavy':
      return { walkF: 1.95 * spd, walkB: 1.6 * spd, crouchWalkF: 0.95, crouchWalkB: 0.85, jumpVY: 10.4, dashFSpeed: 5.8, dashFTime: 16, dashBSpeed: 5.4, dashBTime: 18 };
    case 'zoner':
      return { walkF: 2.15 * spd, walkB: 1.9 * spd, crouchWalkF: 1.05, crouchWalkB: 0.95, jumpVY: 11.0, dashFSpeed: 6.4, dashFTime: 15, dashBSpeed: 6.6, dashBTime: 16 };
  }
};

const archMods = (a: Archetype) => {
  switch (a) {
    case 'brawler': return { damageMult: 1.0, defenseMult: 1.0, reachMult: 1.0, weightMult: 1.0 };
    case 'quick': return { damageMult: 0.92, defenseMult: 1.04, reachMult: 0.96, weightMult: 0.92 };
    case 'heavy': return { damageMult: 1.18, defenseMult: 0.88, reachMult: 1.06, weightMult: 1.3 };
    case 'zoner': return { damageMult: 0.95, defenseMult: 1.02, reachMult: 1.12, weightMult: 0.95 };
  }
};

const ability = (
  id: string, name: string, kind: AbilityKind, color: string,
  duration: number, power: number, desc: string, power2?: number,
): AbilityDef => ({ id, name, kind, color, duration, power, power2, desc });

interface CharSeed {
  id: CharId; name: string; title: string;
  specialName: string; superName: string;
  special: { kind: SpecialKind; color: string; dmgMult?: number };
  ability: AbilityDef;
  archetype: Archetype; spd?: number;
  color: string; colorAlt: string;
  statBars: { power: number; speed: number; technique: number; defense: number };
  palette: CharacterDef['palette'];
  build: Build; hair: HairStyle; accessory: Accessory;
  scale: number; bladed: number; guard: number; victoryStyle: 0 | 1 | 2;
}

const mk = (seed: CharSeed): CharacterDef => ({
  ...seed,
  stats: archStats(seed.archetype, seed.spd ?? 1),
  ...archMods(seed.archetype),
  uiAccent: seed.color,
});

/* ---------------- THE ROSTER ---------------- */

export const CHARACTERS: Record<CharId, CharacterDef> = {
  ryden: mk({
    id: 'ryden', name: 'RYDEN', title: 'THE CRIMSON DRAGON',
    specialName: 'CRIMSON DRAGON STRIKE', superName: 'DRAGON FURY',
    special: { kind: 'dash', color: '#ff2244' },
    ability: ability('dragons_wrath', "DRAGON'S WRATH", 'damageBuff', '#ff2244', 5 * 60, 1.4, '+40% damage for 5s'),
    archetype: 'brawler',
    color: '#ff2244', colorAlt: '#ff6644',
    statBars: { power: 9, speed: 6, technique: 6, defense: 8 },
    palette: { skin: '#c68b62', clothMain: '#17181d', clothAlt: '#8f1226', trim: '#ff2244', hair: '#141013', glove: '#261014', belt: '#b3122e', energy: '#ff3344' },
    build: 'muscular', hair: 'short', accessory: 'headband', scale: 1.02, bladed: 0.15, guard: 0, victoryStyle: 0,
  }),
  kaito: mk({
    id: 'kaito', name: 'KAITO', title: 'THE THUNDER GHOST',
    specialName: 'THUNDER BREAKER', superName: 'THUNDERSTORM',
    special: { kind: 'flurry', color: '#33aaff' },
    ability: ability('phase_shift', 'PHASE SHIFT', 'teleport', '#33aaff', 0, 0, 'Blink behind the opponent'),
    archetype: 'quick',
    color: '#33aaff', colorAlt: '#66ddff',
    statBars: { power: 6, speed: 9, technique: 9, defense: 6 },
    palette: { skin: '#d9a077', clothMain: '#101822', clothAlt: '#123a63', trim: '#33aaff', hair: '#1a1f2b', glove: '#14202e', energy: '#44bbff' },
    build: 'athletic', hair: 'spiky', accessory: 'visor', scale: 0.99, bladed: 1, guard: 0, victoryStyle: 1,
  }),
  vesper: mk({
    id: 'vesper', name: 'VESPER', title: 'THE TOXIC BLOOM',
    specialName: 'SPORE LANCE', superName: 'PANDEMIC BLOOM',
    special: { kind: 'projectile', color: '#57ff6a' },
    ability: ability('siphon', 'SIPHON', 'drain', '#57ff6a', 6 * 60, 14, 'Heal 14 HP per landed hit for 6s'),
    archetype: 'zoner',
    color: '#57ff6a', colorAlt: '#b6ff5e',
    statBars: { power: 6, speed: 6, technique: 9, defense: 6 },
    palette: { skin: '#b98a68', clothMain: '#101a12', clothAlt: '#1d3a20', trim: '#57ff6a', hair: '#2c4a26', glove: '#14241a', energy: '#7dff8a' },
    build: 'lean', hair: 'long', accessory: 'none', scale: 0.98, bladed: 0.6, guard: -4, victoryStyle: 2,
  }),
  gruun: mk({
    id: 'gruun', name: 'GRUUN', title: 'THE IRON MOUNTAIN',
    specialName: 'BOULDER CRUSH', superName: 'EARTHSHAKER',
    special: { kind: 'slam', color: '#ff9a2e' },
    ability: ability('stone_skin', 'STONE SKIN', 'armor', '#ff9a2e', 210, 0.4, 'Armor: -60% damage, no flinch (3.5s)'),
    archetype: 'heavy',
    color: '#ff9a2e', colorAlt: '#c26a1e',
    statBars: { power: 10, speed: 3, technique: 4, defense: 10 },
    palette: { skin: '#a9713f', clothMain: '#241a12', clothAlt: '#4a3320', trim: '#ff9a2e', hair: '#3a2c20', glove: '#2c2118', belt: '#5a3f22', energy: '#ffb45e' },
    build: 'heavy', hair: 'bald', accessory: 'none', scale: 1.12, bladed: 0.05, guard: -6, victoryStyle: 0,
  }),
  yuki: mk({
    id: 'yuki', name: 'YUKI', title: 'THE FROST VEIL',
    specialName: 'GLACIER FANG', superName: 'ABSOLUTE ZERO',
    special: { kind: 'upper', color: '#9fe8ff' },
    ability: ability('slipstream', 'SLIPSTREAM', 'speed', '#9fe8ff', 5 * 60, 1.45, '+45% move speed for 5s'),
    archetype: 'quick', spd: 1.02,
    color: '#9fe8ff', colorAlt: '#d8f6ff',
    statBars: { power: 5, speed: 10, technique: 8, defense: 5 },
    palette: { skin: '#e8c3a8', clothMain: '#141d28', clothAlt: '#2a4a63', trim: '#9fe8ff', hair: '#cfe9f5', glove: '#1c2c3c', energy: '#c2f2ff' },
    build: 'lean', hair: 'ponytail', accessory: 'scarf', scale: 0.96, bladed: 0.8, guard: 4, victoryStyle: 1,
  }),
  ember: mk({
    id: 'ember', name: 'EMBER', title: 'THE ASH DANCER',
    specialName: 'CINDER SPIRAL', superName: 'PHOENIX REQUIEM',
    special: { kind: 'flurry', color: '#ff6a3d', dmgMult: 0.92 },
    ability: ability('riposte', 'RIPOSTE', 'counter', '#ff6a3d', 130, 95, 'Counter stance 2.2s: auto-punish attackers'),
    archetype: 'brawler', spd: 1.04,
    color: '#ff6a3d', colorAlt: '#ffc23d',
    statBars: { power: 7, speed: 8, technique: 8, defense: 6 },
    palette: { skin: '#8a5a3b', clothMain: '#1d1210', clothAlt: '#57231a', trim: '#ff6a3d', hair: '#571d10', glove: '#2a1512', energy: '#ff8a4d' },
    build: 'athletic', hair: 'long', accessory: 'none', scale: 0.99, bladed: 0.5, guard: 2, victoryStyle: 2,
  }),
  volt: mk({
    id: 'volt', name: 'VOLT', title: 'THE STORM RUNNER',
    specialName: 'LIGHTNING RAID', superName: 'MEGAVOLT CASCADE',
    special: { kind: 'dash', color: '#ffe14d', dmgMult: 0.85 },
    ability: ability('thunderclap', 'THUNDERCLAP', 'shockwave', '#ffe14d', 0, 45, 'Point-blank AOE blast (r2.2)'),
    archetype: 'quick', spd: 1.1,
    color: '#ffe14d', colorAlt: '#fff6a8',
    statBars: { power: 5, speed: 10, technique: 7, defense: 5 },
    palette: { skin: '#c98f5e', clothMain: '#1a1a10', clothAlt: '#4a4416', trim: '#ffe14d', hair: '#ffe98a', glove: '#242414', energy: '#fff07d' },
    build: 'lean', hair: 'spiky', accessory: 'goggles', scale: 0.95, bladed: 0.7, guard: 2, victoryStyle: 1,
  }),
  nyx: mk({
    id: 'nyx', name: 'NYX', title: 'THE SHADOW FANG',
    specialName: 'UMBRA BOLT', superName: 'ECLIPSE REQUIEM',
    special: { kind: 'projectile', color: '#b14dff' },
    ability: ability('umbral_veil', 'UMBRAL VEIL', 'invuln', '#b14dff', 72, 0, 'Untouchable phantom for 1.2s'),
    archetype: 'zoner', spd: 1.03,
    color: '#b14dff', colorAlt: '#e0a8ff',
    statBars: { power: 6, speed: 7, technique: 9, defense: 5 },
    palette: { skin: '#a8795c', clothMain: '#120c1c', clothAlt: '#2e1a4a', trim: '#b14dff', hair: '#241236', glove: '#1a1028', energy: '#c97dff' },
    build: 'lean', hair: 'long', accessory: 'mask', scale: 0.97, bladed: 0.9, guard: 0, victoryStyle: 2,
  }),
  oracle: mk({
    id: 'oracle', name: 'ORACLE', title: 'THE MIND READER',
    specialName: 'PSYCHIC PALM', superName: 'FATE REWRITE',
    special: { kind: 'upper', color: '#2effc9' },
    ability: ability('foresight', 'FORESIGHT', 'meterGain', '#2effc9', 0, 35, 'Instantly gain 35 super meter'),
    archetype: 'brawler', spd: 0.98,
    color: '#2effc9', colorAlt: '#a8fff0',
    statBars: { power: 7, speed: 5, technique: 10, defense: 7 },
    palette: { skin: '#b0784e', clothMain: '#0d1a18', clothAlt: '#17423a', trim: '#2effc9', hair: '#0f2a26', glove: '#122420', energy: '#5effd8' },
    build: 'athletic', hair: 'bald', accessory: 'visor', scale: 1.0, bladed: 0.35, guard: 6, victoryStyle: 0,
  }),
  slab: mk({
    id: 'slab', name: 'SLAB', title: 'THE WRECKING BALL',
    specialName: 'DEMOLITION', superName: 'TOTAL COLLAPSE',
    special: { kind: 'slam', color: '#b8c4d8' },
    ability: ability('singularity', 'SINGULARITY', 'gravityPull', '#8fb8ff', 0, 5, 'Drag the opponent to you + stun'),
    archetype: 'heavy', spd: 0.95,
    color: '#b8c4d8', colorAlt: '#7d8aa0',
    statBars: { power: 10, speed: 2, technique: 5, defense: 9 },
    palette: { skin: '#c2987a', clothMain: '#1a1e24', clothAlt: '#333c48', trim: '#8fb8ff', hair: '#3a4250', glove: '#22282f', belt: '#3d4653', energy: '#a8c8ff' },
    build: 'heavy', hair: 'mohawk', accessory: 'none', scale: 1.14, bladed: 0.1, guard: -8, victoryStyle: 0,
  }),
  sable: mk({
    id: 'sable', name: 'SABLE', title: 'THE SILK ASSASSIN',
    specialName: 'SILK FANG', superName: 'THOUSAND CUTS',
    special: { kind: 'dash', color: '#f2f4ff', dmgMult: 0.82 },
    ability: ability('renew', 'RENEW', 'secondWind', '#f2f4ff', 0, 60, 'Break free of stun, rise instantly, heal 60'),
    archetype: 'quick', spd: 1.08,
    color: '#f2f4ff', colorAlt: '#c2c8e8',
    statBars: { power: 5, speed: 9, technique: 10, defense: 4 },
    palette: { skin: '#e3c0a5', clothMain: '#191c24', clothAlt: '#3a4152', trim: '#f2f4ff', hair: '#e8eaf2', glove: '#22262f', energy: '#ffffff' },
    build: 'lean', hair: 'ponytail', accessory: 'scarf', scale: 0.95, bladed: 0.85, guard: 2, victoryStyle: 1,
  }),
  hex: mk({
    id: 'hex', name: 'HEX', title: 'THE GLITCH WIZARD',
    specialName: 'DATA SPIKE', superName: 'FATAL EXCEPTION',
    special: { kind: 'projectile', color: '#ff4dd8' },
    ability: ability('system_crash', 'SYSTEM CRASH', 'drainField', '#ff4dd8', 0, 25, 'Steal 25 meter + glitch-stun nearby foes'),
    archetype: 'zoner',
    color: '#ff4dd8', colorAlt: '#4dfff2',
    statBars: { power: 6, speed: 6, technique: 10, defense: 5 },
    palette: { skin: '#9a6b4f', clothMain: '#12101e', clothAlt: '#2c1a4a', trim: '#ff4dd8', hair: '#35204f', glove: '#1c1430', energy: '#ff7de2' },
    build: 'athletic', hair: 'hood', accessory: 'goggles', scale: 0.98, bladed: 0.65, guard: 0, victoryStyle: 2,
  }),
  solara: mk({
    id: 'solara', name: 'SOLARA', title: 'THE SUN SAINT',
    specialName: 'SOLAR LANCE', superName: 'SUPERNOVA JUDGEMENT',
    special: { kind: 'upper', color: '#ffc93d' },
    ability: ability('solar_flare', 'SOLAR FLARE', 'projBurst', '#ffc93d', 0, 34, 'Fire a 3-orb spread burst'),
    archetype: 'brawler', spd: 1.0,
    color: '#ffc93d', colorAlt: '#ffe9a8',
    statBars: { power: 8, speed: 6, technique: 7, defense: 7 },
    palette: { skin: '#a06a42', clothMain: '#221a0e', clothAlt: '#57421a', trim: '#ffc93d', hair: '#3a2c12', glove: '#2c2210', belt: '#6a5220', energy: '#ffd96e' },
    build: 'athletic', hair: 'long', accessory: 'headband', scale: 1.0, bladed: 0.4, guard: 4, victoryStyle: 0,
  }),
  fen: mk({
    id: 'fen', name: 'FEN', title: 'THE WILD FANG',
    specialName: 'SAVAGE RUSH', superName: 'PRIMAL SLAUGHTER',
    special: { kind: 'dash', color: '#8dff4d', dmgMult: 1.05 },
    ability: ability('berserk', 'BERSERK', 'berserk', '#8dff4d', 5 * 60, 1.25, '+25% damage, +20% speed for 5s'),
    archetype: 'heavy', spd: 1.12,
    color: '#8dff4d', colorAlt: '#d0ff9e',
    statBars: { power: 9, speed: 7, technique: 4, defense: 7 },
    palette: { skin: '#b57c52', clothMain: '#151f10', clothAlt: '#2f4a1d', trim: '#8dff4d', hair: '#4a6b2a', glove: '#1e2c14', belt: '#3d5a22', energy: '#a2ff6e' },
    build: 'muscular', hair: 'mohawk', accessory: 'none', scale: 1.05, bladed: 0.25, guard: -2, victoryStyle: 0,
  }),
  zero: mk({
    id: 'zero', name: 'ZERO', title: 'THE PERFECT MACHINE',
    specialName: 'PLASMA CANNON', superName: 'ORBITAL ERASURE',
    special: { kind: 'projectile', color: '#7dd8ff', dmgMult: 1.05 },
    ability: ability('overclock', 'OVERCLOCK', 'overclock', '#7dd8ff', 4 * 60, 1.35, 'Attacks 35% faster for 4s'),
    archetype: 'zoner', spd: 1.0,
    color: '#7dd8ff', colorAlt: '#d8f2ff',
    statBars: { power: 7, speed: 6, technique: 10, defense: 8 },
    palette: { skin: '#c9d4dd', clothMain: '#14181e', clothAlt: '#2c3640', trim: '#7dd8ff', hair: '#3a444e', glove: '#1c222a', energy: '#9fe4ff' },
    build: 'athletic', hair: 'bald', accessory: 'visor', scale: 1.0, bladed: 0.45, guard: 2, victoryStyle: 1,
  }),
};

export const ROSTER: CharId[] = [
  'ryden', 'kaito', 'vesper', 'gruun', 'yuki', 'ember', 'volt', 'nyx',
  'oracle', 'slab', 'sable', 'hex', 'solara', 'fen', 'zero',
];

export const CHAR_LIST: CharacterDef[] = ROSTER.map((id) => CHARACTERS[id]);
