import type {
  AABB, ActionId, CharId, FighterRuntime, HitboxDef, InputSnapshot, MatchMode, MatchRuntime, MoveDef, Projectile,
} from './types';
import { emptyInput } from './types';
import { bus } from './eventBus';
import { getMove, resolveMoveId } from '../combat/moves';
import { aabbOverlap, getHitboxWorld, getHurtbox, isVulnerable, resolveBodyCollision, blockBeatsLevel } from '../combat/hitDetection';
import { CHARACTERS } from '../fighters/characters';
import { CpuBrain } from '../ai/cpuBrain';
import { useMatchStore } from './matchStore';
import { mulberry32, sign, clamp } from './utils';
import * as K from '../config/constants';

/* ================================================================== */
/*  NEON FURY game engine — fixed 60 Hz deterministic combat sim.     */
/*  Zero rendering imports: runs headless in tests, driven by rAF     */
/*  (through useFrame) in the browser.                                */
/* ================================================================== */

/** phaseFrame the intro hands off at, so round_intro skips announcements */
const ROUND_INTRO_RESUME = 200;

export interface EngineOptions {
  mode: MatchMode;
  p1Char: CharId;
  p2Char: CharId;
  difficulty?: 'easy' | 'normal' | 'hard';
  seed?: number;
  playIntro?: boolean;
}

function createFighter(id: 0 | 1, char: CharId, cpu: boolean): FighterRuntime {
  const def = CHARACTERS[char];
  return {
    id, char, cpu,
    abilityCd: 0,
    abilityBuff: null,
    overclockAcc: 0,
    x: id === 0 ? -K.FIGHTER_START_X : K.FIGHTER_START_X,
    y: 0, vx: 0, vy: 0,
    facing: id === 0 ? 1 : -1,
    health: K.MAX_HEALTH,
    meter: 0,
    roundsWon: 0,
    state: 'idle',
    stateFrame: 0,
    move: null,
    moveHitFlags: [],
    hitstop: 0,
    stunFrames: 0,
    crouching: false,
    grounded: true,
    blockHeld: false,
    combo: 0,
    comboDamage: 0,
    lastChain: null,
    chainsUsed: 0,
    invulnFrames: 0,
    buffer: [],
    anim: { name: 'idle', frame: 0 },
    superTimeline: null,
    noDamageFor: 999,
    lastHitPower: 0,
    joints: {},
    stats: { ...def.stats },
  };
}

type HitReact = 'high' | 'mid' | 'low' | 'launch' | 'knockdown';

interface FighterExtra {
  hitConfirmed: boolean;
  hitReact: HitReact;
  pendingKnockdown: boolean;
  lastDirTapFrame: number;
  wallBounced: boolean;
}

interface PendingHit {
  att: FighterRuntime;
  def: FighterRuntime;
  box: HitboxDef;
  move: MoveDef;
  hbWorld: AABB;
  blocked: boolean;
  counter: boolean;
}

export class GameEngine {
  match: MatchRuntime;
  private pendingHits: PendingHit[] = [];
  private timeScaleRestoreFrame = 0;
  private extras: [FighterExtra, FighterExtra];
  private brains: [CpuBrain | null, CpuBrain | null];
  private acc = 0;
  private hudCache = '';

  constructor(opts: EngineOptions) {
    const seed = opts.seed ?? (Date.now() & 0xffffff);
    const p1cpu = false;
    const p2cpu = opts.mode === 'arcade' || opts.mode === 'vs-cpu' || opts.mode === 'training';
    this.match = {
      mode: opts.mode,
      phase: opts.playIntro ? 'intro' : 'round_intro',
      frame: 0,
      phaseFrame: 0,
      projectiles: [],
      nextProjId: 1,
      round: 1,
      timeLeft: K.ROUND_TIME,
      timerFrames: 0,
      fighters: [
        createFighter(0, opts.p1Char, p1cpu),
        createFighter(1, opts.p2Char, p2cpu),
      ],
      koWinner: null,
      matchWinner: null,
      timeScale: opts.playIntro ? 1 : 1,
      timeScaleTarget: 1,
      introSkipped: false,
      rng: mulberry32(seed),
      seed,
      training: { dummy: 'block', infiniteHealth: false, showHitboxes: false },
      hitConfirm: null,
      pausedFrom: null,
      stats: [{ maxCombo: 0, damage: 0 }, { maxCombo: 0, damage: 0 }],
    };
    this.extras = [
      { hitConfirmed: false, hitReact: 'mid', pendingKnockdown: false, lastDirTapFrame: -999, wallBounced: false },
      { hitConfirmed: false, hitReact: 'mid', pendingKnockdown: false, lastDirTapFrame: -999, wallBounced: false },
    ];
    const diff = opts.difficulty ?? 'normal';
    this.brains = [
      null,
      p2cpu ? new CpuBrain(diff, opts.mode === 'training') : null,
    ];
    if (opts.mode === 'training') {
      this.match.training.dummy = 'block';
    }
  }

  /* ------------------------- public API ------------------------- */

  update(realDt: number): void {
    // ease global timescale (slow-mo cinematics)
    const m = this.match;
    m.timeScale += (m.timeScaleTarget - m.timeScale) * (1 - Math.exp(-7 * realDt));
    if (m.phase === 'paused') return;
    this.acc += Math.min(realDt, 0.1) * m.timeScale;
    let guard = 0;
    while (this.acc >= K.SIM_DT && guard < 12) {
      this.acc -= K.SIM_DT;
      guard++;
      this.step();
    }
    if (guard >= 12) this.acc = 0; // tab-out catch-up protection
    this.pushHud();
  }

  setPaused(p: boolean): void {
    const m = this.match;
    if (p && m.phase !== 'paused') {
      m.pausedFrom = m.phase;
      m.phase = 'paused';
    } else if (!p && m.phase === 'paused') {
      m.phase = m.pausedFrom ?? 'fight';
      m.pausedFrom = null;
    }
    useMatchStore.setState({ paused: p });
  }

  skipIntro(): void {
    const m = this.match;
    if (m.phase === 'intro') {
      m.introSkipped = true;
      m.phase = 'round_intro';
      m.phaseFrame = 0;
      m.fighters[0].x = -K.FIGHTER_START_X;
      m.fighters[1].x = K.FIGHTER_START_X;
      m.fighters[0].state = 'idle';
      m.fighters[1].state = 'idle';
    }
  }

  restartMatch(): void {
    const f = this.match.fighters;
    for (let i = 0 as 0 | 1; i < 2; i = (i + 1) as 0 | 1) {
      // mutate in place — views/vfx hold references to these exact objects
      Object.assign(f[i], createFighter(i, f[i].char, f[i].cpu));
      this.extras[i] = { hitConfirmed: false, hitReact: 'mid', pendingKnockdown: false, lastDirTapFrame: -999, wallBounced: false };
    }
    const m = this.match;
    m.phase = 'round_intro';
    m.phaseFrame = 0;
    m.frame = 0;
    m.round = 1;
    m.timeLeft = K.ROUND_TIME;
    m.koWinner = null;
    m.matchWinner = null;
    m.timeScale = 1;
    m.timeScaleTarget = 1;
    m.stats = [{ maxCombo: 0, damage: 0 }, { maxCombo: 0, damage: 0 }];
    m.rng = mulberry32(m.seed);
    useMatchStore.setState({ showResults: false, paused: false, matchWinner: null });
    this.brains[1]?.reset();
    this.pushHud(true);
    bus.emit({ type: 'sfx', name: 'ui' });
  }

  /** World-space boxes for the training/debug overlay. */
  getDebugBoxes(): { hit: AABB[]; hurt: AABB[] } {
    const hit: AABB[] = [];
    const hurt: AABB[] = [];
    for (const f of this.match.fighters) {
      hurt.push(getHurtbox(f));
      if ((f.state === 'attack' || f.state === 'airAttack') && f.move) {
        for (let i = 0; i < f.move.hitboxes.length; i++) {
          const box = f.move.hitboxes[i];
          if (f.stateFrame >= box.t0 && f.stateFrame <= box.t1 && !f.moveHitFlags[i]) {
            hit.push(getHitboxWorld(f, box));
          }
        }
      }
    }
    return { hit, hurt };
  }

  /* --------------------------- stepping --------------------------- */

  /** Lockstep entry point for network play: one deterministic frame with
   *  both players' snapshots supplied by the net driver. */
  stepNet(a: InputSnapshot, b: InputSnapshot): void {
    this.frameInputs = [a, b];
    this.step();
    this.frameInputs = null;
    this.pushHud();
  }

  private frameInputs: [InputSnapshot, InputSnapshot] | null = null;

  private step(): void {
    const m = this.match;
    m.frame++;
    m.phaseFrame++;

    switch (m.phase) {
      case 'intro': this.stepIntro(); break;
      case 'round_intro': this.stepRoundIntro(); break;
      case 'fight':
      case 'training': this.stepFight(); break;
      case 'ko': this.stepKo(); break;
      case 'round_end': this.stepRoundEnd(); break;
      case 'match_end': this.stepMatchEnd(); break;
      default: break;
    }
  }

  private gatherInputs(): [InputSnapshot, InputSnapshot] {
    if (this.frameInputs) return this.frameInputs;
    const m = this.match;
    const out: [InputSnapshot, InputSnapshot] = [emptyInput(), emptyInput()];
    for (let i = 0 as 0 | 1; i < 2; i = (i + 1) as 0 | 1) {
      const f = m.fighters[i];
      if (f.cpu && this.brains[i]) {
        out[i] = this.brains[i]!.think(m, i);
      } else if (!f.cpu) {
        out[i] = this.input.sample(i === 0 ? 'p1' : 'p2');
      }
    }
    return out;
  }

  /** Overridable input source (tests inject snapshots directly). */
  input: { sample(slot: 'p1' | 'p2'): InputSnapshot } = {
    sample: () => emptyInput(),
  };

  attachInputManager(im: { sample(slot: 'p1' | 'p2'): InputSnapshot }): void {
    this.input = im;
  }

