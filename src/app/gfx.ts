import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

/* ================================================================== */
/*  Procedural image-based lighting. Paints an equirectangular neon-  */
/*  city environment into a canvas, convolves it with PMREM and       */
/*  assigns it as scene.environment so every MeshStandardMaterial     */
/*  gets real specular reflections — zero external HDR assets.        */
/* ================================================================== */

export interface EnvPalette {
  top: string;
  bottom: string;
  glowL: string;
  glowR: string;
  intensity?: number;
}

function paintEquirect(pal: EnvPalette): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d')!;

  // sky → ground vertical gradient
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, pal.top);
  g.addColorStop(0.48, '#0b0e18');
  g.addColorStop(0.52, '#080a10');
  g.addColorStop(1, pal.bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 512);

  // horizon neon glows (left pink, right cyan by default)
  const glow = (x: number, color: string, r: number, alpha: number) => {
    const rg = ctx.createRadialGradient(x, 250, 8, x, 250, r);
    rg.addColorStop(0, color);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = rg;
    ctx.fillRect(x - r, 250 - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  };
  glow(220, pal.glowL, 300, 0.5);
  glow(760, pal.glowR, 320, 0.5);
  glow(512, '#ffc46a', 180, 0.16); // warm center bounce

  // faint star speckle in the upper band
  ctx.fillStyle = 'rgba(200,220,255,0.5)';
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 170;
    ctx.globalAlpha = 0.15 + Math.random() * 0.4;
    ctx.fillRect(x, y, 1.4, 1.4);
  }
  ctx.globalAlpha = 1;

  // skyline silhouette band with lit windows (reflection character)
  ctx.fillStyle = '#05060c';
  for (let x = 0; x < 1024; x += 26 + Math.random() * 34) {
    const w = 20 + Math.random() * 30;
    const h = 34 + Math.random() * 90;
    ctx.fillRect(x, 252 - h, w, h);
    ctx.fillStyle = 'rgba(255,214,150,0.5)';
    for (let wy = 252 - h + 6; wy < 246; wy += 9) {
      for (let wx = x + 4; wx < x + w - 4; wx += 7) {
        if (Math.random() < 0.3) ctx.fillRect(wx, wy, 2.4, 3.2);
      }
    }
    ctx.fillStyle = '#05060c';
  }
  return c;
}

export function ProceduralEnvironment({ pal }: { pal: EnvPalette }): null {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const canvas = paintEquirect(pal);
    const tex = new THREE.CanvasTexture(canvas);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(gl);
    pmrem.compileEquirectangularShader();
    const rt = pmrem.fromEquirectangular(tex);
    const prevEnv = scene.environment;
    const prevIntensity = scene.environmentIntensity;
    scene.environment = rt.texture;
    scene.environmentIntensity = pal.intensity ?? 0.55;
    tex.dispose();
    pmrem.dispose();
    return () => {
      scene.environment = prevEnv;
      scene.environmentIntensity = prevIntensity;
      rt.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, pal.top, pal.bottom, pal.glowL, pal.glowR, pal.intensity]);

  return null;
}

/** Applies the user exposure setting to the renderer every frame (cheap). */
export function ExposureController(): null {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const apply = (v: number) => { gl.toneMappingExposure = v; };
    // dynamic import avoided: settings store is safe to require here
    import('../config/settings').then(({ useSettings }) => {
      apply(useSettings.getState().exposure);
      const off = useSettings.subscribe((s) => apply(s.exposure));
      (gl as unknown as { __expOff?: () => void }).__expOff = off;
    });
    return () => { (gl as unknown as { __expOff?: () => void }).__expOff?.(); };
  }, [gl]);
  return null;
}
