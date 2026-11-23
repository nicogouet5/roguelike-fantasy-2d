import type Phaser from 'phaser';
import { ATLAS_KEY } from '../assets/pixelArt.ts';
import { gridToScreen } from '../core/iso.ts';
import { scenarioStyle } from '../core/scenarioLayouts.ts';
import type { MapPaletteDef, TileKind, ZoneMap } from '../core/types.ts';
import { ruinKey, type RuinKind } from './arenaArchitecture.ts';
import { ensureScenarioTextures, hash, scnKey, type ArtStyle } from './scenarioArt.ts';
import type { MapVisuals } from './mapRenderer.ts';

/**
 * Draws the first three Falla 23 scenarios from their authored grid: open
 * slab floors (no path stripes), the drop that surrounds each one (moat water,
 * lava chasm, lava) and the architecture and props visible in the paintings.
 * Returns null for any other map so the generic renderer keeps handling it.
 */
export function renderScenarioVisuals(
  scene: Phaser.Scene,
  zone: ZoneMap,
  palette: MapPaletteDef,
  hasPortal: boolean
): MapVisuals | null {
  const style = scenarioStyle(palette.id);
  if (!style || style === 'ossuary') return null;
  const art: ArtStyle = style;
  ensureScenarioTextures(scene);

  const { width, height, floorIndex } = zone;
  const kindAt = (x: number, y: number): TileKind => (x < 0 || y < 0 || x >= width || y >= height ? 'wall' : zone.tiles[y * width + x]!);
  const isOpen = (x: number, y: number): boolean => {
    const k = kindAt(x, y);
    return k === 'ground' || k === 'path' || k === 'portal';
  };
  const isDrop = (x: number, y: number): boolean => kindAt(x, y) === 'void';
  const at = (gx: number, gy: number): { x: number; y: number } => gridToScreen(gx + 0.5, gy + 0.5);

  const objs: Phaser.GameObjects.Image[] = [];
  const cx = Math.floor(zone.portal.x);
  const cy = Math.floor(zone.portal.y);

  const ruin = (gx: number, gy: number, kind: RuinKind, scale: number): void => {
    const pos = at(gx, gy);
    objs.push(scene.add.image(pos.x, pos.y + 13, ruinKey(floorIndex, kind)).setOrigin(0.5, 70 / 72).setScale(scale).setDepth(pos.y - 3));
  };
  /** Bottom-anchored sprite standing on a tile. */
  const stand = (key: string, gx: number, gy: number, o: { dx?: number; dy?: number; scale?: number; flip?: boolean; depth?: number } = {}): void => {
    const pos = at(gx, gy);
    const img = scene.add.image(pos.x + (o.dx ?? 0), pos.y + 15 + (o.dy ?? 0), key).setOrigin(0.5, 1).setScale(o.scale ?? 1).setDepth(o.depth ?? pos.y);
    if (o.flip) img.setFlipX(true);
    objs.push(img);
  };
  const ribcage = (gx: number, gy: number): void => {
    const pos = at(gx, gy);
    objs.push(scene.add.image(pos.x, pos.y - 8, ATLAS_KEY, 'prop_ribcage').setOrigin(0.5, 0.85).setDepth(pos.y));
  };
  const brazierOnPillar = (gx: number, gy: number): void => {
    const pos = at(gx, gy);
    objs.push(scene.add.image(pos.x, pos.y - 68, scnKey('brazier')).setOrigin(0.5, 1).setDepth(pos.y - 2));
  };

  // Bounds of the walkable slab area, so set pieces follow any map-size change.
  let rimTop = height;
  let rimLeft = width;
  let rimRight = 0;
  let rimBottom = 0;
  zone.tiles.forEach((t, i) => {
    if (t !== 'ground' && t !== 'portal') return;
    const x = i % width;
    const y = Math.floor(i / width);
    rimLeft = Math.min(rimLeft, x);
    rimRight = Math.max(rimRight, x);
    rimTop = Math.min(rimTop, y);
    rimBottom = Math.max(rimBottom, y);
  });

  const gateTile = (gx: number, gy: number): boolean => art === 'fortress' && Math.abs(gx - cx) <= 1 && gy < rimTop && gy >= rimTop - 2;

  for (let gy = 0; gy < height; gy++) {
    for (let gx = 0; gx < width; gx++) {
      const idx = gy * width + gx;
      const kind = zone.tiles[idx]!;
      const v = (zone.variants[idx] ?? 0) & 3;
      const pos = at(gx, gy);

      if (kind === 'void') {
        objs.push(scene.add.image(pos.x, pos.y, scnKey('void', art, v)).setDepth(-1010 + pos.y * 0.01));
        continue;
      }

      if (kind === 'ground' || kind === 'portal' || kind === 'path') {
        objs.push(scene.add.image(pos.x, pos.y, scnKey('slab', art, v)).setDepth(-1000 + pos.y * 0.01));
        const archFace = art === 'bridge' && gx % 4 === 1;
        if (isDrop(gx, gy + 1)) {
          objs.push(scene.add.image(pos.x - 32, pos.y, scnKey(`faceL${archFace ? 'a' : ''}`, art)).setOrigin(0, 0).setDepth(-1000.5 + pos.y * 0.01));
          if (art === 'bridge' && gx % 5 === 2) {
            objs.push(scene.add.image(pos.x - 16, pos.y + 22, scnKey('chain')).setOrigin(0.5, 0).setScale(1, 1.4).setDepth(-1004 + pos.y * 0.01));
          }
          if (art === 'bridge' && gx % 3 === 0 && (gx <= rimLeft + 3 || gx >= rimRight - 3)) {
            objs.push(scene.add.image(pos.x - 16, pos.y + 10, scnKey('scaffold')).setOrigin(0.5, 0).setDepth(-1003 + pos.y * 0.01));
          }
        }
        if (isDrop(gx + 1, gy)) {
          objs.push(scene.add.image(pos.x, pos.y, scnKey(`faceR${archFace ? 'a' : ''}`, art)).setOrigin(0, 0).setDepth(-1000.5 + pos.y * 0.01));
        }
        continue;
      }

      // Walls and rock.
      objs.push(scene.add.image(pos.x, pos.y, scnKey('rock', art, v)).setDepth(-1010 + pos.y * 0.01));
      const facing = (px: number, py: number): boolean => isOpen(px, py) || isDrop(px, py);
      const back = facing(gx + 1, gy) || facing(gx, gy + 1);
      const front = facing(gx - 1, gy) || facing(gx, gy - 1);
      const seg = gx + gy;
      const r = hash(gx, gy, 11);

      if (art === 'cloister') {
        if (isDrop(gx + 1, gy) || isDrop(gx - 1, gy) || isDrop(gx, gy + 1) || isDrop(gx, gy - 1)) {
          if (back) {
            const landmark: RuinKind = seg % 5 === 0 ? 'arch' : seg % 5 === 2 ? 'pillar' : 'retaining';
            ruin(gx, gy, landmark, landmark === 'arch' ? 1.65 : 1.9);
          } else if (front) {
            ruin(gx, gy, seg % 7 === 0 ? 'pillar' : 'retaining', 1.65);
          }
        } else if (r < 0.07) {
          stand(scnKey('crystal'), gx, gy, { scale: 1.1 + hash(gx, gy, 3) * 0.7, dy: 4 });
        } else if (r < 0.085) {
          ribcage(gx, gy);
        }
      } else if (art === 'bridge') {
        if (isOpen(gx + 1, gy) || isOpen(gx, gy + 1)) {
          if (seg % 5 === 0) ruin(gx, gy, 'pillar', 1.9);
          else ruin(gx, gy, seg % 3 === 1 ? 'rubble' : 'retaining', 1.9);
        } else if (isOpen(gx - 1, gy) || isOpen(gx, gy - 1)) {
          if (gx === rimRight + 1 && Math.abs(gy - cy) <= 1) ruin(gx, gy, 'bastion', 1.9);
          else ruin(gx, gy, seg % 7 === 0 ? 'pillar' : 'retaining', 1.65);
        }
      } else if (!gateTile(gx, gy)) {
        // Fortress: battlemented ring around the plaza; lava spires on the outer rim.
        if (isOpen(gx + 1, gy) || isOpen(gx, gy + 1)) {
          ruin(gx, gy, seg % 5 === 2 ? 'pillar' : 'retaining', 1.9);
          if (seg % 5 === 0) {
            ruin(gx, gy, 'pillar', 1.9);
            brazierOnPillar(gx, gy);
          }
        } else if (isOpen(gx - 1, gy) || isOpen(gx, gy - 1)) {
          ruin(gx, gy, seg % 7 === 0 ? 'pillar' : 'retaining', 1.65);
        } else if (r < 0.05 && (isDrop(gx + 1, gy) || isDrop(gx, gy + 1))) {
          stand(scnKey('spire'), gx, gy, { scale: 0.8 + hash(gx, gy, 5) * 0.4, dy: 6 });
        }
      }
    }
  }

  // Scenario set pieces taken from the paintings.
  if (art === 'cloister') {
    // Lit doorway in the gallery, straight across the moat from the portal.
    for (let gx = cx + 1; gx < width; gx++) {
      if (kindAt(gx, cy) === 'wall') { ruin(gx, cy, 'arch', 1.95); break; }
    }
  } else if (art === 'bridge') {
    stand(scnKey('statue'), rimLeft + 1, rimTop + 1, { scale: 1.2 });
    stand(scnKey('winch'), rimRight - 1, rimTop + 1, { scale: 1.2 });
    for (const [gx, gy] of [[rimLeft, rimBottom], [rimLeft + 3, rimBottom], [rimRight - 3, rimBottom], [rimRight, rimBottom]] as const) {
      stand(scnKey('brazier'), gx, gy, { scale: 0.9, dy: 4 });
    }
  } else {
    const gateY = rimTop - 1;
    stand(scnKey('gate23'), cx, gateY, { scale: 1.2, dy: 10, depth: at(cx, gateY).y - 3 });
    for (const dx of [-3, 3]) stand(scnKey('banner'), cx + dx, gateY, { dy: -26, depth: at(cx + dx, gateY).y - 2 });
    for (const dx of [-2, 2]) stand(scnKey('brazier'), cx + dx, gateY + 1, { dy: 4 });
    stand(scnKey('skull'), rimRight - 3, rimTop, { scale: 1.1 });
    ribcage(rimLeft + 3, rimTop);
    stand(scnKey('stall'), rimLeft - 1, rimTop + 5, { dy: 8 });
    stand(scnKey('stairs'), rimRight, rimTop + 1, { dy: 8 });
    stand(scnKey('stairs'), rimLeft + 1, rimBottom, { dy: 12, flip: true });
    for (const [gx, gy] of [[rimLeft - 1, rimBottom + 1], [rimRight + 1, rimBottom + 1]] as const) {
      stand(scnKey('brazier'), gx, gy, { scale: 0.9, dy: 4 });
    }
  }

  let portal: Phaser.GameObjects.Sprite | null = null;
  if (hasPortal) {
    const pos = gridToScreen(zone.portal.x, zone.portal.y);
    portal = scene.add.sprite(pos.x, pos.y, ATLAS_KEY, 'fx_portal');
    portal.setTint(Number.parseInt(palette.portalTint.slice(1), 16));
    portal.setDepth(pos.y - 12);
    portal.setAlpha(0.38);
  }

  return { tiles: objs, props: [], portal };
}
