import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { makePuffTexture, makeSignTexture } from './textures';
import { useDispose } from './useDispose';
import { useSettings } from '../config/settings';
import type { StageDef } from './stages';

type BoxPart = { p: [number, number, number]; s: [number, number, number]; ry?: number };

/** Static architecture is batched by surface, rather than one draw per trim. */
function BoxBatch({ parts, color, roughness = 0.7, metalness = 0.2 }: {
  parts: BoxPart[]; color: string; roughness?: number; metalness?: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const obj = new THREE.Object3D();
    parts.forEach((part, i) => {
      obj.position.set(...part.p);
      obj.scale.set(...part.s);
      obj.rotation.set(0, part.ry ?? 0, 0);
      obj.updateMatrix();
      ref.current?.setMatrixAt(i, obj.matrix);
    });
    if (ref.current) { ref.current.instanceMatrix.needsUpdate = true; ref.current.computeBoundingSphere(); }
  }, [parts]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, parts.length]} receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
    </instancedMesh>
  );
}

const SHOP_DEFS = [
  { x: -7.7, z: -6.8, text: 'ラーメン', color: '#ff7552', awning: '#5d2824', door: -1 },
  { x: -3.8, z: -8.1, text: '電脳 24H', color: '#66d7ff', awning: '#23465b', door: 1 },
  { x: 3.6, z: -8.3, text: '居酒屋', color: '#ffcf76', awning: '#5a3c21', door: -1 },
  { x: 7.8, z: -6.9, text: '東京 夜市', color: '#e882ff', awning: '#482752', door: 1 },
];

function Shopfront({ shop }: { shop: typeof SHOP_DEFS[number] }) {
  const sign = useMemo(() => makeSignTexture(shop.text, shop.color), [shop]);
  useDispose([sign]);
  const shutters = useMemo(() => Array.from({ length: 15 }, (_, i): BoxPart => ({
    p: [shop.door * 1.18, 0.24 + i * 0.105, 0.53], s: [0.66, 0.032, 0.045],
  })), [shop]);
  const frames = useMemo(() => [
    ...[-1.7, -0.72, 0.72, 1.7].map((x): BoxPart => ({ p: [x, 1.15, 0.6], s: [0.07, 2.1, 0.07] })),
    ...[0.16, 0.67, 2.12].map((y): BoxPart => ({ p: [0, y, 0.6], s: [3.45, 0.06, 0.07] })),
    { p: [0, 2.54, 0.54], s: [3.65, 0.12, 0.14] } as BoxPart,
    { p: [0, 2.82, 0.54], s: [3.65, 0.12, 0.14] } as BoxPart,
  ], []);
  return (
    <group position={[shop.x, 0.15, shop.z]}>
      <mesh position={[0, 1.48, -0.03]} receiveShadow castShadow>
        <boxGeometry args={[3.6, 2.96, 1.14]} />
        <meshStandardMaterial color="#39434d" roughness={0.82} />
      </mesh>
      {/* Recessed lit interior, window mullions, counter and door hardware. */}
      <mesh position={[0, 1.3, 0.56]}>
        <planeGeometry args={[3.28, 1.84]} />
        <meshStandardMaterial color="#5e665e" emissive={shop.color} emissiveIntensity={0.17} roughness={0.24} metalness={0.24} />
      </mesh>
      <BoxBatch parts={frames} color="#18212a" metalness={0.75} roughness={0.32} />
      <BoxBatch parts={shutters} color="#687078" metalness={0.6} roughness={0.48} />
      <mesh position={[shop.door * 1.18, 1.15, 0.62]}>
        <boxGeometry args={[0.045, 0.24, 0.045]} />
        <meshStandardMaterial color="#afb7b6" metalness={0.95} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.52, 0.64]} receiveShadow>
        <boxGeometry args={[3.38, 0.24, 0.3]} />
        <meshStandardMaterial color="#352a24" roughness={0.66} />
      </mesh>
      {[-0.85, 0, 0.85].map((x, i) => (
        <group key={i} position={[x, 0.85, 0.65]}>
          <mesh><cylinderGeometry args={[0.11, 0.09, 0.08, 12]} /><meshStandardMaterial color="#e5dac4" roughness={0.3} /></mesh>
          <mesh position={[0, 0.1, 0]}><sphereGeometry args={[0.045, 8, 6]} /><meshBasicMaterial color={shop.color} toneMapped={false} /></mesh>
        </group>
      ))}
      <mesh position={[0, 2.68, 0.62]}>
        <planeGeometry args={[3.43, 0.5]} />
        <meshBasicMaterial map={sign} toneMapped={false} />
      </mesh>
      <mesh position={[0, 2.32, 0.98]} rotation={[0.18, 0, 0]} castShadow>
        <boxGeometry args={[3.7, 0.1, 0.95]} />
        <meshStandardMaterial color={shop.awning} roughness={0.6} />
      </mesh>
      <mesh position={[0, 2.17, 1.41]}>
        <boxGeometry args={[3.7, 0.23, 0.06]} />
        <meshStandardMaterial color={shop.awning} roughness={0.72} />
      </mesh>
      <mesh position={[0, 2.23, 0.86]}>
        <boxGeometry args={[2.9, 0.026, 0.055]} />
        <meshBasicMaterial color={shop.color} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 1.85, 1.12]} color={shop.color} intensity={3.5} distance={5} decay={2} />
    </group>
  );
}

