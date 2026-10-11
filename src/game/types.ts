/**
 * Core shared types for the NEON FURY combat simulation.
 * The sim (game/, combat/, ai/) is pure TypeScript with zero React/three
 * imports so it can run headless in tests.
 */

export type CharId =
  | 'ryden' | 'kaito' | 'vesper' | 'gruun' | 'yuki' | 'ember' | 'volt' | 'nyx'
  | 'oracle' | 'slab' | 'sable' | 'hex' | 'solara' | 'fen' | 'zero';

export type MatchMode = 'arcade' | 'vs-cpu' | 'local' | 'training' | 'net';

export type MatchPhase =
  | 'intro'        // 12s cinematic (arcade start only)
  | 'round_intro'  // ROUND X / FIGHT! announcements
  | 'fight'
  | 'ko'           // finishing cinematic (slow-mo)
  | 'round_end'    // victory pose before next round
  | 'match_end'
  | 'paused'
  | 'training';

export type FighterState =
  | 'idle' | 'walkF' | 'walkB' | 'crouch' | 'crouchWalkF' | 'crouchWalkB'
  | 'jump' | 'dashF' | 'dashB'
  | 'blockStand' | 'blockCrouch'
  | 'attack' | 'airAttack'
  | 'hitstun' | 'airHitstun' | 'blockstun'
  | 'knockdown' | 'getup' | 'ko'
  | 'superVictim'
  | 'victory' | 'defeat'
  | 'introWalk' | 'introIdle';

export type AttackHeight = 'high' | 'mid' | 'low';

export type ActionId =
  | 'left' | 'right' | 'up' | 'down'
  | 'lp' | 'hp' | 'lk' | 'hk'
  | 'block' | 'special' | 'super' | 'ability';

export interface InputSnapshot {
  /** held this frame */
  left: boolean; right: boolean; up: boolean; down: boolean; block: boolean;
  /** pressed this frame (single-frame edges; buffered by the sim) */
  lp: boolean; hp: boolean; lk: boolean; hk: boolean;
  special: boolean; super: boolean; ability: boolean; upEdge: boolean;
  dashF: boolean; dashB: boolean;
}

export const emptyInput = (): InputSnapshot => ({
  left: false, right: false, up: false, down: false, block: false,
  lp: false, hp: false, lk: false, hk: false,
  special: false, super: false, ability: false, upEdge: false, dashF: false, dashB: false,
});

/** One damaging window of a move (a move may have several for multi-hits). */
export interface HitboxDef {
  t0: number; t1: number;           // active frames, relative to move start
  x: number; y: number;             // offset from root; +x = facing direction
  w: number; h: number;             // full width/height (world units)
  level: AttackHeight;
  damage: number;
  hitstun: number;
  blockstun: number;
  hitstopSelf: number;
  hitstopVictim: number;
  knockX: number;                   // horizontal push (units/s)
  knockY: number;                   // 0 = grounded stun, >0 launches
  effect: 'spark' | 'heavy' | 'launch' | 'knockdown' | 'electric' | 'energy';
  cancels?: string[];               // moves this hit may cancel into
}

export interface AdvanceDef { t0: number; t1: number; vx: number; vy?: number }
export interface VfxCue { frame: number; type: string; x?: number; y?: number; color?: string }

export interface ProjectileSpawn {
  frame: number;
  speed: number;
  damage: number;
  color: string;
  size: number;          // world radius
  hitstun: number;
  blockstun: number;
  knockX: number;
  knockY: number;
  level: AttackHeight;
  life: number;          // frames
  beam?: boolean;        // big super-style projectile
}

export interface MoveDef {
  id: string;
  char: CharId;
  name: string;
  kind: 'normal' | 'command' | 'special' | 'super';
  spawn?: ProjectileSpawn;
  air?: boolean;
  crouch?: boolean;
  startup: number;
  active: number;
  recovery: number;
  hitboxes: HitboxDef[];
  advance?: AdvanceDef[];           // root motion during the move
  vfx?: VfxCue[];
  meterCost: number;
  anim: string;                     // animation id played by the view
  sfx: 'punchL' | 'punchH' | 'kickL' | 'kickH' | 'special' | 'super';
  chains?: string[];                // normals this move chains into (on hit)
  specialCancel?: boolean;          // can cancel into special/super on hit
  invuln?: { t0: number; t1: number };
  pushbackSelf?: number;            // slide back when the move blocks
  /** scripted super sequence after the opening hit connects */
  superHits?: { frame: number; damage: number; effect: 'spark' | 'heavy' | 'electric' | 'energy' }[];
  superEndLaunch?: boolean;
  hitAdv?: number;                  // informational frame advantage on hit
}

export interface HurtboxDef { x: number; y: number; w: number; h: number }

export interface AABB { cx: number; cy: number; w: number; h: number }

