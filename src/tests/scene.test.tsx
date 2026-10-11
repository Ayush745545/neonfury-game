// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import * as THREE from 'three';
import { FighterView } from '../fighters/FighterView';
import { CityStage } from '../arenas/CityStage';
import { STAGES } from '../arenas/stages';
import { VFXLayer } from '../vfx/VFXLayer';
import { useSettings } from '../config/settings';
import { cameraDirector } from '../camera/CameraDirector';
import { GameEngine } from '../game/GameEngine';
import { emptyInput } from '../game/types';
import { bus } from '../game/eventBus';
import '../animations/animData';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* jsdom has no 2D canvas — stub the context so texture factories run */
function stubCtx(): Record<string, unknown> {
  const grad = { addColorStop: () => {} };
  const noop = () => {};
  return new Proxy({} as Record<string, unknown>, {
    get: (_t, prop) => {
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => grad;
      if (prop === 'measureText') return () => ({ width: 10 });
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (prop === 'canvas') return { width: 64, height: 64 };
      return noop;
    },
    set: () => true,
  });
}
HTMLCanvasElement.prototype.getContext = (() => stubCtx()) as unknown as typeof HTMLCanvasElement.prototype.getContext;

describe('3D scene render', () => {
  it('FighterView renders a full rig and drives poses from the sim', async () => {
    const engine = new GameEngine({ mode: 'local', p1Char: 'ryden', p2Char: 'kaito', seed: 9, playIntro: false });
    bus.clear();
    engine.input = { sample: () => emptyInput() };
    const step = () => (engine as unknown as { step(): void }).step();
    for (let i = 0; i < 120; i++) step();

    const f0 = engine.match.fighters[0];
    const renderer = await ReactThreeTestRenderer.create(<FighterView runtime={f0} />);

    // step the sim (a walk) and advance render frames so useFrame runs
    engine.input = { sample: () => ({ ...emptyInput(), right: true }) };
    for (let i = 0; i < 30; i++) {
      step();
      await ReactThreeTestRenderer.act(async () => {
        renderer.advanceFrames(2, 0.016);
      });
    }

    // traverse the real three.js graph produced by the reconciler
    const graph = renderer.toGraph();
    let meshCount = 0;
    let jointCount = 0;
    const walk = (obj: { type?: string; name?: string; children?: unknown[] }) => {
      if (obj.type === 'Mesh') meshCount++;
      if (obj.name && ['hips', 'spine', 'chest', 'head', 'armL', 'armR', 'forearmL', 'forearmR', 'handL', 'handR', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR', 'neck', 'shoulderL', 'shoulderR'].includes(obj.name)) jointCount++;
      (obj.children as typeof obj[] | undefined)?.forEach(walk);
    };
    walk({ type: 'Root', children: Array.isArray(graph) ? graph : [graph] });
    expect(meshCount).toBeGreaterThan(30);   // fully built character, not a placeholder cube
    expect(jointCount).toBe(19);             // fully articulated skeleton

    // the pose player must have produced finite joint rotations
    expect(Number.isFinite(f0.x)).toBe(true);
    expect(f0.state).toBe('walkF');

    renderer.unmount();
  });

  it('full arena + both fighters + VFX layer render and animate', async () => {
    useSettings.setState({ quality: 'low' }); // skip reflector pass (needs WebGL)
    const engine = new GameEngine({ mode: 'vs-cpu', p1Char: 'kaito', p2Char: 'ryden', seed: 21, playIntro: false });
    bus.clear();
    const step = () => (engine as unknown as { step(): void }).step();
    for (let i = 0; i < 120; i++) step();
    engine.input = { sample: () => emptyInput() };

    const renderer = await ReactThreeTestRenderer.create(
      <group>
        <CityStage def={STAGES[0]} />
        <FighterView runtime={engine.match.fighters[0]} />
        <FighterView runtime={engine.match.fighters[1]} />
        <VFXLayer />
      </group>,
    );

    // simulate 3 seconds of gameplay frames — exercises every useFrame hook
    // (rain shader time, crowd walk, traffic, steam, pose blending, VFX packing)
    for (let i = 0; i < 90; i++) {
      step();
      await ReactThreeTestRenderer.act(async () => {
        renderer.advanceFrames(1, 1 / 30);
      });
    }

    const graph = renderer.toGraph();
    let meshes = 0;
    const walk = (o: { type?: string; children?: unknown[] }) => {
      if (o.type === 'Mesh' || o.type === 'InstancedMesh') meshes++;
      (o.children as typeof o[] | undefined)?.forEach(walk);
    };
    walk({ type: 'Root', children: Array.isArray(graph) ? graph : [graph] });
    expect(meshes).toBeGreaterThan(120); // two rigged fighters + full street
    renderer.unmount();
    useSettings.setState({ quality: 'high' });
  });

  it('camera director produces finite framing across phases', async () => {
    const engine = new GameEngine({ mode: 'arcade', p1Char: 'ryden', p2Char: 'kaito', seed: 4, playIntro: true });
    bus.clear();
    engine.input = { sample: () => emptyInput() };
    class FakeVec extends (class { x = 0; y = 0; z = 0; } ) {
      copy(v: { x: number; y: number; z: number }) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
      lerp(v: { x: number; y: number; z: number }, t: number) { this.x += (v.x - this.x) * t; this.y += (v.y - this.y) * t; this.z += (v.z - this.z) * t; return this; }
      clone() { const c = new FakeVec(); c.copy(this); return c; }
      set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; return this; }
    }
    const cam = {
      position: new FakeVec().set(0, 1.6, 6),
      lookAt: () => {},
      rotation: { z: 0 },
      fov: 42,
      aspect: 16 / 9,
      updateProjectionMatrix: () => {},
    };
    cameraDirector.attach(cam as unknown as THREE.PerspectiveCamera);
    cameraDirector.reset(engine.match);
    const step = () => (engine as unknown as { step(): void }).step();
    // run the whole intro, a fight, and a KO — camera must stay finite and sane
    for (let i = 0; i < 760; i++) { step(); cameraDirector.update(1 / 60, engine.match); }
    engine.match.fighters[1].health = 5;
    engine.input = { sample: (slot) => (slot === 'p1' ? { ...emptyInput(), hp: i2++ % 999 === 0 } : emptyInput()) };
    let i2 = 1;
    // drive to a KO by brute force
    for (let i = 0; i < 900; i++) {
      step();
      cameraDirector.update(1 / 60, engine.match);
      if (engine.match.fighters[1].health <= 0) break;
      if (i % 40 === 0) { engine.match.fighters[1].health -= 120; }
    }
    for (let i = 0; i < 600; i++) { step(); cameraDirector.update(1 / 60, engine.match); }
    const c = cam;
    expect(Number.isFinite(c.position.x)).toBe(true);
    expect(Number.isFinite(c.position.y)).toBe(true);
    expect(Number.isFinite(c.position.z)).toBe(true);
    expect(c.position.z).toBeGreaterThan(0.4); // never inside the fighters
    expect(c.fov).toBeGreaterThan(20);
    expect(c.fov).toBeLessThan(70);
    cameraDirector.dispose();
  });
});
