import { CHARACTERS } from './characters';
import type { CharId, FighterRuntime } from '../game/types';

/** Independent presentation runtime: never instantiates or advances a combat engine. */
export function previewRuntime(char: CharId): FighterRuntime {
  return {
    id: 0, char, cpu: false, x: 0, y: 0, vx: 0, vy: 0, facing: 1,
    health: 1000, meter: 0, roundsWon: 0, state: 'idle', stateFrame: 0,
    move: null, moveHitFlags: [], hitstop: 0, stunFrames: 0, crouching: false,
    grounded: true, blockHeld: false, combo: 0, comboDamage: 0, lastChain: null,
    chainsUsed: 0, invulnFrames: 0, buffer: [], anim: { name: 'idle', frame: 0 },
    superTimeline: null, noDamageFor: 0, lastHitPower: 0, joints: {},
    stats: CHARACTERS[char].stats, abilityCd: 0, abilityBuff: null, overclockAcc: 0,
  };
}
