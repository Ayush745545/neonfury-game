import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PropKind, StageDef } from './stages';
import type { JSX } from 'react';

/* Simple primitive-built stage props. Placed away from the center lane
   so the fighting area always stays readable. */

function Torii({ color }: { color: string }): JSX.Element {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: color || '#b3122e', roughness: 0.55, metalness: 0.1 }), [color]);
  return (
    <group position={[0, 0, -6.4]}>
      <mesh material={mat} position={[-2.6, 2.6, 0]}><cylinderGeometry args={[0.16, 0.2, 5.2, 10]} /></mesh>
      <mesh material={mat} position={[2.6, 2.6, 0]}><cylinderGeometry args={[0.16, 0.2, 5.2, 10]} /></mesh>
      <mesh material={mat} position={[0, 5.1, 0]}><boxGeometry args={[7.2, 0.3, 0.42]} /></mesh>
      <mesh material={mat} position={[0, 5.45, 0]}><boxGeometry args={[7.8, 0.22, 0.5]} /></mesh>
      <mesh material={mat} position={[0, 4.1, 0]}><boxGeometry args={[5.6, 0.2, 0.3]} /></mesh>
      <mesh position={[0, 5.75, 0]}>
        <boxGeometry args={[1.4, 0.06, 0.06]} />
        <meshBasicMaterial color="#ffd24d" toneMapped={false} />
      </mesh>
    </group>
  );
}

