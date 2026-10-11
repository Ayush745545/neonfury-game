import { ANIMS, defAnim, type AnimDef, type Euler3, type JointName, type Pose, type PoseKey } from './types';
import type { CharId } from '../game/types';
import { CHARACTERS, ROSTER, type CharacterDef } from '../fighters/characters';

/* ================================================================== */
/*  Animation library. Model space: forward = +z, limbs hang -y.      */
/*  Negative X on a limb swings it FORWARD; positive X swings back.   */
/*  Knees/elbows flex with POSITIVE child X. Angles in degrees.       */
/* ================================================================== */

const K = (t: number, j: Partial<Record<JointName, Euler3>>, hipsY?: number): PoseKey => ({ t, j, hipsY });

/* ---------------- base stances (per character) ---------------- */

export const BASE_RYDEN: Pose = {
  hips: [0, -15, 0], hipsY: -0.06,
  spine: [5, -8, 0],
  chest: [3, -12, 0],
  neck: [-4, 0, 0],
  head: [-2, 25, 0],
  shoulderL: [0, 0, 8], shoulderR: [0, 0, -8],
  armL: [-28, 10, -12], forearmL: [-78, -15, 0], handL: [0, 0, 0],
  armR: [-42, -8, 10], forearmR: [-72, 12, 0], handR: [0, 0, 0],
  thighL: [18, 18, 0], shinL: [30, -8, 0], footL: [25, 40, 0],
  thighR: [-22, -14, 0], shinR: [24, 10, 0], footR: [-6, 12, 0],
};

export const BASE_KAITO: Pose = {
  hips: [0, -32, 0], hipsY: -0.08,
  spine: [6, -6, 0],
  chest: [4, -14, 0],
  neck: [-3, 0, 0],
  head: [-3, 42, 0],
  shoulderL: [0, 0, 10], shoulderR: [0, 0, -10],
  armL: [-22, 14, -14], forearmL: [-85, -20, 0], handL: [0, 0, 0],
  armR: [-34, -14, 12], forearmR: [-62, 18, 0], handR: [0, 0, 0],
  thighL: [24, 26, 0], shinL: [34, -10, 0], footL: [26, 44, 0],
  thighR: [-26, -20, 0], shinR: [28, 14, 0], footR: [-8, 16, 0],
};

const E = (base: Pose, jn: JointName): Euler3 => (base[jn] as Euler3 | undefined) ?? [0, 0, 0];
const off = (e: Euler3, dx = 0, dy = 0, dz = 0): Euler3 => [e[0] + dx, e[1] + dy, e[2] + dz];

/* Generate a stance for every character by blending the square (ryden)
   and bladed (kaito) archetypes, then adjusting per build/guard. */
function makeStance(def: CharacterDef): Pose {
  const b = def.bladed;
  const mix = (jn: JointName): Euler3 => {
    const a = E(BASE_RYDEN, jn);
    const c = E(BASE_KAITO, jn);
    return [a[0] + (c[0] - a[0]) * b, a[1] + (c[1] - a[1]) * b, a[2] + (c[2] - a[2]) * b];
  };
  const pose: Pose = {};
  for (const jn of ['hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'shoulderR',
    'armL', 'armR', 'forearmL', 'forearmR', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR'] as JointName[]) {
    pose[jn] = mix(jn);
  }
  const g = def.guard;
  (pose.armR as Euler3)[0] += g;
  (pose.armL as Euler3)[0] += g * 0.7;
  (pose.forearmR as Euler3)[0] += g;
  (pose.forearmL as Euler3)[0] += g * 0.7;
  (pose.head as Euler3)[0] -= g * 0.6;
  if (def.build === 'heavy') {
    (pose.thighL as Euler3)[2] += 8; (pose.thighR as Euler3)[2] -= 8;
    pose.hipsY = (BASE_RYDEN.hipsY ?? 0) - 0.05;
    (pose.spine as Euler3)[0] += 5;
    (pose.armR as Euler3)[2] -= 8; (pose.armL as Euler3)[2] += 8;
  } else if (def.build === 'lean') {
    (pose.thighL as Euler3)[2] -= 4; (pose.thighR as Euler3)[2] += 4;
    (pose.armR as Euler3)[2] += 4; (pose.armL as Euler3)[2] -= 4;
    pose.hipsY = (BASE_RYDEN.hipsY ?? 0) + 0.01;
  } else {
    pose.hipsY = b > 0.5 ? (BASE_KAITO.hipsY ?? 0) : (BASE_RYDEN.hipsY ?? 0);
  }
  return pose;
}

export const BASE_POSES: Record<CharId, Pose> = ROSTER.reduce((acc, id) => {
  acc[id] = id === 'ryden' ? BASE_RYDEN : id === 'kaito' ? BASE_KAITO : makeStance(CHARACTERS[id]);
  return acc;
}, {} as Record<CharId, Pose>);

/* ---------------- generated stance animations ---------------- */

function genIdle(name: string, base: Pose, frames = 130): AnimDef {
  const keys: PoseKey[] = [];
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const t = Math.round((frames * i) / steps);
    const p = (i / steps) * Math.PI * 2;
    const br = Math.sin(p);            // breath
    const br2 = Math.sin(p * 2 + 0.8); // secondary
    keys.push(K(t, {
      chest: off(E(base, 'chest'), 1.6 * br, 0, 0.8 * br2),
      spine: off(E(base, 'spine'), 0.9 * br, 0, 0),
      head: off(E(base, 'head'), -1.2 * br, 2.4 * br2, 0),
      armL: off(E(base, 'armL'), 2.6 * br, 0, 1.2 * br2),
      forearmL: off(E(base, 'forearmL'), 3.2 * br, 0, 0),
      armR: off(E(base, 'armR'), 2.2 * br2, 0, -1.1 * br),
      forearmR: off(E(base, 'forearmR'), 3.0 * br2, 0, 0),
      thighR: off(E(base, 'thighR'), 0.8 * br, 0, 0),
      shinR: off(E(base, 'shinR'), -0.8 * br, 0, 0),
    }, (base.hipsY ?? 0) + 0.014 * br));
  }
  return defAnim({ name, frames, loop: true, keys, snap: 'soft' });
}

function genWalk(name: string, base: Pose, dir: 1 | -1, frames = 24, amp = 1): AnimDef {
  const keys: PoseKey[] = [];
  const steps = 12;
  const thR = E(base, 'thighR'), thL = E(base, 'thighL');
  const shR = E(base, 'shinR'), shL = E(base, 'shinL');
  const fR = E(base, 'footR'), fL = E(base, 'footL');
  const aR = E(base, 'armR'), aL = E(base, 'armL');
  const faR = E(base, 'forearmR'), faL = E(base, 'forearmL');
  for (let i = 0; i <= steps; i++) {
    const t = Math.round((frames * i) / steps);
    const p = (i / steps) * Math.PI * 2 * dir;
    const s = Math.sin(p), c = Math.cos(p);
    const swing = 26 * amp;
    // front leg leads on sin, back leg opposite
    const legRx = thR[0] - swing * s;
    const legLx = thL[0] + swing * s;
    // knee flexes when the leg swings back / lifts
    const kneeR = shR[0] + Math.max(0, -c * dir) * 26 * amp + Math.max(0, s * dir) * 8;
    const kneeL = shL[0] + Math.max(0, c * dir) * 26 * amp + Math.max(0, -s * dir) * 8;
    keys.push(K(t, {
      thighR: [legRx, thR[1], thR[2] - 2 * s * amp],
      thighL: [legLx, thL[1], thL[2] + 2 * s * amp],
      shinR: [kneeR, shR[1], 0],
      shinL: [kneeL, shL[1], 0],
      footR: [fR[0] - Math.max(0, s * dir) * 14 * amp, fR[1], 0],
      footL: [fL[0] - Math.max(0, -s * dir) * 14 * amp, fL[1], 0],
      hips: off(E(base, 'hips'), 0, 5 * s * amp, 1.5 * s * amp),
      spine: off(E(base, 'spine'), 1.5, -4 * s * amp, 0),
      chest: off(E(base, 'chest'), 1, -3 * s * amp, 0),
      armR: off(aR, 7 * s * amp * dir, 0, 0),
      armL: off(aL, -7 * s * amp * dir, 0, 0),
      forearmR: off(faR, -5 * Math.abs(s) * amp, 0, 0),
      forearmL: off(faL, -5 * Math.abs(s) * amp, 0, 0),
    }, (base.hipsY ?? 0) - 0.012 + 0.02 * Math.abs(c) * amp));
  }
  return defAnim({ name, frames, loop: true, keys });
}