function Puddles({ def }: { def: StageDef }) {
  const group = useRef<THREE.Group>(null);
  const normal = useMemo(() => {
    const data = new Uint8Array(64 * 64 * 4);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      data.set([128 + Math.sin(x * 0.65) * 5, 128 + Math.cos(y * 0.6) * 5, 254, 255], (y * 64 + x) * 4);
    }
    const tex = new THREE.DataTexture(data, 64, 64);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }, []);
  useDispose([normal]);
  useFrame(({ clock }, dt) => {
    normal.offset.x += Math.min(dt, 0.05) * 0.015;
    normal.offset.y += Math.min(dt, 0.05) * 0.009;
    group.current?.children.forEach((child, i) => {
      const life = (clock.elapsedTime * 0.7 + i * 0.173) % 1;
      child.scale.setScalar(0.06 + life * 0.42);
      (child as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>).material.opacity = (1 - life) * 0.18;
    });
  });
  const spots = [[-4.1, 1.6, 1.5], [3.8, 1.9, 1.1], [-0.6, -1.7, 1.75], [6.5, -2.1, 0.7], [-7.3, -1.4, 0.8]];
  return (
    <group name="tokyo-puddles">
      {spots.map(([x, z, s], i) => (
        <mesh key={i} position={[x, 0.009, z]} rotation={[-Math.PI / 2, 0, i * 1.4]} scale={[s, s * 0.56, 1]} receiveShadow>
          <circleGeometry args={[1, 32]} />
          <meshPhysicalMaterial color="#28343e" roughness={0.1} metalness={0} clearcoat={1} clearcoatRoughness={0.08} normalMap={normal} normalScale={new THREE.Vector2(0.05, 0.05)} transparent opacity={0.55} depthWrite={false} />
        </mesh>
      ))}
      <group ref={group}>
        {spots.flatMap(([x, z], i) => [0, 1, 2].map((n) => (
          <mesh key={`${i}-${n}`} position={[x + Math.sin(n * 7 + i) * 0.5, 0.014, z + Math.cos(n * 4 + i) * 0.24]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.87, 1, 24]} />
            <meshBasicMaterial color={i % 2 ? def.neonL : def.neonR} transparent opacity={0} depthWrite={false} toneMapped={false} />
          </mesh>
        )))}
      </group>
    </group>
  );
}

function SkylineDetails() {
  const ledges = useMemo(() => {
    const towers = [[-9.5, 11, -6.93, 6], [-4.6, 15, -8.93, 5.5], [0.8, 12.4, -10.42, 6.5], [6.2, 16, -9.23, 5.8], [10.8, 10.4, -6.62, 5.4]];
    const parts: BoxPart[] = [];
    towers.forEach(([x, h, z, w]) => {
      for (let floor = 3; floor < h; floor += 1.05) parts.push({ p: [x, floor, z], s: [w + 0.06, 0.055, 0.25] });
      for (let col = -2; col <= 2; col++) parts.push({ p: [x + col * w / 5, h / 2 + 1.5, z], s: [0.07, h - 3, 0.13] });
      parts.push({ p: [x, h + 0.1, z - 0.2], s: [w + 0.16, 0.22, 0.7] });
    });
    return parts;
  }, []);
  const equipment = useMemo(() => [-9.2, -6.1, 6.7, 9.6].flatMap((x, i): BoxPart[] => [
    { p: [x, 3.4 + i % 2, -6.9], s: [0.65, 0.44, 0.32] },
    { p: [x + 0.43, 2.1, -6.94], s: [0.065, 3.9, 0.1] },
    ...Array.from({ length: 5 }, (_, n): BoxPart => ({ p: [x - 0.23 + n * 0.11, 3.4 + i % 2, -6.72], s: [0.035, 0.29, 0.02] })),
  ]), []);
  const cables = useMemo(() => [0, 1].map((i) => new THREE.CatmullRomCurve3([
    new THREE.Vector3(-12, 5.7 + i * 0.42, -6.5), new THREE.Vector3(-5, 5 + i * 0.4, -7.4),
    new THREE.Vector3(4, 5.1 + i * 0.4, -7.4), new THREE.Vector3(12, 6 + i * 0.42, -6.5),
  ])), []);
  return (
    <group name="tokyo-architecture">
      <BoxBatch parts={ledges} color="#46515d" roughness={0.65} metalness={0.22} />
      <BoxBatch parts={equipment} color="#4a5961" roughness={0.55} metalness={0.48} />
      {cables.map((curve, i) => <mesh key={i}><tubeGeometry args={[curve, 32, 0.013, 4, false]} /><meshStandardMaterial color="#111820" roughness={0.8} /></mesh>)}
      {[-4.6, 6.2].map((x, i) => (
        <group key={i} position={[x, i ? 16.4 : 15.4, -11]}>
          <mesh><cylinderGeometry args={[0.52, 0.52, 1.25, 16]} /><meshStandardMaterial color="#485565" roughness={0.52} metalness={0.5} /></mesh>
          <mesh position={[0, 0.72, 0]}><coneGeometry args={[0.58, 0.23, 16]} /><meshStandardMaterial color="#566477" roughness={0.58} metalness={0.48} /></mesh>
        </group>
      ))}
    </group>
  );
}

