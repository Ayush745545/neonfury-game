# Ground physics rewrite for state-dependent friction

Replaces linear single-rate ground friction with state-dependent exponential decay. The core physics() method now applies friction rates tuned to behavioral context: neutral states stop quickly (FRICTION_IDLE = 38), hitstun slides moderately (FRICTION_HITSTUN = 14), knockdown slides long (FRICTION_KNOCKDOWN = 7), KO corpses coast (FRICTION_KO = 5). States that own their velocity (dash, attack with root motion) return null from groundFrictionRate() and skip friction entirely.

Landing impact detection added with three thresholds: soft (4 m/s), medium (9 m/s), hard (16 m/s). Each tier triggers proportional VFX/SFX and velocity damping. Hard landings apply brief stun frames to fighters in jump state.

**Watch for:** stepAir emits 'land' sfx + dust VFX unconditionally on grounded transitions, which will double-fire with physics() hard/medium landing events when a jump lands at high velocity **(confirmed)**. Jump state not explicitly listed in groundFrictionRate switch, relies on default case **(confirmed, minor)**.

**Verdict**: NEEDS_CHANGES

## High-level view

The exponential decay formula `vx *= exp(-rate * dt)` is mathematically correct and frame-rate-independent.

Jump and airHitstun states aren't explicitly listed in the groundFrictionRate switch but are caught by the default case. They're typically airborne and skip the grounded guard.

The old GROUND_FRICTION constant is unused (dead export).

stepAir emits 'land' + dust on every grounded transition, which double-fires with physics() landing events when a jump lands at velocity ≥ 9 m/s.

<details>
<summary>Issues (2)</summary>

1. **Double-fire landing events** — stepAir unconditionally emits 'land' sfx + dust (power 1.6) on grounded transitions for jump state. When a jump lands with impactVy ≥ 9 (medium threshold), physics() also emits 'land' + dust (power 1.8) or 'bodyFall' + burst (hard). Remove the stepAir emissions; physics() now handles all landing feedback.

2. **Jump state not explicit in groundFrictionRate** — 'jump' and 'airHitstun' aren't listed in the switch. They're typically airborne so shouldn't reach the friction code, but for clarity add them explicitly returning FRICTION_IDLE or null to document the intent.

</details>

<details>
<summary>Details</summary>

## Determinism

No non-deterministic calls in the physics path. Date.now() appears only in the constructor for seed generation (outside the sim loop).

## Exponential decay formula

```typescript
const decay = Math.exp(-frictionRate * K.SIM_DT);
f.vx *= decay;
if (Math.abs(f.vx) < K.SLIDE_LINEAR_THRESHOLD) f.vx = 0;
```

Correct discrete integration of continuous exponential decay. Frame-rate-independent by construction.

## State coverage in groundFrictionRate

FighterState has 21 members. Missing from explicit handling: jump, airHitstun. These are airborne states that normally skip the `if (f.grounded)` guard, so they reach groundFrictionRate only in edge-case transitions. The default case catches them.

## Old GROUND_FRICTION constant removal

GROUND_FRICTION (10.5) is still exported from constants.ts but zero references exist in TypeScript source files. Dead export.

## Removed vx multipliers from step methods

stepStun, stepKnockdown, stepKoFall no longer manipulate vx per-frame. Physics() handles all ground friction.

## Landing event double-fire

stepAir emits 'land' + dust unconditionally on grounded transitions (lines 641-642). physics() landing detection emits events based on impactVy thresholds. When a jump lands with impactVy ≥ 9:

- Frame N: physics() sets grounded=true, emits landing events
- Frame N+1: stepAir sees grounded=true, emits 'land' + dust again

Hard landings (impactVy ≥ 16) avoid this by transitioning directly to hitstun state, routing to stepStun instead of stepAir next frame. Medium landings (9 ≤ impactVy < 16) and soft landings (< 9) double-fire.

Remove stepAir lines 641-642. Physics() now owns all landing VFX/SFX.

## Compile cleanliness

No TypeScript errors by inspection. All constants defined, groundFrictionRate signature matches usage, no missing imports.

</details>

<details>
<summary>File map</summary>

- **src/config/constants.ts** — Added FRICTION_IDLE (38), FRICTION_ATTACK (18, unused in current code), FRICTION_HITSTUN (14), FRICTION_KNOCKDOWN (7), FRICTION_KO (5). Added LAND_IMPACT_SOFT (4), LAND_IMPACT_MEDIUM (9), LAND_IMPACT_HARD (16), LAND_HARD_STUN_FRAMES (4), LAND_VX_DAMP_SOFT (0.72), LAND_VX_DAMP_HARD (0.38), SLIDE_DECAY_RATE (8.5), SLIDE_LINEAR_THRESHOLD (0.8). Old GROUND_FRICTION (10.5) remains but unused.

- **src/game/GameEngine.ts** — Rewrote physics() method to apply exponential ground friction via groundFrictionRate() lookup, added landing impact detection with three thresholds and proportional VFX/SFX/damping. Added groundFrictionRate() method mapping FighterRuntime states to friction constants (returns null for dash/attack, state-specific rates for others, default to FRICTION_IDLE). Removed vx multipliers from stepStun, stepKnockdown, stepKoFall (now handled by physics()). stepAir still emits 'land' + dust on grounded transition (double-fires with physics() medium/soft landings).

</details>
