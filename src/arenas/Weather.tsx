import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { bus } from '../game/eventBus';
import { useSettings } from '../config/settings';
import { makePuffTexture } from './textures';
import { useDispose } from './useDispose';
import type { WeatherKind } from './stages';
import type { JSX } from 'react';

/* ================================================================== */
/*  GPU-driven weather: rain / storm / snow / embers / petals.        */
/* ================================================================== */

const RAIN_VS = /* glsl */`
  attribute vec3 aStart;
  attribute vec2 aParams;
  uniform float uTime;
  uniform float uWind;
  varying float vFade;
  void main() {
    float h = 14.0;
    float y = mod(aStart.y - uTime * aParams.x, h);
    float x = aStart.x + uTime * uWind * 0.35 + sin(uTime * 0.3 + aStart.z) * 0.15;
    float len = aParams.y;
    vec3 p = position;
    vec3 world = vec3(x + p.x * uWind * 0.06, y + p.y * len, aStart.z + p.z);
    vFade = smoothstep(0.0, 2.2, y) * (1.0 - smoothstep(9.5, 14.0, y));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
  }`;

const RAIN_FS = /* glsl */`
  uniform float uOpacity;
  varying float vFade;
  void main() { gl_FragColor = vec4(0.62, 0.74, 0.92, uOpacity * vFade); }`;

const PARTICLE_VS = /* glsl */`
  attribute vec3 aStart;
  attribute vec2 aParams;  // x: speed, y: phase
  uniform float uTime;
  uniform float uMode;     // 0 snow (fall), 1 embers (rise), 2 petals (drift)
  uniform float uSize;
  varying float vFade;
  void main() {
    float t = uTime * aParams.x + aParams.y * 100.0;
    vec3 world;
    if (uMode < 0.5) {
      world.y = 12.0 - mod(t, 13.0);
      world.x = aStart.x + sin(t * 0.8 + aParams.y * 30.0) * 0.7;
      world.z = aStart.z + cos(t * 0.6 + aParams.y * 20.0) * 0.4;
    } else if (uMode < 1.5) {
      world.y = mod(t * 0.45, 9.0);
      world.x = aStart.x + sin(t * 0.9 + aParams.y * 30.0) * 0.9;
      world.z = aStart.z + cos(t * 0.7 + aParams.y * 20.0) * 0.5;
    } else {
      world.y = 7.0 - mod(t * 0.32, 7.5);
      world.x = aStart.x + sin(t * 0.5 + aParams.y * 40.0) * 2.2;
      world.z = aStart.z + cos(t * 0.4 + aParams.y * 25.0) * 0.8;
    }
    vFade = smoothstep(0.0, 1.2, world.y) * (1.0 - smoothstep(6.0, 9.0, world.y) * step(uMode, 0.5));
    vec4 mv = modelViewMatrix * vec4(world, 1.0);
    gl_PointSize = uSize * (60.0 / max(0.1, -mv.z));
    gl_Position = projectionMatrix * mv;
  }`;

const PARTICLE_FS = /* glsl */`
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vFade;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    float a = smoothstep(0.5, 0.15, d);
    gl_FragColor = vec4(uColor, a * uOpacity * vFade);
  }`;

const SPLASH_VS = /* glsl */`
  attribute vec3 aStart;
  attribute float aPhase;
  uniform float uTime;
  varying float vAlpha;
  void main() {
    float life = fract(uTime * 2.2 + aPhase);
    vAlpha = (1.0 - life) * step(0.72, fract(aPhase * 7.13)) * 0.55;
    vec3 world = vec3(aStart.x, 0.03 + life * 0.05, aStart.z);
    vec4 mv = modelViewMatrix * vec4(world, 1.0);
    gl_PointSize = (2.0 + life * 7.0) * (40.0 / max(0.1, -mv.z));
    gl_Position = projectionMatrix * mv;
  }`;

