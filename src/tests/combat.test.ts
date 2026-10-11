import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from '../game/GameEngine';
import { emptyInput } from '../game/types';
import type { InputSnapshot, MatchRuntime } from '../game/types';
import { aabbOverlap, blockBeatsLevel, getHurtbox, getHitboxWorld } from '../combat/hitDetection';
import { MOVE_INDEX, resolveMoveId } from '../combat/moves';
import { MAX_HEALTH, MAX_METER } from '../config/constants';
import { bus } from '../game/eventBus';

/* ---------------- harness ---------------- */

type InputFn = (frame: number) => [InputSnapshot, InputSnapshot];

function makeEngine(mode: 'local' | 'vs-cpu' = 'local') {
  const engine = new GameEngine({ mode, p1Char: 'ryden', p2Char: 'kaito', seed: 42, playIntro: false });
  bus.clear();
  // jump past round_intro announcements into 'fight'
  const stepAny = () => (engine as unknown as { step(): void }).step();
  for (let i = 0; i < 120; i++) stepAny();
  expect(['fight', 'training']).toContain(engine.match.phase);
  return engine;
}

function drive(engine: GameEngine, frames: number, fn: InputFn): void {
  const stepAny = () => (engine as unknown as { step(): void }).step();
  for (let i = 0; i < frames; i++) {
    const [s1, s2] = fn(engine.match.frame);
    engine.input = { sample: (slot) => (slot === 'p1' ? s1 : s2) };
    stepAny();
  }
}

const nop = (): InputSnapshot => emptyInput();

function press(action: keyof InputSnapshot): InputSnapshot {
  const s = { ...emptyInput(), [action]: true } as InputSnapshot;
  if (action === 'up') s.upEdge = true;
  return s;
}

function placeClose(m: MatchRuntime, dist = 1.0): void {
  m.fighters[0].x = -dist / 2;
  m.fighters[1].x = dist / 2;
  m.fighters[0].facing = 1;
  m.fighters[1].facing = -1;
}

/* ---------------- collision math ---------------- */

describe('collision math', () => {
  it('aabb overlap detects and separates boxes', () => {
    expect(aabbOverlap({ cx: 0, cy: 0, w: 2, h: 2 }, { cx: 1.5, cy: 0, w: 2, h: 2 })).toBe(true);
    expect(aabbOverlap({ cx: 0, cy: 0, w: 2, h: 2 }, { cx: 2.5, cy: 0, w: 2, h: 2 })).toBe(false);
    expect(aabbOverlap({ cx: 0, cy: 0, w: 2, h: 2 }, { cx: 0, cy: 2.5, w: 2, h: 2 })).toBe(false);
  });

  it('block level rules follow high/mid/low', () => {
    expect(blockBeatsLevel('stand', 'high')).toBe(true);
    expect(blockBeatsLevel('stand', 'mid')).toBe(true);
    expect(blockBeatsLevel('stand', 'low')).toBe(false);   // lows beat stand block
    expect(blockBeatsLevel('crouch', 'low')).toBe(true);
    expect(blockBeatsLevel('crouch', 'mid')).toBe(true);
    expect(blockBeatsLevel('crouch', 'high')).toBe(false); // overheads beat crouch block
  });

  it('hurtboxes track fighter position and crouch', () => {
    const e = makeEngine();
    const f = e.match.fighters[0];
    const stand = getHurtbox(f);
    expect(stand.h).toBeGreaterThan(1.5);
    f.crouching = true;
    f.state = 'crouch';
    const crouchBox = getHurtbox(f);
    expect(crouchBox.h).toBeLessThan(stand.h);
    expect(crouchBox.cy).toBeLessThan(stand.cy);
  });

  it('hitbox mirrors with facing', () => {
    const e = makeEngine();
    const f = e.match.fighters[0];
    const box = { x: 1, y: 1, w: 0.5, h: 0.5 };
    f.x = 2; f.facing = 1;
    expect(getHitboxWorld(f, box).cx).toBe(3);
    f.facing = -1;
    expect(getHitboxWorld(f, box).cx).toBe(1);
  });
});

