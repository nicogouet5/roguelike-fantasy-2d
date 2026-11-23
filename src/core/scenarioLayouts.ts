import type { MapDef, TileKind, ZoneMap } from './types.ts';
import { createRng } from './rng.ts';

/**
 * Grid-space interpretations of the Falla 23 concept paintings.
 *
 * Tile semantics shared with the renderer:
 *  - `ground`  walkable slab floor (no "road" stripes: the paintings are open slabs)
 *  - `void`    non-walkable drop: moat water (claustro), lava chasm (puente), lava (fortaleza)
 *  - `wall`    non-walkable masonry / rock
 *  - `portal`  walkable exit tile, always inside the slab area
 *
 * Grid +x runs to the lower right of the screen and +y to the lower left, so
 * the "back" of every scenario is the small-x / small-y side.
 */
export type ScenarioStyle = 'cloister' | 'bridge' | 'fortress' | 'ossuary';

export function scenarioStyle(paletteId: string): ScenarioStyle | undefined {
  switch (paletteId) {
    case 'claustro_jade_ambar': return 'cloister';
    case 'puente_violeta_cobre': return 'bridge';
    case 'fortaleza_acero_coral': return 'fortress';
    case 'osario_hueso_petroleo': return 'ossuary';
    default: return undefined;
  }
}

interface Layout {
  classify: (x: number, y: number) => TileKind;
  spawn: { x: number; y: number };
  portal: { x: number; y: number };
}

function cloisterLayout(w: number, h: number): Layout {
  const cx = w / 2;
  const cy = h / 2;
  return {
    // Square slab court, a two-tile moat, then the arcaded galleries and cave rock.
    classify: (x, y) => {
      const d = Math.max(Math.abs(x + 0.5 - cx), Math.abs(y + 0.5 - cy));
      if (d < 10) return 'ground';
      if (d < 12) return 'void';
      return 'wall';
    },
    spawn: { x: cx - 7 + 0.5, y: cy + 0.5 },
    portal: { x: cx + 7 + 0.5, y: cy + 0.5 },
  };
}

function bridgeLayout(w: number, h: number): Layout {
  const cy = Math.floor(h / 2);
  const portalX = w - 7;
  return {
    // A long slab deck with a landing at each end, hanging over a lava chasm.
    classify: (x, y) => {
      const dy = y + 0.5 - (cy + 0.5);
      const landing = (x >= 4 && x <= 7) || (x >= w - 8 && x <= w - 5);
      if (landing && Math.abs(dy) <= 9) return 'ground';
      if (x >= 8 && x < w - 8 && Math.abs(dy) <= 6) return 'ground';
      if (y <= cy - 10 || x <= 3 || x >= w - 4 || y >= h - 3) return 'wall';
      if (x >= 8 && x < w - 8 && y < cy - 6) return 'wall'; // rear parapet / cliff face
      return 'void';
    },
    spawn: { x: 6.5, y: cy + 0.5 },
    portal: { x: portalX + 0.5, y: cy + 0.5 },
  };
}

function fortressLayout(w: number, h: number): Layout {
  const cx = Math.floor(w / 2);
  const x0 = 4;
  const x1 = w - 5;
  const y0 = 7;
  const y1 = h - 6;
  return {
    // Walled slab plaza; the numbered gate is in the rear wall, lava below the cliffs.
    classify: (x, y) => {
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return 'ground';
      if (x <= 0 || y <= 0 || x >= w - 1 || y >= h - 1) return 'wall';
      if (x >= x0 - 2 && x <= x1 + 2 && y >= y0 - 2 && y <= y1 + 2) return 'wall';
      return 'void';
    },
    spawn: { x: cx + 0.5, y: y1 - 1 + 0.5 },
    portal: { x: cx + 0.5, y: y0 + 0.5 },
  };
}

function ossuaryLayout(w: number, h: number): Layout {
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  return {
    classify: (x, y) => {
      const inside = (px: number, py: number): boolean => {
        const dx = Math.abs(px - cx);
        const dy = Math.abs(py - cy);
        return dx <= cx - 3 && dy <= cy - 3 && dx + dy <= cx + cy - 11;
      };
      const edge = inside(x + 1, y) || inside(x - 1, y) || inside(x, y + 1) || inside(x, y - 1);
      if (inside(x, y)) {
        const onRing = Math.abs(x - cx) === cx - 3 || Math.abs(y - cy) === cy - 3 || Math.abs(x - cx) + Math.abs(y - cy) === cx + cy - 11;
        return onRing ? 'path' : 'ground';
      }
      return edge ? 'wall' : 'void';
    },
    spawn: { x: 5.5, y: cy + 0.5 },
    portal: { x: w - 5.5, y: cy + 0.5 },
  };
}

/** Builds the authored layout for a map, or `undefined` for procedural maps. */
export function buildScenarioLayout(map: MapDef, seed: string): ZoneMap | undefined {
  const style = scenarioStyle(map.paletteId);
  if (!style) return undefined;
  const { id, width, height, biome, floorIndex } = map;
  const layout = style === 'cloister' ? cloisterLayout(width, height)
    : style === 'bridge' ? bridgeLayout(width, height)
    : style === 'fortress' ? fortressLayout(width, height)
    : ossuaryLayout(width, height);

  const rng = createRng(`${seed}:scenario:${id}`);
  const tiles: TileKind[] = [];
  const variants: number[] = [];
  const { portal } = layout;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = x === Math.floor(portal.x) && y === Math.floor(portal.y) ? 'portal' : layout.classify(x, y);
      tiles.push(tile);
      variants.push(rng.int(0, 3));
    }
  }

  const props: ZoneMap['props'] = [];
  if (style === 'ossuary') {
    // The final arena keeps its fossil ribs along the rim; the other three are dressed by the renderer.
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (tiles[y * width + x] !== 'wall' || (x * 3 + y * 7) % 13 !== 0) continue;
        props.push({ id: `scenario_${x}_${y}`, kind: 'ribcage', x: x + 0.5, y: y + 0.5, blocking: false });
      }
    }
  }

  return { mapId: id, floorIndex, biome, width, height, tiles, variants, spawn: layout.spawn, portal: layout.portal, props };
}
