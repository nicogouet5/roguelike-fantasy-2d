import type Phaser from 'phaser';
import { ATLAS_KEY } from '../assets/pixelArt.ts';
import { gridToScreen } from '../core/iso.ts';
import type { MapPaletteDef, ZoneMap } from '../core/types.ts';

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
  const groundTint = tintFromHex(palette.groundTint);
  const pathTint = tintFromHex(palette.pathTint);
  const wallTint = tintFromHex(palette.wallTint);

  for (let gy = 0; gy < zone.height; gy++) {
    for (let gx = 0; gx < zone.width; gx++) {
      const idx = gy * zone.width + gx;
      const kind = zone.tiles[idx]!;
      const variant = zone.variants[idx] ?? 0;
      const pos = gridToScreen(gx + 0.5, gy + 0.5);

      if (kind === 'wall') {
        const wall = scene.add.image(pos.x, pos.y - 8, ATLAS_KEY, `tile_${zone.biome}_wall`);
        wall.setTint(wallTint);
        wall.setDepth(pos.y - 4);
        tiles.push(wall);
        continue;
      }

      const isPath = kind === 'path' || kind === 'portal';
      const frame = isPath
        ? `tile_${zone.biome}_path_${variant}`
        : `tile_${zone.biome}_ground_${variant}`;
      const tile = scene.add.image(pos.x, pos.y, ATLAS_KEY, frame);
      tile.setTint(isPath ? pathTint : groundTint);
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
    portal.setAlpha(0.25);
  }

  const propTint = tintFromHex(palette.propTint);
  for (const prop of zone.props) {
    const pos = gridToScreen(prop.x, prop.y);
    const sprite = scene.add.sprite(pos.x, pos.y - 14, ATLAS_KEY, `prop_${prop.kind}`);
    sprite.setTint(propTint);
    sprite.setOrigin(0.5, 0.85);
    sprite.setDepth(pos.y);
    props.push(sprite);
  }

  return { tiles, props, portal };
}
