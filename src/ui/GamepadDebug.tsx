import { useEffect, useState } from 'react';

/**
 * Real-time gamepad debug overlay showing all button/axis states.
 * Press 'G' key to toggle visibility during gameplay.
 */
export function GamepadDebug() {
  const [visible, setVisible] = useState(false);
  const [gamepads, setGamepads] = useState<(Gamepad | null)[]>([]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyG' && !e.repeat) {
        setVisible((v) => !v);
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    if (!visible) return;

    const interval = setInterval(() => {
      const gps = navigator.getGamepads?.();
      if (gps) {
        setGamepads(Array.from(gps));
      }
    }, 50); // 20Hz update

    return () => clearInterval(interval);
  }, [visible]);

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed',
      top: '10px',
      right: '10px',
      background: 'rgba(0, 0, 0, 0.85)',
      color: '#0f0',
      fontFamily: 'monospace',
      fontSize: '11px',
      padding: '12px',
      borderRadius: '4px',
      maxWidth: '400px',
      maxHeight: '90vh',
      overflow: 'auto',
      zIndex: 10000,
      border: '1px solid #0f0',
    }}>
      <div style={{ marginBottom: '8px', fontSize: '13px', fontWeight: 'bold' }}>
        🎮 GAMEPAD DEBUG (Press G to close)
      </div>

      {gamepads.filter(Boolean).length === 0 && (
        <div style={{ color: '#f44' }}>
          ❌ No gamepads connected<br />
          Press any button on your controller
        </div>
      )}

      {gamepads.map((gp, idx) => {
        if (!gp) return null;

        const buttonNames = [
          'A/Cross', 'B/Circle', 'X/Square', 'Y/Triangle',
          'LB/L1', 'RB/R1', 'LT/L2', 'RT/R2',
          'Select', 'Start', 'L-Stick', 'R-Stick',
          'D-Up', 'D-Down', 'D-Left', 'D-Right',
          'Home',
        ];

        return (
          <div key={idx} style={{ marginBottom: '16px' }}>
            <div style={{ color: '#0ff', marginBottom: '4px' }}>
              <strong>P{idx + 1}:</strong> {gp.id}
            </div>
            <div style={{ color: gp.connected ? '#0f0' : '#f44' }}>
              {gp.connected ? '✓ Connected' : '✗ Disconnected'}
            </div>
            <div style={{ color: gp.vibrationActuator ? '#0f0' : '#fa0' }}>
              {gp.vibrationActuator ? '✓ Vibration supported' : '⚠ No vibration'}
            </div>

            <div style={{ marginTop: '8px' }}>
              <strong>Buttons:</strong>
            </div>
            {gp.buttons.map((btn, i) => (
              <div
                key={i}
                style={{
                  color: btn.pressed ? '#ff0' : '#666',
                  fontWeight: btn.pressed ? 'bold' : 'normal',
                }}
              >
                [{i}] {buttonNames[i] || `Button ${i}`}: {btn.pressed ? 'PRESSED' : 'released'} ({btn.value.toFixed(2)})
              </div>
            ))}

            <div style={{ marginTop: '8px' }}>
              <strong>Axes:</strong>
            </div>
            {gp.axes.map((axis, i) => {
              const axisNames = ['L-Stick X', 'L-Stick Y', 'R-Stick X', 'R-Stick Y'];
              const isActive = Math.abs(axis) > 0.25;
              return (
                <div
                  key={i}
                  style={{
                    color: isActive ? '#ff0' : '#666',
                    fontWeight: isActive ? 'bold' : 'normal',
                  }}
                >
                  [{i}] {axisNames[i] || `Axis ${i}`}: {axis.toFixed(3)}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
