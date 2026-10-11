import * as THREE from 'three';
import type { FighterRuntime, MatchRuntime } from '../game/types';
import { bus } from '../game/eventBus';
import { clamp, damp, lerp } from '../game/utils';
import { useSettings } from '../config/settings';

/* ================================================================== */
/*  Cinematic camera director.                                        */
/*  Modes: standard fight cam, attack bias, impact punch, special     */
/*  tracking, super cinematic, KO slow orbit, victory orbit and the   */
/*  keyframed 12s intro. Spring-smoothed, shake-impulse driven,       */
/*  guarantees both fighters stay framed during normal gameplay.      */
/* ================================================================== */

type CamMode = 'standard' | 'impact' | 'special' | 'super' | 'ko' | 'victory' | 'intro';

const BASE_FOV = 42;

export class CameraDirector {
  private pos = new THREE.Vector3(0, 1.6, 6);
  private look = new THREE.Vector3(0, 1.05, 0);
  private desiredPos = new THREE.Vector3();
  private desiredLook = new THREE.Vector3();
  private impactFocus = new THREE.Vector3();
  private impactFocusLife = 0;
  private impactRecoil = 0;
  private fov = BASE_FOV;
  private fovTarget = BASE_FOV;
  private mode: CamMode = 'standard';
  private modeUntil = 0;
  private shake = 0;
  private impactPunch = 0;
  private orbitAngle = 0;
  private lastShot = -1;
  private camera: THREE.PerspectiveCamera | null = null;
  private off: (() => void) | null = null;
  private time = 0;

  attach(camera: THREE.PerspectiveCamera): void {
    this.camera = camera;
    this.off?.();
    this.off = bus.on((e) => {
      if (e.type === 'shake') {
        if (useSettings.getState().screenShake) this.shake = Math.min(1.4, this.shake + e.intensity * 0.5);
      } else if (e.type === 'camera') {
        this.requestMode(e.mode as CamMode, e.duration ?? 0.3, e.intensity ?? 1);
      } else if (e.type === 'hit' && !e.blocked) {
        // A brief focus pull follows the actual contact point while the two-shot holds.
        this.impactFocus.set(e.x, e.y, e.z ?? 0);
        this.impactFocusLife = e.effect === 'heavy' || e.counter ? 0.24 : 0.12;
        this.impactRecoil = (e.attacker === 0 ? -1 : 1) * Math.min(0.13, e.power * 0.001);
      } else if (e.type === 'slowmo') {
        // nothing — timescale handled by engine
      }
    });
  }

  dispose(): void {
    this.off?.();
    this.off = null;
  }

  reset(match: MatchRuntime): void {
    this.mode = match.phase === 'intro' ? 'intro' : 'standard';
    this.modeUntil = 0;
    this.shake = 0;
    this.impactPunch = 0;
    this.impactFocusLife = 0;
    this.impactRecoil = 0;
    this.orbitAngle = 0;
    this.time = 0;
    this.fov = this.fovTarget = BASE_FOV;
    this.lastShot = -1;
    this.pos.set(0, 1.6, 6);
    this.look.set(0, 1.05, 0);
  }

  private requestMode(mode: CamMode, duration: number, intensity: number): void {
    if (mode === 'impact') {
      this.impactPunch = Math.max(this.impactPunch, intensity);
      if (useSettings.getState().screenShake) this.shake = Math.min(1.5, this.shake + intensity * 0.28);
      return; // impact is an impulse over the current mode
    }
    // ko/victory/intro are phase-driven (see update) — ignore external requests
    if (mode === 'ko' || mode === 'victory' || mode === 'intro') return;
    if (mode !== 'standard' && mode !== 'special' && mode !== 'super') return;
    if (this.mode === 'intro' || this.mode === 'ko' || this.mode === 'victory') return;
    const order: CamMode[] = ['standard', 'special', 'super'];
    if (order.indexOf(mode) >= order.indexOf(this.mode) || this.modeUntil <= this.time) {
      this.mode = mode;
      this.modeUntil = this.time + duration;
    }
  }

  /** Phase-driven mode policy — guarantees reliable returns to gameplay cam. */
  private applyPhaseMode(match: MatchRuntime): void {
    const phase = match.phase;
    if (phase === 'intro') {
      if (this.mode !== 'intro') { this.mode = 'intro'; this.lastShot = -1; }
    } else if (phase === 'ko') {
      if (this.mode !== 'ko') { this.mode = 'ko'; this.orbitAngle = 0; }
    } else if (phase === 'round_end' || phase === 'match_end') {
      if (this.mode !== 'victory') { this.mode = 'victory'; this.orbitAngle = 0; }
    } else {
      // fight / training / round_intro / paused
      if (this.mode === 'intro' || this.mode === 'ko' || this.mode === 'victory') this.mode = 'standard';
      if (this.mode !== 'standard' && this.time > this.modeUntil) this.mode = 'standard';
    }
  }

