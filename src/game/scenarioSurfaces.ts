import type Phaser from 'phaser';
import type { ScenarioStyle } from '../core/scenarioLayouts.ts';
import { hash } from './scenarioArt.ts';

const sheets = import.meta.glob('../assets/scenario-surfaces/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const surfaceKey = (style: string): string => `scenario_surface_${style}`;

export function preloadScenarioSurfaces(scene: Phaser.Scene): void {
  for (const [path, url] of Object.entries(sheets)) {
    const style = path.slice(path.lastIndexOf('/') + 1, -4);
    const key = surfaceKey(style);
    if (!scene.textures.exists(key)) scene.load.spritesheet(key, url, { frameWidth: 64, frameHeight: 32 });
  }
}

export function addScenarioSurface(
  scene: Phaser.Scene, style: ScenarioStyle, pos: { x: number; y: number },
  gx: number, gy: number, variant: number, route: boolean, edge: number,
): Phaser.GameObjects.Image | undefined {
  const key = surfaceKey(style);
  if (!scene.textures.exists(key)) return undefined;
  const frame = ((Math.floor(hash(gx, gy, 271) * 16) + variant) & 15) + (route ? 16 : 0);
  const image = scene.add.image(pos.x, pos.y, key, frame).setDepth(-1000 + pos.y * 0.01);

  // Variation at a wider scale than the tile texture. The perimeter is darker
  // near the walls, with a warmer bounce light on the lava-facing maps.
  const falloff = Math.min(edge / 3, 1);
  const grain = Math.sin(gx * .36 + gy * .17) * Math.cos(gy * .41 - gx * .18);
  const shade = Math.min(255, Math.round(203 + 40 * falloff + 11 * grain));
  const lavaBounce = (style === 'bridge' || style === 'fortress') ? Math.round((1 - falloff) * 27) : 0;
  return image.setTint(Math.min(255, shade + lavaBounce) << 16 | shade << 8 | (shade - Math.round(lavaBounce / 4)));
}

/** Distance to the nearest edge, capped at three tiles for the ambient shading. */
export function surfaceEdgeDistance(gx: number, gy: number, isOpen: (x: number, y: number) => boolean): number {
  for (let r = 1; r <= 3; r++) {
    if (!isOpen(gx + r, gy) || !isOpen(gx - r, gy) || !isOpen(gx, gy + r) || !isOpen(gx, gy - r)) return r - 1;
  }
  return 3;
}
