# Assets

NEON FURY ships **zero external binary assets** by design:

- **Characters** are procedurally rigged and built from primitives (`src/fighters/rig.ts`).
- **Arena textures** (windows, neon signs, holograms, asphalt, banners, steam puffs)
  are generated at runtime into canvas textures (`src/arenas/textures.ts`).
- **Audio** is fully synthesized with the Web Audio API (`src/audio/audioEngine.ts`).
- **Portraits / logo** are inline SVG (`src/ui/Portrait.tsx`, `src/ui/MainMenu.tsx`).

This keeps the project dependency-free of asset licensing and guarantees nothing
can be "missing" at runtime. If you want to swap in GLTF fighters later, replace
`buildFighterRig` with a `useGLTF` loader and map the bone names to the
`JointName` list in `src/animations/types.ts` — the animation system drives any
Object3D hierarchy with those names.
