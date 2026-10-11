import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { MeshReflectorMaterial } from '@react-three/drei';
import { makeAsphaltTexture, makeBannerTexture, makeHoloTexture, makeSignTexture, makeWindowsTexture } from './textures';
import { Weather, Steam } from './Weather';
import { StageProps } from './Props';
import { useSettings } from '../config/settings';
import { useDispose } from './useDispose';
import { STAGE_LIMIT } from '../config/constants';
import type { StageDef } from './stages';
import type { JSX } from 'react';

/* ================================================================== */
/*  CityStage — one data-driven renderer for all 15 locations.        */
/* ================================================================== */

function SceneAtmosphere({ def }: { def: StageDef }): null {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const fog = new THREE.FogExp2(def.fogColor, def.fogDensity);
    const bg = new THREE.Color(def.sky);
    const prevFog = scene.fog;
    const prevBg = scene.background;
    scene.fog = fog;
    scene.background = bg;
    return () => { scene.fog = prevFog; scene.background = prevBg; };
  }, [scene, def]);
  return null;
}

function NeonSigns({ def }: { def: StageDef }): JSX.Element {
  const textures = useMemo(
    () => def.signs.map((s) => makeSignTexture(s.text, s.color, s.vertical)),
    [def],
  );
  useDispose(textures);
  const flickRefs = useRef<(THREE.Mesh | null)[]>([]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    def.signs.forEach((s, i) => {
      if (!s.flicker) return;
      const m = flickRefs.current[i];
      if (!m) return;
      const mat = m.material as THREE.MeshBasicMaterial;
      const n = Math.sin(t * 17 + i * 9) * Math.sin(t * 3.1 + i);
      mat.opacity = n > 0.55 ? 0.25 : 1;
    });
  });

  return (
    <group>
      {def.signs.map((s, i) => {
        const w = (s.vertical ? 0.85 : 2.5) * (s.scale ?? 1);
        const h = (s.vertical ? 2.6 : 0.95) * (s.scale ?? 1);
        return (
          <mesh
            key={`${def.id}-${i}`}
            ref={(el) => { flickRefs.current[i] = el; }}
            position={s.pos}
            rotation={[0, s.rotY ?? 0, 0]}
          >
            <planeGeometry args={[w, h]} />
            <meshBasicMaterial map={textures[i]} transparent toneMapped={false} side={THREE.DoubleSide} />
          </mesh>
        );
      })}
    </group>
  );
}

const HOLO_VS = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const HOLO_FS = /* glsl */`
  uniform sampler2D uTex;
  uniform float uTime;
  uniform float uHue;
  varying vec2 vUv;
  void main() {
    vec2 uv = vUv;
    float shift = 0.004 + 0.003 * sin(uTime * 1.3);
    float r = texture2D(uTex, uv + vec2(shift, 0.0)).r;
    float g = texture2D(uTex, uv).g;
    float b = texture2D(uTex, uv - vec2(shift, 0.0)).b;
    float scan = 0.82 + 0.18 * sin(uv.y * 220.0 + uTime * 6.0);
    float band = smoothstep(0.0, 0.12, abs(fract(uv.y - uTime * 0.07) - 0.5));
    float flick = 0.9 + 0.1 * sin(uTime * 23.0 + uHue * 40.0);
    vec3 col = vec3(r, g, b) * scan * band * flick;
    gl_FragColor = vec4(col * 1.35, 0.86 * (0.55 + 0.45 * band));
  }`;

