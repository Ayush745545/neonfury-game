import type { MoveDef, HitboxDef, CharId, ProjectileSpawn } from '../game/types';
import { SPECIAL_METER_COST, SUPER_METER_COST } from '../config/constants';
import { CHARACTERS, ROSTER, type Archetype, type SpecialKind } from '../fighters/characters';

/* ================================================================== */
/*  Generated move library. Archetype templates carry the frame data; */
/*  per-character multipliers (damage / reach / speed) personalize    */
/*  each of the 15 fighters. Tune balance here — never in renderers.  */
/* ================================================================== */

type HB = Partial<HitboxDef> & Pick<HitboxDef, 't0' | 't1' | 'x' | 'y' | 'w' | 'h'>;

const hb = (h: HB): HitboxDef => ({
  level: 'mid',
  damage: 40,
  hitstun: 14,
  blockstun: 10,
  hitstopSelf: 5,
  hitstopVictim: 9,
  knockX: 1.6,
  knockY: 0,
  effect: 'spark',
  ...h,
});

/** Archetype normal-move frame data (ryden/kaito tables generalized). */
interface NormalTemplate {
  lp: { s: number; a: number; r: number; dmg: number; x: number; y: number; w: number; hs: number };
  hp: { s: number; a: number; r: number; dmg: number; x: number; y: number; w: number; hs: number; kx: number };
  lk: { s: number; a: number; r: number; dmg: number; x: number; y: number; w: number };
  hk: { s: number; a: number; r: number; dmg: number; x: number; y: number; w: number; kd: boolean; twin?: boolean };
  clp: { s: number; a: number; r: number; dmg: number };
  chp: { s: number; a: number; r: number; dmg: number };
  clk: { s: number; a: number; r: number; dmg: number };
  sweep: { s: number; a: number; r: number; dmg: number };
  jlp: { dmg: number };
  jhk: { dmg: number };
}

