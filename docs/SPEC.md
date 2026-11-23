# SPEC — DinoLike: Isometric Pixel-Art Action Roguelite

> Agent-first build contract for **DinoLike: Reino Jurásico** (`C:\Dev\Hackaton`).
> Built on **TypeScript (strict) + Vite + Phaser 4.2.1 + Zod + Web Audio API**, structured as a **2D isometric pixel-art dark-fantasy dinosaur action roguelite** where each dinosaur species is a distinct combat class wielding oversized blades, katanas, growing horn-lances, wizard staves, and bone bows.

Status tags: **[done]** shipped · **[wip]** in progress · **[todo]** defined & queued · **[plan]** options pending decision.

---

## 0. Product Vision & Identity

- **Pitch:** 2D isometric pixel-art dark-fantasy action roguelite inspired by *DinoBlade*, *Hades*, and *Brotato*. Every dinosaur species is a full combat class with an unmistakable silhouette, signature weapon, dedicated **Dash (`Space`)**, and high-impact **Ultimate** skill. Runs escalate through timed overlapping **waves** across prehistoric biomes with Hades/Brotato tag-synergy builds, Chilean street-food drops, *31 Minutos* NPCs, and a floating **Codex (`>_`)** companion pet, culminating in a 2-phase duel against the **Spinosaurus Hoja-Abisal**.
- **Visual Direction:** Crisp **2D isometric pixel art** (`pixelArt: true`, nearest-neighbor scaling, 2:1 isometric projection `64×32` base tiles) paired with **Kenney Fantasy UI Borders** (9-slice ornate obsidian/gold/crimson frames & filigree dividers) **[done]**.
- **Audio Direction:** **Dark Fantasy Soulslike SFX Pack** (Gomo Sounds) decoded via Web Audio API for attacks, dashes, crits, sorcery, roars, flasks, and UI **[done]**.
- **Language:** Player-facing UI and lore in Spanish (`src/data/names.es.json`); code, comments, and technical docs in English.

---

## 1. Stack & Commands

- **Runtime & Engine:** TypeScript (strict) + Vite + **Phaser 4.2.1** (`pixelArt: true`) + **Zod** + **Web Audio API**.
- **Quality & Simulation:** Vitest + ESLint + `tsx` headless balance simulator.

| Command | Purpose |
|---|---|
| `npm run dev` | Start Vite dev server (`http://127.0.0.1:4174`) |
| `npm run build` | Type-check (`tsc --noEmit`) + production Vite bundle |
| `npm test` | Vitest unit, formula, and Zod data-validation tests |
| `npm run lint` | ESLint across `src/` and `tests/` |
| `npm run sim -- --runs 25 --seed 42` | Headless balance simulation across all 5 dinosaur classes |

---

## 2. Architecture (Hard Boundaries)

| Layer | Path | Rule |
|---|---|---|
| **Pure Logic** | `src/core/` | **Strictly zero** imports from `phaser` or DOM APIs. Combat, stats, elements, AI, map generation, waves, relics, boons, Chilean food drops, NPCs, and `cast()` live here. |
| **Data-Driven Content** | `src/data/*.json` | All dinosaur classes, skills, mobs, biomes/waves, elements, boons, relics, food items, and NPC dialogues live in JSON validated with Zod (`src/core/data.ts`). |
| **Centralized Strings** | `src/data/names.es.json` | Every player-facing label is keyed by `id`. |
| **Phaser 4.2.1 Renderer** | `src/game/` | Presentation, pixel-art rendering, depth sorting, input, object pools (`Phaser.TintModes`), and Kenney-styled DOM HUD (`hud.ts`, `style.css`). Never owns gameplay rules. |
| **Pixel Art & UI Assets** | `src/assets/` | Procedural pixel-art atlas (`pixelArt.ts`, 15 frames per dino) + curated 9-slice Kenney Fantasy UI PNGs (`src/assets/ui/`). |
| **Audio** | `src/audio/`, `public/assets/sfx/` | Web Audio buffer playback of Dark Fantasy Soulslike SFX with pitch jitter, throttling, and procedural fallback. |

