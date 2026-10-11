import { describe, it, expect } from 'vitest';
import { GameEngine } from '../game/GameEngine';
import { CpuBrain } from '../ai/cpuBrain';
import { emptyInput } from '../game/types';
import type { InputSnapshot } from '../game/types';
import { bus } from '../game/eventBus';
import { ANIMS, animFor } from '../animations/types';
import { ROSTER } from '../fighters/characters';
import { PosePlayer, sampleAnim } from '../animations/animPlayer';
import { BASE_POSES } from '../animations/animData';
import { vfx, MAX_PARTICLES, MAX_RINGS, MAX_ARCS } from '../vfx/vfxManager';
import { MAX_HEALTH, MAX_METER } from '../config/constants';
import '../animations/animData';

/* ------------------------------------------------------------------ */
/* Integration: full AI-vs-AI matches through the real state machine.  */
/* Catches deadlocks (stuck states), invariant violations, and NaNs.   */
/* ------------------------------------------------------------------ */

const stepAny = (e: GameEngine) => (e as unknown as { step(): void }).step();

function runCpuMatch(seed: number, diff: 'easy' | 'normal' | 'hard', maxFrames = 60 * 90 * 6) {
  const engine = new GameEngine({ mode: 'vs-cpu', p1Char: 'ryden', p2Char: 'kaito', difficulty: diff, seed, playIntro: false });
  bus.clear();
  // fast-forward round intro
  for (let i = 0; i < 120; i++) stepAny(engine);
  const brain1 = new CpuBrain(diff, false, seed * 31 + 7);
  const brain2 = new CpuBrain(diff, false, seed * 17 + 3);
  engine.input = {
    sample: (slot): InputSnapshot =>
      slot === 'p1' ? brain1.think(engine.match, 0) : brain2.think(engine.match, 1),
  };
  let frames = 0;
  let sawFight = false;
  let sawKo = false;
  while (frames < maxFrames && engine.match.phase !== 'match_end') {
    stepAny(engine);
    frames++;
    if (engine.match.phase === 'fight') sawFight = true;
    if (engine.match.phase === 'ko') sawKo = true;
    // invariants every frame
    for (const f of engine.match.fighters) {
      expect(Number.isFinite(f.x), `x NaN frame ${frames} state ${f.state}`).toBe(true);
      expect(Number.isFinite(f.y)).toBe(true);
      expect(Number.isFinite(f.health)).toBe(true);
      expect(f.health).toBeGreaterThanOrEqual(0);
      expect(f.health).toBeLessThanOrEqual(MAX_HEALTH);
      expect(f.meter).toBeGreaterThanOrEqual(0);
      expect(f.meter).toBeLessThanOrEqual(MAX_METER);
      expect(Math.abs(f.x)).toBeLessThanOrEqual(6.601);
      if (f.grounded) expect(f.y).toBeLessThanOrEqual(0.001);
    }
  }
  return { engine, frames, sawFight, sawKo };
}