const SPLASH_FS = /* glsl */`
  varying float vAlpha;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    float ring = smoothstep(0.5, 0.38, d) * smoothstep(0.12, 0.3, d);
    gl_FragColor = vec4(0.68, 0.8, 1.0, ring * vAlpha);
  }`;

export function Weather({ kind }: { kind: WeatherKind }): JSX.Element | null {
  const quality = useSettings((s) => s.quality);
  const qf = quality === 'high' ? 1 : quality === 'medium' ? 0.6 : 0.3;
  const wet = kind === 'rain' || kind === 'storm';

  const drops = Math.round((kind === 'storm' ? 1700 : 1400) * qf);

  const rainGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(drops * 2 * 3);
    const starts = new Float32Array(drops * 2 * 3);
    const params = new Float32Array(drops * 2 * 2);
    for (let i = 0; i < drops; i++) {
      const x = (Math.random() - 0.5) * 30;
      const y = Math.random() * 14;
      const z = -13 + Math.random() * 20;
      const speed = 9 + Math.random() * 7;
      const len = 0.28 + Math.random() * 0.5;
      for (let v = 0; v < 2; v++) {
        const idx = i * 2 + v;
        pos[idx * 3 + 1] = v === 0 ? 0 : -1;
        starts[idx * 3] = x; starts[idx * 3 + 1] = y; starts[idx * 3 + 2] = z;
        params[idx * 2] = speed; params[idx * 2 + 1] = len;
      }
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aStart', new THREE.BufferAttribute(starts, 3));
    g.setAttribute('aParams', new THREE.BufferAttribute(params, 2));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 6, 0), 40);
    return g;
  }, [drops]);

  const rainMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: RAIN_VS, fragmentShader: RAIN_FS,
    uniforms: { uTime: { value: 0 }, uWind: { value: 1.1 }, uOpacity: { value: 0.3 } },
    transparent: true, depthWrite: false,
  }), []);

  const pCount = Math.round(700 * qf);
  const pGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(pCount * 3);
    const starts = new Float32Array(pCount * 3);
    const params = new Float32Array(pCount * 2);
    for (let i = 0; i < pCount; i++) {
      pos[i * 3 + 1] = 0;
      starts[i * 3] = (Math.random() - 0.5) * 28;
      starts[i * 3 + 1] = 0;
      starts[i * 3 + 2] = -12 + Math.random() * 18;
      params[i * 2] = 0.5 + Math.random() * 1.2;
      params[i * 2 + 1] = Math.random();
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aStart', new THREE.BufferAttribute(starts, 3));
    g.setAttribute('aParams', new THREE.BufferAttribute(params, 2));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 5, 0), 40);
    return g;
  }, [pCount]);

  const pConf = useMemo(() => {
    switch (kind) {
      case 'snow': return { mode: 0, color: new THREE.Color('#e8f2ff'), size: 3.2, opacity: 0.75, additive: false };
      case 'embers': return { mode: 1, color: new THREE.Color('#ff8a3d'), size: 2.6, opacity: 0.85, additive: true };
      case 'petals': return { mode: 2, color: new THREE.Color('#ffa8d0'), size: 4.2, opacity: 0.7, additive: false };
      default: return null;
    }
  }, [kind]);

  const pMat = useMemo(() => (pConf ? new THREE.ShaderMaterial({
    vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS,
    uniforms: {
      uTime: { value: 0 }, uMode: { value: pConf.mode }, uSize: { value: pConf.size },
      uColor: { value: pConf.color }, uOpacity: { value: pConf.opacity },
    },
    transparent: true, depthWrite: false,
    blending: pConf.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  }) : null), [pConf]);

  const splashGeo = useMemo(() => {
    if (!wet) return null;
    const n = Math.round(drops * 0.16);
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const starts = new Float32Array(n * 3);
    const phase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      starts[i * 3] = (Math.random() - 0.5) * 26;
      starts[i * 3 + 2] = -10 + Math.random() * 15;
      phase[i] = Math.random();
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aStart', new THREE.BufferAttribute(starts, 3));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 40);
    return g;
  }, [drops, wet]);

  const splashMat = useMemo(() => (wet ? new THREE.ShaderMaterial({
    vertexShader: SPLASH_VS, fragmentShader: SPLASH_FS,
    uniforms: { uTime: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }) : null), [wet]);

  useDispose(useMemo(() => [rainGeo, rainMat, pGeo, pMat, splashGeo, splashMat].filter(Boolean) as { dispose(): void }[],
    [rainGeo, rainMat, pGeo, pMat, splashGeo, splashMat]));

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (wet) {
      rainMat.uniforms.uTime.value = t;
      rainMat.uniforms.uWind.value = 0.9 + Math.sin(t * 0.11) * 0.6;
      if (splashMat) splashMat.uniforms.uTime.value = t;
    }
    if (pMat) pMat.uniforms.uTime.value = t;
  });

  if (kind === 'clear' || kind === 'mist') return null;

  return (
    <group>
      {wet && (
        <>
          <lineSegments geometry={rainGeo} material={rainMat} frustumCulled={false} renderOrder={5} />
          {splashGeo && splashMat && <points geometry={splashGeo} material={splashMat} frustumCulled={false} renderOrder={5} />}
        </>
      )}
      {pMat && <points geometry={pGeo} material={pMat} frustumCulled={false} renderOrder={5} />}
      {kind === 'storm' && <Lightning />}
    </group>
  );
}

