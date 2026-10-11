import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useSettings } from '../config/settings';
import type { Quality } from '../config/settings';

/** Shared render budgets. Every preset retains the same gameplay/simulation. */
export const GRAPHICS_PRESETS: Record<Quality, {
  dpr: number; shadowMapSize: number; reflectionResolution: number;
  bloomIntensity: number; bloomResolutionScale: number; rainScale: number;
}> = {
  low: { dpr: 1, shadowMapSize: 512, reflectionResolution: 0, bloomIntensity: 0, bloomResolutionScale: 0.35, rainScale: 0.28 },
  medium: { dpr: 1.25, shadowMapSize: 1024, reflectionResolution: 384, bloomIntensity: 0.48, bloomResolutionScale: 0.5, rainScale: 0.6 },
  high: { dpr: 1.75, shadowMapSize: 2048, reflectionResolution: 768, bloomIntensity: 0.62, bloomResolutionScale: 0.65, rainScale: 1 },
};

/* ================================================================== */
/*  Procedural image-based lighting. Builds an HDR equirectangular neon-  */
/*  city environment from radiance, convolves it with PMREM and       */
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

/** Linear HDR radiance, including bright sign panels, feeds the PBR PMREM. */
function makeNeonEnvironment(pal: EnvPalette): THREE.DataTexture {
  const width = 512, height = 256;
  const data = new Float32Array(width * height * 4);
  const top = new THREE.Color(pal.top);
  const bottom = new THREE.Color(pal.bottom);
  const left = new THREE.Color(pal.glowL);
  const right = new THREE.Color(pal.glowR);
  const warm = new THREE.Color('#ffd6a0');
  const color = new THREE.Color();
  const addRadiance = (source: THREE.Color, intensity: number) => {
    color.r += source.r * intensity;
    color.g += source.g * intensity;
    color.b += source.b * intensity;
  };
  const periodicDistance = (x: number, center: number) => Math.min(Math.abs(x - center), 1 - Math.abs(x - center));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = x / width, v = y / height;
    // DataTexture rows are not flipped: higher v represents the upper hemisphere.
    color.copy(bottom).lerp(top, v).multiplyScalar(0.8);
    const horizon = Math.exp(-Math.pow((v - 0.52) / 0.1, 2));
    const pink = Math.exp(-Math.pow(periodicDistance(u, 0.22) / 0.13, 2)) * horizon;
    const cyan = Math.exp(-Math.pow(periodicDistance(u, 0.76) / 0.13, 2)) * horizon;
    addRadiance(left, pink * 0.4);
    addRadiance(right, cyan * 0.4);
    // Discrete light cards retain highlight shape at low material roughness.
    const card = v > 0.43 && v < 0.58;
    if (card && periodicDistance(u, 0.22) < 0.014) addRadiance(left, 3.5);
    if (card && periodicDistance(u, 0.76) < 0.019) addRadiance(right, 4);
    if (v > 0.71 && v < 0.76 && periodicDistance(u, 0.48) < 0.08) addRadiance(warm, 1.5);
    const window = (x % 21 < 3) && (y % 10 < 3) && v > 0.5 && v < 0.63;
    if (window && Math.sin(Math.floor(x / 21) * 13 + Math.floor(y / 10) * 9) > 0.2) addRadiance(warm, 0.6);
    data.set([color.r, color.g, color.b, 1], (y * width + x) * 4);
  }
  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function ProceduralEnvironment({ pal }: { pal: EnvPalette }): null {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const tex = makeNeonEnvironment(pal);
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
    apply(useSettings.getState().exposure);
    return useSettings.subscribe((s) => apply(s.exposure));
  }, [gl]);
  return null;
}
