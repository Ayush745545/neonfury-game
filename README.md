# NEON FURY — Cinematic 3D Fighting Game

An original, fully playable browser-based 3D fighting game built with **React 19 + TypeScript + Vite + Three.js (React Three Fiber)**.

**15 unique fighters · 15 city locations · a unique ability per fighter on a 15-second cooldown · deterministic 60 Hz frame-data combat · same-WiFi network multiplayer · cinematic camera director · procedural VFX & audio.** No external assets, no paid services.

> **Status: complete, working, testable.** 72 automated tests cover combat rules, all 15 movesets, abilities, projectiles, full AI-vs-AI matches, **lockstep netplay determinism**, round/KO flow, animation sampling, VFX pools, the UI tree and headless 3D scene rendering. The lobby server is smoke-tested over real WebSockets.

---

## Quick start

```bash
cd neon-fury
npm install
npm run dev          # → http://localhost:5173
```

Verification commands:

```bash
npm run build        # tsc + vite production bundle
npm run test         # vitest — combat / abilities / netplay / integration / UI / scene
npm run typecheck
npm run lint
```

Desktop Chrome/Edge/Firefox with a WebGL2 GPU is the target. Use **Settings → Graphics Quality** (High/Medium/Low) to scale reflections, AA and particle counts.

---

## 🕹 Multiplayer

The combat sim is **deterministic lockstep**: only compact 15-bit input masks cross the wire, both peers simulate identically, with checksum verification and host-authoritative snapshot resync as a safety net.

**Online (deployed site):** open the Vercel URL on both machines (same WiFi or anywhere). One player picks **HOST GAME**, the other **JOIN GAME** with the same room code — the lobby relay (`api/lobby.mjs`, a Vercel WebSocket Function at `wss://<site>/api/lobby`) pairs the two browsers. If the two connections land on different relay instances, the lobby re-dials automatically until they pair. Note: Vercel recycles WebSocket connections at the function's max duration (5 min on the free tier); long matches re-pair back to fighter select and restart cleanly.

**Same-WiFi LAN:**

**Machine A (host):**
```bash
npm run build     # once, produces dist/
npm run host      # serves the game AND the lobby WebSocket on port 4173
```
The terminal prints: `Game + lobby: http://<your-lan-ip>:4173`

**Machine B (friend, same WiFi):** open that URL in a browser.

**In-game:** Main menu → **NETWORK MULTIPLAYER**
- Host: pick **HOST GAME**, choose a room code, CONNECT AS HOST → pick fighter → pick stage.
- Guest: pick **JOIN GAME**, enter the host address (pre-filled when served by `npm run host`) and the same room code → pick fighter.
- Host = Player 1, Guest = Player 2. Rematch is synchronized; leaving notifies the peer.

`npm run host` needs no configuration; set `PORT=xxxx` to change the port. It serves `dist/` statically and relays the lobby over `/lobby` on the same port (no signaling service, no internet needed).

---

## Controls

### Player 1
| Action | Key | | Action | Key |
|---|---|---|---|---|
| Move | `A` / `D` | | Light kick | `U` |
| Jump | `W` | | Heavy kick | `I` |
| Crouch | `S` | | Block (hold) | `L` |
| Light punch | `J` | | Special (25 meter) | `O` |
| Heavy punch | `K` | | Super (full meter) | `SPACE` |
| **Unique ability (15s cd)** | **`P`** | | Dash fwd/back | double-tap `D`/`A` |

### Player 2 (NumLock ON)
Arrows move/jump/crouch · `Num 1/2/4/5` = LP/HP/LK/HK · `Num 0` block · `Num Enter` special · `Num 3` super · **`Num 6` ability**

All bindings rebindable in **Settings**. `ESC`/`P` pause, `F1` hitbox display, `H` controls guide. Touch devices get an on-screen pad with an `AB` (ability) button.

### Rules implemented
Startup/active/recovery frames · high/mid/low block matrix (lows beat standing guard, overheads crush crouch guard) · hitstop · counter hits (+30%) · chain cancels into specials/supers · combo scaling · input buffering · chip damage (never lethal) · knockdowns/launches/wakeup invulnerability · projectiles (blockable, mutually canceling) · 99s rounds, best-of-three, double K.O., time-up judge.