function crouchPose(base: Pose): Pose {
  return {
    ...base,
    hipsY: (base.hipsY ?? 0) - 0.32,
    spine: off(E(base, 'spine'), 10, 0, 0),
    chest: off(E(base, 'chest'), 8, 0, 0),
    head: off(E(base, 'head'), -14, 0, 0),
    thighR: off(E(base, 'thighR'), -32, -6, 0),
    shinR: off(E(base, 'shinR'), 42, 0, 0),
    footR: off(E(base, 'footR'), -18, 0, 0),
    thighL: off(E(base, 'thighL'), -14, 6, 0),
    shinL: off(E(base, 'shinL'), 52, 0, 0),
    footL: off(E(base, 'footL'), -22, 0, 0),
    armR: off(E(base, 'armR'), -8, 0, 4),
    forearmR: off(E(base, 'forearmR'), -10, 0, 0),
    armL: off(E(base, 'armL'), -6, 0, -4),
    forearmL: off(E(base, 'forearmL'), -8, 0, 0),
  };
}

function genCrouch(name: string, base: Pose, frames = 100): AnimDef {
  const c = crouchPose(base);
  const keys: PoseKey[] = [];
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const t = Math.round((frames * i) / steps);
    const p = (i / steps) * Math.PI * 2;
    const br = Math.sin(p);
    keys.push(K(t, {
      chest: off(E(c, 'chest'), 1.1 * br, 0, 0),
      head: off(E(c, 'head'), -0.9 * br, 1.4 * br, 0),
      armR: off(E(c, 'armR'), 1.4 * br, 0, 0),
      armL: off(E(c, 'armL'), -1.4 * br, 0, 0),
    }, (c.hipsY ?? 0) + 0.008 * br));
  }
  return defAnim({ name, frames, loop: true, keys, snap: 'soft' });
}

/* ---------------- shared combat animations ---------------- */

// Light punch — quick lead jab (matches ~15f move)
defAnim({
  name: 'lp', frames: 15, loop: false, snap: 'fast', keys: [
    K(0, { armR: [-42, -8, 10], forearmR: [-72, 12, 0], chest: [3, -12, 0], hips: [0, -15, 0] }),
    K(3, { armR: [-52, -4, 8], forearmR: [-60, 8, 0], chest: [2, -6, 0] }, -0.05),
    K(5, { armR: [-92, -2, 4], forearmR: [-6, 0, 0], handR: [-10, 0, 0], chest: [1, 8, -2], hips: [0, 6, 0], spine: [4, 6, 0], thighR: [-26, -14, 0], shinR: [10, 10, 0] }, -0.07),
    K(8, { armR: [-88, -2, 4], forearmR: [-8, 0, 0], chest: [1, 6, -2], hips: [0, 4, 0] }, -0.06),
    K(11, { armR: [-60, -6, 8], forearmR: [-50, 8, 0], chest: [2, -8, 0], hips: [0, -10, 0] }, -0.06),
    K(15, { armR: [-42, -8, 10], forearmR: [-72, 12, 0], chest: [3, -12, 0], hips: [0, -15, 0] }, -0.06),
  ],
});

// Heavy punch — cross with full torso rotation (~27f)
defAnim({
  name: 'hp', frames: 27, loop: false, snap: 'fast', keys: [
    K(0, { armR: [-42, -8, 10], forearmR: [-72, 12, 0], chest: [3, -12, 0] }),
    K(5, { armR: [22, -30, 18], forearmR: [-100, 20, 0], chest: [2, -34, 3], hips: [0, -30, 0], spine: [4, -20, 0], head: [0, -6, 0] }, -0.09),
    K(8, { armR: [-95, 6, -4], forearmR: [-4, 0, 0], handR: [-8, 0, 0], chest: [2, 26, -5], hips: [0, 22, 0], spine: [6, 16, 0], head: [0, 34, 0], thighR: [-30, -8, 0], shinR: [16, 6, 0], thighL: [24, 24, 0], shinL: [22, -6, 0], armL: [-16, 20, -18], forearmL: [-95, -10, 0] }, -0.1),
    K(12, { armR: [-92, 6, -4], forearmR: [-6, 0, 0], chest: [2, 22, -4], hips: [0, 18, 0] }, -0.09),
    K(18, { armR: [-64, -2, 6], forearmR: [-44, 6, 0], chest: [3, -2, 0], hips: [0, -4, 0], spine: [5, -4, 0] }, -0.07),
    K(27, { armR: [-42, -8, 10], forearmR: [-72, 12, 0], chest: [3, -12, 0], hips: [0, -15, 0] }, -0.06),
  ],
});

// Light kick — fast front-leg roundhouse (~20f)
defAnim({
  name: 'lk', frames: 20, loop: false, snap: 'fast', keys: [
    K(0, { thighR: [-22, -14, 0], shinR: [24, 10, 0] }),
    K(4, { thighR: [-58, -22, 4], shinR: [66, 8, 0], chest: [4, -18, 0], armR: [-30, -10, 16], forearmR: [-80, 10, 0] }, -0.08),
    K(7, { thighR: [-74, -34, 10], shinR: [16, 6, 0], footR: [0, -14, 0], chest: [6, -30, 4], hips: [0, -26, 6], armL: [-40, 18, -22], forearmL: [-60, -14, 0], armR: [10, -14, 22], forearmR: [-40, 8, 0] }, -0.1),
    K(10, { thighR: [-70, -30, 8], shinR: [22, 6, 0], chest: [5, -26, 3], hips: [0, -22, 5] }, -0.09),
    K(14, { thighR: [-40, -18, 2], shinR: [44, 8, 0], chest: [4, -16, 0] }, -0.07),
    K(20, { thighR: [-22, -14, 0], shinR: [24, 10, 0], chest: [3, -12, 0] }, -0.06),
  ],
});

// Heavy kick — spinning hurricane kick, two swing windows (~36f)
defAnim({
  name: 'hk', frames: 36, loop: false, snap: 'fast', keys: [
    K(0, { hips: [0, -15, 0], chest: [3, -12, 0], thighR: [-22, -14, 0], shinR: [24, 10, 0] }),
    K(6, { hips: [0, -46, 0], chest: [6, -40, 0], head: [0, -14, 0], armR: [16, -20, 24], forearmR: [-50, 10, 0], armL: [-30, 22, -20], forearmL: [-70, -12, 0], thighR: [-40, -24, 4], shinR: [58, 8, 0] }, -0.1),
    K(11, { hips: [0, 62, 8], chest: [10, 60, 6], head: [-4, 40, 0], armR: [34, -30, 30], forearmR: [-34, 6, 0], armL: [-52, 30, -26], forearmL: [-46, -8, 0], thighR: [-92, 26, 14], shinR: [8, 4, 0], footR: [4, -10, 0], thighL: [16, 10, 0], shinL: [22, 0, 0] }, -0.06),
    K(16, { hips: [0, 116, 10], chest: [12, 110, 8], head: [-6, 86, 0], armR: [44, -34, 34], forearmR: [-28, 4, 0], armL: [-60, 34, -30], forearmL: [-40, -6, 0], thighR: [-96, 44, 18], shinR: [4, 2, 0], footR: [6, -14, 0] }, -0.04),
    K(22, { hips: [0, 150, 6], chest: [8, 140, 4], head: [-4, 120, 0], thighR: [-70, 50, 12], shinR: [34, 4, 0], armR: [30, -26, 26], forearmR: [-46, 8, 0], armL: [-44, 26, -22], forearmL: [-60, -8, 0] }, -0.07),
    K(28, { hips: [0, -40, 0], chest: [5, -30, 0], head: [0, 10, 0], thighR: [-34, -16, 2], shinR: [40, 8, 0], armR: [-36, -10, 12], forearmR: [-66, 10, 0], armL: [-26, 12, -14], forearmL: [-76, -14, 0] }, -0.09),
    K(36, { hips: [0, -15, 0], chest: [3, -12, 0], head: [-2, 25, 0], thighR: [-22, -14, 0], shinR: [24, 10, 0], armR: [-42, -8, 10], forearmR: [-72, 12, 0], armL: [-28, 10, -12], forearmL: [-78, -15, 0] }, -0.06),
  ],
});

