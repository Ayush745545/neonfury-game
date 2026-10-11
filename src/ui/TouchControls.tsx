import { useEffect, useState } from 'react';
import { inputManager } from '../game/inputManager';
import type { ActionId } from '../game/types';

/* Optional mobile/touch controls feeding the same virtual input slots
   the keyboard manager exposes. Shown only on touch devices. */

export function TouchControls() {
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  const hold = (action: ActionId, down: boolean) => (e: React.PointerEvent) => {
    e.preventDefault();
    inputManager.virtual.p1[action] = down;
  };

  const tap = (action: ActionId) => (e: React.PointerEvent) => {
    e.preventDefault();
    // momentary press: on this frame, cleared next tick by edge logic
    inputManager.virtual.p1[action] = true;
    window.setTimeout(() => { inputManager.virtual.p1[action] = false; }, 40);
  };

  if (!isTouch) return null;

  return (
    <div className="touch-controls on">
      <div className="touch-pad">
        <span />
        <div className="tbtn" onPointerDown={hold('up', true)} onPointerUp={hold('up', false)} onPointerLeave={hold('up', false)}>▲</div>
        <span />
        <div className="tbtn" onPointerDown={hold('left', true)} onPointerUp={hold('left', false)} onPointerLeave={hold('left', false)}>◀</div>
        <div className="tbtn" onPointerDown={hold('down', true)} onPointerUp={hold('down', false)} onPointerLeave={hold('down', false)}>▼</div>
        <div className="tbtn" onPointerDown={hold('right', true)} onPointerUp={hold('right', false)} onPointerLeave={hold('right', false)}>▶</div>
      </div>
      <div className="touch-btns">
        <div className="tbtn" onPointerDown={tap('lp')}>LP</div>
        <div className="tbtn" onPointerDown={tap('hp')}>HP</div>
        <div className="tbtn" onPointerDown={hold('block', true)} onPointerUp={hold('block', false)} onPointerLeave={hold('block', false)}>BLK</div>
        <div className="tbtn" onPointerDown={tap('lk')}>LK</div>
        <div className="tbtn" onPointerDown={tap('hk')}>HK</div>
        <div className="tbtn" onPointerDown={tap('special')}>SP</div>
        <div className="tbtn" onPointerDown={tap('ability')} style={{ borderColor: 'rgba(125,255,178,0.7)', color: '#7dffb2' }}>AB</div>
        <span />
        <div className="tbtn" onPointerDown={tap('super')} style={{ borderColor: 'rgba(255,210,77,0.7)', color: '#ffd24d' }}>SUPER</div>
      </div>
    </div>
  );
}
