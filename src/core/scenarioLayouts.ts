import type { MapDef, TileKind, ZoneMap } from './types.ts';
import { gridToScreen, type Point2D } from './iso.ts';
import { createRng } from './rng.ts';

/**
 * Grid-space interpretations of the four hand-painted Falla 23 arenas
 * (`src/assets/maps/map_*.jpg`, drawn by `src/game/paintedMaps.ts`).
 *
 * Tile semantics shared with the renderer:
 *  - `ground`  walkable slab floor of courts, plazas and decks
 *  - `path`    walkable route (bridges, plank decks, rune rings, sandstone roads)
 *  - `void`    non-walkable drop: moat water (claustro), lava abyss (puente), lava grates (fortaleza)
 *  - `wall`    non-walkable masonry / rock
 *  - `portal`  walkable exit tile, always on a route or slab
 *
 * Grid +x runs to the lower right of the screen and +y to the lower left, so
 * the "back" of every scenario is the small-x / small-y side.
 *
 * Every shape below is measured in painting pixels (0..PAINTING_SIZE) and each
 * grid cell is classified by projecting its centre into the painting, so the
 * collision follows the artwork exactly as the renderer places it.
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

/** Side of the square hand-painted arena images, in pixels. */
export const PAINTING_SIZE = 1400;

/**
 * How a painting sits on the isometric grid: painting pixel (anchorX, anchorY)
 * lands on the grid centre and each painting pixel spans (scaleX, scaleY)
 * screen pixels. The paintings use their own iso angle (about 1.4-1.8:1), so
 * `scaleY / scaleX` flattens each one to the exact 2:1 projection of the grid.
 */
export interface PaintedFrame {
  anchorX: number;
  anchorY: number;
  scaleX: number;
  scaleY: number;
}

export const PAINTED_FRAMES: Readonly<Record<ScenarioStyle, PaintedFrame>> = {
  // Court diamond 1355x940 px (1.44:1) -> 23x23 tiles.
  cloister: { anchorX: 697, anchorY: 720, scaleX: 1.1, scaleY: 0.792 },
  // Platform diamond 1330x775 px (1.72:1) -> 28x28 tiles.
  bridge: { anchorX: 700, anchorY: 615, scaleX: 1.35, scaleY: 1.161 },
  // Floor rails run at 1.77:1; the anchor is the crossing of the sandstone roads.
  fortress: { anchorX: 700, anchorY: 760, scaleX: 1.05, scaleY: 0.929 },
  // Top-down pit: the 1214x1100 px floor ellipse becomes a circle of radius 12 tiles.
  ossuary: { anchorX: 700, anchorY: 700, scaleX: 0.895, scaleY: 0.4936 },
};

/** Painting pixel under a grid point. */
export function gridToPainting(frame: PaintedFrame, width: number, height: number, gx: number, gy: number): Point2D {
  const centre = gridToScreen(width / 2, height / 2);
  const p = gridToScreen(gx, gy);
  return { x: frame.anchorX + (p.x - centre.x) / frame.scaleX, y: frame.anchorY + (p.y - centre.y) / frame.scaleY };
}

/** Grid point under a painting pixel. */
export function paintingToGrid(frame: PaintedFrame, width: number, height: number, px: number, py: number): Point2D {
  const centre = gridToScreen(width / 2, height / 2);
  const sx = centre.x + (px - frame.anchorX) * frame.scaleX;
  const sy = centre.y + (py - frame.anchorY) * frame.scaleY;
  // Inverse of gridToScreen (64x32 tiles).
  return { x: (sx / 32 + sy / 16) / 2, y: (sy / 16 - sx / 32) / 2 };
}

type Poly = readonly (readonly [number, number])[];

