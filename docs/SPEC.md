# SPEC — DinoBlade: Isometric Pixel-Art Action Roguelite

> Agent-first build contract for **DinoBlade: Reino Jurásico** (`C:\Dev\Hackaton`).
> Built on the same proven architecture and stack as `C:\Dev\RNG`, reformulated into a **2D isometric pixel-art dinosaur action roguelite** where each dinosaur species is a distinct combat class wielding oversized blades, katanas, shields, bows, and primordial magic.

Status tags: **[done]** shipped in MVP · **[wip]** in progress · **[todo]** required post-MVP · **[plan]** future expansion.

---

## 0. Product Vision & Identity

- **Pitch:** 2D isometric pixel-art action roguelite inspired by *DinoBlade* and classic isometric action RPGs. Every dinosaur species is a full combat class with an unmistakable silhouette, signature weapon held in its jaws/claws, and distinct tactical playstyle. Each run builds a unique prehistoric hunter through seeded biomes, fossil relics, and 1-of-3 amber boon offers leading to a climactic duel against the **Spinosaurus Hoja-Abisal**.
- **Visual Direction:** Crisp **2D isometric pixel art** (`pixelArt: true`, nearest-neighbor scaling, 2:1 isometric projection `64×32` base tiles, 16-bit/32-bit palette with warm volcanic amber, mossy prehistoric greens, obsidian stone, and bold weapon steel).
- **Language:** Player-facing UI and lore in neutral Spanish (`src/data/names.es.json`); code, comments, and technical docs in English.
- **Platforms:** Desktop browser + responsive mobile layout (touch virtual joystick + tap hotbar).

---

## 1. Stack & Commands (Inherited from `C:\Dev\RNG`)

- **Runtime & Engine:** TypeScript (strict) + Vite + **Phaser 4.2.1** (`pixelArt: true`) + **Zod** + **Web Audio API**.
- **Quality & Simulation:** Vitest + ESLint + `tsx` headless balance simulator (+ Playwright optional for E2E).

| Command | Purpose |
|---|---|
| `npm run dev` | Start Vite dev server (`http://127.0.0.1:4173`) |
| `npm run build` | Type-check (`tsc --noEmit`) + production Vite bundle |
| `npm test` | Vitest unit, formula, and Zod data-validation tests |
| `npm run lint` | ESLint across `src/` and `tests/` |
| `npm run sim -- --runs 50 --seed 42` | Headless balance simulation across all dinosaur classes |

---

## 2. Architecture (Hard Boundaries)

| Layer | Path | Rule |
|---|---|---|
| **Pure Logic** | `src/core/` | **Strictly zero** imports from `phaser` or DOM APIs. Combat, stats, elements, AI, map generation, relics, boons, and `cast()` live here so Vitest and `runSim.ts` execute deterministically without a browser. |
| **Data-Driven Content** | `src/data/*.json` | All dinosaur classes, skills, mobs, biomes/maps, elements, boons, and relics live in JSON validated at boot and in tests by Zod (`src/core/data.ts`). |
| **Centralized Strings** | `src/data/names.es.json` | Every player-facing label, class name, skill name, biome, mob, boon, and relic is referenced by `id`. |
| **Phaser 4.2.1 Renderer** | `src/game/` | Presentation, pixel-art rendering, depth sorting, input, object pools (`Phaser.TintModes`), and DOM HUD overlay (`hud.ts`). Never owns gameplay rules. |
| **Pixel Art & Assets** | `src/assets/` | `manifest.json` maps every `spriteId` to procedural pixel-art atlas frames (`pixelArt.ts`) or external spritesheets without touching engine code. |
| **Procedural Audio** | `src/audio/` | Web Audio API SFX synthesizer (blade clangs, katana slashes, bow twangs, dino roars, magma blasts) + prehistoric chiptune BGM. |

### Core Engine Invariants
1. **Coordinates:** Cartesian grid `(gx, gy)` in `src/core/`; 2:1 isometric projection (`gridToScreen` / `screenToGrid`) strictly for rendering and pointer picking (`src/core/iso.ts`).
2. **Deterministic Seeded RNG:** `mulberry32` + FNV-1a string hash with independent streams for map generation, combat rolls, and roguelite boon offers.
3. **Unified Action Pipeline:** Every auto-attack, dinosaur class skill, mob attack, boss phase skill, and relic proc executes through `cast(state, casterId, skillId, target, options)` in `src/core/skills.ts`.

---

## 3. Dinosaur Species = Combat Classes (`src/data/classes.json`)

Every dinosaur species defines a unique combat archetype, weapon family, stat curve, movement speed, hitbox feel, and signature skill kit.

### 3.1 Playable Classes — MVP Roster **[done]**

