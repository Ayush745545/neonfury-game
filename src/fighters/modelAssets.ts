import * as THREE from 'three';
import type { JointName } from '../animations/types';
import type { CharId } from '../game/types';

/* Imported humanoids use independent skin instances and simulation-driven
 * poses. Recognized native clip tracks can override the retargeted baseline;
 * missing tracks/attacks retain the combat pose. Unusable/load-failed assets
 * fall back to the existing procedural fighters. */

export interface ModelAsset {
  url: string;                       // .glb / .gltf / .fbx under public/
  scale?: number;                    // normalize to ~1.86 world units
  rotationY?: number;                // author-space correction (radians)
  hipsHeight?: number;               // override detected hip height
  boneMap?: Partial<Record<JointName, string>>; // explicit overrides
  clipMap?: Partial<Record<string, string>>;    // anim id → clip name
}

/** Bundled CC0 humanoids, with NEON FURY clothing/material derivatives. */
const QUATERNIUS_BONES: Partial<Record<JointName, string>> = {
  hips: 'pelvis', spine: 'spine_01', chest: 'spine_03', neck: 'neck_01', head: 'Head',
  shoulderL: 'clavicle_l', shoulderR: 'clavicle_r',
  armL: 'upperarm_l', armR: 'upperarm_r', forearmL: 'lowerarm_l', forearmR: 'lowerarm_r',
  handL: 'hand_l', handR: 'hand_r',
  thighL: 'thigh_l', thighR: 'thigh_r', shinL: 'calf_l', shinR: 'calf_r', footL: 'foot_l', footR: 'foot_r',
};
export const FIGHTER_MODELS: Partial<Record<CharId, ModelAsset>> = {
  ryden: { url: '/fighters/ryden.glb', scale: 1, boneMap: QUATERNIUS_BONES },
  volt: { url: '/fighters/volt.glb', scale: 1, boneMap: QUATERNIUS_BONES },
};

/** Canonical joint → accepted bone-name aliases (lowercased for matching). */
export const BONE_ALIASES: Record<JointName, string[]> = {
  hips: ['hips', 'hip', 'pelvis', 'root', 'base'],
  spine: ['spine', 'spine01', 'spine1', 'spine0', 'abdomen', 'waist'],
  chest: ['chest', 'spine03', 'spine2', 'spine3', 'spine02', 'thorax', 'upperchest'],
  neck: ['neck', 'neck01'],
  head: ['head'],
  shoulderL: ['leftshoulder', 'shoulderl', 'lshoulder', 'claviclel'],
  armL: ['leftarm', 'leftuparm', 'upperarml', 'larm', 'leftshoulderjoint'],
  forearmL: ['leftforearm', 'leftlowarm', 'forearml', 'lowerarml', 'lforearm', 'leftarmroll'],
  handL: ['lefthand', 'handl', 'lhand'],
  shoulderR: ['rightshoulder', 'shoulderr', 'rshoulder', 'clavicler'],
  armR: ['rightarm', 'rightuparm', 'upperarmr', 'rarm', 'rightshoulderjoint'],
  forearmR: ['rightforearm', 'rightlowarm', 'forearmr', 'lowerarmr', 'rforearm', 'rightarmroll'],
  handR: ['righthand', 'handr', 'rhand'],
  thighL: ['leftupleg', 'leftthigh', 'thighl', 'lupleg'],
  shinL: ['leftleg', 'leftshin', 'shinl', 'lleg', 'leftcalf', 'calfl'],
  footL: ['leftfoot', 'footl', 'lfoot', 'leftankle'],
  thighR: ['rightupleg', 'rightthigh', 'thighr', 'rupleg'],
  shinR: ['rightleg', 'rightshin', 'shinr', 'rleg', 'rightcalf', 'calfr'],
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
  const used = new Set<THREE.Object3D>();
  (Object.keys(BONE_ALIASES) as JointName[]).forEach((jn) => {
    const override = overrides?.[jn];
    if (override) {
      const found = byName.get(normalize(override));
      if (found && !used.has(found)) { out[jn] = found; used.add(found); return; }
    }
    for (const alias of BONE_ALIASES[jn]) {
      const found = byName.get(normalize(alias));
      if (found && !used.has(found)) { out[jn] = found; used.add(found); break; }
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
  return CRITICAL.every((j) => bones[j] !== undefined) && new Set(Object.values(bones)).size === Object.keys(bones).length;
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