export interface CharacterStats {
  walkF: number; walkB: number;
  crouchWalkF: number; crouchWalkB: number;
  jumpVY: number;
  dashFSpeed: number; dashFTime: number;
  dashBSpeed: number; dashBTime: number;
}

export interface AnimState {
  name: string;
  frame: number;
}

export interface BufferedInput { action: ActionId; frame: number }

export type AbilityKind =
  | 'damageBuff' | 'teleport' | 'drain' | 'armor' | 'speed' | 'counter'
  | 'shockwave' | 'invuln' | 'meterGain' | 'gravityPull' | 'secondWind'
  | 'drainField' | 'projBurst' | 'berserk' | 'overclock';

export interface ActiveAbility {
  kind: AbilityKind;
  until: number;         // match.frame when the buff expires
  mult: number;          // generic strength parameter
}

export interface Projectile {
  id: number;
  owner: 0 | 1;
  x: number; y: number;
  vx: number;
  damage: number;
  hitstun: number;
  blockstun: number;
  level: AttackHeight;
  w: number; h: number;
  color: string;
  life: number;
  knockX: number;
  knockY: number;
  beam: boolean;
  dead: boolean;
}

export interface FighterRuntime {
  id: 0 | 1;
  char: CharId;
  cpu: boolean;
  abilityCd: number;             // frames until the unique ability recharges
  abilityBuff: ActiveAbility | null;
  overclockAcc: number;
  x: number; y: number;
  vx: number; vy: number;
  facing: 1 | -1;
  health: number;
  meter: number;
  roundsWon: number;
  state: FighterState;
  stateFrame: number;
  move: MoveDef | null;
  moveHitFlags: boolean[];
  hitstop: number;
  stunFrames: number;
  crouching: boolean;
  grounded: boolean;
  blockHeld: boolean;
  combo: number;          // hits landed in the current combo (as attacker)
  comboDamage: number;
  lastChain: string | null;
  chainsUsed: number;
  invulnFrames: number;
  buffer: BufferedInput[];
  anim: AnimState;
  superTimeline: { hits: { frame: number; damage: number; effect: string }[]; next: number } | null;
  noDamageFor: number;    // training regen
  lastHitPower: number;   // damage of the most recent hit taken (view reactions)
  /** world-space joint positions filled by the view (for camera close-ups) */
  joints: Record<string, { x: number; y: number; z: number }>;
  stats: CharacterStats;
}

export interface MatchRuntime {
  mode: MatchMode;
  phase: MatchPhase;
  frame: number;
  projectiles: Projectile[];
  nextProjId: number;
  phaseFrame: number;
  round: number;
  timeLeft: number;
  timerFrames: number;
  fighters: [FighterRuntime, FighterRuntime];
  koWinner: 0 | 1 | 'double' | 'time' | null;
  matchWinner: 0 | 1 | 'double' | null;
  timeScale: number;
  timeScaleTarget: number;
  introSkipped: boolean;
  rng: () => number;
  seed: number;
  training: { dummy: 'idle' | 'block' | 'random'; infiniteHealth: boolean; showHitboxes: boolean };
  hitConfirm: { attacker: 0 | 1 | null; frame: number } | null;
  pausedFrom: MatchPhase | null;
  stats: [{ maxCombo: number; damage: number }, { maxCombo: number; damage: number }];
}

/** Events emitted by the engine; consumed by VFX / audio / camera / UI. */
export type GameEvent =
  | { type: 'hit'; x: number; y: number; z: number; power: number; blocked: boolean; counter: boolean; effect: string; color: string; attacker: 0 | 1; char?: CharId; defender?: CharId }
  | { type: 'whiff'; x: number; y: number; color: string; heavy: boolean }
  | { type: 'vibrate'; player: 0 | 1; pattern: 'lightHit' | 'mediumHit' | 'heavyHit' | 'counterHit' | 'block' | 'launch' | 'knockdown' | 'special' | 'super' | 'roundStart' | 'victory' | 'damage'; intensity?: number; duration?: number }
  | { type: 'ko'; winner: 0 | 1 | 'double' | 'time' }
  | { type: 'roundWin'; winner: 0 | 1 | 'double' }
  | { type: 'matchEnd'; winner: 0 | 1 | 'double' | null }
  | { type: 'announce'; text: string; sub?: string; style?: 'round' | 'fight' | 'ko' | 'big'; side?: 0 | 1; color?: string }
  | { type: 'camera'; mode: string; intensity?: number; duration?: number }
  | { type: 'shake'; intensity: number }
  | { type: 'flash'; intensity: number; color?: string }
  | { type: 'slowmo'; scale: number; frames: number }
  | { type: 'sfx'; name: string; gain?: number; pan?: number; char?: CharId }
  | { type: 'vfx'; kind: string; x: number; y: number; z?: number; color?: string; dir?: number; power?: number; attacker?: 0 | 1; char?: CharId }
  | { type: 'superStart'; attacker: 0 | 1; x: number; y: number; color: string };