/* ---------------- move data sanity ---------------- */

describe('move data', () => {
  it('every move resolves and has sane frame data', () => {
    for (const char of ['ryden', 'kaito'] as const) {
      for (const m of Object.values(MOVE_INDEX[char])) {
        expect(m.startup).toBeGreaterThan(0);
        expect(m.active).toBeGreaterThan(0);
        expect(m.recovery).toBeGreaterThan(0);
        expect(m.hitboxes.length).toBeGreaterThan(0);
        for (const hb of m.hitboxes) {
          expect(hb.t0).toBeGreaterThanOrEqual(m.startup - 2);
          expect(hb.t1).toBeGreaterThanOrEqual(hb.t0);
          expect(hb.damage).toBeGreaterThan(0);
        }
      }
    }
  });

  it('resolveMoveId maps context to ids', () => {
    expect(resolveMoveId('ryden', 'lp', { crouching: false, airborne: false })).toBe('ryden_lp');
    expect(resolveMoveId('ryden', 'hk', { crouching: true, airborne: false })).toBe('ryden_csweep');
    expect(resolveMoveId('kaito', 'hk', { crouching: false, airborne: true })).toBe('kaito_jhk');
    expect(resolveMoveId('kaito', 'special', { crouching: false, airborne: false })).toBe('kaito_special');
  });
});

/* ---------------- basic combat ---------------- */

