import type Phaser from 'phaser';
import combatFrames from './codex/combat-frames.png';
import { articulateCodexFrame } from './actorMotion.ts';
import type { AnimPose } from './pixelArt.ts';

const SHEET = 'codex_combat';
const SIZE = 96;
// Cell 16 contains the baked reference bolt. The combat scene renders its own
// projectile, so actor animation deliberately moves from the roar back to idle.
const COMPY_ATK_FRAMES = [11, 11, 12, 13, 10] as const;
const COMPY_WALK_FRAMES = [10, 11, 11, 13, 10, 10] as const;
const SPITTER_ATK_FRAMES = [15, 15, 15, 17, 14] as const;
const portraits: Record<string, number> = {
  dino_trex: 0,
  dino_triceratops: 1,
  dino_dodo: 2,
  boss_spinosaurus: 3,
  mob_carno: 4,
};
let sheet: CanvasImageSource | undefined;

export function preloadCodexArt(scene: Phaser.Scene): void {
  scene.load.image(SHEET, combatFrames);
}

export function registerCodexArt(scene: Phaser.Scene): void {
  sheet = scene.textures.exists(SHEET) ? scene.textures.get(SHEET).getSourceImage() as CanvasImageSource : undefined;
}

export function codexFrame(spriteId: string, pose: AnimPose, frame: number): HTMLCanvasElement | undefined {
  if (!sheet) return undefined;
  let index = portraits[spriteId];
  if (spriteId === 'dino_trex' && pose === 'atk') index = 5 + frame;
  if (spriteId === 'mob_compy') index = pose === 'atk' ? COMPY_ATK_FRAMES[frame] : pose === 'walk' ? COMPY_WALK_FRAMES[frame] : 10;
  if (spriteId === 'mob_spitter') index = pose === 'atk' ? SPITTER_ATK_FRAMES[frame] : 14;
  if (index === undefined) return undefined;

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sheet, (index % 6) * SIZE, Math.floor(index / 6) * SIZE, SIZE, SIZE, 0, 0, SIZE, SIZE);
  return articulateCodexFrame(spriteId, canvas, pose, frame);
}
