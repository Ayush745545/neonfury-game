/**
 * Gamepad vibration/rumble utility for haptic feedback.
 * Provides vibration on hits, blocks, and other combat events.
 */

/** Vibrate a specific gamepad with intensity and duration */
export function vibrateGamepad(
  playerIndex: 0 | 1,
  intensity: number,
  duration: number
): void {
  try {
    const gamepads = navigator.getGamepads?.();
    if (!gamepads) return;

    const gamepad = gamepads[playerIndex];
    if (!gamepad || !gamepad.connected) return;

    // Check if vibration is supported
    if (!gamepad.vibrationActuator) return;

    // Clamp values
    const clampedIntensity = Math.max(0, Math.min(1, intensity));
    const clampedDuration = Math.max(0, Math.min(5000, duration)); // Max 5 seconds

    // Play vibration effect
    gamepad.vibrationActuator.playEffect('dual-rumble', {
      startDelay: 0,
      duration: clampedDuration,
      weakMagnitude: clampedIntensity * 0.5, // Subtle rumble
      strongMagnitude: clampedIntensity,      // Main rumble
    }).catch(() => {
      // Vibration failed, silently ignore
    });
  } catch (err) {
    // Browser doesn't support vibration or error occurred
    // Fail silently - vibration is optional
  }
}

/** Preset vibration patterns for common game events */
export const VibrationPatterns = {
  /** Light hit - quick tap */
  lightHit: (playerIndex: 0 | 1) => {
    vibrateGamepad(playerIndex, 0.3, 80);
  },

  /** Medium hit - noticeable rumble */
  mediumHit: (playerIndex: 0 | 1) => {
    vibrateGamepad(playerIndex, 0.5, 120);
  },

  /** Heavy hit - strong impact */
  heavyHit: (playerIndex: 0 | 1) => {
    vibrateGamepad(playerIndex, 0.8, 180);
  },

  /** Counter hit - sharp burst */
  counterHit: (playerIndex: 0 | 1) => {
    vibrateGamepad(playerIndex, 0.9, 150);
  },

  /** Block - short defensive tap */
  block: (playerIndex: 0 | 1) => {
    vibrateGamepad(playerIndex, 0.25, 60);
  },

  /** Launch - rising intensity */
  launch: (playerIndex: 0 | 1) => {
    vibrateGamepad(playerIndex, 0.7, 200);
  },

  /** Knockdown - heavy slam */
  knockdown: (playerIndex: 0 | 1) => {
    vibrateGamepad(playerIndex, 1.0, 250);
  },

  /** Special move activation - pulsing */
  special: (playerIndex: 0 | 1) => {
    vibrateGamepad(playerIndex, 0.6, 300);
  },

  /** Super move activation - dramatic buildup */
  super: (playerIndex: 0 | 1) => {
    vibrateGamepad(playerIndex, 0.9, 500);
  },

  /** Round start - brief alert */
  roundStart: (playerIndex: 0 | 1) => {
    vibrateGamepad(playerIndex, 0.4, 100);
  },

  /** Victory - celebrating pulse */
  victory: (playerIndex: 0 | 1) => {
    vibrateGamepad(playerIndex, 0.5, 400);
  },
};

/** Get damage-based vibration intensity */
export function getVibrationForDamage(damage: number, blocked: boolean, counter: boolean): {
  intensity: number;
  duration: number;
} {
  if (blocked) {
    return { intensity: 0.25, duration: 60 };
  }

  let intensity = 0.3;
  let duration = 80;

  // Scale with damage
  if (damage < 40) {
    intensity = 0.3;
    duration = 80;
  } else if (damage < 60) {
    intensity = 0.5;
    duration = 120;
  } else if (damage < 100) {
    intensity = 0.7;
    duration = 160;
  } else {
    intensity = 0.9;
    duration = 200;
  }

  // Counter hits are more intense
  if (counter) {
    intensity = Math.min(1, intensity * 1.3);
    duration = Math.round(duration * 1.2);
  }

  return { intensity, duration };
}