---

## 👊 The 15 fighters — each with a UNIQUE ABILITY (15-second cooldown)

| Fighter | Archetype | Special (O) | Unique Ability (P, 15s) |
|---|---|---|---|
| **RYDEN** — The Crimson Dragon | Brawler | Crimson Dragon Strike (dash) | **DRAGON'S WRATH** — +40% damage, 5s |
| **KAITO** — The Thunder Ghost | Quick | Thunder Breaker (3-kick flurry + launcher) | **PHASE SHIFT** — blink behind the opponent |
| **VESPER** — The Toxic Bloom | Zoner | Spore Lance (projectile) | **SIPHON** — heal 14 HP per landed hit, 6s |
| **GRUUN** — The Iron Mountain | Heavy | Boulder Crush (slam) | **STONE SKIN** — armor: −60% dmg, no flinch, 3.5s |
| **YUKI** — The Frost Veil | Quick | Glacier Fang (rising uppercut) | **SLIPSTREAM** — +45% move speed, 5s |
| **EMBER** — The Ash Dancer | Brawler | Cinder Spiral (flurry) | **RIPOSTE** — 2.2s counter stance: negates a hit and auto-punishes with a knockdown |
| **VOLT** — The Storm Runner | Quick | Lightning Raid (fast dash) | **THUNDERCLAP** — point-blank AOE blast |
| **NYX** — The Shadow Fang | Zoner | Umbra Bolt (projectile) | **UMBRAL VEIL** — untouchable phantom, 1.2s |
| **ORACLE** — The Mind Reader | Brawler | Psychic Palm (uppercut) | **FORESIGHT** — instantly +35 super meter |
| **SLAB** — The Wrecking Ball | Heavy | Demolition (slam) | **SINGULARITY** — drags the opponent to you + stun |
| **SABLE** — The Silk Assassin | Quick | Silk Fang (dash) | **RENEW** — burst out of hitstun/knockdown, heal 60 (works *while stunned*) |
| **HEX** — The Glitch Wizard | Zoner | Data Spike (projectile) | **SYSTEM CRASH** — steal 25 meter + glitch-stun nearby foes |
| **SOLARA** — The Sun Saint | Brawler | Solar Lance (uppercut) | **SOLAR FLARE** — fires a 3-orb spread burst |
| **FEN** — The Wild Fang | Heavy | Savage Rush (dash) | **BERSERK** — +25% damage, +20% speed, 5s |
| **ZERO** — The Perfect Machine | Zoner | Plasma Cannon (projectile) | **OVERCLOCK** — attacks 35% faster, 4s |

Every fighter also gets a full meter **SUPER** (scripted cinematic multi-hit sequence ending in a launcher). Archetypes (Brawler/Quick/Heavy/Zoner) drive frame-data templates; per-character damage/reach/speed/defense/weight multipliers personalize all 12 normals + special + super for each of the 15 — all generated from tunable tables in `src/combat/moves.ts` and `src/fighters/characters.ts`.

Rigs are fully procedural: 4 body builds × 7 hair styles × 7 accessories (headbands, visors, scarves, capes, masks, goggles, hoods) with per-fighter palettes, neon trim that blazes during supers, and wind-driven cloth.

---

## 🌆 The 15 locations

NEON TOKYO (midnight rain) · SHIBUYA CROSSING (storm) · OSAKA MARKET (lanterns & stalls, mist) · KYOTO TEMPLE GATE (torii) · NEO SHINJUKU ROOFTOP (helipad, clear night) · DOCKSIDE FREIGHT YARD (cranes & containers, rain) · UNDERGROUND ARCADE (cabinet glow) · SKYBRIDGE EXPRESS (dusk, train streaks) · RAIN ALLEY (single red neon, storm) · CHERRY BLOSSOM PLAZA (falling petals, sakura) · INDUSTRIAL FOUNDRY (rising embers) · METRO STATION 9 (train lights) · HARBOR HIGHWAY (overpass traffic) · ELECTRIC DISTRICT (tesla coils, lightning) · DAWN SKYLINE (sunrise finale).

All are built by one data-driven `CityStage` renderer from `StageDef` configs (`src/arenas/stages.ts`): palette, fog, weather system (GPU rain/snow/embers/petals shaders), signs with CJK neon, holographic billboards, banners on wind shaders, props, crowd, traffic, lighting. Add a 16th stage by adding one config object.