// Crouching jab (~15f)
defAnim({
  name: 'crouchLp', frames: 15, loop: false, snap: 'fast', keys: [
    K(0, { armR: [-50, -8, 14], forearmR: [-82, 12, 0], chest: [11, -12, 0] }, -0.38),
    K(4, { armR: [-86, -2, 6], forearmR: [-14, 4, 0], chest: [12, 2, -2], head: [-14, 16, 0] }, -0.39),
    K(7, { armR: [-82, -2, 6], forearmR: [-18, 4, 0], chest: [12, 0, -2] }, -0.385),
    K(11, { armR: [-60, -6, 12], forearmR: [-60, 10, 0], chest: [11, -8, 0] }, -0.38),
    K(15, { armR: [-50, -8, 14], forearmR: [-82, 12, 0], chest: [11, -12, 0] }, -0.38),
  ],
});

// Crouching hammer (~25f)
defAnim({
  name: 'crouchHp', frames: 25, loop: false, snap: 'fast', keys: [
    K(0, { armR: [-50, -8, 14], forearmR: [-82, 12, 0] }, -0.38),
    K(5, { armR: [30, -24, 20], forearmR: [-110, 16, 0], chest: [14, -30, 4], hips: [0, -26, 0] }, -0.42),
    K(8, { armR: [-104, 8, -6], forearmR: [-10, 0, 0], chest: [16, 20, -6], hips: [0, 14, 0], head: [-18, 30, 0], armL: [-20, 16, -18], forearmL: [-100, -10, 0] }, -0.36),
    K(12, { armR: [-98, 6, -4], forearmR: [-14, 0, 0], chest: [15, 14, -4] }, -0.37),
    K(18, { armR: [-66, -4, 8], forearmR: [-56, 8, 0], chest: [12, -4, 0] }, -0.38),
    K(25, { armR: [-50, -8, 14], forearmR: [-82, 12, 0], chest: [11, -12, 0] }, -0.38),
  ],
});

// Crouching light kick (~19f)
defAnim({
  name: 'crouchLk', frames: 19, loop: false, snap: 'fast', keys: [
    K(0, { thighR: [-54, -20, 4], shinR: [66, 8, 0] }, -0.38),
    K(5, { thighR: [-70, -30, 8], shinR: [40, 6, 0], footR: [-10, -8, 0], chest: [13, -20, 2] }, -0.4),
    K(8, { thighR: [-76, -36, 10], shinR: [14, 4, 0], footR: [-14, -12, 0], chest: [14, -26, 3], armL: [-24, 14, -20], forearmL: [-90, -12, 0] }, -0.42),
    K(12, { thighR: [-60, -24, 6], shinR: [52, 8, 0] }, -0.39),
    K(19, { thighR: [-54, -20, 4], shinR: [66, 8, 0], chest: [11, -12, 0] }, -0.38),
  ],
});

// Sweep (~35f)
defAnim({
  name: 'crouchHk', frames: 35, loop: false, snap: 'fast', keys: [
    K(0, { thighR: [-54, -20, 4], shinR: [66, 8, 0], thighL: [10, 24, 0], shinL: [86, -8, 0] }, -0.38),
    K(7, { hips: [0, -40, 0], chest: [16, -34, 0], head: [-20, 14, 0], thighR: [-58, -24, 6], shinR: [70, 8, 0], armR: [-20, -16, 20], forearmR: [-70, 10, 0] }, -0.46),
    K(10, { hips: [0, 30, -6], chest: [20, 40, -4], head: [-24, 60, 0], thighL: [-74, 30, 10], shinL: [6, 4, 0], footL: [-16, 10, 0], thighR: [-46, -30, 8], shinR: [86, 6, 0], armL: [-70, 24, -30], forearmL: [-30, -10, 0], armR: [24, -22, 26], forearmR: [-40, 8, 0] }, -0.5),
    K(14, { hips: [0, 96, -8], chest: [22, 100, -6], head: [-26, 120, 0], thighL: [-80, 44, 12], shinL: [4, 2, 0], footL: [-18, 12, 0], thighR: [-40, -34, 10], shinR: [92, 4, 0], armL: [-80, 26, -34], forearmL: [-24, -8, 0] }, -0.52),
    K(20, { hips: [0, 130, -4], chest: [18, 130, -4], head: [-22, 150, 0], thighL: [-66, 40, 8], shinL: [30, 4, 0], thighR: [-36, -30, 8], shinR: [90, 6, 0] }, -0.5),
    K(26, { hips: [0, 40, 0], chest: [14, 40, 0], head: [-18, 60, 0], thighL: [-20, 30, 4], shinL: [70, -4, 0], thighR: [-48, -22, 6], shinR: [74, 8, 0] }, -0.44),
    K(35, { hips: [0, -15, 0], chest: [11, -12, 0], head: [-14, 25, 0], thighR: [-54, -20, 4], shinR: [66, 8, 0], thighL: [10, 24, 0], shinL: [86, -8, 0], armR: [-50, -8, 14], forearmR: [-82, 12, 0], armL: [-28, 10, -12], forearmL: [-78, -15, 0] }, -0.38),
  ],
});

// Jumping light punch (~20f, airborne)
defAnim({
  name: 'jumpLp', frames: 20, loop: false, snap: 'fast', keys: [
    K(0, { thighR: [-56, -10, 4], shinR: [70, 6, 0], thighL: [26, 12, 0], shinL: [40, -4, 0], armR: [-46, -8, 12], forearmR: [-76, 10, 0] }, -0.02),
    K(5, { armR: [-92, -2, 4], forearmR: [-8, 0, 0], chest: [2, 10, -3], head: [0, 18, 0], thighR: [-62, -12, 6], shinR: [62, 6, 0] }, -0.02),
    K(10, { armR: [-88, -2, 4], forearmR: [-10, 0, 0], chest: [2, 8, -2] }, -0.02),
    K(15, { armR: [-60, -6, 10], forearmR: [-56, 8, 0], chest: [3, -6, 0] }, -0.02),
    K(20, { armR: [-46, -8, 12], forearmR: [-76, 10, 0], chest: [3, -10, 0] }, -0.02),
  ],
});

// Jumping heavy kick — dive kick (~24f, airborne)
defAnim({
  name: 'jumpHk', frames: 24, loop: false, snap: 'fast', keys: [
    K(0, { thighR: [-64, -12, 6], shinR: [76, 6, 0], thighL: [30, 14, 0], shinL: [34, -4, 0], chest: [8, -14, 0], armL: [-40, 16, -20], forearmL: [-70, -12, 0] }, -0.02),
    K(5, { thighR: [-86, -18, 10], shinR: [40, 6, 0], chest: [12, -24, 4], head: [-6, 10, 0], armR: [16, -16, 22], forearmR: [-46, 8, 0], armL: [-56, 22, -26], forearmL: [-50, -10, 0] }, -0.04),
    K(8, { thighR: [-104, -22, 12], shinR: [8, 4, 0], footR: [10, -12, 0], chest: [-8, -30, 6], head: [-12, 4, 0], thighL: [44, 16, 0], shinL: [24, -4, 0], armR: [30, -20, 28], forearmR: [-30, 6, 0], armL: [-70, 26, -30], forearmL: [-36, -8, 0] }, -0.05),
    K(14, { thighR: [-100, -20, 12], shinR: [10, 4, 0], chest: [-6, -26, 5] }, -0.04),
    K(19, { thighR: [-70, -14, 8], shinR: [54, 6, 0], chest: [6, -16, 2] }, -0.03),
    K(24, { thighR: [-56, -10, 4], shinR: [70, 6, 0], chest: [8, -12, 0] }, -0.02),
  ],
});

/* ---------------- defensive & air ---------------- */

defAnim({
  name: 'blockStand', frames: 4, loop: false, snap: 'fast', keys: [
    K(0, { armR: [-58, 12, -14], forearmR: [-92, -14, 0], armL: [-50, -8, 12], forearmL: [-100, 16, 0], chest: [6, -18, 0], head: [4, -8, 0], hips: [0, -20, 0], thighR: [-18, -14, 0], shinR: [26, 8, 0], thighL: [22, 20, 0], shinL: [30, -6, 0] }, -0.09),
    K(4, { armR: [-58, 12, -14], forearmR: [-92, -14, 0], armL: [-50, -8, 12], forearmL: [-100, 16, 0], chest: [6, -18, 0], head: [4, -8, 0] }, -0.09),
  ],
});

defAnim({
  name: 'blockCrouch', frames: 4, loop: false, snap: 'fast', keys: [
    K(0, { armR: [-64, 10, -12], forearmR: [-96, -12, 0], armL: [-56, -6, 10], forearmL: [-104, 14, 0], chest: [16, -16, 0], head: [10, -6, 0], hips: [0, -18, 0], thighR: [-56, -18, 4], shinR: [70, 6, 0], thighL: [8, 24, 0], shinL: [84, -8, 0], footL: [24, 40, 0] }, -0.4),
    K(4, { armR: [-64, 10, -12], forearmR: [-96, -12, 0], armL: [-56, -6, 10], forearmL: [-104, 14, 0], chest: [16, -16, 0] }, -0.4),
  ],
});