/* ---------------- lightning ---------------- */

export function Lightning(): JSX.Element {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const next = useRef(4 + Math.random() * 8);
  const strike = useRef(0);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    if (t > next.current && strike.current <= 0) {
      strike.current = 0.34;
      next.current = t + 7 + Math.random() * 14;
      bus.emit({ type: 'sfx', name: 'thunder', gain: 0.55 });
      bus.emit({ type: 'flash', intensity: 0.22, color: '#cfe4ff' });
    }
    if (strike.current > 0) {
      strike.current -= dt;
      const flick = (Math.sin(t * 90) > 0.2 ? 1 : 0.25) * Math.max(0, strike.current / 0.34);
      if (lightRef.current) lightRef.current.intensity = 2.4 * flick;
    } else if (lightRef.current) {
      lightRef.current.intensity = 0;
    }
  });

  return <directionalLight ref={lightRef} position={[-6, 14, -6]} color="#bcd6ff" intensity={0} />;
}

/* ---------------- rising steam ---------------- */

export function Steam({ density = 1 }: { density?: number }): JSX.Element {
  const puff = useMemo(() => makePuffTexture('rgba(185,205,230,0.4)'), []);
  useDispose([puff]);
  const group = useRef<THREE.Group>(null);
  const columns = useMemo(() => {
    const arr: { x: number; z: number; s: number; p: number }[] = [];
    const xs = [-6.2, -4.4, 4.6, 6.4, -1.5, 2.2];
    const n = Math.max(2, Math.round(xs.length * density));
    for (let i = 0; i < n; i++) {
      arr.push({ x: xs[i % xs.length], z: -3.2 - (i % 3) * 1.2, s: 1 + (i % 3) * 0.5, p: i * 1.7 });
    }
    return arr;
  }, [density]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const g = group.current;
    if (!g) return;
    g.children.forEach((child, i) => {
      const col = columns[i];
      const cycle = ((t * 0.16 + col.p * 0.31) % 1);
      child.position.y = 0.2 + cycle * 2.6;
      child.position.x = col.x + Math.sin(t * 0.4 + col.p) * 0.35;
      const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      mat.opacity = Math.sin(cycle * Math.PI) * 0.24;
      child.scale.setScalar(col.s * (0.7 + cycle * 1.3));
    });
  });

  return (
    <group ref={group}>
      {columns.map((c, i) => (
        <mesh key={i} position={[c.x, 0.5, c.z]} renderOrder={3}>
          <planeGeometry args={[1.7, 2.3]} />
          <meshBasicMaterial map={puff} transparent depthWrite={false} opacity={0.2} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
    </group>
  );
}
