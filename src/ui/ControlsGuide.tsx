import { useSettings, prettyKey } from '../config/settings';
import type { ActionId } from '../game/types';
import { audio } from '../audio/audioEngine';

const ROWS: { id: ActionId; label: string }[] = [
  { id: 'left', label: 'Move Left' },
  { id: 'right', label: 'Move Right' },
  { id: 'up', label: 'Jump' },
  { id: 'down', label: 'Crouch' },
  { id: 'lp', label: 'Light Punch' },
  { id: 'hp', label: 'Heavy Punch' },
  { id: 'lk', label: 'Light Kick' },
  { id: 'hk', label: 'Heavy Kick' },
  { id: 'block', label: 'Block (hold)' },
  { id: 'special', label: 'Special (25 meter)' },
  { id: 'super', label: 'Super (full meter)' },
  { id: 'ability', label: 'Unique Ability (15s cooldown)' },
];

export function ControlsGuide({ onClose }: { onClose?: () => void }) {
  const bindings = useSettings((s) => s.bindings);
  return (
    <div className="nf-panel controls-panel">
      <div className="overlay-title" style={{ fontSize: 24, marginBottom: 18 }}>CONTROLS</div>
      <div className="controls-cols">
        <div className="controls-col p1">
          <h3>PLAYER 1</h3>
          {ROWS.map((r) => (
            <div className="ctl-row" key={r.id}>
              <span>{r.label}</span>
              <span className="k">{prettyKey(bindings.p1[r.id])}</span>
            </div>
          ))}
        </div>
        <div className="controls-col p2">
          <h3>PLAYER 2</h3>
          {ROWS.map((r) => (
            <div className="ctl-row" key={r.id}>
              <span>{r.label}</span>
              <span className="k">{prettyKey(bindings.p2[r.id])}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="controls-note">
        DOUBLE-TAP ← / → : DASH &nbsp;·&nbsp; HOLD ↓ + BLOCK : LOW GUARD &nbsp;·&nbsp; LOW ATTACKS BEAT STANDING BLOCK &nbsp;·&nbsp; OVERHEADS BEAT CROUCH BLOCK<br />
        CHAIN LIGHTS INTO HEAVIES ON HIT, CANCEL HEAVIES INTO SPECIALS · EVERY FIGHTER HAS A UNIQUE ABILITY ON A 15s COOLDOWN<br />
        ESC : PAUSE · KEYBOARD REBINDABLE IN SETTINGS (P2 needs NumLock on)
      </div>
      {onClose && (
        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <button className="nf-btn" style={{ width: 200, margin: '0 auto' }} onClick={() => { audio.play('ui'); onClose(); }}>Back</button>
        </div>
      )}
    </div>
  );
}
