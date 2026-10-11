import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { FighterRuntime } from '../game/types';
import { buildFighterRig, type FighterRig } from './rig';
import { PosePlayer } from '../animations/animPlayer';
import { animFor, type Pose } from '../animations/types';
import { BASE_POSES } from '../animations/animData';
import type { GameEngine } from '../game/GameEngine';
import { damp } from '../game/utils';
import { vfx } from '../vfx/vfxManager';
import { POWER_PROFILES } from '../vfx/powerProfiles';
import { CHARACTERS } from './characters';
import { ModelFighter } from './GlbFighter';
import { FIGHTER_MODELS } from './modelAssets';

interface Props {
  runtime: FighterRuntime;
  preview?: boolean;
}

/** Maps sim anim-state names to concrete animation ids for this character. */
function resolveAnimName(f: FighterRuntime): string {
  let name = f.anim.name;
  if (name === 'jump') name = f.vy > 0.4 ? 'jumpAscend' : 'jumpFall';
  else if (name === 'introWalk') name = 'walkF';
  else if (name === 'introIdle') name = 'idle';
  const resolved = animFor(f.char, name);
  return resolved ? resolved.name : `idle_${f.char}`;
}

/** Contact shadow blob that follows fighter X position and fades with height */
export function ContactShadowBlob({ fighter }: { fighter: FighterRuntime }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    
    // Update position to follow fighter X
    mesh.position.x = fighter.x;
    
    // Opacity based on fighter height: 0 when grounded, fades in as fighter jumps
    // Clamp to max 0.6 opacity at height 2.5 or more
    const opacity = THREE.MathUtils.clamp(fighter.y / 2.5, 0, 0.6);
    (mesh.material as THREE.MeshBasicMaterial).opacity = opacity;
  });

  return (
    <mesh
      ref={meshRef}
      position={[fighter.x, 0.001, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <circleGeometry args={[0.5, 32]} />
      <meshBasicMaterial
        color="#000000"
        transparent
        opacity={0}
        depthWrite={false}
      />
    </mesh>
  );
}

export function FighterView({ runtime, preview }: Props) {
  const asset = FIGHTER_MODELS[runtime.char];
  const fallback = <ProceduralFighter runtime={runtime} preview={preview} />;
  const fighterRender = asset ? <ModelFighter runtime={runtime} asset={asset} fallback={fallback} preview={preview} /> : fallback;
  
  return (
    <>
      {fighterRender}
      <ContactShadowBlob fighter={runtime} />
    </>
  );
}

export function ProceduralFighter({ runtime, preview }: Props) {
  const def = CHARACTERS[runtime.char];
  const rig = useMemo<FighterRig>(() => buildFighterRig(def), [def]);
  const player = useMemo(
    () => new PosePlayer(BASE_POSES[runtime.char] as Pose),
    [runtime.char],
  );
  const yaw = useRef(runtime.facing === 1 ? Math.PI / 2 : -Math.PI / 2);
  const tmpV = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => () => rig.dispose(), [rig]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = state.clock.elapsedTime;
    const f = runtime;

    // world transform
    rig.root.position.set(f.x, f.y, 0);
    const targetYaw = preview ? Math.PI * 0.18 : f.facing === 1 ? Math.PI / 2 : -Math.PI / 2;
    // shortest-path yaw smoothing (fast turnarounds, no full spins)
    let dy = targetYaw - yaw.current;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    yaw.current += dy * damp(f.state === 'superVictim' ? 30 : 22, dt);
    rig.inner.rotation.y = yaw.current;

    // pose blending
    const animName = resolveAnimName(f);
    let snap: number | undefined;
    if (f.state === 'hitstun' || f.state === 'airHitstun' || f.state === 'ko' || f.state === 'knockdown') snap = 26;
    player.update(animName, f.anim.frame, dt, snap);

    const joints = rig.joints;
    (Object.keys(joints) as (keyof typeof joints)[]).forEach((jn) => {
      const e = player.get(jn);
      joints[jn].rotation.set(e[0], e[1], e[2]);
    });
    joints.hips.position.y = rig.hipsAnchorY + player.curHipsY;

    // super-victim stagger jitter (view only)
    if (f.state === 'superVictim' && f.hitstop <= 0) {
      const j = Math.sin(t * 60 + f.id * 7) * 0.05;
      joints.chest.rotation.x += j;
      joints.head.rotation.z += j * 0.6;
    }
    // hitstop micro-shake: amplitude scales with the actual damage taken
    if (f.hitstop > 0) {
      const powerAmp = 0.7 + Math.min(1.4, f.lastHitPower / 55);
      const j = Math.sin(t * 90) * 0.012 * powerAmp * Math.min(1, f.hitstop / 6);
      rig.inner.position.x = j;
    } else {
      rig.inner.position.x = 0;
    }

    // cloth & accessories: wind + motion sway
    const motion = THREE.MathUtils.clamp(-f.vx * f.facing * 0.06, -0.4, 0.4);
    for (const c of rig.clothSway) {
      c.obj.rotation.x = c.baseX + Math.sin(t * 2.4 + c.phase) * c.amp + motion;
      c.obj.rotation.z = c.baseZ + Math.cos(t * 1.9 + c.phase) * c.amp * 0.5;
    }

    // energy trim glow: pulse at full meter, blaze during specials/supers
    let glow = 1.5 + Math.sin(t * 3 + f.id * 2) * 0.3;
    if (f.meter >= 100) glow = 2.6 + Math.sin(t * 8) * 0.9;
    if (f.state === 'attack' && f.move && (f.move.kind === 'special' || f.move.kind === 'super')) glow = 4.2;
    for (const m of rig.trimMaterials) m.emissiveIntensity = glow;

    // active ability aura: orbiting energy motes in the ability color
    if (f.abilityBuff || (f.abilityCd > 0 && f.abilityCd > 890)) {
      const color = CHARACTERS[f.char].ability.color;
      if (Math.random() < 0.55) {
        const a = Math.random() * Math.PI * 2;
        vfx.spawnBurst(
          f.x + Math.cos(a) * 0.35, f.y + 0.6 + Math.random() * 1.1, color, 0.16,
        );
      }
    }

    // publish joint world positions (camera close-ups, VFX anchors)
    const publish = (key: string, obj: THREE.Object3D | undefined) => {
      if (!obj) return;
      obj.getWorldPosition(tmpV);
      f.joints[key] = { x: tmpV.x, y: tmpV.y, z: tmpV.z };
    };
    publish('head', joints.head);
    publish('chest', joints.chest);
    publish('handR', joints.handR);
    publish('handL', joints.handL);
    publish('footR', joints.footR);
    publish('footL', joints.footL);
  });

  return <primitive object={rig.root} />;
}

