import type Phaser from 'phaser';
import { ATLAS_KEY } from '../assets/pixelArt.ts';
import { gridToScreen } from '../core/iso.ts';
import { isWalkable } from '../core/mapGen.ts';
import type { ScenarioStyle } from '../core/scenarioLayouts.ts';
import type { ZoneMap } from '../core/types.ts';
import { hash } from './scenarioArt.ts';

const KIT = {
  cloister: [['planter', 'fern', 'fern'], ['urn', 'planter', 'rock']],
  bridge: [['crate', 'barrel', 'crate'], ['barrel', 'rock', 'crate']],
  fortress: [['crate', 'barrel', 'rock'], ['rack', 'crate', 'barrel']],
  ossuary: [['urn', 'ribs', 'urn'], ['ribs', 'rack', 'rock']],
} as const;

type Crafted = 'planter' | 'crate' | 'barrel' | 'urn' | 'rack';
type Piece = Crafted | 'fern' | 'rock' | 'ribs';
const raw: Partial<Record<Piece, string>> = { fern: 'prop_fern', rock: 'prop_rock', ribs: 'prop_ribcage' };

function buildProps(scene: Phaser.Scene): void {
  for (const kind of ['planter', 'crate', 'barrel', 'urn', 'rack'] as const) {
    const key = `dressing_${kind}`;
    if (scene.textures.exists(key)) continue;
    const canvas = document.createElement('canvas');
    canvas.width = 44;
    canvas.height = 37;
    const ctx = canvas.getContext('2d')!;
    const poly = (color: string, ...points: [number, number][]): void => {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (const [i, [x, y]] of points.entries()) {
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    };
    const rect = (c: string, x: number, y: number, w: number, h: number): void => {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, w, h);
    };
    ctx.fillStyle = '#080c1388';
    ctx.beginPath(); ctx.ellipse(22, 31, 18, 5, 0, 0, Math.PI * 2); ctx.fill();
    if (kind === 'crate' || kind === 'planter') {
      const stone = kind === 'planter';
      poly(stone ? '#4b655e' : '#825631', [6, 14], [22, 6], [38, 14], [22, 22]);
      poly(stone ? '#334a49' : '#573a2a', [6, 14], [22, 22], [22, 35], [6, 27]);
      poly(stone ? '#233638' : '#382825', [22, 22], [38, 14], [38, 27], [22, 35]);
      poly(stone ? '#262e24' : '#66402d', [10, 14], [22, 8], [34, 14], [22, 20]);
      for (let x = 9; x < 38; x += 5) {
        const y = 16 + Math.round((16 - Math.abs(x - 22)) / 2);
        rect(stone ? '#183334' : '#2f2523', x, y, 1, 9);
      }
      if (stone) {
        for (let i = 0; i < 14; i++) {
          const x = 11 + Math.floor(hash(i, 2) * 22);
          const y = 11 + Math.floor(hash(i, 3) * 7);
          rect(i % 2 ? '#7b9655' : '#486d46', x, y - 4, 2, 3 + i % 4);
        }
      } else {
        poly('#af7a44', [7, 16], [10, 17], [22, 31], [22, 34]);
        poly('#805235', [22, 31], [35, 16], [38, 15], [22, 34]);
      }
    } else if (kind === 'barrel' || kind === 'urn') {
      const urn = kind === 'urn';
      poly(urn ? '#57454d' : '#65503b', [11, 12], [16, 8], [28, 8], [33, 12], [35, 22], [32, 30], [27, 34], [17, 34], [12, 30], [9, 22]);
      poly(urn ? '#8f6a65' : '#967149', [11, 14], [19, 16], [21, 32], [15, 29], [10, 22]);
      poly(urn ? '#302733' : '#372820', [25, 14], [33, 12], [35, 22], [31, 30], [25, 34]);
      poly(urn ? '#ad8375' : '#a17b4e', [11, 12], [16, 8], [28, 8], [33, 12], [28, 16], [16, 16]);
      poly('#302623', [15, 12], [18, 10], [26, 10], [29, 12], [25, 14], [18, 14]);
      if (!urn) for (const y of [17, 26]) poly('#384653', [10, y], [20, y + 3], [34, y], [33, y + 3], [20, y + 6], [11, y + 3]);
    } else {
      rect('#523526', 11, 10, 4, 24); rect('#382822', 30, 10, 4, 24);
      rect('#805735', 9, 12, 27, 4); rect('#654431', 9, 23, 27, 3);
      for (const x of [16, 22, 28]) {
        poly('#8899a2', [x, 4], [x + 3, 10], [x, 13], [x - 2, 10]);
        rect('#9b7750', x, 13, 1, 18);
      }
    }
    scene.textures.addCanvas(key, canvas);
  }
}

/** Low, non-blocking clusters on slabs. Leave routes, spawn and boss centre readable. */
export function addScenarioDressing(scene: Phaser.Scene, zone: ZoneMap, style: ScenarioStyle): Phaser.GameObjects.Image[] {
  buildProps(scene);
  const images: Phaser.GameObjects.Image[] = [];
  const spacing = style === 'ossuary' ? 5 : 6;
  for (let y = 2; y < zone.height - 2; y += spacing) {
    for (let x = 2; x < zone.width - 2; x += spacing) {
      const gx = x + Math.floor(hash(x, y, 71) * 3);
      const gy = y + Math.floor(hash(x, y, 73) * 3);
      if (zone.tiles[gy * zone.width + gx] !== 'ground') continue;
      if (Math.hypot(gx + .5 - zone.spawn.x, gy + .5 - zone.spawn.y) < 4 ||
          Math.hypot(gx + .5 - zone.portal.x, gy + .5 - zone.portal.y) < 4) continue;
      if (style === 'ossuary' && Math.hypot(gx - zone.width / 2, gy - zone.height / 2) < 7) continue;
      const pieces = KIT[style][hash(x, y, 79) < .5 ? 0 : 1];
      for (let i = 0; i < pieces.length; i++) {
        const dx = [.33, .80, .20][i]!;
        const dy = [.30, .24, .78][i]!;
        if (!isWalkable(zone, gx + dx, gy + dy)) continue;
        const pos = gridToScreen(gx + dx, gy + dy);
        const piece = pieces[i]!;
        const frame = raw[piece];
        const image = scene.add.image(pos.x, pos.y + 3, frame ? ATLAS_KEY : `dressing_${piece}`, frame);
        const scale = (frame ? .6 : i === 0 ? 1.02 : .65) + hash(gx, gy, 81 + i) * .19;
        images.push(image.setOrigin(.5, .9).setScale(scale).setDepth(pos.y - 1));
      }
    }
  }
  return images;
}