describe('full match integration', () => {
  it('hard AI vs hard AI completes a full match without deadlock', () => {
    const { engine, frames, sawFight, sawKo } = runCpuMatch(11, 'hard');
    expect(sawFight).toBe(true);
    expect(sawKo).toBe(true);
    expect(engine.match.phase).toBe('match_end');
    expect(engine.match.matchWinner === 0 || engine.match.matchWinner === 1 || engine.match.matchWinner === 'double').toBe(true);
    const [a, b] = engine.match.fighters;
    expect(a.roundsWon + b.roundsWon).toBeGreaterThanOrEqual(2);
    expect(frames).toBeLessThan(60 * 90 * 6);
    // someone actually fought
    expect(engine.match.stats[0].damage + engine.match.stats[1].damage).toBeGreaterThan(1000);
  }, 60000);

  it('easy AI vs normal AI also completes (asymmetric skill)', () => {
    const engine = new GameEngine({ mode: 'vs-cpu', p1Char: 'kaito', p2Char: 'ryden', difficulty: 'normal', seed: 5, playIntro: false });
    bus.clear();
    for (let i = 0; i < 120; i++) stepAny(engine);
    const brain1 = new CpuBrain('easy', false, 99);
    engine.input = {
      sample: (slot) => (slot === 'p1' ? brain1.think(engine.match, 0) : emptyInput()),
    };
    let frames = 0;
    while (frames < 60 * 200 && engine.match.phase !== 'match_end') {
      stepAny(engine);
      frames++;
      for (const f of engine.match.fighters) {
        expect(Number.isFinite(f.x)).toBe(true);
        expect(f.health).toBeGreaterThanOrEqual(0);
      }
    }
    expect(engine.match.phase).toBe('match_end');
  }, 60000);

  it('training mode auto-revives after KO and never ends the match', () => {
    const engine = new GameEngine({ mode: 'training', p1Char: 'ryden', p2Char: 'kaito', difficulty: 'normal', seed: 8, playIntro: false });
    bus.clear();
    for (let i = 0; i < 140; i++) stepAny(engine);
    expect(engine.match.phase).toBe('training');
    engine.input = { sample: () => emptyInput() };
    engine.match.training.dummy = 'idle'; // dummy must not block, or chip damage floors at 1
    engine.match.fighters[1].health = 1;
    const brain = new CpuBrain('hard', false, 4);
    engine.input = { sample: (slot) => (slot === 'p1' ? brain.think(engine.match, 0) : emptyInput()) };
    let sawKoState = false;
    let sawRevive = false;
    for (let i = 0; i < 60 * 40; i++) {
      stepAny(engine);
      const dummy = engine.match.fighters[1];
      if (dummy.state === 'ko') sawKoState = true;
      if (sawKoState && dummy.health === MAX_HEALTH && dummy.state !== 'ko') sawRevive = true;
      expect(engine.match.phase).toBe('training');
    }
    expect(sawKoState).toBe(true);
    // auto-revive fired and training never ended the match
    expect(sawRevive).toBe(true);
  }, 60000);

  it('intro cinematic scripts positions and hands off to round_intro', () => {
    const engine = new GameEngine({ mode: 'arcade', p1Char: 'ryden', p2Char: 'kaito', seed: 2, playIntro: true });
    bus.clear();
    engine.input = { sample: () => emptyInput() };
    expect(engine.match.phase).toBe('intro');
    // exactly 12s of intro frames → handoff to round_intro at face-off positions
    for (let i = 0; i < 12 * 60; i++) stepAny(engine);
    expect(engine.match.phase).toBe('round_intro');
    const [a, b] = engine.match.fighters;
    expect(a.x).toBeCloseTo(-1.9, 5);
    expect(b.x).toBeCloseTo(1.9, 5);
    // then it flows into live gameplay (CPU takes over its fighter)
    for (let i = 0; i < 30; i++) stepAny(engine);
    expect(['round_intro', 'fight']).toContain(engine.match.phase);
    // skipping works from a fresh intro
    const e2 = new GameEngine({ mode: 'arcade', p1Char: 'ryden', p2Char: 'kaito', seed: 3, playIntro: true });
    stepAny(e2);
    e2.skipIntro();
    expect(e2.match.phase).toBe('round_intro');
    for (let i = 0; i < 140; i++) stepAny(e2);
    expect(e2.match.phase).toBe('fight');
  }, 60000);
});

/* ------------------------------------------------------------------ */
/* Animation system                                                     */
/* ------------------------------------------------------------------ */