  private stepFight(): void {
    const m = this.match;
    const inputs = this.gatherInputs();
    for (let i = 0 as 0 | 1; i < 2; i = (i + 1) as 0 | 1) {
      const f = m.fighters[i];
      const opp = m.fighters[i === 0 ? 1 : 0];
      this.stepFighter(f, opp, inputs[i]);
    }
    // phase B: apply all detected hits (both directions) so same-frame
    // trades resolve symmetrically
    if (this.pendingHits.length) {
      const hits = this.pendingHits;
      this.pendingHits = [];
      for (const ph of hits) this.resolveHit(ph);
    }
    this.stepProjectiles();
    resolveBodyCollision(m.fighters[0], m.fighters[1]);
    this.clampToStage(m.fighters[0]);
    this.clampToStage(m.fighters[1]);
    // corner correction: if a wall stopped the push-out, shove the other fighter
    {
      const [fa, fb] = m.fighters;
      const downA = fa.state === 'knockdown' || fa.state === 'ko' || fa.state === 'getup';
      const downB = fb.state === 'knockdown' || fb.state === 'ko' || fb.state === 'getup';
      if (!downA && !downB) {
        const dx = fb.x - fa.x;
        const gap = Math.abs(dx);
        if (gap < K.BODY_PUSH_DIST && gap > 0) {
          const need = K.BODY_PUSH_DIST - gap;
          const s = dx > 0 ? 1 : -1;
          if (Math.abs(fa.x) >= K.STAGE_LIMIT - 1e-4) { fb.x += need * s; this.clampToStage(fb); }
          else if (Math.abs(fb.x) >= K.STAGE_LIMIT - 1e-4) { fa.x -= need * s; this.clampToStage(fa); }
        }
      }
    }
    // facing (grounded, actionable states only)
    for (let i = 0 as 0 | 1; i < 2; i = (i + 1) as 0 | 1) {
      const f = m.fighters[i];
      const opp = m.fighters[i === 0 ? 1 : 0];
      if (f.grounded && ['idle', 'walkF', 'walkB', 'crouch', 'crouchWalkF', 'crouchWalkB', 'blockStand', 'blockCrouch'].includes(f.state)) {
        f.facing = opp.x === f.x ? f.facing : (sign(opp.x - f.x) as 1 | -1);
      }
    }
    // combo drop check: victim back to neutral → attacker combo resets
    for (let i = 0 as 0 | 1; i < 2; i = (i + 1) as 0 | 1) {
      const f = m.fighters[i];
      const opp = m.fighters[i === 0 ? 1 : 0];
      const neutral = ['idle', 'walkF', 'walkB', 'crouch', 'blockStand', 'blockCrouch', 'jump', 'dashF', 'dashB'].includes(f.state);
      if (neutral && opp.combo > 1) {
        bus.emit({ type: 'vfx', kind: 'comboEnd', x: opp.x, y: 2, attacker: opp.id });
      }
      if (neutral) opp.combo = 0;
    }
    // super activation slow-mo restore (unless the scripted timeline took over)
    if (this.timeScaleRestoreFrame && m.frame >= this.timeScaleRestoreFrame) {
      const inTimeline = m.fighters.some((f) => f.superTimeline !== null);
      if (!inTimeline && m.timeScaleTarget < 1 && m.koWinner === null) m.timeScaleTarget = 1;
      if (!inTimeline) this.timeScaleRestoreFrame = 0;
    }
    // training conveniences
    if (m.phase === 'fight' && m.mode !== 'training') {
      m.timerFrames++;
      if (m.timerFrames >= 60) {
        m.timerFrames = 0;
        m.timeLeft--;
        if (m.timeLeft <= 10) bus.emit({ type: 'sfx', name: 'tick' });
        if (m.timeLeft <= 0) { this.resolveTimeUp(); return; }
      }
    }    if (m.mode === 'training') {
      for (let i = 0 as 0 | 1; i < 2; i = (i + 1) as 0 | 1) {
        const f = m.fighters[i];
        if (m.training.infiniteHealth && f.noDamageFor > K.TRAINING_REGEN_DELAY) {
          f.health = Math.min(K.MAX_HEALTH, f.health + K.TRAINING_REGEN_RATE);
        }
        // training KO: play the knockdown, then auto-revive
        if (f.health <= 0 && f.state !== 'ko' && f.state !== 'airHitstun' && f.state !== 'knockdown') {
          f.state = 'ko';
          f.stateFrame = 0;
          f.vy = 5.5;
          f.vx = 0;
          f.grounded = false;
          bus.emit({ type: 'sfx', name: 'ko' });
        }
        if (f.state === 'ko' && f.stateFrame > 90) {
          f.health = K.MAX_HEALTH;
          f.state = 'idle';
          f.stateFrame = 0;
          f.y = 0; f.vy = 0; f.vx = 0;
          f.grounded = true;
        }
      }
    }
    this.syncAnims();
    // deferred KO resolution — both fighters' hits resolve first, so
    // same-frame lethal trades produce a genuine DOUBLE KO
    if (m.phase === 'fight') {
      const [fa, fb] = m.fighters;
      if (fa.health <= 0 && fb.health <= 0) this.triggerKo('double');
      else if (fb.health <= 0) this.triggerKo(0);
      else if (fa.health <= 0) this.triggerKo(1);
    }
  }

  private clampToStage(f: FighterRuntime): void {
    const ex = this.extras[f.id];
    const hitWall = (f.x <= -K.STAGE_LIMIT && f.vx < 0) || (f.x >= K.STAGE_LIMIT && f.vx > 0);
    if (hitWall && !f.grounded && f.state === 'airHitstun' && Math.abs(f.vx) > 3 && !ex.wallBounced) {
      // corner wall-bounce: dramatic slam + re-launch (once per airtime)
      ex.wallBounced = true;
      f.vx = -f.vx * 0.45;
      f.vy = Math.max(f.vy, 2.4);
      f.hitstop = Math.max(f.hitstop, 6);
      const wallX = f.x < 0 ? -K.STAGE_LIMIT : K.STAGE_LIMIT;
      bus.emit({ type: 'vfx', kind: 'burst', x: wallX, y: Math.max(0.5, f.y + 0.9), color: '#c8d8f0', power: 1.1 });
      bus.emit({ type: 'vfx', kind: 'shockwave', x: wallX, y: Math.max(0.5, f.y + 0.9), color: '#9fb8d8' });
      bus.emit({ type: 'sfx', name: 'bodyFall', gain: 1.2 });
      bus.emit({ type: 'shake', intensity: 0.6 });
    }
    if (f.x < -K.STAGE_LIMIT) { f.x = -K.STAGE_LIMIT; if (f.vx < 0) f.vx = f.grounded ? 0 : f.vx; }
    if (f.x > K.STAGE_LIMIT) { f.x = K.STAGE_LIMIT; if (f.vx > 0) f.vx = f.grounded ? 0 : f.vx; }
  }

  /* ------------------------- fighter step ------------------------- */

  private bufferPresses(f: FighterRuntime, inp: InputSnapshot): void {
    if (inp.lp) f.buffer.push({ action: 'lp', frame: this.match.frame });
    if (inp.hp) f.buffer.push({ action: 'hp', frame: this.match.frame });
    if (inp.lk) f.buffer.push({ action: 'lk', frame: this.match.frame });
    if (inp.hk) f.buffer.push({ action: 'hk', frame: this.match.frame });
    if (inp.special) f.buffer.push({ action: 'special', frame: this.match.frame });
    if (inp.super) f.buffer.push({ action: 'super', frame: this.match.frame });
    if (inp.ability) f.buffer.push({ action: 'ability', frame: this.match.frame });
    if (inp.upEdge) f.buffer.push({ action: 'up', frame: this.match.frame });
    f.buffer = f.buffer.filter((b) => this.match.frame - b.frame <= K.INPUT_BUFFER_FRAMES);
  }

  private consumeBuffered(f: FighterRuntime, allowed: (a: ActionId) => boolean): ActionId | null {
    for (let i = f.buffer.length - 1; i >= 0; i--) {
      if (allowed(f.buffer[i].action)) {
        const a = f.buffer[i].action;
        f.buffer.splice(i, 1);
        return a;
      }
    }
    return null;
  }

  private stepFighter(f: FighterRuntime, opp: FighterRuntime, inp: InputSnapshot): void {
    // record press edges even while frozen in hitstop (classic input buffering)
    this.bufferPresses(f, inp);
    if (f.hitstop > 0) { f.hitstop--; this.physics(f, true); return; }
    if (f.invulnFrames > 0) f.invulnFrames--;
    if (f.abilityCd > 0) f.abilityCd--;
    if (f.abilityBuff && this.match.frame >= f.abilityBuff.until) {
      f.abilityBuff = null;
      bus.emit({ type: 'vfx', kind: 'abilityEnd', x: f.x, y: f.y + 1.1, color: CHARACTERS[f.char].color, attacker: f.id });
    }
    f.stateFrame++;
    f.noDamageFor++;
    f.blockHeld = inp.block;

    switch (f.state) {
      case 'idle': case 'walkF': case 'walkB':
      case 'crouch': case 'crouchWalkF': case 'crouchWalkB':
      case 'blockStand': case 'blockCrouch':
        this.stepNeutral(f, opp, inp);
        break;
      case 'jump': this.stepAir(f, opp); break;
      case 'dashF': case 'dashB': this.stepDash(f); break;
      case 'attack': case 'airAttack': this.stepAttack(f, opp); break;
      case 'hitstun': case 'blockstun': this.stepStun(f, opp); break;
      case 'airHitstun': this.stepAirHitstun(f); break;
      case 'knockdown': this.stepKnockdown(f); break;
      case 'getup':
        if (f.stateFrame > K.WAKEUP_FRAMES) this.enter(f, 'idle');
        break;
      case 'ko': this.stepKoFall(f); break;
      case 'superVictim': this.stepSuperVictim(f, opp); break;
      case 'victory': case 'defeat': case 'introWalk': case 'introIdle':
        f.vx = 0;
        break;
    }
    this.physics(f, false);
    // footsteps + dust
    if ((f.state === 'walkF' || f.state === 'walkB' || f.state === 'introWalk') && f.stateFrame % 16 === 1) {
      bus.emit({ type: 'sfx', name: 'step', pan: f.x * 0.08 });
      bus.emit({ type: 'vfx', kind: 'dust', x: f.x, y: 0.02, color: '#9fb4c8' });
    }
  }

  private enter(f: FighterRuntime, state: FighterRuntime['state']): void {
    f.state = state;
    f.stateFrame = 0;
    if (state !== 'attack' && state !== 'airAttack') {
      f.move = null;
      if (f.superTimeline) {
        f.superTimeline = null;
        if (this.match.phase === 'fight' || this.match.phase === 'training') this.match.timeScaleTarget = 1;
      }
    }
    if (state === 'idle' || state === 'walkF' || state === 'walkB') {
      this.extras[f.id].hitConfirmed = false;
      f.lastChain = null;
      f.chainsUsed = 0;
    }
  }

