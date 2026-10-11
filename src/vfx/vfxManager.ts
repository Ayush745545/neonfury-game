import type { FighterRuntime } from '../game/types';

/* ================================================================== */
/*  Pooled VFX manager — zero allocation at runtime.                  */
/*  Systems: billboard particles (sparks/dust/energy), shockwave      */
/*  rings, electric arcs, joint-anchored energy trails.               */
/* ================================================================== */

export type ParticleBeh = 0 | 1 | 2 | 3 | 4 | 5;
// 0 default · 1 ember (buoyant wander) · 2 smoke (grow) · 3 debris (tumble/bounce)
// 4 glitch (jitter teleport) · 5 spiral (orbit an anchor)

export interface Particle {
  active: boolean;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; maxLife: number;
  size: number;
  r: number; g: number; b: number;
  gravity: number;
  drag: number;
  kind: 0 | 1 | 2; // 0 spark(additive) 1 smoke 2 energy orb
  beh: ParticleBeh;
  ax: number; ay: number;   // spiral anchor
  ang: number; rad: number; // spiral polar state
  phase: number;
}

export interface Ring {
  active: boolean;
  x: number; y: number; z: number;
  life: number; maxLife: number;
  size0: number; size1: number;
  r: number; g: number; b: number;
  vertical: boolean;
  rotY: number;
}

export interface Arc {
  active: boolean;
  x1: number; y1: number; z1: number;
  x2: number; y2: number; z2: number;
  life: number; maxLife: number;
  r: number; g: number; b: number;
  seed: number;
}

export interface Slash {
  active: boolean;
  x: number; y: number; z: number;
  rot: number;
  life: number; maxLife: number;
  size0: number; size1: number;
  thick: number;
  r: number; g: number; b: number;
}

export interface TrailEmitter {
  active: boolean;
  fighter: 0 | 1;
  joint: string;
  life: number;
  r: number; g: number; b: number;
  accum: number;
}

export const MAX_PARTICLES = 1100;
export const MAX_RINGS = 24;
export const MAX_ARCS = 12;
export const MAX_SLASHES = 12;

const hex2rgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

export class VFXManager {
  particles: Particle[] = [];
  rings: Ring[] = [];
  arcs: Arc[] = [];
  slashes: Slash[] = [];
  trails: TrailEmitter[] = [];
  private fighters: [FighterRuntime, FighterRuntime] | null = null;
  private pIdx = 0;
  private rIdx = 0;
  private aIdx = 0;
  private sIdx = 0;

