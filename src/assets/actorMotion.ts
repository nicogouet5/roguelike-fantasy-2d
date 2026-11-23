import type { AnimPose } from './pixelArt.ts';

type Point = readonly [number, number];
interface Part {
  joint: Point;
  mask: readonly Point[];
}

const rexHead: Part = { joint: [58, 42], mask: [[0, 0], [96, 0], [96, 44], [71, 44], [58, 45], [52, 42], [32, 36], [0, 36]] };
const rexTail: Part = { joint: [43, 59], mask: [[0, 47], [32, 48], [46, 57], [40, 67], [31, 75], [0, 77]] };
const rexFar: Part = { joint: [48, 60], mask: [[32, 60], [48, 58], [51, 65], [45, 84], [24, 87], [23, 77]] };
const rexNear: Part = { joint: [62, 60], mask: [[60, 57], [74, 55], [96, 59], [96, 96], [55, 96], [59, 73]] };

function paintPart(ctx: CanvasRenderingContext2D, image: HTMLCanvasElement, part: Part, x: number, y: number, angle: number): void {
  ctx.save();
  ctx.translate(part.joint[0] + x, part.joint[1] + y);
  ctx.rotate(angle);
  ctx.translate(-part.joint[0], -part.joint[1]);
  ctx.beginPath();
  part.mask.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py));
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(image, 0, 0);
  ctx.restore();
}

const all = [[0, 0], [96, 0], [96, 96], [0, 96]] as const;
const rexTorso: Part = { joint: [51, 58], mask: [[31, 37], [56, 37], [67, 43], [81, 49], [80, 59], [69, 62], [67, 67], [59, 65], [55, 77], [43, 74], [39, 65], [30, 59]] };
const triBody: Part = { joint: [47, 60], mask: [[0, 0], [96, 0], [96, 68], [77, 68], [73, 76], [56, 73], [39, 74], [19, 71], [0, 74]] };
const triLegs: Part[] = [
  { joint: [24, 69], mask: [[14, 65], [32, 64], [36, 73], [35, 92], [14, 92]] },
  { joint: [45, 70], mask: [[35, 63], [57, 65], [62, 91], [35, 91]] },
  { joint: [71, 70], mask: [[58, 63], [82, 62], [86, 91], [59, 91]] },
];
const dodoBody: Part = { joint: [50, 65], mask: [[0, 0], [96, 0], [96, 73], [58, 74], [45, 74], [30, 71], [0, 75]] };
const dodoFeet: Part[] = [
  { joint: [36, 73], mask: [[23, 70], [46, 70], [46, 94], [23, 94]] },
  { joint: [51, 73], mask: [[45, 69], [61, 69], [65, 93], [45, 93]] },
];

export function codexBodyMotion(pose: AnimPose, frame: number): { x: number; y: number; angle: number } {
  if (pose === 'atk') {
    const load = [-2, -4, 3, 2, -1][frame] ?? 0;
    return { x: load, y: Math.abs(load) - 2, angle: load * 0.042 };
  }
  if (pose === 'walk') return { x: 0, y: [0, -2, -1, 0, -2, -1][frame] ?? 0, angle: Math.sin(frame * Math.PI / 3) * 0.028 };
  return { x: 0, y: [0, -1, -2, -1][frame] ?? 0, angle: 0 };
}

export function articulateCodexFrame(spriteId: string, source: HTMLCanvasElement, pose: AnimPose, frame: number): HTMLCanvasElement {
  if (spriteId !== 'dino_trex' && spriteId !== 'dino_triceratops' && spriteId !== 'dino_dodo') return source;
  if (spriteId === 'dino_trex' && pose === 'atk') return source;
  if (pose === 'idle' && frame === 0) return source;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  // Six frames deliberately include contact, compression, passing and reach.
  // The old sine-only motion made the large codex characters feel as if they
  // floated.  These values retain a planted support foot on every walk frame.
  const strideTable = [-1, 0.15, 1, 0.45, -0.7, -1.1];
  const stride = pose === 'walk' ? strideTable[frame % 6]! : 0;
  const other = -stride;
  const breathe = pose === 'idle' ? [0, -1, -2, -1][frame]! : 0;
  const load = pose === 'atk' ? [-2, -4, 3, 2, -1][frame]! : 0;
  const bob = pose === 'walk' ? [0, -2, -1, 0, -2, -1][frame]! : breathe;

  if (spriteId === 'dino_trex') {
    paintPart(ctx, source, { joint: [48, 61], mask: all }, 0, bob, 0);
    ctx.globalCompositeOperation = 'destination-out';
    paintPart(ctx, source, rexTail, 0, bob, 0);
    paintPart(ctx, source, rexHead, 0, bob, 0);
    ctx.globalCompositeOperation = 'source-over';
    if (pose === 'walk') {
      ctx.clearRect(20, 68, 70, 28);
      // A long, weighty stride: the rear foot pushes while the forward thigh
      // reaches.  The body never simply bobs above two identical feet.
      paintPart(ctx, source, rexFar, Math.round(stride * 5), -Math.max(0, Math.round(stride * 4)), stride * 0.21);
      paintPart(ctx, source, rexNear, Math.round(other * 5), -Math.max(0, Math.round(other * 4)), other * 0.19);
    }
    // Jaw-held mandoble and skull remain a single head part; the tail takes
    // the opposite torque so the silhouette reads as a massive animal, not a
    // sword translated independently of its bite.
    const tailCounterweight = pose === 'walk' ? -stride * 0.09 : 0;
    paintPart(ctx, source, rexTail, 0, bob, -stride * 0.12 + tailCounterweight);
    paintPart(ctx, source, rexTorso, Math.round(stride), bob, stride * 0.045);
    paintPart(ctx, source, rexHead, Math.round(stride), bob, pose === 'walk' ? stride * 0.065 : breathe * 0.02);
  } else {
    const isTri = spriteId === 'dino_triceratops';
    const legs = isTri ? triLegs : dodoFeet;
    const body = isTri ? triBody : dodoBody;
    paintPart(ctx, source, { joint: body.joint, mask: all }, load, bob, 0);
    ctx.globalCompositeOperation = 'destination-out';
    paintPart(ctx, source, body, load, bob, 0);
    ctx.globalCompositeOperation = 'source-over';
    if (pose === 'walk') {
      ctx.clearRect(isTri ? 11 : 22, isTri ? 72 : 75, isTri ? 72 : 44, 24);
      legs.forEach((leg, i) => {
        const phase = i % 2 === 0 ? stride : other;
        const heavy = isTri ? 5 : 3;
        paintPart(ctx, source, leg, Math.round(phase * heavy), -Math.max(0, Math.round(phase * (isTri ? 3 : 4))), phase * (isTri ? 0.13 : 0.23));
      });
    }
    const motion = codexBodyMotion(pose, frame);
    // Triceratops head, frill and every horn deliberately stay in `body`.
    // This prevents level-up horn geometry from drifting away from the skull.
    // Dodo retains a small upward launch before its feet trade support.
    const hop = !isTri && pose === 'walk' ? [0, -2, -3, -1, 0, -1][frame % 6]! : 0;
    paintPart(ctx, source, body, motion.x, motion.y + hop, motion.angle + (!isTri && pose === 'walk' ? stride * 0.045 : 0));
  }
  return canvas;
}
