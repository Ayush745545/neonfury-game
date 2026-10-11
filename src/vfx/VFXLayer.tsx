import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { vfx, MAX_PARTICLES, MAX_RINGS, MAX_ARCS, MAX_SLASHES, MAX_FLAMES } from './vfxManager';
import { POWER_PROFILES } from './powerProfiles';
import { LIGHTNING_VERTICES_PER_ARC, writeLightningRibbon } from './lightningRibbon';
import { bus } from '../game/eventBus';
import type { GameEvent, MatchRuntime } from '../game/types';
import { useSettings } from '../config/settings';

/* ------------------------------------------------------------------ */
/*  Renders the pooled VFX: GPU points (additive), instanced rings,   */
/*  jagged lightning arcs. Also translates bus events into spawns.    */
/* ------------------------------------------------------------------ */

function makeSpriteTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

export function VFXLayer({ match }: { match?: MatchRuntime } = {}) {
  const quality = useSettings((s) => s.quality);
  const reduceFlashes = useSettings((s) => s.reduceFlashes);
  const pointsRef = useRef<THREE.Points>(null);
  const ringHRef = useRef<THREE.InstancedMesh>(null);
  const ringVRef = useRef<THREE.InstancedMesh>(null);
  const flameRef = useRef<THREE.InstancedMesh>(null);
  const fireLight = useRef<THREE.PointLight>(null);
  const stormLight = useRef<THREE.PointLight>(null);
  const effectTime = useRef(0);

  const sprite = useMemo(makeSpriteTexture, []);

  const buffers = useMemo(() => {
    const pos = new Float32Array(MAX_PARTICLES * 3);
    const col = new Float32Array(MAX_PARTICLES * 3);
    const size = new Float32Array(MAX_PARTICLES);
    const alpha = new Float32Array(MAX_PARTICLES);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    geo.setDrawRange(0, 0);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 60);
    return { geo, pos, col, size, alpha };
  }, []);

  const particleMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTex: { value: sprite } },
    vertexShader: /* glsl */`
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aAlpha;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = aColor;
        vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (420.0 / max(0.1, -mv.z));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uTex;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec4 t = texture2D(uTex, gl_PointCoord);
        gl_FragColor = vec4(vColor, t.a * vAlpha);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [sprite]);

  const slashRef = useRef<THREE.InstancedMesh>(null);

  const arcGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const verts = MAX_ARCS * LIGHTNING_VERTICES_PER_ARC;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(verts * 2), 2));
    g.setDrawRange(0, 0);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 60);
    return g;
  }, []);

  const flameGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1);
    g.setAttribute('aLife', new THREE.InstancedBufferAttribute(new Float32Array(MAX_FLAMES), 1));
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(MAX_FLAMES), 1));
    return g;
  }, []);
  const arcBuffers = useMemo(() => ({
    position: arcGeo.attributes.position.array as Float32Array,
    color: arcGeo.attributes.color.array as Float32Array,
    uv: arcGeo.attributes.uv.array as Float32Array,
  }), [arcGeo]);

  const flameMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uBrightness: { value: 1 } },
    vertexShader: /* glsl */`
      attribute float aLife;
      attribute float aSeed;
      varying vec2 vUv;
      varying float vLife;
      varying float vSeed;
      void main() {
        vUv = uv; vLife = aLife; vSeed = aSeed;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform float uBrightness;
      varying vec2 vUv;
      varying float vLife;
      varying float vSeed;
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453);
        float b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
        float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
        float d = fract(sin(dot(i + vec2(1.0), vec2(127.1, 311.7))) * 43758.5453);
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      void main() {
        vec2 uv = vUv;
        float flow = uTime * 4.0 + vSeed;
        float turbulence = noise(vec2(uv.x * 5.0 + vSeed, uv.y * 7.0 - flow));
        turbulence += noise(vec2(uv.x * 11.0, uv.y * 14.0 - flow * 1.6)) * 0.3;
        float center = 0.5 + sin(uv.y * 6.0 - flow) * uv.y * 0.08;
        float taper = max(0.018, (1.0 - uv.y) * 0.42);
        float shape = 1.0 - abs(uv.x - center) / taper;
        float edge = smoothstep(0.05, 0.4, shape + (turbulence - 0.6) * uv.y * 0.75);
        float base = smoothstep(0.0, 0.09, uv.y);
        float life = smoothstep(0.0, 0.2, vLife) * min(1.0, (1.0 - vLife) * 9.0 + 0.2);
        float heat = clamp(shape * 0.8 + (1.0 - uv.y) * 0.6, 0.0, 1.0);
        vec3 color = mix(vec3(1.4, 0.06, 0.005), vec3(3.4, 0.9, 0.05), heat);
        color = mix(color, vec3(4.0, 2.8, 0.8), pow(heat, 5.0));
        gl_FragColor = vec4(color * uBrightness, edge * base * life * 0.65);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide, toneMapped: false,
  }), []);

  const arcMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: /* glsl */`
      attribute vec3 color;
      varying vec2 vUv;
      varying vec3 vColor;
      void main() {
        vUv = uv; vColor = color;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vColor;
      void main() {
        float center = 1.0 - abs(vUv.y * 2.0 - 1.0);
        float core = pow(center, 12.0);
        vec3 hot = vec3(max(vColor.r, max(vColor.g, vColor.b)));
        gl_FragColor = vec4(vColor * 1.5 + hot * core * 3.0, pow(center, 1.4));
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide, toneMapped: false,
  }), []);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colorObj = useMemo(() => new THREE.Color(), []);

  useEffect(() => () => {
    buffers.geo.dispose();
    particleMat.dispose();
    arcGeo.dispose();
    arcMat.dispose();
    flameGeo.dispose();
    flameMat.dispose();
    sprite.dispose();
  }, [buffers, particleMat, arcGeo, arcMat, flameGeo, flameMat, sprite]);

  // events → spawns
  useEffect(() => {
    const off = bus.on((e: GameEvent) => {
      if (e.type === 'hit') {
        const power = Math.min(2.2, 0.6 + e.power / 90);
        const dir = vfx.getFighter(e.attacker)?.facing ?? (e.attacker === 0 ? 1 : -1);
        const prof = e.char ? POWER_PROFILES[e.char] : null;
        if (e.blocked) {
          if (prof) prof.block(e.x, e.y, dir);
          vfx.spawnRing(e.x, e.y, (e.z ?? 0) + 0.1, '#9fd8ff', 0.1, 0.55 * power, 0.16, true, 0); // shield flash (all fighters)
        } else {
          if (prof) prof.hit(e.x, e.y, dir, e.counter ? '#ffffff' : e.color, power);
          else vfx.spawnSparks(e.x, e.y, e.z ?? 0.1, dir, e.counter ? '#ffffff' : e.color, Math.round(12 * power), power);
          if (e.effect === 'heavy' || e.counter) {
            vfx.spawnRing(e.x, e.y, 0.05, e.color, 0.15, 1.5 * power, 0.3, true, 0);
          }
          if (e.effect === 'launch' || e.effect === 'knockdown') {
            vfx.spawnRing(e.x, 0.05, e.z ?? 0, e.color, 0.2, 2.4, 0.42, false);
            vfx.spawnSmoke(e.x, e.y * 0.5, 0, '#8fa3b8', 5, 0.8);
          }
          if (e.counter) vfx.spawnBurst(e.x, e.y, '#ffffff', 0.7);
        }
      } else if (e.type === 'superStart') {
        const fighter = vfx.getFighter(e.attacker);
        if (fighter) POWER_PROFILES[fighter.char].activate(e.x, e.y + 0.4, fighter.facing, e.color);
        vfx.spawnCharge(e.x, e.y + 1.1, e.color, 0.9);
        vfx.spawnRing(e.x, 0.05, 0, e.color, 0.3, 5.5, 0.7, false);
        vfx.spawnBurst(e.x, e.y + 1.1, e.color, 1.6);
        vfx.startTrail(e.attacker, 'handR', e.color, 1.6);
        vfx.startTrail(e.attacker, 'handL', e.color, 1.6);
      } else if (e.type === 'vfx') {
        switch (e.kind) {
          case 'dust':
            vfx.spawnDust(e.x, e.y, e.color ?? '#9fb4c8', e.power ?? 1);
            break;
          case 'charge':
            vfx.spawnCharge(e.x, e.y, e.color ?? '#ff2244', 0.55);
            break;
          case 'burst': {
            vfx.spawnBurst(e.x, e.y, e.color ?? '#ff3355', e.power ?? 1.2);
            const prof = e.char ? POWER_PROFILES[e.char] : null;
            if (prof) prof.activate(e.x, e.y, e.dir ?? 1, e.color ?? '#ff3355');
            break;
          }
          case 'trail':
            if (e.attacker !== undefined) vfx.startTrail(e.attacker, 'handR', e.color ?? '#ff2244', 0.5);
            break;
          case 'shockwave':
            vfx.spawnRing(e.x, e.y, 0.05, e.color ?? '#ff3355', 0.2, 2.6, 0.4, true, 0);
            vfx.spawnRing(e.x, 0.05, 0, e.color ?? '#ff3355', 0.3, 3.2, 0.5, false);
            vfx.spawnSmoke(e.x, 0.2, 0, '#7c8ea0', 6, 1.1);
            break;
          case 'superFlash':
            vfx.spawnBurst(e.x, e.y + 1, e.color ?? '#fff', 2.2);
            break;
          case 'whiff':
            vfx.spawnSparks(e.x, e.y, 0, e.dir ?? 1, '#8fa3b8', 3, 0.4 * (e.power ?? 1));
            break;
          case 'abilityStart': {
            const prof = e.char ? POWER_PROFILES[e.char] : null;
            if (prof) prof.activate(e.x, e.y, vfx.getFighter(e.attacker ?? 0)?.facing ?? e.dir ?? 1, e.color ?? '#ffffff');
            vfx.spawnCharge(e.x, e.y, e.color ?? '#ffffff', 0.6);
            vfx.spawnRing(e.x, 0.06, 0, e.color ?? '#ffffff', 0.2, 2.8, 0.5, false);
            vfx.spawnBurst(e.x, e.y, e.color ?? '#ffffff', 1.1);
            break;
          }
          case 'abilityEnd':
            vfx.spawnRing(e.x, e.y, 0.05, e.color ?? '#ffffff', 0.6, 0.05, 0.3, true, 0);
            break;
          case 'heal': {
            const c = e.color ?? '#7dffb2';
            for (let i = 0; i < 14; i++) {
              vfx.spawnSparks(e.x + (Math.random() - 0.5) * 0.7, e.y - 0.8 + Math.random() * 0.3, 0, 0, c, 1, 0.5);
            }
            vfx.spawnRing(e.x, e.y - 0.2, 0.05, c, 0.3, 1.4, 0.6, true, 0);
            break;
          }
          case 'gravity':
            vfx.spawnCharge(e.x, e.y, e.color ?? '#8fb8ff', 0.5);
            vfx.spawnRing(e.x, e.y, 0.05, e.color ?? '#8fb8ff', 2.4, 0.3, 0.45, true, 0);
            break;
          case 'electric':
            vfx.spawnElectric(e.x, e.y, e.color ?? '#44bbff', 6);
            break;
          case 'splash':
            vfx.spawnWaterSplash(e.x, e.y, e.power ?? 1);
            break;
          default: break;
        }
      }
    });
    return off;
  }, []);

  useFrame((state, dt) => {
    const frozen = match?.phase === 'paused';
    const hitstop = match && match.fighters.every((f) => f.hitstop > 0);
    const d = frozen ? 0 : Math.min(dt, 0.05) * (match?.timeScale ?? 1) * (hitstop ? 0.18 : 1);
    effectTime.current += d;
    vfx.update(d);
    const brightness = reduceFlashes ? 0.42 : 1;

    // pack particles
    let n = 0;
    const { pos, col, size, alpha } = buffers;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = vfx.particles[i];
      if (!p.active) continue;
      const t = p.life / p.maxLife;
      pos[n * 3] = p.x; pos[n * 3 + 1] = p.y; pos[n * 3 + 2] = p.z;
      col[n * 3] = p.r * brightness; col[n * 3 + 1] = p.g * brightness; col[n * 3 + 2] = p.b * brightness;
      size[n] = p.size * (p.kind === 1 ? (1.6 - t * 0.6) : t * 0.9 + 0.1);
      alpha[n] = p.kind === 1 ? Math.min(0.35, t * 0.5) : Math.min(1, t * 1.6);
      n++;
      if (n >= (quality === 'low' ? 300 : quality === 'medium' ? 700 : MAX_PARTICLES)) break;
    }
    buffers.geo.setDrawRange(0, n);
    (buffers.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (buffers.geo.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (buffers.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (buffers.geo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;

    // rings
    let hCount = 0;
    let vCount = 0;
    const ringH = ringHRef.current;
    const ringV = ringVRef.current;
    for (let i = 0; i < MAX_RINGS; i++) {
      const r = vfx.rings[i];
      if (!r.active) continue;
      const t = 1 - r.life / r.maxLife;
      const s = r.size0 + (r.size1 - r.size0) * (1 - (1 - t) * (1 - t)); // ease-out expand
      const fade = Math.pow(1 - t, 1.6);
      dummy.position.set(r.x, r.vertical ? r.y : 0.03 + t * 0.02, r.vertical ? (r.z ?? 0.08) : r.z);
      dummy.rotation.set(r.vertical ? 0 : -Math.PI / 2, r.vertical ? r.rotY : 0, 0);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      colorObj.setRGB(r.r * fade * 1.6 * brightness, r.g * fade * 1.6 * brightness, r.b * fade * 1.6 * brightness);
      if (r.vertical) {
        ringV!.setMatrixAt(vCount, dummy.matrix);
        ringV!.setColorAt(vCount, colorObj);
        vCount++;
      } else {
        ringH!.setMatrixAt(hCount, dummy.matrix);
        ringH!.setColorAt(hCount, colorObj);
        hCount++;
      }
    }
    if (ringH) { ringH.count = hCount; ringH.instanceMatrix.needsUpdate = true; if (ringH.instanceColor) ringH.instanceColor.needsUpdate = true; }
    if (ringV) { ringV.count = vCount; ringV.instanceMatrix.needsUpdate = true; if (ringV.instanceColor) ringV.instanceColor.needsUpdate = true; }

    // slash crescents
    const slashM = slashRef.current;
    if (slashM) {
      let sn = 0;
      for (let i = 0; i < MAX_SLASHES; i++) {
        const sl = vfx.slashes[i];
        if (!sl.active) continue;
        const t = 1 - sl.life / sl.maxLife;
        const size = sl.size0 + (sl.size1 - sl.size0) * (1 - (1 - t) * (1 - t));
        const fade = Math.pow(1 - t, 1.4);
        dummy.position.set(sl.x, sl.y, sl.z);
        dummy.rotation.set(0, 0, sl.rot + t * 0.25);
        dummy.scale.set(size, size, sl.thick);
        dummy.updateMatrix();
        slashM.setMatrixAt(sn, dummy.matrix);
        colorObj.setRGB(sl.r * fade * 1.8 * brightness, sl.g * fade * 1.8 * brightness, sl.b * fade * 1.8 * brightness);
        slashM.setColorAt(sn, colorObj);
        sn++;
      }
      slashM.count = sn;
      slashM.instanceMatrix.needsUpdate = true;
      if (slashM.instanceColor) slashM.instanceColor.needsUpdate = true;
    }

    // Broad glow and white-hot cores share one ribbon draw call; forks on high.
    const arcPos = arcGeo.attributes.position as THREE.BufferAttribute;
    const arcCol = arcGeo.attributes.color as THREE.BufferAttribute;
    const arcUv = arcGeo.attributes.uv as THREE.BufferAttribute;
    let v = 0;
    let arcCount = 0;
    let stormEnergy = 0;
    const tick = Math.floor(effectTime.current * (reduceFlashes ? 10 : 28));
    for (let i = 0; i < MAX_ARCS; i++) {
      const a = vfx.arcs[i];
      if (!a.active) continue;
      v = writeLightningRibbon(a, tick, state.camera.position, arcBuffers, v, quality === 'high', brightness);
      const energy = (a.life / a.maxLife) * Math.hypot(a.x2 - a.x1, a.y2 - a.y1);
      if (energy > stormEnergy && stormLight.current) {
        stormEnergy = energy;
        stormLight.current.position.set((a.x1 + a.x2) / 2, (a.y1 + a.y2) / 2, 0.55);
        stormLight.current.color.setRGB(a.r, a.g, a.b);
      }
      if (++arcCount >= (quality === 'low' ? 8 : quality === 'medium' ? 16 : MAX_ARCS)) break;
    }
    arcGeo.setDrawRange(0, v);
    arcPos.needsUpdate = true;
    arcCol.needsUpdate = true;
    arcUv.needsUpdate = true;
    if (stormLight.current) stormLight.current.intensity = Math.min(7, stormEnergy * 4) * brightness;

    let fn = 0;
    let fireEnergy = 0;
    const lifeAttr = flameGeo.attributes.aLife as THREE.InstancedBufferAttribute;
    const seedAttr = flameGeo.attributes.aSeed as THREE.InstancedBufferAttribute;
    if (flameRef.current) {
      for (const f of vfx.flames) {
        if (!f.active) continue;
        const life = f.life / f.maxLife;
        const swell = 0.7 + (1 - life) * 0.6;
        dummy.position.set(f.x, f.y + f.height * 0.28, f.z);
        dummy.quaternion.copy(state.camera.quaternion);
        dummy.rotateZ(-f.dir * 0.24);
        dummy.scale.set(f.width * swell, f.height * swell, 1);
        dummy.updateMatrix();
        flameRef.current.setMatrixAt(fn, dummy.matrix);
        lifeAttr.setX(fn, life); seedAttr.setX(fn, f.seed);
        const energy = life * f.width * f.height;
        if (energy > fireEnergy && fireLight.current) {
          fireEnergy = energy;
          fireLight.current.position.set(f.x, f.y + 0.3, 0.5);
        }
        if (++fn >= (quality === 'low' ? 10 : quality === 'medium' ? 22 : MAX_FLAMES)) break;
      }
      flameRef.current.count = fn;
      flameRef.current.instanceMatrix.needsUpdate = true;
      lifeAttr.needsUpdate = true; seedAttr.needsUpdate = true;
    }
    flameMat.uniforms.uTime.value = effectTime.current;
    flameMat.uniforms.uBrightness.value = brightness;
    if (fireLight.current) fireLight.current.intensity = Math.min(9, fireEnergy * 9) * brightness;
  });

  return (
    <group>
      <points ref={pointsRef} geometry={buffers.geo} material={particleMat} frustumCulled={false} />
      <instancedMesh ref={ringHRef} args={[undefined, undefined, MAX_RINGS]} frustumCulled={false}>
        <ringGeometry args={[0.86, 1, 40]} />
        <meshBasicMaterial transparent blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={ringVRef} args={[undefined, undefined, MAX_RINGS]} frustumCulled={false}>
        <ringGeometry args={[0.8, 1, 40]} />
        <meshBasicMaterial transparent blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </instancedMesh>
      <mesh geometry={arcGeo} material={arcMat} frustumCulled={false} />
      <instancedMesh ref={flameRef} args={[flameGeo, flameMat, MAX_FLAMES]} frustumCulled={false} />
      {quality !== 'low' && <pointLight ref={fireLight} color="#ff6b22" intensity={0} distance={5} decay={2} />}
      {quality === 'high' && <pointLight ref={stormLight} color="#ffe14d" intensity={0} distance={5} decay={2} />}
      <instancedMesh ref={slashRef} args={[undefined, undefined, MAX_SLASHES]} frustumCulled={false}>
        <torusGeometry args={[1, 0.05, 4, 22, 2.5]} />
        <meshBasicMaterial transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
      </instancedMesh>
    </group>
  );
}
