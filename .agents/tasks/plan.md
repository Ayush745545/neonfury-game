# Implementation Plan: Realistic Ground Physics

## Overview
This plan improves ground physics in the Neon Fury fighting game to feel more realistic and weighty through state-dependent friction, hard landing impact feedback, exponential knockback deceleration, ground stickiness, and visual feedback via the event bus.

## Design Decisions

### 1. State-Dependent Friction System
**Decision:** Replace the single `GROUND_FRICTION` constant with a lookup table keyed by `FighterState`, applied in the `physics()` method's ground friction block (currently ~line 1099).

**Rationale:** Different states represent different physical scenarios: idle/walk should stop quickly (high friction), hitstun/knockdown should preserve momentum for satisfying slides (low friction), and attacks need intermediate friction to support root motion without sliding unintentionally.

### 2. Hard Landing Detection
**Decision:** Track vertical velocity at ground contact. When `|vy| > HARD_LANDING_THRESHOLD`, emit shake/dust/sfx events and apply a brief landing-lag stun (`LANDING_LAG_FRAMES`). Landing lag only applies to non-knockdown landings to avoid doubling up with existing knockdown stun.

**Rationale:** High-speed falls (from launchers, wall bounces, or hard knockback) should feel impactful. The threshold distinguishes normal jumps (vy ≈ 11.4 on takeoff, ~3-5 on landing) from violent impacts (vy > 8 when hitting ground).

### 3. Exponential Slide Deceleration
**Decision:** Replace linear multipliers (`f.vx *= 0.82`) in `stepKnockdown` and `stepKoFall` with exponential decay: `f.vx *= exp(-SLIDE_DECAY_RATE * SIM_DT)`. For `stepAirHitstun` post-landing, apply the same decay when transitioning to knockdown.

**Rationale:** Linear `*= 0.82` per frame feels mechanical. Exponential decay (`vx(t) = vx₀ * e^(-kt)`) produces natural physics: fast initial deceleration that smoothly tapers to rest. A decay rate of `k ≈ 1.8` yields similar stopping distance to the current `0.82` but with better feel.

### 4. Ground Stickiness (Micro-Bounce Prevention)
**Decision:** Add a velocity clamp in `physics()` after ground contact: if `|vx| < MICRO_BOUNCE_THRESHOLD` and `grounded`, set `vx = 0` and `vy = 0`.

**Rationale:** Fighters sliding at tiny velocities (< 0.05 units/s) can micro-bounce due to collision resolution and stage clamping. Clamping to zero when below threshold prevents jitter without affecting intentional movement.

### 5. Visual Feedback for Hard Landings
**Decision:** Emit three events via the existing `bus` when hard landing is detected:
- `{ type: 'shake', intensity: 0.5 }` — moderate screen shake
- `{ type: 'vfx', kind: 'dust', x: f.x, y: 0.05, color: '#9fb4c8', power: 3.0 }` — large dust burst
- `{ type: 'sfx', name: 'bodyFall' }` — existing heavy impact sound

**Rationale:** Reuses existing event types and VFX infrastructure. Higher `power` (3.0 vs. current 1.6–2.2) makes the dust burst more prominent. Already-existing handlers in the presentation layer will respond automatically.

---

## New Constants (src/config/constants.ts)

Add the following constants after the existing physics constants (after `AIR_DRAG = 0.6`):

```typescript
/** State-dependent ground friction (deceleration, units/s²) */
export const FRICTION_BY_STATE: Record<string, number> = {
  // High friction: quick stop
  'idle': 18.0,
  'walkF': 18.0,
  'walkB': 18.0,
  'crouch': 18.0,
  'crouchWalkF': 18.0,
  'crouchWalkB': 18.0,
  'victory': 18.0,
  'defeat': 18.0,
  'introWalk': 18.0,
  'introIdle': 18.0,
  // Moderate friction: attacks with root motion
  'attack': 8.5,
  'airAttack': 8.5,
  'blockStand': 12.0,
  'blockCrouch': 12.0,
  'blockstun': 10.0,
  'getup': 14.0,
  // Low friction: preserve knockback slides
  'hitstun': 5.5,
  'knockdown': 4.2,
  'ko': 3.8,
  'airHitstun': 5.5,
  // Zero friction: managed elsewhere
  'jump': 0,
  'dashF': 0,
  'dashB': 0,
  'superVictim': 0,
};

/** Exponential decay rate for knockback slides (1/s). Higher = faster stop. */
export const SLIDE_DECAY_RATE = 1.8;

/** Hard landing threshold: |vy| at ground contact (units/s). Falls harder than this trigger impact feedback. */
export const HARD_LANDING_THRESHOLD = 8.0;

/** Landing lag stun duration for hard landings (frames at 60 Hz). */
export const LANDING_LAG_FRAMES = 6;

/** Micro-bounce prevention: velocities below this are clamped to zero (units/s). */
export const MICRO_BOUNCE_THRESHOLD = 0.05;
```

