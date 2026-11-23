import type { MapDef, TileKind, ZoneMap } from './types.ts';
import { createRng } from './rng.ts';

/**
 * Grid-space interpretations of the Falla 23 concept paintings.
 *
 * Tile semantics shared with the renderer:
 *  - `ground`  walkable slab floor of courts, plazas and decks
 *  - `path`    walkable route (gallery ring, causeway, plank catwalk, processional road)
 *  - `void`    non-walkable drop: moat water (claustro), lava chasm (puente), lava (fortaleza)
 *  - `wall`    non-walkable masonry / rock
 *  - `portal`  walkable exit tile, always on a route or slab
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

/** Visual-only decoration anchored to a tile; the renderer maps each kind to art. */
export interface SetPiece {
  kind: 'brazier' | 'banner' | 'gate' | 'skull' | 'rib' | 'stall' | 'stairs' | 'statue' | 'winch' | 'crystal' | 'doorway' | 'tower';
  x: number;
  y: number;
  flip?: boolean;
  scale?: number;
}

interface Layout {
  classify: (x: number, y: number) => TileKind;
  spawn: { x: number; y: number };
  portal: { x: number; y: number };
  pieces: SetPiece[];
}

const within = (v: number, lo: number, hi: number): boolean => v >= lo && v <= hi;

/**
 * Claustro Mineral (jade and amber): a slab island court reached by four
 * causeways across the moat, ringed by an arcaded gallery road with four
 * garden courts and their ponds in the corners.
 */
function cloisterLayout(w: number, h: number): Layout {
  const cx = w / 2;
  const cy = h / 2;
  const pieces: SetPiece[] = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      pieces.push({ kind: 'brazier', x: Math.floor(cx + sx * 10.5), y: Math.floor(cy + sy * 10.5) });
      pieces.push({ kind: 'crystal', x: Math.floor(cx + sx * 21), y: Math.floor(cy + sy * 15.5) });
      pieces.push({ kind: 'rib', x: Math.floor(cx + sx * 15.5), y: Math.floor(cy + sy * 21) });
    }
  }
  for (const [dx, dy] of [[-28, 0], [28, 0], [0, -28], [0, 28]] as const) {
    pieces.push({ kind: 'doorway', x: Math.floor(cx + dx), y: Math.floor(cy + dy) });
  }
  return {
    classify: (x, y) => {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      if (d <= 11) return 'ground';
      if (d > 27) return 'wall';
      if (d > 23) return 'path';
      if (Math.abs(dx) <= 1.5 || Math.abs(dy) <= 1.5) return 'path'; // causeways over the moat
      if (Math.abs(dx) > 13 && Math.abs(dy) > 13) {
        const pond = Math.abs(Math.abs(dx) - 18.5) <= 2 && Math.abs(Math.abs(dy) - 18.5) <= 2;
        return pond ? 'void' : 'ground';
      }
      return 'void';
    },
    spawn: { x: cx - 25.5, y: cy + 0.5 },
    portal: { x: cx + 25.5, y: cy + 0.5 },
    pieces,
  };
}

/**
 * Puente Quebrado (violet, copper and lava): a long stone span between two
 * fortified landings with a wider mid plaza, plus two plank catwalks on either
 * side that join the span through short connectors.
 */
function bridgeLayout(w: number, h: number): Layout {
  const cy = h / 2;
  const x1 = w - 5; // east landing last tile
  const rows = (y: number): number => y + 0.5 - cy; // signed distance from the span axis
  const pieces: SetPiece[] = [
    { kind: 'statue', x: 6, y: Math.floor(cy - 12) },
    { kind: 'winch', x: x1 - 1, y: Math.floor(cy - 12) },
    { kind: 'winch', x: 6, y: Math.floor(cy + 11), flip: true },
    { kind: 'statue', x: x1 - 1, y: Math.floor(cy + 11), flip: true },
    { kind: 'tower', x: 3, y: Math.floor(cy) },
    { kind: 'tower', x: w - 4, y: Math.floor(cy) },
    { kind: 'banner', x: 13, y: Math.floor(cy - 13) },
    { kind: 'banner', x: x1 - 9, y: Math.floor(cy - 13) },
  ];
  for (const [px, py] of [[14, -5.5], [14, 5.5], [w - 15, -5.5], [w - 15, 5.5], [34, -9.5], [45, -9.5], [34, 9.5], [45, 9.5]] as const) {
    pieces.push({ kind: 'brazier', x: px, y: Math.floor(cy + py) });
  }
  for (const px of [4, 13, w - 14, x1]) pieces.push({ kind: 'brazier', x: px, y: Math.floor(cy + 13) });
  return {
    classify: (x, y) => {
      const dy = rows(y);
      const catwalk = Math.abs(dy) >= 12.5 && Math.abs(dy) <= 13.5 && within(x, 14, w - 15);
      const connector = Math.abs(dy) > 5.5 && Math.abs(dy) < 12.5 && (within(x, 26, 27) || within(x, w - 28, w - 27));
      if (catwalk || connector) return 'path';
      const landing = (within(x, 4, 13) || within(x, w - 14, x1)) && Math.abs(dy) <= 13.5;
      const span = within(x, 14, w - 15) && Math.abs(dy) <= 5.5;
      const plaza = within(x, 34, 45) && Math.abs(dy) <= 9.5;
      if (landing || span || plaza) return 'ground';
      if (y < cy - 14 || y >= h - 6 || x <= 3 || x >= w - 4) return 'wall';
      return 'void';
    },
    spawn: { x: 6.5, y: Math.floor(cy) + 0.5 },
    portal: { x: x1 - 1.5, y: Math.floor(cy) + 0.5 },
    pieces,
  };
}

