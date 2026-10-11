import { useEffect, useMemo, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette, ChromaticAberration, SMAA } from '@react-three/postprocessing';
import * as THREE from 'three';
import { GameEngine } from '../game/GameEngine';
import type { CharId } from '../game/types';
import { useMatchStore } from '../game/matchStore';
import { useSettings } from '../config/settings';
import { inputManager } from '../game/inputManager';
import { NetDriver } from '../net/NetDriver';
import { netSession } from '../net/session';
import { cameraDirector } from '../camera/CameraDirector';
import { vfx } from '../vfx/vfxManager';
import { VFXLayer } from '../vfx/VFXLayer';
import { CityStage } from '../arenas/CityStage';
import { getStage } from '../arenas/stages';
import { ProceduralEnvironment, ExposureController, GRAPHICS_PRESETS } from './gfx';
import { FighterLightRig } from '../fighters/FighterLights';
import { PerfHook, PerfOverlay } from './PerfMonitor';
import { FighterView, HitboxDebug, ProjectileView } from '../fighters/FighterView';
import { HUD } from '../ui/HUD';
import { Announcer } from '../ui/Announcer';
import { PauseMenu } from '../ui/PauseMenu';
import { ResultsScreen } from '../ui/Results';
import { ControlsGuide } from '../ui/ControlsGuide';
import { TouchControls } from '../ui/TouchControls';
import { GamepadIndicator } from '../ui/GamepadIndicator';
import { GamepadVibrationListener } from '../game/GamepadVibrationListener';
import { GamepadDebug } from '../ui/GamepadDebug';
import { CHARACTERS } from '../fighters/characters';
import { audio } from '../audio/audioEngine';
import { bus } from '../game/eventBus';

/* ================================================================== */
/*  Game screen: owns the engine instance, the R3F canvas, the HUD    */
/*  and every in-match overlay (pause, results, controls, touch).     */
/* ================================================================== */

function Effects() {
  const quality = useSettings((s) => s.quality);
  const reduceFlashes = useSettings((s) => s.reduceFlashes);
  if (quality === 'low') return null;
  const caOffset = new THREE.Vector2(0.00025, 0.00018);
  // controlled bloom: higher threshold + smoothing keeps neon glowing
  // without blowing out whites or the additive VFX
  return (
    <EffectComposer multisampling={0} resolutionScale={GRAPHICS_PRESETS[quality].bloomResolutionScale}>
      <Bloom
        intensity={GRAPHICS_PRESETS[quality].bloomIntensity * (reduceFlashes ? 0.55 : 1)}
        luminanceThreshold={1.05}
        luminanceSmoothing={0.32}
        mipmapBlur
      />
      {quality === 'high' && !reduceFlashes && <ChromaticAberration offset={caOffset} radialModulation={false} modulationOffset={0.35} />}
      <Vignette eskil={false} offset={0.3} darkness={0.48} />
      {quality === 'high' && <SMAA />}
    </EffectComposer>
  );
}

function Experience({ engine, showBoxes, stageId, net }: { engine: GameEngine; showBoxes: boolean; stageId: string | null; net: NetDriver | null }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const stage = useMemo(() => getStage(stageId), [stageId]);

  useEffect(() => {
    cameraDirector.attach(camera);
    cameraDirector.reset(engine.match);
    engine.attachInputManager(inputManager);
    inputManager.attach();
    inputManager.suppressScroll = true;
    vfx.setFighters(engine.match.fighters[0], engine.match.fighters[1]);
    audio.play('rainOn');
    audio.startMusic();
    return () => {
      cameraDirector.dispose();
      inputManager.detach();
      vfx.clear();
      net?.dispose();
    };
  }, [camera, engine, net]);

  useFrame((_, dt) => {
    if (net) net.update(dt);
    else engine.update(dt);
    cameraDirector.update(Math.min(dt, 0.05), engine.match);
  });

  return (
    <>
      <ProceduralEnvironment
        pal={{ top: '#0a1226', bottom: '#120a14', glowL: stage.neonL, glowR: stage.neonR, intensity: 0.6 }}
      />
      <ExposureController />
      <CityStage def={stage} />
      <FighterLightRig engine={engine} rimL={stage.neonL} rimR={stage.neonR} />
      <FighterView runtime={engine.match.fighters[0]} />
      <FighterView runtime={engine.match.fighters[1]} />
      <ProjectileView engine={engine} />
      <VFXLayer match={engine.match} />
      {showBoxes && <HitboxDebug engine={engine} />}
      <PerfHook />
      <Effects />
    </>
  );
}

