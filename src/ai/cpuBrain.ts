import type { FighterRuntime, InputSnapshot, MatchRuntime } from '../game/types';
import { emptyInput } from '../game/types';
import { getMove, resolveMoveId } from '../combat/moves';
import { CHARACTERS } from '../fighters/characters';
import { clamp } from '../game/utils';
import type { Difficulty } from '../config/settings';
import { SPECIAL_METER_COST, SUPER_METER_COST } from '../config/constants';

/* ================================================================== */
/*  CPU opponent. Perceives the match through a difficulty-scaled      */
/*  reaction delay, then executes plan steps: approach / retreat /     */
/*  block / poke / combo chains / punish / anti-air / special / super. */
/*  Decisions are driven by distance bands and opponent-state reads,   */
/*  not random button spam.                                            */
/* ================================================================== */

interface DiffProfile {
  reaction: number;
  planInterval: number;
  blockChance: number;
  crouchBlockChance: number;
  punishChance: number;
  antiAirChance: number;
  comboDepth: number;
  specialChance: number;
  superChance: number;
  aggression: number;
  jumpInChance: number;
}

const PROFILES: Record<Difficulty, DiffProfile> = {
  easy: {
    reaction: 22, planInterval: 26, blockChance: 0.28, crouchBlockChance: 0.3,
    punishChance: 0.15, antiAirChance: 0.2, comboDepth: 1, specialChance: 0.1,
    superChance: 0.12, aggression: 0.45, jumpInChance: 0.012,
  },
  normal: {
    reaction: 12, planInterval: 16, blockChance: 0.58, crouchBlockChance: 0.5,
    punishChance: 0.45, antiAirChance: 0.5, comboDepth: 2, specialChance: 0.22,
    superChance: 0.4, aggression: 0.62, jumpInChance: 0.02,
  },
  hard: {
    reaction: 6, planInterval: 9, blockChance: 0.85, crouchBlockChance: 0.78,
    punishChance: 0.82, antiAirChance: 0.82, comboDepth: 3, specialChance: 0.34,
    superChance: 0.75, aggression: 0.72, jumpInChance: 0.028,
  },
};

type AttackAction = 'lp' | 'hp' | 'lk' | 'hk' | 'special' | 'super';

interface PlanStep {
  kind: 'move' | 'block' | 'crouch' | 'idle' | 'jump' | 'retreat' | 'approach';
  action?: AttackAction;
  until: number;         // match.frame when the step expires
  pressed?: boolean;     // attack button already fired
  crouchBlock?: boolean;
  followGap?: number;    // frames to wait after this step before the next
}

interface Perc {
  oppState: string;
  oppFrame: number;
  oppX: number;
  oppMoveId: string | null;
  oppAirY: number;
  oppVy: number;
}

const STUNNED = ['hitstun', 'blockstun', 'airHitstun', 'knockdown', 'getup', 'ko', 'superVictim', 'victory', 'defeat'];

export class CpuBrain {
  private prof: DiffProfile;
  private steps: PlanStep[] = [];
  private nextPlanFrame = 0;
  private percQueue: Perc[] = [];
  private perc: Perc | null = null;
  private rngState: number;
  private rng: () => number;
  private training: boolean;
  private blockHoldUntil = 0;
  private lastAbilityFrame = -9999;