function Lanterns({ color }: { color: string }): JSX.Element {
  const ref = useRef<THREE.Group>(null);
  const lanterns = useMemo(() => Array.from({ length: 14 }, (_, i) => ({
    x: -8.4 + i * 1.28,
    y: 3.6 + Math.sin(i * 1.3) * 0.25,
    z: -4.6 - (i % 3) * 0.8,
    ph: i * 0.9,
  })), []);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    ref.current?.children.forEach((c, i) => {
      c.rotation.z = Math.sin(t * 1.1 + lanterns[i].ph) * 0.12;
    });
  });
  return (
    <group ref={ref}>
      {lanterns.map((l, i) => (
        <group key={i} position={[l.x, l.y, l.z]}>
          <mesh>
            <sphereGeometry args={[0.14, 10, 8]} />
            <meshBasicMaterial color={i % 2 ? color || '#ff6a4d' : '#ffd08a'} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0.17, 0]}>
            <boxGeometry args={[0.02, 0.12, 0.02]} />
            <meshStandardMaterial color="#111" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Cranes(): JSX.Element {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1c222b', roughness: 0.5, metalness: 0.75 }), []);
  return (
    <group>
      {[-12.5, 13.5].map((x, i) => (
        <group key={i} position={[x, 0, -9 - i * 2]}>
          <mesh material={mat} position={[0, 5.5, 0]}><boxGeometry args={[0.5, 11, 0.5]} /></mesh>
          <mesh material={mat} position={[i ? -2.6 : 2.6, 10.4, 0]} rotation={[0, 0, i ? 0.06 : -0.06]}>
            <boxGeometry args={[7.5, 0.32, 0.32]} />
          </mesh>
          <mesh material={mat} position={[i ? -5.4 : 5.4, 8.8, 0]}>
            <boxGeometry args={[0.06, 3.2, 0.06]} />
          </mesh>
          <mesh position={[0, 11.1, 0]}>
            <sphereGeometry args={[0.09, 6, 6]} />
            <meshBasicMaterial color="#ff3344" toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Containers(): JSX.Element {
  const colors = ['#8a3020', '#1e4a6e', '#3e5a20', '#6e4a1e', '#40284e'];
  const stacks = useMemo(() => [
    { x: -10.5, z: -5.0, n: 2, c: [0, 1] }, { x: -9.2, z: -6.4, n: 3, c: [2, 3, 0] },
    { x: 10.2, z: -5.4, n: 2, c: [4, 1] }, { x: 11.4, z: -6.8, n: 3, c: [1, 2, 4] },
    { x: -11.8, z: 2.0, n: 1, c: [3] }, { x: 11.9, z: 2.6, n: 1, c: [0] },
  ], []);
  const mats = useMemo(() => colors.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.35 })), []);
  return (
    <group>
      {stacks.map((st, i) => (
        <group key={i} position={[st.x, 0, st.z]}>
          {Array.from({ length: st.n }, (_, j) => (
            <mesh key={j} material={mats[st.c[j % st.c.length]]} position={[0, 0.65 + j * 1.32, 0]}>
              <boxGeometry args={[3.4, 1.28, 1.5]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function ArcadeCabs({ tint }: { tint: string }): JSX.Element {
  const cabs = useMemo(() => Array.from({ length: 10 }, (_, i) => ({
    x: -8.6 + i * 1.9 + (i % 2) * 0.4,
    z: -5.3 - (i % 3) * 0.7,
    c: i % 3 === 0 ? '#ff4dd8' : i % 3 === 1 ? '#4dfff2' : '#b14dff',
  })), []);
  return (
    <group>
      {cabs.map((c, i) => (
        <group key={i} position={[c.x, 0, c.z]}>
          <mesh position={[0, 0.75, 0]}>
            <boxGeometry args={[0.75, 1.5, 0.65]} />
            <meshStandardMaterial color="#1a1024" roughness={0.5} metalness={0.3} />
          </mesh>
          <mesh position={[0, 1.15, 0.34]}>
            <planeGeometry args={[0.55, 0.45]} />
            <meshBasicMaterial color={c.c} toneMapped={false} />
          </mesh>
          <mesh position={[0, 1.55, 0]}>
            <boxGeometry args={[0.78, 0.12, 0.68]} />
            <meshBasicMaterial color={c.c} toneMapped={false} />
          </mesh>
        </group>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -5.6]}>
        <planeGeometry args={[24, 2.4]} />
        <meshBasicMaterial color={tint} transparent opacity={0.06} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Helipad(): JSX.Element {
  return (
    <group position={[0, 0.02, -2.5]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.4, 3.6, 60]} />
        <meshBasicMaterial color="#e8d850" transparent opacity={0.5} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-0.9, 0.005, 0]}>
        <planeGeometry args={[0.4, 2.2]} />
        <meshBasicMaterial color="#e8d850" transparent opacity={0.5} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.9, 0.005, 0]}>
        <planeGeometry args={[0.4, 2.2]} />
        <meshBasicMaterial color="#e8d850" transparent opacity={0.5} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.4, 0.4]} />
        <meshBasicMaterial color="#e8d850" transparent opacity={0.5} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Benches(): JSX.Element {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#20242c', roughness: 0.7, metalness: 0.3 }), []);
  return (
    <group>
      {[-7.5, 7.8].map((x, i) => (
        <group key={i} position={[x, 0, -4.2]}>
          <mesh material={mat} position={[0, 0.42, 0]}><boxGeometry args={[1.6, 0.08, 0.5]} /></mesh>
          <mesh material={mat} position={[-0.7, 0.21, 0]}><boxGeometry args={[0.08, 0.42, 0.44]} /></mesh>
          <mesh material={mat} position={[0.7, 0.21, 0]}><boxGeometry args={[0.08, 0.42, 0.44]} /></mesh>
        </group>
      ))}
    </group>
  );
}

function TrainLights({ color }: { color: string }): JSX.Element {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);
  const count = 6;
  useFrame((state) => {
    const im = ref.current;
    if (!im) return;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const speed = 16 + (i % 3) * 6;
      let x = ((t * speed + i * 9) % 60) - 30;
      if (i % 2 === 1) x = -x;
      dummy.position.set(x, 2.6 + (i % 2) * 0.5, -13.5 - (i % 3) * 1.5);
      dummy.scale.set(5.5, 0.16, 0.16);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
      col.set(i % 2 ? color || '#7dd8ff' : '#ffd8a0');
      im.setColorAt(i, col);
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial toneMapped={false} transparent opacity={0.85} />
    </instancedMesh>
  );
}

function TeslaCoils({ color }: { color: string }): JSX.Element {
  const refA = useRef<THREE.Mesh>(null);
  const refB = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const pulse = 1.6 + Math.sin(t * 9) * 0.8 + (Math.sin(t * 47) > 0.85 ? 2.4 : 0);
    if (refA.current) (refA.current.material as THREE.MeshBasicMaterial).color.setStyle(color || '#9fe8ff');
    if (refB.current) (refB.current.material as THREE.MeshBasicMaterial).color.setStyle(color || '#9fe8ff');
    refA.current?.scale.setScalar(0.35 + pulse * 0.1);
    refB.current?.scale.setScalar(0.35 + pulse * 0.1);
  });
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#242a33', roughness: 0.4, metalness: 0.8 }), []);
  return (
    <group>
      {[-9.8, 10.0].map((x, i) => (
        <group key={i} position={[x, 0, -4.8]}>
          <mesh material={mat} position={[0, 1.8, 0]}><cylinderGeometry args={[0.14, 0.3, 3.6, 8]} /></mesh>
          <mesh material={mat} position={[0, 3.7, 0]}><torusGeometry args={[0.42, 0.07, 8, 20]} /></mesh>
          <mesh ref={i ? refB : refA} position={[0, 3.7, 0]}>
            <sphereGeometry args={[0.3, 12, 10]} />
            <meshBasicMaterial color="#9fe8ff" toneMapped={false} transparent opacity={0.9} />
          </mesh>
          <pointLight position={[0, 3.7, 0]} color={color || '#9fe8ff'} intensity={4} distance={7} decay={2} />
        </group>
      ))}
    </group>
  );
}

function SakuraTrees(): JSX.Element {
  const trunk = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3a2a20', roughness: 0.9 }), []);
  const bloom = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ff9ec8', emissive: '#ff6aa8', emissiveIntensity: 0.16, roughness: 0.85 }), []);
  const trees = useMemo(() => [
    { x: -9.5, z: -4.6, s: 1.1 }, { x: -7.0, z: -6.2, s: 0.85 },
    { x: 9.8, z: -4.9, s: 1.05 }, { x: 7.4, z: -6.5, s: 0.8 },
  ], []);
  return (
    <group>
      {trees.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]} scale={t.s}>
          <mesh material={trunk} position={[0, 1.5, 0]}><cylinderGeometry args={[0.14, 0.26, 3, 8]} /></mesh>
          <mesh material={bloom} position={[0, 3.1, 0]}><sphereGeometry args={[1.05, 10, 8]} /></mesh>
          <mesh material={bloom} position={[0.7, 2.7, 0.3]}><sphereGeometry args={[0.65, 8, 7]} /></mesh>
          <mesh material={bloom} position={[-0.65, 2.8, -0.25]}><sphereGeometry args={[0.6, 8, 7]} /></mesh>
        </group>
      ))}
    </group>
  );
}

function MarketStalls(): JSX.Element {
  const stalls = useMemo(() => [
    { x: -8.8, z: -4.9, c: '#c23030' }, { x: -6.4, z: -5.4, c: '#2a5a8a' },
    { x: 6.6, z: -5.2, c: '#8a6a2a' }, { x: 9.0, z: -4.8, c: '#30724a' },
  ], []);
  return (
    <group>
      {stalls.map((s, i) => (
        <group key={i} position={[s.x, 0, s.z]}>
          <mesh position={[0, 0.55, 0]}>
            <boxGeometry args={[1.7, 1.1, 0.9]} />
            <meshStandardMaterial color="#2a2018" roughness={0.8} />
          </mesh>
          <mesh position={[0, 1.55, 0.1]} rotation={[0.24, 0, 0]}>
            <boxGeometry args={[2.0, 0.06, 0.9]} />
            <meshStandardMaterial color={s.c} roughness={0.7} />
          </mesh>
          <mesh position={[0, 1.25, -0.3]}>
            <boxGeometry args={[0.06, 0.9, 0.06]} />
            <meshStandardMaterial color="#1a1410" />
          </mesh>
          <mesh position={[0, 1.3, 0.3]}>
            <sphereGeometry args={[0.09, 8, 6]} />
            <meshBasicMaterial color="#ffcf8a" toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Pillars({ tint }: { tint: string }): JSX.Element {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1c2028', roughness: 0.75, metalness: 0.3 }), []);
  return (
    <group>
      {[-10.5, -6.8, 6.8, 10.5].map((x, i) => (
        <group key={i} position={[x, 0, -4.4 - (i % 2)]}>
          <mesh material={mat} position={[0, 3, 0]}><cylinderGeometry args={[0.34, 0.4, 6, 10]} /></mesh>
          <mesh position={[0, 4.4, 0]}>
            <cylinderGeometry args={[0.36, 0.36, 0.14, 10]} />
            <meshBasicMaterial color={tint} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function StageProps({ props, def }: { props: PropKind[]; def: StageDef }): JSX.Element | null {
  if (!props.length) return null;
  return (
    <group>
      {props.map((p, i) => {
        switch (p) {
          case 'torii': return <Torii key={i} color={def.neonL} />;
          case 'lanterns': return <Lanterns key={i} color={def.neonL} />;
          case 'cranes': return <Cranes key={i} />;
          case 'containers': return <Containers key={i} />;
          case 'arcade': return <ArcadeCabs key={i} tint={def.neonR} />;
          case 'helipad': return <Helipad key={i} />;
          case 'benches': return <Benches key={i} />;
          case 'trainlights': return <TrainLights key={i} color={def.neonR} />;
          case 'tesla': return <TeslaCoils key={i} color={def.neonR} />;
          case 'sakura': return <SakuraTrees key={i} />;
          case 'market': return <MarketStalls key={i} />;
          case 'pillars': return <Pillars key={i} tint={def.neonL} />;
          default: return null;
        }
      })}
    </group>
  );
}
