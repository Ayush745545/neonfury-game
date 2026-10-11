import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import { CityStage } from '../arenas/CityStage';
import { STAGES } from '../arenas/stages';
import { FighterView } from '../fighters/FighterView';
import { previewRuntime } from '../fighters/previewRuntime';
import { useMatchStore } from '../game/matchStore';
import type { CharId } from '../game/types';
import { audio } from '../audio/audioEngine';
import { SettingsPanel } from './SettingsPanel';
import { ControlsGuide } from './ControlsGuide';
import { GamepadIndicator } from './GamepadIndicator';

/* Cinematic main-menu background: the two fighters face off in the
   rain while the camera drifts on a slow arc. */

function MenuFighter({ char, x, facing }: { char: CharId; x: number; facing: 1 | -1 }) {
  const runtime = useMemo(() => {
    const f = previewRuntime(char);
    f.x = x; f.facing = facing;
    return f;
  }, [char, x, facing]);
  useFrame((_, dt) => { runtime.anim.frame += Math.min(dt, 0.05) * 60; });
  return <FighterView runtime={runtime} />;
}

function MenuCamera(): null {
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const ang = -0.22 + Math.sin(t * 0.06) * 0.34;
    const rad = 4.3 + Math.sin(t * 0.043) * 0.5;
    state.camera.position.set(Math.sin(ang) * rad, 1.45 + Math.sin(t * 0.09) * 0.22, Math.cos(ang) * rad);
    state.camera.lookAt(0, 1.08, 0);
  });
  return null;
}

/* ---------------- logo ---------------- */

function Logo() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const letters = ref.current.querySelectorAll<HTMLElement>('.ltr');
    gsap.fromTo(letters,
      { opacity: 0, y: 60, scale: 1.6, filter: 'blur(12px)' },
      { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', duration: 0.7, stagger: 0.055, ease: 'power4.out' });
    gsap.fromTo(ref.current.querySelector('.logo-bolt'),
      { opacity: 0, scale: 3, rotate: -25 },
      { opacity: 1, scale: 1, rotate: 0, duration: 0.6, delay: 0.55, ease: 'power3.out' });
  }, []);

  const word = (w: string, cls: string) => (
    <span className={cls}>
      {w.split('').map((c, i) => <span key={i} className="ltr" style={{ display: 'inline-block' }}>{c}</span>)}
    </span>
  );

  return (
    <div ref={ref} className="logo-wrap">
      <div className="logo-flicker" style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{
          fontFamily: 'var(--nf-display)', fontStyle: 'italic', fontWeight: 900,
          fontSize: 'clamp(52px, 8.4vw, 104px)', lineHeight: 0.94, letterSpacing: 2,
          transform: 'skewX(-8deg)',
        }}>
          {word('NEON', 'logo-neon')}
          <br />
          {word('FURY', 'logo-fury')}
        </div>
        <svg className="logo-bolt" width="64" height="120" viewBox="0 0 64 120" style={{ marginLeft: -6 }}>
          <defs>
            <linearGradient id="bolt-g" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff6d8" />
              <stop offset="0.5" stopColor="#ffd24d" />
              <stop offset="1" stopColor="#ff2d55" />
            </linearGradient>
          </defs>
          <path d="M40 2 L10 62 L28 62 L18 118 L54 48 L34 48 L50 2 Z" fill="url(#bolt-g)"
            style={{ filter: 'drop-shadow(0 0 14px rgba(255,150,60,0.95))' }} />
        </svg>
      </div>
      <div className="logo-tag">MIDNIGHT ARENA · NEON TOKYO</div>
      <style>{`
        .logo-neon .ltr { color: #eaf7ff; text-shadow: 0 0 12px rgba(57,198,255,1), 0 0 44px rgba(57,198,255,0.8), 0 0 90px rgba(57,198,255,0.45); }
        .logo-fury .ltr {
          background: linear-gradient(180deg, #ffe98a 8%, #ff5c3c 55%, #c2132f 95%);
          -webkit-background-clip: text; background-clip: text; color: transparent;
          filter: drop-shadow(0 0 16px rgba(255,60,60,0.85));
        }
      `}</style>
    </div>
  );
}

/* ---------------- menu ---------------- */

type MenuTab = 'main' | 'settings' | 'controls';