defAnim({
  name: 'jumpAscend', frames: 20, loop: false, keys: [
    K(0, { thighR: [-46, -10, 4], shinR: [58, 6, 0], thighL: [30, 14, 0], shinL: [44, -4, 0], footL: [18, 36, 0], armR: [-50, -8, 14], forearmR: [-80, 10, 0], armL: [-34, 12, -14], forearmL: [-84, -16, 0], chest: [4, -14, 0], head: [-4, 26, 0] }, -0.04),
    K(20, { thighR: [-52, -10, 4], shinR: [64, 6, 0], thighL: [34, 14, 0], shinL: [48, -4, 0] }, -0.05),
  ],
});

defAnim({
  name: 'jumpFall', frames: 20, loop: false, keys: [
    K(0, { thighR: [-40, -12, 4], shinR: [40, 6, 0], thighL: [22, 16, 0], shinL: [30, -4, 0], footR: [-14, 10, 0], footL: [10, 40, 0], armR: [-46, -8, 14], forearmR: [-78, 10, 0], armL: [-30, 12, -14], forearmL: [-82, -16, 0], chest: [6, -14, 0] }, -0.04),
    K(20, { thighR: [-34, -12, 4], shinR: [30, 6, 0], thighL: [18, 16, 0], shinL: [24, -4, 0] }, -0.04),
  ],
});

defAnim({
  name: 'land', frames: 10, loop: false, snap: 'fast', keys: [
    K(0, { thighR: [-46, -16, 4], shinR: [62, 8, 0], thighL: [14, 22, 0], shinL: [56, -6, 0], chest: [12, -14, 0], head: [-12, 24, 0], armR: [-40, -8, 14], forearmR: [-84, 10, 0], armL: [-26, 10, -14], forearmL: [-88, -14, 0] }, -0.24),
    K(5, { thighR: [-38, -15, 2], shinR: [50, 8, 0], thighL: [16, 20, 0], shinL: [46, -6, 0], chest: [9, -13, 0] }, -0.17),
    K(10, { thighR: [-22, -14, 0], shinR: [24, 10, 0], chest: [3, -12, 0] }, -0.06),
  ],
});

defAnim({
  name: 'dashF', frames: 16, loop: false, keys: [
    K(0, { chest: [-22, -10, 0], head: [16, 20, 0], spine: [-12, -6, 0], armR: [26, -12, 18], forearmR: [-52, 8, 0], armL: [34, 14, -18], forearmL: [-46, -10, 0], thighR: [-46, -14, 4], shinR: [30, 8, 0], thighL: [34, 20, 0], shinL: [16, -6, 0], footL: [12, 40, 0] }, -0.12),
    K(8, { chest: [-26, -8, 0], head: [18, 18, 0], armR: [32, -12, 20], forearmR: [-46, 8, 0], armL: [40, 14, -20], forearmL: [-40, -10, 0], thighR: [-52, -14, 4], shinR: [26, 8, 0], thighL: [40, 20, 0], shinL: [12, -6, 0] }, -0.13),
    K(16, { chest: [-10, -12, 0], head: [4, 24, 0], armR: [-30, -8, 10], forearmR: [-66, 12, 0], armL: [-24, 10, -12], forearmL: [-74, -15, 0], thighR: [-26, -14, 0], shinR: [24, 10, 0], thighL: [20, 18, 0], shinL: [28, -8, 0] }, -0.07),
  ],
});

defAnim({
  name: 'dashB', frames: 16, loop: false, keys: [
    K(0, { chest: [14, -16, 0], head: [-8, 28, 0], spine: [8, -8, 0], armR: [-52, -8, 12], forearmR: [-84, 12, 0], armL: [-40, 12, -14], forearmL: [-92, -16, 0], thighR: [-34, -14, 2], shinR: [40, 8, 0], thighL: [30, 20, 0], shinL: [34, -6, 0], footL: [20, 42, 0] }, -0.1),
    K(8, { chest: [16, -18, 0], head: [-10, 30, 0], armR: [-54, -8, 12], forearmR: [-86, 12, 0], armL: [-42, 12, -14], forearmL: [-94, -16, 0], thighR: [-30, -14, 2], shinR: [44, 8, 0], thighL: [34, 20, 0], shinL: [30, -6, 0] }, -0.11),
    K(16, { chest: [3, -12, 0], head: [-2, 25, 0], armR: [-42, -8, 10], forearmR: [-72, 12, 0], armL: [-28, 10, -12], forearmL: [-78, -15, 0], thighR: [-22, -14, 0], shinR: [24, 10, 0], thighL: [18, 18, 0], shinL: [30, -8, 0] }, -0.06),
  ],
});

/* ---------------- hit reactions ---------------- */

defAnim({
  name: 'hitMid', frames: 16, loop: false, snap: 'fast', keys: [
    K(0, { chest: [3, -12, 0], head: [-2, 25, 0], armR: [-42, -8, 10], forearmR: [-72, 12, 0] }),
    K(3, { chest: [14, -26, 5], head: [10, -6, 8], spine: [10, -14, 3], hips: [0, -24, 2], armR: [16, -18, 20], forearmR: [-46, 8, 0], armL: [-52, 18, -22], forearmL: [-56, -12, 0], thighR: [-16, -14, 0], shinR: [20, 10, 0] }, -0.09),
    K(8, { chest: [10, -22, 4], head: [8, 0, 6], spine: [8, -12, 2], armR: [6, -14, 16], forearmR: [-56, 10, 0] }, -0.08),
    K(16, { chest: [3, -12, 0], head: [-2, 25, 0], armR: [-42, -8, 10], forearmR: [-72, 12, 0], armL: [-28, 10, -12], forearmL: [-78, -15, 0] }, -0.06),
  ],
});

defAnim({
  name: 'hitLow', frames: 16, loop: false, snap: 'fast', keys: [
    K(0, { chest: [3, -12, 0] }, -0.06),
    K(3, { spine: [22, -8, 4], chest: [24, -14, 6], head: [22, 10, 0], neck: [12, 0, 0], armR: [-16, -10, 16], forearmR: [-80, 8, 0], armL: [-10, 12, -16], forearmL: [-84, -12, 0], thighR: [-44, -16, 4], shinR: [56, 8, 0], thighL: [14, 22, 0], shinL: [50, -6, 0] }, -0.3),
    K(8, { spine: [16, -8, 3], chest: [18, -13, 4], head: [16, 14, 0], thighR: [-38, -15, 3], shinR: [48, 8, 0] }, -0.24),
    K(16, { spine: [5, -8, 0], chest: [3, -12, 0], head: [-2, 25, 0] }, -0.06),
  ],
});

defAnim({
  name: 'hitHigh', frames: 16, loop: false, snap: 'fast', keys: [
    K(0, { chest: [3, -12, 0], head: [-2, 25, 0] }, -0.06),
    K(3, { chest: [-12, -16, -5], head: [-30, 30, -10], neck: [-16, 0, 0], spine: [-8, -8, -3], armR: [-64, -12, 16], forearmR: [-58, 10, 0], armL: [-52, 14, -18], forearmL: [-66, -14, 0] }, -0.02),
    K(8, { chest: [-6, -14, -3], head: [-18, 28, -6], armR: [-52, -10, 13], forearmR: [-66, 11, 0] }, -0.04),
    K(16, { chest: [3, -12, 0], head: [-2, 25, 0], armR: [-42, -8, 10], forearmR: [-72, 12, 0] }, -0.06),
  ],
});

defAnim({
  name: 'airHit', frames: 24, loop: false, snap: 'fast', keys: [
    K(0, { chest: [16, -10, 8], head: [14, 12, 0], spine: [12, -6, 4], armR: [-70, -20, 26], forearmR: [-40, 10, 0], armL: [-58, 22, -24], forearmL: [-48, -12, 0], thighR: [-40, -14, 6], shinR: [52, 6, 0], thighL: [26, 16, -4], shinL: [38, -6, 0] }, -0.04),
    K(24, { chest: [12, -8, 6], head: [10, 14, 0], armR: [-62, -18, 22], forearmR: [-46, 8, 0], armL: [-52, 20, -20], forearmL: [-52, -10, 0] }, -0.04),
  ],
});