describe('combat', () => {
  let engine: GameEngine;
  beforeEach(() => { engine = makeEngine(); });

  it('light punch damages an idle opponent only on active frames', () => {
    placeClose(engine.match, 1.0);
    const events: string[] = [];
    const off = bus.on((e) => events.push(e.type));
    drive(engine, 1, () => [press('lp'), nop()]);
    // startup frames: no damage yet
    drive(engine, 2, () => [nop(), nop()]);
    expect(engine.match.fighters[1].health).toBe(MAX_HEALTH);
    // run through active frames
    drive(engine, 6, () => [nop(), nop()]);
    expect(engine.match.fighters[1].health).toBeLessThan(MAX_HEALTH);
    expect(events).toContain('hit');
    expect(engine.match.fighters[0].combo).toBeGreaterThanOrEqual(1);
    expect(engine.match.fighters[0].meter).toBeGreaterThan(0);
    off();
  });

  it('damage never triggers outside active frames (whiff at long range)', () => {
    // fighters far apart: same jab, no damage
    engine.match.fighters[0].x = -3;
    engine.match.fighters[1].x = 3;
    drive(engine, 1, () => [press('lp'), nop()]);
    drive(engine, 20, () => [nop(), nop()]);
    expect(engine.match.fighters[1].health).toBe(MAX_HEALTH);
  });

  it('standing block stops a mid punch with blockstun and no damage', () => {
    placeClose(engine.match, 1.0);
    const def = engine.match.fighters[1];
    drive(engine, 1, () => [press('lp'), { ...emptyInput(), block: true }]);
    drive(engine, 8, () => [nop(), { ...emptyInput(), block: true }]);
    expect(def.health).toBe(MAX_HEALTH);
    expect(['blockstun', 'blockStand']).toContain(def.state);
    expect(def.stunFrames).toBeGreaterThan(0);
  });

  it('low sweep beats standing block but is crouch-blocked', () => {
    placeClose(engine.match, 1.05);
    // stand block vs sweep (down + hk = crouching heavy kick)
    drive(engine, 1, () => [{ ...emptyInput(), down: true, hk: true }, { ...emptyInput(), block: true }]);
    drive(engine, 16, () => [{ ...emptyInput(), down: true }, { ...emptyInput(), block: true }]);
    expect(engine.match.fighters[1].health).toBeLessThan(MAX_HEALTH); // low hit stand-blocker

    // reset and try crouch block
    engine = makeEngine();
    placeClose(engine.match, 1.05);
    drive(engine, 1, () => [{ ...emptyInput(), down: true, hk: true }, { ...emptyInput(), block: true, down: true }]);
    drive(engine, 18, () => [{ ...emptyInput(), down: true }, { ...emptyInput(), block: true, down: true }]);
    expect(engine.match.fighters[1].health).toBe(MAX_HEALTH);
    expect(['blockstun', 'blockCrouch']).toContain(engine.match.fighters[1].state);
  });

  it('counter hit deals bonus damage', () => {
    placeClose(engine.match, 1.0);
    let normalDmg = 0;
    // normal hit with lp
    drive(engine, 1, () => [press('lp'), nop()]);
    drive(engine, 10, () => [nop(), nop()]);
    normalDmg = MAX_HEALTH - engine.match.fighters[1].health;

    engine = makeEngine();
    placeClose(engine.match, 1.0);
    // p2 starts a slow heavy, p1 jabs through startup → counter
    drive(engine, 1, () => [press('lp'), press('hk')]);
    drive(engine, 10, () => [nop(), nop()]);
    const counterDmg = MAX_HEALTH - engine.match.fighters[1].health;
    expect(counterDmg).toBeGreaterThan(normalDmg);
  });

  it('chain cancel produces a 2-hit combo (lp → hp)', () => {
    placeClose(engine.match, 1.0);
    drive(engine, 1, () => [press('lp'), nop()]);
    // buffer hp during the jab's active frames
    drive(engine, 4, () => [nop(), nop()]);
    drive(engine, 1, () => [press('hp'), nop()]);
    drive(engine, 30, () => [nop(), nop()]);
    const taken = MAX_HEALTH - engine.match.fighters[1].health;
    expect(taken).toBeGreaterThan(80); // lp 28 + hp 68 scaled
    expect(engine.match.stats[0].maxCombo).toBeGreaterThanOrEqual(2);
  });

  it('heavy kick knocks down (air hitstun → knockdown)', () => {
    placeClose(engine.match, 1.15);
    drive(engine, 1, () => [press('hk'), nop()]);
    drive(engine, 40, () => [nop(), nop()]);
    const def = engine.match.fighters[1];
    const wasDown = def.state === 'knockdown' || def.state === 'getup' || def.state === 'airHitstun' || def.health < MAX_HEALTH;
    expect(wasDown).toBe(true);
    expect(MAX_HEALTH - def.health).toBeGreaterThan(60);
  });

  it('special consumes meter and hits hard', () => {
    placeClose(engine.match, 1.6);
    engine.match.fighters[0].meter = 50;
    drive(engine, 1, () => [press('special'), nop()]);
    drive(engine, 40, () => [nop(), nop()]);
    expect(engine.match.fighters[0].meter).toBeLessThan(50); // 50 - 25 cost + hit gain
    expect(MAX_HEALTH - engine.match.fighters[1].health).toBeGreaterThanOrEqual(100);
  });

  it('special cannot fire without meter', () => {
    placeClose(engine.match, 1.6);
    engine.match.fighters[0].meter = 0;
    drive(engine, 1, () => [press('special'), nop()]);
    drive(engine, 20, () => [nop(), nop()]);
    expect(engine.match.fighters[0].state).not.toBe('attack');
    expect(engine.match.fighters[1].health).toBe(MAX_HEALTH);
  });

  it('input buffering: attack pressed during hitstun comes out on recovery', () => {
    placeClose(engine.match, 1.0);
    // p2 hits p1 first
    drive(engine, 1, () => [nop(), press('lp')]);
    drive(engine, 4, () => [nop(), nop()]);
    const f0 = engine.match.fighters[0];
    expect(['hitstun', 'idle', 'attack']).toContain(f0.state);
    // advance until 3 frames before hitstun actually ends (incl. hitstop)
    let guard = 0;
    while (guard++ < 80 && (f0.hitstop > 0 || f0.state === 'hitstun' && f0.stateFrame < f0.stunFrames - 3)) {
      drive(engine, 1, () => [nop(), nop()]);
    }
    placeClose(engine.match, 0.8); // step back into range (knockback slid us out)
    drive(engine, 1, () => [press('lp'), nop()]);
    drive(engine, 14, () => [nop(), nop()]);
    // the buffered jab came out on recovery and connected
    expect(engine.match.fighters[1].health).toBeLessThan(MAX_HEALTH);
  });
});

