import { useState } from 'react';
import { SettingsPanel } from './SettingsPanel';
import { ControlsGuide } from './ControlsGuide';
import { audio } from '../audio/audioEngine';

export function PauseMenu(props: {
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
}) {
  const [tab, setTab] = useState<'main' | 'settings' | 'controls'>('main');
  const click = (fn: () => void) => () => { audio.play('ui'); fn(); };

  return (
    <div className="overlay-root">
      {tab === 'main' && (
        <div className="overlay-col">
          <div className="overlay-title">PAUSED</div>
          <button className="nf-btn" onClick={click(props.onResume)}>Resume</button>
          <button className="nf-btn" onClick={click(props.onRestart)}>Restart Match</button>
          <button className="nf-btn" onClick={click(() => setTab('settings'))}>Settings</button>
          <button className="nf-btn" onClick={click(() => setTab('controls'))}>Controls</button>
          <button className="nf-btn" onClick={click(props.onQuit)}>Quit to Menu</button>
        </div>
      )}
      {tab === 'settings' && <SettingsPanel onClose={() => setTab('main')} />}
      {tab === 'controls' && <ControlsGuide onClose={() => setTab('main')} />}
    </div>
  );
}