  private stepNeutral(f: FighterRuntime, opp: FighterRuntime, inp: InputSnapshot): void {
    const grounded = f.grounded;
    f.vx = 0;
    f.crouching = inp.down && grounded;

    // ---- unique ability (15s cooldown) ----
    const wantAbility = this.consumeBuffered(f, (a) => a === 'ability');
    if (wantAbility) this.tryActivateAbility(f, opp);

    // ---- buffered attacks ----
    const wantAttack = this.consumeBuffered(f, (a) =>
      a === 'lp' || a === 'hp' || a === 'lk' || a === 'hk' || a === 'special' || a === 'super');
    if (wantAttack && wantAttack !== 'up') {
      const moveId = resolveMoveId(f.char, wantAttack as 'lp', { crouching: f.crouching, airborne: !grounded });
      const move = moveId ? getMove(f.char, moveId) : undefined;
      if (move && f.meter >= move.meterCost) {
        if (!grounded && !move.air) {
          // grounded-only moves can't start in the air; keep buffer consumed
        } else if (grounded && move.air) {
          // air-only move pressed on ground: ignore
        } else {
          this.startMove(f, move);
          return;
        }
      }
    }

    // ---- jump (buffered) ----
    if (grounded && this.consumeBuffered(f, (a) => a === 'up')) {
      f.vy = f.stats.jumpVY * this.speedMult(f);
      f.grounded = false;
      const dirX = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      f.vx = dirX * f.stats.walkF * K.JUMP_VX_FACTOR * 60 * K.SIM_DT;
      this.enter(f, 'jump');
      bus.emit({ type: 'sfx', name: 'jump' });
      bus.emit({ type: 'vfx', kind: 'dust', x: f.x, y: 0.02, color: '#9fb4c8' });
      return;
    }

    // ---- dashes (double tap) ----
    if (grounded && (inp.dashF || inp.dashB)) {
      const toward = f.facing === 1 ? inp.dashF : inp.dashB;
      const away = f.facing === 1 ? inp.dashB : inp.dashF;
      if (toward) {
        this.enter(f, 'dashF');
        f.vx = f.facing * f.stats.dashFSpeed * this.speedMult(f);
        bus.emit({ type: 'sfx', name: 'dash' });
        bus.emit({ type: 'vfx', kind: 'dust', x: f.x - f.facing * 0.3, y: 0.05, color: '#9fb4c8', power: 1.4 });
        return;
      }
      if (away) {
        this.enter(f, 'dashB');
        f.vx = -f.facing * f.stats.dashBSpeed * this.speedMult(f);
        f.invulnFrames = 9;
        bus.emit({ type: 'sfx', name: 'dash' });
        return;
      }
    }

    // ---- blocking ----
    if (grounded && inp.block) {
      const target = inp.down ? 'blockCrouch' : 'blockStand';
      if (f.state !== target) this.enter(f, target);
      f.vx = 0;
      return;
    }
    if ((f.state === 'blockStand' || f.state === 'blockCrouch') && !inp.block) {
      this.enter(f, 'idle');
    }
    if (f.state === 'blockStand' || f.state === 'blockCrouch') return;

    // ---- crouch / walk ----
    if (!grounded) return;
    const back = (inp.left ? -1 : 0) + (inp.right ? 1 : 0);
    if (inp.down) {
      if (back !== 0) {
        const target = back === f.facing ? 'crouchWalkF' : 'crouchWalkB';
        if (f.state !== target) this.enter(f, target);
        f.vx = back * f.stats.crouchWalkF * (back === f.facing ? 1 : f.stats.crouchWalkB / f.stats.crouchWalkF);
      } else if (f.state !== 'crouch') this.enter(f, 'crouch');
      f.crouching = true;
      return;
    }
    f.crouching = false;
    if (back !== 0) {
      const forward = back === f.facing;
      const target = forward ? 'walkF' : 'walkB';
      if (f.state !== target) this.enter(f, target);
      f.vx = back * (forward ? f.stats.walkF : f.stats.walkB);
    } else if (f.state !== 'idle') {
      this.enter(f, 'idle');
    }
    void opp;
  }

  private startMove(f: FighterRuntime, move: MoveDef): void {
    f.meter = Math.max(0, f.meter - move.meterCost);
    f.move = move;
    f.moveHitFlags = move.hitboxes.map(() => false);
    this.extras[f.id].hitConfirmed = false;
    this.enter(f, f.grounded ? 'attack' : 'airAttack');
    f.move = move; // enter() clears move for non-attack states; re-assign
    f.vx = 0;
    f.overclockAcc = 0;
    if (move.kind === 'super') {
      // supers are armored through activation (interruptible afterwards via trades)
      f.invulnFrames = Math.max(f.invulnFrames, move.startup + 2);
    }
    if (move.kind === 'special') {
      bus.emit({ type: 'camera', mode: 'special', duration: (move.startup + move.active + move.recovery) / 60 });
      bus.emit({ type: 'sfx', name: 'specialCharge', pan: f.x * 0.08 });
      bus.emit({ type: 'sfx', name: 'power', pan: f.x * 0.08, char: f.char });
      bus.emit({ type: 'announce', text: move.name, style: 'big', side: f.id, color: CHARACTERS[f.char].color });
    }
    if (move.kind === 'super') {
      bus.emit({ type: 'superStart', attacker: f.id, x: f.x, y: f.y, color: CHARACTERS[f.char].color });
      bus.emit({ type: 'camera', mode: 'super', duration: 3.4 });
      this.match.timeScaleTarget = 0.5;
      this.timeScaleRestoreFrame = this.match.frame + 24;
      bus.emit({ type: 'slowmo', scale: 0.5, frames: 24 });
      bus.emit({ type: 'flash', intensity: 0.85, color: CHARACTERS[f.char].color });
      bus.emit({ type: 'announce', text: move.name, style: 'big', side: f.id, color: CHARACTERS[f.char].color });
      bus.emit({ type: 'sfx', name: 'superActivate' });
      bus.emit({ type: 'sfx', name: 'power', gain: 1.3, pan: f.x * 0.08, char: f.char });
    }
    if (move.kind === 'normal') {
      // whiff swish handled on first active frame in stepAttack
    }
  }

  private stepAir(f: FighterRuntime, opp: FighterRuntime): void {
    // air attacks
    if (!f.move) {
      const wantAttack = this.consumeBuffered(f, (a) => a === 'lp' || a === 'hp' || a === 'lk' || a === 'hk');
      if (wantAttack && wantAttack !== 'up' && wantAttack !== 'special' && wantAttack !== 'super') {
        const moveId = resolveMoveId(f.char, wantAttack as 'lp', { crouching: false, airborne: true });
        const move = moveId ? getMove(f.char, moveId) : undefined;
        if (move) this.startMove(f, move);
      }
    } else {
      this.runMoveFrames(f, opp);
    }
    // landing
    if (f.grounded) {
      if (f.move) {
        // land during air attack → short landing recovery
        f.move = null;
        this.enter(f, 'crouch');
        f.crouching = true;
      } else {
        this.enter(f, 'idle');
        // landing VFX/SFX now handled by physics() based on impact velocity
      }
    }
  }

  private stepDash(f: FighterRuntime): void {
    const stats = f.stats;
    const total = f.state === 'dashF' ? stats.dashFTime : stats.dashBTime;
    const speed = (f.state === 'dashF' ? stats.dashFSpeed : stats.dashBSpeed) * this.speedMult(f);
    const dir = f.state === 'dashF' ? f.facing : -f.facing;
    const t = f.stateFrame / total;
    f.vx = dir * speed * (1 - t * t * 0.85); // ease-out
    if (f.stateFrame >= total) {
      this.enter(f, 'idle');
      f.vx = 0;
    }
  }

  private stepAttack(f: FighterRuntime, opp: FighterRuntime): void {
    if (!f.move) { this.enter(f, f.grounded ? 'idle' : 'jump'); return; }
    if (f.abilityBuff?.kind === 'overclock') {
      f.overclockAcc += f.abilityBuff.mult - 1;
      while (f.overclockAcc >= 1) { f.overclockAcc -= 1; f.stateFrame++; }
    }
    this.runMoveFrames(f, opp);
    const total = this.moveTotalFrames(f.move);
    if (f.stateFrame >= total) {
      this.enter(f, f.grounded ? 'idle' : 'jump');
      f.vx = 0;
    }
  }

  private moveTotalFrames(move: MoveDef): number {
    let total = move.startup + move.active + move.recovery;
    if (move.superHits && move.superHits.length) {
      total = Math.max(total, move.superHits[move.superHits.length - 1].frame + 26);
    }
    return total;
  }

