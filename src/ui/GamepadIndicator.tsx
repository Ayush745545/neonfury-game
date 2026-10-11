import { useEffect, useState } from 'react';
import { inputManager } from '../game/inputManager';
import { useSettings } from '../config/settings';

/**
 * Gamepad connection indicator for the main menu and pause screen.
 * Shows which controllers are connected for P1/P2.
 */
export function GamepadIndicator() {
  const [gamepads, setGamepads] = useState<{ index: number; id: string }[]>([]);
  const gamepadEnabled = useSettings((s) => s.gamepadEnabled);

  useEffect(() => {
    if (!gamepadEnabled) return;

    const updateGamepads = () => {
      setGamepads(inputManager.getConnectedGamepads());
    };

    // Check on mount
    updateGamepads();

    // Listen for gamepad connection events
    const onConnect = () => updateGamepads();
    const onDisconnect = () => updateGamepads();
    
    window.addEventListener('gamepadconnected', onConnect);
    window.addEventListener('gamepaddisconnected', onDisconnect);

    // Also poll periodically (some browsers don't fire events reliably)
    const interval = setInterval(updateGamepads, 2000);

    return () => {
      window.removeEventListener('gamepadconnected', onConnect);
      window.removeEventListener('gamepaddisconnected', onDisconnect);
      clearInterval(interval);
    };
  }, [gamepadEnabled]);

  if (!gamepadEnabled || gamepads.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 12,
      right: 12,
      padding: '8px 12px',
      background: 'rgba(0, 0, 0, 0.75)',
      border: '1px solid rgba(125, 255, 178, 0.3)',
      borderRadius: 6,
      fontFamily: 'var(--nf-mono)',
      fontSize: 11,
      color: '#7dffb2',
      zIndex: 100,
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{ marginBottom: 4, opacity: 0.7, fontSize: 10 }}>CONTROLLERS</div>
      {gamepads.map((gp, i) => (
        <div key={gp.index} style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 8,
          marginTop: i > 0 ? 4 : 0,
        }}>
          <span style={{ 
            color: gp.index === 0 ? '#ff6b9d' : '#66d7ff',
            fontWeight: 600,
          }}>
            P{gp.index + 1}
          </span>
          <span style={{ opacity: 0.5 }}>●</span>
          <span style={{ 
            opacity: 0.8, 
            maxWidth: 180, 
            overflow: 'hidden', 
            textOverflow: 'ellipsis', 
            whiteSpace: 'nowrap' 
          }}>
            {gp.id}
          </span>
        </div>
      ))}
    </div>
  );
}