defAnim({
  name: 'launched', frames: 40, loop: true, keys: [
    K(0, { chest: [-20, 0, 0], head: [-24, 0, 0], spine: [-14, 0, 0], hips: [0, 0, 0], armR: [-150, 0, 24], forearmR: [-24, 8, 0], armL: [-130, 0, -26], forearmL: [-30, -8, 0], thighR: [-34, -8, 6], shinR: [40, 4, 0], thighL: [24, 8, -6], shinL: [30, -4, 0] }, -0.06),
    K(10, { chest: [40, 90, 0], head: [30, 90, 0], spine: [30, 90, 0], hips: [0, 90, 0], armR: [-110, 20, 30], forearmR: [-40, 6, 0], armL: [-100, -20, -30], forearmL: [-46, -6, 0], thighR: [-20, 0, 8], shinR: [30, 2, 0], thighL: [30, 0, -8], shinL: [22, -2, 0] }, -0.06),
    K(20, { chest: [100, 180, 0], head: [90, 180, 0], spine: [80, 180, 0], hips: [0, 180, 0], armR: [-60, 30, 26], forearmR: [-56, 4, 0], armL: [-56, -30, -26], forearmL: [-60, -4, 0], thighR: [-10, 0, 6], shinR: [20, 2, 0], thighL: [36, 0, -6], shinL: [16, -2, 0] }, -0.06),
    K(30, { chest: [40, 270, 0], head: [30, 270, 0], spine: [30, 270, 0], hips: [0, 270, 0], armR: [-110, 20, 30], forearmR: [-40, 6, 0], armL: [-100, -20, -30], forearmL: [-46, -6, 0], thighR: [-20, 0, 8], shinR: [30, 2, 0], thighL: [30, 0, -8], shinL: [22, -2, 0] }, -0.06),
    K(40, { chest: [-20, 360, 0], head: [-24, 360, 0], spine: [-14, 360, 0], hips: [0, 360, 0], armR: [-150, 0, 24], forearmR: [-24, 8, 0], armL: [-130, 0, -26], forearmL: [-30, -8, 0], thighR: [-34, -8, 6], shinR: [40, 4, 0], thighL: [24, 8, -6], shinL: [30, -4, 0] }, -0.06),
  ],
});

/* ---------------- knockdown / wakeup / KO ---------------- */

defAnim({
  name: 'knockdown', frames: 70, loop: false, keys: [
    K(0, { chest: [-16, 0, 0], head: [-20, 0, 0], spine: [-10, 0, 0], armR: [-140, 0, 22], forearmR: [-30, 8, 0], armL: [-120, 0, -24], forearmL: [-36, -8, 0], thighR: [-40, -8, 6], shinR: [44, 4, 0], thighL: [26, 8, -6], shinL: [30, -4, 0] }, -0.1),
    K(12, { chest: [30, 0, 0], head: [24, 0, 0], spine: [22, 0, 0], armR: [-160, 0, 26], forearmR: [-20, 8, 0], armL: [-150, 0, -26], forearmL: [-24, -8, 0], thighR: [-56, -8, 6], shinR: [30, 4, 0], thighL: [40, 8, -6], shinL: [20, -4, 0] }, -0.4),
    K(20, { chest: [62, 0, 0], head: [40, 0, 0], spine: [50, 0, 0], neck: [20, 0, 0], armR: [-168, 0, 30], forearmR: [-14, 8, 0], armL: [-160, 0, -30], forearmL: [-18, -8, 0], thighR: [-40, -6, 6], shinR: [16, 4, 0], thighL: [30, 6, -6], shinL: [10, -4, 0], footR: [8, 8, 0], footL: [6, 30, 0] }, -0.66),
    K(26, { chest: [70, 0, 0], spine: [56, 0, 0], head: [44, 0, 0], thighR: [-34, -6, 6], shinR: [12, 4, 0], thighL: [26, 6, -6], shinL: [8, -4, 0] }, -0.72),
    K(46, { chest: [70, 0, 0], spine: [56, 0, 0], head: [46, 6, 0], armR: [-166, 0, 28], forearmR: [-12, 8, 0], armL: [-158, 0, -28], forearmL: [-16, -8, 0] }, -0.73),
    K(70, { chest: [70, 0, 0], spine: [56, 0, 0], head: [46, 6, 0] }, -0.73),
  ],
});

defAnim({
  name: 'getup', frames: 20, loop: false, keys: [
    K(0, { chest: [70, 0, 0], spine: [56, 0, 0], head: [44, 0, 0], armR: [-168, 0, 30], forearmR: [-14, 8, 0], armL: [-160, 0, -30], forearmL: [-18, -8, 0], thighR: [-34, -6, 6], shinR: [12, 4, 0], thighL: [26, 6, -6], shinL: [8, -4, 0] }, -0.72),
    K(6, { chest: [46, -30, 0], spine: [38, -24, 0], head: [30, -10, 0], armL: [-70, 10, -20], forearmL: [-40, -8, 0], armR: [-140, 0, 24], forearmR: [-30, 8, 0], thighR: [-50, -8, 6], shinR: [46, 4, 0], thighL: [30, 10, -6], shinL: [40, -4, 0] }, -0.56),
    K(12, { chest: [22, -18, 0], spine: [18, -14, 0], head: [12, 6, 0], armL: [-30, 12, -16], forearmL: [-80, -10, 0], armR: [-40, -8, 14], forearmR: [-70, 10, 0], thighR: [-76, -10, 4], shinR: [78, 6, 0], thighL: [-30, 14, -4], shinL: [52, -4, 0], footL: [-10, 20, 0] }, -0.42),
    K(17, { chest: [10, -14, 0], spine: [8, -10, 0], head: [-4, 18, 0], thighR: [-46, -12, 2], shinR: [54, 8, 0], thighL: [10, 20, 0], shinL: [40, -6, 0], armR: [-44, -8, 12], forearmR: [-76, 12, 0], armL: [-26, 10, -12], forearmL: [-80, -14, 0] }, -0.2),
    K(20, { chest: [3, -12, 0], spine: [5, -8, 0], head: [-2, 25, 0], thighR: [-22, -14, 0], shinR: [24, 10, 0], thighL: [18, 18, 0], shinL: [30, -8, 0], armR: [-42, -8, 10], forearmR: [-72, 12, 0], armL: [-28, 10, -12], forearmL: [-78, -15, 0] }, -0.06),
  ],
});

defAnim({
  name: 'ko', frames: 120, loop: false, keys: [
    K(0, { chest: [-16, 0, 0], head: [-22, 0, 0], spine: [-10, 0, 0], armR: [-146, 0, 24], forearmR: [-26, 8, 0], armL: [-126, 0, -26], forearmL: [-32, -8, 0], thighR: [-44, -8, 6], shinR: [40, 4, 0], thighL: [30, 8, -6], shinL: [26, -4, 0] }, -0.12),
    K(14, { chest: [40, 0, 0], head: [30, 0, 0], spine: [30, 0, 0], armR: [-166, 0, 30], forearmR: [-16, 8, 0], armL: [-156, 0, -30], forearmL: [-20, -8, 0], thighR: [-50, -8, 6], shinR: [22, 4, 0], thighL: [34, 8, -6], shinL: [14, -4, 0] }, -0.5),
    K(24, { chest: [72, 0, 0], head: [48, -10, 0], spine: [58, 0, 0], neck: [22, 0, 0], armR: [-172, 0, 34], forearmR: [-10, 8, 0], armL: [-164, 0, -34], forearmL: [-12, -8, 0], thighR: [-36, -6, 6], shinR: [10, 4, 0], thighL: [28, 6, -6], shinL: [6, -4, 0], footR: [10, 8, 0], footL: [8, 32, 0] }, -0.7),
    K(30, { chest: [74, 0, 0], spine: [60, 0, 0], head: [52, -12, 0] }, -0.74),
    K(60, { chest: [74, 0, 0], spine: [60, 0, 0], head: [54, -14, 4], armR: [-174, 0, 36], forearmR: [-8, 8, 0] }, -0.75),
    K(120, { chest: [74, 0, 0], spine: [60, 0, 0], head: [54, -14, 4] }, -0.75),
  ],
});

defAnim({
  name: 'defeat', frames: 40, loop: true, snap: 'soft', keys: [
    K(0, { hips: [0, -8, 0], spine: [26, -4, 0], chest: [26, -6, 0], neck: [12, 0, 0], head: [30, -8, 0], armR: [8, -6, 10], forearmR: [-30, 6, 0], armL: [10, 6, -10], forearmL: [-28, -6, 0], thighR: [-82, -8, 4], shinR: [84, 4, 0], footR: [6, 12, 0], thighL: [-38, 12, -4], shinL: [56, -4, 0], footL: [-14, 22, 0], shoulderL: [0, 0, 6], shoulderR: [0, 0, -6] }, -0.5),
    K(20, { spine: [28, -4, 0], chest: [28, -6, 0], head: [33, -8, 0], armR: [10, -6, 11], forearmR: [-32, 6, 0] }, -0.515),
    K(40, { spine: [26, -4, 0], chest: [26, -6, 0], head: [30, -8, 0] }, -0.5),
  ],
});

