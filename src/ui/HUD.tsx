import { memo } from 'react';
import { useMatchStore } from '../game/matchStore';
import { MAX_HEALTH, MAX_METER, ROUNDS_TO_WIN } from '../config/constants';
import { Portrait } from './Portrait';
import { CHARACTERS } from '../fighters/characters';
import type { CharId } from '../game/types';

/* Fighting-game HUD: names, portraits, health w/ damage ghost, super
   meter, round timer, round-win pips, combo popups. */

interface SideProps {
  side: 0 | 1;
  name: string;
  char: CharId;
}

const Side = memo(function Side({ side, name, char }: SideProps) {
  const health = useMatchStore((s) => s.health[side]);
  const meter = useMatchStore((s) => s.meter[side]);
  const roundsWon = useMatchStore((s) => s.roundsWon[side]);
  const combo = useMatchStore((s) => s.combo[side]);
  const abilityCd = useMatchStore((s) => s.abilityCd[side]);
  const ability = CHARACTERS[char].ability;
  const abilityPct = abilityCd > 0 ? ((15 - abilityCd) / 15) * 100 : 100;
  const hpPct = Math.max(0, Math.min(100, (health / MAX_HEALTH) * 100));
  const meterPct = Math.max(0, Math.min(100, (meter / MAX_METER) * 100));

  return (
    <div className={`hud-side ${side === 0 ? 'left' : 'right'}`}>
      <div className="hud-top">
        <div className={`portrait-frame ${side === 0 ? 'p1' : 'p2'}`}>
          <Portrait char={char} />
        </div>
        <div className="bar-stack">
          <div className="name-row">
            <span className={`pname ${side === 0 ? 'p1' : 'p2'}`}>{name}</span>
            <span className="pips">
              {Array.from({ length: ROUNDS_TO_WIN }, (_, i) => (
                <span key={i} className={`pip-round ${i < roundsWon ? `won-${side === 0 ? 'p1' : 'p2'}` : ''}`} />
              ))}
            </span>
          </div>
          <div className={`health-wrap ${hpPct < 25 ? 'low' : ''}`}>
            <div className="health-ghost" style={{ width: `${hpPct}%` }} />
            <div className={`health-fill ${side === 0 ? 'p1' : 'p2'}`} style={{ width: `${hpPct}%` }} />
            <div className="health-ticks" />
          </div>
          <div className={`meter-wrap ${meterPct >= 100 ? 'max' : ''}`} style={{ marginLeft: side === 1 ? 'auto' : 0 }}>
            <div className="meter-fill" style={{ width: `${meterPct}%` }} />
            <div className="meter-segs" />
          </div>
          <div className="meter-label">{meterPct >= 100 ? '★ SUPER READY — SPACE ★' : 'SUPER METER'}</div>
          <div
            className={`ability-wrap ${abilityCd <= 0 ? 'ready' : ''}`}
            style={{ '--ab-color': ability.color } as React.CSSProperties}
            title={`${ability.name} — ${ability.desc} (15s cooldown)`}
          >
            <div className="ability-ring" style={{ '--ab-pct': abilityPct } as React.CSSProperties}>
              <span>{abilityCd > 0 ? abilityCd : '★'}</span>
            </div>
            <span className="ability-name">{ability.name}</span>
          </div>
        </div>
      </div>
      {combo.count >= 2 && (
        <div className={`combo-pop ${side === 0 ? 'left' : 'right'}`} key={combo.count} style={{ position: 'relative', top: 8, left: side === 0 ? 4 : undefined, right: side === 1 ? 4 : undefined, marginLeft: side === 0 ? 70 : 0, marginRight: side === 1 ? 70 : 0, alignSelf: side === 1 ? 'flex-end' : 'flex-start' }}>
          <div className="hits">{combo.count} HITS</div>
          <div className="dmg">{combo.damage} DMG</div>
          <div className="word">COMBO</div>
        </div>
      )}
    </div>
  );
});

const Center = memo(function Center() {
  const timeLeft = useMatchStore((s) => s.timeLeft);
  const round = useMatchStore((s) => s.round);
  const phase = useMatchStore((s) => s.phase);
  const showTime = phase !== 'intro';
  return (
    <div className="hud-center">
      <div className="timer-box">
        <div className={`timer-num ${timeLeft <= 10 ? 'urgent' : ''}`}>
          {showTime ? String(Math.max(0, timeLeft)).padStart(2, '0') : '––'}
        </div>
      </div>
      <div className="round-label">ROUND {round}</div>
    </div>
  );
});

export function HUD({ p1Name, p2Name, p1Char, p2Char }: { p1Name: string; p2Name: string; p1Char: CharId; p2Char: CharId }) {
  return (
    <div className="hud">
      <Side side={0} name={p1Name} char={p1Char} />
      <Center />
      <Side side={1} name={p2Name} char={p2Char} />
    </div>
  );
}