---

## 3. Dinosaur Species = Combat Classes (`src/data/classes.json`)

### 3.1 Control Scheme (Dash + Skills + Ultimate) **[todo — migrating from 3-slot hotbar]**
- **`W/A/S/D` or Arrows / Touch Joystick:** Move in 2:1 isometric space.
- **Auto-Attack / Left Click:** Class basic attack.
- **`Space` (Barra Espaciadora):** Dedicated **Class Dash / Mobility Skill** **[todo]**.
- **`1` / `2`:** Core active class skills.
- **`3` or `E` / `R` (Ultimate Slot):** High-impact **Class Ultimate** (long cooldown `25–35 s`, dramatic VFX & audio) **[todo]**.
- **`Q`:** Drink Amber Potion (`Poción de Ámbar`).
- **`C`:** Build & Synergies Sheet · **`M`:** Mute · **`Esc`:** Pause.

### 3.2 Playable Classes — 5 Species **[done base · todo Dash on Space + Ultimates]**

| ID | Species (ES) | Weapon | Archetype | Basic & Core Skills | Dash (`Space`) **[todo]** | Ultimate (Long CD) **[todo]** |
|---|---|---|---|---|---|---|
| `trex` | **T-Rex** | Espadón Gigante (en fauces) | **Coloso de Daño Bruto** | *Tajo de Fauces*, *Tajo Colosal* (165°), *Rugido Tirano* | *Salto Mandíbula* (salto aplastante en área) | **Corte Extinción:** salto aéreo + tajo volcánico gigante que abre una fisura ardiente en línea/cono. |
| `velociraptor` | **Velociraptor** | Katanas Dobles | **DPS Glass Cannon Veloz** (crítico ×2) | *Corte Katana*, *Tormenta de Katanas* (4 golpes), *Instinto Depredador* | *Corte Relámpago* (dash atravesando enemigos + sangrado) | **Danza de los Mil Cortes:** invulnerable `1.8 s`, encadena 8 cortes relámpago 100% críticos entre enemigos cercanos. |
| `triceratops` | **Triceratops** | Cuernos-Lanza y Escudo | **Tanque Herbívoro Acorazado** | *Estocada de Cuernos* **[done]** (`line_pierce` estilo Q de Jarvan IV: perfora en línea recta ignorando 30%+ DEF y **crece al subir de nivel**), *Égida de Placas*, *Pisotón Sísmico* | *Carga de Cuernos* (embestida blindada que empuja y aturde) | **Estampida Jurásica:** carga colosal imparable con cuernos dorados gigantes que aturde y levanta pilares sísmicos en todo el trayecto. |
| `dodo` | **Dodo Mago** | Gorrito de Mago + Báculo de Mago | **Mago Elemental Primordial** | *Chispa de Ámbar*, *Lanza de Magma*, *Rayo Jurásico*, *Lluvia de Meteoritos* | *Salto de Plumas* (teletransporte arcano corto dejando explosión de chispas) | **Cataclismo del Meteorito:** levita con su gorrito brillando e invoca un meteorito gigante del cielo con onda expansiva masiva. |
| `pteranodon` | **Pteranodon** | Arco de Hueso | **Arquero Cazador Aéreo** | *Flecha de Hueso*, *Flecha Perforante* (ignora 40% DEF), *Lluvia de Espinas* (5 flechas) | *Impulso de Alas* (salto evasivo con ráfaga de viento + velocidad) | **Tempestad de Plumas Óseas:** asciende y desata un huracán circular de flechas perforantes en toda la pantalla. |

---

## 4. Run Loop: Timed Overlapping Waves & Biome Progression **[todo]**

```
Title (Dino Class Select + Animated Pixel Preview + Seed)
  → Zone 1: Claustro Mineral (3 timed overlapping waves → auto-advance)
  → Zone 2: Puente Quebrado (4 timed overlapping waves + Elites → auto-advance)
  → Zone 3: Fortaleza Falla 23 (Elite-heavy waves → auto-advance)
  → Zone 4: Osario Hundido (2-Phase Boss: Spinosaurus Hoja-Abisal)
  → Run Summary → Instant Restart
```