/* ---------------- specials & supers ---------------- */

// RYDEN — Crimson Dragon Strike (46f): charge at hip, lunging strike
defAnim({
  name: 'specialRyden', frames: 46, loop: false, snap: 'fast', keys: [
    K(0, { chest: [8, -14, 0], head: [-6, 24, 0], armR: [16, -18, 16], forearmR: [-96, 14, 0], handR: [0, 0, 0], armL: [10, 14, -14], forearmL: [-100, -12, 0], thighR: [-34, -14, 2], shinR: [40, 8, 0], thighL: [24, 20, 0], shinL: [36, -6, 0] }, -0.16),
    K(6, { chest: [12, -20, 2], head: [-10, 18, 0], armR: [24, -22, 18], forearmR: [-104, 16, 0], armL: [16, 18, -16], forearmL: [-108, -14, 0], spine: [8, -12, 0] }, -0.22),
    K(10, { chest: [14, -24, 3], head: [-12, 14, 0], armR: [28, -24, 20], forearmR: [-110, 18, 0], armL: [18, 20, -18], forearmL: [-112, -16, 0] }, -0.25),
    K(13, { chest: [4, 20, -6], head: [-4, 34, 0], spine: [2, 14, 0], hips: [0, 18, 0], armR: [-98, 8, -6], forearmR: [-6, 0, 0], handR: [-14, 0, 0], armL: [-24, 20, -22], forearmL: [-86, -14, 0], thighR: [-58, -8, 4], shinR: [16, 4, 0], thighL: [42, 22, 0], shinL: [12, -6, 0], footL: [14, 40, 0] }, -0.16),
    K(18, { chest: [2, 26, -8], head: [-4, 38, 0], armR: [-100, 10, -6], forearmR: [-4, 0, 0], thighR: [-64, -8, 4], shinR: [10, 4, 0], thighL: [48, 24, 0], shinL: [8, -6, 0] }, -0.18),
    K(24, { chest: [4, 18, -5], head: [-4, 32, 0], armR: [-92, 8, -5], forearmR: [-10, 0, 0], thighR: [-52, -8, 4], shinR: [22, 4, 0], thighL: [40, 22, 0], shinL: [16, -6, 0] }, -0.15),
    K(32, { chest: [6, 0, -2], head: [-3, 28, 0], armR: [-66, -4, 4], forearmR: [-46, 6, 0], thighR: [-38, -12, 2], shinR: [32, 6, 0], thighL: [30, 20, 0], shinL: [26, -6, 0] }, -0.1),
    K(46, { chest: [3, -12, 0], head: [-2, 25, 0], armR: [-42, -8, 10], forearmR: [-72, 12, 0], armL: [-28, 10, -12], forearmL: [-78, -15, 0], thighR: [-22, -14, 0], shinR: [24, 10, 0], thighL: [18, 18, 0], shinL: [30, -8, 0] }, -0.06),
  ],
});

// KAITO — Thunder Breaker (64f): dash, 3 alternating kicks, rising uppercut
defAnim({
  name: 'specialKaito', frames: 64, loop: false, snap: 'fast', keys: [
    // charge — arms crossed gathering voltage
    K(0, { chest: [10, -16, 0], head: [-8, 30, 0], armR: [-30, -24, 22], forearmR: [-104, 16, 0], armL: [-26, 22, -20], forearmL: [-108, -14, 0], thighR: [-30, -18, 2], shinR: [38, 8, 0], thighL: [26, 24, 0], shinL: [34, -6, 0] }, -0.14),
    K(6, { chest: [14, -20, 0], head: [-12, 24, 0], armR: [-34, -26, 24], forearmR: [-110, 18, 0], armL: [-30, 24, -22], forearmL: [-114, -16, 0] }, -0.2),
    // dash + kick 1 (right)
    K(9, { chest: [-18, -10, 0], head: [14, 30, 0], spine: [-10, -6, 0], armR: [30, -16, 24], forearmR: [-46, 8, 0], armL: [38, 18, -22], forearmL: [-40, -8, 0], thighR: [-50, -14, 4], shinR: [44, 6, 0], thighL: [40, 20, 0], shinL: [14, -6, 0] }, -0.14),
    K(11, { thighR: [-84, -20, 8], shinR: [22, 4, 0], footR: [-8, -10, 0], chest: [-10, -20, 4], head: [8, 20, 0], armL: [-52, 22, -26], forearmL: [-50, -10, 0] }, -0.1),
    K(14, { thighR: [-60, -16, 6], shinR: [52, 6, 0], chest: [0, -16, 2] }, -0.12),
    // kick 2 (left)
    K(17, { thighL: [-80, 22, -8], shinL: [26, -4, 0], footL: [-6, 30, 0], thighR: [-24, -12, 2], shinR: [40, 6, 0], chest: [-6, 22, -4], head: [4, 40, 0], hips: [0, 20, 0], armR: [-46, -10, 18], forearmR: [-66, 10, 0] }, -0.1),
    K(20, { thighL: [-58, 20, -6], shinL: [50, -4, 0], chest: [2, 16, -2] }, -0.12),
    // kick 3 (right, higher)
    K(23, { thighR: [-92, -24, 10], shinR: [16, 4, 0], footR: [-10, -12, 0], thighL: [18, 18, 0], shinL: [30, -6, 0], chest: [-12, -26, 6], head: [10, 16, 0], hips: [0, -28, 6], armL: [-58, 24, -28], forearmL: [-44, -10, 0], armR: [24, -18, 24], forearmR: [-40, 8, 0] }, -0.08),
    K(27, { thighR: [-66, -18, 6], shinR: [44, 6, 0], chest: [0, -18, 2] }, -0.11),
    // uppercut finisher
    K(30, { chest: [14, -10, 4], head: [-10, 20, 0], armR: [34, -14, 16], forearmR: [-88, 12, 0], thighR: [-44, -14, 2], shinR: [58, 8, 0], thighL: [24, 20, 0], shinL: [40, -6, 0] }, -0.22),
    K(33, { chest: [-8, 14, -6], head: [-14, 30, 0], spine: [-4, 10, 0], armR: [-158, 8, -8], forearmR: [-8, 0, 0], handR: [-12, 0, 0], armL: [-30, 18, -20], forearmL: [-80, -12, 0], thighR: [-58, -10, 4], shinR: [22, 4, 0], thighL: [34, 20, 0], shinL: [14, -6, 0], footL: [22, 40, 0] }, -0.02),
    K(37, { chest: [-12, 18, -8], head: [-18, 34, 0], armR: [-168, 10, -10], forearmR: [-4, 0, 0], thighR: [-50, -10, 4], shinR: [16, 4, 0] }, 0.04),
    // landing & recovery
    K(44, { chest: [8, 8, -2], head: [-8, 28, 0], armR: [-90, 0, 4], forearmR: [-30, 6, 0], thighR: [-40, -12, 2], shinR: [44, 6, 0], thighL: [22, 20, 0], shinL: [36, -6, 0] }, -0.14),
    K(50, { chest: [10, 2, 0], head: [-8, 26, 0], armR: [-60, -6, 8], forearmR: [-56, 10, 0], thighR: [-32, -14, 2], shinR: [38, 8, 0] }, -0.12),
    K(64, { chest: [4, -14, 0], head: [-3, 42, 0], armR: [-34, -14, 12], forearmR: [-62, 18, 0], armL: [-22, 14, -14], forearmL: [-85, -20, 0], thighR: [-26, -20, 0], shinR: [28, 14, 0], thighL: [24, 26, 0], shinL: [34, -10, 0] }, -0.08),
  ],
});

/* ---------------- shared special-move animations ---------------- */

