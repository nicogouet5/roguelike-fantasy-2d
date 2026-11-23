import type Phaser from 'phaser';
import type { AnimPose } from './pixelArt.ts';
import mobContactSheet from './mob-contact-sheet.png';

const SHEET_KEY = 'mob_contact_sheet';
const CELL = 512;
const OUTPUT = 80;
const FOOT_Y = 67;

// Native bounds within each cell. Keep the feet at the same atlas anchor in
// every pose, including the attack recoil and the return to idle.
const species: Readonly<Record<string, readonly [number, number, number, number, number, number]>> = {
  mob_compy: [0, 63, 197, 410, 387, 1.4],
  mob_raptor: [1, 4, 124, 478, 412, 1.1],
  mob_pachy: [2, 6, 110, 467, 407, 0.65],
  mob_spitter: [3, 24, 130, 490, 415, 0.65],
  mob_ankylo: [4, 0, 167, 512, 410, 0.4],
  mob_carno: [5, 0, 87, 489, 421, 0.85],
};

let sheet: CanvasImageSource | undefined;
const bases = new Map<string, HTMLCanvasElement>();

export function preloadMobSheets(scene: Phaser.Scene): void {
  scene.load.image(SHEET_KEY, mobContactSheet);
}

export function registerMobSheets(scene: Phaser.Scene): void {
  const source = scene.textures.exists(SHEET_KEY) ? scene.textures.get(SHEET_KEY).getSourceImage() : undefined;
  sheet = source instanceof HTMLImageElement || source instanceof HTMLCanvasElement ? source : undefined;
  bases.clear();
}

function frameCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = OUTPUT;
  return canvas;
}

/** All three animation tracks use the same authored pixels, not alternate silhouettes. */
export function mobSheetFrame(spriteId: string, pose: AnimPose, frame: number): HTMLCanvasElement | undefined {
  const spec = species[spriteId];
  if (!sheet || !spec) return undefined;
  const [cell, left, top, right, bottom, spring] = spec;
  let base = bases.get(spriteId);
  if (!base) {
    base = frameCanvas();
    const ctx = base.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const w = Math.round((right - left) / 8);
    const h = Math.round((bottom - top) / 8);
    ctx.drawImage(sheet, (cell % 3) * CELL + left, Math.floor(cell / 3) * CELL + top,
      right - left, bottom - top, Math.floor((OUTPUT - w) / 2), FOOT_Y - h, w, h);
    bases.set(spriteId, base);
  }

  return warpRows(base, FOOT_Y, Math.round((bottom - top) / 8), spring, pose, frame);
}

/**
 * Shared row-warp animation: feet stay planted at `footY` while the upper body
 * shears, rises or lunges.  Used by the sheet mobs and the codex-art boss so
 * every enemy moves with the same grammar.
 */
function warpRows(base: HTMLCanvasElement, footY: number, torsoHeight: number, spring: number, pose: AnimPose, frame: number): HTMLCanvasElement {
  const size = base.width;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const step = pose === 'walk' ? [-2, -1, 1, 2, 1, -1][frame]! : 0;
  const lift = pose === 'walk' ? Math.round([0, 1, 2, 0, 1, 2][frame]! * spring) : 0;
  const lunge = pose === 'atk' ? [-2, -4, 6, 3, 0][frame]! : 0;
  const rise = pose === 'idle' ? [0, 1, 2, 1][frame]! : 0;
  const drawnHeight = torsoHeight + rise + (pose === 'walk' && frame % 3 === 0 ? -1 : 0);
  for (let row = 0; row < drawnHeight; row++) {
    const t = row / Math.max(1, drawnHeight - 1);
    const y = footY - torsoHeight + Math.round(t * (torsoHeight - 1));
    // Shift the upper body forward as the lower silhouette pushes backward.
    const x = Math.round(step * spring * (1 - 2 * t) + lunge * (1 - 0.75 * t));
    ctx.drawImage(base, 0, y, size, 1, x, footY - drawnHeight + row - lift, size, 1);
  }
  return canvas;
}

const BOSS_FOOT_Y = 81;
const BOSS_HEIGHT = 62;

/** Animates the authored 96px codex boss portrait (static source) with the shared mob motion grammar. */
export function bossSheetFrame(source: HTMLCanvasElement, pose: AnimPose, frame: number): HTMLCanvasElement {
  return warpRows(source, BOSS_FOOT_Y, BOSS_HEIGHT, 0.5, pose, frame);
}
