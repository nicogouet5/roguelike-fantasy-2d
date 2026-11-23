import type Phaser from 'phaser';
import cloisterUrl from '../assets/maps/map_cloister.jpg';
import bridgeUrl from '../assets/maps/map_bridge.jpg';
import fortressUrl from '../assets/maps/map_fortress.jpg';
import ossuaryUrl from '../assets/maps/map_ossuary.jpg';
import { ATLAS_KEY } from '../assets/pixelArt.ts';
import { gridToScreen } from '../core/iso.ts';
import { PAINTED_FRAMES, PAINTING_SIZE, type ScenarioStyle } from '../core/scenarioLayouts.ts';
import type { MapPaletteDef, ZoneMap } from '../core/types.ts';
import { addEclipseSky } from './eclipseArt.ts';
import type { MapVisuals } from './mapRenderer.ts';

interface PaintedArt {
  url: string;
  /** Deep tone of the painting's outer border; the camera clears to it so the feathered edge disappears. */
  backdrop: string;
  /** Border feather: a rectangle for the iso paintings, an ellipse past the rim for the top-down pit. */
  feather: 'rect' | 'ellipse';
  /** Light sources in the painting (painting px) that get a soft additive pulse. */
  glows: readonly { x: number; y: number; r: number; tint: number; peak?: number }[];
}

const ART: Readonly<Record<ScenarioStyle, PaintedArt>> = {
  cloister: {
    url: cloisterUrl,
    backdrop: '#0b1112',
    feather: 'rect',
    glows: [
      { x: 88, y: 345, r: 70, tint: 0xffa040 },
      { x: 1310, y: 345, r: 70, tint: 0xffa040 },
      { x: 700, y: 720, r: 300, tint: 0xffb040, peak: 0.14 },
    ],
  },
  bridge: {
    url: bridgeUrl,
    backdrop: '#170f1b',
    feather: 'rect',
    glows: [
      { x: 1150, y: 430, r: 120, tint: 0xff5a1e },
      { x: 700, y: 625, r: 260, tint: 0x40e0c0, peak: 0.16 },
      { x: 450, y: 1150, r: 220, tint: 0xff4a18 },
      { x: 950, y: 1150, r: 200, tint: 0xff4a18 },
    ],
  },
  fortress: {
    url: fortressUrl,
    backdrop: '#12161e',
    feather: 'rect',
    glows: [
      { x: 110, y: 500, r: 120, tint: 0xff5a30 },
      { x: 450, y: 320, r: 140, tint: 0xff5a30 },
      { x: 800, y: 205, r: 110, tint: 0xff5a30 },
      { x: 930, y: 280, r: 110, tint: 0xff5a30 },
      { x: 1300, y: 500, r: 120, tint: 0xff5a30 },
    ],
  },
  ossuary: {
    url: ossuaryUrl,
    backdrop: '#0a0d12',
    feather: 'ellipse',
    glows: [{ x: 700, y: 700, r: 380, tint: 0x40ffe0, peak: 0.18 }],
  },
};

const STYLES = Object.keys(ART) as ScenarioStyle[];
const rawKey = (style: ScenarioStyle): string => `painted_map_${style}`;
const bakedKey = (style: ScenarioStyle): string => `painted_map_${style}_baked`;
const GLOW_KEY = 'painted_map_glow';
/** Phaser.Textures.FilterMode.LINEAR; the game runs with pixelArt (NEAREST) by default. */
const LINEAR = 0;
/** Phaser.BlendModes.ADD */
const ADD = 1;
/** Border feather width, in painting pixels. */
const FEATHER = 70;

export function preloadPaintedMaps(scene: Phaser.Scene): void {
  for (const style of STYLES) {
    if (!scene.textures.exists(rawKey(style))) scene.load.image(rawKey(style), ART[style].url);
  }
}

/** True once the painting for `style` has loaded. */
export function hasPaintedArena(scene: Phaser.Scene, style: ScenarioStyle): boolean {
  return scene.textures.exists(rawKey(style));
}

/**
 * Resamples the painting once to its exact on-screen size (high-quality
 * smoothing, so it is drawn 1:1 and stays crisp under roundPixels) and
 * feathers its border into the backdrop colour.
 */