// Projectile cast (38f): gather at hip → double palm thrust → recover
defAnim({
  name: 'specialCast', frames: 38, loop: false, snap: 'fast', keys: [
    K(0, { chest: [8, -14, 0], head: [-6, 24, 0], armR: [16, -18, 16], forearmR: [-96, 14, 0], armL: [10, 14, -14], forearmL: [-100, -12, 0], thighR: [-30, -14, 2], shinR: [38, 8, 0], thighL: [24, 20, 0], shinL: [34, -6, 0] }, -0.14),
    K(8, { chest: [12, -20, 2], head: [-10, 18, 0], armR: [24, -22, 18], forearmR: [-106, 16, 0], armL: [16, 18, -16], forearmL: [-110, -14, 0], spine: [8, -12, 0] }, -0.2),
    K(14, { chest: [13, -22, 2], head: [-11, 16, 0], armR: [26, -24, 20], forearmR: [-110, 18, 0], armL: [18, 20, -18], forearmL: [-114, -16, 0] }, -0.22),
    K(16, { chest: [2, 16, -5], head: [-4, 32, 0], spine: [2, 10, 0], hips: [0, 14, 0], armR: [-92, 6, -6], forearmR: [-10, 0, 0], handR: [-12, 0, 0], armL: [-90, -4, 6], forearmL: [-12, 0, 0], handL: [-12, 0, 0], thighR: [-48, -10, 4], shinR: [24, 4, 0], thighL: [38, 22, 0], shinL: [14, -6, 0], footL: [14, 40, 0] }, -0.14),
    K(22, { chest: [3, 14, -4], head: [-4, 30, 0], armR: [-88, 6, -5], forearmR: [-12, 0, 0], armL: [-86, -4, 5], forearmL: [-14, 0, 0] }, -0.13),
    K(30, { chest: [5, 0, -2], head: [-3, 28, 0], armR: [-56, -4, 6], forearmR: [-50, 8, 0], armL: [-34, 8, -10], forearmL: [-70, -12, 0] }, -0.09),
    K(38, { chest: [3, -12, 0], head: [-2, 25, 0], armR: [-42, -8, 10], forearmR: [-72, 12, 0], armL: [-28, 10, -12], forearmL: [-78, -15, 0], thighR: [-22, -14, 0], shinR: [24, 10, 0], thighL: [18, 18, 0], shinL: [30, -8, 0] }, -0.06),
  ],
});

// Rising uppercut special (36f): dip → soaring uppercut → landing
defAnim({
  name: 'specialUpper', frames: 36, loop: false, snap: 'fast', keys: [
    K(0, { chest: [10, -12, 0], head: [-8, 24, 0], armR: [26, -16, 16], forearmR: [-92, 12, 0], thighR: [-40, -14, 2], shinR: [52, 8, 0], thighL: [24, 20, 0], shinL: [40, -6, 0] }, -0.2),
    K(6, { chest: [16, -10, 2], head: [-12, 20, 0], armR: [34, -14, 18], forearmR: [-104, 14, 0], armL: [-20, 14, -16], forearmL: [-86, -12, 0] }, -0.3),
    K(8, { chest: [-10, 10, -6], head: [-16, 26, 0], spine: [-6, 6, 0], armR: [-156, 6, -8], forearmR: [-10, 0, 0], handR: [-14, 0, 0], armL: [-30, 16, -18], forearmL: [-74, -12, 0], thighR: [-52, -8, 4], shinR: [26, 4, 0], thighL: [32, 20, 0], shinL: [18, -6, 0], footL: [20, 40, 0] }, -0.06),
    K(12, { chest: [-14, 14, -8], head: [-20, 30, 0], armR: [-168, 8, -10], forearmR: [-4, 0, 0], thighR: [-44, -8, 4], shinR: [20, 4, 0] }, 0.02),
    K(18, { chest: [-6, 8, -4], head: [-12, 26, 0], armR: [-120, 4, -4], forearmR: [-24, 4, 0], thighR: [-36, -10, 2], shinR: [30, 6, 0] }, -0.02),
    K(24, { chest: [8, -2, 0], head: [-8, 24, 0], armR: [-70, -4, 8], forearmR: [-52, 8, 0], thighR: [-40, -12, 2], shinR: [44, 6, 0], thighL: [22, 20, 0], shinL: [36, -6, 0] }, -0.16),
    K(36, { chest: [3, -12, 0], head: [-2, 25, 0], armR: [-42, -8, 10], forearmR: [-72, 12, 0], armL: [-28, 10, -12], forearmL: [-78, -15, 0], thighR: [-22, -14, 0], shinR: [24, 10, 0], thighL: [18, 18, 0], shinL: [30, -8, 0] }, -0.06),
  ],
});

// Overhead slam special (49f): huge windup → crushing double-fist slam
defAnim({
  name: 'specialSlam', frames: 49, loop: false, snap: 'fast', keys: [
    K(0, { chest: [6, -12, 0], head: [-4, 24, 0], armR: [-40, -10, 12], forearmR: [-70, 10, 0], thighR: [-26, -14, 2], shinR: [30, 8, 0], thighL: [22, 20, 0], shinL: [32, -6, 0] }, -0.08),
    K(8, { chest: [-16, -6, 0], head: [-24, 14, 0], spine: [-10, -4, 0], armR: [-150, -16, 20], forearmR: [-34, 8, 0], armL: [-140, 16, -20], forearmL: [-38, -8, 0], thighR: [-30, -14, 2], shinR: [34, 8, 0] }, -0.12),
    K(15, { chest: [-22, -4, 0], head: [-30, 10, 0], armR: [-172, -18, 24], forearmR: [-20, 8, 0], armL: [-162, 18, -24], forearmL: [-24, -8, 0], spine: [-14, -2, 0] }, -0.14),
    K(18, { chest: [24, 8, -4], head: [16, 20, 0], spine: [16, 4, 0], armR: [-38, -6, 10], forearmR: [-24, 4, 0], armL: [-32, 6, -10], forearmL: [-28, -4, 0], thighR: [-44, -12, 2], shinR: [48, 6, 0], thighL: [28, 20, 0], shinL: [36, -6, 0] }, -0.26),
    K(23, { chest: [30, 10, -5], head: [22, 22, 0], spine: [20, 6, 0], armR: [-30, -6, 8], forearmR: [-18, 4, 0], armL: [-26, 6, -8], forearmL: [-22, -4, 0] }, -0.32),
    K(30, { chest: [16, 2, -2], head: [4, 22, 0], armR: [-40, -8, 10], forearmR: [-52, 8, 0], armL: [-30, 8, -12], forearmL: [-64, -12, 0] }, -0.2),
    K(49, { chest: [3, -12, 0], head: [-2, 25, 0], armR: [-42, -8, 10], forearmR: [-72, 12, 0], armL: [-28, 10, -12], forearmL: [-78, -15, 0], thighR: [-22, -14, 0], shinR: [24, 10, 0], thighL: [18, 18, 0], shinL: [30, -8, 0] }, -0.06),
  ],
});

// alias the two hand-authored specials as the shared archetype anims
defAnim({ name: 'specialDash', frames: ANIMS.specialRyden.frames, loop: false, snap: 'fast', keys: ANIMS.specialRyden.keys });
defAnim({ name: 'specialFlurry', frames: ANIMS.specialKaito.frames, loop: false, snap: 'fast', keys: ANIMS.specialKaito.keys });

/* ---------------- super animations (generated flurries) ---------------- */