  update(dt: number, match: MatchRuntime): void {
    if (!this.camera) return;
    if (match.phase === 'paused') return;
    this.time += dt;
    const cam = this.camera;
    const [a, b] = match.fighters;

    this.applyPhaseMode(match);

    let desiredPos = this.desiredPos.copy(this.pos);
    let desiredLook = this.desiredLook.copy(this.look);
    let desiredFov = BASE_FOV;
    let springK = 7;
    let snap = false;

    switch (this.mode) {
      case 'intro':
        ({ pos: desiredPos, look: desiredLook, fov: desiredFov, snap } = this.introShot(match.phaseFrame, a, b));
        springK = snap ? 1e6 : 5;
        break;
      case 'ko': {
        // slow dramatic orbit around the actual knockout position
        const mid = (a.x + b.x) / 2;
        const dist = Math.abs(a.x - b.x);
        this.orbitAngle += dt * 0.42;
        const r = clamp(2.4 + dist * 0.5, 2.6, 5.2);
        const ang = Math.min(this.orbitAngle, Math.PI * 0.34) * (mid >= 0 ? 1 : -1);
        desiredPos.set(mid + Math.sin(ang) * r * 0.55, 1.25 + Math.sin(this.orbitAngle * 0.7) * 0.2, Math.cos(ang) * r + 1.2);
        desiredLook.set(mid, 0.95, 0);
        desiredFov = 38;
        springK = 3.4;
        break;
      }
      case 'victory': {
        const winner = match.koWinner === 1 ? b : match.koWinner === 0 ? a : (match.matchWinner === 1 ? b : a);
        this.orbitAngle += dt * 0.55;
        const r = 3.1;
        desiredPos.set(
          winner.x + Math.sin(this.orbitAngle) * r,
          1.55 + Math.sin(this.orbitAngle * 0.5) * 0.25,
          Math.cos(this.orbitAngle) * r,
        );
        desiredLook.set(winner.x, 1.15, 0);
        desiredFov = 40;
        springK = 3;
        break;
      }
      case 'super': {
        // cinematic arc that keeps BOTH fighters framed (never blocks combat reads)
        const att = this.findAttacker(a, b);
        const other = att === a ? b : a;
        const mid = (att.x + other.x) / 2;
        const dist = Math.abs(att.x - other.x);
        const halfW = Math.max(2.0, dist / 2 + 1.0);
        desiredFov = 36 + Math.sin(this.time * 2.2) * 0.8;
        const z = Math.max(3.6, this.zForWidth(halfW, cam, desiredFov));
        this.orbitAngle += dt * 0.5;
        const arc = Math.sin(this.orbitAngle * 0.9) * 0.5;
        desiredPos.set(clamp(mid + att.facing * 0.5 + arc, -5, 5), 1.32 + Math.sin(this.time * 0.8) * 0.08, z);
        desiredLook.set(mid + att.facing * 0.25, 1.12, 0);
        springK = 5;
        break;
      }
      case 'special': {
        const att = this.findAttacker(a, b);
        const other = att === a ? b : a;
        const mid = (att.x + other.x) / 2;
        const halfW = Math.max(2.0, Math.abs(att.x - other.x) / 2 + 1.0);
        const z = this.zForWidth(halfW, cam, 37);
        desiredPos.set(clamp(mid + att.facing * 0.3, -4.4, 4.4), 1.42, Math.max(z, 3.6));
        desiredLook.set(mid + att.facing * 0.25, 1.1, 0);
        desiredFov = 37;
        springK = 6;
        break;
      }
      default: {
        /* standard fighting camera (also carries attack bias + impact punch) */
        const mid = (a.x + b.x) / 2;
        const dist = Math.abs(a.x - b.x);
        const airLift = Math.max(a.y, b.y) * 0.35;
        const halfW = Math.max(2.15, dist / 2 + 1.18);
        const attacker = this.whoAttacking(a, b);
        desiredFov = (attacker && attacker.move?.kind === 'special' ? 39 : BASE_FOV) - this.impactPunch * 0.65;
        const z = this.zForWidth(halfW, cam, desiredFov);
        const bias = attacker ? attacker.facing * (attacker.move && attacker.move.kind !== 'normal' ? 0.5 : 0.22) : 0;
        desiredPos.set(clamp(mid + bias, -4.6, 4.6), 1.52 + dist * 0.028 + airLift * 0.5, Math.max(z, 3.3));
        desiredLook.set(clamp(mid + bias * 0.4, -5, 5), 1.06 + airLift * 0.6, 0);
        springK = 6.5;
        break;
      }
    }

    const gameplay = this.mode === 'standard' || this.mode === 'special' || this.mode === 'super';
    if (gameplay && this.impactFocusLife > 0) {
      const pull = Math.min(0.08, this.impactFocusLife * 0.3);
      desiredLook.x = lerp(desiredLook.x, this.impactFocus.x, pull);
      desiredLook.y = lerp(desiredLook.y, this.impactFocus.y, pull);
    }

    // spring smoothing (critically-ish damped)
    const k = snap ? 1 : 1 - Math.exp(-springK * dt);
    this.pos.lerp(desiredPos, k);
    this.look.lerp(desiredLook, k);
    this.impactPunch = Math.max(0, this.impactPunch - dt * 3.2);
    this.impactFocusLife = Math.max(0, this.impactFocusLife - dt);
    this.impactRecoil *= Math.exp(-dt * 16);

    // shake
    this.shake = Math.max(0, this.shake - dt * 2.1);
    const shakeEnabled = useSettings.getState().screenShake;
    if (!shakeEnabled) this.shake = 0;
    const sh = shakeEnabled ? this.shake * this.shake : 0;
    const shakeX = (Math.sin(this.time * 91) + Math.sin(this.time * 57.3)) * 0.5 * sh * 0.16;
    const shakeY = (Math.sin(this.time * 83.7) + Math.sin(this.time * 47.1)) * 0.5 * sh * 0.14;
    const roll = Math.sin(this.time * 71) * sh * 0.012;

    cam.position.copy(this.pos);
    cam.position.x += shakeX + (shakeEnabled ? this.impactRecoil : 0);
    cam.position.y += shakeY;
    cam.lookAt(this.look);
    cam.rotation.z += roll;

    this.fovTarget = desiredFov;
    this.fov = lerp(this.fov, this.fovTarget, damp(6, dt));
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
    if (gameplay) this.keepFightersInFrame(cam, a, b);
  }