| ID | Species (ES) | Weapon | Archetype | Gameplay Identity & Signature Kit | Primary Stats |
|---|---|---|---|---|---|
| `trex` | **T-Rex** | Espadón Gigante (*Greatsword*, en fauces) | **Coloso de Daño Bruto** | Daño físico masivo por golpe y amplio arco de tajo; velocidad moderada, gran vida. *Tajo Colosal* (arco 150°), *Salto Mandíbula* (salto aéreo aplastante estilo DinoBlade), *Rugido Aplastante* (rompe DEF y aturde). | STR, VIT |
| `velociraptor` | **Velociraptor** | Katanas Dobles (*Katana*, fauces + garra) | **DPS Glass Cannon Veloz** | Velocidad de ataque y movimiento máximas, probabilidad de crítico ×2, baja HP/DEF. *Corte Relámpago* (dash atravesando enemigos), *Tormenta de Katanas* (ráfaga multi-golpe), *Instinto Depredador* (+CRIT/+ASPD y evasión). | AGI, LUK, STR |
| `triceratops` | **Triceratops** | Cuernos-Lanza y Escudo (*Shield & Horn-Lance*) | **Tanque Herbívoro Acorazado** | Enorme HP, Hard DEF y resistencia. Su ataque básico *Estocada de Cuernos* (estilo Q de Jarvan IV) perfora en línea recta a todos los enemigos ignorando 30%+ DEF y **sus cuernos crecen al subir de nivel**. *Carga de Cuernos*, *Égida de Placas*, *Pisotón Sísmico*. | VIT, STR |
| `dodo` | **Dodo Mago** | Báculo de Ámbar (*Amber Staff*) + Gorrito de Mago | **Mago Elemental Primordial** | Ave prehistórica con gorrito puntiagudo de mago, estrella dorada y báculo de ámbar; alto MATK y control elemental de zona. *Lanza de Magma* (proyectil Fuego), *Rayo Jurásico* (descarga triple Viento), *Lluvia de Meteoritos* (AoE telegraphed devastador). | INT, DEX |
| `pteranodon` | **Pteranodon** | Arco de Hueso (*Bone Bow*) | **Arquero Cazador Aéreo** | Combate físico a larga distancia con gran movilidad y kiting. *Flecha Perforante* (atraviesa en línea e ignora parte de DEF), *Lluvia de Espinas* (cono/AoE de flechas), *Impulso de Alas* (salto atrás evasivo + bono de velocidad). | DEX, AGI |

### 3.2 Full Roster Expansion **[todo]**

| ID | Species (ES) | Weapon | Archetype | Role |
|---|---|---|---|---|
| `spinosaurus` | **Spinosaurus** | Odachi Abisal (*Odachi*) | **Duelista Hidro-Espada** | Alcance extendido, tajos de ola de agua y contraataque/parry (desbloqueable al vencer al jefe MVP). |
| `ankylosaurus` | **Ankylosaurus** | Mazo Caudal (*Tail Hammer*) | **Juggernaut de Choque** | Martilleo pesado, onda expansiva 360° y armadura reflectante. |
| `stegosaurus` | **Stegosaurus** | Placas Rúnicas (*Rune Plates*) | **Soporte / Guardián Solar** | Totems solares curativos, disparos de espinas y auras de equipo. |
| `carnotaurus` | **Carnotaurus** | Hachas Gemelas (*Twin Axes*) | **Berserker Frenético** | Escala velocidad y robo de vida cuanto menos HP le queda. |

### 3.3 Apex Evolutions (Tier 2 / Rebirth) **[todo]**
At **Lv 10** (or after defeating the MVP Boss for Rebirth / *Evolución Alfa*), each species evolves into an Apex form with enhanced pixel aura and a 4th ultimate skill:
- `trex` → **Rex Tirano** (*Corte Extinción*)
- `velociraptor` → **Raptor Sombra** (*Danza de los Mil Cortes*)
- `triceratops` → **Triceratops Titán** (*Bastión Inquebrantable*)
- `dodo` → **Archimago Dodo** (*Cataclismo Cretácico*)
- `pteranodon` → **Pteranodon Tempestad** (*Flecha Huracán*)

---

## 4. Combat Math & Character Progression (`src/core/stats.ts`)

Renewal-inspired, deterministic, multi-hit tactical pacing:

- **Primary Stats:** `STR`, `AGI`, `VIT`, `INT`, `DEX`, `LUK`.
  - Level-up grants `+5` stat points (auto-spendable or manually allocatable in Stats Drawer `C`) and scales base HP/SP per dinosaur class profile.