function genSuper(name: string, base: Pose, frames: number, color: 'red' | 'blue'): AnimDef {
  const keys: PoseKey[] = [];
  // dramatic opener: arms wide, chest up
  keys.push(K(0, {
    chest: [-14, -6, 0], head: [-24, 10, 0], spine: [-8, -4, 0],
    armR: [-120, -30, 40], forearmR: [-30, 10, 0], armL: [-110, 30, -40], forearmL: [-34, -10, 0],
    thighR: [-30, -14, 4], shinR: [34, 8, 0], thighL: [26, 20, 0], shinL: [30, -6, 0],
  }, -0.1));
  keys.push(K(6, {
    chest: [-18, -4, 0], head: [-30, 8, 0],
    armR: [-136, -34, 46], forearmR: [-24, 10, 0], armL: [-126, 34, -46], forearmL: [-28, -10, 0],
  }, -0.12));
  // alternating punch flurry from f10 → frames-30
  const t0 = 10, t1 = frames - 30;
  const cycle = 10;
  for (let t = t0; t < t1; t += cycle) {
    const mid = t + cycle * 0.4;
    const right = ((t - t0) / cycle) % 2 === 0;
    const punchArm = right ? 'armR' : 'armL';
    const guardArm = right ? 'armL' : 'armR';
    const punchFore = right ? 'forearmR' : 'forearmL';
    const guardFore = right ? 'forearmL' : 'forearmR';
    const side = right ? 1 : -1;
    const windJ: Partial<Record<JointName, Euler3>> = {};
    windJ[punchArm] = [30, -24 * side, 18 * side];
    windJ[punchFore] = [-100, 16 * side, 0];
    windJ[guardArm] = [-52, 18 * -side, -16 * -side];
    windJ[guardFore] = [-84, -12 * -side, 0];
    windJ.chest = [6, -26 * side, 3 * side];
    windJ.hips = [0, -18 * side, 0];
    windJ.head = [-4, 14, 0];
    keys.push(K(t, windJ, -0.1));
    const hitJ: Partial<Record<JointName, Euler3>> = {};
    hitJ[punchArm] = [-96, 8 * side, -5 * side];
    hitJ[punchFore] = [-6, 0, 0];
    hitJ[guardArm] = [-30, 16 * -side, -14 * -side];
    hitJ[guardFore] = [-92, -10 * -side, 0];
    hitJ.chest = [4, 24 * side, -5 * side];
    hitJ.hips = [0, 18 * side, 0];
    hitJ.spine = [5, 14 * side, 0];
    hitJ[punchArm === 'armR' ? 'thighR' : 'thighL'] = [-34, -12 * side, 3];
    keys.push(K(Math.round(mid), hitJ, -0.12));
  }
  // finisher: double palm / big strike
  const f0 = t1;
  keys.push(K(f0, {
    chest: [10, -8, 0], head: [-8, 16, 0],
    armR: [26, -20, 18], forearmR: [-100, 14, 0], armL: [22, 20, -18], forearmL: [-104, -14, 0],
    thighR: [-40, -14, 2], shinR: [48, 8, 0], thighL: [28, 20, 0], shinL: [36, -6, 0],
  }, -0.2));
  keys.push(K(f0 + 8, {
    chest: [-2, 18, -6], head: [-6, 30, 0], spine: [0, 12, 0], hips: [0, 14, 0],
    armR: [-98, 4, -8], forearmR: [-6, 0, 0], handR: [-14, 0, 0],
    armL: [-96, -4, 8], forearmL: [-8, 0, 0], handL: [-14, 0, 0],
    thighR: [-58, -10, 4], shinR: [18, 4, 0], thighL: [44, 22, 0], shinL: [10, -6, 0], footL: [16, 40, 0],
  }, -0.14));
  keys.push(K(f0 + 16, {
    chest: [0, 22, -7], head: [-6, 34, 0],
    armR: [-100, 6, -8], forearmR: [-4, 0, 0], armL: [-98, -6, 8], forearmL: [-6, 0, 0],
  }, -0.15));
  keys.push(K(frames, {
    chest: E(base, 'chest'), head: E(base, 'head'), armR: E(base, 'armR'), forearmR: E(base, 'forearmR'),
    armL: E(base, 'armL'), forearmL: E(base, 'forearmL'), thighR: E(base, 'thighR'), shinR: E(base, 'shinR'),
    thighL: E(base, 'thighL'), shinL: E(base, 'shinL'),
  }, base.hipsY ?? -0.06));
  void color;
  return defAnim({ name, frames, loop: false, snap: 'fast', keys });
}

/* ---------------- victories ---------------- */

function genVictoryRyden(name: string): AnimDef {
  return defAnim({
    name, frames: 150, loop: true, snap: 'soft', keys: [
      K(0, { chest: [-6, -8, 0], head: [-10, 16, 0], spine: [-4, -4, 0], armR: [-148, -16, 14], forearmR: [-36, 8, 0], handR: [0, 0, 0], armL: [-24, 12, -14], forearmL: [-84, -14, 0], thighR: [-24, -14, 0], shinR: [24, 10, 0], thighL: [18, 18, 0], shinL: [30, -8, 0], hips: [0, -12, 0] }, -0.05),
      K(24, { chest: [-10, -6, 0], head: [-16, 12, 0], armR: [-162, -18, 16], forearmR: [-28, 8, 0] }, -0.03),
      K(48, { chest: [-4, -10, 0], head: [-6, 20, 0], armR: [-140, -14, 12], forearmR: [-42, 8, 0] }, -0.07),
      K(80, { chest: [-8, 4, 0], head: [-12, 26, 0], armR: [-120, -20, 20], forearmR: [-60, 10, 0], armL: [-40, 8, -18], forearmL: [-70, -12, 0] }, -0.05),
      K(110, { chest: [-10, -6, 0], head: [-16, 12, 0], armR: [-160, -18, 16], forearmR: [-30, 8, 0], armL: [-24, 12, -14], forearmL: [-84, -14, 0] }, -0.035),
      K(150, { chest: [-6, -8, 0], head: [-10, 16, 0], armR: [-148, -16, 14], forearmR: [-36, 8, 0] }, -0.05),
    ],
  });
}

function genVictoryKaito(name: string): AnimDef {
  return defAnim({
    name, frames: 150, loop: true, snap: 'soft', keys: [
      K(0, { chest: [4, -30, 0], head: [-4, 46, 0], spine: [4, -20, 0], hips: [0, -30, 0], armR: [-86, -12, 8], forearmR: [-16, 6, 0], handR: [-8, 0, 0], armL: [-18, 16, -16], forearmL: [-92, -16, 0], thighR: [-26, -20, 0], shinR: [28, 14, 0], thighL: [24, 26, 0], shinL: [34, -10, 0] }, -0.07),
      K(30, { chest: [4, -32, 0], head: [-4, 48, 0], armR: [-88, -12, 8], forearmR: [-14, 6, 0] }, -0.085),
      K(60, { chest: [5, -28, 0], head: [-6, 44, 0], armR: [-84, -12, 8], forearmR: [-18, 6, 0] }, -0.06),
      K(90, { chest: [3, -32, 0], head: [-2, 50, 0], armR: [-90, -14, 8], forearmR: [-12, 6, 0], armL: [-16, 16, -16], forearmL: [-94, -16, 0] }, -0.09),
      K(150, { chest: [4, -30, 0], head: [-4, 46, 0], armR: [-86, -12, 8], forearmR: [-16, 6, 0] }, -0.07),
    ],
  });
}

function genVictoryC(name: string): AnimDef {
  // arms spread triumphantly, head back, slow breathing loop
  return defAnim({
    name, frames: 150, loop: true, snap: 'soft', keys: [
      K(0, { chest: [-14, -4, 0], head: [-26, 6, 0], spine: [-8, -2, 0], hips: [0, -8, 0], armR: [-118, -26, 34], forearmR: [-26, 8, 0], armL: [-112, 26, -34], forearmL: [-30, -8, 0], thighR: [-24, -14, 0], shinR: [26, 10, 0], thighL: [20, 18, 0], shinL: [30, -8, 0] }, -0.04),
      K(36, { chest: [-20, -2, 0], head: [-34, 4, 0], armR: [-128, -28, 38], forearmR: [-20, 8, 0], armL: [-122, 28, -38], forearmL: [-24, -8, 0] }, -0.02),
      K(78, { chest: [-12, -6, 0], head: [-22, 8, 0], armR: [-112, -24, 32], forearmR: [-30, 8, 0], armL: [-106, 24, -32], forearmL: [-34, -8, 0] }, -0.06),
      K(150, { chest: [-14, -4, 0], head: [-26, 6, 0], armR: [-118, -26, 34], forearmR: [-26, 8, 0], armL: [-112, 26, -34], forearmL: [-30, -8, 0] }, -0.04),
    ],
  });
}

/* ---------------- register everything ---------------- */

export function registerCharacterAnims(char: CharId): void {
  const base = BASE_POSES[char];
  const quick = CHARACTERS[char].archetype === 'quick';
  defAnim(genIdle(`idle_${char}`, base, quick ? 110 : 130));
  defAnim(genWalk(`walkF_${char}`, base, 1, quick ? 20 : 24));
  defAnim(genWalk(`walkB_${char}`, base, -1, quick ? 22 : 26, 0.8));
  defAnim(genCrouch(`crouch_${char}`, base, quick ? 84 : 100));
  defAnim(genSuper(`superGen_${char}`, base, 100, 'red'));
  const style = CHARACTERS[char].victoryStyle;
  if (style === 0) defAnim(genVictoryRyden(`victory_${char}`));
  else if (style === 1) defAnim(genVictoryKaito(`victory_${char}`));
  else defAnim(genVictoryC(`victory_${char}`));
}

for (const c of ROSTER) registerCharacterAnims(c);

/** Generic fallbacks so animFor() always resolves something. */
defAnim(genIdle('idle', BASE_RYDEN, 130));
defAnim(genWalk('walkF', BASE_RYDEN, 1, 24));
defAnim(genWalk('walkB', BASE_RYDEN, -1, 26, 0.8));
defAnim(genCrouch('crouch', BASE_RYDEN, 100));
defAnim(genVictoryRyden('victory'));

export const introIdleAnims = ['idle'];
void introIdleAnims;
