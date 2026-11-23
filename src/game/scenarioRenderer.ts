import type Phaser from 'phaser';
import { ATLAS_KEY } from '../assets/pixelArt.ts';
import { gridToScreen } from '../core/iso.ts';
import { scenarioSetPieces, scenarioStyle } from '../core/scenarioLayouts.ts';
import type { MapPaletteDef, TileKind, ZoneMap } from '../core/types.ts';
import { ruinKey, type RuinKind } from './arenaArchitecture.ts';
import { ensureScenarioTextures, hash, scnKey, type ArtStyle } from './scenarioArt.ts';
import type { MapVisuals } from './mapRenderer.ts';

/**
 * Draws the first three Falla 23 scenarios from their authored grid: slab
 * courts joined by coloured routes, the drop around them (moat water, lava
 * chasm, lava) and the architecture and props visible in the paintings.
 * Each level has its own dominant colour (see `scenarioArt.ts`).
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
  /** True when any non-wall tile lies within `r` tiles (keeps deep rock undrawn). */
  const nearOpenSpace = (gx: number, gy: number, r: number): boolean => {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (kindAt(gx + dx, gy + dy) !== 'wall') return true;
      }
    }
    return false;
  };
  const at = (gx: number, gy: number): { x: number; y: number } => gridToScreen(gx + 0.5, gy + 0.5);

  const objs: Phaser.GameObjects.Image[] = [];

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

  // Wall tiles owned by a set piece (gate, doorway, tower) get no generic masonry.
  const pieces = scenarioSetPieces(palette.id, width, height);
  const owned = new Set<number>();
  for (const p of pieces) {
    if (p.kind === 'doorway' || p.kind === 'tower') owned.add(p.y * width + p.x);
    if (p.kind === 'gate') {
      for (let dy = -3; dy <= 0; dy++) for (let dx = -3; dx <= 3; dx++) owned.add((p.y + dy) * width + p.x + dx);
    }
  }

  const crystalKey = scnKey(art === 'cloister' ? 'crystal_amber' : 'crystal');
  const landingEdge = (gx: number): boolean => gx <= 13 || gx >= width - 14;

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
        const surface = kind === 'ground' ? 'slab' : 'path';
        objs.push(scene.add.image(pos.x, pos.y, scnKey(surface, art, v)).setDepth(-1000 + pos.y * 0.01));
        const archFace = art === 'bridge' && gx % 4 === 1;
        if (isDrop(gx, gy + 1)) {
          objs.push(scene.add.image(pos.x - 32, pos.y, scnKey(`faceL${archFace ? 'a' : ''}`, art)).setOrigin(0, 0).setDepth(-1000.5 + pos.y * 0.01));
          if (art === 'bridge' && gx % 5 === 2) {
            objs.push(scene.add.image(pos.x - 16, pos.y + 22, scnKey('chain')).setOrigin(0.5, 0).setScale(1, 1.4).setDepth(-1004 + pos.y * 0.01));
          }
          if (art === 'bridge' && gx % 3 === 0 && landingEdge(gx)) {
            objs.push(scene.add.image(pos.x - 16, pos.y + 10, scnKey('scaffold')).setOrigin(0.5, 0).setDepth(-1003 + pos.y * 0.01));
          }
        }
        if (isDrop(gx + 1, gy)) {
          objs.push(scene.add.image(pos.x, pos.y, scnKey(`faceR${archFace ? 'a' : ''}`, art)).setOrigin(0, 0).setDepth(-1000.5 + pos.y * 0.01));
        }
        continue;
      }

      // Walls and rock. Rock far from any open space stays undrawn (map background shows through).
      if (!nearOpenSpace(gx, gy, 3)) continue;
      objs.push(scene.add.image(pos.x, pos.y, scnKey('rock', art, v)).setDepth(-1010 + pos.y * 0.01));
      if (owned.has(idx)) continue;
      const facing = (px: number, py: number): boolean => isOpen(px, py) || isDrop(px, py);
      const back = facing(gx + 1, gy) || facing(gx, gy + 1);
      const front = facing(gx - 1, gy) || facing(gx, gy - 1);
      const seg = gx + gy;
      const r = hash(gx, gy, 11);

      if (art === 'cloister') {
        if (back) {
          const landmark: RuinKind = seg % 5 === 0 ? 'arch' : seg % 5 === 2 ? 'pillar' : 'retaining';
          ruin(gx, gy, landmark, landmark === 'arch' ? 1.65 : 1.9);
        } else if (front) {
          ruin(gx, gy, seg % 7 === 0 ? 'pillar' : 'retaining', 1.65);
        } else if (r < 0.07 && nearOpenSpace(gx, gy, 6)) {
          stand(crystalKey, gx, gy, { scale: 1.1 + hash(gx, gy, 3) * 0.7, dy: 4 });
        } else if (r < 0.085 && nearOpenSpace(gx, gy, 6)) {
          ribcage(gx, gy);
        }
      } else if (art === 'bridge') {
        if (isOpen(gx + 1, gy) || isOpen(gx, gy + 1)) {
          if (seg % 5 === 0) ruin(gx, gy, 'pillar', 1.9);
          else ruin(gx, gy, seg % 3 === 1 ? 'rubble' : 'retaining', 1.9);
        } else if (isOpen(gx - 1, gy) || isOpen(gx, gy - 1)) {
          ruin(gx, gy, seg % 7 === 0 ? 'pillar' : 'retaining', 1.65);
        }
      } else if (isOpen(gx + 1, gy) || isOpen(gx, gy + 1)) {
        // Fortress: battlemented walls and partitions; lava spires on the rim.
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

  // Set pieces defined by the layout (braziers, gate, banners, statues...).
  for (const p of pieces) {
    const pos = at(p.x, p.y);
    switch (p.kind) {
      case 'doorway': ruin(p.x, p.y, 'arch', 1.95); break;
      case 'tower': ruin(p.x, p.y, 'bastion', 1.9); break;
      case 'gate': stand(scnKey('gate23'), p.x, p.y, { scale: 1.2, dy: 10, depth: pos.y - 3 }); break;
      case 'banner': stand(scnKey('banner'), p.x, p.y, { dy: -26, depth: pos.y - 2 }); break;
      case 'brazier': stand(scnKey('brazier'), p.x, p.y, { scale: 0.9, dy: 4 }); break;
      case 'skull': stand(scnKey('skull'), p.x, p.y, { scale: 1.1 }); break;
      case 'rib': ribcage(p.x, p.y); break;
      case 'stall': stand(scnKey('stall'), p.x, p.y, { dy: 8 }); break;
      case 'stairs': stand(scnKey('stairs'), p.x, p.y, { dy: 10, flip: p.flip }); break;
      case 'statue': stand(scnKey('statue'), p.x, p.y, { scale: 1.2, flip: p.flip }); break;
      case 'winch': stand(scnKey('winch'), p.x, p.y, { scale: 1.2, flip: p.flip }); break;
      case 'crystal': stand(crystalKey, p.x, p.y, { scale: p.scale ?? 1.4, dy: 4 }); break;
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