  private runMoveFrames(f: FighterRuntime, opp: FighterRuntime): void {
    const move = f.move!;
    const ex = this.extras[f.id];
    const frame = f.stateFrame;

    // root motion
    if (move.advance) {
      let moving = false;
      for (const adv of move.advance) {
        if (frame >= adv.t0 && frame <= adv.t1) {
          f.vx = f.facing * adv.vx;
          if (adv.vy !== undefined) f.vy = adv.vy;
          moving = true;
        }
      }
      if (!moving && f.grounded && !move.air) f.vx *= 0.6;
    } else if (f.grounded) {
      f.vx *= 0.72;
    }

    // vfx cues
    if (move.vfx) {
      for (const cue of move.vfx) {
        if (cue.frame === frame) {
          bus.emit({
            type: 'vfx', kind: cue.type, x: f.x + f.facing * (cue.x ?? 0.5), y: (cue.y ?? 1.1) + f.y,
            color: cue.color ?? CHARACTERS[f.char].color, dir: f.facing, power: 1, attacker: f.id, char: f.char,
          });
          if (cue.type === 'superFlash') bus.emit({ type: 'flash', intensity: 0.9, color: cue.color });
        }
      }
    }

    // projectile spawn cue
    if (move.spawn && frame === move.spawn.frame) {
      const sp = move.spawn;
      const proj: Projectile = {
        id: this.match.nextProjId++,
        owner: f.id,
        x: f.x + f.facing * 0.75,
        y: f.y + 1.18,
        vx: f.facing * sp.speed,
        damage: sp.damage,
        hitstun: sp.hitstun,
        blockstun: sp.blockstun,
        level: sp.level,
        w: sp.size * 2.4,
        h: sp.size * 2.4,
        color: sp.color,
        life: sp.life,
        knockX: sp.knockX,
        knockY: sp.knockY,
        beam: !!sp.beam,
        dead: false,
      };
      this.match.projectiles.push(proj);
      bus.emit({ type: 'sfx', name: 'projectile', pan: f.x * 0.08 });
      bus.emit({ type: 'vfx', kind: 'burst', x: proj.x, y: proj.y, color: sp.color, power: 0.8 });
    }

    // whiff swish on first active frame
    const firstActive = move.hitboxes.length ? move.hitboxes[0].t0 : move.startup;
    if (frame === firstActive) {
      const heavy = move.kind !== 'normal' || move.hitboxes.some((h) => h.damage > 55);
      bus.emit({ type: 'sfx', name: heavy ? 'whiffH' : 'whiff', pan: f.x * 0.08 });
      bus.emit({ type: 'vfx', kind: 'whiff', x: f.x + f.facing * 0.75, y: f.y + 1.15, color: '#dfe8f2', dir: f.facing, power: heavy ? 1.5 : 1 });
    }

    // active hitboxes
    for (let i = 0; i < move.hitboxes.length; i++) {
      const box = move.hitboxes[i];
      if (frame < box.t0 || frame > box.t1 || f.moveHitFlags[i]) continue;
      if (!isVulnerable(opp)) continue;
      const hbW = getHitboxWorld(f, box);
      const hurt = getHurtbox(opp);
      if (aabbOverlap(hbW, hurt)) {
        f.moveHitFlags[i] = true;
        // classify NOW (states are pre-resolution); apply after both stepped
        const blockState = opp.state === 'blockStand' || opp.state === 'blockCrouch' || opp.state === 'blockstun';
        const blockType: 'stand' | 'crouch' = (opp.crouching || opp.state === 'blockCrouch') ? 'crouch' : 'stand';
        const blocked = blockState && opp.grounded && blockBeatsLevel(blockType, box.level);
        const counter = !blocked && (opp.state === 'attack' || opp.state === 'airAttack');
        this.pendingHits.push({ att: f, def: opp, box, move, hbWorld: hbW, blocked, counter });
      }
    }

    // super scripted sequence
    if (f.superTimeline) this.runSuperTimeline(f, opp);

    // cancels (chains / special cancel) after hit-confirm
    if (ex.hitConfirmed && !f.superTimeline && move.kind === 'normal') {
      const allow = new Set<string>(move.chains ?? []);
      const spec = getMove(f.char, `${f.char}_special`);
      const sup = getMove(f.char, `${f.char}_super`);
      if (move.specialCancel) {
        if (spec && f.meter >= spec.meterCost) allow.add('special');
        if (sup && f.meter >= sup.meterCost) allow.add('super');
      }
      const action = this.consumeBuffered(f, (a) => {
        if (a === 'special') return allow.has('special');
        if (a === 'super') return allow.has('super');
        if (a === 'lp' || a === 'hp' || a === 'lk' || a === 'hk') {
          const id = resolveMoveId(f.char, a, { crouching: f.crouching, airborne: !f.grounded });
          return !!id && allow.has(id) && f.lastChain !== id;
        }
        return false;
      });
      if (action) {
        let nextMove: MoveDef | undefined;
        if (action === 'special') nextMove = spec;
        else if (action === 'super') nextMove = sup;
        else {
          const id = resolveMoveId(f.char, action as 'lp', { crouching: f.crouching, airborne: !f.grounded });
          nextMove = id ? getMove(f.char, id) : undefined;
        }
        if (nextMove && f.meter >= nextMove.meterCost) {
          f.lastChain = nextMove.id;
          f.chainsUsed++;
          this.startMove(f, nextMove);
          return;
        }
      }
    }
  }

  private runSuperTimeline(f: FighterRuntime, opp: FighterRuntime): void {
    const tl = f.superTimeline!;
    const frame = f.stateFrame;
    // KO during the cinematic ends the script early
    if (opp.state === 'ko' || opp.health <= 0) {
      f.superTimeline = null;
      this.match.timeScaleTarget = this.match.phase === 'ko' ? this.match.timeScaleTarget : 1;
      return;
    }
    // lock victim in place in front of attacker
    opp.x = f.x + f.facing * 0.95;
    opp.y = 0;
    opp.vx = 0;
    opp.vy = 0;
    while (tl.next < tl.hits.length && tl.hits[tl.next].frame <= frame) {
      const h = tl.hits[tl.next];
      tl.next++;
      this.applyDamage(f, opp, h.damage, false);
      opp.hitstop = Math.max(opp.hitstop, 7);
      f.hitstop = Math.max(f.hitstop, 5);
      bus.emit({
        type: 'hit', x: opp.x, y: opp.y + 1.2, z: 0, power: h.damage, blocked: false,
        counter: false, effect: h.effect, color: CHARACTERS[f.char].color, attacker: f.id, char: f.char, defender: opp.char,
      });
      bus.emit({ type: 'sfx', name: h.effect === 'electric' ? 'zapHit' : 'punchH' });
      bus.emit({ type: 'shake', intensity: 0.5 });
      this.match.timeScaleTarget = 0.55;
      if (opp.health <= 0) {
        f.superTimeline = null; // deferred KO check in stepFight takes over
        return;
      }
    }
    const last = tl.hits.length ? tl.hits[tl.hits.length - 1].frame : 0;
    if (frame >= last + 22) {
      f.superTimeline = null;
      this.match.timeScaleTarget = 1;
      // ending launcher
      const ex = this.extras[opp.id];
      ex.pendingKnockdown = true;
      opp.state = 'airHitstun';
      opp.stateFrame = 0;
      opp.stunFrames = 40;
      opp.vy = 7.5;
      opp.vx = f.facing * 3.4;
      opp.grounded = false;
      ex.hitReact = 'launch';
      bus.emit({ type: 'sfx', name: 'launchHit' });
      bus.emit({ type: 'shake', intensity: 1.1 });
      bus.emit({ type: 'vfx', kind: 'shockwave', x: opp.x, y: opp.y + 1, color: CHARACTERS[f.char].color });
      const total = this.moveTotalFrames(f.move!);
      f.stateFrame = Math.max(f.stateFrame, total - 24);
    }
  }

  /* ------------------------- hit resolution ------------------------- */

  private resolveHit(ph: PendingHit): void {
    const { att, def, box, move, hbWorld, blocked } = ph;
    const counter = ph.counter;
    const ex = this.extras[att.id];
    const dex = this.extras[def.id];
    const contactX = (Math.max(hbWorld.cx - hbWorld.w / 2, def.x - 0.3) + Math.min(hbWorld.cx + hbWorld.w / 2, def.x + 0.3)) / 2;
    const contactY = box.y + att.y;
    const charColor = CHARACTERS[att.char].color;

    if (blocked) {
      // chip damage from specials/supers (never lethal)
      if (move.kind === 'special' || move.kind === 'super') {
        const chip = Math.round(box.damage * K.CHIP_FRACTION);
        def.health = Math.max(1, def.health - chip);
        def.noDamageFor = 0;
      }
      def.state = 'blockstun';
      def.stateFrame = 0;
      def.stunFrames = box.blockstun;
      def.vx = att.facing * box.knockX * 0.6;
      att.vx = -att.facing * (move.pushbackSelf ?? 1.4) * 0.8;
      att.hitstop = Math.max(att.hitstop, Math.round(box.hitstopSelf * 0.8));
      def.hitstop = Math.max(def.hitstop, Math.round(box.hitstopVictim * 0.6));
      att.meter = Math.min(K.MAX_METER, att.meter + K.METER_ON_BLOCK);
      def.meter = Math.min(K.MAX_METER, def.meter + K.METER_ON_BLOCK * 0.6);
      ex.hitConfirmed = true;
      bus.emit({ type: 'hit', x: contactX, y: contactY + 0.15, z: 0, power: box.damage * 0.4, blocked: true, counter: false, effect: 'spark', color: '#bfe6ff', attacker: att.id, char: att.char, defender: def.char });
      bus.emit({ type: 'sfx', name: 'block', pan: def.x * 0.08 });
      bus.emit({ type: 'shake', intensity: 0.16 });
      return;
    }

    // --- counter stance (RIPOSTE): negates the hit and punishes ---
    const cbuf = def.abilityBuff;
    if (cbuf && cbuf.kind === 'counter' && def.grounded && def.state !== 'superVictim') {
      def.abilityBuff = null;
      const riposteDmg = Math.round(cbuf.mult * CHARACTERS[att.char].defenseMult);
      this.applyDamage(def, att, riposteDmg, true);
      att.hitstop = Math.max(att.hitstop, 12);
      def.hitstop = Math.max(def.hitstop, 8);
      att.state = 'hitstun';
      att.stateFrame = 0;
      att.stunFrames = 26;
      att.vx = -def.facing * 4.4;
      att.crouching = false;
      this.extras[att.id].hitReact = 'mid';
      if (att.move) { att.move = null; }
      bus.emit({ type: 'announce', text: CHARACTERS[def.char].ability.name, style: 'big', side: def.id, color: CHARACTERS[def.char].ability.color });
      bus.emit({ type: 'hit', x: (att.x + def.x) / 2, y: 1.25, z: 0, power: riposteDmg, blocked: false, counter: true, effect: 'heavy', color: CHARACTERS[def.char].ability.color, attacker: def.id });
      bus.emit({ type: 'flash', intensity: 0.5, color: CHARACTERS[def.char].ability.color });
      bus.emit({ type: 'shake', intensity: 1.0 });
      bus.emit({ type: 'sfx', name: 'launchHit' });
      return;
    }

    // --- clean hit ---
    const scale = Math.max(K.COMBO_SCALE_MIN, 1 - K.COMBO_SCALE_STEP * att.combo);
    const ab = att.abilityBuff;
    const buffMult = ab && (ab.kind === 'damageBuff' || ab.kind === 'berserk') ? ab.mult : 1;
    const armorActive = def.abilityBuff?.kind === 'armor';
    const defMult = CHARACTERS[def.char].defenseMult * (armorActive ? def.abilityBuff!.mult : 1);
    const dmg = Math.max(1, Math.round(box.damage * scale * defMult * buffMult * (counter ? K.COUNTER_HIT_MULT : 1)));

    this.applyDamage(att, def, dmg, counter);
    ex.hitConfirmed = true;
    // life drain (SIPHON)
    if (ab && ab.kind === 'drain') {
      att.health = Math.min(K.MAX_HEALTH, att.health + Math.round(ab.mult));
    }

    att.hitstop = Math.max(att.hitstop, Math.round(box.hitstopSelf * (counter ? 1.5 : 1)));
    def.hitstop = Math.max(def.hitstop, Math.round(box.hitstopVictim * (counter ? 1.5 : 1) * (armorActive ? 0.6 : 1)));
    att.meter = Math.min(K.MAX_METER, att.meter + K.METER_ON_HIT);

    const launches = box.knockY > 0 || box.effect === 'launch' || box.effect === 'knockdown';
    dex.hitReact = box.effect === 'launch' || (box.knockY >= 6) ? 'launch'
      : box.level === 'low' ? 'low'
      : box.level === 'high' ? 'high'
      : box.damage >= 60 ? 'knockdown' : 'mid';

    // STONE SKIN: absorb non-launching hits without flinching
    if (armorActive && !launches && def.grounded) {
      def.vx = att.facing * box.knockX * 0.25;
      bus.emit({
        type: 'hit', x: contactX, y: contactY, z: 0, power: dmg, blocked: false, counter: false,
        effect: 'spark', color: CHARACTERS[def.char].ability.color, attacker: att.id,
      });
      bus.emit({ type: 'sfx', name: 'armorClang', pan: def.x * 0.08 });
      bus.emit({ type: 'shake', intensity: 0.3 });
      return;
    }

    def.lastHitPower = dmg;
    const weight = CHARACTERS[def.char].weightMult;
    if (launches || !def.grounded) {
      def.state = 'airHitstun';
      def.stateFrame = 0;
      def.stunFrames = box.hitstun + 18;
      def.vy = Math.max(box.knockY, def.grounded ? 3.2 : 1.5);
      def.vx = att.facing * box.knockX / weight;
      def.grounded = false;
      def.crouching = false;
      dex.pendingKnockdown = box.effect === 'knockdown' || box.effect === 'launch' || box.knockY >= 3;
    } else {
      def.state = 'hitstun';
      def.stateFrame = 0;
      def.stunFrames = box.hitstun + (counter ? 6 : 0);
      def.vx = att.facing * box.knockX / weight;
      def.crouching = false;
      dex.pendingKnockdown = false;
    }

    // super opener connects → scripted sequence
    if (move.kind === 'super' && move.superHits) {
      att.superTimeline = { hits: move.superHits.map((h) => ({ ...h })), next: 0 };
      def.state = 'superVictim';
      def.stateFrame = 0;
      def.stunFrames = 999;
      def.vx = 0; def.vy = 0;
      dex.pendingKnockdown = false;
    }

    // events
    bus.emit({
      type: 'hit', x: contactX, y: contactY, z: 0, power: dmg, blocked: false, counter,
      effect: box.effect, color: charColor, attacker: att.id, char: att.char, defender: def.char,
    });
    const heavy = box.damage >= 55 || move.kind !== 'normal';
    const kickish = move.sfx === 'kickL' || move.sfx === 'kickH';
    const sfxName = box.effect === 'electric' ? 'zapHit'
      : heavy ? (kickish ? 'kickH' : 'punchH')
      : (kickish ? 'kickL' : 'punchL');
    bus.emit({ type: 'sfx', name: sfxName, pan: def.x * 0.08, char: att.char });
    bus.emit({ type: 'shake', intensity: heavy ? 0.75 : 0.32 });
    if (counter) {
      bus.emit({ type: 'announce', text: 'COUNTER', style: 'big' });
      bus.emit({ type: 'flash', intensity: 0.3, color: '#ffffff' });
      bus.emit({ type: 'camera', mode: 'impact', intensity: 1.3, duration: 0.35 });
    } else if (heavy) {
      bus.emit({ type: 'camera', mode: 'impact', intensity: 0.9, duration: 0.25 });
    }
    if (att.combo >= 2) {
      bus.emit({ type: 'vfx', kind: 'comboHit', x: def.x, y: 2.3, attacker: att.id });
    }
  }

