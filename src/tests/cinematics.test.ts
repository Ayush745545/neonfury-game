import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { VFXManager, MAX_FLAMES, type Arc } from '../vfx/vfxManager';
import { LIGHTNING_VERTICES_PER_ARC, writeLightningRibbon } from '../vfx/lightningRibbon';
import { CameraDirector } from '../camera/CameraDirector';
import { GameEngine } from '../game/GameEngine';
import { bus } from '../game/eventBus';
import { useSettings } from '../config/settings';

afterEach(() => {
  bus.clear();
  useSettings.setState({ screenShake: true });
});

describe('cinematic combat presentation', () => {
  it('reuses its flame pool under repeated specials and expires effects', () => {
    const effects = new VFXManager();
    const first = effects.flames[0];
    for (let i = 0; i < 200; i++) effects.spawnFlamePlume(i % 4, 1.1, i % 2 ? -1 : 1, 1.25);
    expect(effects.flames).toHaveLength(MAX_FLAMES);
    expect(effects.flames[0]).toBe(first);
    expect(effects.flames.filter((f) => f.active)).toHaveLength(MAX_FLAMES);
    effects.update(1);
    expect(effects.flames.every((f) => !f.active)).toBe(true);
    effects.spawnFlamePlume(0, 1, 1);
    effects.clear();
    expect(effects.flames.every((f) => !f.active)).toBe(true);
  });

  it('writes finite lightning geometry within pool capacity, even for zero-length arcs', () => {
    const arc: Arc = { active: true, x1: 0, y1: 1, z1: 0, x2: 0, y2: 1, z2: 0, life: 0.2, maxLife: 0.3, r: 1, g: 0.9, b: 0.3, seed: 42 };
    const buffers = {
      position: new Float32Array(LIGHTNING_VERTICES_PER_ARC * 3),
      color: new Float32Array(LIGHTNING_VERTICES_PER_ARC * 3),
      uv: new Float32Array(LIGHTNING_VERTICES_PER_ARC * 2),
    };
    const count = writeLightningRibbon(arc, 10, { x: 0, y: 1.4, z: 5 }, buffers, 0);
    expect(count).toBeLessThanOrEqual(LIGHTNING_VERTICES_PER_ARC);
    expect(count).toBeGreaterThan(0);
    expect([...buffers.position, ...buffers.color, ...buffers.uv].every(Number.isFinite)).toBe(true);
    const full = buffers.color.slice();
    writeLightningRibbon(arc, 10, { x: 0, y: 1.4, z: 5 }, buffers, 0, true, 0.42);
    expect(buffers.color[0]).toBeLessThan(full[0]);
  });

  it('holds joint trails during hitstop and does not advance when paused', () => {
    const engine = new GameEngine({ mode: 'local', p1Char: 'ryden', p2Char: 'volt', playIntro: false });
    const effects = new VFXManager();
    effects.setFighters(...engine.match.fighters);
    engine.match.fighters[0].hitstop = 12;
    effects.startTrail(0, 'handR', '#ff8822');
    effects.update(1 / 30);
    expect(effects.particles.some((p) => p.active)).toBe(false);
    engine.match.fighters[0].hitstop = 0;
    effects.update(1 / 30);
    expect(effects.particles.some((p) => p.active)).toBe(true);
    const particle = effects.particles.find((p) => p.active)!;
    const life = particle.life;
    effects.update(0);
    expect(particle.life).toBe(life);
  });

  it.each([9 / 16, 16 / 9, 21 / 9])('frames both fighters through super zoom and impact at aspect %s', (aspect) => {
    const engine = new GameEngine({ mode: 'local', p1Char: 'ryden', p2Char: 'volt', playIntro: false });
    const match = engine.match;
    match.phase = 'fight';
    const [a, b] = match.fighters;
    a.x = -6.4; b.x = 6.4; b.y = 3.2;
    const camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 100);
    const director = new CameraDirector();
    director.attach(camera);
    director.reset(match);
    useSettings.setState({ screenShake: false });
    bus.emit({ type: 'camera', mode: 'super', duration: 3 });
    bus.emit({ type: 'camera', mode: 'impact', intensity: 1.3 });
    bus.emit({ type: 'shake', intensity: 3 });
    for (let frame = 0; frame < 30; frame++) {
      director.update(1 / 60, match);
      camera.updateMatrixWorld();
      for (const fighter of match.fighters) {
        for (const [dx, dy] of [[-0.9, 0.04], [0.9, 0.04], [-0.9, 2.15], [0.9, 2.15]]) {
          const projected = new THREE.Vector3(fighter.x + dx, fighter.y + dy, 0).project(camera);
          expect(Math.abs(projected.x)).toBeLessThan(0.94);
          expect(Math.abs(projected.y)).toBeLessThan(0.94);
        }
      }
      // A lookAt yaw may produce an Euler Z angle; a true roll tilts its right axis.
      expect(Math.abs(camera.matrixWorld.elements[1])).toBeLessThan(0.000001);
    }
    const beforePause = camera.position.clone();
    match.phase = 'paused';
    director.update(1, match);
    expect(camera.position.equals(beforePause)).toBe(true);
    director.dispose();
  });
});