  constructor() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, size: 0.05, r: 1, g: 1, b: 1, gravity: 0, drag: 1, kind: 0, beh: 0, ax: 0, ay: 0, ang: 0, rad: 0, phase: 0 });
    }
    for (let i = 0; i < MAX_SLASHES; i++) {
      this.slashes.push({ active: false, x: 0, y: 0, z: 0, rot: 0, life: 0, maxLife: 1, size0: 0.3, size1: 1.2, thick: 1, r: 1, g: 1, b: 1 });
    }
    for (let i = 0; i < MAX_RINGS; i++) {
      this.rings.push({ active: false, x: 0, y: 0, z: 0, life: 0, maxLife: 1, size0: 0.2, size1: 1.5, r: 1, g: 1, b: 1, vertical: false, rotY: 0 });
    }
    for (let i = 0; i < MAX_ARCS; i++) {
      this.arcs.push({ active: false, x1: 0, y1: 0, z1: 0, x2: 0, y2: 0, z2: 0, life: 0, maxLife: 1, r: 0.4, g: 0.8, b: 1, seed: 0 });
    }
    for (let i = 0; i < 4; i++) {
      this.trails.push({ active: false, fighter: 0, joint: 'handR', life: 0, r: 1, g: 0.2, b: 0.3, accum: 0 });
    }
  }

  setFighters(a: FighterRuntime, b: FighterRuntime): void {
    this.fighters = [a, b];
  }

  clear(): void {
    for (const p of this.particles) p.active = false;
    for (const r of this.rings) r.active = false;
    for (const a of this.arcs) a.active = false;
    for (const sl of this.slashes) sl.active = false;
    for (const t of this.trails) t.active = false;
  }

  private nextParticle(): Particle {
    // round-robin with overwrite — bounded pool, no leaks
    for (let n = 0; n < MAX_PARTICLES; n++) {
      const p = this.particles[this.pIdx];
      this.pIdx = (this.pIdx + 1) % MAX_PARTICLES;
      if (!p.active) return p;
    }
    const p = this.particles[this.pIdx];
    this.pIdx = (this.pIdx + 1) % MAX_PARTICLES;
    return p;
  }

  private spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: string, gravity: number, drag: number, kind: 0 | 1 | 2, beh: ParticleBeh = 0): void {
    const p = this.nextParticle();
    const [r, g, b] = hex2rgb(color);
    p.active = true; p.x = x; p.y = y; p.z = z;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.life = life; p.maxLife = life;
    p.size = size; p.r = r; p.g = g; p.b = b;
    p.gravity = gravity; p.drag = drag; p.kind = kind;
    p.beh = beh;
    p.ax = x; p.ay = y;
    p.ang = Math.random() * Math.PI * 2;
    p.rad = 0.1 + Math.random() * 0.3;
    p.phase = Math.random() * 100;
  }

  spawnSparks(x: number, y: number, z: number, dirX: number, color: string, count: number, power: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (1.6 + Math.random() * 4.2) * power;
      this.spawn(
        x + (Math.random() - 0.5) * 0.1, y + (Math.random() - 0.5) * 0.1, z + (Math.random() - 0.5) * 0.12,
        Math.cos(a) * sp * 0.5 + dirX * sp * 0.7, Math.sin(a) * sp * 0.55 + 1.2 * power, (Math.random() - 0.5) * sp * 0.5,
        0.22 + Math.random() * 0.3, 0.035 + Math.random() * 0.05 * power, color, -12, 2.2, 0,
      );
    }
    // bright core flash particles
    for (let i = 0; i < 3; i++) {
      this.spawn(x, y, z, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, 0, 0.1, 0.16 * power, '#ffffff', 0, 4, 2);
    }
  }

  spawnSmoke(x: number, y: number, z: number, color: string, count: number, rise = 0.6): void {
    for (let i = 0; i < count; i++) {
      this.spawn(
        x + (Math.random() - 0.5) * 0.4, y + Math.random() * 0.15, z + (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.5, rise * (0.6 + Math.random() * 0.8), (Math.random() - 0.5) * 0.3,
        0.8 + Math.random() * 0.9, 0.16 + Math.random() * 0.22, color, 0.25, 0.8, 1,
      );
    }
  }

  spawnDust(x: number, y: number, color: string, power = 1): void {
    const n = Math.round(4 * power);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (0.5 + Math.random() * 1.3) * power;
      this.spawn(x + Math.cos(a) * 0.1, y + 0.02, Math.sin(a) * 0.14, Math.cos(a) * sp, 0.5 + Math.random() * 1.1 * power, Math.sin(a) * sp * 0.4, 0.4 + Math.random() * 0.4, 0.07 + Math.random() * 0.09 * power, color, -1.4, 1.6, 1);
    }
  }

  spawnBurst(x: number, y: number, color: string, power = 1): void {
    const n = Math.round(18 * power);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const el = (Math.random() - 0.35) * Math.PI;
      const sp = (2.5 + Math.random() * 5) * power;
      this.spawn(x, y, 0, Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp + 1.5, Math.sin(a) * Math.cos(el) * sp * 0.4,
        0.35 + Math.random() * 0.4, 0.05 + Math.random() * 0.08 * power, color, -9, 1.7, 2);
    }
  }

  spawnCharge(x: number, y: number, color: string, duration: number): void {
    // converging energy motes (negative velocity toward center simulated by inward spawn)
    const n = Math.round(duration * 40);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const el = (Math.random() - 0.5) * Math.PI;
      const rad = 1.1 + Math.random() * 0.8;
      const px = x + Math.cos(a) * rad;
      const py = y + Math.sin(el) * rad * 0.8;
      const pz = Math.sin(a) * rad * 0.5;
      const delay = Math.random() * duration * 0.6;
      const life = duration - delay;
      if (life <= 0.05) continue;
      const dirx = (x - px) / life;
      const diry = (y - py) / life;
      const dirz = -pz / life;
      const p = this.nextParticle();
      const [r, g, b] = hex2rgb(color);
      p.active = true; p.x = px; p.y = py; p.z = pz;
      p.vx = dirx; p.vy = diry; p.vz = dirz;
      p.life = life; p.maxLife = life;
      p.size = 0.03 + Math.random() * 0.045; p.r = r; p.g = g; p.b = b;
      p.gravity = 0; p.drag = 0; p.kind = 2;
    }
  }

  spawnRing(x: number, y: number, z: number, color: string, size0: number, size1: number, life: number, vertical = false, rotY = 0): void {
    for (let n = 0; n < MAX_RINGS; n++) {
      const r = this.rings[this.rIdx];
      this.rIdx = (this.rIdx + 1) % MAX_RINGS;
      if (!r.active) {
        const [cr, cg, cb] = hex2rgb(color);
        r.active = true; r.x = x; r.y = y; r.z = z;
        r.life = life; r.maxLife = life;
        r.size0 = size0; r.size1 = size1;
        r.r = cr; r.g = cg; r.b = cb;
        r.vertical = vertical; r.rotY = rotY;
        return;
      }
    }
  }

  spawnArc(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, color: string, life = 0.18): void {
    for (let n = 0; n < MAX_ARCS; n++) {
      const a = this.arcs[this.aIdx];
      this.aIdx = (this.aIdx + 1) % MAX_ARCS;
      if (!a.active) {
        const [r, g, b] = hex2rgb(color);
        a.active = true;
        a.x1 = x1; a.y1 = y1; a.z1 = z1;
        a.x2 = x2; a.y2 = y2; a.z2 = z2;
        a.life = life; a.maxLife = life;
        a.r = r; a.g = g; a.b = b;
        a.seed = Math.random() * 100;
        return;
      }
    }
  }

  spawnElectric(x: number, y: number, color: string, count = 4): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const el = (Math.random() - 0.3) * Math.PI * 0.8;
      const len = 0.4 + Math.random() * 0.7;
      this.spawnArc(x, y, (Math.random() - 0.5) * 0.2,
        x + Math.cos(a) * len, y + Math.sin(el) * len, (Math.random() - 0.5) * 0.5,
        color, 0.1 + Math.random() * 0.12);
    }
    this.spawnSparks(x, y, 0, 0, color, 6, 0.7);
  }

  /** Buoyant flickering embers (fire/ascent). */
  spawnEmbers(x: number, y: number, color: string, n: number, spread = 0.5, up = 1.6): void {
    for (let i = 0; i < n; i++) {
      this.spawn(
        x + (Math.random() - 0.5) * spread, y + (Math.random() - 0.5) * spread * 0.6, (Math.random() - 0.5) * 0.25,
        (Math.random() - 0.5) * 0.7, up * (0.6 + Math.random() * 0.9), (Math.random() - 0.5) * 0.3,
        0.5 + Math.random() * 0.6, 0.03 + Math.random() * 0.045, color, 1.4, 0.5, 2, 1,
      );
    }
  }

  /** Tumbling heavy chunks (rock/metal) with bounce. */
  spawnDebris(x: number, y: number, color: string, n: number, power = 1): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (1.4 + Math.random() * 3) * power;
      this.spawn(
        x, y, (Math.random() - 0.5) * 0.2,
        Math.cos(a) * sp * 0.6, 2.2 * power + Math.random() * 2.6, Math.sin(a) * sp * 0.25,
        0.7 + Math.random() * 0.5, 0.045 + Math.random() * 0.06, color, -13, 0.25, 0, 3,
      );
    }
  }

  /** Jitter-teleporting glitch shards. */
  spawnGlitch(x: number, y: number, color: string, n: number, color2?: string): void {
    for (let i = 0; i < n; i++) {
      const c = color2 && i % 3 === 0 ? color2 : color;
      this.spawn(
        x + (Math.random() - 0.5) * 0.8, y + (Math.random() - 0.5) * 1.1, (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 1.4, 0,
        0.3 + Math.random() * 0.35, 0.04 + Math.random() * 0.07, c, 0, 1.6, 0, 4,
      );
    }
  }

  /** Particles spiraling around a point (energy vortex). */
  spawnSpiral(x: number, y: number, color: string, n: number, radius = 0.7, speed = 7, life = 0.6): void {
    for (let i = 0; i < n; i++) {
      const p = this.nextParticle();
      const [r, g, b] = hex2rgb(color);
      p.active = true;
      p.ax = x; p.ay = y;
      p.ang = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      p.rad = radius * (0.5 + Math.random() * 0.8);
      p.x = x + Math.cos(p.ang) * p.rad;
      p.y = y + Math.sin(p.ang) * p.rad * 0.7;
      p.z = (Math.random() - 0.5) * 0.3;
      p.vx = speed; p.vy = 0.35 + Math.random() * 0.5; p.vz = 0;
      p.life = life * (0.7 + Math.random() * 0.6); p.maxLife = p.life;
      p.size = 0.035 + Math.random() * 0.04;
      p.r = r; p.g = g; p.b = b;
      p.gravity = 0; p.drag = 0; p.kind = 2; p.beh = 5;
      p.phase = Math.random() * 100;
    }
  }

  /** Slow rising smoke column / veil. */
  spawnSmokeVeil(x: number, y: number, color: string, n: number, height = 2): void {
    for (let i = 0; i < n; i++) {
      this.spawn(
        x + (Math.random() - 0.5) * 0.7, y + Math.random() * 0.4, (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.25, 0.5 + Math.random() * height * 0.4, (Math.random() - 0.5) * 0.15,
        1.1 + Math.random() * 0.8, 0.18 + Math.random() * 0.2, color, 0.15, 0.7, 1, 2,
      );
    }
  }

  /** Expanding crescent slash arc. */
  spawnSlash(x: number, y: number, z: number, rot: number, color: string, size0: number, size1: number, life = 0.16, thick = 1): void {
    for (let n = 0; n < MAX_SLASHES; n++) {
      const sl = this.slashes[this.sIdx];
      this.sIdx = (this.sIdx + 1) % MAX_SLASHES;
      if (!sl.active) {
        const [r, g, b] = hex2rgb(color);
        sl.active = true;
        sl.x = x; sl.y = y; sl.z = z;
        sl.rot = rot;
        sl.life = life; sl.maxLife = life;
        sl.size0 = size0; sl.size1 = size1;
        sl.thick = thick;
        sl.r = r; sl.g = g; sl.b = b;
        return;
      }
    }
  }

  startTrail(fighter: 0 | 1, joint: string, color: string, duration = 0.45): void {
    const t = this.trails.find((tr) => !tr.active) ?? this.trails[0];
    const [r, g, b] = hex2rgb(color);
    t.active = true; t.fighter = fighter; t.joint = joint;
    t.life = duration; t.r = r; t.g = g; t.b = b; t.accum = 0;
  }

  update(dt: number): void {
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      switch (p.beh) {
        case 1: // ember: buoyant wander
          p.vx += Math.sin(p.life * 9 + p.phase) * 0.9 * dt;
          p.vz += Math.cos(p.life * 7 + p.phase) * 0.5 * dt;
          p.vy += p.gravity * dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          break;
        case 4: { // glitch: quantized jitter-teleport
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (Math.floor(p.life * 20) !== Math.floor((p.life + dt) * 20)) {
            p.x += (Math.random() - 0.5) * 0.28;
            p.y += (Math.random() - 0.5) * 0.28;
          }
          break;
        }
        case 5: { // spiral around anchor, radius shrinking, drifting up
          p.ang += p.vx * dt;
          p.rad = Math.max(0.05, p.rad - dt * 0.55);
          p.ay += p.vy * dt;
          p.x = p.ax + Math.cos(p.ang) * p.rad;
          p.y = p.ay + Math.sin(p.ang) * p.rad * 0.7;
          break;
        }
        default:
          p.vy += p.gravity * dt;
          {
            const d = Math.max(0, 1 - p.drag * dt);
            p.vx *= d; p.vy *= d; p.vz *= d;
          }
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          if (p.y < 0.01 && p.kind !== 1) {
            p.y = 0.01;
            p.vy = Math.abs(p.vy) * (p.beh === 3 ? 0.42 : 0.32); // debris bounces harder
            p.vx *= 0.7; p.vz *= 0.7;
          }
          break;
      }
    }
    for (const sl of this.slashes) {
      if (!sl.active) continue;
      sl.life -= dt;
      if (sl.life <= 0) sl.active = false;
    }
    for (const r of this.rings) {
      if (!r.active) continue;
      r.life -= dt;
      if (r.life <= 0) r.active = false;
    }
    for (const a of this.arcs) {
      if (!a.active) continue;
      a.life -= dt;
      if (a.life <= 0) a.active = false;
    }
    if (this.fighters) {
      for (const t of this.trails) {
        if (!t.active) continue;
        t.life -= dt;
        if (t.life <= 0) { t.active = false; continue; }
        t.accum += dt;
        while (t.accum > 0.016) {
          t.accum -= 0.016;
          const f = this.fighters[t.fighter];
          const j = f?.joints[t.joint];
          const x = j ? j.x : f.x;
          const y = j ? j.y : f.y + 1.1;
          const z = j ? j.z : 0;
          const p = this.nextParticle();
          p.active = true; p.x = x; p.y = y; p.z = z;
          p.vx = (Math.random() - 0.5) * 0.4; p.vy = (Math.random() - 0.5) * 0.4; p.vz = (Math.random() - 0.5) * 0.3;
          p.life = 0.24 + Math.random() * 0.14; p.maxLife = p.life;
          p.size = 0.075 + Math.random() * 0.05; p.r = t.r; p.g = t.g; p.b = t.b;
          p.gravity = 0.4; p.drag = 1.4; p.kind = 2;
        }
      }
    }
  }
}

export const vfx = new VFXManager();
