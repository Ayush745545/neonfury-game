import { ANIMS, ALL_JOINTS, snapRate, type AnimDef, type Euler3, type JointName, type Pose } from './types';
import { deg, clamp } from '../game/utils';

/* ------------------------------------------------------------------ */
/* Keyframe sampler + exponential-blend pose player.                   */
/* Missing joints fall back to the character's base stance so anims    */
/* only need to author the joints they actually move.                  */
/* ------------------------------------------------------------------ */

const smoothstep = (t: number): number => t * t * (3 - 2 * t);

/** Precomputed per-joint key lists for fast sampling. */
interface CompiledAnim {
  def: AnimDef;
  jointKeys: Map<JointName, { t: number[]; xs: number[]; ys: number[]; zs: number[] }>;
  hipsKeys: { t: number[]; v: number[] } | null;
}

const compiled = new Map<string, CompiledAnim>();

function compile(def: AnimDef): CompiledAnim {
  const jointKeys = new Map<JointName, { t: number[]; xs: number[]; ys: number[]; zs: number[] }>();
  for (const jn of ALL_JOINTS) jointKeys.set(jn, { t: [], xs: [], ys: [], zs: [] });
  const hipsT: number[] = [];
  const hipsV: number[] = [];
  for (const k of def.keys) {
    for (const jn of Object.keys(k.j) as JointName[]) {
      const entry = jointKeys.get(jn)!;
      const e = k.j[jn]!;
      entry.t.push(k.t);
      entry.xs.push(e[0]);
      entry.ys.push(e[1]);
      entry.zs.push(e[2]);
    }
    if (k.hipsY !== undefined) { hipsT.push(k.t); hipsV.push(k.hipsY); }
  }
  const c: CompiledAnim = { def, jointKeys, hipsKeys: hipsT.length ? { t: hipsT, v: hipsV } : null };
  compiled.set(def.name, c);
  return c;
}

export function getCompiled(name: string): CompiledAnim | undefined {
  const def = ANIMS[name];
  if (!def) return undefined;
  return compiled.get(name) ?? compile(def);
}

function sampleTrack(t: number[], v: number[], time: number, loop: boolean, frames: number): number {
  if (t.length === 1) return v[0];
  if (time <= t[0]) return v[0];
  if (time >= t[t.length - 1]) {
    if (loop && frames > 0) {
      // wrap-around interpolation for looping anims
      const span = frames;
      const last = v[v.length - 1];
      const first = v[0];
      const tail = span - t[t.length - 1];
      if (tail > 0 && time > t[t.length - 1]) {
        const u = smoothstep(clamp((time - t[t.length - 1]) / tail, 0, 1));
        return last + (first - last) * u;
      }
      return last;
    }
    return v[v.length - 1];
  }
  // binary-ish scan (tracks are tiny)
  for (let i = 0; i < t.length - 1; i++) {
    if (time >= t[i] && time <= t[i + 1]) {
      const u = smoothstep((time - t[i]) / Math.max(1e-5, t[i + 1] - t[i]));
      return v[i] + (v[i + 1] - v[i]) * u;
    }
  }
  return v[v.length - 1];
}

/** Sample an animation at a fractional frame; joints absent from the anim are omitted. */
export function sampleAnim(name: string, frame: number, out: Pose): Pose {
  const c = getCompiled(name);
  if (!c) return out;
  const { def, jointKeys, hipsKeys } = c;
  let time = frame;
  if (def.loop && def.frames > 0) {
    time = ((frame % def.frames) + def.frames) % def.frames;
  } else {
    time = clamp(frame, 0, def.frames);
  }
  jointKeys.forEach((track, jn) => {
    if (track.t.length === 0) return;
    const x = sampleTrack(track.t, track.xs, time, def.loop, def.frames);
    const y = sampleTrack(track.t, track.ys, time, def.loop, def.frames);
    const z = sampleTrack(track.t, track.zs, time, def.loop, def.frames);
    out[jn] = [x, y, z];
  });
  if (hipsKeys) out.hipsY = sampleTrack(hipsKeys.t, hipsKeys.v, time, def.loop, def.frames);
  return out;
}

/* ------------------------------------------------------------------ */
/* Pose player: holds the blended pose and eases toward the target.    */
/* ------------------------------------------------------------------ */

export class PosePlayer {
  /** current blended pose in radians, per joint */
  cur = new Map<JointName, [number, number, number]>();
  curHipsY = 0;
  private target: Pose = {};
  private base: Pose;
  private lastAnim = '';
  private tmp: Pose = {};

  constructor(base: Pose) {
    this.base = base;
    for (const jn of ALL_JOINTS) {
      const e = (base[jn] ?? [0, 0, 0]) as Euler3;
      this.cur.set(jn, [deg(e[0]), deg(e[1]), deg(e[2])]);
    }
    this.curHipsY = base.hipsY ?? 0;
  }

  /** Compute target pose (anim merged over base) and blend one step. */
  update(animName: string, frame: number, dt: number, snapOverride?: number): void {
    const anim = getCompiled(animName) ? animName : 'idle';
    // build target: base then anim overrides
    this.target = { ...this.base };
    for (const k of Object.keys(this.tmp)) delete (this.tmp as Record<string, unknown>)[k];
    sampleAnim(anim, frame, this.tmp);
    Object.assign(this.target, this.tmp);

    const def = ANIMS[anim];
    // hit reactions and attack starts snap faster; anim switches snap harder
    let rate = snapOverride ?? snapRate(def);
    if (anim !== this.lastAnim) {
      rate = Math.max(rate, def?.snap === 'fast' ? 34 : 20);
      this.lastAnim = anim;
    }
    const k = 1 - Math.exp(-rate * Math.min(dt, 0.05));
    this.cur.forEach((v, jn) => {
      const t = (this.target[jn] ?? [0, 0, 0]) as Euler3;
      v[0] += (deg(t[0]) - v[0]) * k;
      v[1] += (deg(t[1]) - v[1]) * k;
      v[2] += (deg(t[2]) - v[2]) * k;
    });
    const th = this.target.hipsY ?? 0;
    this.curHipsY += (th - this.curHipsY) * k;
  }

  get(jn: JointName): [number, number, number] {
    return this.cur.get(jn) ?? [0, 0, 0];
  }
}