const TEMPLATES: Record<Archetype, NormalTemplate> = {
  // brawler — ryden's hand-tuned table
  brawler: {
    lp: { s: 4, a: 3, r: 8, dmg: 28, x: 0.62, y: 1.32, w: 0.62, hs: 12 },
    hp: { s: 8, a: 4, r: 15, dmg: 68, x: 0.78, y: 1.34, w: 0.85, hs: 18, kx: 3.1 },
    lk: { s: 6, a: 4, r: 10, dmg: 42, x: 0.72, y: 1.05, w: 0.8 },
    hk: { s: 11, a: 6, r: 19, dmg: 92, x: 0.85, y: 1.25, w: 1.05, kd: true },
    clp: { s: 4, a: 3, r: 8, dmg: 24 },
    chp: { s: 7, a: 4, r: 14, dmg: 60 },
    clk: { s: 5, a: 4, r: 10, dmg: 36 },
    sweep: { s: 9, a: 4, r: 22, dmg: 72 },
    jlp: { dmg: 48 },
    jhk: { dmg: 68 },
  },
  // quick — kaito's hand-tuned table
  quick: {
    lp: { s: 3, a: 3, r: 7, dmg: 24, x: 0.6, y: 1.34, w: 0.6, hs: 11 },
    hp: { s: 7, a: 4, r: 14, dmg: 62, x: 0.76, y: 1.36, w: 0.82, hs: 17, kx: 2.9 },
    lk: { s: 5, a: 4, r: 9, dmg: 36, x: 0.7, y: 1.0, w: 0.78 },
    hk: { s: 9, a: 10, r: 17, dmg: 40, x: 0.82, y: 1.3, w: 1.0, kd: false, twin: true },
    clp: { s: 3, a: 3, r: 8, dmg: 22 },
    chp: { s: 6, a: 4, r: 13, dmg: 55 },
    clk: { s: 5, a: 4, r: 9, dmg: 32 },
    sweep: { s: 8, a: 4, r: 21, dmg: 68 },
    jlp: { dmg: 44 },
    jhk: { dmg: 62 },
  },
  heavy: {
    lp: { s: 5, a: 3, r: 9, dmg: 32, x: 0.66, y: 1.3, w: 0.66, hs: 13 },
    hp: { s: 10, a: 5, r: 17, dmg: 82, x: 0.84, y: 1.32, w: 0.92, hs: 20, kx: 3.6 },
    lk: { s: 7, a: 4, r: 12, dmg: 48, x: 0.78, y: 1.02, w: 0.86 },
    hk: { s: 14, a: 7, r: 22, dmg: 108, x: 0.92, y: 1.22, w: 1.15, kd: true },
    clp: { s: 5, a: 3, r: 9, dmg: 27 },
    chp: { s: 8, a: 5, r: 15, dmg: 70 },
    clk: { s: 6, a: 4, r: 11, dmg: 40 },
    sweep: { s: 11, a: 4, r: 24, dmg: 84 },
    jlp: { dmg: 55 },
    jhk: { dmg: 80 },
  },
  zoner: {
    lp: { s: 4, a: 3, r: 8, dmg: 25, x: 0.68, y: 1.33, w: 0.68, hs: 12 },
    hp: { s: 8, a: 4, r: 15, dmg: 60, x: 0.86, y: 1.35, w: 0.9, hs: 17, kx: 2.8 },
    lk: { s: 6, a: 4, r: 10, dmg: 38, x: 0.8, y: 1.04, w: 0.86 },
    hk: { s: 12, a: 6, r: 20, dmg: 86, x: 0.95, y: 1.26, w: 1.12, kd: true },
    clp: { s: 4, a: 3, r: 8, dmg: 23 },
    chp: { s: 7, a: 4, r: 14, dmg: 56 },
    clk: { s: 5, a: 4, r: 10, dmg: 33 },
    sweep: { s: 9, a: 4, r: 22, dmg: 70 },
    jlp: { dmg: 46 },
    jhk: { dmg: 64 },
  },
};

