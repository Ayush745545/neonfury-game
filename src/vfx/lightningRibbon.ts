import type { Arc } from './vfxManager';

export const LIGHTNING_SEGMENTS = 12;
export const LIGHTNING_BRANCH_SEGMENTS = 4;
export const LIGHTNING_VERTICES_PER_ARC = (LIGHTNING_SEGMENTS + LIGHTNING_BRANCH_SEGMENTS * 2) * 6;

export interface LightningBuffers {
  position: Float32Array;
  color: Float32Array;
  uv: Float32Array;
}

/** Writes camera-facing quads into preallocated buffers. No per-frame geometry. */
export function writeLightningRibbon(
  arc: Arc, tick: number, camera: { x: number; y: number; z: number },
  buffers: LightningBuffers, offset: number, branches = true, brightness = 1,
): number {
  const fade = Math.pow(Math.max(0, arc.life / arc.maxLife), 0.6) * brightness;
  const length = Math.hypot(arc.x2 - arc.x1, arc.y2 - arc.y1, arc.z2 - arc.z1);
  const jitter = Math.min(0.19, 0.045 + length * 0.05);

  const segment = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, width: number) => {
    const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
    const vx = camera.x - (x1 + x2) * 0.5;
    const vy = camera.y - (y1 + y2) * 0.5;
    const vz = camera.z - (z1 + z2) * 0.5;
    let sx = dy * vz - dz * vy, sy = dz * vx - dx * vz, sz = dx * vy - dy * vx;
    let len = Math.hypot(sx, sy, sz);
    if (len < 0.00001) { sx = 1; sy = 0; sz = 0; len = 1; }
    sx *= width / len; sy *= width / len; sz *= width / len;
    for (let v = 0; v < 6; v++) {
      // Two triangles: A-/A+/B-, then A+/B+/B-.
      const end = v === 2 || v === 4 || v === 5;
      const side = v === 1 || v === 3 || v === 4 ? 1 : -1;
      const i = offset++;
      buffers.position[i * 3] = (end ? x2 : x1) + sx * side;
      buffers.position[i * 3 + 1] = (end ? y2 : y1) + sy * side;
      buffers.position[i * 3 + 2] = (end ? z2 : z1) + sz * side;
      buffers.color[i * 3] = arc.r * fade;
      buffers.color[i * 3 + 1] = arc.g * fade;
      buffers.color[i * 3 + 2] = arc.b * fade;
      buffers.uv[i * 2] = end ? 1 : 0;
      buffers.uv[i * 2 + 1] = side > 0 ? 1 : 0;
    }
  };

  let px = arc.x1, py = arc.y1, pz = arc.z1;
  for (let s = 1; s <= LIGHTNING_SEGMENTS; s++) {
    const t = s / LIGHTNING_SEGMENTS;
    const envelope = Math.sin(t * Math.PI);
    const nx = arc.x1 + (arc.x2 - arc.x1) * t + Math.sin(arc.seed * 13.7 + s * 7.3 + tick * 1.7) * jitter * envelope;
    const ny = arc.y1 + (arc.y2 - arc.y1) * t + Math.cos(arc.seed * 9.1 + s * 11.9 + tick * 2.3) * jitter * envelope;
    const nz = arc.z1 + (arc.z2 - arc.z1) * t + Math.sin(arc.seed + s * 2.9 + tick) * jitter * envelope * 0.45;
    segment(px, py, pz, nx, ny, nz, 0.035 * (0.65 + fade * 0.35));
    if (branches && (s === 4 || s === 8)) {
      const branchAngle = arc.seed + s * 1.5;
      const branchLength = Math.min(0.65, length * 0.4 + 0.15);
      let bx = nx, by = ny, bz = nz;
      for (let b = 1; b <= LIGHTNING_BRANCH_SEGMENTS; b++) {
        const f = b / LIGHTNING_BRANCH_SEGMENTS;
        const branchJitter = Math.sin(arc.seed * 3 + b * 7 + tick) * 0.05 * Math.sin(f * Math.PI);
        const ex = nx + Math.cos(branchAngle) * branchLength * f + branchJitter;
        const ey = ny + Math.sin(branchAngle) * branchLength * f - branchJitter;
        const ez = nz + f * 0.12;
        segment(bx, by, bz, ex, ey, ez, 0.021 * (1 - f * 0.5));
        bx = ex; by = ey; bz = ez;
      }
    }
    px = nx; py = ny; pz = nz;
  }
  return offset;
}