  private zForWidth(halfW: number, cam: THREE.PerspectiveCamera, fov = cam.fov): number {
    const aspect = cam.aspect || 16 / 9;
    const fovX = 2 * Math.atan(Math.tan((fov * Math.PI) / 360) * aspect);
    return halfW / Math.tan(fovX / 2);
  }

  /** Enforce framing after smoothing, FOV changes and shake, including portrait screens. */
  private keepFightersInFrame(cam: THREE.PerspectiveCamera, a: FighterRuntime, b: FighterRuntime): void {
    const tanY = Math.tan((cam.fov * Math.PI) / 360) * 0.9;
    const tanX = tanY * (cam.aspect || 16 / 9);
    for (let pass = 0; pass < 6; pass++) {
      const px = cam.position.x, py = cam.position.y, pz = cam.position.z;
      let fx = this.look.x - px, fy = this.look.y - py, fz = this.look.z - pz;
      const fl = Math.hypot(fx, fy, fz);
      fx /= fl; fy /= fl; fz /= fl;
      const rl = Math.hypot(fx, fz);
      const rx = -fz / rl, rz = fx / rl;
      const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
      let ratio = 1;
      for (let i = 0; i < 2; i++) {
        const fighter = i === 0 ? a : b;
        for (let corner = 0; corner < 4; corner++) {
          const x = fighter.x + (corner & 1 ? 0.92 : -0.92) - px;
          const y = fighter.y + (corner & 2 ? 2.2 : 0.04) - py;
          const z = -pz;
          const depth = Math.max(0.01, x * fx + y * fy + z * fz);
          ratio = Math.max(ratio, Math.abs(x * rx + z * rz) / (depth * tanX), Math.abs(x * ux + y * uy + z * uz) / (depth * tanY));
        }
      }
      if (ratio <= 1.001) break;
      cam.position.z += Math.max(0.08, cam.position.z * (ratio - 1) * 1.08);
      cam.lookAt(this.look);
      this.pos.z = Math.max(this.pos.z, cam.position.z);
    }
  }

  private whoAttacking(a: FighterRuntime, b: FighterRuntime): FighterRuntime | null {
    if (a.state === 'attack' && a.move) return a;
    if (b.state === 'attack' && b.move) return b;
    return null;
  }

