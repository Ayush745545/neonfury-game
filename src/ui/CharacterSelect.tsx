import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useMatchStore } from '../game/matchStore';
import { netSession } from '../net/session';
import { CHARACTERS, ROSTER } from '../fighters/characters';
import { Portrait } from './Portrait';
import { audio } from '../audio/audioEngine';
import type { CharId } from '../game/types';

const COLS = 5;

export function CharacterSelect() {
  const mode = useMatchStore((s) => s.mode);
  const netRole = useMatchStore((s) => s.netRole);
  const pickChar = useMatchStore((s) => s.pickChar);
  const gotoMenu = useMatchStore((s) => s.gotoMenu);
  const setScreen = useMatchStore((s) => s.setScreen);
  const local = mode === 'local';
  const [p1, setP1] = useState<CharId | null>(null);
  const [p2, setP2] = useState<CharId | null>(null);
  const [cursor, setCursor] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const stage = local ? (p1 ? 2 : 1) : 1;

  useEffect(() => {
    if (rootRef.current) {
      gsap.fromTo(rootRef.current.querySelectorAll('.roster-card'),
        { opacity: 0, y: 34 },
        { opacity: 1, y: 0, duration: 0.32, stagger: 0.022, ease: 'power2.out' });
    }
  }, []);

  const net = mode === 'net';
  const confirm = (c: CharId) => {
    audio.play('ui');
    if (net) {
      // host is P1 (also picks stage), guest is P2
      if (netSession.role === 'host') {
        setP1(c);
        pickChar('p1', c);
        window.setTimeout(() => setScreen('stage'), 350);
      } else {
        setP2(c);
        pickChar('p2', c);
        netSession.sendMyConfig(c);
        window.setTimeout(() => setScreen('net'), 350);
      }
      return;
    }
    if (stage === 1) {
      setP1(c);
      pickChar('p1', c);
      if (!local) {
        // CPU takes the mirror slot; player can still override on stage select back-nav
        const other = ROSTER.find((r) => r !== c) ?? 'kaito';
        setP2(other);
        pickChar('p2', other);
      }
    } else if (local && !p2) {
      setP2(c);
      pickChar('p2', c);
      window.setTimeout(() => setScreen('stage'), 420);
    }
    if (!local) window.setTimeout(() => setScreen('stage'), 420);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') { gotoMenu(); return; }
      const move = (d: number) => { setCursor((c) => (c + d + ROSTER.length) % ROSTER.length); audio.play('uiHover'); };
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') move(-1);
      if (e.code === 'KeyD' || e.code === 'ArrowRight') move(1);
      if (e.code === 'KeyW' || e.code === 'ArrowUp') move(-COLS);
      if (e.code === 'KeyS' || e.code === 'ArrowDown') move(COLS);
      if (e.code === 'KeyJ' || e.code === 'Enter' || e.code === 'Space' || e.code === 'Numpad1') {
        confirm(ROSTER[cursor]);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, p1, p2, stage]);

  const focused = CHARACTERS[ROSTER[cursor]];
  const who = stage === 1 ? 'PLAYER 1' : local ? 'PLAYER 2' : 'CPU';

  return (
    <div className="select-root" ref={rootRef}>
      <div className="select-title nf-title">SELECT YOUR FIGHTER</div>
      <div className="select-hint">
        {netRole ? (netRole === 'host' ? 'HOST' : 'GUEST') + ' — ' : ''}{who} · WASD/arrows move · J/ENTER confirm · ESC back
      </div>
      <div className="roster-grid">
        {ROSTER.map((cid, i) => {
          const c = CHARACTERS[cid];
          const isCursor = cursor === i;
          return (
            <div
              key={cid}
              className={`roster-card ${isCursor ? 'cursor' : ''} ${p1 === cid ? 'sel-p1' : ''} ${p2 === cid && local ? 'sel-p2' : ''}`}
              style={{ borderColor: isCursor ? c.color : undefined }}
              onMouseEnter={() => { setCursor(i); audio.play('uiHover'); }}
              onClick={() => confirm(cid)}
            >
              <div className="rc-portrait" style={{ boxShadow: `0 0 18px ${c.color}44` }}>
                <Portrait char={cid} size={92} />
              </div>
              <div className="rc-name" style={{ color: c.uiAccent }}>{c.name}</div>
              <div className="rc-ability">{c.ability.name}</div>
              {p1 === cid && <div className="rc-badge b1">P1</div>}
              {p2 === cid && (local || !p1) && <div className="rc-badge b2">{local ? 'P2' : 'CPU'}</div>}
              {p2 === cid && !local && p1 && <div className="rc-badge b2">CPU</div>}
            </div>
          );
        })}
      </div>
      <div className="roster-detail nf-panel">
        <div className="rd-left">
          <span className="rd-name" style={{ color: focused.uiAccent }}>{focused.name}</span>
          <span className="rd-title">{focused.title}</span>
        </div>
        <div className="rd-mid">
          <div><b>SPECIAL</b> {focused.specialName} <i>(O · 25 meter)</i></div>
          <div><b>SUPER</b> {focused.superName} <i>(SPACE · full meter)</i></div>
          <div><b>ABILITY</b> {focused.ability.name} — {focused.ability.desc} <i>(P · 15s cooldown)</i></div>
        </div>
        <div className="rd-stats">
          {(['power', 'speed', 'technique', 'defense'] as const).map((k) => (
            <div className="stat-row" key={k}>
              <span style={{ width: 76 }}>{k.toUpperCase()}</span>
              <span className="pips">
                {Array.from({ length: 10 }, (_, i) => (
                  <span key={i} className={`pip ${i < focused.statBars[k] ? 'on-red' : ''}`}
                    style={i < focused.statBars[k] ? { background: focused.color, boxShadow: `0 0 6px ${focused.color}` } : undefined} />
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