---

## Architecture

```
src/
  app/         App router, GameScreen (engine + canvas + overlays + net driver lifecycle)
  game/        GameEngine (fixed 60 Hz sim: states, hitboxes, abilities, projectiles,
               rounds, stepNet lockstep entry, checksum/snapshot), input, stores, event bus
  combat/      moves.ts (ALL frame data for 15 fighters — generated + tunable), hitDetection
  fighters/    characters.ts (roster: stats/abilities/palettes), rig.ts (procedural skeletons), FighterView, ProjectileView
  animations/  animData.ts (keyframes + stance/idle/walk/super generators for 15 chars), animPlayer.ts
  camera/      CameraDirector (7 modes + 12s intro timeline)
  arenas/      stages.ts (15 configs), CityStage, Weather (GPU shaders), Props (12 prop types), textures
  vfx/         vfxManager (pooled particles/rings/arcs/trails), VFXLayer
  audio/       audioEngine (100% procedural Web Audio incl. new ability/projectile/armor SFX)
  ai/          cpuBrain (perception delay, punish/anti-air/combos, ability heuristics, projectile defense)
  net/         protocol.ts (15-bit input codec), session.ts (lobby + cfg exchange), NetDriver.ts (lockstep)
  ui/          HUD (incl. ability cooldown rings), menus, 15-card roster select, stage select, net lobby, settings/rebind
  tests/       combat / expansion (abilities, projectiles, roster, netplay determinism) / integration / UI / scene
  config/      constants.ts, settings.ts (persisted)
server/
  host.mjs     LAN host: static dist/ server + WebSocket lobby relay on one port
```

**Simulation ↔ presentation split:** the engine is pure TypeScript with zero rendering imports — deterministic (seeded RNG, integer frames), headless-testable, and netplay-ready by construction. Presentation reads mutable state in `useFrame` and reacts to a typed event bus.

---

## Cinematics

- **12s intro** (Start Game): black + rain + thunder → crane descent → low-angle tracking shot → rapid cuts with eye/fist close-ups on the real rigs → face-off dolly-out into the live gameplay camera → ROUND 1 → FIGHT! Skippable.
- **Camera director:** auto-framing fight cam, attack bias, impact punch, special push-in, super cinematic, K.O. orbit, victory orbit — phase-driven so it always returns to gameplay framing. Letterbox bars during cinematics.
- **Finishing cinematic:** generated from live state — hitstop → 0.25× slow-mo → orbit to the actual knockout spot → K.O. typography → victory pose → results.

---

## Known limitations / optional enhancements

1. No true per-object motion blur (approximated with FOV punches, trails, hitstop).
2. Characters are procedural rigs, not sculpted GLTF models (swap path documented in `src/assets/README.md`).
3. Crowd are animated silhouettes.
4. Netplay is delay-based lockstep tuned for LAN (same WiFi); it extrapolates after ~0.65s of packet loss and resyncs via checksums/snapshots, but internet play across high latency would want full rollback GGPO-style.
5. No voice acting — all audio is synthesized.
6. Mobile controls are functional but basic.
7. `oxlint` shows React-Compiler "immutability" warnings for the idiomatic R3F `useFrame` mutation pattern — zero runtime impact.

## Testing highlights (`npm run test` — 72 tests)

- Frame-accurate damage/whiff, block matrix, counters, cancels, buffering, supers, KO/round/match flow, double-KO trades, time-up
- **All 15 movesets generated & valid; ability mechanics individually tested** (cooldown=900f, damage buff, teleport, armor no-flinch, shockwave, counter-stance riposte, meter gain, burst-escape-heal, projectile burst)
- **Projectiles:** travel & hit, blockable chip, opposing-projectile cancellation
- **Netplay:** input bitmask round-trip, *two independent engines fed identical inputs stay bit-identical for 3600 frames (checksum parity)*, snapshot serialize→apply→continue parity
- Full hard-AI matches with new roster members (zoner vs heavy) run to completion with per-frame invariants
- Animation library NaN-free for all 15 characters; headless R3F renders the full arena + fighters + VFX; UI tree and store flows