function HoloBillboards({ def }: { def: StageDef }): JSX.Element | null {
  const holoDefs = def.holos.slice(0, 2);
  const texes = useMemo(() => holoDefs.map((h) => makeHoloTexture(h.main, h.sub)), [holoDefs]);
  useDispose(texes);
  const uniforms = useMemo(
    () => texes.map((t, i) => ({ uTex: { value: t }, uTime: { value: 0 }, uHue: { value: i * 0.5 } })),
    [texes],
  );
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    uniforms.forEach((u, i) => { u.uTime.value = t * (1 + i * 0.13); });
  });
  if (!holoDefs.length) return null;
  const spots: [number, number, number][] = [[-4.6, 5.4, -11.2], [5.4, 6.2, -12.4]];
  const rots: [number, number, number][] = [[0, 0.22, 0], [0, -0.25, 0]];
  return (
    <group>
      {holoDefs.map((_, i) => (
        <mesh key={i} position={spots[i]} rotation={rots[i]}>
          <planeGeometry args={i === 0 ? [5.2, 2.9] : [4.6, 2.6]} />
          <shaderMaterial vertexShader={HOLO_VS} fragmentShader={HOLO_FS} uniforms={uniforms[i]} transparent depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

const CLOTH_VS = /* glsl */`
  uniform float uTime;
  uniform float uAmp;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    float wave = sin(p.y * 4.0 + uTime * 2.4) * uAmp * (0.4 - p.y * 0.22);
    float wave2 = sin(p.y * 9.0 + uTime * 3.7 + 1.7) * uAmp * 0.4 * (0.3 - p.y * 0.18);
    p.z += wave + wave2;
    p.x += wave * 0.35;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;

const CLOTH_FS = /* glsl */`
  uniform sampler2D uTex;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(uTex, vUv);
    gl_FragColor = vec4(c.rgb * (0.75 + 0.25 * vUv.y), c.a);
  }`;

function WindBanners({ def }: { def: StageDef }): JSX.Element {
  const texes = useMemo(() => def.banners.map((b) => makeBannerTexture(b.text, b.bg, b.fg)), [def]);
  useDispose(texes);
  const uniforms = useMemo(() => texes.map((t, i) => ({ uTex: { value: t }, uTime: { value: i * 2 }, uAmp: { value: 0.55 } })), [texes]);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    uniforms.forEach((u, i) => { u.uTime.value = t + i * 2.3; });
  });
  const positions: [number, number, number][] = [[-9.4, 3.4, -5.4], [9.6, 3.6, -5.8], [-2.2, 4.1, -11.6]];
  return (
    <group>
      {texes.map((_, i) => (
        <mesh key={i} position={positions[i]} rotation={[0, i === 2 ? 0 : (i === 0 ? 0.6 : -0.6), 0]}>
          <planeGeometry args={[0.9, 2.7, 6, 16]} />
          <shaderMaterial vertexShader={CLOTH_VS} fragmentShader={CLOTH_FS} uniforms={uniforms[i]} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

function Buildings({ def }: { def: StageDef }): JSX.Element {
  const win = useMemo(() => def.windowTints.map((t, i) => makeWindowsTexture(t, 0.34 - i * 0.04)), [def]);
  useDispose(win);
  const dark = useMemo(() => new THREE.MeshStandardMaterial({ color: def.buildingTint, roughness: 0.85, metalness: 0.15 }), [def]);
  useDispose([dark]);

  const specs: { p: [number, number, number]; s: [number, number, number]; t: number; ry?: number }[] = [
    { p: [-9.5, 5.5, -9.5], s: [6, 11, 5], t: 0, ry: 0.12 },
    { p: [-4.6, 7.5, -11.5], s: [5.5, 15, 5], t: 1, ry: -0.06 },
    { p: [0.8, 6.2, -13.0], s: [6.5, 12.4, 5], t: 2 },
    { p: [6.2, 8.0, -11.8], s: [5.8, 16, 5], t: 0, ry: 0.1 },
    { p: [10.8, 5.2, -9.2], s: [5.4, 10.4, 5], t: 1, ry: -0.14 },
    { p: [-13.0, 4.4, -5.5], s: [4.6, 8.8, 6], t: 2, ry: 0.4 },
    { p: [13.4, 4.8, -5.8], s: [4.6, 9.6, 6], t: 0, ry: -0.4 },
    { p: [-2.5, 9.5, -16.5], s: [7, 19, 5], t: 1 },
    { p: [4.5, 10.5, -17.5], s: [7.5, 21, 5], t: 2, ry: 0.05 },
    { p: [-11.8, 5.0, 6.5], s: [5.5, 10, 5], t: 0, ry: -0.35 },
    { p: [12.2, 5.6, 7.0], s: [5.5, 11.2, 5], t: 1, ry: 0.35 },
    { p: [-8.5, 3.6, 10.5], s: [6, 7.2, 5], t: 2, ry: -0.2 },
    { p: [9.0, 4.0, 11.0], s: [6, 8, 5], t: 0, ry: 0.2 },
  ];

  return (
    <group>
      {specs.map((b, i) => (
        <group key={i} position={b.p} rotation={[0, b.ry ?? 0, 0]}>
          <mesh material={dark}>
            <boxGeometry args={b.s} />
          </mesh>
          <mesh position={[0, 0, b.s[2] / 2 + 0.02]}>
            <planeGeometry args={[b.s[0] * 0.96, b.s[1] * 0.97]} />
            <meshBasicMaterial map={win[b.t]} toneMapped={false} transparent opacity={0.92} />
          </mesh>
          <mesh position={[b.s[0] * 0.3, b.s[1] / 2 + 0.35, 0]}>
            <sphereGeometry args={[0.07, 6, 6]} />
            <meshBasicMaterial color={i % 2 ? def.neonL : def.neonR} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function StreetLamps({ def }: { def: StageDef }): JSX.Element {
  const poleMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#161a22', roughness: 0.4, metalness: 0.7 }), []);
  const headMat = useMemo(() => new THREE.MeshBasicMaterial({ color: def.lampColor, toneMapped: false }), [def]);
  useDispose([poleMat, headMat]);
  const positions: [number, number][] = [[-5.6, -2.6], [5.6, -2.6], [0, -4.2]];
  return (
    <group>
      {positions.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh material={poleMat} position={[0, 2.3, 0]}>
            <cylinderGeometry args={[0.06, 0.09, 4.6, 8]} />
          </mesh>
          <mesh material={poleMat} position={[0, 4.5, 0.45]} rotation={[0.5, 0, 0]}>
            <cylinderGeometry args={[0.045, 0.045, 1.0, 6]} />
          </mesh>
          <mesh material={headMat} position={[0, 4.62, 0.86]}>
            <sphereGeometry args={[0.14, 10, 8]} />
          </mesh>
          {i < 2 && <pointLight position={[0, 4.5, 0.9]} color={def.lampColor} intensity={9} distance={11} decay={1.9} />}
        </group>
      ))}
      <pointLight position={[-6.4, 2.6, -1.6]} color={def.neonL} intensity={7} distance={12} decay={1.8} />
      <pointLight position={[6.4, 2.6, -1.6]} color={def.neonR} intensity={7} distance={12} decay={1.8} />
    </group>
  );
}

function Crowd({ tint }: { tint: string }): JSX.Element {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: tint, roughness: 0.9, metalness: 0.1 }), [tint]);
  const rimA = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1a1016', emissive: '#ff2d6f', emissiveIntensity: 0.14, roughness: 0.9 }), []);
  const rimB = useMemo(() => new THREE.MeshStandardMaterial({ color: '#10151a', emissive: '#39c6ff', emissiveIntensity: 0.14, roughness: 0.9 }), []);
  useDispose([mat, rimA, rimB]);
  const group = useRef<THREE.Group>(null);
  const people = useMemo(() => {
    const arr: { x: number; z: number; s: number; ph: number; spd: number; range: number }[] = [];
    for (let i = 0; i < 14; i++) {
      arr.push({
        x: -9 + i * 1.35 + (Math.random() - 0.5) * 0.7,
        z: -5.9 - Math.random() * 1.5,
        s: 0.86 + Math.random() * 0.22,
        ph: Math.random() * Math.PI * 2,
        spd: 0.25 + Math.random() * 0.4,
        range: 0.6 + Math.random() * 1.4,
      });
    }
    return arr;
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const g = group.current;
    if (!g) return;
    g.children.forEach((c, i) => {
      const p = people[i];
      c.position.x = p.x + Math.sin(t * p.spd + p.ph) * p.range;
      c.position.y = Math.abs(Math.sin(t * p.spd * 4 + p.ph)) * 0.035;
      c.rotation.y = Math.cos(t * p.spd + p.ph) > 0 ? 0.35 : -0.35 + Math.PI;
    });
  });

  return (
    <group ref={group}>
      {people.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]} scale={p.s}>
          <mesh material={i % 3 === 0 ? rimA : i % 3 === 1 ? rimB : mat} position={[0, 0.78, 0]}>
            <capsuleGeometry args={[0.16, 0.72, 4, 8]} />
          </mesh>
          <mesh material={mat} position={[0, 1.42, 0]}>
            <sphereGeometry args={[0.115, 8, 8]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Traffic({ def }: { def: StageDef }): JSX.Element {
  const count = 14;
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);
  const cars = useMemo(() => Array.from({ length: count }, (_, i) => ({
    speed: (i % 2 === 0 ? 1 : -1) * (5 + (i % 5) * 1.7),
    off: (i / count) * 44,
    red: i % 2 !== 0,
  })), []);

  useFrame((state) => {
    const im = ref.current;
    if (!im) return;
    const t = state.clock.elapsedTime;
    cars.forEach((c, i) => {
      let x = (c.off + t * c.speed) % 44;
      if (x < 0) x += 44;
      dummy.position.set(x - 22, i % 2 === 0 ? 4.15 : 4.35, i % 2 === 0 ? -15.2 : -16.6);
      dummy.scale.set(1.5, 0.12, 0.12);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
      col.set(c.red ? '#ff3b30' : def.lampColor);
      im.setColorAt(i, col);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <mesh position={[0, 3.6, -15.9]}>
        <boxGeometry args={[46, 0.5, 3.4]} />
        <meshStandardMaterial color={def.buildingTint} roughness={0.9} metalness={0.2} />
      </mesh>
      <mesh position={[0, 3.05, -14.35]}>
        <boxGeometry args={[46, 0.14, 0.1]} />
        <meshBasicMaterial color={def.neonR} toneMapped={false} />
      </mesh>
      <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

function Barriers({ def }: { def: StageDef }): JSX.Element {
  const metal = useMemo(() => new THREE.MeshStandardMaterial({ color: '#12151c', roughness: 0.35, metalness: 0.8 }), []);
  useDispose([metal]);
  return (
    <group>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * (STAGE_LIMIT + 0.85), 0, -0.4]}>
          <mesh material={metal} position={[0, 0.55, 0]}>
            <boxGeometry args={[0.14, 1.1, 3.4]} />
          </mesh>
          <mesh position={[side * 0.09, 1.02, 0]}>
            <boxGeometry args={[0.03, 0.05, 3.3]} />
            <meshBasicMaterial color={side < 0 ? def.neonL : def.neonR} toneMapped={false} />
          </mesh>
          <pointLight position={[side * 0.4, 1.3, 0]} color={side < 0 ? def.neonL : def.neonR} intensity={2.4} distance={4} decay={2} />
        </group>
      ))}
    </group>
  );
}

function Ground({ def }: { def: StageDef }): JSX.Element {
  const quality = useSettings((s) => s.quality);
  const asphalt = useMemo(() => makeAsphaltTexture(), []);
  useDispose([asphalt]);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -1]} receiveShadow>
        <planeGeometry args={[64, 44]} />
        {quality === 'low' || !def.ground.wet ? (
          <meshStandardMaterial map={asphalt} color={def.ground.color} roughness={def.ground.wet ? 0.28 : 0.72} metalness={def.ground.wet ? 0.72 : 0.15} />
        ) : (
          <MeshReflectorMaterial
            resolution={quality === 'high' ? 1024 : 512}
            blur={[384, 96]}
            mixBlur={1}
            mixStrength={9}
            roughness={0.42}
            depthScale={1.1}
            minDepthThreshold={0.4}
            maxDepthThreshold={1.3}
            color={def.ground.color}
            metalness={0.62}
            map={asphalt}
            mirror={0.55}
          />
        )}
      </mesh>
      {[-2.4, 2.6].map((z, i) => (
        <group key={i}>
          {Array.from({ length: 9 }, (_, d) => (
            <mesh key={d} rotation={[-Math.PI / 2, 0, 0]} position={[-9.6 + d * 2.4, 0.012, z]}>
              <planeGeometry args={[1.1, 0.09]} />
              <meshBasicMaterial color={def.ground.lineColor} transparent opacity={0.14} toneMapped={false} />
            </mesh>
          ))}
        </group>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <ringGeometry args={[3.05, 3.14, 72]} />
        <meshBasicMaterial color={def.neonR} transparent opacity={0.16} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.14, -5.1]} receiveShadow>
        <planeGeometry args={[40, 3.2]} />
        <meshStandardMaterial color="#191c24" roughness={0.55} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.14, -3.55]}>
        <boxGeometry args={[40, 0.28, 0.12]} />
        <meshStandardMaterial color="#22262f" roughness={0.6} metalness={0.25} />
      </mesh>
    </group>
  );
}

export function CityStage({ def }: { def: StageDef }): JSX.Element {
  const quality = useSettings((s) => s.quality);
  const steamDensity = def.weather === 'rain' || def.weather === 'storm' ? 1 : def.weather === 'mist' ? 1.6 : 0.5;
  const shadowSize = quality === 'high' ? 2048 : 1024;
  return (
    <group>
      <SceneAtmosphere def={def} />

      <hemisphereLight args={[def.ambient[0], def.ambient[1], def.ambient[2] + 0.12]} />
      <directionalLight
        position={[-5, 9, 4]}
        intensity={def.weather === 'clear' ? 1.3 : 0.95}
        color={def.moonColor}
        castShadow={false}
        shadow-mapSize-width={shadowSize}
        shadow-mapSize-height={shadowSize}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={9}
        shadow-camera-bottom={-4}
        shadow-camera-near={1}
        shadow-camera-far={30}
        shadow-bias={-0.0012}
      />

      <Ground def={def} />
      <Buildings def={def} />
      <NeonSigns def={def} />
      <HoloBillboards def={def} />
      <WindBanners def={def} />
      <StreetLamps def={def} />
      <Crowd tint={def.crowdTint} />
      <Traffic def={def} />
      <Barriers def={def} />
      <StageProps props={def.props} def={def} />
      <Steam density={steamDensity} />
      <Weather kind={def.weather} />
    </group>
  );
}