function buildNormals(char: CharId): MoveDef[] {
  const def = CHARACTERS[char];
  const T = TEMPLATES[def.archetype];
  const dmg = (d: number) => Math.round(d * def.damageMult);
  const rx = (x: number) => +(x * def.reachMult).toFixed(3);
  const rw = (w: number) => +(w * def.reachMult).toFixed(3);
  const chainsLight = [`${char}_lp`, `${char}_hp`, `${char}_lk`, `${char}_hk`];
  const out: MoveDef[] = [];

  const base = { char, kind: 'normal' as const, meterCost: 0, specialCancel: true };

  out.push({
    ...base, id: `${char}_lp`, name: 'Jab', startup: T.lp.s, active: T.lp.a, recovery: T.lp.r,
    hitboxes: [hb({ t0: T.lp.s, t1: T.lp.s + T.lp.a - 1, x: rx(T.lp.x), y: T.lp.y, w: rw(T.lp.w), h: 0.3, damage: dmg(T.lp.dmg), hitstun: T.lp.hs, blockstun: 9, knockX: 0.9, hitstopSelf: 4, hitstopVictim: 8 })],
    chains: chainsLight, sfx: 'punchL', anim: 'lp', hitAdv: 1,
  });
  out.push({
    ...base, id: `${char}_hp`, name: 'Heavy Fist', startup: T.hp.s, active: T.hp.a, recovery: T.hp.r,
    hitboxes: [hb({ t0: T.hp.s, t1: T.hp.s + T.hp.a - 1, x: rx(T.hp.x), y: T.hp.y, w: rw(T.hp.w), h: 0.36, damage: dmg(T.hp.dmg), hitstun: T.hp.hs, blockstun: 12, knockX: T.hp.kx, hitstopSelf: 7, hitstopVictim: 13, effect: 'heavy' })],
    sfx: 'punchH', anim: 'hp', hitAdv: -1,
  });
  out.push({
    ...base, id: `${char}_lk`, name: 'Light Kick', startup: T.lk.s, active: T.lk.a, recovery: T.lk.r,
    hitboxes: [hb({ t0: T.lk.s, t1: T.lk.s + T.lk.a - 1, x: rx(T.lk.x), y: T.lk.y, w: rw(T.lk.w), h: 0.34, damage: dmg(T.lk.dmg), hitstun: 14, blockstun: 10, knockX: 1.9, hitstopSelf: 5, hitstopVictim: 10 })],
    chains: [`${char}_hk`], sfx: 'kickL', anim: 'lk', hitAdv: 0,
  });
  if (T.hk.twin) {
    out.push({
      ...base, id: `${char}_hk`, name: 'Twin Kicks', startup: T.hk.s, active: T.hk.a, recovery: T.hk.r,
      hitboxes: [
        hb({ t0: T.hk.s, t1: T.hk.s + 3, x: rx(T.hk.x), y: T.hk.y, w: rw(T.hk.w), h: 0.5, damage: dmg(T.hk.dmg), hitstun: 14, blockstun: 10, knockX: 1.2, hitstopSelf: 5, hitstopVictim: 9, effect: 'spark' }),
        hb({ t0: T.hk.s + 5, t1: T.hk.s + 9, x: rx(T.hk.x + 0.08), y: T.hk.y - 0.15, w: rw(T.hk.w + 0.1), h: 0.7, damage: dmg(T.hk.dmg + 12), hitstun: 20, blockstun: 13, knockX: 4.2, knockY: 3.6, hitstopSelf: 8, hitstopVictim: 14, effect: 'knockdown' }),
      ],
      advance: [{ t0: T.hk.s + 4, t1: T.hk.s + 9, vx: 2.0 }],
      sfx: 'kickH', anim: 'hk', hitAdv: -5,
    });
  } else {
    out.push({
      ...base, id: `${char}_hk`, name: 'Heavy Kick', startup: T.hk.s, active: T.hk.a, recovery: T.hk.r,
      hitboxes: [hb({ t0: T.hk.s, t1: T.hk.s + T.hk.a - 1, x: rx(T.hk.x), y: T.hk.y, w: rw(T.hk.w), h: 0.9, damage: dmg(T.hk.dmg), hitstun: 22, blockstun: 14, knockX: 4.6, knockY: T.hk.kd ? 4.2 : 0, hitstopSelf: 9, hitstopVictim: 15, effect: T.hk.kd ? 'knockdown' : 'heavy' })],
      sfx: 'kickH', anim: 'hk', advance: [{ t0: T.hk.s - 2, t1: T.hk.s + T.hk.a - 1, vx: 2.4 }], hitAdv: -6,
    });
  }
  out.push({
    ...base, id: `${char}_clp`, name: 'Crouch Jab', crouch: true, startup: T.clp.s, active: T.clp.a, recovery: T.clp.r,
    hitboxes: [hb({ t0: T.clp.s, t1: T.clp.s + T.clp.a - 1, x: rx(0.58), y: 0.85, w: rw(0.6), h: 0.28, level: 'low', damage: dmg(T.clp.dmg), hitstun: 12, blockstun: 9, knockX: 0.8, hitstopSelf: 4, hitstopVictim: 8 })],
    chains: [`${char}_clk`, `${char}_chp`], sfx: 'punchL', anim: 'crouchLp',
  });
  out.push({
    ...base, id: `${char}_chp`, name: 'Crouch Hammer', crouch: true, startup: T.chp.s, active: T.chp.a, recovery: T.chp.r,
    hitboxes: [hb({ t0: T.chp.s, t1: T.chp.s + T.chp.a - 1, x: rx(0.7), y: 0.95, w: rw(0.78), h: 0.4, damage: dmg(T.chp.dmg), hitstun: 17, blockstun: 12, knockX: 2.6, hitstopSelf: 6, hitstopVictim: 12, effect: 'heavy' })],
    sfx: 'punchH', anim: 'crouchHp',
  });
  out.push({
    ...base, id: `${char}_clk`, name: 'Low Kick', crouch: true, startup: T.clk.s, active: T.clk.a, recovery: T.clk.r,
    hitboxes: [hb({ t0: T.clk.s, t1: T.clk.s + T.clk.a - 1, x: rx(0.66), y: 0.45, w: rw(0.72), h: 0.3, level: 'low', damage: dmg(T.clk.dmg), hitstun: 14, blockstun: 10, knockX: 1.4, hitstopSelf: 5, hitstopVictim: 9 })],
    chains: [`${char}_csweep`], sfx: 'kickL', anim: 'crouchLk',
  });
  out.push({
    ...base, id: `${char}_csweep`, name: 'Sweep', crouch: true, startup: T.sweep.s, active: T.sweep.a, recovery: T.sweep.r,
    hitboxes: [hb({ t0: T.sweep.s, t1: T.sweep.s + T.sweep.a - 1, x: rx(0.85), y: 0.22, w: rw(1.15), h: 0.3, level: 'low', damage: dmg(T.sweep.dmg), hitstun: 20, blockstun: 12, knockX: 3.6, knockY: 3.4, hitstopSelf: 8, hitstopVictim: 14, effect: 'knockdown' })],
    sfx: 'kickH', anim: 'crouchHk',
  });
  out.push({
    ...base, id: `${char}_jlp`, name: 'Jump Punch', air: true, startup: 5, active: 10, recovery: 5,
    hitboxes: [hb({ t0: 5, t1: 14, x: rx(0.55), y: 1.35, w: rw(0.7), h: 0.4, damage: dmg(T.jlp.dmg), hitstun: 14, blockstun: 10, knockX: 1.6, hitstopSelf: 5, hitstopVictim: 10 })],
    sfx: 'punchL', anim: 'jumpLp', specialCancel: false,
  });
  out.push({
    ...base, id: `${char}_jhk`, name: 'Jump Kick', air: true, startup: 6, active: 12, recovery: 6,
    hitboxes: [hb({ t0: 6, t1: 17, x: rx(0.6), y: 0.95, w: rw(0.85), h: 0.6, damage: dmg(T.jhk.dmg), hitstun: 16, blockstun: 12, knockX: 2.2, hitstopSelf: 6, hitstopVictim: 12, effect: 'heavy' })],
    sfx: 'kickH', anim: 'jumpHk', specialCancel: false,
  });
  return out;
}

