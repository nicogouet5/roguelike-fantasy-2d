import { describe, expect, it } from 'vitest';
import { loadGameData } from '../src/core/data.ts';
import { createGameState, stepGame } from '../src/core/engine.ts';
import { generateZoneMap, hasWalkablePath, isWalkable, tileAt } from '../src/core/mapGen.ts';

const data = loadGameData();
const SEEDS = ['alpha', 'dinoblade-2026', 'scenario-audit'];

describe('Falla 23 scenario layouts', () => {
  it('keeps spawn, portal and boss spot walkable, clear and connected', () => {
    for (const seed of SEEDS) {
      for (const def of data.mapsByFloor) {
        const zone = generateZoneMap(def, seed);
        const where = `${def.id}/${seed}`;
        // 3x3 clear area around the spawn so the player and pet never start in a wall.
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            expect(isWalkable(zone, zone.spawn.x + dx, zone.spawn.y + dy), `${where} spawn ${dx},${dy}`).toBe(true);
          }
        }
        expect(tileAt(zone, zone.portal.x, zone.portal.y), `${where} portal tile`).toBe('portal');
        expect(hasWalkablePath(zone, zone.spawn, zone.portal), `${where} spawn->portal`).toBe(true);
        if (def.bossId) {
          const boss = { x: def.width * 0.52, y: def.height * 0.48 };
          expect(isWalkable(zone, boss.x, boss.y), `${where} boss spot`).toBe(true);
          expect(hasWalkablePath(zone, zone.spawn, boss), `${where} spawn->boss`).toBe(true);
        }
      }
    }
  });

  it('keeps the slab area enclosed and has the drop (water, lava) the paintings show', () => {
    const dropByMap: Record<string, number> = { valle_helechos: 40, crater_obsidiana: 60, fortaleza_falla_23: 40 };
    for (const def of data.mapsByFloor) {
      const zone = generateZoneMap(def, 'seal');
      for (let y = 0; y < zone.height; y++) {
        for (let x = 0; x < zone.width; x++) {
          if (!isWalkable(zone, x + 0.5, y + 0.5)) continue;
          // Walking to a boundary row or column would let the player leave the map.
          expect(x > 0 && y > 0 && x < zone.width - 1 && y < zone.height - 1, `${def.id} ${x},${y} on map edge`).toBe(true);
        }
      }
      const min = dropByMap[def.id];
      if (min) {
        expect(zone.tiles.filter((t) => t === 'void').length, `${def.id} drop tiles`).toBeGreaterThan(min);
        expect(zone.tiles.filter((t) => t === 'path').length, `${def.id} routes`).toBeGreaterThan(60);
        expect(def.width * def.height, `${def.id} size`).toBeGreaterThanOrEqual(3500);
      }
    }
  });

  it('has no unreachable islands: every walkable tile connects to the spawn', () => {
    for (const def of data.mapsByFloor) {
      const zone = generateZoneMap(def, 'islands');
      const seen = new Set<number>([Math.floor(zone.spawn.y) * zone.width + Math.floor(zone.spawn.x)]);
      const stack = [...seen];
      while (stack.length > 0) {
        const idx = stack.pop()!;
        const x = idx % zone.width;
        const y = Math.floor(idx / zone.width);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const next = (y + dy) * zone.width + (x + dx);
          if (seen.has(next) || !isWalkable(zone, x + dx + 0.5, y + dy + 0.5)) continue;
          seen.add(next);
          stack.push(next);
        }
      }
      const walkable = zone.tiles.filter((_, i) => isWalkable(zone, (i % zone.width) + 0.5, Math.floor(i / zone.width) + 0.5)).length;
      expect(seen.size, `${def.id} unreachable walkable tiles`).toBe(walkable);
    }
  });

  it('offers enough floor for the mob budget and keeps props out of spawn and portal', () => {
    for (const def of data.mapsByFloor) {
      const zone = generateZoneMap(def, 'budget');
      const walkable = zone.tiles.filter((t) => t !== 'wall' && t !== 'void').length;
      expect(walkable, def.id).toBeGreaterThan(def.maxMobs * 20);
      for (const prop of zone.props) {
        expect(Math.hypot(prop.x - zone.spawn.x, prop.y - zone.spawn.y), `${def.id} ${prop.id}`).toBeGreaterThan(2);
        expect(Math.hypot(prop.x - zone.portal.x, prop.y - zone.portal.y), `${def.id} ${prop.id}`).toBeGreaterThan(2);
      }
    }
  });

  it('spawns every initial mob on walkable ground and keeps the player on it', () => {
    for (const [index, def] of data.mapsByFloor.entries()) {
      const state = createGameState(data, { classId: 'trex', seed: 'spawn-audit', floorIndex: index });
      expect(state.mobs.length, def.id).toBeGreaterThan(0);
      for (const mob of state.mobs) {
        expect(isWalkable(state.zone, mob.x, mob.y), `${def.id} ${mob.mobId}`).toBe(true);
      }
      expect(isWalkable(state.zone, state.player.x, state.player.y)).toBe(true);
      stepGame(state, data, 100, { moveX: 1, moveY: 0 });
      expect(isWalkable(state.zone, state.player.x, state.player.y), `${def.id} player after step`).toBe(true);
    }
  });
});
