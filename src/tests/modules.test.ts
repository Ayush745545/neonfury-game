import { describe, it, expect } from 'vitest';

/* Every module must import cleanly (module-scope side effects included). */

describe('module imports', () => {
  it('all game modules load without crashing', async () => {
    const mods = [
      '../config/constants',
      '../config/settings',
      '../game/types',
      '../game/utils',
      '../game/eventBus',
      '../game/inputManager',
      '../game/matchStore',
      '../game/GameEngine',
      '../combat/moves',
      '../combat/hitDetection',
      '../fighters/characters',
      '../fighters/rig',
      '../ai/cpuBrain',
      '../animations/types',
      '../animations/animData',
      '../animations/animPlayer',
      '../vfx/vfxManager',
      '../audio/audioEngine',
      '../camera/CameraDirector',
    ];
    for (const m of mods) {
      const mod = await import(/* @vitest-error-ignore */ m);
      expect(mod, m).toBeDefined();
    }
  });

  it('engine + characters + moves are consistent', async () => {
    const { CHARACTERS } = await import('../fighters/characters');
    const { MOVE_INDEX } = await import('../combat/moves');
    for (const char of ['ryden', 'kaito'] as const) {
      expect(CHARACTERS[char]).toBeDefined();
      expect(Object.keys(MOVE_INDEX[char]).length).toBeGreaterThanOrEqual(12);
      for (const move of Object.values(MOVE_INDEX[char])) {
        expect(move.char).toBe(char);
        expect(move.anim.length).toBeGreaterThan(0);
      }
    }
  });
});
