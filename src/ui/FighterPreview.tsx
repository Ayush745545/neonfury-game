import { Component, Suspense, useMemo, type ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FighterView } from '../fighters/FighterView';
import { CHARACTERS } from '../fighters/characters';
import type { CharId } from '../game/types';
import { previewRuntime } from '../fighters/previewRuntime';
import { ProceduralEnvironment } from '../app/gfx';
import { useSettings } from '../config/settings';
import { Portrait } from './Portrait';

function PreviewScene({ char }: { char: CharId }) {
  const runtime = useMemo(() => previewRuntime(char), [char]);
  const color = CHARACTERS[char].color;
  useFrame((_, dt) => {
    runtime.anim.frame += Math.min(dt, 0.05) * 60;
  });
  return <>
    <ProceduralEnvironment pal={{ top: '#182b49', bottom: '#101722', glowL: color, glowR: '#79dfff', intensity: 0.9 }} />
    <ambientLight intensity={0.4} />
    <hemisphereLight args={['#c3deff', '#202338', 1.4]} />
    <directionalLight position={[-2, 4, 4]} color="#fff0df" intensity={4} />
    <pointLight position={[1.4, 1.6, -1]} color={color} intensity={12} distance={5} decay={2} />
    <pointLight position={[-1.5, 1.5, 0.8]} color="#6fcfff" intensity={4} distance={5} decay={2} />
    <FighterView key={char} runtime={runtime} preview />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.018, 0]}>
      <circleGeometry args={[1.1, 64]} />
      <meshStandardMaterial color="#111d2b" metalness={0.55} roughness={0.28} />
    </mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
      <ringGeometry args={[0.92, 0.935, 64]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  </>;
}

class PreviewBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export default function FighterPreview({ char }: { char: CharId }) {
  const quality = useSettings((s) => s.quality);
  const fallback = <div className="preview-fallback"><Portrait char={char} size={220} /></div>;
  return <div className="fighter-preview" aria-label={`Animated 3D preview of ${CHARACTERS[char].name}`}>
    <div className="preview-topline">FIGHTER SHOWCASE <span>LIVE 3D</span></div>
    <PreviewBoundary fallback={fallback}>
      {typeof WebGL2RenderingContext === 'undefined' ? fallback : <Canvas
        dpr={[1, quality === 'high' ? 1.5 : 1]}
        camera={{ fov: 34, near: 0.1, far: 20, position: [0, 1.0, 3.9] }}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        onCreated={({ gl, camera }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          camera.lookAt(0, 0.95, 0);
        }}
      ><Suspense fallback={null}><PreviewScene char={char} /></Suspense></Canvas>}
    </PreviewBoundary>
    <div className="preview-caption" style={{ color: CHARACTERS[char].color }}>
      <strong>{CHARACTERS[char].name}</strong><span>{CHARACTERS[char].title}</span>
    </div>
  </div>;
}
