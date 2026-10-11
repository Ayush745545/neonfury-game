/**
 * NEON FURY — global tuning constants.
 * Everything combat/physics related is expressed in SIM FRAMES (60 Hz) or
 * world units (1 unit ≈ 1 meter) so the simulation stays deterministic.
 */

export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;

/** Playfield */
export const STAGE_LIMIT = 6.6;          // hard wall for fighters (|x|)
export const STAGE_FLOOR_Y = 0;
export const BODY_PUSH_DIST = 0.62;      // minimum separation between roots
export const FIGHTER_START_X = 1.9;      // round start offset from center

/** Physics (units / second, integrated at SIM_DT) */
export const GRAVITY = -31;
export const JUMP_VY = 11.4;
export const JUMP_VX_FACTOR = 0.62;      // horizontal momentum from held dir at takeoff
export const GROUND_FRICTION = 10.5;     // knockback slide decel
export const AIR_DRAG = 0.6;

// State-dependent ground friction (units/s² deceleration)
export const FRICTION_IDLE = 38;          // quick stop for neutral states
export const FRICTION_ATTACK = 18;        // moderate — committed but not glued
export const FRICTION_HITSTUN = 14;       // slides a bit — felt the hit
export const FRICTION_KNOCKDOWN = 7;      // long slide — knocked down hard
export const FRICTION_KO = 5;             // corpse slide

// Landing impact
export const LAND_IMPACT_SOFT = 4;        // |vy| threshold for normal land (no extra effect)
export const LAND_IMPACT_MEDIUM = 9;      // |vy| threshold for dust + light shake
export const LAND_IMPACT_HARD = 16;       // |vy| threshold for burst + heavy shake + stun
export const LAND_HARD_STUN_FRAMES = 4;   // brief landing lag on a hard fall
export const LAND_VX_DAMP_SOFT = 0.72;    // vx multiplier on soft landing
export const LAND_VX_DAMP_HARD = 0.38;    // vx multiplier on hard landing

// Slide deceleration curve (exponential blend factor per second)
export const SLIDE_DECAY_RATE = 8.5;      // higher = faster exponential taper
export const SLIDE_LINEAR_THRESHOLD = 0.8; // below this speed, switch to instant stop

/** Rounds */
export const ROUND_TIME = 99;            // seconds
export const ROUNDS_TO_WIN = 2;          // best of three
export const MAX_HEALTH = 1000;
export const MAX_METER = 100;
export const SPECIAL_METER_COST = 25;
export const SUPER_METER_COST = 100;

/** Combo / damage */
export const COMBO_SCALE_STEP = 0.085;   // per successive hit
export const COMBO_SCALE_MIN = 0.35;
export const COUNTER_HIT_MULT = 1.3;
export const CHIP_FRACTION = 0.08;       // specials chip on block (never kills)
export const INPUT_BUFFER_FRAMES = 8;    // buffered presses stay actionable
export const DOUBLE_TAP_WINDOW = 14;     // frames for dash double-tap

/** Knockdown / wake-up */
export const KNOCKDOWN_LIE_FRAMES = 26;
export const WAKEUP_FRAMES = 20;
export const WAKEUP_INVULN_FRAMES = 8;

/** KO cinematic (sim frames) */
export const KO_SLOWMO_FRAMES = 110;
export const KO_SLOWMO_SCALE = 0.25;
export const KO_PHASE_FRAMES = 235;
export const ROUND_END_FRAMES = 190;

/** Intro cinematic */
export const INTRO_FRAMES = 12 * SIM_HZ; // 12 seconds @60fps

/** Meter gains */
export const METER_ON_HIT = 7;
export const METER_ON_BLOCK = 3.5;
export const METER_ON_HURT = 9;
export const METER_ON_WHIFF = 1.5;

/** Unique abilities — 15 second cooldown as specified */
export const ABILITY_COOLDOWN_FRAMES = 15 * SIM_HZ; // 900 frames = 15s

/** Training */
export const TRAINING_REGEN_DELAY = 110; // frames without damage before regen
export const TRAINING_REGEN_RATE = 6;    // hp / frame