- **No Portal Gatekeeping:** Advancing to the next biome no longer requires walking to a map portal; instead, surviving and clearing **X waves** automatically transitions to the next biome (with a short celebratory breather + 31 Minutos NPC cameo / Amber shop moment).
- **Overlapping Pressure Waves:** Each wave runs on a **strict wave timer** (e.g., `20–25 s`). **The next wave spawns automatically even if mobs from the previous wave are still alive**, creating escalating Brotato/Vampire Survivors-style pressure when DPS lags. Clearing a wave early skips the remaining wait and grants an **Amber bonus**.
- **Final Wave Tension («Queda una pura»):** When entering the final wave of a biome, the HUD flashes a bold dramatic banner: **«¡Queda una pura oleada!»** (see §6).

---

## 5. Build-Crafting System (Hades + Brotato Inspired) **[done]**

- **Zero manual stat allocation:** Every single Level-Up (`Lv 2, 3, 4, …`) and every **Amber Chest** opens a **1-of-3 Offer Modal** (`1 / 2 / 3` or click).
- **Class-Relevant Pool Filtering:** Pure magic classes (`dodo`) never roll dead physical-only cards (`+STR`, `Corazón de Titán`, `Colmillo de Rex`), and melee classes never roll `+2 Proyectiles` (`Sobrecarga de Proyectiles`).
- **34 Build-Defining Cards (`src/data/boons.json`):**
  - **Atributos (`stat`):** `+STR`, `+AGI`, `+VIT`, `+INT`, `+DEX`, `+LUK`.
  - **Mutaciones con Riesgo/Recompensa (`mutation`, Brotato-style):** *Pacto Carnicero* (`+40% ATK/MATK`, `-18% HP`), *Coloso Inamovible* (`+44% HP`, `+34 DEF`, `-9% vel.`), *Sobrecarga de Proyectiles* (`+2 proyectiles`, `+18% ASPD`, `-10% daño base`).
  - **Especializaciones de Clase (`skill`):** e.g., *Cuernos de Titán* (`+35%` largo de cuernos del Triceratops), *Cataclismo Arcano* (Dodo).
  - **Piedras Angulares Legendarias (`capstone`, Hades-style):** *Tormenta Crítica* (rayo en cadena al hacer crítico), *Cosecha Carmesí*, *Corazón de Titán* (HP máx. → ATK), *Núcleo Volcánico*, *Furia Berserker*.
  - **Reliquias Fósiles (`relic`):** *Colmillo de Rex*, *Pluma de Raptor*, *Placa de Triceratops*, *Ámbar Volcánico*, *Garra Abisal*.
- **Dynamic Synergy Weighting & Set Bonuses (`2 / 4` stacks):**
  - 6 tags: `🔥 Volcán`, `⚡ Crítico`, `💨 Frenesí`, `🛡️ Titán`, `🩸 Sangrado`, `✨ Arcano`.
  - Cards matching your active tags gain progressive draw weight (`★ SINERGIA CON TU BUILD`), while `LUK`, level, and chests elevate Rare/Epic/Legendary odds.
  - Reaching **2** and **4** stacks of any tag unlocks real **Set Bonuses** (`TAG_SET_TIERS` in `src/core/stats.ts`).
- **Amber Economy (`◆`):** Spend Amber mid-run on `+Poción (35 ◆)`, `✨ Forjar Mejora (85 ◆)`, or extra offer rerolls (`40 ◆`) after 3 free rerolls.

---

## 6. Los Cinco Ingredientes Sorpresa de la Hackatón