export function GameScreen() {
  const mode = useMatchStore((s) => s.mode);
  const p1Char = useMatchStore((s) => s.p1Char) ?? 'ryden';
  const p2Char = useMatchStore((s) => s.p2Char) ?? 'volt';
  const difficulty = useSettings((s) => s.difficulty);
  const introPlayed = useMatchStore((s) => s.introPlayed);
  const paused = useMatchStore((s) => s.paused);
  const showResults = useMatchStore((s) => s.showResults);
  const gotoMenu = useMatchStore((s) => s.gotoMenu);
  const gotoSelect = useMatchStore((s) => s.gotoSelect);
  const hitboxesSetting = useSettings((s) => s.showHitboxes);
  const quality = useSettings((s) => s.quality);
  const stageId = useMatchStore((s) => s.stageId);
  const uiScale = useSettings((s) => s.uiScale);
  const colorblind = useSettings((s) => s.colorblindBars);

  const phase = useMatchStore((s) => s.phase);
  const [showControls, setShowControls] = useState(false);
  const [isIntro, setIsIntro] = useState(mode === 'arcade' && !introPlayed);
  // captured once at mount: the store flag flips immediately after (StrictMode-safe)
  const [introFade] = useState(mode === 'arcade' && !introPlayed);
  const [, force] = useState(0);
  const cinematic = phase === 'intro' || phase === 'ko' || phase === 'match_end';

  const engine = useMemo(() => new GameEngine({
    mode,
    p1Char: p1Char as CharId,
    p2Char: p2Char as CharId,
    difficulty,
    seed: mode === 'net' ? netSession.mySeed : undefined,
    playIntro: introFade,
  }), [mode, p1Char, p2Char, difficulty, introFade]);

  const net = useMemo(() => (mode === 'net' ? new NetDriver(engine) : null), [mode, engine]);
  useEffect(() => {
    if (!net) return;
    net.onRematch = () => {
      engine.restartMatch();
      vfx.clear();
      cameraDirector.reset(engine.match);
    };
    return () => { net.onRematch = null; };
  }, [net, engine]);

  useEffect(() => {
    if (mode === 'arcade' && !introPlayed) useMatchStore.setState({ introPlayed: true });
  }, [mode, introPlayed]);

  // leaving a network match notifies the peer (bye) and closes the socket
  useEffect(() => {
    if (mode !== 'net') return;
    return () => { netSession.disconnect(); };
  }, [mode]);

  // intro state tracking + key handling
  useEffect(() => {
    const off = bus.on((e) => {
      if (e.type === 'matchEnd') force((n) => n + 1);
    });
    const onKey = (e: KeyboardEvent) => {
      const phase = engine.match.phase;
      if (phase === 'intro') {
        if (['Enter', 'Space', 'Escape', 'KeyJ'].includes(e.code)) {
          engine.skipIntro();
          setIsIntro(false);
        }
        e.preventDefault();
        return;
      }
      if (e.code === 'Escape') {
        if (showResults) return;
        if (mode === 'net') return; // no pausing network matches
        engine.setPaused(phase !== 'paused');
        audio.play('ui');
      }
      if (e.code === 'F1') {
        e.preventDefault();
        useSettings.getState().set({ showHitboxes: !useSettings.getState().showHitboxes });
      }
    };
    const onClick = () => {
      if (engine.match.phase === 'intro') {
        engine.skipIntro();
        setIsIntro(false);
      }
    };
    const onVis = () => {
      if (document.hidden && mode !== 'net') {
        const ph = engine.match.phase;
        if (ph === 'fight' || ph === 'training' || ph === 'round_intro') engine.setPaused(true);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onClick);
    document.addEventListener('visibilitychange', onVis);
    const iv = window.setInterval(() => {
      const inIntro = engine.match.phase === 'intro';
      setIsIntro((prev) => (prev === inIntro ? prev : inIntro));
    }, 250);
    return () => {
      off();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onClick);
      document.removeEventListener('visibilitychange', onVis);
      window.clearInterval(iv);
    };
  }, [engine, showResults]);

  const restart = () => {
    if (net) netSession.send({ t: 'rematch' });
    engine.restartMatch();
    vfx.clear();
    cameraDirector.reset(engine.match);
  };

  const boxes = hitboxesSetting || (mode === 'training' && engine.match.training.showHitboxes);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Canvas
        shadows={quality !== 'low'}
        dpr={[1, GRAPHICS_PRESETS[quality].dpr]}
        gl={{ antialias: quality === 'low', powerPreference: 'high-performance' }}
        camera={{ fov: 42, near: 0.1, far: 140, position: [0, 1.6, 6.2] }}
        onCreated={({ gl }) => {
          THREE.ColorManagement.enabled = true;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = useSettings.getState().exposure;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
        }}
      >
        <Experience engine={engine} showBoxes={boxes} stageId={stageId} net={net} />
      </Canvas>

      <div className={`ui-layer ${colorblind ? 'cb-bars' : ''}`} style={{ zoom: uiScale }}>
        <HUD
          p1Name={CHARACTERS[p1Char].name}
          p2Name={CHARACTERS[p2Char].name}
          p1Char={p1Char}
          p2Char={p2Char}
        />
        <PerfOverlay />
      </div>
      <Announcer />
      {mode === 'arcade' && introFade && <div className="intro-fade" />}
      <div className="scanlines" />
      <div className={cinematic ? 'letterbox-on' : ''} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4 }}>
        <div className="letterbar top" />
        <div className="letterbar bottom" />
      </div>
      {isIntro && <div className="skip-hint">PRESS ENTER / CLICK TO SKIP INTRO</div>}

      {mode === 'training' && !paused && !showResults && (
        <TrainingBar engineRef={engine} />
      )}

      <TouchControls />

      {mode === 'net' && <NetOverlay net={net} />}
      {paused && mode !== 'net' && (
        <PauseMenu
          onResume={() => engine.setPaused(false)}
          onRestart={() => { engine.setPaused(false); restart(); }}
          onQuit={() => { engine.setPaused(false); gotoMenu(); }}
        />
      )}
      {showControls && (
        <div className="overlay-root" onClick={() => setShowControls(false)}>
          <ControlsGuide onClose={() => setShowControls(false)} />
        </div>
      )}
      {showResults && (
        <ResultsScreen
          engine={engine}
          onRematch={restart}
          onChars={() => gotoSelect(mode)}
          onMenu={gotoMenu}
        />
      )}
      {!paused && !showResults && (
        <button
          onClick={() => setShowControls(true)}
          title="Controls (in pause menu too)"
          style={{
            position: 'absolute', right: 14, bottom: 12, zIndex: 6,
            background: 'rgba(8,12,24,0.55)', color: '#8fb4d8', border: '1px solid rgba(120,200,255,0.3)',
            fontSize: 10, letterSpacing: 2, padding: '6px 10px', cursor: 'pointer',
          }}
        >
          [H] CONTROLS
        </button>
      )}
      <HKey onControls={() => setShowControls((v) => !v)} />
      <GamepadIndicator />
      <GamepadVibrationListener />
      <GamepadDebug />
    </div>
  );
}

