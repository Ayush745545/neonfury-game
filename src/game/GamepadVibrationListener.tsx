import { useEffect } from 'react';
import { bus } from './eventBus';
import { vibrateGamepad } from './gamepadVibration';
import { useSettings } from '../config/settings';
import type { GameEvent } from './types';

/**
 * Listens to game events and triggers gamepad vibration.
 * Drop this component anywhere in the React tree to enable rumble feedback.
 */
export function GamepadVibrationListener() {
  const gamepadEnabled = useSettings((s) => s.gamepadEnabled);

  useEffect(() => {
    console.log('[GamepadVibrationListener] Mounted, gamepadEnabled:', gamepadEnabled);
    
    if (!gamepadEnabled) return;

    const handleEvent = (e: GameEvent) => {
      if (e.type !== 'vibrate') return;
      
      console.log('[Vibration Event]', e);
      
      // Map patterns to intensity/duration
      const patternMap: Record<string, { intensity: number; duration: number }> = {
        lightHit: { intensity: 0.3, duration: 80 },
        mediumHit: { intensity: 0.5, duration: 120 },
        heavyHit: { intensity: 0.8, duration: 180 },
        counterHit: { intensity: 0.9, duration: 150 },
        block: { intensity: 0.25, duration: 60 },
        launch: { intensity: 0.7, duration: 200 },
        knockdown: { intensity: 1.0, duration: 250 },
        special: { intensity: 0.6, duration: 300 },
        super: { intensity: 0.9, duration: 500 },
        roundStart: { intensity: 0.4, duration: 100 },
        victory: { intensity: 0.5, duration: 400 },
        damage: { intensity: 0.5, duration: 120 },
      };
      
      // Use custom intensity/duration if provided, otherwise use pattern
      const intensity = e.intensity ?? patternMap[e.pattern]?.intensity ?? 0.5;
      const duration = e.duration ?? patternMap[e.pattern]?.duration ?? 100;
      
      console.log(`[Vibration] Player ${e.player}: pattern="${e.pattern}", intensity=${intensity}, duration=${duration}ms`);
      
      // Trigger vibration
      vibrateGamepad(e.player, intensity, duration);
    };

    return bus.on(handleEvent);
  }, [gamepadEnabled]);

  return null;
}
