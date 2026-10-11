import { useEffect, useRef, useState } from 'react';
import { useSettings, prettyKey, type Difficulty, type Quality } from '../config/settings';
import type { ActionId } from '../game/types';
import { audio } from '../audio/audioEngine';

const ACTIONS: { id: ActionId; label: string }[] = [
  { id: 'left', label: 'Move Left' }, { id: 'right', label: 'Move Right' },
  { id: 'up', label: 'Jump' }, { id: 'down', label: 'Crouch' },
  { id: 'lp', label: 'Light Punch' }, { id: 'hp', label: 'Heavy Punch' },
  { id: 'lk', label: 'Light Kick' }, { id: 'hk', label: 'Heavy Kick' },
  { id: 'block', label: 'Block' }, { id: 'special', label: 'Special' },
  { id: 'super', label: 'Super' },
];

export function SettingsPanel({ onClose }: { onClose?: () => void }) {
  const s = useSettings();
  const [listening, setListening] = useState<{ player: 'p1' | 'p2'; action: ActionId } | null>(null);
  const listenRef = useRef(listening);
  listenRef.current = listening;

  useEffect(() => {
    if (!listening) return;
    const onKey = (ev: KeyboardEvent) => {
      ev.preventDefault();
      const cur = listenRef.current;
      if (!cur) return;
      if (ev.code !== 'Escape') {
        useSettings.getState().bind(cur.player, cur.action, ev.code);
        audio.play('ui');
      }
      setListening(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [listening]);

  const seg = <T extends string>(val: T, opts: T[], set: (v: T) => void) => (
    <div className="seg-ctl">
      {opts.map((o) => (
        <button key={o} className={`seg-btn ${val === o ? 'on' : ''}`}
          onClick={() => { set(o); audio.play('ui'); }}>
          {o}
        </button>
      ))}
    </div>
  );

  const slider = (label: string, val: number, set: (v: number) => void) => (
    <>
      <div className="set-label">{label}</div>
      <div className="set-row">
        <input type="range" className="nf-range" min={0} max={1} step={0.05} value={val}
          onChange={(e) => set(parseFloat(e.target.value))} />
        <span className="small-note">{Math.round(val * 100)}%</span>
      </div>
    </>
  );

  return (
    <div className="nf-panel overlay-col" style={{ padding: '30px 40px', width: 'min(760px, 92vw)' }}>
      <div className="overlay-title" style={{ fontSize: 26, marginBottom: 14 }}>SETTINGS</div>
      <div className="settings-grid">
        <div className="set-label">CPU Difficulty</div>
        {seg<Difficulty>(s.difficulty, ['easy', 'normal', 'hard'], (v) => s.set({ difficulty: v }))}
        <div className="set-label">Graphics Quality</div>
        {seg<Quality>(s.quality, ['low', 'medium', 'high'], (v) => s.set({ quality: v }))}
        {slider('Master Volume', s.masterVolume, (v) => s.set({ masterVolume: v }))}
        {slider('SFX Volume', s.sfxVolume, (v) => s.set({ sfxVolume: v }))}
        {slider('Music Volume', s.musicVolume, (v) => s.set({ musicVolume: v }))}
        <div className="set-label">Screen Shake</div>
        <button className={`toggle-ctl ${s.screenShake ? 'on' : ''}`} onClick={() => s.set({ screenShake: !s.screenShake })}>
          {s.screenShake ? 'ON' : 'OFF'}
        </button>
        <div className="set-label">Show Hitboxes</div>
        <button className={`toggle-ctl ${s.showHitboxes ? 'on' : ''}`} onClick={() => s.set({ showHitboxes: !s.showHitboxes })}>
          {s.showHitboxes ? 'ON' : 'OFF'}
        </button>
        {slider('Screen Exposure', (s.exposure - 0.7) / 0.9, (v) => s.set({ exposure: +(0.7 + v * 0.9).toFixed(2) }))}
        {slider('UI Scale', (s.uiScale - 0.85) / 0.45, (v) => s.set({ uiScale: +(0.85 + v * 0.45).toFixed(2) }))}
        <div className="set-label">FPS Monitor</div>
        <button className={`toggle-ctl ${s.showFps ? 'on' : ''}`} onClick={() => s.set({ showFps: !s.showFps })}>
          {s.showFps ? 'ON' : 'OFF'}
        </button>
        <div className="set-label">Auto Quality</div>
        <button className={`toggle-ctl ${s.autoQuality ? 'on' : ''}`} onClick={() => s.set({ autoQuality: !s.autoQuality })}>
          {s.autoQuality ? 'ON' : 'OFF'}
        </button>
        <div className="set-label">Reduce Flashes</div>
        <button className={`toggle-ctl ${s.reduceFlashes ? 'on' : ''}`} onClick={() => s.set({ reduceFlashes: !s.reduceFlashes })}>
          {s.reduceFlashes ? 'ON' : 'OFF'}
        </button>
        <div className="set-label">Colorblind HUD</div>
        <button className={`toggle-ctl ${s.colorblindBars ? 'on' : ''}`} onClick={() => s.set({ colorblindBars: !s.colorblindBars })}>
          {s.colorblindBars ? 'ON' : 'OFF'}
        </button>
        <div className="set-label">Gamepad Support</div>
        <button className={`toggle-ctl ${s.gamepadEnabled ? 'on' : ''}`} onClick={() => s.set({ gamepadEnabled: !s.gamepadEnabled })}>
          {s.gamepadEnabled ? 'ON' : 'OFF'}
        </button>
        {slider('Vibration Intensity', s.vibrationIntensity, (v) => s.set({ vibrationIntensity: v }))}

        <div className="set-label" style={{ gridColumn: '1 / -1', marginTop: 8, color: '#ffb3c2' }}>— Rebind Controls (click a key, then press the new one) —</div>
        {(['p1', 'p2'] as const).map((player) => (
          <div key={player}>
            <div className="set-label" style={{ marginBottom: 6, color: player === 'p1' ? '#ffb3c2' : '#a8e4ff' }}>
              {player.toUpperCase()}
            </div>
            <div className="rebind-grid" style={{ gridTemplateColumns: '1fr' }}>
              {ACTIONS.map((a) => {
                const isListening = listening?.player === player && listening?.action === a.id;
                return (
                  <div className="rebind-row" key={a.id}>
                    <span className="act">{a.label}</span>
                    <button
                      className={`key-btn ${isListening ? 'listening' : ''}`}
                      onClick={() => { setListening(isListening ? null : { player, action: a.id }); audio.play('uiHover'); }}
                    >
                      {isListening ? 'PRESS…' : prettyKey(s.bindings[player][a.id])}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="set-row" style={{ justifyContent: 'center', gap: 14 }}>
        <button className="nf-btn" style={{ width: 200 }} onClick={() => { s.resetBindings(); audio.play('ui'); }}>
          Reset Binds
        </button>
        {onClose && (
          <button className="nf-btn" style={{ width: 200 }} onClick={() => { audio.play('ui'); onClose(); }}>
            Back
          </button>
        )}
      </div>
    </div>
  );
}
