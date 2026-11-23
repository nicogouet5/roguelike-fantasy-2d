import type Phaser from 'phaser';
import { ATLAS_KEY } from '../assets/pixelArt.ts';
import { gridToScreen } from '../core/iso.ts';
import type { MapPaletteDef, ZoneMap } from '../core/types.ts';
import { ruinKey, type RuinKind } from './arenaArchitecture.ts';

export interface MapVisuals {
  tiles: Phaser.GameObjects.Image[];
  props: Phaser.GameObjects.Sprite[];
  portal: Phaser.GameObjects.Sprite | null;
}

function tintFromHex(color: string): number {
  return Number.parseInt(color.slice(1), 16);
}

/**
 * Builds the static, map-identity layer. The palette depends only on the map
 * definition; per-tile variants still come from the seeded ZoneMap, so no
 * visual color changes from one frame to the next.
 */
export function renderMapVisuals(
  scene: Phaser.Scene,
  zone: ZoneMap,
  palette: MapPaletteDef,
  hasPortal: boolean
): MapVisuals {
  const tiles: Phaser.GameObjects.Image[] = [];
  const props: Phaser.GameObjects.Sprite[] = [];
  const { width, height, floorIndex } = zone;
  const isWall = (x: number, y: number): boolean => x < 0 || x >= width || y < 0 || y >= height || zone.tiles[y * width + x] === 'wall';
  const addRuin = (x: number, y: number, kind: RuinKind, scale: number): void => {
    const pos = gridToScreen(x + 0.5, y + 0.5);
    const art = scene.add.image(pos.x, pos.y + 13, ruinKey(floorIndex, kind));
    art.setOrigin(0.5, 70 / 72).setScale(scale).setDepth(pos.y - 3);
    tiles.push(art);
  };

  for (let gy = 0; gy < zone.height; gy++) {
    for (let gx = 0; gx < zone.width; gx++) {
      const idx = gy * zone.width + gx;
      const kind = zone.tiles[idx]!;
      const variant = zone.variants[idx] ?? 0;
      const pos = gridToScreen(gx + 0.5, gy + 0.5);

      if (kind === 'wall') {
        const bed = scene.add.image(pos.x, pos.y, ATLAS_KEY, `tile_${zone.biome}_ground_${variant}`).setDepth(-1010 + pos.y * 0.01);
        tiles.push(bed);
        const nearBoundary = Math.min(gx, gy, width - 1 - gx, height - 1 - gy) < 4;
        const backLip = !isWall(gx + 1, gy) || !isWall(gx, gy + 1);
        const frontLip = !isWall(gx - 1, gy) || !isWall(gx, gy - 1);
        if (nearBoundary && backLip) {
          const spawnRow = Math.floor(zone.spawn.y) - 1;
          const entry = floorIndex === 0 && gx < 4 && gy === spawnRow && !isWall(gx + 1, gy);
          const tower = (gx * 3 + gy + floorIndex * 2) % 6 === 0;
          addRuin(gx, gy, entry ? 'arch' : tower ? 'pillar' : 'retaining', entry ? 1.75 : 2);
        } else if (!nearBoundary) {
          addRuin(gx, gy, variant === 0 ? 'pillar' : 'rubble', variant === 0 ? 1.25 : 2);
        } else if ((gx === 0 && gy % 6 === 1) || (gy === 0 && gx % 6 === 1)) {
          addRuin(gx, gy, 'bastion', 2.6);
        } else if (frontLip) {
          addRuin(gx, gy, 'retaining', 1.8);
        }
        continue;
      }

      const isPath = kind === 'path' || kind === 'portal';
      const frame = isPath
        ? `tile_${zone.biome}_path_${variant}`
        : `tile_${zone.biome}_ground_${variant}`;
      const tile = scene.add.image(pos.x, pos.y, ATLAS_KEY, frame);
      tile.setDepth(-1000 + pos.y * 0.01);
      tiles.push(tile);
    }
  }

  let portal: Phaser.GameObjects.Sprite | null = null;
  if (hasPortal) {
    const pos = gridToScreen(zone.portal.x, zone.portal.y);
    portal = scene.add.sprite(pos.x, pos.y, ATLAS_KEY, 'fx_portal');
    portal.setTint(tintFromHex(palette.portalTint));
    portal.setDepth(pos.y - 12);
    portal.setAlpha(0.38);
    // The portal landmark is anchored behind the lit interaction tile, not drawn over it.
    addRuin(Math.floor(zone.portal.x) - 1, Math.floor(zone.portal.y) - 1, 'arch', 1.8);
  }

  const propTint = tintFromHex(palette.propTint);
  for (const prop of zone.props) {
    const pos = gridToScreen(prop.x, prop.y);
    const kind = zone.biome === 'jungle' && prop.kind === 'palm' ? 'rock' : prop.kind;
    const sprite = scene.add.sprite(pos.x, pos.y - 14, ATLAS_KEY, `prop_${kind}`);
    sprite.setTint(propTint);
    sprite.setOrigin(0.5, 0.85);
    sprite.setDepth(pos.y);
    props.push(sprite);
  }

  return { tiles, props, portal };
}
