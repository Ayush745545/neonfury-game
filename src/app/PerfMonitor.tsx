import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useSettings } from '../config/settings';

/* ================================================================== */
/*  Performance monitoring: an in-Canvas sampler publishes FPS and    */
/*  renderer stats to a module singleton; the DOM overlay renders it  */
/*  and (optionally) auto-degrades the quality preset on sustained    */
/*  low frame rates.                                                  */
/* ================================================================== */

export interface PerfSample {
  fps: number;
  calls: number;
  tris: number;
  time: number;
}

export const perfStats: PerfSample = { fps: 60, calls: 0, tris: 0, time: 0 };

let frames = 0;
let windowStart = 0;

export function PerfHook(): null {
  const gl = useThree((s) => s.gl);
  useFrame((state) => {
    frames++;
    const t = state.clock.elapsedTime;
    if (windowStart === 0) windowStart = t;
    if (t - windowStart >= 0.5) {
      perfStats.fps = Math.round(frames / (t - windowStart));
      perfStats.calls = gl.info.render.calls;
      perfStats.tris = gl.info.render.triangles;
      perfStats.time = t;
      frames = 0;
      windowStart = t;
    }
  });
  return null;
}

export function PerfOverlay(): JSX.Element | null {
  const showFps = useSettings((s) => s.showFps);
  const autoQuality = useSettings((s) => s.autoQuality);
  const quality = useSettings((s) => s.quality);
  const [, tick] = useState(0);
  const lowSince = useRef<number>(0);
  const toast = useRef<string>('');
  const toastUntil = useRef<number>(0);

  useEffect(() => {
    const iv = window.setInterval(() => {
      tick((n) => n + 1);
      if (!autoQuality) { lowSince.current = 0; return; }
      const now = performance.now();
      if (perfStats.fps < 45 && perfStats.fps > 0) {
        if (lowSince.current === 0) lowSince.current = now;
        else if (now - lowSince.current > 4200 && quality !== 'low') {
          const next = quality === 'high' ? 'medium' : 'low';
          useSettings.getState().set({ quality: next });
          toast.current = `PERFORMANCE: SWITCHED TO ${next.toUpperCase()} QUALITY`;
          toastUntil.current = now + 4000;
          lowSince.current = 0;
        }
      } else {
        lowSince.current = 0;
      }
    }, 500);
    return () => window.clearInterval(iv);
  }, [autoQuality, quality]);

  if (!showFps && performance.now() > toastUntil.current) return null;
  return (
    <>
      {showFps && (
        <div className="perf-overlay">
          <div className="perf-fps">{perfStats.fps} FPS</div>
          <div>{perfStats.calls} draws · {(perfStats.tris / 1000).toFixed(0)}k tris · {quality.toUpperCase()}</div>
        </div>
      )}
      {performance.now() < toastUntil.current && (
        <div className="perf-toast">{toast.current}</div>
      )}
    </>
  );
}