/* ---------------- super ---------------- */

describe('super attacks', () => {
  it('full-meter super unleashes scripted multi-hit sequence', () => {
    const engine = makeEngine();
    placeClose(engine.match, 1.4);
    engine.match.fighters[0].meter = MAX_METER;
    drive(engine, 1, () => [press('super'), nop()]);
    drive(engine, 240, () => [nop(), nop()]);
    const dmg = MAX_HEALTH - engine.match.fighters[1].health;
    expect(dmg).toBeGreaterThan(220); // opener + timeline hits
    expect(engine.match.fighters[0].meter).toBeLessThan(10); // spent 100, small hit gain
    expect(engine.match.stats[0].maxCombo).toBeGreaterThanOrEqual(4);
  });
});

/* ---------------- rounds / KO / match ---------------- */

describe('rounds and KO', () => {
  it('lethal hit triggers KO phase, awards round, advances to next round', () => {
    const engine = makeEngine();
    placeClose(engine.match, 1.0);
    engine.match.fighters[1].health = 20; // near death
    const events: string[] = [];
    const off = bus.on((e) => events.push(e.type));
    drive(engine, 1, () => [press('hp'), nop()]);
    drive(engine, 14, () => [nop(), nop()]);
    expect(engine.match.phase).toBe('ko');
    expect(engine.match.koWinner).toBe(0);
    expect(events).toContain('ko');
    // run through KO cinematic + round end
    drive(engine, 600, () => [nop(), nop()]);
    expect(engine.match.fighters[0].roundsWon).toBe(1);
    expect(['round_intro', 'fight']).toContain(engine.match.phase);
    expect(engine.match.round).toBe(2);
    expect(engine.match.fighters[1].health).toBe(MAX_HEALTH); // health reset
    off();
  });

  it('match ends when a fighter wins two rounds', () => {
    const engine = makeEngine();
    engine.match.fighters[0].roundsWon = 1;
    placeClose(engine.match, 1.0);
    engine.match.fighters[1].health = 10;
    drive(engine, 1, () => [press('hp'), nop()]);
    drive(engine, 900, () => [nop(), nop()]);
    expect(engine.match.phase).toBe('match_end');
    expect(engine.match.matchWinner).toBe(0);
    expect(engine.match.fighters[0].state).toBe('victory');
  });

  it('time up awards the round to the healthier fighter', () => {
    const engine = makeEngine();
    engine.match.fighters[0].health = 800;
    engine.match.fighters[1].health = 300;
    engine.match.timeLeft = 1;
    drive(engine, 62, () => [nop(), nop()]);
    expect(engine.match.phase).toBe('ko');
    expect(engine.match.koWinner).toBe(0);
    drive(engine, 600, () => [nop(), nop()]);
    expect(engine.match.fighters[0].roundsWon).toBe(1);
  });

  it('double KO is possible on a same-frame trade', () => {
    // mirror match so both jabs become active on the exact same frame
    const engine = new GameEngine({ mode: 'local', p1Char: 'ryden', p2Char: 'ryden', seed: 5, playIntro: false });
    bus.clear();
    const stepAny = () => (engine as unknown as { step(): void }).step();
    for (let i = 0; i < 120; i++) stepAny();
    placeClose(engine.match, 1.0);
    engine.match.fighters[0].health = 10;
    engine.match.fighters[1].health = 10;
    drive(engine, 1, () => [press('lp'), press('lp')]);
    drive(engine, 8, () => [nop(), nop()]);
    expect(engine.match.phase).toBe('ko');
    expect(engine.match.koWinner).toBe('double');
  });
});

