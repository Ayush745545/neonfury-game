import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { GameEngine } from '../game/GameEngine';
import { damp } from '../game/utils';

/* ================================================================== */
/*  Fighter light rig: a small lighting cluster that follows the      */
/*  action so the characters always read against the neon backdrop.   */
/*  key (warm, shadow-casting) + cool fill + two stage-tinted rims    */
/*  from behind. Positions are damped — no popping.                   */
/* ================================================================== */

export function FighterLightRig({ engine, rimL, rimR }: { engine: GameEngine; rimL: string; rimR: string }) {
  const key = useRef<THREE.DirectionalLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  const rimA = useRef<THREE.PointLight>(null);
  const rimB = useRef<THREE.PointLight>(null);
  const keyTarget = useMemo(() => new THREE.Object3D(), []);
  const fillTarget = useMemo(() => new THREE.Object3D(), []);
  const mid = useRef(new THREE.Vector3(0, 1.1, 0));

  useFrame((state, dt) => {
    const d = Math.min(dt, 0.05);
    const [a, b] = engine.match.fighters;
    const mx = (a.x + b.x) / 2;
    const my = 1.1 + Math.max(a.y, b.y) * 0.45;
    const k = damp(6, d);
    mid.current.x += (mx - mid.current.x) * k;
    mid.current.y += (my - mid.current.y) * k;

    if (key.current) {
      key.current.position.set(mid.current.x - 3.2, 5.4, 4.6);
      keyTarget.position.copy(mid.current);
      keyTarget.updateMatrixWorld();
      key.current.target = keyTarget;
    }
    if (fill.current) {
      fill.current.position.set(mid.current.x + 3.6, 3.2, 5.4);
      fillTarget.position.copy(mid.current);
      fillTarget.updateMatrixWorld();
      fill.current.target = fillTarget;
    }
    // rims sit behind each fighter (negative z), tinted by the stage neons
    if (rimA.current) {
      rimA.current.position.set(a.x - a.facing * 0.5, 2.15 + a.y * 0.5, -2.5);
      rimA.current.intensity = 6.5 + Math.sin(state.clock.elapsedTime * 2.1) * 0.5;
    }
    if (rimB.current) {
      rimB.current.position.set(b.x - b.facing * 0.5, 2.15 + b.y * 0.5, -2.5);
      rimB.current.intensity = 6.5 + Math.sin(state.clock.elapsedTime * 1.7 + 2) * 0.5;
    }
  });

  return (
    <group>
      <directionalLight
        ref={key}
        color="#ffe9d2"
        intensity={1.5}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-3}
        shadow-camera-near={0.5}
        shadow-camera-far={22}
        shadow-bias={-0.0014}
      />
      <directionalLight ref={fill} color="#bcd4ff" intensity={0.55} />
      <pointLight ref={rimA} color={rimL} intensity={6.5} distance={7} decay={1.9} />
      <pointLight ref={rimB} color={rimR} intensity={6.5} distance={7} decay={1.9} />
      <primitive object={keyTarget} />
      <primitive object={fillTarget} />
    </group>
  );
}
