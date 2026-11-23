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

### 3.2 Clases Jugables — 5 Especies con Pasivas Innatas **[done]**

| ID | Especie (ES) | Arma | Arquetipo | Habilidades Base y Activas | Dash (`Space`) | Ultimate (CD Largo) |
|---|---|---|---|---|---|---|
| `trex` | **T-Rex** | Mandoble Colosal de Hierro (en fauces) | **Coloso de Daño Bruto** | *Barrido de Fauces*, *Tajo Colosal* (165°), *Rugido Tirano* | *Salto Mandíbula* (salto aplastante en área) | **Corte Extinción:** espadazo volcánico colosal de 200° que ignora 45% DEF, empuja y aturde. |
| `velociraptor` | **Velociraptor** | Katanas Dobles | **DPS Glass Cannon Veloz** (crítico ×2.15) | *Corte Katana*, *Tormenta de Katanas* (4 golpes), *Instinto Depredador* | *Corte Relámpago* (dash atravesando enemigos + sangrado) | **Danza de Mil Cortes:** intocable, encadena 7 cortes relámpago 100% críticos con sangrado masivo. |
| `triceratops` | **Triceratops** | Cuernos-Lanza y Escudo | **Tanque Herbívoro Acorazado** | *Estocada de Cuernos* (`line_pierce`: perfora en línea ignorando 30% DEF), *Égida de Placas*, *Pisotón Sísmico* | *Carga de Cuernos* (embestida blindada que empuja y aturde) | **Estampida Jurásica:** embestida colosal imparable que arrasa, aturde `2 s` y activa *Égida de Placas*. |
| `dodo` | **Dodo Mago** | Gorrito + Báculo de Mago | **Mago Elemental Primordial** | *Chispa de Ámbar*, *Lanza de Magma*, *Rayo Jurásico* | *Salto de Plumas* (dash arcano con estallido de chispas ígneas) | **Cataclismo Meteorito:** invoca 4 meteoritos gigantes en una enorme área ardiente que aturde a todos. |
| `pteranodon` | **Pteranodon** | Arco de Hueso | **Arquero Cazador Aéreo** | *Flecha de Hueso*, *Flecha Perforante* (ignora 40% DEF), *Lluvia de Espinas* (5 flechas) | *Impulso de Alas* (salto evasivo con ráfaga de viento + velocidad) | **Tempestad de Plumas:** huracán circular de 14 flechas perforantes en 360° que ignoran 55% DEF y aceleran el vuelo. |

#### Pasivas Innatas por Clase (`src/core/stats.ts`, `skills.ts`, `engine.ts`, `classes.json`, `names.es.json`)

- **T-Rex — *Ejecución Tiránica*:** inflige **+25% de daño** contra enemigos que estén por debajo del **45% de HP**.
- **Velociraptor — *Sprint de Cazador*:** posee la **velocidad base más alta** (`5.95`) y acumula impulso continuo al moverse sin detenerse (`~3 s` hasta el tope; decae rápido al quedar quieto), otorgando hasta **+42% de velocidad de movimiento** (superando el tope normal hasta `9.5`), **+18% de velocidad de ataque (ASPD)** y **+12% de probabilidad de crítico**.
- **Triceratops — *Bastión (Coraza de Espinas)* + Cuernos-Lanza crecientes:** cuenta con **20% de reflejo de daño innato** al recibir golpes y sus **Cuernos-Lanza** (*Estocada de Cuernos*) crecen progresivamente en alcance al subir de nivel.
- **Dodo Mago — *Maestría Arcana (Flujo Arcano)*:** posee **-10% de enfriamiento (CDR)** en habilidades y **+2.5 SP/s** de regeneración de energía de forma innata.
- **Pteranodon — *Vuelo de Precisión* + Vuelo Libre:** inflige **+22% de daño** a enemigos situados a más de **4 casillas (`tiles`)** de distancia y disfruta de **vuelo libre** (`canFly: true`) para desplazarse sin obstrucciones sobre muros y abismos.

---

## 4. Bucle de Partida: Oleadas Exigentes, Wave HUD y Persecución Global **[done]**

```
Title (Selección de Dino + Preview Pixel Animado + Seed)
  → Nivel 1: Claustro Mineral (3 oleadas superpuestas: 11 mobs/oleada, máx. 32, 16 s/oleada, 14% Élites)
  → Nivel 2: Puente Quebrado (4 oleadas superpuestas: 13 mobs/oleada, máx. 38, 17 s/oleada, 24% Élites)
  → Nivel 3: Fortaleza Falla 23 (4 oleadas superpuestas: 15 mobs/oleada, máx. 42, 17 s/oleada, 28% Élites)
  → Nivel 4: Osario Hundido (Jefe de 2 fases: Spinosaurus / Bodoque Hoja-Abisal)
  → Resumen de Run → Reinicio Instantáneo
```

- **Wave HUD superior-central (`#wave-hud`):** panel fijo en la parte superior central con marco estilo Kenney (`panel-slate.png` / `panel-gold.png`) que muestra en todo momento el piso y oleada actual (`NIVEL X/4 · OLEADA Y/Z`), el conteo de enemigos vivos, los segundos restantes para la siguiente oleada y una barra de progreso animada. Cambia dinámicamente a estado `.final-wave` (**«¡QUEDA UNA PURA OLEADA!»**) al entrar en la última oleada del piso y a `.cleared` (*«NIVEL X/4 COMPLETADO · Avanzando a...»*) tras despejarla antes de la transición automática de bioma (sin portales).
- **Oleadas más densas y superpuestas:** cada oleada avanza bajo un temporizador estricto (`16–17 s`) y genera grupos más numerosos (`11`, `13` y `15` enemigos por oleada según el piso, con `+2` enemigos extra en la oleada final y mayor probabilidad de Élites). Si no se limpia a tiempo, la siguiente oleada aparece encima creando presión acumulada; limpiar una oleada antes de tiempo recorta la espera a `1.4 s` y otorga **+20 ◆ de Ámbar** de bonificación.
- **Persecución global implacable (*Relentless Global Mob Chase*):** todos los enemigos poseen alcance de detección global (`aggroRange: 99.0` en `src/data/mobs.json`) para perseguir al jugador desde cualquier punto del mapa sin perder el aggro. Además, `src/core/ai.ts` incorpora reposicionamiento anti-atasco: si un enemigo no-jefe queda muy lejos (`> 20` tiles) o bloqueado detrás de obstáculos durante `2.6 s`, se teletransporta a una casilla transitable de flanqueo (`~10.5` tiles alrededor del jugador), evitando tiempos muertos buscando rezagados.

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
