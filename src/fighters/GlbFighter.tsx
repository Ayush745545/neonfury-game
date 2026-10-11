import { Component, Suspense, use, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { FighterRuntime } from '../game/types';
import { CHARACTERS } from './characters';
import type { ModelAsset } from './modelAssets';
import { collectBones, indexClips, isUsableMapping } from './modelAssets';
import { PosePlayer } from '../animations/animPlayer';
import { animFor, type JointName, type Pose } from '../animations/types';
import { BASE_POSES } from '../animations/animData';
import { damp } from '../game/utils';

/* ================================================================== */
/*  Imported-model fighter renderer (GLB / GLTF / FBX).               */
/*  - Native clips win when the file ships matching animation names.  */
/*  - Otherwise our deterministic pose player retargets onto the      */
/*    model's humanoid bones (Mixamo naming supported).               */
/*  - Any load/parse error falls back to the procedural rig.          */
/* ================================================================== */

class RigErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode; onError?: (e: Error) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }
  componentDidCatch(error: Error): void {
    console.warn('[NEON FURY] imported model failed to load — using procedural rig fallback:', error.message);
    this.props.onError?.(error);
  }
  render(): ReactNode { return this.state.failed ? this.props.fallback : this.props.children; }
}

/* -------- FBX support via a tiny suspendable cache (React 19 `use`) -------- */

const fbxCache = new Map<string, Promise<THREE.Group>>();

async function loadFBX(url: string): Promise<THREE.Group> {
  const { FBXLoader } = await import('three-stdlib');
  return new Promise<THREE.Group>((resolve, reject) => {
    new FBXLoader().load(url, (g) => resolve(g), undefined, (err) => reject(err));
  });
}

function useSuspenseModel(asset: ModelAsset): { root: THREE.Object3D; clips: THREE.AnimationClip[] } {
  const isFbx = /\.fbx($|\?)/i.test(asset.url);
  if (isFbx) {
    let p = fbxCache.get(asset.url);
    if (!p) { p = loadFBX(asset.url); fbxCache.set(asset.url, p); }
    // React 19 `use()` suspends until resolved
    const group = use(p);
    return { root: group, clips: (group as unknown as { animations?: THREE.AnimationClip[] }).animations ?? [] };
  }
  const gltf = useGLTF(asset.url);
  return { root: gltf.scene, clips: gltf.animations ?? [] };
}

/* -------- retargeted/clip-driven renderer -------- */

function ModelFighterInner({ runtime, asset, fallback }: { runtime: FighterRuntime; asset: ModelAsset; fallback: ReactNode }) {
  const def = CHARACTERS[runtime.char];
  const { root, clips } = useSuspenseModel(asset);
  const bones = useMemo(() => collectBones(root, asset.boneMap), [root, asset]);
  const usable = isUsableMapping(bones);
  const clipIndex = useMemo(() => indexClips(clips, asset.clipMap), [clips, asset]);
  const mixer = useMemo(() => (clipIndex.size > 0 ? new THREE.AnimationMixer(root) : null), [clipIndex, root]);
  const player = useMemo(() => new PosePlayer(BASE_POSES[runtime.char] as Pose), [runtime.char]);
  const currentAction = useRef<THREE.AnimationAction | null>(null);
  const currentClipName = useRef('');
  const yaw = useRef(runtime.facing === 1 ? Math.PI / 2 : -Math.PI / 2);
  const tmpV = useMemo(() => new THREE.Vector3(), []);
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => () => { mixer?.stopAllAction(); }, [mixer]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const f = runtime;
    const g = groupRef.current;
    if (!g) return;
    g.position.set(f.x, f.y, 0);
    const targetYaw = f.facing === 1 ? Math.PI / 2 : -Math.PI / 2;
    let dy = targetYaw - yaw.current;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    yaw.current += dy * damp(22, dt);
    g.rotation.y = yaw.current + (asset.rotationY ?? 0);

    // resolve the sim anim id (same logic as the procedural view)
    let name = f.anim.name;
    if (name === 'jump') name = f.vy > 0.4 ? 'jumpAscend' : 'jumpFall';
    else if (name === 'introWalk') name = 'walkF';
    else if (name === 'introIdle') name = 'idle';
    const resolved = animFor(f.char, name);
    const animId = resolved ? resolved.name : `idle_${f.char}`;

    if (mixer && clipIndex.size > 0) {
      // PATH 1 — native clips with crossfade
      const generic = animId.replace(`_${f.char}`, '');
      const clipKey = clipIndex.has(generic) ? generic : clipIndex.has(animId) ? animId : 'idle';
      if (currentClipName.current !== clipKey) {
        const idx = clipIndex.get(clipKey) ?? clipIndex.get('idle') ?? 0;
        const clip = clips[idx];
        if (clip) {
          const next = mixer.clipAction(clip);
          next.reset();
          next.setLoop(clipKey === 'idle' || clipKey.startsWith('walk') || clipKey === 'victory' || clipKey === 'defeat' || clipKey === 'crouch' || clipKey === 'blockStand' || clipKey === 'blockCrouch' ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
          next.clampWhenFinished = true;
          next.fadeIn(0.09);
          next.play();
          currentAction.current?.fadeOut(0.09);
          currentAction.current = next;
          currentClipName.current = clipKey;
        }
      }
      mixer.update(dt);
    } else if (usable) {
      // PATH 2 — retarget our deterministic pose player onto model bones
      player.update(animId, f.anim.frame, dt);
      (Object.keys(bones) as JointName[]).forEach((jn) => {
        const bone = bones[jn];
        if (!bone) return;
        const e = player.get(jn);
        if (jn === 'hips') {
          bone.rotation.set(e[0], e[1], e[2]);
        } else {
          bone.rotation.set(e[0], e[1], e[2]);
        }
      });
      if (bones.hips) {
        const base = (asset.hipsHeight ?? 0.98) + player.curHipsY;
        bones.hips.position.y += (base - bones.hips.position.y) * damp(20, dt) * 0; // keep authored hip offset; bias via group scale
      }
    }

    // publish joint world positions for camera close-ups & VFX anchors
    const publish = (key: string, obj: THREE.Object3D | undefined, fy: number) => {
      if (obj) {
        obj.getWorldPosition(tmpV);
        f.joints[key] = { x: tmpV.x, y: tmpV.y, z: tmpV.z };
      } else {
        f.joints[key] = { x: f.x, y: f.y + fy, z: 0 };
      }
    };
    publish('head', bones.head, 1.72);
    publish('chest', bones.chest, 1.3);
    publish('handR', bones.handR, 1.2);
    publish('handL', bones.handL, 1.2);
    publish('footR', bones.footR, 0.1);
    publish('footL', bones.footL, 0.1);
    void def;
  });

  const scale = asset.scale ?? 1;
  return (
    <group ref={groupRef}>
      <group scale={scale}>
        <primitive object={root} />
      </group>
      {fallback}
    </group>
  );
}

/** Entry point: render the imported model when configured, else procedural. */
export function ModelFighter(props: { runtime: FighterRuntime; asset: ModelAsset; fallback: ReactNode }): ReactNode {
  return (
    <RigErrorBoundary fallback={props.fallback}>
      <Suspense fallback={props.fallback}>
        <ModelFighterInner {...props} />
      </Suspense>
    </RigErrorBoundary>
  );
}
