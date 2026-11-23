# AGENTS.md — DinoBlade Repository Conventions & Commands

## Architecture Boundaries
1. **Pure Logic (`src/core/`):** Strictly zero imports from `phaser` or DOM APIs. All combat, stats, element math, AI, map generation, relics, boons, and `cast()` live here so Vitest and the headless simulator run without a browser.
2. **Data-Driven Content (`src/data/`):** All dinosaur classes, skills, mobs, maps, elements, boons, and relics live in JSON files validated with Zod (`src/core/data.ts`).
3. **Centralized Strings (`src/data/names.es.json`):** Every player-facing name/label is referenced by `id` from `names.es.json`.
4. **Phaser 4.2.1 Pixel-Art Renderer (`src/game/`):** Presentation, input, texture pooling, and audio triggers only (`pixelArt: true`, `roundPixels: true`). Logical coordinates are Cartesian grid coordinates; 2:1 isometric projection (`gridToScreen` / `screenToGrid`) is used for rendering and mouse picking.
5. **Assets & Audio (`src/assets/`, `src/audio/`):** Crisp procedural 2D pixel-art sprites and isometric tiles plus Web Audio SFX/BGM mapped through `src/assets/manifest.json`.

## Commands
- `npm run dev` — Start Vite dev server
- `npm run build` — Type-check (`tsc --noEmit`) + production Vite bundle
- `npm test` — Run Vitest unit & data-validation tests
- `npm run lint` — Run ESLint across `src/` and `tests/`
- `npm run sim -- --runs 50 --seed 42` — Run headless balance simulation across all 5 dinosaur classes