  private applyDamage(att: FighterRuntime, def: FighterRuntime, dmg: number, counter: boolean): void {
    const m = this.match;
    const actual = m.mode === 'training' && m.training.infiniteHealth ? 0 : dmg;
    def.health = Math.max(0, def.health - actual);
    def.noDamageFor = 0;
    def.meter = Math.min(K.MAX_METER, def.meter + K.METER_ON_HURT * 0.5);
    att.combo++;
    att.comboDamage += dmg;
    const st = m.stats[att.id];
    st.damage += dmg;
    if (att.combo > st.maxCombo) st.maxCombo = att.combo;
    if (att.combo >= 2) m.hitConfirm = { attacker: att.id, frame: m.frame };
    void counter;
  }

  private stepStun(f: FighterRuntime, opp: FighterRuntime): void {
    // RENEW-style burst: escape stun with the unique ability
    if (this.tryBurstEscape(f)) return;
    if (f.stateFrame >= f.stunFrames) {
      if (f.blockHeld && f.state === 'blockstun' && f.grounded) {
        this.enter(f, f.crouching ? 'blockCrouch' : 'blockStand');
      } else {
        this.enter(f, 'idle');
      }
      f.vx = 0;
    }
    void opp;
  }

  private stepAirHitstun(f: FighterRuntime): void {
    const ex = this.extras[f.id];
    if (f.grounded && f.vy <= 0 && f.y <= 0.001) {
      // landed while in air hitstun
      if (ex.pendingKnockdown || f.stunFrames > 6) {
        this.enter(f, 'knockdown');
        f.vx = sign(f.vx) * Math.min(Math.abs(f.vx), 3.2);
        ex.pendingKnockdown = false;
        bus.emit({ type: 'sfx', name: 'bodyFall' });
        bus.emit({ type: 'vfx', kind: 'dust', x: f.x, y: 0.04, color: '#9fb4c8', power: 2.2 });
        bus.emit({ type: 'shake', intensity: 0.35 });
      } else {
        this.enter(f, 'idle');
      }
    } else if (f.stateFrame >= f.stunFrames && f.grounded) {
      this.enter(f, 'idle');
    }
  }

  private stepKnockdown(f: FighterRuntime): void {
    if (f.grounded && this.tryBurstEscape(f)) return;
    if (f.grounded && f.stateFrame > K.KNOCKDOWN_LIE_FRAMES + (!Math.abs(f.vx) ? 0 : 12)) {
      this.enter(f, 'getup');
      f.invulnFrames = K.WAKEUP_INVULN_FRAMES;
    }
  }

  private stepKoFall(f: FighterRuntime): void {
    // physics() now handles ground friction via FRICTION_KO
    void f;
  }

  private stepSuperVictim(f: FighterRuntime, opp: FighterRuntime): void {
    // if the super got interrupted, the victim is released immediately
    if (!opp.superTimeline || opp.state !== 'attack') {
      this.enter(f, 'idle');
      return;
    }
    f.vx = 0;
    f.vy = 0;
    f.y = 0;
    f.grounded = true;
    // stagger animation jitter handled by view; keep locked to attacker
    f.x = opp.x + opp.facing * 0.95;
    f.facing = (sign(opp.x - f.x) || opp.facing) as 1 | -1;
  }

  private physics(f: FighterRuntime, frozen: boolean): void {
    if (frozen) return;

    // --- airborne integration ---
    if (!f.grounded) {
      f.vy += K.GRAVITY * K.SIM_DT;
      f.vx *= 1 - K.AIR_DRAG * K.SIM_DT;
    }

    f.x += f.vx * K.SIM_DT;
    f.y += f.vy * K.SIM_DT;

    // --- ground contact ---
    if (f.y <= 0 && !f.grounded) {
      f.y = 0;
      const impactVy = Math.abs(f.vy); // capture before zeroing

      // landing vx damping — proportional to impact severity
      if (impactVy >= K.LAND_IMPACT_HARD) {
        f.vx *= K.LAND_VX_DAMP_HARD;
      } else if (impactVy >= K.LAND_IMPACT_MEDIUM) {
        // lerp between hard and soft damp
        const t = (impactVy - K.LAND_IMPACT_MEDIUM) / (K.LAND_IMPACT_HARD - K.LAND_IMPACT_MEDIUM);
        f.vx *= K.LAND_VX_DAMP_SOFT + (K.LAND_VX_DAMP_HARD - K.LAND_VX_DAMP_SOFT) * t;
      } else if (impactVy >= K.LAND_IMPACT_SOFT) {
        f.vx *= K.LAND_VX_DAMP_SOFT;
      }
      // soft/no impact: no extra vx damping (fighter was barely airborne)

      f.vy = 0;
      f.grounded = true;
      this.extras[f.id].wallBounced = false;

      // landing VFX / SFX based on impact severity
      if (impactVy >= K.LAND_IMPACT_HARD) {
        bus.emit({ type: 'sfx', name: 'bodyFall', gain: 1.1 });
        bus.emit({ type: 'vfx', kind: 'burst', x: f.x, y: 0.05, color: '#9fb4c8', power: 2.0 });
        bus.emit({ type: 'shake', intensity: 0.45 });
        // brief landing-lag stun (only in neutral/jump — not already in hitstun/knockdown)
        if (f.state === 'jump') {
          f.state = 'hitstun';
          f.stateFrame = 0;
          f.stunFrames = K.LAND_HARD_STUN_FRAMES;
        }
      } else if (impactVy >= K.LAND_IMPACT_MEDIUM) {
        bus.emit({ type: 'sfx', name: 'land' });
        bus.emit({ type: 'vfx', kind: 'dust', x: f.x, y: 0.03, color: '#9fb4c8', power: 1.8 });
        bus.emit({ type: 'shake', intensity: 0.18 });
      }

      // state transitions on land (keep existing logic but use if/else to avoid double-fire)
      if (f.state === 'jump' && impactVy < K.LAND_IMPACT_HARD) {
        this.enter(f, 'idle');
        if (impactVy < K.LAND_IMPACT_MEDIUM) {
          // soft land - emit the normal events only if not already emitted above
          bus.emit({ type: 'sfx', name: 'land' });
          bus.emit({ type: 'vfx', kind: 'dust', x: f.x, y: 0.03, color: '#9fb4c8', power: 1.6 });
        }
      }
    } else if (f.y > 0) {
      f.grounded = false;
    }

    // --- ground friction (state-dependent, exponential) ---
    if (f.grounded) {
      const frictionRate = this.groundFrictionRate(f);
      if (frictionRate === null) {
        // state manages its own vx (dash, attack with root motion, etc.) — skip
      } else {
        // exponential decay: fast initial slide, tapers naturally
        const decay = Math.exp(-frictionRate * K.SIM_DT);
        f.vx *= decay;
        // snap to zero below threshold to avoid micro-sliding
        if (Math.abs(f.vx) < K.SLIDE_LINEAR_THRESHOLD) f.vx = 0;
      }
    }

    this.clampToStage(f);
  }