**Rationale for values:**
- **Friction values:** Tuned relative to current `GROUND_FRICTION = 10.5`. Idle/walk use 18.0 for snappy stops; attacks use 8.5 to allow root motion without excessive slide; knockback states use 4.2–5.5 to preserve satisfying slides.
- **SLIDE_DECAY_RATE = 1.8:** Produces `vx *= e^(-1.8 * 1/60) ≈ 0.97` per frame initially, equivalent stopping distance to current `0.82` but with smooth exponential curve.
- **HARD_LANDING_THRESHOLD = 8.0:** Normal jumps land at ~3–5 units/s; launcher victims land at 10–15 units/s. Threshold of 8.0 catches hard impacts without false positives.
- **LANDING_LAG_FRAMES = 6:** 0.1 second stun (6/60) is noticeable but not punitive — enough to sell the impact without breaking flow.
- **MICRO_BOUNCE_THRESHOLD = 0.05:** Below human perception; prevents jitter without clamping intentional slow movement.

---

## Implementation Steps

### Step 1: Add new constants to constants.ts
**What:** Add the new physics constants detailed above to `src/config/constants.ts` after the existing `AIR_DRAG = 0.6` line (~line 21).

**Files:**
- `src/config/constants.ts`

**Verify:** Run `npm run typecheck` — no TypeScript errors. Run `npm run test` — all existing tests pass (new constants don't break existing code).

---

### Step 2: Implement state-dependent friction in physics()
**What:** Modify the ground friction block in `GameEngine.physics()` (currently lines 1099–1105) to use `FRICTION_BY_STATE` lookup instead of the hardcoded `GROUND_FRICTION` constant. The current code applies friction only to specific states; replace this with a friction lookup for all grounded states not explicitly managed elsewhere (dashF/dashB remain excluded).

**Current code (lines 1099–1105):**
```typescript
if (f.grounded && f.state !== 'dashF' && f.state !== 'dashB' &&
  !['attack', 'hitstun', 'blockstun', 'knockdown', 'ko', 'airHitstun', 'getup', 'superVictim'].includes(f.state)) {
  // ground friction for knockback slides in neutral
  const dec = K.GROUND_FRICTION * K.SIM_DT;
  if (Math.abs(f.vx) <= dec) f.vx = 0;
  else f.vx -= sign(f.vx) * dec;
}
```

**New code:**
```typescript
// State-dependent ground friction
if (f.grounded && f.state !== 'dashF' && f.state !== 'dashB') {
  const frictionRate = K.FRICTION_BY_STATE[f.state] ?? 10.5; // fallback to legacy value
  const dec = frictionRate * K.SIM_DT;
  if (Math.abs(f.vx) <= dec) f.vx = 0;
  else f.vx -= sign(f.vx) * dec;
}
```

**Rationale:** The old exclusion list is no longer needed — `FRICTION_BY_STATE` now encodes per-state friction for all states. The `?? 10.5` fallback ensures safety if a new state is added without a friction entry.

**Files:**
- `src/game/GameEngine.ts` (lines ~1099–1105)

**Verify:** Run `npm run test` — all combat tests pass. Manually test in `npm run dev` → Training mode → launch opponent and observe landing slide feels more natural than before.

---

### Step 3: Add hard landing detection and feedback in physics()
**What:** Modify the ground landing block in `GameEngine.physics()` (currently lines 1088–1096) to detect hard landings (when `|vy| > HARD_LANDING_THRESHOLD`), emit visual/audio feedback events, and apply landing-lag stun to non-knockdown landings.

**Current code (lines 1088–1096):**
```typescript
if (f.y <= 0 && !f.grounded) {
  f.y = 0;
  if (f.vy < -3) {
    f.vx *= 0.55; // landing slide
  }
  f.vy = 0;
  f.grounded = true;
  this.extras[f.id].wallBounced = false;
  if (f.state === 'jump') {
    this.enter(f, 'idle');
    bus.emit({ type: 'sfx', name: 'land' });
    bus.emit({ type: 'vfx', kind: 'dust', x: f.x, y: 0.03, color: '#9fb4c8', power: 1.6 });
  }
}
```

**New code:**
```typescript
if (f.y <= 0 && !f.grounded) {
  f.y = 0;
  const landingSpeed = Math.abs(f.vy);
  const hardLanding = landingSpeed > K.HARD_LANDING_THRESHOLD;
  
  if (f.vy < -3) {
    f.vx *= 0.55; // landing slide
  }
  f.vy = 0;
  f.grounded = true;
  this.extras[f.id].wallBounced = false;
  
  // Hard landing feedback (all falling states)
  if (hardLanding) {
    bus.emit({ type: 'shake', intensity: 0.5 });
    bus.emit({ type: 'vfx', kind: 'dust', x: f.x, y: 0.05, color: '#9fb4c8', power: 3.0 });
    bus.emit({ type: 'sfx', name: 'bodyFall' });
    
    // Landing lag for non-knockdown hard landings (knockdown already has stun)
    if (f.state !== 'airHitstun' || !this.extras[f.id].pendingKnockdown) {
      f.stunFrames = Math.max(f.stunFrames, K.LANDING_LAG_FRAMES);
    }
  }
  
  if (f.state === 'jump') {
    this.enter(f, 'idle');
    // Normal landing sound/dust (only if not hard landing)
    if (!hardLanding) {
      bus.emit({ type: 'sfx', name: 'land' });
      bus.emit({ type: 'vfx', kind: 'dust', x: f.x, y: 0.03, color: '#9fb4c8', power: 1.6 });
    }
  }
}
```

**Rationale:**
- Captures landing speed before zeroing `vy`.
- Hard landings emit intense feedback (shake 0.5, dust power 3.0, bodyFall sfx).
- Landing lag (`stunFrames`) only applies to non-knockdown landings to avoid redundant stun.
- Normal jump landings still get their original subtle feedback if landing speed is below threshold.

**Files:**
- `src/game/GameEngine.ts` (lines ~1088–1096, expanded to ~1088–1112)

**Verify:** Run `npm run test` — existing tests pass. Manual test: Training mode → launcher combo → observe hard landing produces screen shake + large dust burst + impact sound. Normal jumps should still produce gentle dust as before.

---

### Step 4: Implement exponential decay in stepKnockdown, stepKoFall
**What:** Replace linear velocity multipliers (`f.vx *= 0.82` and `f.vx *= 0.85`) with exponential decay using the new `SLIDE_DECAY_RATE` constant in `stepKnockdown()` and `stepKoFall()` methods.

**Current code in `stepKnockdown()` (line 1059):**
```typescript
if (f.grounded) f.vx *= 0.82;
```

**New code:**
```typescript
if (f.grounded) f.vx *= Math.exp(-K.SLIDE_DECAY_RATE * K.SIM_DT);
```

**Current code in `stepKoFall()` (line 1068):**
```typescript
if (f.grounded) f.vx *= 0.85;
```

**New code:**
```typescript
if (f.grounded) f.vx *= Math.exp(-K.SLIDE_DECAY_RATE * K.SIM_DT);
```

**Rationale:** Both methods should use the same exponential decay for consistency. The KO fall can have slightly slower decay if desired (e.g., `SLIDE_DECAY_RATE * 0.9`), but using the same rate simplifies tuning. The exponential decay produces smooth, natural deceleration: `vx(t) = vx₀ * e^(-1.8t)`.

**Files:**
- `src/game/GameEngine.ts` (`stepKnockdown()` line ~1059, `stepKoFall()` line ~1068)

**Verify:** Run `npm run test` — all tests pass. Manual test: Training mode → knockdown opponent → observe slide decelerates smoothly (fast initially, then tapers) instead of linearly.

---

### Step 5: Apply exponential decay to knockdown transition in stepAirHitstun
**What:** When `stepAirHitstun()` transitions to knockdown state on landing (lines 1042–1047), cap the initial `vx` as it currently does, but then on subsequent frames the exponential decay from Step 4 will handle deceleration (since knockdown state's decay was updated in Step 4).

**Current code (lines 1042–1047):**
```typescript
if (ex.pendingKnockdown || f.stunFrames > 6) {
  this.enter(f, 'knockdown');
  f.vx = sign(f.vx) * Math.min(Math.abs(f.vx), 3.2);
  ex.pendingKnockdown = false;
  bus.emit({ type: 'sfx', name: 'bodyFall' });
  bus.emit({ type: 'vfx', kind: 'dust', x: f.x, y: 0.04, color: '#9fb4c8', power: 2.2 });
  bus.emit({ type: 'shake', intensity: 0.35 });
}
```

**New code (no functional change needed — the existing clamping + Step 4's exponential decay in knockdown state is sufficient):**
```typescript
// No change needed in stepAirHitstun transition code.
// The initial vx cap (3.2) remains; subsequent deceleration handled by stepKnockdown exponential decay (Step 4).
```

**Rationale:** The existing `vx` clamping on knockdown entry is appropriate (prevents excessive slide speed). Once in knockdown state, Step 4's exponential decay takes over. The hard landing feedback added in Step 3 already covers this transition with shake/dust/sfx.

**Files:**
- `src/game/GameEngine.ts` (lines ~1042–1047) — NO CODE CHANGE in this step; documented for clarity.

**Verify:** No new code; verified by Step 4's test. Manual test: Training mode → launcher → knockdown landing → observe smooth exponential slide deceleration + hard landing feedback.

---

### Step 6: Add ground stickiness (micro-bounce prevention) in physics()
**What:** Add velocity clamping in `physics()` after the ground landing block to prevent micro-bounces when velocity is below `MICRO_BOUNCE_THRESHOLD`.

**Location:** Insert after the ground landing block (after line ~1096, before the `clampToStage()` call at ~1107).

**New code:**
```typescript
// Ground stickiness: prevent micro-bounces
if (f.grounded && Math.abs(f.vx) < K.MICRO_BOUNCE_THRESHOLD) {
  f.vx = 0;
}
if (f.grounded && Math.abs(f.vy) < K.MICRO_BOUNCE_THRESHOLD) {
  f.vy = 0;
}
```

**Rationale:** When fighters slide to near-zero velocity, floating-point precision and collision resolution can cause tiny oscillations. Clamping to exactly zero when below 0.05 units/s eliminates visible jitter without affecting intentional movement (walk speed is ~3–5 units/s, well above threshold).

**Files:**
- `src/game/GameEngine.ts` (insert after line ~1096)

**Verify:** Run `npm run test` — all tests pass. Manual test: Training mode → let opponent slide to rest after knockdown → confirm no micro-bouncing or vibration at the end of slide.

---

### Step 7: Write unit tests for new physics behavior
**What:** Add test cases to `src/tests/combat.test.ts` covering:
1. **State-dependent friction:** Verify idle state decelerates faster than knockdown state given the same initial `vx`.
2. **Hard landing detection:** Verify landing with `vy < -8` emits shake/dust/bodyFall events and applies landing-lag stun.
3. **Exponential decay:** Verify knockdown slide velocity follows exponential curve (not linear).
4. **Micro-bounce prevention:** Verify `vx` clamps to zero when below threshold.

**Test pseudocode:**
```typescript
describe('realistic ground physics', () => {
  it('idle state decelerates faster than knockdown state', () => {
    const e = makeEngine();
    const f1 = e.match.fighters[0];
    const f2 = e.match.fighters[1];
    f1.state = 'idle'; f1.vx = 5.0; f1.grounded = true;
    f2.state = 'knockdown'; f2.vx = 5.0; f2.grounded = true;
    drive(e, 10, () => [nop(), nop()]);
    // idle should decelerate faster due to higher friction
    expect(Math.abs(f1.vx)).toBeLessThan(Math.abs(f2.vx));
  });

  it('hard landing triggers shake, dust, sfx, and landing lag', () => {
    const e = makeEngine();
    const events: any[] = [];
    bus.on((ev) => events.push(ev));
    const f = e.match.fighters[0];
    f.state = 'jump'; f.y = 2.0; f.vy = -10.0; f.grounded = false; // simulate hard fall
    drive(e, 5, () => [nop(), nop()]); // let physics settle landing
    expect(events.some(ev => ev.type === 'shake' && ev.intensity >= 0.5)).toBe(true);
    expect(events.some(ev => ev.type === 'vfx' && ev.kind === 'dust' && ev.power >= 3.0)).toBe(true);
    expect(events.some(ev => ev.type === 'sfx' && ev.name === 'bodyFall')).toBe(true);
    expect(f.stunFrames).toBeGreaterThanOrEqual(6); // landing lag applied
  });

  it('knockdown slide uses exponential decay', () => {
    const e = makeEngine();
    const f = e.match.fighters[0];
    f.state = 'knockdown'; f.vx = 10.0; f.grounded = true;
    const vxSamples: number[] = [];
    for (let i = 0; i < 30; i++) {
      vxSamples.push(f.vx);
      drive(e, 1, () => [nop(), nop()]);
    }
    // exponential decay: rate of change slows over time
    const earlyRate = vxSamples[5] - vxSamples[10]; // frames 5-10
    const lateRate = vxSamples[15] - vxSamples[20]; // frames 15-20
    expect(Math.abs(earlyRate)).toBeGreaterThan(Math.abs(lateRate)); // decay slows
  });

  it('micro-bounce prevention clamps tiny velocities to zero', () => {
    const e = makeEngine();
    const f = e.match.fighters[0];
    f.state = 'idle'; f.vx = 0.03; f.grounded = true; // below threshold
    drive(e, 1, () => [nop(), nop()]);
    expect(f.vx).toBe(0); // clamped
  });
});
```

**Files:**
- `src/tests/combat.test.ts` (add new `describe` block at end of file)

**Verify:** Run `npm run test` — all new tests pass, existing tests remain green.

---

### Step 8: Manual playtesting and tuning
**What:** Launch the game in dev mode and manually test all scenarios:
1. **Idle/walk stop:** Move and release input → should stop quickly and smoothly.
2. **Knockback slide:** Get hit → hitstun/knockdown slide should feel weighty and natural (not mechanical).
3. **Hard landing:** Get launched → landing should produce screen shake + large dust burst + impact sound.
4. **Attack root motion:** Execute specials/supers with `advance` → root motion should feel intentional without excessive slide.
5. **No micro-bounce:** Let a knocked-down opponent slide to rest → should stop cleanly without vibration.

If any behavior feels off, adjust the constants in `constants.ts`:
- Increase `FRICTION_BY_STATE` values to stop faster.
- Decrease `SLIDE_DECAY_RATE` to make slides longer.
- Adjust `HARD_LANDING_THRESHOLD` to change impact sensitivity.
- Tune `LANDING_LAG_FRAMES` for desired stun duration.

**Files:**
- `src/config/constants.ts` (tuning adjustments if needed)

**Verify:** No automated verification; relies on feel. Ensure no regressions in combo system, netplay, or existing gameplay flow. Run `npm run test` after any tuning changes to confirm no test breakage.

---

## No-Change List: What Must NOT Be Touched

1. **Move system (`src/combat/moves.ts`):** All frame data, hitboxes, and `advance` definitions remain unchanged. The new friction system works with existing root motion.

2. **Hit detection (`src/combat/hitDetection.ts`):** No changes to hitbox/hurtbox collision math or block matrix logic.

3. **Netplay lockstep (`GameEngine.stepNet()` and `src/net/`):** The physics changes are deterministic (no randomness, same constants for both peers), so netplay checksums will remain valid. No changes to input encoding or snapshot logic.

4. **State transitions outside physics:** Methods like `enter()`, `tryBurstEscape()`, `stepAttack()`, `stepStun()`, `stepSuperVictim()` remain untouched. Only `physics()`, `stepKnockdown()`, `stepKoFall()`, and `stepAirHitstun()` are modified.

5. **Event bus and VFX infrastructure:** No changes to `eventBus.ts`, VFX pool, or audio engine. New events use existing types (`shake`, `vfx` with `dust` kind, `sfx` with `bodyFall` name).

6. **Combat timing and frame data:** Startup/active/recovery frames, hitstop, hitstun, blockstun, combo scaling, meter gain — all remain unchanged. The physics changes only affect *post-hit* ground behavior, not attack timing or damage.

7. **Camera, UI, and presentation layer:** No changes to `CameraDirector`, HUD, menus, or 3D rendering. The presentation layer reacts to the new events automatically via existing event handlers.

---

## Summary

This plan introduces realistic ground physics through five coordinated changes:

1. **State-dependent friction** (Step 2) — differentiate idle/attack/knockback friction for appropriate stopping behavior per state.
2. **Hard landing impact** (Step 3) — detect high-speed landings and emit shake/dust/sfx + landing-lag stun for visceral feedback.
3. **Exponential slide decay** (Steps 4–5) — replace linear deceleration with natural exponential curve for knockback slides.
4. **Ground stickiness** (Step 6) — clamp tiny velocities to eliminate micro-bouncing.
5. **Visual feedback** (integrated in Step 3) — reuse existing event bus to trigger screen shake, dust bursts, and impact sounds.

All changes are deterministic (safe for netplay), performance-conscious (simple math in hot loop), and isolated to the physics layer (no move system or UI changes). The plan preserves existing gameplay while adding weight and impact to ground interactions.