/* ------------------------------------------------------------------ */
/* Training / debug overlay: live hitboxes + hurtboxes                 */
/* ------------------------------------------------------------------ */

const MAX_BOXES = 24;

export function HitboxDebug({ engine }: { engine: GameEngine }) {
  const hurtRef = useRef<THREE.InstancedMesh>(null);
  const hitRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    const { hit, hurt } = engine.getDebugBoxes();
    const hurtM = hurtRef.current;
    const hitM = hitRef.current;
    if (hurtM) {
      for (let i = 0; i < MAX_BOXES; i++) {
        const b = hurt[i];
        dummy.position.set(b ? b.cx : 0, b ? b.cy : -100, b ? 0 : 0);
        dummy.scale.set(b ? b.w : 0.001, b ? b.h : 0.001, 0.5);
        dummy.updateMatrix();
        hurtM.setMatrixAt(i, dummy.matrix);
      }
      hurtM.count = MAX_BOXES;
      hurtM.instanceMatrix.needsUpdate = true;
    }
    if (hitM) {
      for (let i = 0; i < MAX_BOXES; i++) {
        const b = hit[i];
        dummy.position.set(b ? b.cx : 0, b ? b.cy : -100, b ? 0.3 : 0);
        dummy.scale.set(b ? b.w : 0.001, b ? b.h : 0.001, 0.4);
        dummy.updateMatrix();
        hitM.setMatrixAt(i, dummy.matrix);
      }
      hitM.count = MAX_BOXES;
      hitM.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      <instancedMesh ref={hurtRef} args={[undefined, undefined, MAX_BOXES]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#22dd66" wireframe transparent opacity={0.75} />
      </instancedMesh>
      <instancedMesh ref={hitRef} args={[undefined, undefined, MAX_BOXES]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#ff3344" wireframe transparent opacity={0.9} />
      </instancedMesh>
    </group>
  );
}


/* ------------------------------------------------------------------ */
/* Projectile rendering: glowing orbs/beams straight from sim state.   */
/* ------------------------------------------------------------------ */

const PROJ_POOL = 24;

export function ProjectileView({ engine }: { engine: GameEngine }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    const im = ref.current;
    if (!im) return;
    const list = engine.match.projectiles;
    let n = 0;
    for (let i = 0; i < list.length && n < PROJ_POOL; i++) {
      const p = list[i];
      if (p.dead) continue;
      dummy.position.set(p.x, p.y, 0);
      const pulse = 1 + Math.sin(performance.now() * 0.03 + p.id) * 0.12;
      const sc = (p.beam ? p.h * 1.6 : p.w * 0.62) * pulse;
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      im.setMatrixAt(n, dummy.matrix);
      col.set(p.color);
      im.setColorAt(n, col);
      // per-fighter energy trail (profile-driven; fallback to a soft burst)
      const owner = engine.match.fighters[p.owner];
      const prof = owner ? POWER_PROFILES[owner.char] : null;
      if (prof) prof.projTrail(p.x - Math.sign(p.vx) * 0.15, p.y, p.color);
      if (Math.random() < 0.4) vfx.spawnBurst(p.x - Math.sign(p.vx) * 0.15, p.y, p.color, 0.08);
      n++;
    }
    im.count = n;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, PROJ_POOL]} frustumCulled={false}>
      <sphereGeometry args={[1, 14, 12]} />
      <meshBasicMaterial toneMapped={false} transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} />
    </instancedMesh>
  );
}