/* ---------------- special archetypes ---------------- */

function buildSpecial(char: CharId): MoveDef {
  const def = CHARACTERS[char];
  const color = def.special.color;
  const dmg = (d: number) => Math.round(d * def.damageMult * (def.special.dmgMult ?? 1));
  const base = { char, kind: 'special' as const, meterCost: SPECIAL_METER_COST, sfx: 'special' as const };
  const rx = (x: number) => +(x * def.reachMult).toFixed(3);
  const rw = (w: number) => +(w * def.reachMult).toFixed(3);

  switch (def.special.kind) {
    case 'dash': {
      const fast = def.stats.walkF > 2.4;
      return {
        ...base, id: `${char}_special`, name: def.specialName,
        startup: fast ? 10 : 12, active: 10, recovery: 24,
        hitboxes: [hb({ t0: fast ? 10 : 12, t1: (fast ? 10 : 12) + 9, x: rx(0.9), y: 1.15, w: rw(1.3), h: 1.1, damage: dmg(fast ? 115 : 130), hitstun: 26, blockstun: 16, knockX: 5.6, knockY: 4.6, hitstopSelf: 10, hitstopVictim: 18, effect: 'knockdown' })],
        advance: [{ t0: (fast ? 10 : 12), t1: (fast ? 10 : 12) + 8, vx: fast ? 8.4 : 7.4 }],
        vfx: [
          { frame: 2, type: 'charge', color },
          { frame: fast ? 10 : 12, type: 'burst', color },
          { frame: (fast ? 10 : 12) + 2, type: 'trail', color },
          { frame: (fast ? 10 : 12) + 9, type: 'shockwave', color },
        ],
        anim: 'specialDash',
      };
    }
    case 'flurry':
      return {
        ...base, id: `${char}_special`, name: def.specialName,
        startup: 8, active: 34, recovery: 22,
        hitboxes: [
          hb({ t0: 8, t1: 12, x: rx(0.8), y: 1.15, w: rw(1.0), h: 0.8, damage: dmg(30), hitstun: 12, blockstun: 10, knockX: 0.4, hitstopSelf: 4, hitstopVictim: 8, effect: 'spark' }),
          hb({ t0: 15, t1: 19, x: rx(0.85), y: 1.2, w: rw(1.0), h: 0.8, damage: dmg(30), hitstun: 12, blockstun: 10, knockX: 0.4, hitstopSelf: 4, hitstopVictim: 8, effect: 'spark' }),
          hb({ t0: 22, t1: 26, x: rx(0.85), y: 1.25, w: rw(1.0), h: 0.8, damage: dmg(34), hitstun: 12, blockstun: 10, knockX: 0.4, hitstopSelf: 4, hitstopVictim: 8, effect: 'spark' }),
          hb({ t0: 31, t1: 36, x: rx(0.7), y: 1.5, w: rw(1.0), h: 1.4, damage: dmg(78), hitstun: 26, blockstun: 15, knockX: 3.2, knockY: 8.4, hitstopSelf: 9, hitstopVictim: 16, effect: 'launch' }),
        ],
        advance: [{ t0: 6, t1: 12, vx: 8.0 }],
        vfx: [
          { frame: 0, type: 'charge', color },
          { frame: 6, type: 'burst', color },
          { frame: 8, type: 'trail', color },
          { frame: 31, type: 'shockwave', color },
        ],
        anim: 'specialFlurry',
      };
    case 'projectile': {
      const spawn: ProjectileSpawn = {
        frame: 15, speed: 7.2, damage: dmg(68), color, size: 0.17,
        hitstun: 20, blockstun: 14, knockX: 2.6, knockY: 0, level: 'mid', life: 150,
      };
      return {
        ...base, id: `${char}_special`, name: def.specialName,
        startup: 15, active: 2, recovery: 21,
        hitboxes: [],
        spawn,
        vfx: [
          { frame: 3, type: 'charge', color },
          { frame: 15, type: 'burst', color },
        ],
        anim: 'specialCast',
      };
    }
    case 'upper':
      return {
        ...base, id: `${char}_special`, name: def.specialName,
        startup: 7, active: 9, recovery: 20,
        hitboxes: [hb({ t0: 7, t1: 15, x: rx(0.62), y: 1.5, w: rw(0.95), h: 1.7, damage: dmg(95), hitstun: 26, blockstun: 15, knockX: 2.6, knockY: 9.2, hitstopSelf: 9, hitstopVictim: 16, effect: 'launch' })],
        advance: [{ t0: 6, t1: 10, vx: 1.6, vy: 4.4 }],
        vfx: [
          { frame: 2, type: 'charge', color },
          { frame: 7, type: 'burst', color },
          { frame: 9, type: 'trail', color },
        ],
        anim: 'specialUpper',
      };
    case 'slam':
      return {
        ...base, id: `${char}_special`, name: def.specialName,
        startup: 17, active: 6, recovery: 26,
        hitboxes: [hb({ t0: 17, t1: 22, x: rx(0.95), y: 1.05, w: rw(1.4), h: 1.4, damage: dmg(150), hitstun: 28, blockstun: 18, knockX: 6.2, knockY: 3.2, hitstopSelf: 12, hitstopVictim: 20, effect: 'knockdown' })],
        advance: [{ t0: 14, t1: 22, vx: 4.4 }],
        vfx: [
          { frame: 4, type: 'charge', color },
          { frame: 17, type: 'burst', color },
          { frame: 20, type: 'shockwave', color },
        ],
        anim: 'specialSlam',
      };
  }
}

