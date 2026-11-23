import type Phaser from 'phaser';
import type { ScenarioStyle } from '../core/scenarioLayouts.ts';

/**
 * Procedural pixel-art textures for the Falla 23 scenarios. Every texture is a
 * canvas painted from a fixed hash, so a scenario always looks the same.
 * Keys are built with `scnKey` and created once by `ensureScenarioTextures`.
 */
export type ArtStyle = Exclude<ScenarioStyle, 'ossuary'>;
export const ART_STYLES: ArtStyle[] = ['cloister', 'bridge', 'fortress'];

export function scnKey(name: string, style?: ArtStyle, variant?: number): string {
  return ['scn', style, name, variant].filter((p) => p !== undefined).join('_');
}

/**
 * Tiles baked from image-generator output (see `src/assets/scenarios/`). The
 * file name is the texture key, e.g. `scn_cloister_slab_0.png`. A baked PNG
 * always wins; the procedural painters below only fill in what is missing.
 */
const BAKED = import.meta.glob('../assets/scenarios/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export function preloadScenarioTextures(scene: Phaser.Scene): void {
  for (const [path, url] of Object.entries(BAKED)) {
    const key = path.slice(path.lastIndexOf('/') + 1).replace(/\.png$/, '');
    if (!scene.textures.exists(key)) scene.load.image(key, url);
  }
}

interface Pal {
  slab: [string, string, string];
  seam: string;
  hi: string;
  moss: string;
  mossRate: number;
  face: string;
  faceDark: string;
  mortar: string;
  rock: [string, string, string];
  vein: string;
  veinRate: number;
  /** Route surface: amber cobbles, violet-brown planks or coral flagstones. */
  path: [string, string, string];
  pathSeam: string;
  /** Moat water and its lamp reflections (cloister only). */
  water: [string, string];
  reflect: [string, string];
  /** Chasm / lava base colour (bridge and fortress). */
  chasm: string;
}

const PAL: Record<ArtStyle, Pal> = {
  // Jade and teal stone, mossy joints, amber cobbled galleries, dark teal cave.
  cloister: {
    slab: ['#2d4745', '#38564f', '#456760'], seam: '#16282a', hi: '#79a898', moss: '#a4b94a', mossRate: 0.06,
    face: '#2e4846', faceDark: '#1a2c2c', mortar: '#0f1c1d', rock: ['#0b1618', '#112122', '#182d2d'], vein: '#d8a040', veinRate: 0,
    path: ['#7a5a34', '#8e6c3c', '#a37f48'], pathSeam: '#33250f',
    water: ['#0b1f23', '#07151a'], reflect: ['#b8832e', '#e0a84a'], chasm: '#07151a',
  },
  // Violet slabs, weathered plank catwalks and a copper-lit lava chasm.
  bridge: {
    slab: ['#3d3357', '#493e68', '#584b7c'], seam: '#211a35', hi: '#9486bd', moss: '#7a7a3d', mossRate: 0.012,
    face: '#483c66', faceDark: '#2a2342', mortar: '#1a1430', rock: ['#190f2a', '#241538', '#301b47'], vein: '#ff7a2a', veinRate: 0.03,
    path: ['#6b4730', '#7d5636', '#906840'], pathSeam: '#2b1a10',
    water: ['#0b1f23', '#07151a'], reflect: ['#b8832e', '#e0a84a'], chasm: '#170a2a',
  },
  // Steel-blue plaza slabs, coral flagstone processional road, red lava.
  fortress: {
    slab: ['#2b3e56', '#364c68', '#425d7e'], seam: '#16202e', hi: '#7a98bd', moss: '#5f7f3a', mossRate: 0.035,
    face: '#344762', faceDark: '#1f2c40', mortar: '#121b28', rock: ['#0f1724', '#162133', '#1e2c43'], vein: '#ff6a1e', veinRate: 0.03,
    path: ['#8a4a48', '#a05a55', '#b96b62'], pathSeam: '#4a2424',
    water: ['#0b1f23', '#07151a'], reflect: ['#b8832e', '#e0a84a'], chasm: '#2a1218',
  },
};

