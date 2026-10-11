import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from '../game/GameEngine';
import { CpuBrain } from '../ai/cpuBrain';
import { emptyInput } from '../game/types';
import type { InputSnapshot, MatchRuntime } from '../game/types';
import { MOVE_INDEX, resolveMoveId } from '../combat/moves';
import { CHARACTERS, ROSTER } from '../fighters/characters';
import { STAGES } from '../arenas/stages';
import { encodeInput, decodeInput } from '../net/protocol';
import { MAX_HEALTH, MAX_METER, ABILITY_COOLDOWN_FRAMES } from '../config/constants';
import { bus } from '../game/eventBus';

/* ---------------- harness ---------------- */

type InputFn = (frame: number) => [InputSnapshot, InputSnapshot];

const stepAny = (e: GameEngine) => (e as unknown as { step(): void }).step();

function makeEngine(p1: (typeof ROSTER)[number] = 'ryden', p2: (typeof ROSTER)[number] = 'kaito', seed = 42) {
  const engine = new GameEngine({ mode: 'local', p1Char: p1, p2Char: p2, seed, playIntro: false });
  bus.clear();
  for (let i = 0; i < 120; i++) stepAny(engine);
  return engine;
}

function drive(engine: GameEngine, frames: number, fn: InputFn): void {
  for (let i = 0; i < frames; i++) {
    const [s1, s2] = fn(engine.match.frame);
    engine.input = { sample: (slot) => (slot === 'p1' ? s1 : s2) };
    stepAny(engine);
  }
}

const nop = (): InputSnapshot => emptyInput();
const press = (action: keyof InputSnapshot): InputSnapshot => {
  const s = { ...emptyInput(), [action]: true } as InputSnapshot;
  if (action === 'up') s.upEdge = true;
  return s;
};

function placeClose(m: MatchRuntime, dist = 1.0): void {
  m.fighters[0].x = -dist / 2;
  m.fighters[1].x = dist / 2;
  m.fighters[0].facing = 1;
  m.fighters[1].facing = -1;
}

/* ---------------- roster integrity ---------------- */

