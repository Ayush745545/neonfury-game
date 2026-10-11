import type { AABB, FighterRuntime } from '../game/types';
import { hurtboxFor } from '../fighters/characters';
import { BODY_PUSH_DIST } from '../config/constants';

/* Pure collision math — no side effects, unit-testable. */

export function aabbOverlap(a: AABB, b: AABB): boolean {
  return (
    Math.abs(a.cx - b.cx) * 2 < a.w + b.w &&
    Math.abs(a.cy - b.cy) * 2 < a.h + b.h
  );
}

/** World-space hurtbox of a fighter for its current state. */
export function getHurtbox(f: FighterRuntime): AABB {
  const h = hurtboxFor(f.state, f.crouching, !f.grounded);
  return { cx: f.x + h.x, cy: f.y + h.y, w: h.w, h: h.h };
}

/** World-space hitbox given facing + root offsets. */
export function getHitboxWorld(
  f: FighterRuntime,
  box: { x: number; y: number; w: number; h: number },
): AABB {
  return { cx: f.x + f.facing * box.x, cy: f.y + box.y, w: box.w, h: box.h };
}

/** Can this fighter be hit right now? */
export function isVulnerable(f: FighterRuntime): boolean {
  if (f.invulnFrames > 0) return false;
  if (f.state === 'ko' || f.state === 'victory' || f.state === 'defeat') return false;
  if (f.state === 'introWalk' || f.state === 'introIdle') return false;
  return true;
}

/**
 * Body push-out: fighters cannot occupy the same space. Knocked-down
 * bodies don't push. Returns nothing; mutates x positions.
 */
export function resolveBodyCollision(a: FighterRuntime, b: FighterRuntime): void {
  const aDown = a.state === 'knockdown' || a.state === 'ko' || a.state === 'getup';
  const bDown = b.state === 'knockdown' || b.state === 'ko' || b.state === 'getup';
  if (aDown || bDown) return;
  const dx = b.x - a.x;
  const dist = Math.abs(dx);
  if (dist >= BODY_PUSH_DIST || dist === 0) return;
  const push = (BODY_PUSH_DIST - dist) / 2;
  const s = dx > 0 ? 1 : -1;
  a.x -= push * s;
  b.x += push * s;
}

/** Which defensive level a block type stops. */
export function blockBeatsLevel(
  blockType: 'stand' | 'crouch',
  level: 'high' | 'mid' | 'low',
): boolean {
  if (level === 'mid') return true;
  if (level === 'high') return blockType === 'stand'; // overheads crush crouch block
  return blockType === 'crouch';                      // lows crush stand block
}