export function hash(a: number, b: number, c = 0): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

type Ctx = CanvasRenderingContext2D;

function makeCanvas(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: Ctx) => void): void {
  if (scene.textures.exists(key)) return;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  draw(ctx);
  scene.textures.addCanvas(key, canvas);
}

/** Paints the 64x32 isometric diamond one pixel at a time; `a`/`b` are the tile's own axes (0..1). */
function diamond(scene: Phaser.Scene, key: string, color: (px: number, py: number, a: number, b: number) => string | null): void {
  makeCanvas(scene, key, 64, 32, (ctx) => {
    const img = ctx.createImageData(64, 32);
    for (let py = 0; py < 32; py++) {
      for (let px = 0; px < 64; px++) {
        const sx = (px + 0.5 - 32) / 32;
        const sy = (py + 0.5 - 16) / 16;
        if (Math.abs(sx) + Math.abs(sy) > 1) continue;
        const c = color(px, py, (sx + sy) / 2 + 0.5, (sy - sx) / 2 + 0.5);
        if (!c) continue;
        const [r, g, b] = rgb(c);
        const i = (py * 64 + px) * 4;
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = b;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

function poly(ctx: Ctx, pts: readonly (readonly [number, number])[], color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
}

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function glow(ctx: Ctx, x: number, y: number, r: number, color: string, alpha: number): void {
  const g = ctx.createRadialGradient(x, y, 1, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

function buildGround(scene: Phaser.Scene, style: ArtStyle): void {
  const p = PAL[style];
  for (let v = 0; v < 4; v++) {
    // 2x2 slabs per tile with fixed seams so neighbouring tiles join; only shade and cracks vary.
    diamond(scene, scnKey('slab', style, v), (px, py, a, b) => {
      const ia = Math.floor(a * 2);
      const ib = Math.floor(b * 2);
      const fa = a * 2 - ia;
      const fb = b * 2 - ib;
      if (fa < 0.07 || fb < 0.07) return p.seam;
      let base = p.slab[Math.floor(hash(ia, ib, v) * 3)]!;
      if (fa < 0.14 || fb < 0.14) base = p.slab[2];
      const n = hash(px, py, v + 7);
      if (n < 0.1) base = p.slab[0];
      else if (n > 0.94) base = p.hi;
      if (hash(Math.floor(a * 7), Math.floor(b * 7), v + 5) < 0.14) base = p.slab[0];
      if (p.mossRate > 0 && hash(px >> 1, py >> 1, v + 31) < p.mossRate && (fa < 0.35 || fb < 0.35)) base = p.moss;
      if ((v === 1 || v === 3) && Math.abs(a * 0.9 + b * 0.4 - 0.62 - v * 0.05) < 0.012) base = p.seam;
      return base;
    });
  }
}

/** Routes: cobbles (cloister, fortress) or planks running along grid x (bridge). */
function buildPaths(scene: Phaser.Scene, style: ArtStyle): void {
  const p = PAL[style];
  for (let v = 0; v < 4; v++) {
    diamond(scene, scnKey('path', style, v), (px, py, a, b) => {
      if (style === 'bridge') {
        const ib = Math.floor(b * 5);
        const fb = b * 5 - ib;
        if (fb < 0.12) return p.pathSeam;
        const joint = hash(ib, v, 4);
        if (Math.abs(a - joint) < 0.018) return p.pathSeam;
        let c = p.path[Math.floor(hash(ib, Math.floor(a * 2 + joint * 3), v) * 3)]!;
        if (hash(px, py, v + 2) < 0.12) c = p.path[0];
        if ((fb > 0.3 && fb < 0.5) && hash(px >> 1, py >> 1, v + 8) < 0.06) c = p.path[2];
        return c;
      }
      // Staggered 4x4 cobbles; odd rows are offset by half a stone.
      const ib = Math.floor(b * 4);
      const sa = a * 4 + (ib % 2) * 0.5;
      const ia = Math.floor(sa);
      const fa = sa - ia;
      const fb = b * 4 - ib;
      if (fa < 0.13 || fb < 0.13) return p.pathSeam;
      let c = p.path[Math.floor(hash(ia, ib, v) * 3)]!;
      if (fa < 0.25 && fb < 0.3) c = p.path[2];
      if (hash(px, py, v + 5) < 0.09) c = p.path[0];
      return c;
    });
  }
}

function buildDrops(scene: Phaser.Scene, style: ArtStyle): void {
  const p = PAL[style];
  for (let v = 0; v < 4; v++) {
    if (style === 'cloister') {
      // Dark moat water: ripples and the amber reflection of the gallery lamps.
      diamond(scene, scnKey('void', style, v), (px, py, a, b) => {
        let c = (a + b) / 2 < 0.4 ? p.water[0] : p.water[1];
        if (hash(px >> 2, py, v) < 0.1) c = '#123035';
        if (hash(px >> 1, py >> 2, v + 3) < 0.022) c = hash(px, py, v) < 0.5 ? p.reflect[0] : p.reflect[1];
        return c;
      });
    } else {
      // Lava chasm: dark rock with glowing veins.
      const base = p.chasm;
      diamond(scene, scnKey('void', style, v), (px, py, a, b) => {
        const n = Math.sin(a * 9 + b * 5 + v * 1.7) * Math.sin(b * 8 - a * 3 + v * 2.3);
        if (Math.abs(n) < 0.02) return '#ffb347';
        if (Math.abs(n) < 0.045) return '#ff6a1e';
        if (Math.abs(n) < 0.09) return '#6a2230';
        return hash(px, py, v) < 0.1 ? '#2a1830' : base;
      });
    }
  }
}

function buildRock(scene: Phaser.Scene, style: ArtStyle): void {
  const p = PAL[style];
  for (let v = 0; v < 4; v++) {
    diamond(scene, scnKey('rock', style, v), (px, py, a, b) => {
      let c = p.rock[Math.floor(hash(px >> 1, py >> 1, v) * 3)]!;
      if (p.veinRate > 0 && Math.abs(Math.sin(a * 6 + b * 3 + v) * Math.sin(b * 7 - a * 2)) < p.veinRate * 0.6) c = p.vein;
      return c;
    });
  }
}

/** Left/right platform edges, drawn under a slab tile when the neighbour is a drop. */
function buildFaces(scene: Phaser.Scene, style: ArtStyle): void {
  const p = PAL[style];
  const h = style === 'bridge' ? 26 : 12;
  for (const side of ['L', 'R'] as const) {
    for (const arch of [false, true]) {
      if (arch && style !== 'bridge') continue;
      makeCanvas(scene, scnKey(`face${side}${arch ? 'a' : ''}`, style), 32, 16 + h, (ctx) => {
        const shape = side === 'L'
          ? ([[0, 0], [32, 16], [32, 16 + h], [0, h]] as const)
          : ([[0, 16], [32, 0], [32, h], [0, 16 + h]] as const);
        poly(ctx, shape, side === 'L' ? p.face : p.faceDark);
        ctx.save();
        ctx.beginPath();
        shape.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.clip();
        for (let row = 0; row < Math.ceil((16 + h) / 5); row++) {
          const y = row * 5;
          rect(ctx, 0, y, 32, 1, p.mortar);
          for (let x = (row % 2) * 6 + 3; x < 32; x += 12) rect(ctx, x, y, 1, 5, p.mortar);
        }
        if (arch) {
          // A dark arch with lava light inside, seen under the bridge deck.
          const cy = side === 'L' ? 16 : 8;
          poly(ctx, [[7, cy + 12], [7, cy + 2], [11, cy - 3], [21, cy - 3], [25, cy + 2], [25, cy + 12]], '#120a16');
          glow(ctx, 16, cy + 12, 9, '#ff7a2a', 0.8);
        }
        ctx.restore();
      });
    }
  }
}

function buildSprites(scene: Phaser.Scene): void {
  // Crystal clusters: amber for the jade cloister, coral elsewhere.
  const crystalSets: Record<string, [string, string, string, string, string]> = {
    crystal: ['#ff6a4a', '#d9534f', '#e2625a', '#b8404f', '#ffa085'],
    crystal_amber: ['#ffb43a', '#c8861e', '#e0a030', '#9a6218', '#ffd98a'],
  };
  for (const [name, [halo, c1, c2, c3, light]] of Object.entries(crystalSets)) {
    makeCanvas(scene, scnKey(name), 40, 48, (ctx) => {
      const shard = (x: number, w: number, hgt: number, tilt: number, c: string, l: string): void => {
        poly(ctx, [[x - w, 46], [x - w + tilt, 46 - hgt * 0.78], [x + tilt, 46 - hgt], [x + w + tilt, 46 - hgt * 0.78], [x + w, 46]], c);
        poly(ctx, [[x - w, 46], [x - w + tilt, 46 - hgt * 0.78], [x + tilt, 46 - hgt], [x + tilt, 46]], l);
      };
      glow(ctx, 20, 34, 18, halo, 0.35);
      shard(24, 6, 26, 4, c1, light);
      shard(13, 6, 36, -3, c2, light);
      shard(30, 4, 18, 3, c3, c2);
      shard(19, 5, 22, 0, c2, light);
      rect(ctx, 6, 44, 30, 3, '#1a1822');
    });
  }

  makeCanvas(scene, scnKey('brazier'), 44, 64, (ctx) => {
    glow(ctx, 22, 24, 20, '#ff8a2a', 0.5);
    rect(ctx, 15, 40, 14, 20, '#4d5566');
    rect(ctx, 15, 40, 5, 20, '#6b7487');
    rect(ctx, 12, 56, 20, 5, '#394150');
    rect(ctx, 11, 36, 22, 5, '#2a2f3a');
    for (let i = 0; i < 4; i++) rect(ctx, 12 + i * 6, 29, 2, 8, '#1d2129');
    rect(ctx, 11, 28, 22, 2, '#1d2129');
    poly(ctx, [[14, 30], [16, 18], [20, 10], [22, 17], [26, 8], [30, 20], [31, 30]], '#ff7a1e');
    poly(ctx, [[18, 30], [20, 20], [23, 14], [26, 22], [27, 30]], '#ffb43a');
    poly(ctx, [[21, 30], [23, 23], [25, 30]], '#fff0b3');
  });

  makeCanvas(scene, scnKey('banner'), 24, 56, (ctx) => {
    rect(ctx, 2, 1, 20, 3, '#5a4630');
    rect(ctx, 4, 4, 16, 38, '#a8323c');
    rect(ctx, 4, 4, 4, 38, '#c4484f');
    poly(ctx, [[4, 42], [12, 50], [20, 42], [20, 38], [4, 38]], '#8c242e');
    rect(ctx, 11, 12, 2, 14, '#e8d8b0');
    rect(ctx, 7, 17, 10, 2, '#e8d8b0');
  });

  makeCanvas(scene, scnKey('gate23'), 128, 124, (ctx) => {
    const stone = '#56607a';
    const light = '#7b88a3';
    const dark = '#2d3550';
    const block = (x: number, y: number, w: number, h: number): void => {
      rect(ctx, x, y, w, h, stone);
      rect(ctx, x, y, 3, h, light);
      rect(ctx, x + w - 3, y, 3, h, dark);
      for (let yy = y + 6; yy < y + h; yy += 8) rect(ctx, x, yy, w, 1, dark);
    };
    block(8, 44, 34, 76);
    block(86, 44, 34, 76);
    block(36, 14, 56, 106);
    for (const x of [8, 22, 86, 100]) rect(ctx, x, 36, 12, 8, stone);
    poly(ctx, [[44, 120], [44, 62], [50, 46], [64, 40], [78, 46], [84, 62], [84, 120]], '#1b1625');
    poly(ctx, [[44, 62], [50, 46], [64, 40], [78, 46], [84, 62], [78, 62], [74, 52], [64, 47], [54, 52], [50, 62]], '#9a7a46');
    for (let x = 48; x < 84; x += 6) {
      rect(ctx, x, 54, 2, 62, '#5b4636');
      poly(ctx, [[x - 1, 116], [x + 1, 124], [x + 3, 116]], '#8e949f');
    }
    rect(ctx, 46, 70, 38, 2, '#3b2d24');
    rect(ctx, 46, 92, 38, 2, '#3b2d24');
    rect(ctx, 44, 16, 40, 22, '#3a3140');
    rect(ctx, 46, 18, 36, 18, '#8a6a3c');
    ctx.fillStyle = '#ffe9a8';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('23', 64, 32);
    glow(ctx, 64, 100, 26, '#ff8a2a', 0.35);
  });

  makeCanvas(scene, scnKey('skull'), 72, 52, (ctx) => {
    const bone = '#d4c7ac';
    poly(ctx, [[10, 40], [8, 28], [22, 20], [44, 14], [60, 22], [64, 32], [56, 42], [34, 44]], bone);
    poly(ctx, [[10, 40], [8, 28], [22, 20], [30, 24], [26, 40]], '#a89a80');
    poly(ctx, [[44, 14], [52, 2], [56, 4], [52, 16]], bone);
    poly(ctx, [[28, 20], [36, 24], [34, 32], [26, 30]], '#1d1a20');
    rect(ctx, 12, 36, 38, 3, '#e9dfc6');
    for (let x = 14; x < 48; x += 5) poly(ctx, [[x, 38], [x + 2, 38], [x + 1, 43]], '#f2ead6');
    rect(ctx, 6, 44, 60, 3, 'rgba(0,0,0,0.35)');
  });

  makeCanvas(scene, scnKey('stairs'), 64, 48, (ctx) => {
    for (let i = 0; i < 5; i++) {
      const y = 8 + i * 7;
      const x = 6 + i * 5;
      poly(ctx, [[x, y], [x + 30, y + 10], [x + 30, y + 17], [x, y + 7]], '#2d3550');
      poly(ctx, [[x, y], [x + 30, y + 10], [x + 36, y + 7], [x + 6, y - 3]], i % 2 ? '#6b7690' : '#7b88a3');
    }
  });

  makeCanvas(scene, scnKey('stall'), 84, 78, (ctx) => {
    glow(ctx, 40, 40, 30, '#ffb347', 0.25);
    rect(ctx, 8, 20, 4, 54, '#5a3d28');
    rect(ctx, 72, 20, 4, 54, '#5a3d28');
    for (let i = 0; i < 7; i++) {
      poly(ctx, [[2 + i * 11, 14], [13 + i * 11, 14], [13 + i * 11, 26], [2 + i * 11, 26]], i % 2 ? '#efe2c8' : '#b33a3f');
    }
    rect(ctx, 2, 26, 78, 3, '#6b2a2f');
    rect(ctx, 12, 52, 60, 20, '#7a5233');
    rect(ctx, 12, 52, 60, 3, '#9b6a40');
    rect(ctx, 44, 34, 20, 16, '#2c2f3a');
    rect(ctx, 46, 36, 16, 12, '#7fb4d8');
    rect(ctx, 52, 39, 5, 6, '#e0a070');
    rect(ctx, 53, 28, 1, 6, '#2c2f3a');
    rect(ctx, 20, 46, 18, 6, '#c8793a');
    rect(ctx, 21, 45, 16, 3, '#8fb24a');
    rect(ctx, 40, 44, 3, 8, '#c8402f');
    rect(ctx, 44, 44, 3, 8, '#e8b22e');
    rect(ctx, 6, 58, 10, 16, '#4a3322');
  });

  makeCanvas(scene, scnKey('statue'), 56, 52, (ctx) => {
    poly(ctx, [[6, 40], [8, 24], [20, 12], [38, 12], [50, 24], [52, 40], [30, 46]], '#6a7389');
    poly(ctx, [[6, 40], [8, 24], [20, 12], [26, 14], [22, 44]], '#8a94aa');
    for (let i = 0; i < 5; i++) poly(ctx, [[14 + i * 7, 14], [17 + i * 7, 4], [20 + i * 7, 14]], '#8a94aa');
    rect(ctx, 22, 26, 8, 2, '#2b3144');
    rect(ctx, 34, 26, 8, 2, '#2b3144');
    rect(ctx, 28, 34, 10, 2, '#2b3144');
    poly(ctx, [[40, 38], [54, 34], [54, 46], [38, 48]], '#5b6479');
    rect(ctx, 4, 46, 46, 3, 'rgba(0,0,0,0.35)');
  });

  makeCanvas(scene, scnKey('winch'), 56, 52, (ctx) => {
    rect(ctx, 6, 38, 44, 6, '#5a3d28');
    rect(ctx, 10, 20, 5, 22, '#6b4a30');
    rect(ctx, 41, 20, 5, 22, '#6b4a30');
    ctx.strokeStyle = '#7a5233';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(28, 26, 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(28 - Math.cos(i * 0.8) * 13, 26 - Math.sin(i * 0.8) * 13);
      ctx.lineTo(28 + Math.cos(i * 0.8) * 13, 26 + Math.sin(i * 0.8) * 13);
      ctx.stroke();
    }
    rect(ctx, 22, 22, 12, 10, '#8c6a44');
    rect(ctx, 22, 26, 12, 1, '#c8b08a');
    rect(ctx, 22, 29, 12, 1, '#c8b08a');
  });

  makeCanvas(scene, scnKey('scaffold'), 64, 56, (ctx) => {
    ctx.strokeStyle = '#6b4a30';
    ctx.lineWidth = 4;
    for (const x of [8, 32, 56]) {
      ctx.beginPath();
      ctx.moveTo(x, 4);
      ctx.lineTo(x, 54);
      ctx.stroke();
    }
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(8, 8);
    ctx.lineTo(32, 50);
    ctx.moveTo(56, 8);
    ctx.lineTo(32, 50);
    ctx.moveTo(8, 50);
    ctx.lineTo(56, 22);
    ctx.stroke();
    rect(ctx, 2, 2, 60, 6, '#8c6a44');
  });

  makeCanvas(scene, scnKey('chain'), 12, 60, (ctx) => {
    for (let y = 0; y < 58; y += 8) {
      ctx.strokeStyle = '#1e1b26';
      ctx.lineWidth = 2;
      ctx.strokeRect(3, y + 1, 6, 6);
      rect(ctx, 4, y + 2, 2, 2, '#4d4a5c');
    }
  });

  makeCanvas(scene, scnKey('spire'), 44, 64, (ctx) => {
    poly(ctx, [[2, 62], [10, 28], [18, 10], [24, 2], [32, 26], [42, 62]], '#2a2230');
    poly(ctx, [[2, 62], [10, 28], [18, 10], [24, 2], [22, 62]], '#3d3140');
    poly(ctx, [[22, 62], [24, 2], [32, 26], [42, 62]], '#1d1620');
    rect(ctx, 8, 56, 28, 3, '#ff6a1e');
    rect(ctx, 14, 58, 14, 2, '#ffb347');
  });
}

/** Creates (once) every scenario texture; safe to call on every zone rebuild. */
export function ensureScenarioTextures(scene: Phaser.Scene): void {
  for (const style of ART_STYLES) {
    buildGround(scene, style);
    buildPaths(scene, style);
    buildDrops(scene, style);
    buildRock(scene, style);
    buildFaces(scene, style);
  }
  buildSprites(scene);
}