function inPoly(p: Point2D, poly: Poly): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if ((yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const inAny = (p: Point2D, polys: readonly Poly[]): boolean => polys.some((poly) => inPoly(p, poly));

/** True inside the painting, at least `margin` px from its border (the renderer fades the border). */
const inCanvas = (p: Point2D, margin: number): boolean =>
  p.x >= margin && p.y >= margin && p.x <= PAINTING_SIZE - margin && p.y <= PAINTING_SIZE - margin;

/** Polygon scaled about a painting point (used for the moat around the cloister court). */
const grow = (poly: Poly, cx: number, cy: number, k: number): Poly =>
  poly.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k] as const);

/**
 * Classifies every cell from painting-space shapes, keeps the outer ring as
 * masonry and walls off any walkable pocket that the spawn cannot reach.
 */
function paintedLayout(
  style: ScenarioStyle, w: number, h: number,
  classifyPx: (p: Point2D) => TileKind,
  spawnPx: readonly [number, number], portalPx: readonly [number, number],
): Layout {
  const frame = PAINTED_FRAMES[style];
  const cell = (px: readonly [number, number]): { x: number; y: number } => {
    const g = paintingToGrid(frame, w, h, px[0], px[1]);
    return { x: Math.floor(g.x) + 0.5, y: Math.floor(g.y) + 0.5 };
  };
  const tiles: TileKind[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      const p = gridToPainting(frame, w, h, x + 0.5, y + 0.5);
      const kind = edge ? 'wall' : classifyPx(p);
      // Nothing walkable inside the feathered border of the painting.
      tiles.push((kind === 'ground' || kind === 'path') && !inCanvas(p, 50) ? 'wall' : kind);
    }
  }
  const spawn = cell(spawnPx);
  const portal = cell(portalPx);
  const open = (i: number): boolean => tiles[i] === 'ground' || tiles[i] === 'path';
  const seen = new Uint8Array(w * h);
  const stack = [Math.floor(spawn.y) * w + Math.floor(spawn.x)];
  seen[stack[0]!] = 1;
  while (stack.length > 0) {
    const i = stack.pop()!;
    const x = i % w;
    for (const n of [i - w, i + w, x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1]) {
      if (n < 0 || n >= w * h || seen[n] || !open(n)) continue;
      seen[n] = 1;
      stack.push(n);
    }
  }
  for (let i = 0; i < tiles.length; i++) if (open(i) && !seen[i]) tiles[i] = 'wall';
  return { classify: (x, y) => tiles[y * w + x]!, spawn, portal, pieces: [] };
}

/**
 * Claustro Mineral (jade and amber): an amber-cracked slab court in a jade
 * moat, crossed by four carved stone bridges that end at the arched gallery.
 * Spawn on the court by the north-west bridge; the exit waits on the far
 * landing of the south-east bridge.
 */
function cloisterLayout(w: number, h: number): Layout {
  const court: Poly = [[20, 718], [695, 250], [1375, 735], [695, 1190]];
  const moat = grow(court, 697, 720, 1.3);
  const bridges: Poly[] = [
    [[222, 335], [312, 262], [516, 400], [416, 467]], // north-west
    [[1085, 262], [1182, 340], [984, 477], [884, 393]], // north-east
    [[165, 1045], [255, 1130], [470, 983], [375, 898]], // south-west
    [[1232, 1050], [1132, 1132], [925, 983], [1030, 908]], // south-east
  ];
  const landings: Poly[] = [
    [[187, 363], [347, 234], [290, 202], [130, 330]],
    [[1050, 234], [1215, 365], [1270, 330], [1105, 200]],
    [[130, 1015], [290, 1160], [235, 1195], [75, 1050]],
    [[1265, 1020], [1100, 1160], [1155, 1195], [1320, 1055]],
  ];
  return paintedLayout('cloister', w, h, (p) => {
    if (inPoly(p, court)) return 'ground';
    if (inAny(p, bridges) || inAny(p, landings)) return 'path';
    return inPoly(p, moat) && inCanvas(p, 30) ? 'void' : 'wall';
  }, [480, 470], [1185, 1100]);
}

