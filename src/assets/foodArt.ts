import type Phaser from 'phaser';
import foodAsUrl from './food/food_as.png';
import foodChancacaUrl from './food/food_chancaca.png';
import foodCompletoUrl from './food/food_completo.png';
import foodCompletoItalianoUrl from './food/food_completo_italiano.png';
import foodSopaipillaUrl from './food/food_sopaipilla.png';

const FOOD_URLS: Record<string, string> = {
  food_completo_italiano: foodCompletoItalianoUrl,
  food_completo: foodCompletoUrl,
  food_as: foodAsUrl,
  food_sopaipilla: foodSopaipillaUrl,
  food_chancaca: foodChancacaUrl,
};

const loadedSources = new Map<string, CanvasImageSource>();

export function preloadFoodArt(scene: Phaser.Scene): void {
  for (const [key, url] of Object.entries(FOOD_URLS)) {
    scene.load.image(key, url);
  }
}

export function registerFoodArt(scene: Phaser.Scene): void {
  loadedSources.clear();
  for (const key of Object.keys(FOOD_URLS)) {
    if (scene.textures.exists(key)) {
      loadedSources.set(key, scene.textures.get(key).getSourceImage() as CanvasImageSource);
    }
  }
}

export function foodArtFrame(frameKey: string): HTMLCanvasElement | undefined {
  const src = loadedSources.get(frameKey);
  if (!src) return undefined;
  const canvas = document.createElement('canvas');
  canvas.width = 48;
  canvas.height = 48;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, 48, 48);
  return canvas;
}
