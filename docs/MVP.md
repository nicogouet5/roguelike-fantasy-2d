# DinoBlade: Reino Jurásico — MVP Scope (`MVP.md`)

> **Goal:** Deliver an immediately playable, juicy, 2D isometric pixel-art dinosaur action roguelite MVP in `C:\Dev\Hackaton` running on **TypeScript + Vite + Phaser 4.2.1 + Zod + Web Audio API**, featuring all 5 core dinosaur archetypes, 3 prehistoric biomes, roguelite amber offers, and the 2-phase **Spinosaurus Hoja-Abisal** boss duel.

---

## 1. Active MVP Scope

| Area | Included in First MVP |
|---|---|
| **Playable Dinosaur Classes (5)** | **T-Rex** (Espadón / Daño bruto), **Velociraptor** (Katanas / Glass cannon veloz), **Triceratops** (Escudo-Lanza / Tanque herbívoro), **Dodo Mago** (Gorrito de Mago + Báculo de Ámbar / Mago elemental), **Pteranodon** (Arco Óseo / Arquero aéreo) |
| **Skills (~22 total)** | Auto-attack + 3 signature active skills per dinosaur class (15 player skills + 5 class auto-attacks) + mob & Spinosaurus boss skills, all executed via unified `cast()` |
| **Zones (3)** | Floor 0: *Valle de Helechos* → Floor 1: *Cráter de Obsidiana* → Floor 2: *Cañón del Espinosaurio* (Boss Arena) |
| **Enemies (6 + Elites + Boss)** | `compsognathus`, `wild_raptor`, `pachy_ram`, `venom_spitter`, `obsidian_ankylo`, `ash_carno`, Elite variants, and 2-phase MVP Boss `spinosaurus_boss` |
| **Companion Pet** | **Codex** (`pet_codex`) — Floating pixel-art cloud with blinking `>_` prompt that follows the player and periodically casts `heal()`, `boost()` (+ATK/MATK/ASPD/Speed), or `guard()` (-30% damage taken + SP) |
| **Roguelite Progression** | Level-up stat points + 1-of-3 **Amber Boon Offers** every 2 levels & from **Fossil Kill Chests** (skill upgrades, dino mutations, fossil relics, reroll & skip) |
| **Pixel-Art Isometric Renderer** | Procedural 2D pixel-art atlas (`pixelArt: true`) with custom dino sprites holding their weapons, dithered 64×32 iso ground tiles, ferns/bones/volcanic props, slash arcs, telegraphs, pooled particles & damage text |
| **Audio** | Procedural Web Audio SFX (blade clash, katana slash, bow shot, magma cast, dino roar, level-up) + toggleable BGM (`M`) |
| **Controls & UX** | Title screen with live pixel previews of all 5 classes, WASD/Arrows/Touch Joystick, 1–3 / Click skills, `Q` Amber Potion, Auto-Attack & Auto-Cast toggles, `C` Stats & Relics panel, `M` Mute, `Esc` Pause/Restart |
| **Tests & Headless Sim** | Vitest suite (`npm test`), strict TS build (`npm run build`), ESLint (`npm run lint`), headless 5-class balance simulator (`npm run sim`) |

---

## 2. Architecture Layout

```text
C:\Dev\Hackaton\
├── docs/
│   ├── SPEC.md             # Full reformulated DinoBlade specification
│   └── MVP.md              # This MVP implementation plan
├── src/
│   ├── core/               # ZERO Phaser/DOM imports (pure deterministic TS)
│   │   ├── types.ts
│   │   ├── rng.ts
│   │   ├── iso.ts
│   │   ├── elements.ts
│   │   ├── stats.ts
│   │   ├── data.ts
│   │   ├── mapGen.ts
│   │   ├── skills.ts
│   │   ├── boons.ts
│   │   ├── ai.ts
│   │   ├── engine.ts
│   │   └── bot.ts
│   ├── data/               # Zod-validated JSON content
│   │   ├── names.es.json
│   │   ├── elements.json
│   │   ├── classes.json
│   │   ├── skills.json
│   │   ├── mobs.json
│   │   ├── maps.json
│   │   ├── boons.json
│   │   └── relics.json
│   ├── assets/
│   │   ├── manifest.json
│   │   └── pixelArt.ts     # Crisp pixel-art atlas builder (dinos + weapons + iso tiles + VFX)
│   ├── audio/
│   │   └── synth.ts        # Procedural Web Audio SFX + BGM
│   ├── game/               # Phaser 4.2.1 presentation & DOM HUD
│   │   ├── pools.ts
│   │   ├── GameScene.ts
│   │   └── hud.ts
│   ├── sim/
│   │   └── runSim.ts       # Headless multi-class balance simulator
│   ├── style.css
│   └── main.ts
└── tests/
    └── core.test.ts
```

---

## 3. Verification Checklist

- [x] `docs/SPEC.md` and `docs/MVP.md` authored in `C:\Dev\Hackaton`
- [x] `npm test` green across all schemas, formulas, classes, skills, and maps
- [x] `npm run build` (`tsc --noEmit` + Vite build) green
- [x] `npm run lint` green
- [x] `npm run sim -- --runs 25 --seed 42` exercises all 5 dinosaur classes cleanly