  private findAttacker(a: FighterRuntime, b: FighterRuntime): FighterRuntime {
    if (a.state === 'attack' && a.move && (a.move.kind === 'special' || a.move.kind === 'super')) return a;
    if (b.state === 'attack' && b.move && (b.move.kind === 'special' || b.move.kind === 'super')) return b;
    return a.combo >= b.combo ? a : b;
  }

  /** Keyframed 12-second intro: crane → tracking → close-up cuts → dolly out. */
  private introShot(
    t: number,
    a: FighterRuntime,
    b: FighterRuntime,
  ): { pos: THREE.Vector3; look: THREE.Vector3; fov: number; snap: boolean } {
    const S = 60;
    const pos = new THREE.Vector3();
    const look = new THREE.Vector3();
    let fov = BASE_FOV;
    let snap = false;

    const jointOf = (f: FighterRuntime, name: string, fbY: number): THREE.Vector3 => {
      const j = f.joints[name];
      if (j) return new THREE.Vector3(j.x, j.y, j.z);
      return new THREE.Vector3(f.x, fbY + f.y, 0);
    };
    const shot = (id: number): boolean => {
      if (this.lastShot !== id) { this.lastShot = id; snap = true; }
      return snap;
    };

    if (t < 3 * S) {
      // SCENE 1 — high crane descending over the rain-soaked street
      shot(1);
      const p = THREE.MathUtils.smoothstep(t, 0, 3 * S);
      pos.set(lerp(-2.2, 0, p), lerp(9.5, 3.1, p), lerp(10.5, 5.9, p));
      look.set(lerp(0.5, 0, p), lerp(0.4, 1.05, p), 0);
      fov = lerp(50, 44, p);
      snap = false; // smooth crane move
    } else if (t < 6 * S) {
      // SCENE 2 — low tracking shot: first fighter walks through the rain
      shot(2);
      const p = THREE.MathUtils.smoothstep(t, 3 * S, 6 * S);
      const fx = a.x;
      pos.set(fx + lerp(3.0, 2.35, p), lerp(0.42, 0.58, p), lerp(2.05, 1.8, p));
      look.set(fx + 0.35, 1.22, 0);
      fov = 40;
    } else if (t < 9 * S) {
      // SCENE 3 — second fighter enters; rapid cinematic cuts / close-ups
      const local = t - 6 * S;
      if (local < 36) {
        shot(3);
        pos.set(b.x - 2.3, 0.55, 1.7);
        look.set(b.x - 0.1, 1.3, 0);
        fov = 40;
      } else if (local < 72) {
        shot(4); // kaito eyes
        const head = jointOf(b, 'head', 1.72);
        pos.set(head.x + b.facing * 0.34, head.y + 0.02, head.z + 0.42);
        look.copy(head).add(new THREE.Vector3(b.facing * 0.2, 0, 0));
        fov = 30;
      } else if (local < 108) {
        shot(5); // ryden fist
        const hand = jointOf(a, 'handR', 1.25);
        pos.set(hand.x + a.facing * 0.3, hand.y + 0.12, hand.z + 0.52);
        look.copy(hand);
        fov = 30;
      } else if (local < 144) {
        shot(6); // ryden eyes
        const head = jointOf(a, 'head', 1.72);
        pos.set(head.x + a.facing * 0.36, head.y + 0.03, head.z + 0.4);
        look.copy(head).add(new THREE.Vector3(a.facing * 0.2, 0, 0));
        fov = 30;
      } else {
        shot(7); // wide stance two-shot
        pos.set(0, 0.52, 4.4);
        look.set(0, 1.08, 0);
        fov = 44;
      }
    } else {
      // SCENE 4 — face-off, rapid dolly out into gameplay camera
      shot(8);
      const p = THREE.MathUtils.smoothstep(t, 9 * S, 11.6 * S);
      const mid = (a.x + b.x) / 2;
      const dist = Math.abs(a.x - b.x);
      const endZ = this.zForWidth(Math.max(2.15, dist / 2 + 1.18), this.camera!) ;
      pos.set(lerp(mid, mid, p), lerp(1.15, 1.52, p), lerp(2.1, clamp(endZ, 3.3, 8.6), p));
      look.set(mid, lerp(1.25, 1.06, p), 0);
      fov = lerp(36, BASE_FOV, p);
      snap = false;
    }
    return { pos, look, fov, snap };
  }
}

export const cameraDirector = new CameraDirector();