  constructor(difficulty: Difficulty, training = false, seed = 0x9e3779b9) {
    this.prof = PROFILES[difficulty];
    this.training = training;
    this.rngState = seed >>> 0;
    this.rng = () => {
      this.rngState = (this.rngState + 0x6d2b79f5) | 0;
      let t = Math.imul(this.rngState ^ (this.rngState >>> 15), 1 | this.rngState);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  setDifficulty(d: Difficulty): void { this.prof = PROFILES[d]; }

  reset(): void {
    this.steps = [];
    this.percQueue = [];
    this.perc = null;
    this.nextPlanFrame = 0;
    this.blockHoldUntil = 0;
    this.lastAbilityFrame = -9999;
  }

  think(match: MatchRuntime, idx: 0 | 1): InputSnapshot {
    const me = match.fighters[idx];
    const opp = match.fighters[idx === 0 ? 1 : 0];
    const snap = emptyInput();
    const now = match.frame;

    // delayed perception
    this.percQueue.push({
      oppState: opp.state, oppFrame: opp.stateFrame, oppX: opp.x,
      oppMoveId: opp.move?.id ?? null, oppAirY: opp.y, oppVy: opp.vy,
    });
    while (this.percQueue.length > this.prof.reaction) this.perc = this.percQueue.shift() ?? null;

    const stunned = STUNNED.includes(me.state);
    const busy = ['attack', 'airAttack', 'dashF', 'dashB', 'jump'].includes(me.state);
    const live = match.phase === 'fight' || match.phase === 'training';
    if (!live) return snap;

    // training dummy behavior overrides
    if (this.training) {
      const d = match.training.dummy;
      if (d === 'idle') return snap;
      if (d === 'block') { snap.block = true; return snap; }
    }

    // hold block through blockstun
    if (me.state === 'blockstun' && now < this.blockHoldUntil) snap.block = true;

    // RENEW-style burst: escape combos with secondWind while stunned
    if (stunned && me.abilityCd <= 0 && CHARACTERS[me.char].ability.kind === 'secondWind') {
      const inCombo = opp.combo >= 2 || me.health < 350;
      if (inCombo && this.rng() < this.prof.blockChance) {
        snap.ability = true;
        this.lastAbilityFrame = now;
        return snap;
      }
    }
    if (stunned) return snap;

    // projectile defense: incoming energy → guard (delayed perception)
    if (!busy) {
      for (const pr of match.projectiles) {
        if (pr.owner === idx || pr.dead) continue;
        const toward = (pr.vx > 0 && pr.x < me.x) || (pr.vx < 0 && pr.x > me.x);
        if (toward && Math.abs(pr.x - me.x) < 3.4 && Math.abs(pr.y - 1) < 1.4) {
          if (this.rng() < this.prof.blockChance * 0.35) {
            this.blockHoldUntil = now + 30;
            this.steps = [{ kind: 'block', until: now + 26, crouchBlock: false }];
          }
          break;
        }
      }
    }

    const dist = Math.abs(opp.x - me.x);
    const dir = opp.x > me.x ? 1 : -1;
    const perc = this.perc;

    /* ---------- reactive layer (interrupts plans) ---------- */
    if (!busy && perc) {
      // defensive block against readable attacks
      const move = perc.oppMoveId ? getMove(opp.char, perc.oppMoveId) : null;
      const attackIncoming = (perc.oppState === 'attack' || perc.oppState === 'airAttack' || perc.oppState === 'jump');
      const started = move ? perc.oppFrame >= Math.max(0, move.startup - 3) : perc.oppFrame > 4;
      const close = Math.abs(perc.oppX - me.x) < 2.5;
      if (attackIncoming && started && close && now > this.blockHoldUntil - 10) {
        if (this.steps.length === 0 || this.steps[0].kind !== 'block') {
          if (this.rng() < this.prof.blockChance) {
            const crouchBlock = this.rng() < this.prof.crouchBlockChance || (move?.hitboxes[0]?.level === 'low');
            this.blockHoldUntil = now + 34;
            this.steps = [{ kind: 'block', until: now + 30, crouchBlock }];
          }
        }
      }
      // anti-air
      if (!opp.grounded && perc.oppAirY > 0.5 && perc.oppVy < 2.5 && dist < 1.8 && me.grounded && !this.isBusyStep()) {
        if (this.rng() < this.prof.antiAirChance * 0.12) {
          this.steps = [{ kind: 'move', action: 'hp', until: now + 30 }];
        }
      }
      // punish recovery
      if (me.grounded && perc.oppState === 'attack' && move && perc.oppFrame > move.startup + move.active && dist < 1.7) {
        if (this.rng() < this.prof.punishChance * 0.2 && !this.isBusyStep()) {
          this.steps = this.buildCombo(me, now, true);
        }
      }
    }

    /* ---------- deliberative layer ---------- */
    if (!busy && me.grounded && this.steps.length === 0 && now >= this.nextPlanFrame) {
      this.steps = this.makePlan(me, opp, match, now, dist);
      this.nextPlanFrame = now + this.prof.planInterval + Math.floor(this.rng() * 8);
    }

    /* ---------- unique ability (15s cooldown) ---------- */
    if (!busy && me.grounded && me.abilityCd <= 0 && now - this.lastAbilityFrame > 90 &&
        this.steps.length === 0 && this.considerAbility(me, opp, dist, now)) {
      snap.ability = true;
      this.lastAbilityFrame = now;
      this.nextPlanFrame = now + 12;
      return snap;
    }

    /* ---------- execute ---------- */
    if (this.steps.length > 0) {
      const step = this.steps[0];
      if (now >= step.until) {
        this.steps.shift();
        if (step.followGap) this.nextPlanFrame = Math.max(this.nextPlanFrame, now + step.followGap);
      } else {
        this.execStep(step, me, opp, snap, dir, dist, now);
      }
    }
    return snap;
  }

  private isBusyStep(): boolean {
    return this.steps.length > 0 && this.steps[0].kind === 'move';
  }

  private execStep(step: PlanStep, me: FighterRuntime, opp: FighterRuntime, snap: InputSnapshot, dir: number, dist: number, now: number): void {
    switch (step.kind) {
      case 'idle': break;
      case 'approach':
        if (dir > 0) snap.right = true; else snap.left = true;
        break;
      case 'retreat':
        if (dir > 0) snap.left = true; else snap.right = true;
        break;
      case 'block':
        snap.block = true;
        if (step.crouchBlock) snap.down = true;
        break;
      case 'crouch':
        snap.down = true;
        break;
      case 'jump': {
        if (!step.pressed) {
          snap.upEdge = true;
          snap.up = true;
          if (dir > 0) snap.right = true; else snap.left = true;
          step.pressed = true;
        } else if (!me.grounded) {
          if (dir > 0) snap.right = true; else snap.left = true;
          if (me.vy < 0.5 && dist < 1.9) snap.hk = true; // dive kick near apex
        }
        break;
      }
      case 'move': {
        const action = step.action!;
        const moveId = resolveMoveId(me.char, action, { crouching: false, airborne: false });
        const move = moveId ? getMove(me.char, moveId) : null;
        if (!move) { this.steps.shift(); return; }
        if (!step.pressed) {
          if (me.meter < move.meterCost) { this.steps.shift(); return; }
          const range = move.hitboxes.length ? Math.max(...move.hitboxes.map((h) => h.x + h.w / 2)) : 1;
          const isDash = !!move.advance?.some((a) => a.vx > 5);
          const reach = range + (isDash ? 3.0 : 0.3);
          if (dist > reach && me.grounded) {
            if (dir > 0) snap.right = true; else snap.left = true; // close distance first
            if (now > step.until - 6) this.steps.shift();
            return;
          }
          snap[action] = true;
          step.pressed = true;
          step.until = now + 6;
          if (move.kind === 'normal') {
            step.followGap = Math.max(2, move.startup + move.active - 4);
          } else {
            step.followGap = move.startup + move.active + 6;
          }
        }
        break;
      }
    }
    void opp;
  }

  private makePlan(me: FighterRuntime, _opp: FighterRuntime, _match: MatchRuntime, now: number, dist: number): PlanStep[] {
    const r = this.rng();
    const P = this.prof;

    // super when full meter and in range
    if (me.meter >= SUPER_METER_COST && dist < 2.8 && r < P.superChance) {
      return [{ kind: 'move', action: 'super', until: now + 40 }];
    }
    // special at dash range
    if (me.meter >= SPECIAL_METER_COST && dist > 1.5 && dist < 4.6 && r < P.specialChance) {
      return [{ kind: 'move', action: 'special', until: now + 40 }];
    }

    if (dist > 4.0) {
      if (r < P.jumpInChance * 30) {
        return [{ kind: 'jump', until: now + 55 }];
      }
      return [{ kind: 'approach', until: now + 18 + Math.floor(r * 24) }];
    }
    if (dist > 2.1) {
      if (r < P.aggression) return [{ kind: 'approach', until: now + 10 + Math.floor(r * 16) }];
      if (r < P.aggression + 0.22) return [{ kind: 'move', action: r < 0.5 ? 'hk' : 'lk', until: now + 34 }];
      return [{ kind: 'idle', until: now + 8 + Math.floor(r * 12) }];
    }
    // close
    if (!this.training && r < 0.1) return [{ kind: 'retreat', until: now + 12 + Math.floor(r * 14) }];
    if (r < 0.18) return [{ kind: 'block', until: now + 18 + Math.floor(r * 14), crouchBlock: r < 0.1 }];
    if (r < 0.24) return [{ kind: 'crouch', until: now + 8 }];
    return this.buildCombo(me, now, false);
  }

  /** Situation-aware ability usage — no random spam. */
  private considerAbility(me: FighterRuntime, opp: FighterRuntime, dist: number, now: number): boolean {
    const ab = CHARACTERS[me.char].ability;
    const P = this.prof;
    const will = this.rng() < (P.comboDepth >= 3 ? 0.5 : P.comboDepth === 2 ? 0.28 : 0.1);
    void now;
    const hpFrac = me.health / 1000;
    switch (ab.kind) {
      case 'shockwave': return dist < 1.9 && will;
      case 'teleport': return (dist < 2.6 || Math.abs(me.x) > 5.4) && will;
      case 'gravityPull': return dist > 2.2 && dist < 5 && opp.grounded && will;
      case 'projBurst': return dist > 1.2 && dist < 5.2 && will;
      case 'drainField': return dist < 3.4 && opp.meter > 15 && will;
      case 'secondWind': return hpFrac < 0.55 && will;           // proactive heal
      case 'drain': return hpFrac < 0.75 && dist < 3 && will;
      case 'meterGain': return me.meter >= 20 && me.meter <= 70 && will;
      case 'armor': return dist > 1.6 && dist < 4.6 && will;
      case 'counter': return dist < 2.4 && (opp.state === 'attack' || hpFrac < 0.4) && this.rng() < 0.6;
      case 'invuln': return hpFrac < 0.4 && dist < 2.8 && will;
      case 'damageBuff':
      case 'berserk':
      case 'overclock':
      case 'speed':
        return dist < 3.6 && will;                               // pop before pressure
      default: return false;
    }
  }

  private buildCombo(me: FighterRuntime, now: number, punish: boolean): PlanStep[] {
    const r = this.rng();
    const P = this.prof;
    const depth = punish ? clamp(P.comboDepth, 1, 3) : clamp(1 + Math.floor(r * P.comboDepth), 1, 3);
    const starter: AttackAction = punish
      ? (me.char === 'kaito' ? 'hk' : 'hp')
      : (r < 0.5 ? 'lp' : r < 0.75 ? 'lk' : 'hp');
    const steps: PlanStep[] = [{ kind: 'move', action: starter, until: now + 30 }];
    if (depth >= 2) {
      const second: AttackAction = starter === 'lp' || starter === 'lk' ? 'hp' : 'hk';
      steps.push({ kind: 'move', action: second, until: now + 90 });
    }
    if (depth >= 3 && me.meter >= SPECIAL_METER_COST) {
      steps.push({ kind: 'move', action: 'special', until: now + 160 });
    }
    return steps;
  }
}
