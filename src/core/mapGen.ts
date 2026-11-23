import { createRng } from './rng.ts';
import { buildScenarioLayout } from './scenarioLayouts.ts';
import type { MapDef, PropEntity, TileKind, ZoneMap } from './types.ts';

export function tileAt(zone: ZoneMap, gx: number, gy: number): TileKind {
  const tx = Math.floor(gx);
  const ty = Math.floor(gy);
  if (tx < 0 || ty < 0 || tx >= zone.width || ty >= zone.height) return 'wall';
  return zone.tiles[ty * zone.width + tx] ?? 'wall';
}

export function isWalkable(zone: ZoneMap, gx: number, gy: number): boolean {
  const t = tileAt(zone, gx, gy);
  return t === 'ground' || t === 'path' || t === 'portal' || t === 'hazard';
}

export function hasWalkablePath(
  zone: ZoneMap,
  from: { x: number; y: number },
  to: { x: number; y: number }
): boolean {
  if (!isWalkable(zone, from.x, from.y) || !isWalkable(zone, to.x, to.y)) return false;
  const sx = Math.floor(from.x);
  const sy = Math.floor(from.y);
  const tx = Math.floor(to.x);
  const ty = Math.floor(to.y);
  const visited = new Uint8Array(zone.width * zone.height);
  const queue: number[] = [sy * zone.width + sx];
  visited[sy * zone.width + sx] = 1;

  while (queue.length > 0) {
    const idx = queue.shift()!;
    const cx = idx % zone.width;
    const cy = Math.floor(idx / zone.width);
    if (cx === tx && cy === ty) return true;
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const;
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= zone.width || ny >= zone.height) continue;
      const nIdx = ny * zone.width + nx;
      if (visited[nIdx]) continue;
      if (!isWalkable(zone, nx + 0.5, ny + 0.5)) continue;
      visited[nIdx] = 1;
      queue.push(nIdx);
    }
  }
  return false;
}

