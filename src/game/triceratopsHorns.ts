import type Phaser from 'phaser';

const LEVELS_PER_GROWTH = 4;
const MAX_DRAWN_GROWTH_STAGES = 6;
const LOGICAL_PIXEL_SCALE = 2;

export interface TriceratopsHornGrowth {
  /** Derived from the current level only; it is never accumulated in scene state. */
  stage: number;
  /** Extra length in atlas logical pixels, capped only to keep the overlay readable. */
  drawnLength: number;
  /** Later tiers keep an amber notch even after the length cap is reached. */
  overflowNotches: number;
}

/**
 * Visual-only progression for the Triceratops' three horns.
 * Combat range, damage, and collision remain entirely in core game logic.
 */
export function getTriceratopsHornGrowth(level: number): TriceratopsHornGrowth {
  const stage = Math.max(0, Math.floor(Math.max(1, level) / LEVELS_PER_GROWTH));
  const drawnStage = Math.min(stage, MAX_DRAWN_GROWTH_STAGES);
  return {
    stage,
    drawnLength: drawnStage * 2,
    overflowNotches: Math.max(0, stage - MAX_DRAWN_GROWTH_STAGES),
  };
}

interface Horn {
  tipX: number;
  tipY: number;
  directionX: number;
  directionY: number;
  baseWidth: number;
}

// Points just inside the three ivory tips in the Codex atlas, on a 48×48 grid.
const HORNS: readonly Horn[] = [
  { tipX: 41, tipY: 23, directionX: 0.82, directionY: -0.58, baseWidth: 1.5 },
  { tipX: 45, tipY: 25, directionX: 0.76, directionY: -0.65, baseWidth: 1.45 },
  { tipX: 40, tipY: 33, directionX: 0.72, directionY: -0.69, baseWidth: 1.25 },
];

/** Draws only the level-earned extensions, leaving the atlas' base horns untouched. */
export function drawTriceratopsHornGrowth(
  graphics: Phaser.GameObjects.Graphics,
  level: number,
  x: number,
  y: number,
  flipX: boolean,
  scaleX: number,
  scaleY: number,
  depth: number,
  bodyMotion = { x: 0, y: 0, angle: 0 }
): void {
  graphics.clear();
  const growth = getTriceratopsHornGrowth(level);
  if (growth.stage === 0) return;

  const direction = flipX ? -1 : 1;
  const spriteLeft = x - 48 * scaleX;
  const spriteTop = y - 80.64 * scaleY; // Player origin is (0.5, 0.84) on a 96 px frame.
  // Keep the join behind the base sprite: the existing atlas horns mask it cleanly,
  // so only the earned extension is visible beyond each original tip.
  graphics.setDepth(depth - 0.02);

  const cos = Math.cos(bodyMotion.angle);
  const sin = Math.sin(bodyMotion.angle);
  for (const horn of HORNS) {
    // Same local pivot as the animated frill in actorMotion.ts.
    const localX = horn.tipX * LOGICAL_PIXEL_SCALE - 47;
    const localY = horn.tipY * LOGICAL_PIXEL_SCALE - 60;
    const tipX = 47 + bodyMotion.x + localX * cos - localY * sin;
    const tipY = 60 + bodyMotion.y + localX * sin + localY * cos;
    const dx = horn.directionX * cos - horn.directionY * sin;
    const dy = horn.directionX * sin + horn.directionY * cos;
    const startX = spriteLeft + (flipX ? 96 - tipX : tipX) * scaleX;
    const startY = spriteTop + tipY * scaleY;
    const endX = startX + dx * direction * growth.drawnLength * LOGICAL_PIXEL_SCALE * scaleX;
    const endY = startY + dy * growth.drawnLength * LOGICAL_PIXEL_SCALE * scaleY;
    const nx = -dy * scaleX;
    const ny = dx * direction * scaleY;
    const width = horn.baseWidth * LOGICAL_PIXEL_SCALE;

    // Dark edge, ivory body, and a one-pixel highlight preserve the reference's forged-bone signal.
    graphics.fillStyle(0x78716c, 1);
    graphics.fillTriangle(startX + nx * width, startY + ny * width, startX - nx * width, startY - ny * width, endX, endY);
    graphics.fillStyle(0xe7e5e4, 1);
    graphics.fillTriangle(startX + nx * width * 0.55, startY + ny * width * 0.55, startX - nx * width * 0.55, startY - ny * width * 0.55, endX, endY);
    graphics.fillStyle(0xffffff, 1);
    graphics.fillRect(Math.round(endX - direction), Math.round(endY - 1), 2, 2);
  }

  // A capped silhouette still communicates every later four-level milestone.
  for (let notch = 0; notch < growth.overflowNotches; notch++) {
    graphics.fillStyle(0xfacc15, 1);
    graphics.fillRect(Math.round(spriteLeft + (flipX ? 26 : 68) * scaleX), Math.round(spriteTop + (32 + notch * 3) * scaleY), 2, 2);
  }
}
