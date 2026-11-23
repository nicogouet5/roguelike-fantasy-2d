import type Phaser from 'phaser';
import { ATLAS_KEY } from '../assets/pixelArt.ts';
import { gridToScreen } from '../core/iso.ts';
import type { MapPaletteDef, ZoneMap } from '../core/types.ts';
import { ruinKey, type RuinKind } from './arenaArchitecture.ts';
import { addEclipseSeal, addEclipseSky } from './eclipseArt.ts';
import { renderScenarioVisuals } from './scenarioRenderer.ts';
import { addScenarioSurface, surfaceEdgeDistance } from './scenarioSurfaces.ts';
import { scenarioStyle } from '../core/scenarioLayouts.ts';
import { addScenarioDressing } from './scenarioDressing.ts';

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
  hasPortal: boolean,
  isBossZone = false
): MapVisuals {
  // The first three Falla 23 scenarios have their own painted-from-mockup renderer.
  const style = scenarioStyle(palette.id);
  const scenario = isBossZone ? null : renderScenarioVisuals(scene, zone, palette, hasPortal);
  if (scenario) {
    if (style) scenario.tiles.push(...addScenarioDressing(scene, zone, style));
    return scenario;
  }
  const tiles: Phaser.GameObjects.Image[] = isBossZone ? [addEclipseSky(scene)] : [];
  const props: Phaser.GameObjects.Sprite[] = [];
  const { width, height, floorIndex } = zone;
  const isOpen = (x: number, y: number): boolean => {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    const tile = zone.tiles[y * width + x];
    return tile !== 'wall' && tile !== 'void';
  };
  const addRuin = (x: number, y: number, kind: RuinKind, scale: number): void => {
    const pos = gridToScreen(x + 0.5, y + 0.5);
    const art = scene.add.image(pos.x, pos.y + 13, ruinKey(floorIndex, kind));
    art.setOrigin(0.5, 70 / 72).setScale(scale).setDepth(pos.y - 3);
    if (isBossZone) art.setTint(0xe57a92, 0xdf8aa1, 0x87576f, 0x825674);
    tiles.push(art);
  };

  for (let gy = 0; gy < zone.height; gy++) {
    for (let gx = 0; gx < zone.width; gx++) {
      const idx = gy * zone.width + gx;
      const kind = zone.tiles[idx]!;
      if (kind === 'void') continue;
      const variant = zone.variants[idx] ?? 0;
      const pos = gridToScreen(gx + 0.5, gy + 0.5);

      if (kind === 'wall') {
        const bed = scene.add.image(pos.x, pos.y, ATLAS_KEY, `tile_${zone.biome}_ground_${variant}`).setDepth(-1010 + pos.y * 0.01);
        if (isBossZone) bed.setTint(0x9d536a);
        tiles.push(bed);
        const backLip = isOpen(gx + 1, gy) || isOpen(gx, gy + 1);
        const frontLip = isOpen(gx - 1, gy) || isOpen(gx, gy - 1);
        const segment = gx + gy;
        const bridge = palette.id === 'puente_violeta_cobre';
        if (bridge && frontLip) {
          for (let drop = 1; drop <= (segment % 5 === 0 ? 5 : 2); drop++) {
            const pier = scene.add.image(pos.x, pos.y + drop * 13, ruinKey(floorIndex, 'retaining'));
            pier.setOrigin(0.5, 70 / 72).setScale(1.9).setDepth(-1020 + pos.y * 0.01 - drop * 0.001);
            pier.setTint(0x876276);
            tiles.push(pier);
          }
        }
        if (backLip) {
          const landmark = segment % 5 === 0 ? (bridge ? 'bastion' : 'arch') : segment % 5 === 2 ? 'pillar' : 'retaining';
          addRuin(gx, gy, landmark, landmark === 'arch' ? 1.65 : 1.9);
        } else if (frontLip) {
          addRuin(gx, gy, segment % 7 === 0 ? 'pillar' : 'retaining', 1.65);
        }
        continue;
      }

      const isPath = kind === 'path' || kind === 'portal';
      const painted = style && addScenarioSurface(scene, style, pos, gx, gy, variant, isPath, surfaceEdgeDistance(gx, gy, isOpen));
      if (painted) {
        tiles.push(painted);
        continue;
      }
      const frame = isPath
        ? `tile_${zone.biome}_path_${variant}`
        : `tile_${zone.biome}_ground_${variant}`;
      const tile = scene.add.image(pos.x, pos.y, ATLAS_KEY, frame);
      tile.setDepth(-1000 + pos.y * 0.01);
      if (palette.id === 'fortaleza_acero_coral') tile.setTint(isPath ? 0xde9d91 : 0xa0b9d4);
      if (isBossZone) tile.setTint(isPath ? 0xdb99a2 : 0xbe7f9b);
      tiles.push(tile);
    }
  }

  if (isBossZone) tiles.push(addEclipseSeal(scene, zone));

  let portal: Phaser.GameObjects.Sprite | null = null;
  if (hasPortal) {
    const pos = gridToScreen(zone.portal.x, zone.portal.y);
    portal = scene.add.sprite(pos.x, pos.y, ATLAS_KEY, 'fx_portal');
    portal.setTint(tintFromHex(palette.portalTint));
    portal.setDepth(pos.y - 12);
    portal.setAlpha(0.38);
    // The portal landmark is anchored behind the lit interaction tile, not drawn over it.
    const gateY = Math.floor(zone.portal.y);
    let gateX = Math.floor(zone.portal.x) + 1;
    while (gateX < width && isOpen(gateX, gateY)) gateX++;
    if (zone.tiles[gateY * width + gateX] === 'wall' && gateX < width) addRuin(gateX, gateY, 'arch', 1.95);
  }

  const propTint = isBossZone ? 0xca8398 : tintFromHex(palette.propTint);
  for (const prop of zone.props) {
    const pos = gridToScreen(prop.x, prop.y);
    const kind = zone.biome === 'jungle' && prop.kind === 'palm' ? 'rock' : prop.kind;
    const sprite = scene.add.sprite(pos.x, pos.y - 14, ATLAS_KEY, `prop_${kind}`);
    sprite.setTint(propTint);
    sprite.setOrigin(0.5, 0.85);
    sprite.setDepth(pos.y);
    props.push(sprite);
  }

  if (style) tiles.push(...addScenarioDressing(scene, zone, style));
  return { tiles, props, portal };
}