  /** Returns ground friction rate (per-second exponential) for f's current state.
   *  Returns null for states that own their own vx (dash, attack root motion). */
  private groundFrictionRate(f: FighterRuntime): number | null {
    switch (f.state) {
      case 'dashF': case 'dashB': return null; // stepDash owns vx
      case 'attack': case 'airAttack': return null; // runMoveFrames owns vx
      case 'jump': case 'airHitstun': return K.FRICTION_IDLE; // typically airborne; explicit for clarity
      case 'hitstun': case 'blockstun': return K.FRICTION_HITSTUN;
      case 'knockdown': return K.FRICTION_KNOCKDOWN;
      case 'ko': return K.FRICTION_KO;
      case 'idle': case 'walkF': case 'walkB':
      case 'crouch': case 'crouchWalkF': case 'crouchWalkB':
      case 'blockStand': case 'blockCrouch':
      case 'getup': case 'victory': case 'defeat':
      case 'introWalk': case 'introIdle': case 'superVictim':
        return K.FRICTION_IDLE;
      default:
        return K.FRICTION_IDLE;
    }
  }

  /* ------------------------- unique abilities ------------------------- */

  private speedMult(f: FighterRuntime): number {
    const b = f.abilityBuff;
    if (!b) return 1;
    if (b.kind === 'speed') return b.mult;
    if (b.kind === 'berserk') return 1.2;
    return 1;
  }

  private tryActivateAbility(f: FighterRuntime, opp: FighterRuntime): boolean {
    const def = CHARACTERS[f.char];
    const ab = def.ability;
    if (f.abilityCd > 0) return false;
    f.abilityCd = K.ABILITY_COOLDOWN_FRAMES;
    const m = this.match;
    const until = m.frame + ab.duration;
    const color = ab.color;

    bus.emit({ type: 'announce', text: ab.name, style: 'big', side: f.id, color });
    bus.emit({ type: 'sfx', name: 'ability', pan: f.x * 0.08 });
    bus.emit({ type: 'sfx', name: 'power', pan: f.x * 0.08, char: f.char });
    bus.emit({ type: 'vfx', kind: 'abilityStart', x: f.x, y: f.y + 1.05, color, attacker: f.id, power: 1, char: f.char });

    switch (ab.kind) {
      case 'damageBuff':
      case 'berserk':
      case 'speed':
      case 'drain':
      case 'armor':
      case 'overclock':
        f.abilityBuff = { kind: ab.kind, until, mult: ab.power };
        break;
      case 'counter':
        f.abilityBuff = { kind: 'counter', until, mult: ab.power };
        break;
      case 'invuln':
        f.invulnFrames = Math.max(f.invulnFrames, ab.duration);
        f.abilityBuff = { kind: 'invuln', until, mult: 1 };
        break;
      case 'teleport': {
        const oldX = f.x;
        const behind = opp.x - opp.facing * 0.85;
        f.x = clamp(behind, -K.STAGE_LIMIT, K.STAGE_LIMIT);
        f.facing = (sign(opp.x - f.x) || f.facing) as 1 | -1;
        bus.emit({ type: 'vfx', kind: 'burst', x: oldX, y: f.y + 1, color });
        bus.emit({ type: 'vfx', kind: 'burst', x: f.x, y: f.y + 1, color });
        bus.emit({ type: 'sfx', name: 'teleport' });
        break;
      }
      case 'shockwave': {
        bus.emit({ type: 'vfx', kind: 'shockwave', x: f.x, y: f.y + 0.9, color, power: 1.6 });
        bus.emit({ type: 'shake', intensity: 0.7 });
        const dist = Math.abs(opp.x - f.x);
        if (dist < (ab.power2 ?? 2.2) && isVulnerable(opp) && opp.grounded && opp.state !== 'ko') {
          this.applyDamage(f, opp, Math.round(ab.power * CHARACTERS[opp.char].defenseMult), false);
          opp.hitstop = Math.max(opp.hitstop, 8);
          f.hitstop = Math.max(f.hitstop, 6);
          if (opp.state !== 'superVictim') {
            opp.state = 'hitstun';
            opp.stateFrame = 0;
            opp.stunFrames = 20;
            opp.vx = (sign(opp.x - f.x) || f.facing) * 5.6;
            opp.vy = 2.6;
            opp.grounded = false;
            this.extras[opp.id].hitReact = 'mid';
          }
          bus.emit({ type: 'hit', x: opp.x, y: opp.y + 1, z: 0, power: ab.power, blocked: false, counter: false, effect: 'heavy', color, attacker: f.id });
        }
        break;
      }
      case 'meterGain':
        f.meter = Math.min(K.MAX_METER, f.meter + ab.power);
        bus.emit({ type: 'vfx', kind: 'charge', x: f.x, y: f.y + 1.1, color });
        break;
      case 'gravityPull': {
        const dist = Math.abs(opp.x - f.x);
        const range = ab.power;
        bus.emit({ type: 'vfx', kind: 'gravity', x: opp.x, y: opp.y + 1, color });
        if (dist < range && dist > 0.9 && isVulnerable(opp) && opp.grounded &&
          ['idle', 'walkF', 'walkB', 'crouch', 'blockStand', 'blockCrouch', 'blockstun'].includes(opp.state)) {
          opp.state = 'hitstun';
          opp.stateFrame = 0;
          opp.stunFrames = 30;
          opp.vx = (sign(f.x - opp.x) || 1) * 7.5;
          this.extras[opp.id].hitReact = 'mid';
          bus.emit({ type: 'sfx', name: 'gravity' });
        }
        break;
      }
      case 'secondWind': {
        f.health = Math.min(K.MAX_HEALTH, f.health + ab.power);
        bus.emit({ type: 'vfx', kind: 'heal', x: f.x, y: f.y + 1, color });
        break;
      }
      case 'drainField': {
        const stolen = Math.min(opp.meter, ab.power);
        opp.meter -= stolen;
        f.meter = Math.min(K.MAX_METER, f.meter + stolen);
        bus.emit({ type: 'vfx', kind: 'electric', x: opp.x, y: opp.y + 1.1, color });
        const dist = Math.abs(opp.x - f.x);
        if (dist < 3.5 && isVulnerable(opp) && opp.state !== 'ko' && opp.state !== 'superVictim') {
          opp.state = 'hitstun';
          opp.stateFrame = 0;
          opp.stunFrames = 40;
          opp.vx = 0;
          this.extras[opp.id].hitReact = 'high';
          bus.emit({ type: 'hit', x: opp.x, y: opp.y + 1.2, z: 0, power: 0, blocked: false, counter: false, effect: 'electric', color, attacker: f.id });
        }
        break;
      }
      case 'projBurst': {
        const offsets: [number, number][] = [[0.85, 5.0], [1.2, 5.8], [1.55, 6.6]];
        for (const [y, sp] of offsets) {
          this.match.projectiles.push({
            id: this.match.nextProjId++,
            owner: f.id,
            x: f.x + f.facing * 0.6,
            y: f.y + y,
            vx: f.facing * sp,
            damage: Math.round(ab.power * CHARACTERS[f.char].damageMult),
            hitstun: 16, blockstun: 12, level: 'mid',
            w: 0.34, h: 0.34,
            color, life: 110,
            knockX: 2.2, knockY: 0,
            beam: false, dead: false,
          });
        }
        bus.emit({ type: 'sfx', name: 'projectile' });
        break;
      }
    }
    return true;
  }

  /** RENEW: escape hitstun/knockdown with the secondWind ability. */
  private tryBurstEscape(f: FighterRuntime): boolean {
    if (CHARACTERS[f.char].ability.kind !== 'secondWind') return false;
    const has = f.buffer.some((b) => b.action === 'ability');
    if (!has || f.abilityCd > 0) return false;
    f.buffer = f.buffer.filter((b) => b.action !== 'ability');
    const def = CHARACTERS[f.char];
    f.abilityCd = K.ABILITY_COOLDOWN_FRAMES;
    f.health = Math.min(K.MAX_HEALTH, f.health + def.ability.power);
    f.stunFrames = 0;
    f.vx = 0;
    if (!f.grounded) { f.vy = 0; }
    this.enter(f, f.grounded ? 'idle' : 'jump');
    f.invulnFrames = Math.max(f.invulnFrames, 10);
    bus.emit({ type: 'announce', text: def.ability.name, style: 'big' });
    bus.emit({ type: 'vfx', kind: 'heal', x: f.x, y: f.y + 1, color: def.ability.color });
    bus.emit({ type: 'vfx', kind: 'burst', x: f.x, y: f.y + 1, color: def.ability.color, power: 1.2 });
    bus.emit({ type: 'sfx', name: 'ability' });
    return true;
  }

  /* ------------------------- projectiles ------------------------- */

