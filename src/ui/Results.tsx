import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { useMatchStore } from '../game/matchStore';
import { CHARACTERS } from '../fighters/characters';
import { audio } from '../audio/audioEngine';
import type { GameEngine } from '../game/GameEngine';

export function ResultsScreen({ engine, onRematch, onChars, onMenu }: {
  engine: GameEngine;
  onRematch: () => void;
  onChars: () => void;
  onMenu: () => void;
}) {
  const matchWinner = useMatchStore((s) => s.matchWinner);
  const roundsWon = useMatchStore((s) => s.roundsWon);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      gsap.fromTo(ref.current, { opacity: 0, y: 46, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'power3.out' });
    }
  }, []);

  const [f0, f1] = engine.match.fighters;
  const winnerFighter = matchWinner === 0 ? f0 : matchWinner === 1 ? f1 : null;
  const winnerChar = winnerFighter ? CHARACTERS[winnerFighter.char] : null;
  const st = engine.match.stats;

  return (
    <div className="overlay-root" style={{ background: 'rgba(2,3,8,0.55)' }}>
      <div ref={ref} className="nf-panel results-card" style={{ opacity: 0 }}>
        <div className="results-sub">{matchWinner === 'double' ? 'NO CONTEST' : 'MATCH RESULT'}</div>
        <div className={`results-winner ${matchWinner === 1 ? 'p2' : 'p1'}`}>
          {winnerChar ? winnerChar.name : 'DRAW'}
        </div>
        <div className="results-sub">{winnerChar ? winnerChar.title : 'DOUBLE KNOCKOUT'}</div>
        <div className="results-stats">
          <div className="res-col">
            <h4 style={{ color: '#ffb3c2' }}>{CHARACTERS[f0.char].name}</h4>
            <div className="val">{roundsWon[0]}</div><div className="lbl">ROUNDS</div>
            <div className="val">{st[0].maxCombo}</div><div className="lbl">MAX COMBO</div>
            <div className="val">{Math.round(st[0].damage)}</div><div className="lbl">DAMAGE</div>
          </div>
          <div className="res-col">
            <h4 style={{ color: '#a8e4ff' }}>{CHARACTERS[f1.char].name}</h4>
            <div className="val">{roundsWon[1]}</div><div className="lbl">ROUNDS</div>
            <div className="val">{st[1].maxCombo}</div><div className="lbl">MAX COMBO</div>
            <div className="val">{Math.round(st[1].damage)}</div><div className="lbl">DAMAGE</div>
          </div>
        </div>
        <div className="results-btns">
          <button className="nf-btn" onClick={() => { audio.play('ui'); onRematch(); }}>Rematch</button>
          <button className="nf-btn" onClick={() => { audio.play('ui'); onChars(); }}>Change Fighters</button>
          <button className="nf-btn" onClick={() => { audio.play('ui'); onMenu(); }}>Main Menu</button>
        </div>
      </div>
    </div>
  );
}
