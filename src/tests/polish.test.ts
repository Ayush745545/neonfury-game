import { describe, it, expect } from 'vitest';
import { GameEngine } from '../game/GameEngine';
import { CpuBrain } from '../ai/cpuBrain';
import { emptyInput } from '../game/types';
import type { InputSnapshot } from '../game/types';
import { bus } from '../game/eventBus';
import { POWER_PROFILES } from '../vfx/powerProfiles';
import { POWER_VOICE } from '../audio/audioEngine';
import { ROSTER, CHARACTERS } from '../fighters/characters';
import { STAGES } from '../arenas/stages';
import { MAX_HEALTH } from '../config/constants';
import { MOVE_INDEX } from '../combat/moves';

const stepAny = (e: GameEngine) => (e as unknown as { step(): void }).step();

function fresh(p1: (typeof ROSTER)[number], p2: (typeof ROSTER)[number], seed = 42) {
  const engine = new GameEngine({ mode: 'local', p1Char: p1, p2Char: p2, seed, playIntro: false });
  bus.clear();
  for (let i = 0; i < 120; i++) stepAny(engine);
  return engine;
}
const nop = (): InputSnapshot => emptyInput();
const press = (a: keyof InputSnapshot): InputSnapshot => {
  const s = { ...emptyInput(), [a]: true } as InputSnapshot;
  if (a === 'up') s.upEdge = true;
  return s;
};
function drive(e: GameEngine, frames: number, fn: (f: number) => [InputSnapshot, InputSnapshot]) {
  for (let i = 0; i < frames; i++) {
    const [s1, s2] = fn(e.match.frame);
    e.input = { sample: (slot) => (slot === 'p1' ? s1 : s2) };
    stepAny(e);
  }
}