- **Derived Formulas:**
  - `MaxHP = round((classBaseHp + (lv - 1) * hpPerLv) * (1 + 0.015 * VIT) + flatHp)`
  - `MaxSP = round((classBaseSp + (lv - 1) * spPerLv) * (1 + 0.015 * INT) + flatSp)`
  - `ATK` (melee): `classBaseAtk + floor(lv * 1.5) + STR * 2 + floor(DEX / 4) + bonusAtk`
  - `ATK` (ranged/bow): `classBaseAtk + floor(lv * 1.5) + DEX * 2 + floor(STR / 4) + bonusAtk`
  - `MATK`: `classBaseMatk + floor(lv * 1.5) + INT * 2.2 + floor(DEX / 4) + bonusMatk`
  - `CritChance`: `clamp(0.05, 0.85, (0.04 + 0.004 * LUK) * critMult)` (`velociraptor` katana has `critMult = 2.0`); Critical hits deal `1.5×` damage (plus crit damage boons) and bypass FLEE.
  - `ASPD` (attacks/sec): `clamp(0.65, 3.8, classBaseAspd * (1 + 0.011 * AGI + 0.003 * DEX) * aspdMult)`
  - `MoveSpeed` (tiles/sec): `clamp(2.4, 7.2, classBaseSpeed * (1 + 0.005 * AGI) * speedMult)`
  - `HardDEF` mitigation: `dmg * (250 / (250 + HardDEF)) - SoftDEF` (`SoftDEF = floor(VIT * 0.5)`)
  - `HardMDEF` mitigation: `dmg * (200 / (200 + HardMDEF)) - SoftMDEF` (`SoftMDEF = floor(INT * 0.5)`)
  - `CastTime`: `80%` Variable Cast Time reduced by `sqrt((2*DEX + INT) / 280)` + `20%` Fixed Cast Time reduced by boons/relics.
- **Prehistoric Elements (`src/data/elements.json`):**
  - `Neutral`, `Fire` (Magma), `Water` (Hidro), `Wind` (Tempestad), `Earth` (Sísmico), `Venom` (Veneno/Ámbar).
  - Weakness deals `1.5×`–`1.75×` damage with bold `!` feedback; resistance deals `0.5×`–`0.75×`.

---

## 5. Run Loop & Roguelite Layer (`src/core/boons.ts`, `src/data/boons.json`)

```
Title (Dino Class Select + Live Pixel Preview + Seed + Auto-Cast)
  → Zone 1: Valle de Helechos (Prehistoric Jungle — fast packs & chargers)
  → Zone 2: Cráter de Obsidiana (Volcanic Caldera — armored elites & venom casters)
  → Zone 3: Cañón del Espinosaurio (DinoBlade Arena — 2-Phase Boss: Spinosaurus Hoja-Abisal)
  → Run Summary (Stats, DPS, Kills, Time, Class Badge) → Instant Restart / Try Another Dino
```

- **Never-locked exploration:** Open seeded maps with clear landmarks, portal to next zone unlocked once the zone objective (clear N threats or defeat the Zone Warden) is met, or immediately reachable in open exploration with clear HUD guidance.
- **Amber Boons (Level-Up & Fossil Chests):**
  - Every **2 levels** (`Lv 2, 4, 6, 8, ...`) and every **Kill Chest** (spawns every `14 + 4*floor` kills on a walkable tile with minimap marker), gameplay pauses and opens a **1-of-3 Offer Modal** (`1 / 2 / 3` or click/tap).
  - Categories: **Mejora de Habilidad** (scales active class skills: extra slash width, +1 meteor, +1 arrow, reduced cooldown), **Mutación Primordial** (stat & combat modifiers: +ATK%, +ASPD%, +CRIT, +HP/lifesteal), **Reliquia Fósil** (passive combat hooks: bleed on hit, magma explosion on kill, shield on dash, chain lightning proc).
  - **Floating Companion Pet — `pet_codex` (*Codex*):** **[done]** Pixel-art floating dark-cloud companion with a blinking white `>_` terminal prompt that orbits smoothly behind the player and automatically triggers support every `8.5 s`:
  - `Codex > heal()` (when HP `< 72%`): restores `18% Max HP` + `22% Max SP`.
  - `Codex > boost()` (`codex_overclock`, `6.5 s`): `+22% ATK/MATK`, `+22% ASPD`, `+14% Move Speed`.
  - `Codex > guard()` (`codex_shield`, `6.5 s`): `-30% damage taken` + `+16% Max SP`.
- **Controls:** **Renovar** (reroll, starts at 2 per run) and **Omitir** (skip for instant HP/SP heal + Amber shards).

---

## 6. Biomes & Procedural Isometric Pixel Maps (`src/data/maps.json`, `src/core/mapGen.ts`)