/**
 * Puente Quebrado (violet, copper and lava): a square obsidian platform over
 * the lava abyss, with a copper-and-turquoise rune octagon in the middle and
 * three riveted plank decks hanging over its edges.
 */
function bridgeLayout(w: number, h: number): Layout {
  const platform: Poly = [[35, 605], [700, 228], [1365, 605], [700, 1003]];
  const octagonOuter: Poly = [[600, 443], [800, 443], [997, 553], [997, 703], [800, 810], [600, 810], [403, 703], [403, 553]];
  const octagonInner: Poly = [[630, 505], [770, 505], [925, 590], [925, 665], [770, 750], [630, 750], [475, 665], [475, 590]];
  const decks: Poly[] = [
    [[192, 432], [305, 495], [520, 360], [405, 295]], // north-west
    [[192, 845], [345, 761], [555, 888], [395, 972]], // south-west
    [[1112, 735], [1245, 808], [1005, 952], [865, 880]], // south-east
  ];
  return paintedLayout('bridge', w, h, (p) => {
    if (inAny(p, decks)) return 'path';
    if (inPoly(p, octagonOuter) && !inPoly(p, octagonInner)) return 'path';
    if (inPoly(p, platform)) return 'ground';
    return inCanvas(p, 20) ? 'void' : 'wall';
  }, [250, 610], [1190, 610]);
}

/**
 * Fortaleza Falla 23 (steel blue and coral): an open crossroad courtyard of
 * steel-framed slabs with fossil skeletons in the sandstone roads, closed at
 * the back by battlements with lava grates along their base. The exit is the
 * arched gate at the north-east corner.
 */
function fortressLayout(w: number, h: number): Layout {
  const frame = PAINTED_FRAMES.fortress;
  const battlements: Poly = [[0, 0], [1400, 0], [1400, 470], [1260, 410], [1010, 265], [700, 95], [150, 398], [0, 430]];
  const lava: Poly[] = [
    [[0, 430], [150, 398], [245, 462], [0, 605]], // west pool
    [[150, 398], [700, 95], [730, 198], [245, 462]], // west grates
    [[700, 95], [1010, 265], [1050, 355], [700, 212]], // east pool and grates
    [[1195, 455], [1290, 420], [1400, 470], [1400, 575], [1330, 565]], // gate pool
  ];
  const rubble: Poly[] = [
    [[0, 1190], [260, 1400], [0, 1400]], // floor front edge
    [[1350, 1140], [1400, 1140], [1400, 1400], [1350, 1400]], // corner tower
  ];
  // The two sandstone roads cross at the anchor and run along the grid axes.
  const centre = { x: w / 2, y: h / 2 };
  return paintedLayout('fortress', w, h, (p) => {
    if (!inCanvas(p, 60) || inPoly(p, battlements) || inAny(p, rubble)) return 'wall';
    if (inAny(p, lava)) return 'void';
    const g = paintingToGrid(frame, w, h, p.x, p.y);
    return Math.abs(g.x - centre.x) <= 2.5 || Math.abs(g.y - centre.y) <= 2.5 ? 'path' : 'ground';
  }, [230, 1040], [1150, 385]);
}

/**
 * Osario (bone and petrol): a circular bone-mosaic pit ringed by teal rim
 * stones. The floor ellipse in the painting is a circle on the grid; the
 * glowing cyan-amber ring is the route.
 */
function ossuaryLayout(w: number, h: number): Layout {
  const ellipse = (p: Point2D, ax: number, ay: number): number => Math.hypot((p.x - 700) / ax, (p.y - 700) / ay);
  return paintedLayout('ossuary', w, h, (p) => {
    const floor = ellipse(p, 607, 550);
    if (floor <= 1) return Math.abs(ellipse(p, 345, 320) - 1) <= 0.1 ? 'path' : 'ground';
    return floor <= 1.12 ? 'wall' : 'void';
  }, [260, 700], [1140, 700]);
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