function buildSuper(char: CharId): MoveDef {
  const def = CHARACTERS[char];
  const color = def.color;
  const dmg = (d: number) => Math.round(d * def.damageMult);
  const fast = def.special.kind === 'projectile' || def.special.kind === 'upper';
  return {
    char, kind: 'super', id: `${char}_super`, name: def.superName,
    startup: fast ? 11 : 9, active: 9, recovery: 26, meterCost: SUPER_METER_COST,
    hitboxes: [hb({
      t0: fast ? 11 : 9, t1: (fast ? 11 : 9) + 8, x: 0.95, y: 1.15, w: 1.4, h: 1.3, damage: dmg(40),
      hitstun: 30, blockstun: 20, knockX: 0.4, knockY: 0,
      hitstopSelf: 4, hitstopVictim: 10, effect: def.special.kind === 'projectile' ? 'electric' : 'energy',
    })],
    advance: [{ t0: (fast ? 11 : 9) - 1, t1: (fast ? 11 : 9) + 7, vx: 8.2 }],
    superHits: [
      { frame: 24, damage: dmg(34), effect: 'heavy' },
      { frame: 36, damage: dmg(34), effect: def.special.kind === 'projectile' ? 'electric' : 'heavy' },
      { frame: 48, damage: dmg(34), effect: 'heavy' },
      { frame: 60, damage: dmg(40), effect: 'energy' },
      { frame: 74, damage: dmg(90), effect: 'heavy' },
    ],
    superEndLaunch: true,
    vfx: [
      { frame: 0, type: 'superFlash', color },
      { frame: fast ? 11 : 9, type: 'burst', color },
      { frame: (fast ? 11 : 9) + 3, type: 'trail', color },
    ],
    sfx: 'super', anim: 'superGen',
  };
}