  private stepProjectiles(): void {
    const m = this.match;
    if (m.projectiles.length === 0) return;
    for (const p of m.projectiles) {
      if (p.dead) continue;
      p.life--;
      if (p.life <= 0) { p.dead = true; continue; }
      p.x += p.vx * K.SIM_DT;
      if (Math.abs(p.x) > K.STAGE_LIMIT + 1.8) { p.dead = true; continue; }
      const def = m.fighters[p.owner === 0 ? 1 : 0];
      if (!isVulnerable(def)) continue;
      const pbox: AABB = { cx: p.x, cy: p.y, w: p.w, h: p.h };
      if (aabbOverlap(pbox, getHurtbox(def))) {
        this.resolveProjectileHit(p, def);
        p.dead = true;
      }
    }
    // opposing projectiles cancel each other
    for (let i = 0; i < m.projectiles.length; i++) {
      const a = m.projectiles[i];
      if (a.dead) continue;
      for (let j = i + 1; j < m.projectiles.length; j++) {
        const b = m.projectiles[j];
        if (b.dead || b.owner === a.owner) continue;
        if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2) {
          a.dead = true; b.dead = true;
          bus.emit({ type: 'vfx', kind: 'burst', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, color: '#ffffff', power: 0.8 });
          bus.emit({ type: 'sfx', name: 'block' });
        }
      }
    }
    m.projectiles = m.projectiles.filter((p) => !p.dead);
  }

  private resolveProjectileHit(p: Projectile, def: FighterRuntime): void {
    const att = this.match.fighters[p.owner];
    const ex = this.extras[att.id];
    const dex = this.extras[def.id];
    const blockState = def.state === 'blockStand' || def.state === 'blockCrouch' || def.state === 'blockstun';
    const blockType: 'stand' | 'crouch' = (def.crouching || def.state === 'blockCrouch') ? 'crouch' : 'stand';
    const blocked = blockState && def.grounded && blockBeatsLevel(blockType, p.level);

    if (blocked) {
      const chip = Math.max(1, Math.round(p.damage * K.CHIP_FRACTION * CHARACTERS[def.char].defenseMult));
      def.health = Math.max(1, def.health - chip);
      def.state = 'blockstun';
      def.stateFrame = 0;
      def.stunFrames = p.blockstun;
      def.vx = sign(p.vx) * p.knockX * 0.6;
      def.hitstop = Math.max(def.hitstop, 6);
      att.meter = Math.min(K.MAX_METER, att.meter + K.METER_ON_BLOCK);
      ex.hitConfirmed = true;
      bus.emit({ type: 'hit', x: p.x, y: p.y, z: 0, power: p.damage * 0.4, blocked: true, counter: false, effect: 'spark', color: '#bfe6ff', attacker: p.owner, char: att.char, defender: def.char });
      bus.emit({ type: 'sfx', name: 'block', pan: def.x * 0.08 });
      return;
    }

    const counter = def.state === 'attack' || def.state === 'airAttack';
    const dmg = Math.max(1, Math.round(p.damage * CHARACTERS[def.char].defenseMult * (counter ? K.COUNTER_HIT_MULT : 1)));
    this.applyDamage(att, def, dmg, counter);
    ex.hitConfirmed = true;
    def.hitstop = Math.max(def.hitstop, 10);
    def.state = 'hitstun';
    def.stateFrame = 0;
    def.stunFrames = p.hitstun + (counter ? 6 : 0);
    def.vx = sign(p.vx) * p.knockX;
    def.crouching = false;
    dex.hitReact = 'mid';
    dex.pendingKnockdown = false;
    bus.emit({ type: 'hit', x: p.x, y: p.y, z: 0, power: dmg, blocked: false, counter, effect: 'energy', color: p.color, attacker: p.owner, char: att.char, defender: def.char });
    bus.emit({ type: 'sfx', name: 'zapHit', pan: def.x * 0.08 });
    bus.emit({ type: 'shake', intensity: 0.4 });
  }

  /* ------------------------- netplay helpers ------------------------- */

  /** Compact deterministic hash of match-critical state (desync detection). */
  checksum(): string {
    const m = this.match;
    const parts: (string | number)[] = [m.phase, m.frame, m.round, m.timeLeft, m.koWinner ?? '-'];
    for (const f of m.fighters) {
      parts.push(
        f.state, f.stateFrame, Math.round(f.x * 100), Math.round(f.y * 100),
        Math.round(f.vx * 100), Math.round(f.vy * 100), f.facing, Math.round(f.health),
        Math.round(f.meter), f.hitstop, f.stunFrames, f.crouching ? 1 : 0, f.grounded ? 1 : 0,
        f.abilityCd, f.combo, f.roundsWon, f.invulnFrames, f.move?.id ?? '-',
      );
    }
    parts.push(m.projectiles.length);
    for (const p of m.projectiles) parts.push(p.id, Math.round(p.x * 50), Math.round(p.y * 50), p.dead ? 1 : 0);
    const str = parts.join('|');
    // fnv-1a
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
  }

  getSnapshot(): unknown {
    const m = this.match;
    return {
      phase: m.phase, phaseFrame: m.phaseFrame, frame: m.frame, round: m.round,
      timeLeft: m.timeLeft, timerFrames: m.timerFrames, koWinner: m.koWinner,
      matchWinner: m.matchWinner, timeScale: m.timeScale, timeScaleTarget: m.timeScaleTarget,
      projectiles: m.projectiles.map((p) => ({ ...p })),
      nextProjId: m.nextProjId,
      fighters: m.fighters.map((f, i) => {
        const { joints: _j, ...rest } = f;
        void _j;
        return { ...rest, move: f.move?.id ?? null, stats: { ...f.stats }, buffer: [], extra: { ...this.extras[i as 0 | 1] } };
      }),
    };
  }

  applySnapshot(snap: ReturnType<GameEngine['getSnapshot']> & Record<string, never>): void {
    const m = this.match;
    const s = snap as unknown as {
      phase: MatchRuntime['phase']; phaseFrame: number; frame: number; round: number;
      timeLeft: number; timerFrames: number; koWinner: MatchRuntime['koWinner'];
      matchWinner: MatchRuntime['matchWinner']; timeScale: number; timeScaleTarget: number;
      projectiles: Projectile[]; nextProjId: number;
      fighters: { move: string | null; extra?: { hitConfirmed: boolean; hitReact: string; pendingKnockdown: boolean; lastDirTapFrame: number }; [k: string]: unknown }[];
    };
    m.phase = s.phase; m.phaseFrame = s.phaseFrame; m.frame = s.frame; m.round = s.round;
    m.timeLeft = s.timeLeft; m.timerFrames = s.timerFrames; m.koWinner = s.koWinner;
    m.matchWinner = s.matchWinner; m.timeScale = s.timeScale; m.timeScaleTarget = s.timeScaleTarget;
    m.projectiles = s.projectiles.map((p) => ({ ...p }));
    m.nextProjId = s.nextProjId;
    s.fighters.forEach((sf, i) => {
      const f = m.fighters[i as 0 | 1];
      const moveId = sf.move;
      const { extra, ...fields } = sf as { extra?: FighterExtra; move: string | null };
      Object.assign(f, fields);
      f.joints = f.joints ?? {};
      f.buffer = [];
      f.move = moveId ? getMove(f.char, moveId) ?? null : null;
      if (f.move) f.moveHitFlags = f.move.hitboxes.map(() => false);
      if (extra) this.extras[i as 0 | 1] = { ...extra, hitReact: extra.hitReact as FighterExtra['hitReact'] };
    });
    this.pushHud(true);
  }

  /* ------------------------- phase scripts ------------------------- */

  private stepIntro(): void {
    const m = this.match;
    const t = m.phaseFrame;
    const [a, b] = m.fighters;
    const S = K.SIM_HZ;
    a.facing = 1; b.facing = -1;
    a.y = 0; b.y = 0;
    a.grounded = true; b.grounded = true;

    if (t === 24) { bus.emit({ type: 'flash', intensity: 0.55, color: '#cfe8ff' }); bus.emit({ type: 'sfx', name: 'thunder' }); }
    if (t === 30) bus.emit({ type: 'sfx', name: 'rainOn' });
    if (t === 110) { bus.emit({ type: 'flash', intensity: 0.4, color: '#cfe8ff' }); bus.emit({ type: 'sfx', name: 'thunder' }); }

    if (t < 3 * S) {
      // scene 1: empty street reveal
      a.state = 'introIdle'; b.state = 'introIdle';
      a.x = -5.6; b.x = 6.4;
    } else if (t < 6 * S) {
      // scene 2: fighter A walks in from the left
      a.state = 'introWalk';
      const p = (t - 3 * S) / (3 * S);
      a.x = -5.6 + p * 3.1;
      b.state = 'introIdle';
      if (t % 20 === 0) bus.emit({ type: 'sfx', name: 'stepSplash', pan: -0.3 });
    } else if (t < 9 * S) {
      // scene 3: fighter B enters from the right
      a.state = 'introIdle';
      a.x = -2.5;
      b.state = 'introWalk';
      const p = (t - 6 * S) / (3 * S);
      b.x = 6.4 - p * 3.9;
      if (t === 6 * S + 10) bus.emit({ type: 'sfx', name: 'thunder' });
    } else {
      // scene 4: face off, dolly out
      a.state = 'introIdle';
      b.state = 'introIdle';
      const p = Math.min(1, (t - 9 * S) / (0.7 * S));
      a.x = -2.5 + (-K.FIGHTER_START_X + 2.5) * p;
      b.x = 2.5 + (K.FIGHTER_START_X - 2.5) * p;
      if (t === Math.round(9.6 * S)) bus.emit({ type: 'announce', text: `ROUND ${m.round}`, style: 'round' });
      if (t === Math.round(10.9 * S)) { bus.emit({ type: 'announce', text: 'FIGHT!', style: 'fight' }); bus.emit({ type: 'sfx', name: 'bell' }); }
    }
    a.anim = { name: a.state === 'introWalk' ? 'walkF' : 'idle', frame: t };
    b.anim = { name: b.state === 'introWalk' ? 'walkF' : 'idle', frame: t };
    a.stateFrame = t; b.stateFrame = t;

    if (t >= K.INTRO_FRAMES) {
      m.phase = 'round_intro';
      m.phaseFrame = ROUND_INTRO_RESUME;
      a.state = 'idle'; b.state = 'idle';
      a.x = -K.FIGHTER_START_X; b.x = K.FIGHTER_START_X;
    }
  }

  private stepRoundIntro(): void {
    const m = this.match;
    const t = m.phaseFrame;
    for (const f of m.fighters) { f.vx = 0; f.vy = 0; f.state = 'idle'; f.stateFrame = t; }
    this.syncAnims();
    if (t === 8) bus.emit({ type: 'announce', text: m.round >= 3 ? 'FINAL ROUND' : `ROUND ${m.round}`, style: 'round' });
    if (t === 8) bus.emit({ type: 'sfx', name: 'whooshBig' });
    if (t === 88) { bus.emit({ type: 'announce', text: 'FIGHT!', style: 'fight' }); bus.emit({ type: 'sfx', name: 'bell' }); }
    if (t >= 108) {
      m.phase = m.mode === 'training' ? 'training' : 'fight';
      m.phaseFrame = 0;
    }
  }

  private triggerKo(winner: 0 | 1 | 'double'): void {
    const m = this.match;
    if (m.phase !== 'fight') return;
    m.phase = 'ko';
    m.phaseFrame = 0;
    m.koWinner = winner;
    m.timeScaleTarget = K.KO_SLOWMO_SCALE;
    const [a, b] = m.fighters;
    const loser = winner === 0 ? b : winner === 1 ? a : null;
    const win = winner === 0 ? a : winner === 1 ? b : null;
    if (loser) {
      loser.state = 'ko';
      loser.stateFrame = 0;
      loser.vy = 6.2;
      loser.vx = (win ? win.facing : sign(loser.vx)) * 3.0;
      loser.grounded = false;
      loser.hitstop = Math.max(loser.hitstop, 18);
      if (win) win.hitstop = Math.max(win.hitstop, 16);
    } else {
      a.state = 'ko'; b.state = 'ko';
      a.vy = 5; b.vy = 5;
      a.grounded = false; b.grounded = false;
    }
    bus.emit({ type: 'ko', winner });
    bus.emit({ type: 'slowmo', scale: K.KO_SLOWMO_SCALE, frames: K.KO_SLOWMO_FRAMES });
    bus.emit({ type: 'camera', mode: 'ko', duration: 5 });
    bus.emit({ type: 'flash', intensity: 1, color: '#ffffff' });
    bus.emit({ type: 'shake', intensity: 1.6 });
    bus.emit({ type: 'sfx', name: 'ko' });
    // physics continue so the KO'd body actually falls from the current position
    this.physics(a, a.hitstop > 0);
    this.physics(b, b.hitstop > 0);
  }

  private resolveTimeUp(): void {
    const m = this.match;
    const [a, b] = m.fighters;
    bus.emit({ type: 'announce', text: 'TIME UP', style: 'ko' });
    let winner: 0 | 1 | 'double';
    if (a.health > b.health) winner = 0;
    else if (b.health > a.health) winner = 1;
    else winner = 'double';
    m.phase = 'ko';
    m.phaseFrame = 0;
    m.koWinner = winner;
    m.timeScaleTarget = K.KO_SLOWMO_SCALE;
    bus.emit({ type: 'ko', winner });
    bus.emit({ type: 'slowmo', scale: K.KO_SLOWMO_SCALE, frames: K.KO_SLOWMO_FRAMES });
    bus.emit({ type: 'camera', mode: 'ko', duration: 5 });
  }

  private stepKo(): void {
    const m = this.match;
    const t = m.phaseFrame;
    // let bodies settle with physics (in slow-mo via timescale)
    for (const f of m.fighters) {
      if (f.hitstop > 0) { f.hitstop--; continue; }
      f.stateFrame++;
      if (f.state === 'ko') {
        this.physics(f, false);
      } else if (f.state !== 'victory') {
        f.vx = 0;
        // winner relaxes into idle until the victory pose
        if (f.state === 'attack' || f.state === 'hitstun') this.enter(f, 'idle');
        this.physics(f, false);
      }
    }
    if (t === 26) bus.emit({ type: 'announce', text: 'K.O.', style: 'ko' });
    if (t === 44) {
      const w = m.koWinner;
      const winner = w === 0 || w === 1 ? m.fighters[w] : null;
      if (winner && winner.health >= K.MAX_HEALTH && m.mode !== 'training') {
        bus.emit({ type: 'announce', text: 'PERFECT', style: 'round' });
        bus.emit({ type: 'sfx', name: 'perfect' });
      }
    }
    if (t === Math.round(K.KO_SLOWMO_FRAMES * 0.8)) m.timeScaleTarget = 1;
    if (t === 130) {
      const w = m.koWinner;
      if (w === 0 || w === 1) {
        m.fighters[w].state = 'victory';
        m.fighters[w].stateFrame = 0;
        m.fighters[w].vx = 0;
        bus.emit({ type: 'camera', mode: 'victory', duration: 4 });
        bus.emit({ type: 'sfx', name: 'victorySting' });
      }
      m.fighters.forEach((f, i) => {
        const isWinner = w === i || (w === 'double' && f.health <= 0);
        if (!isWinner && f.state !== 'ko') { f.state = 'defeat'; f.stateFrame = 0; }
      });
      if (w === 'double') {
        bus.emit({ type: 'announce', text: 'DOUBLE K.O.', style: 'ko' });
      }
      const winners: (0 | 1)[] = w === 'double' ? [0, 1] : w === 0 || w === 1 ? [w] : [];
      for (const id of winners) {
        m.fighters[id].roundsWon++;
        bus.emit({ type: 'roundWin', winner: id });
      }
      this.syncAnims();
    }
    if (t >= K.KO_PHASE_FRAMES) {
      const a = m.fighters[0], b = m.fighters[1];
      const decided = a.roundsWon >= K.ROUNDS_TO_WIN || b.roundsWon >= K.ROUNDS_TO_WIN;
      if (decided || m.mode === 'training') {
        if (m.mode === 'training') {
          // training never ends — just reset to fight
          this.newRound(true);
          return;
        }
        m.phase = 'match_end';
        m.phaseFrame = 0;
        m.matchWinner = a.roundsWon > b.roundsWon ? 0 : b.roundsWon > a.roundsWon ? 1 : 'double';
        if (m.matchWinner === 'double') {
          bus.emit({ type: 'announce', text: 'DRAW GAME', style: 'ko' });
        } else {
          const winChar = CHARACTERS[m.fighters[m.matchWinner].char];
          bus.emit({ type: 'announce', text: `${winChar.name} WINS`, style: 'ko' });
        }
        bus.emit({ type: 'matchEnd', winner: m.matchWinner });
        bus.emit({ type: 'camera', mode: 'victory', duration: 8 });
        bus.emit({ type: 'sfx', name: 'matchWin' });
      } else {
        m.phase = 'round_end';
        m.phaseFrame = 0;
      }
    }
    this.syncAnims();
  }

  private stepRoundEnd(): void {
    const m = this.match;
    const t = m.phaseFrame;
    for (const f of m.fighters) {
      f.vx = 0;
      if (f.hitstop > 0) f.hitstop--;
      if (f.state === 'ko' && f.grounded && t > 60) {
        // loser slowly gets to knees → defeat pose
        if (t === 61) { f.state = 'getup'; f.stateFrame = 0; }
        if (t > 61 + K.WAKEUP_FRAMES && f.state === 'getup') { f.state = 'defeat'; f.stateFrame = 0; }
      }
      f.stateFrame++;
    }
    if (t >= K.ROUND_END_FRAMES) this.newRound(false);
    this.syncAnims();
  }

  private stepMatchEnd(): void {
    const m = this.match;
    for (const f of m.fighters) {
      f.vx = 0;
      f.stateFrame++;
      if (f.state === 'ko' && m.phaseFrame === 90) { f.state = 'defeat'; f.stateFrame = 0; }
    }
    if (m.phaseFrame === 100) {
      useMatchStore.setState({ showResults: true });
    }
    this.syncAnims();
  }

  private newRound(keepRoundNumber: boolean): void {
    const m = this.match;
    if (!keepRoundNumber) m.round++;
    m.timeLeft = K.ROUND_TIME;
    m.timerFrames = 0;
    m.koWinner = null;
    m.timeScale = 1;
    m.timeScaleTarget = 1;
    m.projectiles = [];
    this.timeScaleRestoreFrame = 0;
    for (let i = 0 as 0 | 1; i < 2; i = (i + 1) as 0 | 1) {
      const f = m.fighters[i];
      f.health = K.MAX_HEALTH;
      f.x = i === 0 ? -K.FIGHTER_START_X : K.FIGHTER_START_X;
      f.y = 0; f.vx = 0; f.vy = 0;
      f.state = 'idle'; f.stateFrame = 0;
      f.facing = (i === 0 ? 1 : -1) as 1 | -1;
      f.grounded = true;
      f.hitstop = 0; f.stunFrames = 0;
      f.move = null; f.superTimeline = null;
      f.buffer = [];
      f.combo = 0; f.comboDamage = 0;
      f.invulnFrames = 0;
      f.abilityBuff = null;
      f.overclockAcc = 0;
      this.extras[i].hitConfirmed = false;
      this.extras[i].pendingKnockdown = false;
    }
    this.brains[1]?.reset();
    m.phase = m.mode === 'training' ? 'training' : 'round_intro';
    m.phaseFrame = m.mode === 'training' ? 200 : 0; // training restarts straight into sparring
    this.pushHud(true);
  }

  /* ------------------------- anim + hud sync ------------------------- */

  private syncAnims(): void {
    const m = this.match;
    for (const f of m.fighters) {
      const ex = this.extras[f.id];
      let name = f.state as string;
      let frame = f.stateFrame;
      if (f.state === 'attack' || f.state === 'airAttack') {
        name = f.move ? f.move.anim : 'idle';
      } else if (f.state === 'hitstun') {
        name = ex.hitReact === 'low' ? 'hitLow' : ex.hitReact === 'high' ? 'hitHigh' : 'hitMid';
      } else if (f.state === 'airHitstun') {
        name = ex.hitReact === 'launch' ? 'launched' : 'airHit';
      } else if (f.state === 'blockstun') {
        name = f.crouching ? 'blockCrouch' : 'blockStand';
      } else if (f.state === 'crouchWalkF' || f.state === 'crouchWalkB') {
        name = 'crouch';
      } else if (f.state === 'dashF') {
        name = 'dashF';
      } else if (f.state === 'dashB') {
        name = 'dashB';
      } else if (f.state === 'superVictim') {
        name = 'hitMid';
      }
      f.anim = { name, frame };
    }
  }

  private pushHud(force = false): void {
    const m = this.match;
    const [a, b] = m.fighters;
    const key = [
      m.phase, m.round, m.timeLeft,
      Math.round(a.health), Math.round(b.health),
      Math.round(a.meter), Math.round(b.meter),
      a.roundsWon, b.roundsWon,
      a.combo, Math.round(a.comboDamage), b.combo, Math.round(b.comboDamage),
      Math.ceil(a.abilityCd / 60), Math.ceil(b.abilityCd / 60),
      m.matchWinner,
    ].join('|');
    if (!force && key === this.hudCache) return;
    this.hudCache = key;
    useMatchStore.setState({
      phase: m.phase,
      round: m.round,
      timeLeft: m.timeLeft,
      health: [a.health, b.health],
      meter: [a.meter, b.meter],
      roundsWon: [a.roundsWon, b.roundsWon],
      combo: [{ count: a.combo, damage: Math.round(a.comboDamage) }, { count: b.combo, damage: Math.round(b.comboDamage) }],
      abilityCd: [Math.ceil(a.abilityCd / 60), Math.ceil(b.abilityCd / 60)],
      matchWinner: m.matchWinner,
    });
  }
}