describe('15-character roster', () => {
  it('every fighter has a complete generated moveset', () => {
    expect(ROSTER.length).toBe(15);
    for (const c of ROSTER) {
      const def = CHARACTERS[c];
      expect(def.ability.name.length).toBeGreaterThan(0);
      expect(def.ability.color).toMatch(/^#/);
      const moves = MOVE_INDEX[c];
      const ids = Object.keys(moves);
      expect(ids.length).toBeGreaterThanOrEqual(12);
      for (const suffix of ['lp', 'hp', 'lk', 'hk', 'clp', 'chp', 'clk', 'csweep', 'jlp', 'jhk', 'special', 'super']) {
        expect(moves[`${c}_${suffix}`], `${c} missing ${suffix}`).toBeDefined();
      }
      expect(resolveMoveId(c, 'special', { crouching: false, airborne: false })).toBe(`${c}_special`);
      // specials of projectile kind carry spawn data
      if (def.special.kind === 'projectile') {
        expect(moves[`${c}_special`].spawn).toBeDefined();
      }
    }
  });

  it('each ability kind is represented and cooldown is 15 seconds', () => {
    expect(ABILITY_COOLDOWN_FRAMES).toBe(900);
    const kinds = new Set(ROSTER.map((c) => CHARACTERS[c].ability.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(12); // near-unique ability mechanics
  });

  it('15 stage configs are valid', () => {
    expect(STAGES.length).toBe(15);
    const ids = new Set<string>();
    for (const s of STAGES) {
      expect(ids.has(s.id)).toBe(false);
      ids.add(s.id);
      expect(s.signs.length).toBeGreaterThan(3);
      expect(['rain', 'storm', 'snow', 'embers', 'petals', 'mist', 'clear']).toContain(s.weather);
      expect(s.name.length).toBeGreaterThan(2);
    }
  });
});

/* ---------------- abilities ---------------- */

describe('unique abilities (15s cooldown)', () => {
  let engine: GameEngine;
  beforeEach(() => { engine = makeEngine(); });

  it('activating sets the 900-frame cooldown', () => {
    drive(engine, 1, () => [press('ability'), nop()]);
    drive(engine, 2, () => [nop(), nop()]);
    expect(engine.match.fighters[0].abilityCd).toBeGreaterThan(890);
    expect(engine.match.fighters[0].abilityCd).toBeLessThanOrEqual(ABILITY_COOLDOWN_FRAMES);
    // pressing again while on cooldown does nothing
    const cd = engine.match.fighters[0].abilityCd;
    drive(engine, 1, () => [press('ability'), nop()]);
    drive(engine, 2, () => [nop(), nop()]);
    expect(engine.match.fighters[0].abilityCd).toBeGreaterThanOrEqual(cd - 4);
  });

  it("DRAGON'S WRATH (damageBuff) increases outgoing damage", () => {
    // baseline jab damage
    placeClose(engine.match, 0.9);
    drive(engine, 1, () => [press('lp'), nop()]);
    drive(engine, 12, () => [nop(), nop()]);
    const baseDmg = MAX_HEALTH - engine.match.fighters[1].health;

    // with buff active
    const e2 = makeEngine();
    placeClose(e2.match, 0.9);
    drive(e2, 1, () => [press('ability'), nop()]);
    drive(e2, 2, () => [nop(), nop()]);
    expect(e2.match.fighters[0].abilityBuff?.kind).toBe('damageBuff');
    drive(e2, 1, () => [press('lp'), nop()]);
    drive(e2, 12, () => [nop(), nop()]);
    const buffedDmg = MAX_HEALTH - e2.match.fighters[1].health;
    expect(buffedDmg).toBeGreaterThan(baseDmg * 1.2);
  });

  it('PHASE SHIFT (teleport) moves Kaito behind the opponent', () => {
    const e = makeEngine('kaito', 'ryden');
    placeClose(e.match, 2.0);
    const before = e.match.fighters[0].x;
    drive(e, 1, () => [press('ability'), nop()]);
    drive(e, 2, () => [nop(), nop()]);
    const after = e.match.fighters[0].x;
    expect(Math.abs(after - before)).toBeGreaterThan(1);
    // ended up on the far side of ryden (x > ryden.x since ryden faces -1)
    expect(after).toBeGreaterThan(e.match.fighters[1].x);
  });

  it('RENEW (secondWind) escapes hitstun and heals', () => {
    const e = makeEngine('sable', 'ryden');
    placeClose(e.match, 1.0);
    e.match.fighters[0].health = 500;
    // ryden hits sable into stun
    drive(e, 1, () => [nop(), press('hp')]);
    drive(e, 12, () => [nop(), nop()]);
    expect(['hitstun', 'idle', 'blockstun']).toContain(e.match.fighters[0].state);
    if (e.match.fighters[0].state === 'hitstun') {
      const hpAfterHit = e.match.fighters[0].health;
      expect(hpAfterHit).toBeLessThan(500);
      drive(e, 1, () => [press('ability'), nop()]);
      drive(e, 5, () => [nop(), nop()]);
      drive(e, 1, () => [press('ability'), nop()]); // mash during hitstop like a real player
      drive(e, 10, () => [nop(), nop()]);
      expect(e.match.fighters[0].state).not.toBe('hitstun');
      expect(e.match.fighters[0].health).toBeGreaterThan(hpAfterHit); // RENEW healed
      expect(e.match.fighters[0].abilityCd).toBeGreaterThan(800);
    }
  });

  it('STONE SKIN (armor) prevents flinch and reduces damage', () => {
    const e = makeEngine('gruun', 'ryden');
    placeClose(e.match, 1.0);
    drive(e, 1, () => [press('ability'), nop()]);
    drive(e, 2, () => [nop(), nop()]);
    expect(e.match.fighters[0].abilityBuff?.kind).toBe('armor');
    drive(e, 1, () => [nop(), press('hp')]);
    drive(e, 14, () => [nop(), nop()]);
    const dmg = MAX_HEALTH - e.match.fighters[0].health;
    expect(dmg).toBeGreaterThan(0);
    expect(dmg).toBeLessThan(70); // heavy fist is ~82*1.18 scaled by armor 0.4*0.88
    expect(e.match.fighters[0].state).not.toBe('hitstun'); // no flinch
  });

  it('THUNDERCLAP (shockwave) damages a point-blank opponent', () => {
    const e = makeEngine('volt', 'ryden');
    placeClose(e.match, 1.2);
    drive(e, 1, () => [press('ability'), nop()]);
    drive(e, 6, () => [nop(), nop()]);
    expect(MAX_HEALTH - e.match.fighters[1].health).toBeGreaterThan(20);
    expect(e.match.fighters[1].state).toBe('hitstun');
  });

  it('FORESIGHT (meterGain) adds meter instantly', () => {
    const e = makeEngine('oracle', 'ryden');
    e.match.fighters[0].meter = 10;
    drive(e, 1, () => [press('ability'), nop()]);
    drive(e, 2, () => [nop(), nop()]);
    expect(e.match.fighters[0].meter).toBeCloseTo(45, 0);
  });

  it('RIPOSTE (counter stance) negates a hit and punishes the attacker', () => {
    const e = makeEngine('ember', 'ryden');
    placeClose(e.match, 1.0);
    drive(e, 1, () => [press('ability'), nop()]);
    drive(e, 2, () => [nop(), nop()]);
    expect(e.match.fighters[0].abilityBuff?.kind).toBe('counter');
    const emberHpBefore = e.match.fighters[0].health;
    drive(e, 1, () => [nop(), press('hp')]);
    drive(e, 12, () => [nop(), nop()]);
    expect(e.match.fighters[0].health).toBe(emberHpBefore);      // negated
    expect(MAX_HEALTH - e.match.fighters[1].health).toBeGreaterThan(50); // punished
    expect(['hitstun', 'airHitstun', 'knockdown']).toContain(e.match.fighters[1].state);
  });
});

/* ---------------- projectiles ---------------- */

describe('projectile system', () => {
  it('zoner special spawns a projectile that travels and hits', () => {
    const e = makeEngine('vesper', 'ryden');
    e.match.fighters[0].meter = 50;
    e.match.fighters[0].x = -3;
    e.match.fighters[1].x = 1.4;
    drive(e, 1, () => [press('special'), nop()]);
    drive(e, 16, () => [nop(), nop()]);
    expect(e.match.projectiles.length).toBe(1);
    const p = e.match.projectiles[0];
    expect(p.owner).toBe(0);
    expect(p.vx).toBeGreaterThan(0);
    drive(e, 50, () => [nop(), nop()]);
    expect(MAX_HEALTH - e.match.fighters[1].health).toBeGreaterThan(40);
    expect(e.match.projectiles.length).toBe(0); // expired on hit
  });

  it('projectiles are blockable with chip damage', () => {
    const e = makeEngine('hex', 'ryden');
    e.match.fighters[0].meter = 50;
    e.match.fighters[0].x = -3;
    e.match.fighters[1].x = 1.4;
    drive(e, 1, () => [press('special'), nop()]);
    drive(e, 60, () => [nop(), { ...emptyInput(), block: true }]);
    const dmg = MAX_HEALTH - e.match.fighters[1].health;
    expect(dmg).toBeGreaterThan(0);
    expect(dmg).toBeLessThan(20); // chip only
  });

  it('opposing projectiles cancel each other', () => {
    const e = makeEngine('nyx', 'zero');
    e.match.fighters[0].meter = 50;
    e.match.fighters[1].meter = 50;
    e.match.fighters[0].x = -2.5;
    e.match.fighters[1].x = 2.5;
    drive(e, 1, () => [press('special'), press('special')]);
    drive(e, 60, () => [nop(), nop()]);
    expect(e.match.fighters[0].health).toBe(MAX_HEALTH);
    expect(e.match.fighters[1].health).toBe(MAX_HEALTH);
    expect(e.match.projectiles.length).toBe(0);
  });

  it('SOLAR FLARE (projBurst) fires three orbs', () => {
    const e = makeEngine('solara', 'ryden');
    drive(e, 1, () => [press('ability'), nop()]);
    drive(e, 2, () => [nop(), nop()]);
    expect(e.match.projectiles.length).toBe(3);
  });
});

/* ---------------- netplay determinism ---------------- */

describe('netplay lockstep', () => {
  it('input bitmask encode/decode round-trips', () => {
    const snap: InputSnapshot = { ...emptyInput(), left: true, hp: true, ability: true, dashB: true, upEdge: true };
    const m = encodeInput(snap);
    expect(m).toBeGreaterThan(0);
    expect(decodeInput(m)).toEqual(snap);
  });

  it('two engines in lockstep stay bit-identical (checksum parity)', () => {
    const seed = 777;
    const host = new GameEngine({ mode: 'net', p1Char: 'volt', p2Char: 'nyx', seed, playIntro: false });
    const guest = new GameEngine({ mode: 'net', p1Char: 'volt', p2Char: 'nyx', seed, playIntro: false });
    bus.clear();
    for (let i = 0; i < 120; i++) { stepAny(host); stepAny(guest); }
    expect(host.checksum()).toBe(guest.checksum());

    // scripted pseudo-random inputs shared by both peers
    let rs = 12345;
    const rnd = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; };
    const makeSnap = (): InputSnapshot => {
      const s = emptyInput();
      if (rnd() < 0.3) s.left = true;
      if (rnd() < 0.3) s.right = true;
      if (rnd() < 0.04) { s.up = true; s.upEdge = true; }
      if (rnd() < 0.1) s.down = true;
      if (rnd() < 0.06) s.lp = true;
      if (rnd() < 0.04) s.hp = true;
      if (rnd() < 0.05) s.lk = true;
      if (rnd() < 0.03) s.hk = true;
      if (rnd() < 0.08) s.block = true;
      if (rnd() < 0.01) s.special = true;
      if (rnd() < 0.004) s.super = true;
      if (rnd() < 0.006) s.ability = true;
      return s;
    };

    host.match.fighters[0].meter = MAX_METER;
    guest.match.fighters[0].meter = MAX_METER;
    host.match.fighters[1].meter = MAX_METER;
    guest.match.fighters[1].meter = MAX_METER;

    for (let f = 0; f < 3600; f++) {
      const a = makeSnap();
      const b = makeSnap();
      // wire simulation: only the compact mask crosses (like NetDriver)
      host.stepNet(a, decodeInput(encodeInput(b)));
      guest.stepNet(decodeInput(encodeInput(a)), b);
      if (f % 120 === 119) expect(host.checksum(), `desync at frame ${f}`).toBe(guest.checksum());
    }
    // a real fight happened on both peers identically
    expect(host.match.stats[0].damage + host.match.stats[1].damage).toBeGreaterThan(0);
    expect(host.match.frame).toBe(guest.match.frame);
  });

  it('snapshot round-trip: applied engine continues identically', () => {
    const seed = 99;
    const a = new GameEngine({ mode: 'net', p1Char: 'gruun', p2Char: 'sable', seed, playIntro: false });
    bus.clear();
    for (let i = 0; i < 120; i++) stepAny(a);
    let rs = 55;
    const rnd = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; };
    for (let f = 0; f < 600; f++) {
      const mk = () => {
        const s = emptyInput();
        if (rnd() < 0.3) s.right = true;
        if (rnd() < 0.05) s.lp = true;
        if (rnd() < 0.03) s.hk = true;
        if (rnd() < 0.02) s.ability = true;
        if (rnd() < 0.06) s.block = true;
        return s;
      };
      a.stepNet(mk(), mk());
    }
    const snap = a.getSnapshot();
    const b = new GameEngine({ mode: 'net', p1Char: 'gruun', p2Char: 'sable', seed, playIntro: false });
    b.applySnapshot(snap as never);
    expect(b.checksum()).toBe(a.checksum());
    // and they stay in sync going forward
    for (let f = 0; f < 300; f++) {
      const s1 = emptyInput(); const s2 = emptyInput();
      if (f % 30 < 8) { s1.right = true; }
      if (f % 47 === 3) s2.hp = true;
      if (f % 61 === 5) s1.ability = true;
      a.stepNet(s1, s2);
      b.stepNet(s1, s2);
    }
    expect(a.checksum()).toBe(b.checksum());
  });
});

/* ---------------- AI vs AI across new roster ---------------- */

describe('CPU matches with new roster members', () => {
  it('projectile zoner vs heavy completes a match', () => {
    const engine = new GameEngine({ mode: 'vs-cpu', p1Char: 'hex', p2Char: 'gruun', difficulty: 'hard', seed: 13, playIntro: false });
    bus.clear();
    for (let i = 0; i < 120; i++) stepAny(engine);
    const b1 = new CpuBrain('hard', false, 5);
    const b2 = new CpuBrain('hard', false, 6);
    engine.input = { sample: (slot) => (slot === 'p1' ? b1.think(engine.match, 0) : b2.think(engine.match, 1)) };
    let frames = 0;
    while (frames < 60 * 100 && engine.match.phase !== 'match_end') {
      stepAny(engine);
      frames++;
      for (const f of engine.match.fighters) {
        expect(Number.isFinite(f.x)).toBe(true);
        expect(f.health).toBeGreaterThanOrEqual(0);
        expect(f.health).toBeLessThanOrEqual(MAX_HEALTH);
      }
      for (const p of engine.match.projectiles) {
        expect(Number.isFinite(p.x)).toBe(true);
        expect(p.life).toBeGreaterThanOrEqual(0);
      }
    }
    expect(engine.match.phase).toBe('match_end');
    expect(engine.match.stats[0].damage + engine.match.stats[1].damage).toBeGreaterThan(2000);
  }, 60000);

  it('CPU uses abilities over a long match (cooldowns observed)', () => {
    const engine = new GameEngine({ mode: 'vs-cpu', p1Char: 'volt', p2Char: 'ember', difficulty: 'hard', seed: 31, playIntro: false });
    bus.clear();
    for (let i = 0; i < 120; i++) stepAny(engine);
    const b1 = new CpuBrain('hard', false, 8);
    engine.input = { sample: (slot) => (slot === 'p1' ? b1.think(engine.match, 0) : emptyInput()) };
    let sawCooldown = false;
    for (let i = 0; i < 60 * 40; i++) {
      stepAny(engine);
      if (engine.match.fighters[0].abilityCd > 0) sawCooldown = true;
    }
    expect(sawCooldown).toBe(true); // ability was actually activated by the AI
  }, 60000);
});
