import type { InputSnapshot } from '../game/types';

/* Compact wire encoding: one InputSnapshot == a 15-bit integer. */

const FIELDS: (keyof InputSnapshot)[] = [
  'left', 'right', 'up', 'down', 'block',
  'lp', 'hp', 'lk', 'hk',
  'special', 'super', 'ability', 'upEdge', 'dashF', 'dashB',
];

export function encodeInput(s: InputSnapshot): number {
  let m = 0;
  for (let i = 0; i < FIELDS.length; i++) {
    if (s[FIELDS[i]]) m |= 1 << i;
  }
  return m;
}

export function decodeInput(m: number): InputSnapshot {
  const s: InputSnapshot = {
    left: false, right: false, up: false, down: false, block: false,
    lp: false, hp: false, lk: false, hk: false,
    special: false, super: false, ability: false, upEdge: false, dashF: false, dashB: false,
  };
  for (let i = 0; i < FIELDS.length; i++) {
    if (m & (1 << i)) s[FIELDS[i]] = true;
  }
  return s;
}

/* Wire messages (all JSON). */
export type NetMsg =
  | { t: 'hello'; role: 'host' | 'guest'; room: string }
  | { t: 'welcome'; you: 'host' | 'guest'; room: string; lan: { ip: string; port: number; url: string } }
  | { t: 'paired'; room: string }
  | { t: 'error'; msg: string }
  | { t: 'peer-left' }
  | { t: 'cfg'; char: string; stage?: string; seed?: number }
  | { t: 'input'; f: number; i: number }
  | { t: 'chk'; f: number; h: string }
  | { t: 'snap'; f: number; s: unknown }
  | { t: 'bye' }
  | { t: 'rematch' };