1. **Floor 0 — `valle_helechos` (*Valle de Helechos*):** Sunlit Cretaceous fern valley, rich emerald pixel grass with dithered dirt trails, giant fern clusters, cycad palms, ancient ribcage landmarks. Mobs: `compsognathus`, `wild_raptor`, `pachy_ram`.
2. **Floor 1 — `crater_obsidiana` (*Cráter de Obsidiana*):** Ashy volcanic plateau with basalt flagstones, glowing magma fissures, amber crystal formations. Mobs: `wild_raptor`, `venom_spitter`, `obsidian_ankylo`, `ash_carno` (+ Elite variants).
3. **Floor 2 — `canon_dinoblade` (*Cañón del Espinosaurio*):** Atmospheric misty mountain valley arena inspired directly by *DinoBlade* — wide dusty canyon floor ringed by jagged cliffs and giant prehistoric swords embedded in stone. Boss: **Spinosaurus Hoja-Abisal** (2 phases).
4. **[todo] Safe Camp Hub (`campamento_ambar`):** Prehistoric stone camp with Fossil Blacksmith (weapon refine), Amber Altar (meta-progression Favor unlocks), and Nest Hatchery (companion dino pets).

---

## 7. Enemies & Boss Mechanics (`src/data/mobs.json`, `src/core/ai.ts`)

- **Standard & Elite Mobs:**
  - `compsognathus`: Fast tiny pack swarmer.
  - `wild_raptor`: Agile flanker with leap strike.
  - `pachy_ram`: Dome-headed charger with telegraphed headbutt dash.
  - `venom_spitter`: Ranged venom-bolt spitter that maintains distance.
  - `obsidian_ankylo`: High-DEF volcanic herbivore with ground slam.
  - `ash_carno`: Aggressive horned predator with sweeping flame bite.
  - **Elites (`isElite: true`):** 2.1× HP, 1.35× ATK, golden pixel aura, guaranteed Fossil Chest progress & relic/potion drop.
- **MVP Boss — `spinosaurus_boss` (*Spinosaurus Hoja-Abisal*):**
  - Iconic crimson-sailed Spinosaurus gripping a colossal odachi blade in its jaws.
  - **Phase 1 (100%–50% HP):** Sweeping Odachi Cleave, Hydro-Blade Wave projectile, and telegraphed Abyssal Leap Slam (red pixel danger ring → impact shockwave).
  - **Phase 2 (<50% HP):** Sail ignites crimson (*Furia Abisal* +25% ASPD/speed), summons `compsognathus` & `wild_raptor` raiders, fires Triple Cross-Blade Telegraphed AoEs, and performs an anti-kite charging slash.

---

## 8. Pixel-Art Visuals, Feel & Audio (`src/assets/pixelArt.ts`, `src/audio/synth.ts`)

- **Crisp Pixel Art Pipeline:** Phaser 4 configured with `pixelArt: true`, `antialias: false`, `roundPixels: true`. All sprites and isometric tiles are rasterized at boot onto typed pixel buffers (`48×48` logical → `96×96` playable dinos, `64×64` → `128×128` Spinosaurus Boss, `40×40` → `80×80` enemies) with 4-tone directional shading, pixel dithering, hue-shifted outlines, and baked crescent weapon-smear arcs packed into a single `2048px`-wide Phaser texture atlas (`dino_atlas`).
- **Fluid 15-Frame Animations (`idle_0..3`, `walk_0..5`, `atk_0..4`):** Every playable dinosaur, enemy, and boss runs a 4-frame breathing/hovering idle, a speed-scaled 6-frame run/stride/wingbeat walk cycle with contact-frame footstep dust puffs and squash-and-stretch, and a 5-frame attack animation (windup → swing smear → impact peak → follow-through → recovery), plus pixel afterimage ghost trails on dashes and leaps.
- **Game Feel:**
  - Weapon-colored pixel slash arcs on melee swings & greatsword leaps.
  - Element-colored floating damage numbers (`!` on crits & elemental weaknesses).
  - Brief hitstop (`35 ms`) on heavy crits/boss slams, directional camera shake, white hit flash (`Phaser.TintModes.FILL`), knockback, and pooled pixel particle bursts.
  - Red telegraphed pixel rings on boss/elite heavy attacks so players can dodge actively.
- **Procedural Audio:** Web Audio SFX for steel clash, katana slice, bow release, magma blast, dino roar, footsteps/impact, boon pickup, level-up, and boss phase transition + toggleable prehistoric synth BGM (`M`).

---

## 9. Acceptance Checks

1. `npm test` — All Vitest unit & data-integrity tests pass (Zod schemas, `names.es.json` coverage, iso projection round-trip, element multipliers, Renewal combat formulas, all 5 dinosaur classes & skills via `cast()`, boon determinism, map connectivity).
2. `npm run build` — `tsc --noEmit` + Vite production bundle completes with zero errors.
3. `npm run lint` — ESLint passes with zero errors.
4. `npm run sim -- --runs 50 --seed 42` — Headless simulator runs all 5 dinosaur classes through full runs without crashes and prints class balance metrics.