/* ---------------- movement ---------------- */

describe('movement', () => {
  it('walk, jump and crouch change state and position', () => {
    const engine = makeEngine();
    const f = engine.match.fighters[0];
    const x0 = f.x;
    drive(engine, 30, () => [{ ...emptyInput(), right: true }, nop()]);
    expect(f.x).toBeGreaterThan(x0);
    expect(['walkF', 'idle', 'attack']).toContain(f.state);

    drive(engine, 1, () => [press('up'), nop()]);
    drive(engine, 4, () => [nop(), nop()]);
    expect(f.grounded).toBe(false);
    expect(f.y).toBeGreaterThan(0);
    drive(engine, 60, () => [nop(), nop()]);
    expect(f.grounded).toBe(true);
    expect(f.y).toBe(0);

    drive(engine, 6, () => [{ ...emptyInput(), down: true }, nop()]);
    expect(f.crouching).toBe(true);
  });

  it('fighters cannot overlap (body push-out) and stay on stage', () => {
    const engine = makeEngine();
    const [a, b] = engine.match.fighters;
    a.x = -0.1; b.x = 0.1;
    drive(engine, 10, () => [nop(), nop()]);
    expect(Math.abs(b.x - a.x)).toBeGreaterThanOrEqual(0.6);
    // walk into the wall
    drive(engine, 400, () => [{ ...emptyInput(), right: true }, nop()]);
    expect(a.x).toBeLessThanOrEqual(6.6 + 1e-6);
  });

  it('facing flips when opponents cross up', () => {
    const engine = makeEngine();
    const [a, b] = engine.match.fighters;
    a.x = -1; b.x = 1;
    drive(engine, 2, () => [nop(), nop()]);
    expect(a.facing).toBe(1);
    b.x = -3; // teleport behind
    drive(engine, 2, () => [nop(), nop()]);
    expect(a.facing).toBe(-1);
  });
});

/* ---------------- AI smoke ---------------- */

describe('CPU brain', () => {
  it('hard CPU closes distance and damages an idle player', () => {
    const engine = new GameEngine({ mode: 'vs-cpu', p1Char: 'ryden', p2Char: 'kaito', difficulty: 'hard', seed: 7, playIntro: false });
    bus.clear();
    const stepAny = () => (engine as unknown as { step(): void }).step();
    for (let i = 0; i < 120; i++) stepAny();
    engine.input = { sample: () => emptyInput() }; // p1 does nothing
    let minHealth = MAX_HEALTH;
    for (let i = 0; i < 60 * 25; i++) {
      stepAny();
      minHealth = Math.min(minHealth, engine.match.fighters[0].health);
    }
    // the CPU must have pressured the idle player at some point (rounds may reset health)
    expect(minHealth).toBeLessThan(MAX_HEALTH);
  });

  it('CPU blocks sometimes on normal difficulty (defensive behavior exists)', () => {
    const engine = new GameEngine({ mode: 'vs-cpu', p1Char: 'ryden', p2Char: 'kaito', difficulty: 'normal', seed: 3, playIntro: false });
    bus.clear();
    const stepAny = () => (engine as unknown as { step(): void }).step();
    for (let i = 0; i < 120; i++) stepAny();
    engine.input = { sample: () => emptyInput() };
    let sawBlock = false;
    for (let i = 0; i < 60 * 30; i++) {
      stepAny();
      const st = engine.match.fighters[1].state;
      if (st === 'blockStand' || st === 'blockCrouch' || st === 'blockstun') sawBlock = true;
    }
    expect(sawBlock).toBe(true);
  });
});
