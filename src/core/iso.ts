export const ISO_TILE_WIDTH = 64;
export const ISO_TILE_HEIGHT = 32;

export interface Point2D {
  x: number;
  y: number;
}

export function gridToScreen(gx: number, gy: number): Point2D {
  return {
    x: (gx - gy) * (ISO_TILE_WIDTH * 0.5),
    y: (gx + gy) * (ISO_TILE_HEIGHT * 0.5),
  };
}

export function screenToGrid(sx: number, sy: number): Point2D {
  const halfW = ISO_TILE_WIDTH * 0.5;
  const halfH = ISO_TILE_HEIGHT * 0.5;
  return {
    x: (sx / halfW + sy / halfH) * 0.5,
    y: (sy / halfH - sx / halfW) * 0.5,
  };
}

export type DrawnDirection = 'S' | 'SW' | 'W' | 'NW' | 'N';

export interface SpriteOrientation {
  dir: DrawnDirection;
  flipX: boolean;
}

export function orientationFromGridDelta(dx: number, dy: number): SpriteOrientation {
  const screenDx = dx - dy;
  const screenDy = dx + dy;
  if (Math.abs(screenDx) < 0.001 && Math.abs(screenDy) < 0.001) {
    return { dir: 'S', flipX: false };
  }
  const deg = (Math.atan2(screenDy, screenDx) * 180) / Math.PI;
  if (deg >= 67.5 && deg < 112.5) return { dir: 'S', flipX: false };
  if (deg >= 112.5 && deg < 157.5) return { dir: 'SW', flipX: false };
  if (deg >= 157.5 || deg < -157.5) return { dir: 'W', flipX: false };
  if (deg >= -157.5 && deg < -112.5) return { dir: 'NW', flipX: false };
  if (deg >= -112.5 && deg < -67.5) return { dir: 'N', flipX: false };
  if (deg >= -67.5 && deg < -22.5) return { dir: 'NW', flipX: true };
  if (deg >= -22.5 && deg < 22.5) return { dir: 'W', flipX: true };
  return { dir: 'SW', flipX: true };
}
