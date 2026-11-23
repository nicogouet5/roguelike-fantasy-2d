import type Phaser from 'phaser';
import { gridToScreen } from '../core/iso.ts';
import type { ZoneMap } from '../core/types.ts';

const SKY = 'boss_eclipse_sky';
const W = 480;
const H = 270;

function buildSky(scene: Phaser.Scene): void {
  if (scene.textures.exists(SKY)) return;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const data = ctx.createImageData(W, H);
  const colors = [[18, 7, 17], [35, 8, 22], [56, 10, 26], [83, 13, 31], [115, 18, 39], [151, 27, 45], [196, 43, 52], [232, 65, 53], [255, 115, 71], [255, 183, 111]];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x - W * 0.5;
    const dy = y - 64;
    const radius = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx);
    const streaks = Math.sin(a * 19) * Math.cos(a * 29) + Math.sin(a * 43) * 0.4;
    const corona = (5.8 + streaks * 1.8) * Math.exp(-Math.max(0, radius - 42) / 11);
    const clouds = Math.sin(y * 0.28 + Math.sin(x * 0.018) * 2.9) * 0.9
      + Math.sin(y * 0.57 - x * 0.021) * 0.45;
    const glow = 3 * Math.exp(-Math.hypot(dx * 0.63, dy * 1.2) / 105);
    const value = glow + clouds + corona + (y > 174 ? -1 : 0) + ((x + y) % 2) * 0.18;
    const ridge = 166 + Math.sin(x * 0.047) * 11 + Math.sin(x * 0.113) * 6 - Math.pow(Math.abs(Math.sin(x * 0.082)), 12) * 27;
    const color = radius < 42 ? [7, 4, 13]
      : y > ridge ? colors[y > ridge + 11 ? 0 : 1]!
      : colors[Math.max(0, Math.min(colors.length - 1, Math.floor(value)))]!;
    const i = (y * W + x) * 4;
    data.data[i] = color[0]!;
    data.data[i + 1] = color[1]!;
    data.data[i + 2] = color[2]!;
    data.data[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  const texture = scene.textures.addCanvas(SKY, canvas);
  texture?.setFilter(1); // Phaser NEAREST
}

/** Only the distant sky is camera-locked; terrain and landmarks remain world-space. */
export function addEclipseSky(scene: Phaser.Scene): Phaser.GameObjects.Image {
  buildSky(scene);
  const sky = scene.add.image(0, 0, SKY).setScrollFactor(0).setDepth(-2000).setName(SKY);
  const resize = (): void => {
    const { width, height } = scene.scale.gameSize;
    const zoom = scene.cameras.main.zoom;
    sky.setPosition(width / 2, height / 2).setScale(Math.max(width / W, height / H) / zoom);
  };
  resize();
  scene.scale.on('resize', resize);
  sky.once('destroy', () => scene.scale.off('resize', resize));
  return sky;
}

/** Inlaid obsidian and copper: keeps the Eclipse visible even when the sky is occluded. */
export function addEclipseSeal(scene: Phaser.Scene, zone: ZoneMap): Phaser.GameObjects.Image {
  const key = 'boss_eclipse_seal';
  if (!scene.textures.exists(key)) {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 80;
    const ctx = canvas.getContext('2d')!;
    const pixels = ctx.createImageData(160, 80);
    for (let y = 0; y < 80; y++) for (let x = 0; x < 160; x++) {
      const dx = x - 80;
      const dy = (y - 40) * 2;
      const r = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      const rays = Math.pow(Math.max(0, Math.cos(a * 14)), 10) * 12;
      const color = r < 48 ? [22, 12, 26, 115]
        : r < 52 ? [227, 113, 102, 164]
        : r < 55 + rays ? [145, 48, 67, 115]
        : r > 70 && r < 72 && Math.cos(a * 14) > -0.15 ? [178, 87, 91, 150] : null;
      if (color) pixels.data.set(color, (y * 160 + x) * 4);
    }
    ctx.putImageData(pixels, 0, 0);
    scene.textures.addCanvas(key, canvas)?.setFilter(1);
  }
  const center = gridToScreen(zone.spawn.x + 2, zone.spawn.y + 1);
  return scene.add.image(center.x, center.y, key).setScale(1.6).setDepth(-900);
}
