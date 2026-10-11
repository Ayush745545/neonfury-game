import * as THREE from 'three';
import type { JointName } from '../animations/types';

/* ================================================================== */
/*  Imported-model support (GLB/GLTF/FBX).                            */
/*                                                                     */
/*  HONEST STATUS: no external character models ship with this repo   */
/*  (offline environment / licensing). All 15 fighters currently use  */
/*  the procedural rigs, which are placeholders — NOT "detailed       */
/*  sculpted models". This module is the real import pipeline: drop   */
/*  a rigged GLB into public/fighters/<id>.glb (or set `model` in     */
/*  characters.ts) and it takes over automatically, with graceful     */
/*  fallback to procedural on any load/parse error.                   */
/*                                                                     */
/*  Two animation paths, both driven by the SAME sim state:           */
/*   1. Native clips — if the file contains clips named like our      */
/*      anim ids (idle, walkF, lp, hk, ko, victory…), they play       */
/*      through an AnimationMixer with crossfades.                    */
/*   2. Bone retarget — otherwise our procedural pose player drives   */
/*      the model's skeleton through a humanoid bone-name mapping     */
/*      (Mixamo + common conventions supported out of the box).       */
/* ================================================================== */

export interface ModelAsset {
  url: string;                       // .glb / .gltf / .fbx under public/
  scale?: number;                    // normalize to ~1.86 world units
  rotationY?: number;                // author-space correction (radians)
  hipsHeight?: number;               // override detected hip height
  boneMap?: Partial<Record<JointName, string>>; // explicit overrides
  clipMap?: Partial<Record<string, string>>;    // anim id → clip name
}

/** Canonical joint → accepted bone-name aliases (lowercased for matching). */
export const BONE_ALIASES: Record<JointName, string[]> = {
  hips: ['hips', 'hip', 'pelvis', 'root', 'base'],
  spine: ['spine', 'spine1', 'spine0', 'abdomen', 'waist'],
  chest: ['spine2', 'chest', 'spine3', 'thorax', 'upperchest'],
  neck: ['neck'],
  head: ['head'],
  shoulderL: ['leftshoulder', 'shoulderl', 'lshoulder', 'claviclel'],
  armL: ['leftarm', 'leftuparm', 'upperarml', 'larm', 'leftshoulderjoint'],
  forearmL: ['leftforearm', 'leftlowarm', 'forearml', 'lforearm', 'leftarmroll'],
  handL: ['lefthand', 'handl', 'lhand'],
  shoulderR: ['rightshoulder', 'shoulderr', 'rshoulder', 'clavicler'],
  armR: ['rightarm', 'rightuparm', 'upperarmr', 'rarm', 'rightshoulderjoint'],
  forearmR: ['rightforearm', 'rightlowarm', 'forearmr', 'rforearm', 'rightarmroll'],
  handR: ['righthand', 'handr', 'rhand'],
  thighL: ['leftupleg', 'leftthigh', 'thighl', 'lupleg', 'leftleg'],
  shinL: ['leftleg', 'leftshin', 'shinl', 'lleg', 'leftcalf'],
  footL: ['leftfoot', 'footl', 'lfoot', 'leftankle'],
  thighR: ['rightupleg', 'rightthigh', 'thighr', 'rupleg', 'rightleg'],
  shinR: ['rightleg', 'rightshin', 'shinr', 'rleg', 'rightcalf'],
  footR: ['rightfoot', 'footr', 'rfoot', 'rightankle'],
};

const normalize = (name: string): string =>
  name.toLowerCase().replace(/^mixamorig\d*:?/, '').replace(/[_\-\s.]/g, '');

/** Map our skeleton onto any humanoid hierarchy by name heuristics. */
export function collectBones(
  root: THREE.Object3D,
  overrides?: Partial<Record<JointName, string>>,
): Partial<Record<JointName, THREE.Object3D>> {
  const byName = new Map<string, THREE.Object3D>();
  root.traverse((o) => { byName.set(normalize(o.name), o); });

  const out: Partial<Record<JointName, THREE.Object3D>> = {};
  (Object.keys(BONE_ALIASES) as JointName[]).forEach((jn) => {
    const override = overrides?.[jn];
    if (override) {
      const found = byName.get(normalize(override));
      if (found) { out[jn] = found; return; }
    }
    for (const alias of BONE_ALIASES[jn]) {
      const found = byName.get(normalize(alias));
      if (found) { out[jn] = found; break; }
    }
  });
  return out;
}

/** How complete is a retarget mapping? (0..19 joints found) */
export function mappingScore(bones: Partial<Record<JointName, THREE.Object3D>>): number {
  return Object.keys(bones).length;
}

const CRITICAL: JointName[] = ['hips', 'chest', 'head', 'armL', 'armR', 'forearmL', 'forearmR', 'thighL', 'thighR', 'shinL', 'shinR'];

/** True when the mapping is good enough to animate the model. */
export function isUsableMapping(bones: Partial<Record<JointName, THREE.Object3D>>): boolean {
  return CRITICAL.every((j) => bones[j] !== undefined);
}

/** Match model animation clips against our anim-id vocabulary. */
export function indexClips(
  clips: { name: string }[],
  clipMap?: Partial<Record<string, string>>,
): Map<string, number> {
  const byNorm = new Map<string, number>();
  clips.forEach((c, i) => byNorm.set(normalize(c.name), i));
  const out = new Map<string, number>();
  const VOCAB = [
    'idle', 'walkF', 'walkB', 'crouch', 'jumpAscend', 'jumpFall', 'dashF', 'dashB',
    'blockStand', 'blockCrouch', 'lp', 'hp', 'lk', 'hk',
    'crouchLp', 'crouchHp', 'crouchLk', 'crouchHk', 'jumpLp', 'jumpHk',
    'hitMid', 'hitLow', 'hitHigh', 'airHit', 'launched', 'knockdown', 'getup',
    'ko', 'victory', 'defeat', 'specialCast', 'specialDash', 'specialFlurry',
    'specialUpper', 'specialSlam',
  ];
  for (const v of VOCAB) {
    const mapped = clipMap?.[v];
    const idx = mapped !== undefined ? byNorm.get(normalize(mapped)) : byNorm.get(normalize(v));
    if (idx !== undefined) out.set(v, idx);
  }
  return out;
}
