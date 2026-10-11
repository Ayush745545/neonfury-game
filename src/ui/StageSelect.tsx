import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useMatchStore } from '../game/matchStore';
import { netSession } from '../net/session';
import { STAGES } from '../arenas/stages';
import { audio } from '../audio/audioEngine';

const COLS = 5;

const WEATHER_ICON: Record<string, string> = {
  rain: '🌧', storm: '⚡', snow: '❄', embers: '🔥', petals: '🌸', mist: '🌫', clear: '🌙',
};

export function StageSelect() {
  const setStage = useMatchStore((s) => s.setStage);
  const startMatch = useMatchStore((s) => s.startMatch);
  const gotoMenu = useMatchStore((s) => s.gotoMenu);
  const setScreen = useMatchStore((s) => s.setScreen);
  const [cursor, setCursor] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (rootRef.current) {
      gsap.fromTo(rootRef.current.querySelectorAll('.stage-card'),
        { opacity: 0, y: 30, rotateX: -12 },
        { opacity: 1, y: 0, rotateX: 0, duration: 0.34, stagger: 0.025, ease: 'power2.out' });
    }
  }, []);

  const net = useMatchStore((s) => s.mode) === 'net';
  const p1Char = useMatchStore((s) => s.p1Char);
  const confirm = (i: number) => {
    audio.play('ui');
    setStage(STAGES[i].id);
    if (net) {
      // host sends the full match config, then waits for the guest's pick
      if (p1Char) netSession.sendMyConfig(p1Char, STAGES[i].id);
      window.setTimeout(() => setScreen('net'), 300);
      return;
    }
    window.setTimeout(() => startMatch(), 320);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') { setScreen('select'); return; }
      const move = (d: number) => { setCursor((c) => (c + d + STAGES.length) % STAGES.length); audio.play('uiHover'); };
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') move(-1);
      if (e.code === 'KeyD' || e.code === 'ArrowRight') move(1);
      if (e.code === 'KeyW' || e.code === 'ArrowUp') move(-COLS);
      if (e.code === 'KeyS' || e.code === 'ArrowDown') move(COLS);
      if (e.code === 'KeyJ' || e.code === 'Enter' || e.code === 'Space') { confirm(cursor); e.preventDefault(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);

  const focused = STAGES[cursor];

  return (
    <div className="select-root" ref={rootRef}>
      <div className="select-title nf-title">SELECT LOCATION</div>
      <div className="select-hint">15 CITY ARENAS · WASD/arrows move · J/ENTER confirm · ESC back</div>
      <div className="stage-grid">
        {STAGES.map((st, i) => (
          <div
            key={st.id}
            className={`stage-card ${cursor === i ? 'cursor' : ''}`}
            onMouseEnter={() => { setCursor(i); audio.play('uiHover'); }}
            onClick={() => confirm(i)}
            style={{ borderColor: cursor === i ? st.neonR : undefined }}
          >
            <div className="sc-art" style={{
              background: `linear-gradient(160deg, ${st.uiGradient[0]}, ${st.uiGradient[1]} 55%, #04050a)`,
            }}>
              <span className="sc-weather">{WEATHER_ICON[st.weather] ?? ''}</span>
              <div className="sc-neonline" style={{ background: st.neonL, boxShadow: `0 0 10px ${st.neonL}` }} />
              <div className="sc-neonline n2" style={{ background: st.neonR, boxShadow: `0 0 10px ${st.neonR}` }} />
            </div>
            <div className="sc-name">{st.name}</div>
            <div className="sc-sub">{st.subtitle}</div>
          </div>
        ))}
      </div>
      <div className="stage-focus nf-panel">
        <span style={{ color: focused.neonR, fontFamily: 'var(--nf-display)', letterSpacing: 3 }}>
          {focused.name}
        </span>
        <span className="small-note" style={{ marginLeft: 16 }}>
          {focused.subtitle} · weather: {focused.weather.toUpperCase()} · {focused.props.length ? `props: ${focused.props.join(', ')}` : 'open street'}
        </span>
      </div>
      <button className="nf-btn" style={{ width: 220, marginTop: 14 }} onClick={() => { audio.play('ui'); gotoMenu(); }}>
        Quit to Menu
      </button>
    </div>
  );
}
