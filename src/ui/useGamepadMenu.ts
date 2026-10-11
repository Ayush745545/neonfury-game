import { useEffect, useState } from 'react';
import { useSettings } from '../config/settings';

/**
 * Hook for gamepad menu navigation.
 * Returns current gamepad button states for UI navigation.
 * 
 * Usage:
 * const gp = useGamepadMenu();
 * if (gp.confirm) handleSelect();
 * if (gp.back) handleBack();
 * if (gp.up) moveUp();
 */

export interface GamepadMenuState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  confirm: boolean;  // A button / Cross
  back: boolean;     // B button / Circle
  start: boolean;
  connected: boolean;
}

const EMPTY_STATE: GamepadMenuState = {
  up: false,
  down: false,
  left: false,
  right: false,
  confirm: false,
  back: false,
  start: false,
  connected: false,
};

export function useGamepadMenu(): GamepadMenuState {
  const gamepadEnabled = useSettings((s) => s.gamepadEnabled);
  const [state, setState] = useState<GamepadMenuState>(EMPTY_STATE);
  const [prevState, setPrevState] = useState<GamepadMenuState>(EMPTY_STATE);

  useEffect(() => {
    if (!gamepadEnabled) {
      setState(EMPTY_STATE);
      return;
    }

    let animFrameId = 0;

    const poll = () => {
      const gamepads = navigator.getGamepads?.();
      if (!gamepads) {
        setState(EMPTY_STATE);
        animFrameId = requestAnimationFrame(poll);
        return;
      }

      // Check any connected gamepad (prioritize index 0)
      const gp = gamepads[0] ?? gamepads[1] ?? gamepads[2] ?? gamepads[3];
      
      if (!gp || !gp.connected) {
        setState(EMPTY_STATE);
        animFrameId = requestAnimationFrame(poll);
        return;
      }

      const buttons = gp.buttons;
      const axes = gp.axes;
      const DEAD_ZONE = 0.5; // Higher dead zone for menus to prevent accidental input
      const axisX = axes[0] ?? 0;
      const axisY = axes[1] ?? 0;

      const newState: GamepadMenuState = {
        // D-pad and left stick
        up: (buttons[12]?.pressed ?? false) || axisY < -DEAD_ZONE,
        down: (buttons[13]?.pressed ?? false) || axisY > DEAD_ZONE,
        left: (buttons[14]?.pressed ?? false) || axisX < -DEAD_ZONE,
        right: (buttons[15]?.pressed ?? false) || axisX > DEAD_ZONE,
        
        // Face buttons
        confirm: buttons[0]?.pressed ?? false, // A / Cross
        back: buttons[1]?.pressed ?? false,    // B / Circle
        
        // Start button
        start: buttons[9]?.pressed ?? false,
        
        connected: true,
      };

      // Only update if state changed (edge detection for menu navigation)
      const changed = (
        newState.up !== prevState.up ||
        newState.down !== prevState.down ||
        newState.left !== prevState.left ||
        newState.right !== prevState.right ||
        newState.confirm !== prevState.confirm ||
        newState.back !== prevState.back ||
        newState.start !== prevState.start
      );

      if (changed) {
        setState(newState);
        setPrevState(newState);
      }

      animFrameId = requestAnimationFrame(poll);
    };

    animFrameId = requestAnimationFrame(poll);

    return () => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
    };
  }, [gamepadEnabled, prevState]);

  return state;
}

/**
 * Hook that returns edge-detected gamepad inputs (fires once per press).
 * Better for menu navigation where you want discrete button presses.
 */
export function useGamepadMenuEdge(onUp?: () => void, onDown?: () => void, onConfirm?: () => void, onBack?: () => void) {
  const gamepadEnabled = useSettings((s) => s.gamepadEnabled);
  const [prev, setPrev] = useState<GamepadMenuState>(EMPTY_STATE);

  useEffect(() => {
    if (!gamepadEnabled) return;

    let animFrameId = 0;
    let lastFireTime = { up: 0, down: 0, left: 0, right: 0, confirm: 0, back: 0 };
    const REPEAT_DELAY = 200; // ms between repeats when holding

    const poll = () => {
      const gamepads = navigator.getGamepads?.();
      const gp = gamepads?.[0] ?? gamepads?.[1] ?? gamepads?.[2] ?? gamepads?.[3];
      
      if (!gp || !gp.connected) {
        animFrameId = requestAnimationFrame(poll);
        return;
      }

      const buttons = gp.buttons;
      const axes = gp.axes;
      const DEAD_ZONE = 0.5;
      const axisX = axes[0] ?? 0;
      const axisY = axes[1] ?? 0;
      const now = Date.now();

      const cur: GamepadMenuState = {
        up: (buttons[12]?.pressed ?? false) || axisY < -DEAD_ZONE,
        down: (buttons[13]?.pressed ?? false) || axisY > DEAD_ZONE,
        left: (buttons[14]?.pressed ?? false) || axisX < -DEAD_ZONE,
        right: (buttons[15]?.pressed ?? false) || axisX > DEAD_ZONE,
        confirm: buttons[0]?.pressed ?? false,
        back: buttons[1]?.pressed ?? false,
        start: buttons[9]?.pressed ?? false,
        connected: true,
      };

      // Fire on rising edge or after repeat delay
      if (cur.up && (!prev.up || now - lastFireTime.up > REPEAT_DELAY)) {
        onUp?.();
        lastFireTime.up = now;
      }
      if (cur.down && (!prev.down || now - lastFireTime.down > REPEAT_DELAY)) {
        onDown?.();
        lastFireTime.down = now;
      }
      if (cur.confirm && !prev.confirm) {
        onConfirm?.();
        lastFireTime.confirm = now;
      }
      if (cur.back && !prev.back) {
        onBack?.();
        lastFireTime.back = now;
      }

      setPrev(cur);
      animFrameId = requestAnimationFrame(poll);
    };

    animFrameId = requestAnimationFrame(poll);

    return () => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
    };
  }, [gamepadEnabled, prev, onUp, onDown, onConfirm, onBack]);
}