function StreetFurniture({ def }: { def: StageDef }) {
  const slabs = useMemo(() => Array.from({ length: 40 }, (_, i): BoxPart => ({
    p: [-19.5 + i, 0.25, -3.54], s: [0.95, 0.22, 0.31],
  })), []);
  const drains = useMemo(() => [-6.2, 6.4].flatMap((x): BoxPart[] => [
    { p: [x, 0.015, -2.8], s: [0.72, 0.018, 0.49] },
    ...Array.from({ length: 8 }, (_, i): BoxPart => ({ p: [x - 0.3 + i * 0.085, 0.03, -2.8], s: [0.025, 0.01, 0.43] })),
  ]), []);
  return (
    <group name="tokyo-street-furniture">
      <BoxBatch parts={slabs} color="#67727a" roughness={0.78} />
      <BoxBatch parts={drains} color="#14202a" roughness={0.27} metalness={0.85} />
      {[-8.8, 8.9].map((x, i) => (
        <group key={i} position={[x, 0.15, -4.4]}>
          <mesh position={[0, 0.98, 0]} castShadow><boxGeometry args={[0.87, 1.96, 0.68]} /><meshStandardMaterial color={i ? '#354860' : '#742d32'} roughness={0.32} metalness={0.5} /></mesh>
          <mesh position={[-0.07, 1.23, 0.351]}><planeGeometry args={[0.62, 1.2]} /><meshStandardMaterial color="#2e485b" emissive={i ? def.neonR : '#ffc881'} emissiveIntensity={0.38} roughness={0.17} metalness={0.15} /></mesh>
          {Array.from({ length: 9 }, (_, n) => <mesh key={n} position={[-0.28 + n % 3 * 0.2, 0.82 + Math.floor(n / 3) * 0.3, 0.367]}><cylinderGeometry args={[0.049, 0.049, 0.12, 8]} /><meshStandardMaterial color={['#ca5850', '#c6a267', '#72a1b8'][n % 3]} roughness={0.28} metalness={0.55} /></mesh>)}
          <mesh position={[0, 0.28, 0.351]}><boxGeometry args={[0.5, 0.18, 0.05]} /><meshStandardMaterial color="#141a21" roughness={0.4} metalness={0.6} /></mesh>
        </group>
      ))}
      {[-6.8, 6.8].map((x, i) => <mesh key={i} position={[x, 0.74, -3.9]} castShadow><cylinderGeometry args={[0.06, 0.09, 1.2, 10]} /><meshStandardMaterial color="#68717b" metalness={0.75} roughness={0.34} /></mesh>)}
    </group>
  );
}

function GroundMist() {
  const tex = useMemo(() => makePuffTexture('rgba(115,143,172,0.32)'), []);
  useDispose([tex]);
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    ref.current?.children.forEach((child, i) => {
      child.position.x = Math.sin(clock.elapsedTime * 0.08 + i * 2.3) * 4;
      (child as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>).material.opacity = 0.045 + Math.sin(clock.elapsedTime * 0.12 + i) * 0.013;
    });
  });
  return <group ref={ref}>{[0, 1, 2].map((i) => <mesh key={i} position={[i - 1, 0.42 + i * 0.12, -2 - i * 2]}><planeGeometry args={[18, 1.2]} /><meshBasicMaterial map={tex} transparent opacity={0.04} depthWrite={false} /></mesh>)}</group>;
}

/** All set dressing stays behind/outside the authoritative combat lane. */
export function TokyoStreet({ def }: { def: StageDef }) {
  const quality = useSettings((s) => s.quality);
  return (
    <group name="neon-tokyo-cinematic-set">
      {SHOP_DEFS.map((shop) => <Shopfront key={shop.x} shop={shop} />)}
      <SkylineDetails />
      <StreetFurniture def={def} />
      <Puddles def={def} />
      {quality !== 'low' && <GroundMist />}
    </group>
  );
}
