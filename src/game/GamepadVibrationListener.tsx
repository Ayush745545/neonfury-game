import { useEffect } from 'react';
import { bus } from './eventBus';
import { VibrationPatterns } from './gamepadVibration';
import { useSettings } from '../config/settings';

/**
 * Listens to game events and triggers gamepad vibration.
 * Drop this component anywhere in the React tree to enable rumble feedback.
 */
export function GamepadVibrationListener() {
  const gamepadEnabled = useSettings((s) => s.gamepadEnabled);

  useEffect(() => {
    if (!gamepadEnabled) return;

    const handleEvent = (e: ReturnType<typeof bus.emit> extends (arg: infer E) => void ? E : never) => {
      if (e.type === 'vibrate') {
        const pattern = e.pattern;
        const player = e.player;
        
        // Use preset patterns or custom intensity/duration
        if (pattern in VibrationPatterns) {
          VibrationPatterns[pattern as keyof typeof VibrationPatterns](player);
        } else if (e.intensity !== undefined && e.duration !== undefined) {
          // Custom vibration
          const gamepads = navigator.getGamepads?.();
          if (!gamepads) return;
          
          const gamepad = gamepads[player];
          if (!gamepad || !gamepad.connected || !gamepad.vibrationActuator) return;
          
          gamepad.vibrationActuator.playEffect('dual-rumble', {
            startDelay: 0,
            duration: e.duration,
            weakMagnitude: e.intensity * 0.5,
            strongMagnitude: e.intensity,
          }).catch(() => {
            // Vibration failed, ignore
          });
        }
      }
    };

    return bus.on(handleEvent);
  }, [gamepadEnabled]);

  return null;
}