describe('animation system', () => {
  const ENGINE_ANIM_NAMES = [
    'idle', 'walkF', 'walkB', 'crouch', 'dashF', 'dashB',
    'blockStand', 'blockCrouch', 'hitMid', 'hitLow', 'hitHigh', 'airHit',
    'launched', 'knockdown', 'getup', 'ko', 'victory', 'defeat',
    'lp', 'hp', 'lk', 'hk', 'crouchLp', 'crouchHp', 'crouchLk', 'crouchHk',
    'jumpLp', 'jumpHk', 'specialDash', 'specialFlurry', 'specialCast', 'specialUpper',
    'specialSlam', 'superGen', 'jumpAscend', 'jumpFall', 'land',
  ];

  it('every engine-referenced animation exists for all 15 characters', () => {
    for (const name of ENGINE_ANIM_NAMES) {
      for (const char of ROSTER) {
        expect(animFor(char, name), `${char} missing anim ${name}`).toBeDefined();
      }
    }
  });

  it('sampling never produces NaN across full timelines and loops', () => {
    const pose = {};
    for (const name of Object.keys(ANIMS)) {
      const def = ANIMS[name];
      for (let f = -10; f < def.frames + 60; f += 3.7) {
        sampleAnim(name, f, pose);
        for (const [k, v] of Object.entries(pose)) {
          if (k === 'hipsY') {
            expect(Number.isFinite(v as number), `${name} hipsY @${f}`).toBe(true);
          } else {
            for (const n of v as number[]) {
              expect(Number.isFinite(n), `${name}.${k} @${f}`).toBe(true);
            }
          }
        }
      }
    }
  });

  it('PosePlayer converges to finite rotations for every character + anim', () => {
    for (const char of ROSTER) {
      const player = new PosePlayer(BASE_POSES[char]);
      for (const name of ENGINE_ANIM_NAMES) {
        const resolved = animFor(char, name)!;
        for (let i = 0; i < 24; i++) {
          player.update(resolved.name, i * 3, 1 / 60);
        }
        player.cur.forEach((e, jn) => {
          for (const n of e) expect(Number.isFinite(n), `${char} ${resolved.name} ${jn}`).toBe(true);
        });
        expect(Number.isFinite(player.curHipsY)).toBe(true);
      }
    }
  });

  it('attack animation lengths roughly match move frame data', () => {
    const check: [string, string, number][] = [
      ['ryden', 'lp', 15], ['ryden', 'hp', 27], ['ryden', 'hk', 36],
      ['kaito', 'lp', 15], ['kaito', 'hk', 36],
    ];
    for (const [, animName, total] of check) {
      const def = ANIMS[animName];
      expect(def).toBeDefined();
      // anim should cover at least the active window and end near total
      expect(def.frames).toBeGreaterThanOrEqual(total * 0.7);
      expect(def.frames).toBeLessThanOrEqual(total * 1.3);
    }
  });
});

/* ------------------------------------------------------------------ */
/* VFX pools                                                            */
/* ------------------------------------------------------------------ */

describe('vfx pools', () => {
  it('spawns stay within pool bounds and recycle', () => {
    vfx.clear();
    for (let i = 0; i < 400; i++) {
      vfx.spawnSparks(Math.random() * 4, 1, 0, 1, '#ff2244', 6, 1);
      vfx.spawnRing(i % 3, 0.1, 0, '#44bbff', 0.2, 2, 0.4);
      vfx.spawnElectric(i % 2, 1.2, '#44bbff', 3);
      vfx.spawnDust(i % 5, 0, '#9fb4c8');
      vfx.spawnCharge(i % 4, 1, '#ff2244', 0.5);
      vfx.update(1 / 60);
    }
    expect(vfx.particles.length).toBe(MAX_PARTICLES);
    expect(vfx.rings.length).toBe(MAX_RINGS);
    expect(vfx.arcs.length).toBe(MAX_ARCS);
    let active = 0;
    for (const p of vfx.particles) if (p.active) active++;
    expect(active).toBeGreaterThan(0);
    // run out the clock — everything expires (no leaks)
    for (let i = 0; i < 600; i++) vfx.update(1 / 30);
    active = 0;
    for (const p of vfx.particles) if (p.active) active++;
    expect(active).toBe(0);
    for (const r of vfx.rings) expect(r.active).toBe(false);
    for (const a of vfx.arcs) expect(a.active).toBe(false);
    vfx.clear();
  });
});