/**
 * Fortaleza Falla 23 (steel blue and coral): a processional road runs from the
 * south forecourt through the great plaza to the numbered gate. A cross road
 * links the west barracks yard and the east bone yard through partition gaps,
 * and lava lakes fill the northern pockets.
 */
function fortressLayout(w: number, _h: number): Layout {
  const cx = Math.floor(w / 2);
  const gateY = 5;
  const pieces: SetPiece[] = [
    { kind: 'gate', x: cx, y: gateY },
    { kind: 'banner', x: cx - 4, y: gateY },
    { kind: 'banner', x: cx + 3, y: gateY },
    { kind: 'skull', x: cx + 20, y: 28 },
    { kind: 'rib', x: cx - 21, y: 28 },
    { kind: 'stall', x: cx - 24, y: 25 },
    { kind: 'stairs', x: cx - 13, y: 24 },
    { kind: 'stairs', x: cx + 12, y: 39, flip: true },
  ];
  for (const [px, py] of [[cx - 3, 9], [cx + 2, 9], [cx - 3, 14], [cx + 2, 14], [cx - 3, 20], [cx + 2, 20], [cx - 3, 43], [cx + 2, 43], [cx - 8, 52], [cx + 7, 52], [cx - 8, 58], [cx + 7, 58]] as const) {
    pieces.push({ kind: 'brazier', x: px, y: py });
  }
  return {
    classify: (x, y) => {
      const road = within(x, cx - 2, cx + 1) && within(y, 6, 57);
      const crossRoad = within(y, 30, 33) && within(x, 8, w - 9);
      if (road || crossRoad) return 'path';
      const plaza = within(x, 20, w - 21) && within(y, 18, 45);
      const westYard = within(x, 6, 17) && within(y, 24, 40);
      const eastYard = within(x, w - 18, w - 7) && within(y, 24, 40);
      const forecourt = within(x, cx - 8, cx + 7) && within(y, 52, 58);
      if (plaza || westYard || eastYard || forecourt) return 'ground';
      const lavaWest = within(x, 8, cx - 4) && within(y, 6, 17);
      const lavaEast = within(x, cx + 3, w - 9) && within(y, 6, 17);
      if (lavaWest || lavaEast) return 'void';
      return 'wall';
    },
    spawn: { x: cx + 0.5, y: 56.5 },
    portal: { x: cx + 0.5, y: 7.5 },
    pieces,
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
    pieces: [],
  };
}

function layoutFor(paletteId: string, width: number, height: number): Layout | undefined {
  const style = scenarioStyle(paletteId);
  if (!style) return undefined;
  return style === 'cloister' ? cloisterLayout(width, height)
    : style === 'bridge' ? bridgeLayout(width, height)
    : style === 'fortress' ? fortressLayout(width, height)
    : ossuaryLayout(width, height);
}

/** Visual set pieces (braziers, gate, statues...) for a scenario; empty for procedural maps. */
export function scenarioSetPieces(paletteId: string, width: number, height: number): SetPiece[] {
  return layoutFor(paletteId, width, height)?.pieces ?? [];
}

/** Builds the authored layout for a map, or `undefined` for procedural maps. */
export function buildScenarioLayout(map: MapDef, seed: string): ZoneMap | undefined {
  const layout = layoutFor(map.paletteId, map.width, map.height);
  if (!layout) return undefined;
  const { id, width, height, biome, floorIndex } = map;

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
  if (scenarioStyle(map.paletteId) === 'ossuary') {
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
