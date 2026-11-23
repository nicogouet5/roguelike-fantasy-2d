/**
 * Source contact sheets for the playable-art pass.
 *
 * The active roster still has exactly the five data-defined classes.  The two
 * legacy bosses below are intentionally only prepared as separate player-art
 * candidates: nothing in core data, balance or class selection imports them.
 * Keeping these URLs here makes their provenance explicit and prevents a
 * future atlas pass from accidentally reusing the mob/boss art.
 */
import type Phaser from 'phaser';
import velociraptorSheet from './playables/velociraptor-motion-source.png';
import pteranodonSheet from './playables/pteranodon-motion-source.png';

const VELOCIRAPTOR_SHEET_KEY = 'player_velociraptor_sheet';
const PTERANODON_SHEET_KEY = 'player_pteranodon_sheet';
const CELL = 512;
const OUTPUT = 96;

export const PLAYABLE_SHEET_URLS = {
  velociraptor: velociraptorSheet,
  pteranodon: pteranodonSheet,
  espinosaurusCandidate: new URL('./playables/espinosaurus-player-sheet.png', import.meta.url).href,
  carnotauroCandidate: new URL('./playables/carnotauro-player-sheet.png', import.meta.url).href,
} as const;

export type PlayableSheetId = keyof typeof PLAYABLE_SHEET_URLS;

let loadedSheets: Partial<Record<'dino_raptor' | 'dino_pteranodon', CanvasImageSource>> = {};

/** Preload only player candidates; boss/mob candidates deliberately remain unregistered. */
export function preloadPlayableSheets(scene: Phaser.Scene): void {
  scene.load.image(VELOCIRAPTOR_SHEET_KEY, velociraptorSheet);
  scene.load.image(PTERANODON_SHEET_KEY, pteranodonSheet);
}

export function registerPlayableSheets(scene: Phaser.Scene): void {
  loadedSheets = {
    dino_raptor: scene.textures.get(VELOCIRAPTOR_SHEET_KEY).getSourceImage() as CanvasImageSource,
    dino_pteranodon: scene.textures.get(PTERANODON_SHEET_KEY).getSourceImage() as CanvasImageSource,
  };
}

const frameCell: Record<'idle' | 'walk' | 'atk', readonly number[]> = {
  idle: [0, 1, 2, 1],
  walk: [0, 1, 2, 5, 4, 3],
  atk: [4, 5, 5, 4, 3],
};

/**
 * Extract one authored 3×2 contact-sheet cell at native nearest-neighbour
 * scale.  Returning undefined preserves the code-art fallback during tests or
 * in an unloaded scene; normal selector and gameplay always use this path.
 */
export function playableSheetFrame(
  spriteId: string,
  pose: 'idle' | 'walk' | 'atk',
  frame: number
): HTMLCanvasElement | undefined {
  if (spriteId !== 'dino_raptor' && spriteId !== 'dino_pteranodon') return undefined;
  const source = loadedSheets[spriteId];
  if (!source) return undefined;
  const cell = frameCell[pose][frame % frameCell[pose].length]!;
  const x = (cell % 3) * CELL;
  const y = Math.floor(cell / 3) * CELL;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = OUTPUT;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, x, y, CELL, CELL, 0, 0, OUTPUT, OUTPUT);
  return canvas;
}
