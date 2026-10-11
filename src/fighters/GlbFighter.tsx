import { Component, Suspense, use, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import * as THREE from 'three';
import type { FighterRuntime } from '../game/types';
import type { ModelAsset } from './modelAssets';
import { collectBones, indexClips, isUsableMapping } from './modelAssets';
import { PosePlayer } from '../animations/animPlayer';
import { animFor } from '../animations/types';
import { BASE_POSES } from '../animations/animData';
import { HumanoidPoseRetargeter } from './retargetPose';
import { damp } from '../game/utils';

class RigErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.warn('[NEON FURY] model fallback:', error.message); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

const fbxCache = new Map<string, Promise<THREE.Group>>();
async function loadFBX(url: string): Promise<THREE.Group> {
  const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');
  return new FBXLoader().loadAsync(url);
}

type Props = { runtime: FighterRuntime; asset: ModelAsset; fallback: ReactNode; preview?: boolean };

/** Clone skin and skeleton per instance; mirror matches must never share mutable bones/materials. */
export function createModelInstance(source: THREE.Object3D): THREE.Object3D {
  const root = clone(source);
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = object.receiveShadow = true;
    object.frustumCulled = false; // skin bounds change during launches/KO poses
    object.material = Array.isArray(object.material) ? object.material.map((m) => m.clone()) : object.material.clone();
  });
  return root;
}

function AnimatedModel({ runtime, asset, fallback, preview, source, clips }: Props & { source: THREE.Object3D; clips: THREE.AnimationClip[] }) {
  const root = useMemo(() => createModelInstance(source), [source]);
  const bones = useMemo(() => collectBones(root, asset.boneMap), [root, asset]);
  const usable = isUsableMapping(bones);
  const retargeter = useMemo(() => new HumanoidPoseRetargeter(root, bones), [root, bones]);
  const player = useMemo(() => new PosePlayer(BASE_POSES[runtime.char]), [runtime.char]);
  const clipIndex = useMemo(() => indexClips(clips, asset.clipMap), [clips, asset]);
  const mixer = useMemo(() => new THREE.AnimationMixer(root), [root]);
  const action = useRef<THREE.AnimationAction | null>(null);
  const lastAnimation = useRef('');
  const lastFrame = useRef(-1);
  const lastMove = useRef(runtime.move);
  const yaw = useRef(runtime.facing === 1 ? Math.PI / 2 : -Math.PI / 2);
  const groupRef = useRef<THREE.Group>(null);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const scale = asset.scale ?? 1;

  useEffect(() => () => {
    mixer.stopAllAction(); mixer.uncacheRoot(root);
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      if (o instanceof THREE.SkinnedMesh) o.skeleton.dispose();
    });
    // Loaded geometry/textures belong to the shared loader cache.
  }, [root, mixer]);

  useFrame((_, rawDt) => {
    const group = groupRef.current;
    if (!group || !usable) return;
    const f = runtime;
    const dt = Math.min(rawDt, 0.05);
    group.position.set(f.x, f.y, 0);
    const target = preview ? Math.PI * 0.18 : (f.facing === 1 ? Math.PI / 2 : -Math.PI / 2);
    const delta = Math.atan2(Math.sin(target - yaw.current), Math.cos(target - yaw.current));
    yaw.current += delta * damp(22, dt);
    group.rotation.y = yaw.current + (asset.rotationY ?? 0);
    let name = f.anim.name;
    if (name === 'jump') name = f.vy > 0.4 ? 'jumpAscend' : 'jumpFall';
    if (name === 'introWalk') name = 'walkF';
    if (name === 'introIdle') name = 'idle';
    const resolved = animFor(f.char, name);
    const animId = resolved?.name ?? `idle_${f.char}`;
    const generic = animId.replace(`_${f.char}`, '');
    const index = clipIndex.get(generic) ?? clipIndex.get(animId);
    const restarted = animId !== lastAnimation.current || f.anim.frame < lastFrame.current || f.move !== lastMove.current;
    player.update(animId, f.anim.frame, dt, f.hitstop > 0 ? 40 : undefined);
    retargeter.apply(player, scale);
    // Native clips are used only for a matching state. Missing attacks always get combat poses.
    if (index !== undefined) {
      const clip = clips[index];
      if (restarted || !action.current) {
        const next = mixer.clipAction(clip);
        action.current?.stop();
        next.reset().setLoop(resolved?.loop ? THREE.LoopRepeat : THREE.LoopOnce, resolved?.loop ? Infinity : 1).play();
        next.clampWhenFinished = true;
        action.current = next;
      }
      // Lock native playback to sim frames, including hitstop, slow motion and pause.
      action.current!.time = resolved?.loop ? (f.anim.frame / 60) % clip.duration : Math.min(clip.duration, f.anim.frame / 60);
      mixer.update(0);
    } else {
      action.current?.stop(); action.current = null;
    }
    lastAnimation.current = animId; lastFrame.current = f.anim.frame; lastMove.current = f.move;
    root.updateWorldMatrix(true, true);
    for (const key of ['head', 'chest', 'handR', 'handL', 'footR', 'footL'] as const) {
      const bone = bones[key];
      if (!bone) continue;
      bone.getWorldPosition(tmp);
      const pos = f.joints[key] ?? (f.joints[key] = { x: 0, y: 0, z: 0 });
      pos.x = tmp.x; pos.y = tmp.y; pos.z = tmp.z;
    }
    const glow = f.state === 'attack' && f.move?.kind !== 'normal' ? 3 : 1.3;
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (m instanceof THREE.MeshStandardMaterial && m.name.includes('Energy')) m.emissiveIntensity = glow;
        }
      }
    });
  });

  if (!usable) return fallback;
  return <group ref={groupRef}><group scale={scale}><primitive object={root} dispose={null} /></group></group>;
}

function GLTFFighter(props: Props) {
  const gltf = useGLTF(props.asset.url);
  return <AnimatedModel {...props} source={gltf.scene} clips={gltf.animations} />;
}
function FBXFighter(props: Props) {
  let promise = fbxCache.get(props.asset.url);
  if (!promise) { promise = loadFBX(props.asset.url); fbxCache.set(props.asset.url, promise); }
  const root = use(promise);
  return <AnimatedModel {...props} source={root} clips={root.animations} />;
}
export function ModelFighter(props: Props) {
  return <RigErrorBoundary key={props.asset.url} fallback={props.fallback}>
    <Suspense fallback={props.fallback}>
      {/\.fbx($|\?)/i.test(props.asset.url) ? <FBXFighter {...props} /> : <GLTFFighter {...props} />}
    </Suspense>
  </RigErrorBoundary>;
}