| # | Ingrediente | Diseño en DinoLike | Estado |
|---|---|---|---|
| 1 | **Logo de Codex** | **Pet flotante `Codex` (`pet_codex`):** nube oscura pixel art con el prompt blanco `>_` parpadeante que orbita junto al jugador y lanza automáticamente `Codex > heal()`, `Codex > boost()` y `Codex > guard()` cada `8.5 s`. | **[done]** |
| 2 | **Completo Italiano** (+ Comida Rápida Chilena) | **Drops de Comida Chilena al derrotar mobs** (`src/data/foods.json` + sprites pixel art en `pixelArt.ts`):<br>• **Completo Italiano** (pan, vienesa, tomate, palta, mayo): cura `28% HP` + buff *"Modo Italiano"* (`+20% ATK/MATK`, `+15% velocidad`, `6 s`).<br>• **Completo:** cura `22% HP` y `25% SP`.<br>• **As:** cura `18% HP` + buff *"+28% ATK/MATK"* (`6 s`).<br>• **Salchipapas:** buff *"Frenesí de Papas"* (`+30% velocidad de ataque`, `6 s`).<br>• **Sopaipilla:** cura rápida `15% HP` + `+25% velocidad de movimiento` (`5 s`).<br>• **Sopaipilla Pasada con Chancaca:** súper cura `35% HP`, `+40% SP` y escudo `-25% daño recibido` (`6 s`). | **[todo]** |
| 3 | **Guiño a 31 Minutos** | **NPCs Jurásicos de 31 Minutos** que aparecen en el mapa / entre oleadas con diálogos pixel art:<br>• **Tulio Triviño (Reportero del Cretácico):** transmite titulares urgentes al cambiar de zona/oleada y ofrece objetos con Ámbar.<br>• **Juan Carlos Bodoque (*La Nota Verde Jurásica*):** ofrece una apuesta/bendición de riesgo-recompensa entre oleadas.<br>• **Juanín Juan Harry:** productor del estudio que anuncia el inicio de oleadas y regala un Completo Italiano de catering.<br>• **Calcetín con Rombos Man:** aparición heroica ocasional cuando el jugador cae bajo `30% HP`, aturdiendo enemigos cercanos. | **[todo]** |
| 4 | **La frase «Queda una pura»** | Integrada de forma orgánica en momentos de alta tensión:<br>• Banner dramático al iniciar la última oleada de cada piso: **«¡Queda una pura oleada!»**.<br>• Aviso en HUD/toast cuando te queda la última Poción de Ámbar (`×1`) o 1 último enemigo de la oleada final: **«¡Queda una pura!»**. | **[todo]** |
| 5 | **El número 23 (Secreto)** | Easter egg / secreto oculto por descubrir en la partida. *Alternativas propuestas al usuario para elegir la favorita.* | **[plan]** |

---

## 7. Enemies, Boss & Biomes

- **Biomes (`src/data/maps.json`):** `valle_helechos` (Jungle) → `crater_obsidiana` (Volcano) → `canon_dinoblade` (Canyon Boss Arena).
- **Enemies (`src/data/mobs.json`):** `compsognathus`, `wild_raptor`, `pachy_ram`, `venom_spitter`, `obsidian_ankylo`, `ash_carno` + Elite variants (2.1× HP, 1.35× ATK).
- **Boss — `spinosaurus_boss` (*Spinosaurus Hoja-Abisal*):** 2-phase crimson-sailed predator wielding a giant cursed Odachi in its jaws (Phase 1: Odachi Cleave, Hydro Wave, Abyssal Leap; Phase 2 `<50% HP`: Furia Abisal, summons, Triple Cross-Rend telegraphs).

---

## 8. Acceptance Checks

1. `npm test` — All Vitest unit & data-integrity tests pass (Zod schemas, `names.es.json`, iso projection, formulas, Triceratops growing horns, Codex pet, tag sets, class pool filtering, waves, Chilean food drops, Ultimates).
2. `npm run build` — `tsc --noEmit` + Vite production bundle completes with zero errors.
3. `npm run lint` — ESLint passes with zero errors.
4. `npm run sim -- --runs 25 --seed 42` — Headless simulator completes cleanly across all 5 dinosaur classes.
