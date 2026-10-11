// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { CpuBrain } from '../ai/cpuBrain';
import { MAX_HEALTH } from '../config/constants';
import { useSettings } from '../config/settings';
import { bus } from '../game/eventBus';
import { GameEngine } from '../game/GameEngine';
import { inputManager } from '../game/inputManager';
import { emptyInput } from '../game/types';
import { decodeInput, encodeInput } from '../net/protocol';
import { STAGES } from '../arenas/stages';

describe('Ryden vs Volt visual upgrade preserves playable combat', () => {
  it('completes the Neon Tokyo match while both network peers remain identical', () => {
    expect(STAGES[0].id).toBe('neon-tokyo');
    const options = { mode: 'net' as const, p1Char: 'ryden' as const, p2Char: 'volt' as const, seed: 20261011, playIntro: false };
    const host = new GameEngine(options);
    const guest = new GameEngine(options);
    const brains = [new CpuBrain('hard', false, 101), new CpuBrain('hard', false, 202)];
    bus.clear();
    let sawRydenSpecial = false;
    let sawVoltSpecial = false;
    let sawAbility = false;
    let sawKo = false;
    const maxFrames = 60 * 200;
    let frames = 0;
    while (host.match.phase !== 'match_end' && frames < maxFrames) {
      const a = brains[0].think(host.match, 0);
      const b = brains[1].think(host.match, 1);
      host.stepNet(a, decodeInput(encodeInput(b)));
      guest.stepNet(decodeInput(encodeInput(a)), b);
      frames++;
      sawRydenSpecial ||= host.match.fighters[0].move?.kind === 'special';
      sawVoltSpecial ||= host.match.fighters[1].move?.kind === 'special';
      sawAbility ||= host.match.fighters.some(fighter => fighter.abilityCd > 0);
      sawKo ||= host.match.phase === 'ko';
      if (frames % 120 === 0) {
        expect(guest.checksum(), `network desync at frame ${frames}`).toBe(host.checksum());
        for (const fighter of host.match.fighters) {
          expect(Number.isFinite(fighter.x) && Number.isFinite(fighter.y)).toBe(true);
          expect(fighter.health).toBeGreaterThanOrEqual(0);
          expect(fighter.health).toBeLessThanOrEqual(MAX_HEALTH);
        }
      }
    }
    expect(host.match.phase).toBe('match_end');
    expect(guest.match.phase).toBe('match_end');
    expect(guest.checksum()).toBe(host.checksum());
    expect(sawKo).toBe(true);
    expect(sawRydenSpecial && sawVoltSpecial).toBe(true);
    expect(sawAbility).toBe(true);
    expect(host.match.stats[0].damage + host.match.stats[1].damage).toBeGreaterThan(1000);
  });

  it('the P key activates the real fighter ability once per press', () => {
    const bindings = useSettings.getState().bindings;
    useSettings.getState().resetBindings();
    inputManager.clearPad('p1');
    inputManager.attach();
    try {
      const engine = new GameEngine({ mode: 'local', p1Char: 'ryden', p2Char: 'volt', seed: 17, playIntro: false });
      bus.clear();
      for (let frame = 0; frame < 120; frame++) engine.stepNet(emptyInput(), emptyInput());
      expect(engine.match.phase).toBe('fight');
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP', key: 'p' }));
      const pressed = inputManager.sample('p1');
      expect(pressed.ability).toBe(true);
      expect(inputManager.sample('p1').ability).toBe(false);
      engine.stepNet(pressed, emptyInput());
      expect(engine.match.fighters[0].abilityCd).toBeGreaterThan(0);
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyP', key: 'p' }));
      expect(inputManager.sample('p1').ability).toBe(false);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP', key: 'p' }));
      expect(inputManager.sample('p1').ability).toBe(true);
    } finally {
      inputManager.detach();
      inputManager.clearPad('p1');
      useSettings.getState().set({ bindings });
    }
  });

  it('mobile ability input activates Volt Thunderclap through the same input edge', () => {
    inputManager.clearPad('p1');
    try {
      const engine = new GameEngine({ mode: 'local', p1Char: 'volt', p2Char: 'ryden', seed: 18, playIntro: false });
      bus.clear();
      for (let frame = 0; frame < 120; frame++) engine.stepNet(emptyInput(), emptyInput());
      engine.match.fighters[0].x = -0.6;
      engine.match.fighters[1].x = 0.6;
      inputManager.virtual.p1.ability = true;
      const tapped = inputManager.sample('p1');
      expect(tapped.ability).toBe(true);
      expect(inputManager.sample('p1').ability).toBe(false);
      engine.stepNet(tapped, emptyInput());
      expect(engine.match.fighters[1].health).toBeLessThan(MAX_HEALTH);
      expect(engine.match.fighters[0].abilityCd).toBeGreaterThan(0);
      inputManager.virtual.p1.ability = false;
      expect(inputManager.sample('p1').ability).toBe(false);
    } finally {
      inputManager.clearPad('p1');
    }
  });
});