function bakePainting(scene: Phaser.Scene, style: ScenarioStyle): string | null {
  const key = bakedKey(style);
  if (scene.textures.exists(key)) return key;
  if (!hasPaintedArena(scene, style)) return null;
  const source = scene.textures.get(rawKey(style)).getSourceImage() as CanvasImageSource;
  const frame = PAINTED_FRAMES[style];
  const w = Math.round(PAINTING_SIZE * frame.scaleX);
  const h = Math.round(PAINTING_SIZE * frame.scaleY);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);

  // destination-in multiplies the painting's alpha by each full-canvas mask.
  ctx.globalCompositeOperation = 'destination-in';
  if (ART[style].feather === 'ellipse') {
    // Fade the dark rock past the rim stones (outer rim ~670x610 painting px).
    const cx = (frame.anchorX / PAINTING_SIZE) * w;
    const cy = (frame.anchorY / PAINTING_SIZE) * h;
    const rx = 700 * frame.scaleX;
    const ry = 640 * frame.scaleY;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, rx * 0.9, 0, 0, rx);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-rx * 2, -rx * 2, rx * 4, rx * 4);
    ctx.restore();
  } else {
    const fx = FEATHER * frame.scaleX;
    const fy = FEATHER * frame.scaleY;
    const edges: [number, number, number, number][] = [[0, 0, fx, 0], [w, 0, w - fx, 0], [0, 0, 0, fy], [0, h, 0, h - fy]];
    for (const [x0, y0, x1, y1] of edges) {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }
  ctx.globalCompositeOperation = 'source-over';

  scene.textures.addCanvas(key, canvas)?.setFilter(LINEAR);
  return key;
}

function ensureGlowTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(GLOW_KEY)) return;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  scene.textures.addCanvas(GLOW_KEY, canvas)?.setFilter(LINEAR);
}

/**
 * Draws a hand-painted arena as one crisp ground plane under every sprite.
 * The painting is placed with the same frame `scenarioLayouts.ts` uses to
 * build the collision grid, so walkable tiles sit on the painted floor.
 * Returns null when the painting has not loaded (the procedural renderer takes over).
 */
export function renderPaintedArena(
  scene: Phaser.Scene,
  zone: ZoneMap,
  style: ScenarioStyle,
  palette: MapPaletteDef,
  hasPortal: boolean,
  isBossZone: boolean,
): MapVisuals | null {
  const key = bakePainting(scene, style);
  if (!key) return null;
  const art = ART[style];
  const frame = PAINTED_FRAMES[style];
  const centre = gridToScreen(zone.width / 2, zone.height / 2);
  const tiles: Phaser.GameObjects.Image[] = [];

  scene.cameras.main.setBackgroundColor(art.backdrop);
  if (isBossZone) tiles.push(addEclipseSky(scene));

  const ground = scene.add.image(centre.x, centre.y, key);
  ground.setOrigin(frame.anchorX / PAINTING_SIZE, frame.anchorY / PAINTING_SIZE).setDepth(-1000);
  tiles.push(ground);

  // Soft additive light over the painted braziers, lava and glowing rings.
  ensureGlowTexture(scene);
  for (const [i, glow] of art.glows.entries()) {
    const x = centre.x + (glow.x - frame.anchorX) * frame.scaleX;
    const y = centre.y + (glow.y - frame.anchorY) * frame.scaleY;
    const light = scene.add.image(x, y, GLOW_KEY).setTint(glow.tint).setBlendMode(ADD).setDepth(-999);
    light.setDisplaySize(glow.r * 2 * frame.scaleX, glow.r * 2 * frame.scaleY).setAlpha(0.08);
    scene.tweens.add({
      targets: light,
      alpha: glow.peak ?? 0.26,
      duration: 1600 + i * 370,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    light.once('destroy', () => scene.tweens.killTweensOf(light));
    tiles.push(light);
  }

  let portal: Phaser.GameObjects.Sprite | null = null;
  if (hasPortal) {
    const pos = gridToScreen(zone.portal.x, zone.portal.y);
    portal = scene.add.sprite(pos.x, pos.y, ATLAS_KEY, 'fx_portal');
    portal.setTint(Number.parseInt(palette.portalTint.slice(1), 16));
    portal.setDepth(pos.y - 12);
    portal.setAlpha(0.38);
  }

  return { tiles, props: [], portal };
}