function NetOverlay({ net }: { net: NetDriver | null }) {
  const [, force] = useState(0);
  useEffect(() => netSession.subscribe(() => force((n) => n + 1)), []);
  const gone = netSession.status === 'peer-left' || netSession.status === 'idle' || netSession.status === 'error';
  const gotoMenu = useMatchStore((s) => s.gotoMenu);
  return (
    <>
      <div style={{
        position: 'absolute', top: 96, left: '50%', transform: 'translateX(-50%)', zIndex: 6,
        fontFamily: 'var(--nf-display)', fontSize: 11, letterSpacing: 4,
        color: net?.lagging ? '#ffd24d' : '#7dffb2', textShadow: '0 0 10px rgba(0,0,0,0.9)',
      }}>
        {net?.lagging ? '⟳ SYNCING…' : '● NETPLAY — ' + (netSession.role === 'host' ? 'HOST (P1)' : 'GUEST (P2)')}
      </div>
      {gone && (
        <div className="overlay-root">
          <div className="overlay-col">
            <div className="overlay-title" style={{ fontSize: 30 }}>OPPONENT DISCONNECTED</div>
            <button className="nf-btn" onClick={() => { audio.play('ui'); netSession.disconnect(); gotoMenu(); }}>
              Back to Menu
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function HKey({ onControls }: { onControls: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.code === 'KeyH') onControls();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onControls]);
  return null;
}

function TrainingBar({ engineRef }: { engineRef: GameEngine }) {
  const [, force] = useState(0);
  const t = engineRef.match.training;
  const toggle = (fn: () => void) => () => { fn(); audio.play('ui'); force((n) => n + 1); };
  return (
    <div className="training-bar">
      <button className={`seg-btn ${t.dummy === 'idle' ? 'on' : ''}`}
        onClick={toggle(() => { t.dummy = 'idle'; })}>DUMMY: IDLE</button>
      <button className={`seg-btn ${t.dummy === 'block' ? 'on' : ''}`}
        onClick={toggle(() => { t.dummy = 'block'; })}>DUMMY: BLOCK</button>
      <button className={`seg-btn ${t.dummy === 'random' ? 'on' : ''}`}
        onClick={toggle(() => { t.dummy = 'random'; })}>DUMMY: CPU</button>
      <button className={`seg-btn ${t.infiniteHealth ? 'on' : ''}`}
        onClick={toggle(() => { t.infiniteHealth = !t.infiniteHealth; })}>INFINITE HEALTH</button>
      <button className={`seg-btn ${t.showHitboxes ? 'on' : ''}`}
        onClick={toggle(() => { t.showHitboxes = !t.showHitboxes; })}>HITBOXES [F1]</button>
    </div>
  );
}