export function generateZoneMap(mapDef: MapDef, seed: string): ZoneMap {
  const authored = buildScenarioLayout(mapDef, seed);
  if (authored) return authored;
  const rng = createRng(`${seed}:map:${mapDef.id}:${mapDef.floorIndex}`);
  const { width, height, biome } = mapDef;
  const tiles: TileKind[] = new Array(width * height).fill('ground');
  const variants: number[] = new Array(width * height).fill(0).map(() => rng.int(0, 3));

  const setTile = (x: number, y: number, kind: TileKind): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    tiles[y * width + x] = kind;
  };

  // Organic cliff border
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const edgeDist = Math.min(x, y, width - 1 - x, height - 1 - y);
      const noise = (Math.sin(x * 0.45 + mapDef.floorIndex) + Math.cos(y * 0.5)) * 0.85;
      if (edgeDist < 2 + noise) {
        setTile(x, y, 'wall');
      }
    }
  }

  const spawn =
    biome === 'canyon'
      ? { x: Math.floor(width * 0.25) + 0.5, y: Math.floor(height * 0.72) + 0.5 }
      : { x: 5.5, y: Math.floor(height * 0.5) + 0.5 };
  const portal =
    biome === 'canyon'
      ? { x: Math.floor(width * 0.75) + 0.5, y: Math.floor(height * 0.28) + 0.5 }
      : { x: width - 6.5, y: Math.floor(height * 0.5) + 0.5 };

  // Carve winding prehistoric trail from spawn to portal
  const steps = width * 2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const wobble = Math.sin(t * Math.PI * 3 + rng.float(0, 0.01)) * (biome === 'canyon' ? 1.8 : 4.2);
    const px = Math.round(spawn.x + (portal.x - spawn.x) * t);
    const py = Math.round(spawn.y + (portal.y - spawn.y) * t + wobble);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = px + dx;
        const ny = py + dy;
        if (nx > 2 && ny > 2 && nx < width - 3 && ny < height - 3) {
          setTile(nx, ny, 'path');
        }
      }
    }
  }

  // Clear generous open zones around spawn, center arena, and portal
  const clearCircle = (cx: number, cy: number, r: number, tile: TileKind = 'ground'): void => {
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
        if (dx * dx + dy * dy <= r * r) {
          const nx = Math.floor(cx) + dx;
          const ny = Math.floor(cy) + dy;
          if (nx > 1 && ny > 1 && nx < width - 2 && ny < height - 2) {
            if (tiles[ny * width + nx] !== 'path') setTile(nx, ny, tile);
          }
        }
      }
    }
  };

  clearCircle(spawn.x, spawn.y, 4.2, 'path');
  clearCircle(portal.x, portal.y, 3.6, 'path');
  if (biome === 'canyon') {
    clearCircle(width * 0.5, height * 0.5, 8.2, 'ground');
  }

  // Scatter rocky obstacle outcrops (never blocking paths, spawn, portal, or boss center)
  const obstacleCount = biome === 'canyon' ? 4 : biome === 'volcano' ? 10 : 9;
  for (let i = 0; i < obstacleCount; i++) {
    const ox = rng.int(5, width - 6);
    const oy = rng.int(5, height - 6);
    const distSpawn = Math.hypot(ox - spawn.x, oy - spawn.y);
    const distPortal = Math.hypot(ox - portal.x, oy - portal.y);
    const distCenter = Math.hypot(ox - width * 0.5, oy - height * 0.5);
    if (distSpawn < 5.5 || distPortal < 5.5) continue;
    if (biome === 'canyon' && distCenter < 7.5) continue;
    if (tiles[oy * width + ox] === 'path') continue;

    const prev: [number, number, TileKind][] = [];
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = 0; dx <= 1; dx++) {
        if (dx === 1 && dy === 1 && rng.next() < 0.45) continue;
        const nx = ox + dx;
        const ny = oy + dy;
        const old = tiles[ny * width + nx]!;
        if (old === 'path') continue;
        prev.push([nx, ny, old]);
        setTile(nx, ny, 'wall');
      }
    }
    const candidate: ZoneMap = {
      mapId: mapDef.id,
      floorIndex: mapDef.floorIndex,
      biome,
      width,
      height,
      tiles,
      variants,
      spawn,
      portal,
      props: [],
    };
    if (!hasWalkablePath(candidate, spawn, portal)) {
      for (const [rx, ry, old] of prev) setTile(rx, ry, old);
    }
  }

  // Portal tile
  setTile(Math.floor(portal.x), Math.floor(portal.y), 'portal');

  // Prehistoric props (ferns, palms, fossil ribcages, amber crystals, DinoBlade giant embedded swords!)
  const props: PropEntity[] = [];
  let propId = 1;
  const propCount = biome === 'canyon' ? 22 : 42;
  for (let i = 0; i < propCount; i++) {
    const px = rng.int(3, width - 4) + 0.5;
    const py = rng.int(3, height - 4) + 0.5;
    const t = tileAt({ mapId: mapDef.id, floorIndex: mapDef.floorIndex, biome, width, height, tiles, variants, spawn, portal, props }, px, py);
    if (t === 'path' || t === 'portal') continue;
    if (Math.hypot(px - spawn.x, py - spawn.y) < 3.5) continue;
    if (Math.hypot(px - portal.x, py - portal.y) < 3.5) continue;
    if (biome === 'canyon' && Math.hypot(px - width * 0.5, py - height * 0.5) < 6.5) continue;

    let kind: PropEntity['kind'];
    if (biome === 'jungle') {
      const roll = rng.next();
      kind = roll < 0.48 ? 'fern' : roll < 0.78 ? 'palm' : roll < 0.9 ? 'ribcage' : 'rock';
    } else if (biome === 'volcano') {
      const roll = rng.next();
      kind = roll < 0.35 ? 'amber_crystal' : roll < 0.65 ? 'lava_vent' : roll < 0.85 ? 'rock' : 'ribcage';
    } else {
      const roll = rng.next();
      kind = roll < 0.42 ? 'giant_sword' : roll < 0.72 ? 'ribcage' : 'rock';
    }
    props.push({
      id: `prop_${propId++}`,
      kind,
      x: px,
      y: py,
      blocking: false,
    });
  }

  return {
    mapId: mapDef.id,
    floorIndex: mapDef.floorIndex,
    biome,
    width,
    height,
    tiles,
    variants,
    spawn,
    portal,
    props,
  };
}