export function MainMenu() {
  const gotoSelect = useMatchStore((s) => s.gotoSelect);
  const setScreen = useMatchStore((s) => s.setScreen);
  const [tab, setTab] = useState<MenuTab>('main');
  const [sel, setSel] = useState(0);
  const itemsRef = useRef<HTMLButtonElement[]>([]);
  const menuStage = STAGES[0];
  const menuChars: [CharId, CharId] = ['ryden', 'volt'];

  const items: { label: string; sub: string; act: () => void }[] = [
    { label: 'Ryden vs Volt', sub: 'PLAY NOW · Neon Tokyo · fire vs lightning', act: () => useMatchStore.setState({
      screen: 'game', mode: 'vs-cpu', p1Char: 'ryden', p2Char: 'volt', stageId: 'neon-tokyo',
      showResults: false, paused: false, netRole: null,
    }) },
    { label: 'Start Game', sub: 'Cinematic arcade match vs CPU — best of three', act: () => gotoSelect('arcade') },
    { label: 'VS CPU', sub: 'Quick match against the CPU', act: () => gotoSelect('vs-cpu') },
    { label: 'Local Multiplayer', sub: 'Two players, one keyboard', act: () => gotoSelect('local') },
    { label: 'Network Multiplayer', sub: 'Play a friend on the same WiFi — host or join', act: () => { setScreen('net'); } },
    { label: 'Training', sub: 'Practice combos, hitbox display, dummy options', act: () => gotoSelect('training') },
    { label: 'Settings', sub: 'Difficulty, graphics, audio, rebind controls', act: () => setTab('settings') },
  ];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tab !== 'main') return;
      if (e.code === 'ArrowDown' || e.code === 'KeyS') { setSel((s) => (s + 1) % items.length); audio.play('uiHover'); e.preventDefault(); }
      if (e.code === 'ArrowUp' || e.code === 'KeyW') { setSel((s) => (s - 1 + items.length) % items.length); audio.play('uiHover'); e.preventDefault(); }
      if (e.code === 'Enter' || e.code === 'Space') { audio.play('ui'); items[sel].act(); e.preventDefault(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, sel]);

  useEffect(() => {
    // menu atmosphere: rain + music
    const t = window.setTimeout(() => { audio.play('rainOn'); audio.startMusic(); }, 400);
    return () => window.clearTimeout(t);
  }, []);

  const hover = (i: number) => { if (i !== sel) { setSel(i); audio.play('uiHover'); } };

  return (
    <div className="menu-root">
      <Canvas
        shadows
        dpr={[1, 1.5]}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        camera={{ fov: 42, near: 0.1, far: 120, position: [0, 1.5, 4.4] }}
        onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.0; }}
      >
        <CityStage def={menuStage} />
        <MenuFighter char={menuChars[0]} x={-1.25} facing={1} />
        <MenuFighter char={menuChars[1]} x={1.25} facing={-1} />
        <MenuCamera />
      </Canvas>
      <div className="scanlines" />

      <div className="menu-overlay">
        {tab === 'main' && (
          <>
            <Logo />
            <div className="menu-items">
              {items.map((it, i) => (
                <button
                  key={it.label}
                  ref={(el) => { if (el) itemsRef.current[i] = el; }}
                  className={`nf-btn ${sel === i ? 'active' : ''}`}
                  onMouseEnter={() => hover(i)}
                  onClick={() => { audio.play('ui'); it.act(); }}
                >
                  {it.label}
                  <span className="sub">{it.sub}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {tab === 'settings' && (
          <div style={{ marginTop: '2vh' }}>
            <SettingsPanel onClose={() => setTab('main')} />
          </div>
        )}
        {tab === 'controls' && (
          <div style={{ marginTop: '2vh' }}>
            <ControlsGuide onClose={() => setTab('main')} />
          </div>
        )}
      </div>

      <div className="menu-foot">
        <div className="keys">
          <span><b>W/S</b> navigate</span>
          <span><b>ENTER</b> select</span>
          <span><b>C</b> controls</span>
        </div>
        <div>NEON FURY v1.0 — ORIGINAL FIGHTING GAME PROTOTYPE</div>
      </div>
      <KeyCatch onControls={() => setTab(tab === 'controls' ? 'main' : 'controls')} />
      <GamepadIndicator />
    </div>
  );
}

function KeyCatch({ onControls }: { onControls: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.code === 'KeyC') onControls(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onControls]);
  return null;
}
