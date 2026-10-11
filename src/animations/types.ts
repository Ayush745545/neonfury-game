import type { CharId } from '../game/types';

/* Skeleton shared by both procedurally-built fighters. */
export type JointName =
  | 'hips' | 'spine' | 'chest' | 'neck' | 'head'
  | 'shoulderL' | 'armL' | 'forearmL' | 'handL'
  | 'shoulderR' | 'armR' | 'forearmR' | 'handR'
  | 'thighL' | 'shinL' | 'footL'
  | 'thighR' | 'shinR' | 'footR';

export const ALL_JOINTS: JointName[] = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'shoulderL', 'armL', 'forearmL', 'handL',
  'shoulderR', 'armR', 'forearmR', 'handR',
  'thighL', 'shinL', 'footL',
  'thighR', 'shinR', 'footR',
];

/** Degrees, XYZ euler order (model space: forward = +z, up = +y). */
export type Euler3 = [number, number, number];

export interface PoseKey {
  t: number;                                       // frame
  j: Partial<Record<JointName, Euler3>>;
  hipsY?: number;                                  // root height offset (units)
}

export interface AnimDef {
  name: string;
  frames: number;
  loop: boolean;
  keys: PoseKey[];
  /** blend speed category */
  snap?: 'soft' | 'normal' | 'fast';
}

export type Pose = Partial<Record<JointName, Euler3>> & { hipsY?: number };

export const ANIMS: Record<string, AnimDef> = {};

export function defAnim(def: AnimDef): AnimDef {
  // pre-sort keys per anim
  def.keys.sort((a, b) => a.t - b.t);
  ANIMS[def.name] = def;
  return def;
}

export const snapRate = (a?: AnimDef): number => {
  switch (a?.snap) {
    case 'fast': return 30;
    case 'soft': return 9;
    default: return 15;
  }
};

export function animFor(char: CharId, name: string): AnimDef | undefined {
  // character-specific variants take precedence
  const specific = ANIMS[`${name}_${char}`];
  return specific ?? ANIMS[name];
}