function buildMoveset(char: CharId): MoveDef[] {
  return [...buildNormals(char), buildSpecial(char), buildSuper(char)];
}

export const MOVES: Record<CharId, MoveDef[]> = ROSTER.reduce((acc, c) => {
  acc[c] = buildMoveset(c);
  return acc;
}, {} as Record<CharId, MoveDef[]>);

export const MOVE_INDEX: Record<CharId, Record<string, MoveDef>> = ROSTER.reduce((acc, c) => {
  const idx: Record<string, MoveDef> = {};
  for (const m of MOVES[c]) idx[m.id] = m;
  acc[c] = idx;
  return acc;
}, {} as Record<CharId, Record<string, MoveDef>>);

/** Map a generic action to the character-specific move id given context. */
export function resolveMoveId(
  char: CharId,
  action: 'lp' | 'hp' | 'lk' | 'hk' | 'special' | 'super',
  ctx: { crouching: boolean; airborne: boolean },
): string | null {
  if (action === 'special') return `${char}_special`;
  if (action === 'super') return `${char}_super`;
  const suffix = { lp: 'lp', hp: 'hp', lk: 'lk', hk: 'hk' }[action];
  if (ctx.airborne) return suffix === 'hp' || suffix === 'hk' ? `${char}_jhk` : `${char}_jlp`;
  if (ctx.crouching) return suffix === 'hk' ? `${char}_csweep` : `${char}_c${suffix}`;
  return `${char}_${suffix}`;
}

export const getMove = (char: CharId, id: string): MoveDef | undefined =>
  MOVE_INDEX[char]?.[id];

export type { SpecialKind };
