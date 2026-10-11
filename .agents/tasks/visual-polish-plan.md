# Implementation Plan: Ground, Landing & Arena Visual Polish

## Overview
Fix ground contact, landing VFX, contact shadows, road markings, and lighting for Neon Fury fighting game. All changes are rendering/VFX only — the deterministic 60 Hz combat sim is preserved.

## Feature Breakdown

### FEAT-001: Water Splash VFX on Landing
**Files:** `src/vfx/vfxManager.ts`, `src/game/GameEngine.ts`, `src/vfx/VFXLayer.tsx`, `src/game/types.ts`

**Changes:**
1. **vfxManager.ts** (~line 220, after `spawnBurst`):
   ```typescript
   spawnWaterSplash(x: number, y: number, power = 1): void {
     const n = Math.round(14 * power);
     for (let i = 0; i < n; i++) {
       const a = Math.random() * Math.PI * 2;
       const el = (Math.random() - 0.2) * Math.PI * 0.5;
       const sp = (2.0 + Math.random() * 3.5) * power;
       this.spawn(x, y, 0, Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp + 1.8, 
         Math.sin(a) * Math.cos(el) * sp * 0.3,
         0.3 + Math.random() * 0.35, 0.04 + Math.random() * 0.06 * power, 
         '#8fb8c8', -8, 1.5, 0);
     }
     this.spawnRing(x, y, 0.03, '#9fc8e8', 0.15, 1.2 * power, 0.3, false);
   }
   ```

2. **GameEngine.ts** (line ~1128, inside `else if (impactVy >= K.LAND_IMPACT_MEDIUM)` block):
   ```typescript
   bus.emit({ type: 'vfx', kind: 'splash', x: f.x, y: 0, power: impactVy / 9 });
   ```

3. **VFXLayer.tsx** (line ~180, add case in vfx event switch):
   ```typescript
   case 'splash':
     vfx.spawnWaterSplash(e.x, e.y, e.power ?? 1);
     break;
   ```

4. **types.ts**: Add `'splash'` to the vfx `kind` union type if not present.

**Verify:** `npm run build && npm run test` — Jump repeatedly, observe water splash on landing.

---

### FEAT-002: Contact Shadow Blobs
**Files:** `src/fighters/FighterView.tsx`

**Changes:**
1. Add ContactShadowBlob component (insert after imports, before FighterView):
   ```typescript
   function ContactShadowBlob({ fighter }: { fighter: FighterRuntime }) {
     const ref = useRef<THREE.Mesh>(null);
     useFrame(() => {
       const m = ref.current;
       if (!m) return;
       const mat = m.material as THREE.MeshBasicMaterial;
       mat.opacity = THREE.MathUtils.clamp(fighter.y / 2.5, 0, 0.6);
     });
     return (
       <mesh ref={ref} position={[fighter.x, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
         <circleGeometry args={[0.5, 24]} />
         <meshBasicMaterial color="#000000" transparent depthWrite={false} />
       </mesh>
     );
   }
   ```

2. Modify FighterView return (line ~24):
   ```typescript
   return (
     <>
       {asset ? <ModelFighter ... /> : fallback}
       <ContactShadowBlob fighter={runtime} />
     </>
   );
   ```

**Verify:** `npm run build && npm run test` — Shadow blobs visible under both fighters, fade during jumps.

---

### FEAT-003: Detailed Road Markings
**Files:** `src/arenas/CityStage.tsx`

**Changes:**
In Ground component function, after existing lane divider mapping (~line 290), add:

1. **Yellow center line** (dashed):
   ```tsx
   {/* Center line (yellow dashes) */}
   {Array.from({ length: 12 }, (_, i) => (
     <mesh key={`center-${i}`} rotation={[-Math.PI / 2, 0, 0]} 
           position={[-10 + i * 1.6 + 0.4, 0.006, 0]}>
       <planeGeometry args={[0.8, 0.12]} />
       <meshBasicMaterial color="#f4d03f" transparent opacity={0.35} toneMapped={false} />
     </mesh>
   ))}
   ```

2. **Crosswalk** (white stripes):
   ```tsx
   {/* Crosswalk */}
   {Array.from({ length: 8 }, (_, i) => (
     <mesh key={`cross-${i}`} rotation={[-Math.PI / 2, 0, 0]} 
           position={[0, 0.007, 0.0 + i * 0.45]}>
       <planeGeometry args={[0.35, 3.2]} />
       <meshBasicMaterial color="#ffffff" transparent opacity={0.22} toneMapped={false} />
     </mesh>
   ))}
   ```

**Verify:** `npm run build && npm run test` — Yellow center line and white crosswalk visible, no z-fighting.

---

### FEAT-004: Arena Directional Light Shadow Casting
**Files:** `src/arenas/CityStage.tsx`

**Changes:**
Line ~350, change directionalLight:
```tsx
castShadow={quality !== 'low'}
```
(Replace `castShadow={false}`)

**Verify:** `npm run build && npm run test` — Fighters cast shadows on medium/high quality.

---

## Verification Commands
```bash
npm run build        # TypeScript + Vite bundle
npm run test         # vitest suite (combat/abilities/netplay/UI)
npm run dev          # Visual confirmation
```

## Dependencies
- FEAT-001, FEAT-002, FEAT-003, FEAT-004 are independent and can be implemented in any order.
- All preserve deterministic 60 Hz combat sim.
- All are rendering/VFX only.

## Notes
- STAGE_FLOOR_Y = 0 (constants.ts)
- Fighter position: f.x, f.y, 0 where f.y=0 is ground contact
- Ground plane: Y=0, rotation [-PI/2, 0, 0]
- Existing systems: dust VFX on landing, burst VFX on heavy landing, contact shadows from FighterLights