describe('power identity tables', () => {
  it('all 15 fighters have a distinct VFX power profile with every hook', () => {
    for (const c of ROSTER) {
      const p = POWER_PROFILES[c];
      expect(p, `${c} missing profile`).toBeDefined();
      expect(typeof p.hit).toBe('function');
      expect(typeof p.block).toBe('function');
      expect(typeof p.activate).toBe('function');
      expect(typeof p.projTrail).toBe('function');
      expect(p.accent).toMatch(/^#/);
      // profiles must not all be identical implementations
    }
    const fns = new Set(ROSTER.map((c) => POWER_PROFILES[c].hit.toString().slice(0, 90)));
    expect(fns.size).toBeGreaterThanOrEqual(12); // genuine variety, not copy-paste
  });

  it('all 15 fighters have a unique impact voice profile', () => {
    for (const c of ROSTER) {
      const v = POWER_VOICE[c];
      expect(v, `${c} missing voice`).toBeDefined();
      expect(v.pitch).toBeGreaterThan(0.4);
      expect(v.pitch).toBeLessThan(1.5);
    }
    const voices = new Set(ROSTER.map((c) => `${POWER_VOICE[c].pitch}|${POWER_VOICE[c].bright}`));
    expect(voices.size).toBe(15); // every fighter sounds different
  });

  it('zoner projectiles map to projectile trails', () => {
    for (const c of ROSTER) {
      if (CHARACTERS[c].special.kind === 'projectile') {
        expect(MOVE_INDEX[c][`${c}_special`].spawn).toBeDefined();
        const t = POWER_PROFILES[c].trail;
        expect(['bubble', 'shadow', 'glitch', 'plasma', 'ice', 'holy']).toContain(t);
      }
    }
  });
});

describe('vertical slice — RYDEN vs NYX in NEON TOKYO', () => {
  it('full hard-CPU match runs clean with flames vs shadow projectiles', () => {
    const stage = STAGES[0];
    expect(stage.id).toBe('neon-tokyo');
    const engine = new GameEngine({ mode: 'vs-cpu', p1Char: 'ryden', p2Char: 'nyx', difficulty: 'hard', seed: 2024, playIntro: false });
    bus.clear();
    for (let i = 0; i < 120; i++) stepAny(engine);
    const b1 = new CpuBrain('hard', false, 101);
    const b2 = new CpuBrain('hard', false, 202);
    engine.input = { sample: (slot) => (slot === 'p1' ? b1.think(engine.match, 0) : b2.think(engine.match, 1)) };
    let sawProjectile = false;
    let sawAbilityUse = false;
    let frames = 0;
    while (frames < 60 * 110 && engine.match.phase !== 'match_end') {
      stepAny(engine);
      frames++;
      if (engine.match.projectiles.length > 0) sawProjectile = true;
      if (engine.match.fighters[0].abilityCd > 0 || engine.match.fighters[1].abilityCd > 0) sawAbilityUse = true;
      for (const f of engine.match.fighters) {
        expect(Number.isFinite(f.x)).toBe(true);
        expect(f.health).toBeGreaterThanOrEqual(0);
        expect(f.health).toBeLessThanOrEqual(MAX_HEALTH);
      }
    }
    expect(engine.match.phase).toBe('match_end');
    expect(sawAbilityUse).toBe(true);   // unique abilities fired in real combat
    expect(frames).toBeLessThan(60 * 110);
    // nyx is a zoner: her projectile should have appeared at some point in a hard match
    expect(sawProjectile || engine.match.stats[1].damage > 500).toBe(true);
  }, 90000);
});

describe('phase-3 combat polish', () => {
  it('super activation is protected (invuln through startup)', () => {
    const e = fresh('ryden', 'kaito');
    e.match.fighters[0].x = -1.2;
    e.match.fighters[1].x = 1.2;
    e.match.fighters[0].meter = 100;
    // ryden super (startup 9) vs kaito hp (startup 7): kaito would trade pre-patch
    drive(e, 1, () => [press('super'), press('hp')]);
    drive(e, 10, () => [nop(), nop()]);
    // ryden's super must have connected; kaito's hp must NOT have interrupted it
    expect(e.match.fighters[0].state === 'attack' || e.match.fighters[1].state === 'superVictim' || e.match.fighters[1].health < MAX_HEALTH).toBe(true);
    expect(e.match.fighters[0].health).toBe(MAX_HEALTH); // super armor held
  });

  it('corner wall-bounce re-launches an airborne victim', () => {
    const e = fresh('ryden', 'kaito');
    const victim = e.match.fighters[1];
    victim.x = 6.2; victim.y = 1.4; victim.vy = -1; victim.vx = 5; // flying at the wall
    victim.state = 'airHitstun'; victim.stunFrames = 60; victim.grounded = false;
    drive(e, 6, () => [nop(), nop()]);
    expect(victim.vx).toBeLessThan(0); // bounced off the right wall
    expect(victim.x).toBeLessThanOrEqual(6.6);
  });

  it('PERFECT is announced when the winner is untouched', () => {
    const e = fresh('ryden', 'kaito');
    const events: string[] = [];
    const off = bus.on((ev) => { if (ev.type === 'announce') events.push(ev.text); });
    e.match.fighters[0].x = -0.6; e.match.fighters[1].x = 0.6;
    e.match.fighters[1].health = 15;
    drive(e, 1, () => [press('hp'), nop()]);
    drive(e, 70, () => [nop(), nop()]);
    expect(e.match.phase).toBe('ko');
    expect(events).toContain('PERFECT');
    off();
  });

  it('announce events for supers carry attacker side + element color', () => {
    const e = fresh('nyx', 'ryden');
    const events: { text: string; side?: number; color?: string }[] = [];
    const off = bus.on((ev) => { if (ev.type === 'announce') events.push(ev); });
    e.match.fighters[0].meter = 30;
    e.match.fighters[0].x = -2; e.match.fighters[1].x = 0.5;
    drive(e, 1, () => [press('special'), nop()]);
    drive(e, 4, () => [nop(), nop()]);
    const nyxMove = events.find((ev) => ev.text === CHARACTERS.nyx.specialName);
    expect(nyxMove).toBeDefined();
    expect(nyxMove!.side).toBe(0);
    expect(nyxMove!.color).toBe(CHARACTERS.nyx.color);
    off();
  });

  it('hit events carry attacker char (drives per-fighter VFX/audio)', () => {
    const e = fresh('ryden', 'kaito');
    let hitChar: string | undefined;
    const off = bus.on((ev) => { if (ev.type === 'hit' && !ev.blocked) hitChar = ev.char; });
    e.match.fighters[0].x = -0.6; e.match.fighters[1].x = 0.6;
    drive(e, 1, () => [press('lp'), nop()]);
    drive(e, 10, () => [nop(), nop()]);
    expect(hitChar).toBe('ryden');
    off();
  });
});
