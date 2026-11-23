import type Phaser from 'phaser';
import type { BiomeId } from '../core/types.ts';

export const ATLAS_KEY = 'dino_atlas';

export type AnimPose = 'idle' | 'walk' | 'atk';

export const ANIM_COUNTS: Record<AnimPose, number> = {
  idle: 4,
  walk: 6,
  atk: 5,
};

export function getDinoFrameName(spriteId: string, pose: AnimPose, frameIndex: number): string {
  const count = ANIM_COUNTS[pose];
  const idx = ((Math.floor(frameIndex) % count) + count) % count;
  return `${spriteId}_${pose}_${idx}`;
}

interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Parse #rrggbb or #rrggbbaa into packed ABGR uint32 for ImageData (little-endian) */
function hexToU32(hex: string): number {
  const clean = hex.charCodeAt(0) === 35 ? hex.slice(1) : hex;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const a = clean.length >= 8 ? parseInt(clean.slice(6, 8), 16) : 255;
  return ((a & 0xff) << 24) | ((b & 0xff) << 16) | ((g & 0xff) << 8) | (r & 0xff);
}

interface ColorRamp {
  dark: number;
  mid: number;
  light: number;
  rim?: number;
}

function makeRamp(dark: string, mid: string, light: string, rim?: string): ColorRamp {
  return {
    dark: hexToU32(dark),
    mid: hexToU32(mid),
    light: hexToU32(light),
    rim: rim ? hexToU32(rim) : undefined,
  };
}

/**
 * Fast, exact integer logical pixel buffer for authentic crisp 16-bit/32-bit pixel art.
 * Supports shaded anatomical volumes, tapered limbs/tails, pixel dithering,
 * glowing smear arcs, and instant O(w*h) hue-shifted outlines.
 */
class PixelGrid {
  readonly buf: Uint32Array;

  constructor(
    readonly w: number,
    readonly h: number
  ) {
    this.buf = new Uint32Array(w * h);
  }

  px(x: number, y: number, col: number): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return;
    this.buf[iy * this.w + ix] = col;
  }

  rect(x: number, y: number, rw: number, rh: number, col: number): void {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.w, Math.round(x + rw));
    const y1 = Math.min(this.h, Math.round(y + rh));
    for (let py = y0; py < y1; py++) {
      const row = py * this.w;
      for (let px = x0; px < x1; px++) {
        this.buf[row + px] = col;
      }
    }
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, col: number): void {
    const x0 = Math.max(0, Math.floor(cx - rx - 1));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + rx + 1));
    const y0 = Math.max(0, Math.floor(cy - ry - 1));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + ry + 1));
    const invRx = rx > 0.01 ? 1 / rx : 100;
    const invRy = ry > 0.01 ? 1 / ry : 100;
    for (let y = y0; y <= y1; y++) {
      const dy = (y - cy) * invRy;
      for (let x = x0; x <= x1; x++) {
        const dx = (x - cx) * invRx;
        if (dx * dx + dy * dy <= 1.0) {
          this.buf[y * this.w + x] = col;
        }
      }
    }
  }

  /** Anatomically shaded ellipse with directional top-right rim highlight + bottom core shadow + subtle dithering */
  shadedEllipse(cx: number, cy: number, rx: number, ry: number, ramp: ColorRamp): void {
    const x0 = Math.max(0, Math.floor(cx - rx - 1));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + rx + 1));
    const y0 = Math.max(0, Math.floor(cy - ry - 1));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + ry + 1));
    const invRx = rx > 0.01 ? 1 / rx : 100;
    const invRy = ry > 0.01 ? 1 / ry : 100;
    for (let y = y0; y <= y1; y++) {
      const dy = (y - cy) * invRy;
      for (let x = x0; x <= x1; x++) {
        const dx = (x - cx) * invRx;
        const r2 = dx * dx + dy * dy;
        if (r2 > 1.0) continue;
        // Directional light from top-front (+x*0.35, -y*0.85)
        const shade = -dy * 0.8 + dx * 0.3;
        const checker = ((x + y) & 1) === 0;
        let col = ramp.mid;
        if (ramp.rim && shade > 0.65) col = ramp.rim;
        else if (shade > 0.25 || (shade > 0.14 && checker)) col = ramp.light;
        else if (shade < -0.32 || (shade < -0.2 && !checker)) col = ramp.dark;
        this.buf[y * this.w + x] = col;
      }
    }
  }

  /** Tapered capsule from (x0,y0,r0) to (x1,y1,r1) with optional directional shading */
  taper(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number,
    colOrRamp: number | ColorRamp
  ): void {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(dist * 2.2));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      const r = r0 + (r1 - r0) * t;
      if (typeof colOrRamp === 'number') {
        this.ellipse(x, y, r, r, colOrRamp);
      } else {
        this.shadedEllipse(x, y, r, r, colOrRamp);
      }
    }
  }

  /** Draw a smooth multi-point curved limb/tail/neck: points = [x, y, radius] */
  spline(points: readonly [number, number, number][], colOrRamp: number | ColorRamp): void {
    for (let i = 0; i < points.length - 1; i++) {
      const [x0, y0, r0] = points[i]!;
      const [x1, y1, r1] = points[i + 1]!;
      this.taper(x0, y0, r0, x1, y1, r1, colOrRamp);
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, col: number, r = 0.65): void {
    this.taper(x0, y0, r, x1, y1, r, col);
  }

  /** Draw a thick crisp metallic sword/blade with dark bevel, steel body, and bright specular edge */
  blade(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    widthStart: number,
    widthEnd: number,
    darkEdge: number,
    steel: number,
    brightEdge: number
  ): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    // Perpendicular unit vector pointing "up/forward"
    const nx = -dy / len;
    const ny = dx / len;
    const steps = Math.max(2, Math.ceil(len * 2.4));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cx = x0 + dx * t;
      const cy = y0 + dy * t;
      const w = widthStart + (widthEnd - widthStart) * t;
      const half = Math.max(0.6, w * 0.5);
      for (let s = -half; s <= half; s += 0.55) {
        const px = cx + nx * s;
        const py = cy + ny * s;
        const frac = (s + half) / (half * 2);
        const col = frac > 0.72 ? brightEdge : frac < 0.28 ? darkEdge : steel;
        this.px(px, py, col);
      }
    }
  }

  /** Draw a crisp arcade/anime pixel crescent motion-smear arc for attack swings */
  smearArc(
    cx: number,
    cy: number,
    radius: number,
    thickness: number,
    startRad: number,
    endRad: number,
    outerCol: number,
    innerCol: number,
    coreCol: number
  ): void {
    const steps = Math.max(12, Math.ceil(Math.abs(endRad - startRad) * radius * 2.2));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = startRad + (endRad - startRad) * t;
      // Taper thickness at tail end, wide at leading edge
      const taper = Math.sin(Math.pow(t, 0.7) * Math.PI);
      const localThick = Math.max(0.8, thickness * taper);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      for (let dr = -localThick; dr <= localThick * 0.45; dr += 0.6) {
        const r = radius + dr;
        const px = cx + ca * r;
        const py = cy + sa * r;
        const col =
          t > 0.68 && dr > -localThick * 0.35
            ? coreCol
            : dr > -localThick * 0.45
              ? innerCol
              : outerCol;
        this.px(px, py, col);
      }
    }
  }

  /** Fast O(w*h) 1-pixel contour outline around all solid pixels */
  outline(outlineHex: string): void {
    const outCol = hexToU32(outlineHex);
    const w = this.w;
    const h = this.h;
    const src = new Uint32Array(this.buf);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        if (src[row + x] !== 0) continue;
        if (
          (x > 0 && src[row + x - 1] !== 0) ||
          (x < w - 1 && src[row + x + 1] !== 0) ||
          (y > 0 && src[row - w + x] !== 0) ||
          (y < h - 1 && src[row + w + x] !== 0)
        ) {
          this.buf[row + x] = outCol;
        }
      }
    }
  }

  toCanvas(scale = 2): HTMLCanvasElement {
    const tiny = document.createElement('canvas');
    tiny.width = this.w;
    tiny.height = this.h;
    const tctx = tiny.getContext('2d')!;
    const img = tctx.createImageData(this.w, this.h);
    new Uint32Array(img.data.buffer).set(this.buf);
    tctx.putImageData(img, 0, 0);

    if (scale === 1) return tiny;
    const out = document.createElement('canvas');
    out.width = this.w * scale;
    out.height = this.h * scale;
    const octx = out.getContext('2d')!;
    octx.imageSmoothingEnabled = false;
    octx.drawImage(tiny, 0, 0, out.width, out.height);
    return out;
  }
}

/** Smooth phase helper for 4-frame idle, 6-frame walk, 5-frame attack */
interface MotionState {
  breath: number;
  bob: number;
  tailWave: number;
  legA: number;
  legB: number;
  liftA: number;
  liftB: number;
  leanX: number;
  atkStep: number; // -1 if not attacking, else 0..4
}

function getMotion(pose: AnimPose, frame: number): MotionState {
  if (pose === 'idle') {
    const phase = (frame / ANIM_COUNTS.idle) * Math.PI * 2;
    return {
      breath: Math.sin(phase) * 0.9,
      bob: Math.sin(phase) * 0.7,
      tailWave: Math.sin(phase - 0.8) * 1.8,
      legA: 0,
      legB: 0,
      liftA: 0,
      liftB: 0,
      leanX: 0,
      atkStep: -1,
    };
  }
  if (pose === 'walk') {
    const phase = (frame / ANIM_COUNTS.walk) * Math.PI * 2;
    return {
      breath: 0,
      bob: -Math.abs(Math.sin(phase)) * 2.1,
      tailWave: Math.sin(phase + 0.6) * 2.6,
      legA: Math.sin(phase) * 3.8,
      legB: Math.sin(phase + Math.PI) * 3.8,
      liftA: Math.max(0, -Math.cos(phase)) * 2.6,
      liftB: Math.max(0, -Math.cos(phase + Math.PI)) * 2.6,
      leanX: 1.4,
      atkStep: -1,
    };
  }
  // Attack 5-frame curve: 0=windup, 1=fast swing, 2=peak impact smear, 3=follow-through, 4=recover
  const leanTable = [-2.6, 1.5, 3.2, 2.2, 0.5];
  const bobTable = [-0.6, -1.6, 0.8, 0.4, 0];
  const tailTable = [-2.2, 2.4, 3.0, 1.4, 0.2];
  return {
    breath: 0,
    bob: bobTable[frame] ?? 0,
    tailWave: tailTable[frame] ?? 0,
    legA: frame === 0 ? -1.8 : frame <= 3 ? 2.6 : 0.6,
    legB: frame === 0 ? 1.5 : frame <= 3 ? -2.2 : -0.4,
    liftA: frame === 1 ? 1.8 : 0,
    liftB: 0,
    leanX: leanTable[frame] ?? 0,
    atkStep: frame,
  };
}

// Shared material colors
const C_WHITE = hexToU32('#ffffff');
const C_IVORY = hexToU32('#f5f5f4');
const C_BONE_D = hexToU32('#a8a29e');
const C_STEEL_D = hexToU32('#475569');
const C_STEEL_M = hexToU32('#94a3b8');
const C_STEEL_L = hexToU32('#e2e8f0');
const C_GOLD_D = hexToU32('#92400e');
const C_GOLD_M = hexToU32('#d97706');
const C_GOLD_L = hexToU32('#fde047');
const C_FIRE_D = hexToU32('#dc2626');
const C_FIRE_M = hexToU32('#f97316');
const C_FIRE_L = hexToU32('#fef08a');
const C_CYAN_D = hexToU32('#0284c7');
const C_CYAN_M = hexToU32('#38bdf8');
const C_CYAN_L = hexToU32('#e0f2fe');
const C_SCARF_M = hexToU32('#dc2626');
const C_WOOD_M = hexToU32('#78350f');

/* ============================================================================
 * 1. T-REX — COLOSSAL BUSTER GREATSWORD (48×48 logical → 96×96 crisp)
 * ========================================================================== */
function drawTRexFrame(pose: AnimPose, frame: number): HTMLCanvasElement {
  const g = new PixelGrid(48, 48);
  const m = getMotion(pose, frame);
  const skin = makeRamp('#2f4f16', '#4d7c0f', '#7cb518', '#a3d93b');
  const belly = makeRamp('#7a9442', '#b8cf6b', '#e2f0a8');
  const stripe = hexToU32('#1e330d');
  const by = Math.round(m.bob);
  const lx = m.leanX;

  // Back leg
  const bFootX = 18 + m.legB;
  const bFootY = 42 - m.liftB;
  g.spline(
    [
      [18 + lx * 0.4, 29 + by, 3.2],
      [16 + m.legB * 0.5, 35 + by * 0.3, 2.3],
      [bFootX, bFootY - 1, 1.8],
    ],
    makeRamp('#1f380d', '#365314', '#4d7c0f')
  );
  g.px(bFootX + 2, bFootY, C_IVORY);
  g.px(bFootX + 3, bFootY, C_IVORY);

  // Sweeping muscular tail with stripes
  g.spline(
    [
      [3, 27 + by + m.tailWave * 0.9, 1.1],
      [8, 28 + by + m.tailWave * 0.5, 2.2],
      [14, 26 + by + m.tailWave * 0.2, 3.5],
      [19 + lx * 0.4, 25 + by, 4.6],
    ],
    skin
  );
  g.px(9, 26 + by + m.tailWave * 0.4, stripe);
  g.px(13, 24 + by + m.tailWave * 0.2, stripe);

  // Heavy torso & armored belly
  g.shadedEllipse(21 + lx * 0.6, 24 + by, 7.2, 6.4, skin);
  g.shadedEllipse(23 + lx * 0.7, 27 + by, 4.8, 3.5, belly);
  // Tiger dorsal stripes & battle scar
  g.line(18 + lx * 0.6, 19 + by, 17 + lx * 0.6, 23 + by, stripe, 0.8);
  g.line(21 + lx * 0.6, 18 + by, 20 + lx * 0.6, 22 + by, stripe, 0.8);
  g.line(23 + lx * 0.7, 21 + by, 25 + lx * 0.7, 24 + by, C_SCARF_M, 0.6); // scar

  // Fluttering red warrior scarf around neck
  g.spline(
    [
      [25 + lx * 0.8, 19 + by, 1.6],
      [20 + lx * 0.4, 20 + by, 1.5],
      [14, 20 + by - m.tailWave * 0.45, 1.2],
      [10, 21 + by - m.tailWave * 0.6, 0.9],
    ],
    makeRamp('#7f1d1d', '#dc2626', '#f87171')
  );

  // Front muscular thigh & clawed foot
  const fFootX = 22 + m.legA;
  const fFootY = 43 - m.liftA;
  g.spline(
    [
      [21 + lx * 0.5, 29 + by, 3.8],
      [19 + m.legA * 0.5, 36 + by * 0.2, 2.5],
      [fFootX, fFootY - 1, 2.0],
    ],
    skin
  );
  g.rect(fFootX - 1, fFootY - 1, 5, 2, skin.mid);
  g.px(fFootX + 3, fFootY, C_IVORY);
  g.px(fFootX + 4, fFootY, C_IVORY);
  g.px(fFootX + 1, fFootY, C_IVORY);

  // Tiny T-Rex forearm with claws
  g.line(27 + lx * 0.8, 25 + by, 30 + lx * 0.9, 27 + by, skin.light, 1.0);
  g.px(31 + lx * 0.9, 27 + by, C_IVORY);

  // Sculpted thick neck & colossal T-Rex head
  const headX = 29 + lx * 1.15;
  const headY = 14 + by + (m.atkStep === 0 ? -2.2 : m.atkStep === 2 ? 2.5 : 0);
  g.taper(24 + lx * 0.7, 20 + by, 3.8, headX - 2, headY + 2, 3.4, skin);
  // Upper skull & brow ridge
  g.shadedEllipse(headX + 2, headY, 6.4, 3.8, skin);
  g.shadedEllipse(headX + 6, headY + 0.5, 3.5, 2.4, skin);
  // Lower jaw (opens wider when biting sword / roaring)
  const jawDrop = m.atkStep === 0 || m.atkStep === 2 ? 1.5 : 0;
  g.taper(headX - 1, headY + 3.2, 2.2, headX + 7, headY + 3.8 + jawDrop, 1.5, makeRamp('#274212', '#3f6a12', '#65a30d'));
  // Teeth
  g.px(headX + 3, headY + 3, C_WHITE);
  g.px(headX + 5, headY + 3, C_WHITE);
  g.px(headX + 7, headY + 3, C_WHITE);
  // Fierce golden-amber eye
  g.rect(headX + 1, headY - 2, 3, 2, C_GOLD_L);
  g.px(headX + 2, headY - 2, hexToU32('#7f1d1d'));
  g.px(headX + 1, headY - 2, C_WHITE);

  // MASSIVE DINOBLADE BUSTER GREATSWORD IN JAWS
  const gripX = headX + 4;
  const gripY = headY + 2.8;

  if (m.atkStep === -1) {
    // Classic DinoBlade silhouette: massive broad cleaver slung up-back over shoulder from jaws!
    const sway = m.breath * 0.7;
    g.line(gripX + 4, gripY + 2, gripX - 2, gripY - 1, C_WOOD_M, 1.2); // hilt
    g.blade(gripX - 1, gripY - 1, gripX - 16, gripY - 13 + sway, 4.6, 5.4, C_STEEL_D, C_STEEL_M, C_STEEL_L);
    // Notches in heavy iron greatsword (faithful to the DinoBlade screenshot!)
    g.px(gripX - 8, gripY - 8 + sway, C_STEEL_D);
    g.px(gripX - 12, gripY - 11 + sway, C_STEEL_D);
    g.line(gripX - 3, gripY - 2, gripX - 13, gripY - 10 + sway, C_WHITE, 0.5); // gleam
    g.line(gripX - 1, gripY - 3, gripX + 2, gripY + 1, C_GOLD_M, 1.3); // crossguard
    g.px(gripX, gripY - 2, C_GOLD_L);
  } else if (m.atkStep === 0) {
    // Wind-up: lifts colossal sword high behind head!
    g.blade(gripX - 1, gripY - 1, gripX - 13, 2, 4.8, 5.6, C_STEEL_D, C_STEEL_M, C_STEEL_L);
    g.line(gripX - 2, gripY - 2, gripX + 2, gripY + 1, C_GOLD_L, 1.3);
  } else if (m.atkStep === 1) {
    // Fast downward cleave with blazing orange/white smear arc!
    g.smearArc(gripX - 2, gripY + 4, 17, 5.5, -2.35, -0.15, C_FIRE_D, C_FIRE_M, C_FIRE_L);
    g.blade(gripX, gripY, gripX + 14, gripY - 10, 4.6, 5.4, C_STEEL_D, C_STEEL_L, C_WHITE);
    g.line(gripX - 1, gripY - 2, gripX + 2, gripY + 2, C_GOLD_L, 1.3);
  } else if (m.atkStep === 2) {
    // Peak impact smash forward-down!
    g.smearArc(gripX - 4, gripY + 6, 18, 6.2, -1.65, 0.72, C_FIRE_D, C_FIRE_M, C_WHITE);
    g.blade(gripX, gripY, Math.min(46, gripX + 13), Math.min(45, gripY + 15), 4.8, 5.6, C_STEEL_D, C_STEEL_L, C_WHITE);
    g.line(gripX - 2, gripY + 1, gripX + 2, gripY - 2, C_GOLD_L, 1.3);
  } else if (m.atkStep === 3) {
    // Follow-through sparks
    g.smearArc(gripX - 4, gripY + 6, 16, 3.0, -0.4, 0.8, C_FIRE_D, C_FIRE_M, C_FIRE_L);
    g.blade(gripX, gripY, Math.min(46, gripX + 10), Math.min(45, gripY + 16), 4.6, 5.2, C_STEEL_D, C_STEEL_M, C_STEEL_L);
    g.line(gripX - 2, gripY + 1, gripX + 2, gripY - 2, C_GOLD_M, 1.2);
  } else {
    // Recovering back to shoulder
    g.blade(gripX - 1, gripY, gripX - 10, gripY - 12, 4.6, 5.2, C_STEEL_D, C_STEEL_M, C_STEEL_L);
    g.line(gripX - 1, gripY - 2, gripX + 2, gripY + 1, C_GOLD_M, 1.2);
  }

  g.outline('#121710');
  return g.toCanvas(2);
}

/* ============================================================================
 * 2. VELOCIRAPTOR — TWIN KATANAS GLASS CANNON (48×48 logical → 96×96 crisp)
 * ========================================================================== */
function drawRaptorFrame(pose: AnimPose, frame: number): HTMLCanvasElement {
  const g = new PixelGrid(48, 48);
  const m = getMotion(pose, frame);
  const body = makeRamp('#0e5a6d', '#0891b2', '#22d3ee', '#a5f3fc');
  const belly = makeRamp('#67b7c7', '#bae6fd', '#f0f9ff');
  const plume = makeRamp('#991b1b', '#ef4444', '#fca5a5');
  const by = Math.round(m.bob);
  const lx = m.leanX * 1.35;

  // Back agile leg
  const bX = 18 + m.legB * 1.15;
  const bY = 42 - m.liftB * 1.2;
  g.spline(
    [
      [19 + lx * 0.4, 29 + by, 2.2],
      [16 + m.legB * 0.5, 35, 1.5],
      [bX, bY - 1, 1.2],
    ],
    makeRamp('#083d4c', '#0e7490', '#0891b2')
  );
  g.px(bX + 2, bY - 1, C_WHITE); // raised sickle claw

  // Whip-like feathered tail balancing horizontally
  g.spline(
    [
      [2, 23 + by + m.tailWave * 1.1, 0.9],
      [8, 25 + by + m.tailWave * 0.6, 1.6],
      [14, 26 + by + m.tailWave * 0.25, 2.4],
      [20 + lx * 0.4, 26 + by, 3.2],
    ],
    body
  );
  // Crimson & cyan tail plume fan
  g.shadedEllipse(4, 21 + by + m.tailWave * 1.1, 3.6, 1.8, plume);
  g.px(3, 20 + by + m.tailWave * 1.1, C_CYAN_L);

  // Sleek leaning predator torso
  g.shadedEllipse(22 + lx * 0.6, 25 + by, 6.2, 4.1, body);
  g.shadedEllipse(23 + lx * 0.7, 27 + by, 4.4, 2.1, belly);
  // Ninja waist wrap
  g.line(20 + lx * 0.6, 22 + by, 22 + lx * 0.6, 28 + by, C_SCARF_M, 1.1);

  // Front springy leg with lethal sickle claw
  const fX = 22 + m.legA * 1.2;
  const fY = 43 - m.liftA * 1.2;
  g.spline(
    [
      [21 + lx * 0.5, 29 + by, 2.7],
      [19 + m.legA * 0.6, 36, 1.7],
      [fX, fY - 1, 1.3],
    ],
    body
  );
  // Shin wraps
  g.px(fX - 1, fY - 4, C_IVORY);
  g.px(fX, fY - 4, C_IVORY);
  // Curved sickle talon
  g.line(fX + 1, fY - 1, fX + 3, fY - 2, C_WHITE, 0.7);
  g.px(fX + 3, fY, C_IVORY);

  // S-curved neck & sharp velociraptor head with crimson feather crest
  const hx = 30 + lx * 1.2;
  const hy = 16 + by + (m.atkStep === 0 ? 2.0 : m.atkStep === 1 ? -1.5 : 0);
  g.spline(
    [
      [25 + lx * 0.7, 23 + by, 2.6],
      [28 + lx * 0.9, 19 + by, 2.1],
      [hx, hy, 2.5],
    ],
    body
  );
  // Head plumes swept back
  g.spline(
    [
      [hx - 1, hy - 2, 1.6],
      [hx - 5, hy - 4, 1.4],
      [hx - 8, hy - 3, 0.9],
    ],
    plume
  );
  // Snout
  g.taper(hx, hy, 2.4, hx + 6.5, hy + 0.8, 1.3, body);
  g.rect(hx + 1, hy - 1.5, 2, 1.5, C_GOLD_L); // razor eye
  g.px(hx + 2, hy - 1.5, C_WHITE);

  // TWIN KATANAS (jaw katana + reverse claw blade)
  const jx = hx + 4;
  const jy = hy + 1.5;
  const armX = 26 + lx * 0.9;
  const armY = 26 + by;

  if (m.atkStep === -1) {
    // Sleek curved katana gripped cleanly in jaws, gleaming upward-forward
    g.blade(jx - 2, jy + 1, Math.min(46, jx + 12), Math.max(3, jy - 10 + m.breath), 1.6, 1.1, C_STEEL_D, C_STEEL_L, C_WHITE);
    g.px(jx, jy, C_GOLD_L);
    // Second claw katana swept back-down
    g.blade(armX, armY, armX + 11, armY + 6, 1.5, 1.0, C_STEEL_D, C_CYAN_M, C_CYAN_L);
    g.px(armX, armY, C_SCARF_M);
  } else if (m.atkStep === 0) {
    // Low assassin crouch windup — both katanas drawn back
    g.blade(jx, jy, jx - 12, jy - 8, 1.6, 1.1, C_STEEL_D, C_STEEL_L, C_WHITE);
    g.blade(armX, armY, armX - 10, armY + 4, 1.5, 1.0, C_STEEL_D, C_CYAN_M, C_CYAN_L);
  } else if (m.atkStep === 1 || m.atkStep === 2) {
    // Blazing twin-katana X-slash cyan smear!
    g.smearArc(29, 23, 17, 4.6, -1.7, 0.85, C_CYAN_D, C_CYAN_M, C_WHITE);
    g.smearArc(27, 25, 13, 3.2, -0.7, 1.4, C_CYAN_D, C_CYAN_L, C_WHITE);
    g.blade(jx, jy, Math.min(46, jx + 13), Math.max(4, jy - 6), 1.8, 1.1, C_CYAN_D, C_WHITE, C_WHITE);
    g.blade(armX, armY, Math.min(46, armX + 14), Math.min(43, armY + 5), 1.7, 1.0, C_CYAN_D, C_CYAN_L, C_WHITE);
  } else {
    // Follow-through cool katana flourish
    g.smearArc(30, 24, 15, 2.0, -0.3, 0.9, C_CYAN_D, C_CYAN_M, C_CYAN_L);
    g.blade(jx, jy, Math.min(46, jx + 11), Math.min(42, jy + 8), 1.6, 1.0, C_STEEL_D, C_STEEL_L, C_WHITE);
    g.blade(armX, armY, Math.min(46, armX + 10), armY - 4, 1.5, 1.0, C_STEEL_D, C_CYAN_M, C_WHITE);
  }

  g.outline('#0c171d');
  return g.toCanvas(2);
}

/* ============================================================================
 * 3. TRICERATOPS — ARMORED HERBIVORE TANK (48×48 logical → 96×96 crisp)
 * ========================================================================== */
function drawTriceratopsFrame(pose: AnimPose, frame: number): HTMLCanvasElement {
  const g = new PixelGrid(48, 48);
  const m = getMotion(pose, frame);
  const hide = makeRamp('#14532d', '#15803d', '#22c55e', '#86efac');
  const darkHide = makeRamp('#0b331b', '#14532d', '#166534');
  const armor = makeRamp('#78350f', '#ca8a04', '#facc15', '#fef08a');
  const by = Math.round(m.bob * 0.7);
  const lx = m.leanX;

  // Far-side pillar legs (quadruped diagonal gait)
  g.taper(14 + m.legB * 0.7, 30 + by, 2.6, 13 + m.legB, 42 - m.liftB * 0.7, 2.2, darkHide);
  g.taper(27 + m.legA * 0.7, 30 + by, 2.6, 27 + m.legA, 42 - m.liftA * 0.7, 2.2, darkHide);

  // Heavy tapering tail
  g.spline(
    [
      [3, 29 + by + m.tailWave * 0.4, 1.2],
      [8, 28 + by + m.tailWave * 0.2, 2.4],
      [13, 27 + by, 3.8],
    ],
    hide
  );

  // Massive barreled armored torso
  g.shadedEllipse(20 + lx * 0.5, 25 + by, 9.8, 7.2, hide);
  // Forged bronze/gold tank barding across back
  g.shadedEllipse(20 + lx * 0.5, 21 + by, 7.6, 3.2, armor);
  g.rect(16 + lx * 0.5, 23 + by, 8, 2, C_GOLD_D);

  // Near-side pillar legs with ivory hooves
  const rFootX = 15 + m.legA;
  const rFootY = 43 - m.liftA * 0.7;
  g.taper(15 + lx * 0.4, 30 + by, 3.0, rFootX, rFootY - 1, 2.5, hide);
  g.px(rFootX + 1, rFootY, C_IVORY);
  g.px(rFootX + 2, rFootY, C_IVORY);

  const fFootX = 26 + m.legB;
  const fFootY = 43 - m.liftB * 0.7;
  g.taper(25 + lx * 0.5, 30 + by, 3.0, fFootX, fFootY - 1, 2.5, hide);
  g.px(fFootX + 1, fFootY, C_IVORY);
  g.px(fFootX + 2, fFootY, C_IVORY);

  // Iconic scalloped Triceratops frill + 3 forged-tip horns
  const hx = 30 + lx * 1.1;
  const hy = 21 + by + (m.atkStep === 0 ? -1.5 : m.atkStep === 2 ? 2.0 : 0);
  // Huge royal crest shield-frill
  g.shadedEllipse(hx - 2, hy - 3, 4.6, 7.8, hide);
  g.shadedEllipse(hx - 2.5, hy - 3, 2.8, 5.4, makeRamp('#166534', '#22c55e', '#4ade80'));
  // Ivory frill studs along rim
  for (let i = -3; i <= 2; i++) {
    g.px(hx - 6, hy - 3 + i * 2.2, C_GOLD_L);
  }
  // Head & parrot-like beak
  g.shadedEllipse(hx + 3, hy + 1, 5.4, 4.2, hide);
  g.taper(hx + 5, hy + 2, 2.4, hx + 9, hy + 4, 1.3, makeRamp('#3f6212', '#65a30d', '#a3e635'));
  // Fierce eye
  g.rect(hx + 3, hy - 1, 2, 2, C_GOLD_L);
  g.px(hx + 4, hy - 1, hexToU32('#14532d'));
  // Twin sweeping brow horns (ivory + steel spear tips!)
  g.taper(hx + 1, hy - 4, 1.8, Math.min(46, hx + 12), hy - 9, 0.8, makeRamp('#a8a29e', '#e7e5e4', '#ffffff'));
  g.taper(hx + 2, hy - 2, 1.5, Math.min(45, hx + 11), hy - 5, 0.7, makeRamp('#78716c', '#d6d3d1', '#f5f5f4'));
  // Nose horn
  g.taper(hx + 7, hy, 1.4, Math.min(46, hx + 10), hy - 3, 0.6, C_IVORY);

  // HEAVY IRON-RIMMED TOWER SHIELD & HORN-LANCE
  const thrust = m.atkStep === 1 ? 3.5 : m.atkStep === 2 ? 5.5 : m.atkStep === 3 ? 3.0 : m.atkStep === 0 ? -2.0 : 0;
  const sx = Math.min(39, 28 + lx + thrust * 0.6);
  const sy = 28 + by;
  // Lance shaft & steel spearhead
  if (m.atkStep >= 1 && m.atkStep <= 3) {
    g.smearArc(sx + 2, sy, 13, 3.8, -0.95, 0.75, C_GOLD_D, C_GOLD_M, C_GOLD_L);
    g.blade(sx - 2, sy - 2, Math.min(46, sx + 12), sy - 2, 2.4, 0.9, C_STEEL_D, C_STEEL_L, C_WHITE);
  }
  // Tower shield
  g.rect(sx - 4, sy - 5, 8, 12, C_STEEL_D);
  g.rect(sx - 3, sy - 4, 6, 10, C_STEEL_M);
  g.rect(sx - 2, sy - 3, 4, 8, C_GOLD_M);
  g.rect(sx - 1, sy - 1, 2, 4, C_GOLD_L); // glowing amber emblem
  g.px(sx - 3, sy - 4, C_WHITE);

  g.outline('#0c1710');
  return g.toCanvas(2);
}

/* ============================================================================
 * 4. DODO MAGO — ADORABLE WIZARD DODO WITH POINTY HAT & AMBER STAFF
 *    (48×48 logical → 96×96 crisp, inspired by the reference Dodo spritesheet)
 * ========================================================================== */
function drawDodoWizardFrame(pose: AnimPose, frame: number): HTMLCanvasElement {
  const g = new PixelGrid(48, 48);
  const m = getMotion(pose, frame);
  const feather = makeRamp('#4b5563', '#717882', '#9ca3af', '#d1d5db');
  const belly = makeRamp('#9ca3af', '#d1d5db', '#f3f4f6');
  const beak = makeRamp('#a16207', '#ca8a04', '#eab308', '#fef08a');
  const beakTip = hexToU32('#111827');
  const feet = makeRamp('#b45309', '#eab308', '#fde047');
  const hat = makeRamp('#312e81', '#4f46e5', '#7c3aed', '#a78bfa');

  // Cute chubby waddle bob & slight body tilt
  const by = Math.round(m.bob * 0.9);
  const lx = m.leanX * 0.9;
  const casting = m.atkStep >= 1 && m.atkStep <= 3;

  // Back golden webbed bird foot
  const bFootX = 18 + m.legB * 0.9;
  const bFootY = 42 - m.liftB * 0.9;
  g.line(19 + lx * 0.3, 35 + by, bFootX, bFootY - 1, feet.dark, 1.0);
  g.line(bFootX - 1, bFootY, bFootX + 3, bFootY, feet.mid, 0.9);
  g.px(bFootX + 2, bFootY - 1, feet.light);

  // Fluffy pale-white curly Dodo tail tuft (bobs cutely on the left!)
  const tailY = 27 + by + m.tailWave * 0.45;
  g.shadedEllipse(9 + lx * 0.2, tailY, 3.0, 2.6, belly);
  g.shadedEllipse(7 + lx * 0.2, tailY - 2, 2.0, 2.0, makeRamp('#d1d5db', '#f3f4f6', '#ffffff'));

  // Round pear-shaped chubby Dodo body + pale silver belly
  g.shadedEllipse(18 + lx * 0.4, 30 + by, 8.6, 7.2, feather);
  g.shadedEllipse(21 + lx * 0.5, 32.5 + by, 5.8, 4.6, belly);

  // Front golden webbed bird foot
  const fFootX = 22 + m.legA * 0.9;
  const fFootY = 43 - m.liftA * 0.9;
  g.line(21 + lx * 0.4, 36 + by, fFootX, fFootY - 1, feet.mid, 1.1);
  g.line(fFootX - 2, fFootY, fFootX + 3, fFootY, feet.light, 0.95);
  g.px(fFootX + 3, fFootY, C_GOLD_L);

  // Cute stubby light-grey wing (flaps up excitedly while walking/casting!)
  const wingFlap = casting ? -3.8 : pose === 'walk' ? Math.sin((frame / 6) * Math.PI * 2) * 2.0 : m.breath * 0.5;
  g.shadedEllipse(16 + lx * 0.4, 29.5 + by + wingFlap * 0.5, 4.3, 2.8, belly);
  g.line(13 + lx * 0.4, 30 + by + wingFlap * 0.5, 19 + lx * 0.4, 31 + by + wingFlap * 0.4, feather.dark, 0.6);

  // Upright slender grey Dodo neck & round head
  const hx = 24 + lx * 0.95;
  const hy = 18 + by + (m.atkStep === 0 ? -1.2 : casting ? 0.6 : 0);
  g.spline(
    [
      [21 + lx * 0.5, 25 + by, 3.6],
      [22.5 + lx * 0.7, 21.5 + by, 3.0],
      [hx, hy, 3.8],
    ],
    feather
  );

  // Iconic long golden-ochre Dodo beak with bold hooked black tip!
  const beakLen = 8.5;
  g.taper(hx + 2, hy, 2.4, hx + beakLen, hy + 0.2, 1.9, beak);
  // Lower beak (opens in a cute magical squawk during attack!)
  const squawk = casting ? 1.6 : 0;
  g.taper(hx + 2, hy + 1.6, 1.4, hx + beakLen - 1.2, hy + 1.9 + squawk, 1.0, makeRamp('#854d0e', '#a16207', '#ca8a04'));
  // Bold dark hooked tip (exact signature look from the reference sprite!)
  g.ellipse(hx + beakLen + 1.2, hy + 0.8, 2.0, 2.1, beakTip);
  g.px(hx + beakLen + 2.4, hy + 2.0, beakTip); // tiny hook
  g.px(hx + beakLen + 0.5, hy - 0.5, C_STEEL_M); // subtle sheen on black tip
  // Cute expressive dark-violet eye with bright white twinkle
  g.rect(hx + 1, hy - 1.5, 2, 2, hexToU32('#3b0764'));
  g.px(hx + 1, hy - 1.5, C_WHITE);

  // CLASSIC POINTY WIZARD HAT ("GORRITO DE MAGO") PERCHED ON DODO'S HEAD!
  const hatTilt = m.atkStep === 0 ? -1.8 : casting ? 1.2 : m.tailWave * 0.35;
  const brimY = hy - 3.2;
  // Wide curled wizard brim
  g.shadedEllipse(hx - 0.5, brimY, 6.8, 2.0, hat);
  // Tall tapering pointed cone with whimsical curved bent tip!
  g.spline(
    [
      [hx - 0.5, brimY - 1.0, 4.2],
      [hx - 1.5, brimY - 5.2, 2.8],
      [hx - 3.6 + hatTilt * 0.5, brimY - 9.0, 1.6],
      [hx - 7.0 + hatTilt, brimY - 9.8, 0.8],
    ],
    hat
  );
  // Golden ribbon hatband & buckle
  g.line(hx - 4.2, brimY - 1.4, hx + 3.2, brimY - 1.4, C_GOLD_M, 1.0);
  g.px(hx, brimY - 1.4, C_GOLD_L);
  // Cute glowing yellow wizard star on the hat cone!
  g.px(hx - 1.5, brimY - 5.2, C_GOLD_L);
  g.px(hx - 1.5, brimY - 6.2, C_GOLD_L);
  g.px(hx - 1.5, brimY - 4.2, C_GOLD_L);
  g.px(hx - 2.5, brimY - 5.2, C_GOLD_L);
  g.px(hx - 0.5, brimY - 5.2, C_WHITE);

  // CLASSIC WIZARD STAFF ("BÁCULO DE MAGO") WITH CURVED CROOK, GOLD RINGS & GLOWING CRYSTAL
  const staffShift = m.atkStep === 0 ? -2.2 : casting ? 4.4 : 0;
  const stX = Math.min(40, 35 + lx * 0.55 + staffShift);
  const orbBob = Math.sin((frame / 4) * Math.PI * 2) * 1.3;
  const stTopY = 11 + by + (casting ? -2.2 : 0);

  // Wooden gnarled wizard staff shaft (slightly angled dynamically when casting!)
  const tilt = casting ? 2.8 : m.atkStep === 0 ? -1.5 : 0.4;
  g.spline(
    [
      [stX - 1.5 - tilt * 0.4, 42, 1.35],
      [stX - 0.5, 28, 1.25],
      [stX + 0.5 + tilt * 0.5, stTopY + 4, 1.35],
    ],
    makeRamp('#451a03', '#78350f', '#b45309')
  );
  // Decorative gold bands & metal ferrule along the staff
  g.line(stX - 1.5, 41, stX - 0.5, 41, C_GOLD_M, 1.0);
  g.line(stX - 1.2, 26, stX + 0.8, 26, C_GOLD_L, 0.9);
  g.line(stX - 0.8 + tilt * 0.4, stTopY + 5, stX + 1.8 + tilt * 0.4, stTopY + 5, C_GOLD_L, 1.0);

  // Ornate golden curved wizard crook / crescent cradle at top of staff
  const topX = stX + 0.8 + tilt * 0.6;
  const topY = stTopY + 1;
  g.spline(
    [
      [topX, topY + 3, 1.2],
      [topX - 3.2, topY + 0.5, 1.1],
      [topX - 2.6, topY - 3.2, 1.0],
      [topX + 1.2, topY - 4.5, 1.0],
      [topX + 3.8, topY - 2.2, 0.9],
    ],
    makeRamp('#92400e', '#f59e0b', '#fef08a')
  );

  // Glowing arcane crystal gem floating inside the wizard crook!
  const orbX = topX + 0.4;
  const orbY = topY - 1.2 + orbBob * 0.5;
  g.shadedEllipse(
    orbX,
    orbY,
    casting ? 3.4 : 2.6,
    casting ? 3.8 : 3.0,
    makeRamp('#0284c7', '#38bdf8', '#fef08a', '#ffffff')
  );
  g.px(orbX - 0.5, orbY - 1, C_WHITE);

  // Orbiting twinkling magic stars
  const sparkA = (frame / 5) * Math.PI * 2;
  g.px(orbX + Math.cos(sparkA) * 5.2, orbY + Math.sin(sparkA) * 3.8, C_GOLD_L);
  g.px(orbX - Math.cos(sparkA) * 5.2, orbY - Math.sin(sparkA) * 3.8, C_CYAN_L);

  if (casting) {
    g.smearArc(orbX, orbY + 1, 11.5, 3.4, -1.7, 1.3, C_FIRE_D, C_GOLD_L, C_WHITE);
  }

  g.outline('#14141b');
  return g.toCanvas(2);
}

/* ============================================================================
 * 5. PTERANODON — WINGED BONE-BOW ARCHER (48×48 logical → 96×96 crisp)
 * ========================================================================== */
function drawPteranodonFrame(pose: AnimPose, frame: number): HTMLCanvasElement {
  const g = new PixelGrid(48, 48);
  const m = getMotion(pose, frame);
  const body = makeRamp('#4c1d95', '#7c3aed', '#a78bfa', '#ddd6fe');
  const wing = makeRamp('#312e81', '#5b21b6', '#8b5cf6');
  const bone = makeRamp('#b45309', '#f59e0b', '#fde68a');

  // Smooth continuous hovering & wingbeat!
  const hoverPhase = (frame / (pose === 'walk' ? 6 : 4)) * Math.PI * 2;
  const hoverY = Math.round(Math.sin(hoverPhase) * (pose === 'walk' ? 2.8 : 1.8));
  const flap = Math.sin(hoverPhase) * (pose === 'walk' ? 9.5 : 5.0);
  const cy = 22 + hoverY;
  const lx = m.leanX;

  // Far wing membrane + golden wing bone strut
  g.spline(
    [
      [22 + lx * 0.5, cy, 3.0],
      [30 + lx * 0.5, cy - 5 - flap * 0.7, 3.6],
      [39, cy - 9 - flap, 1.8],
    ],
    makeRamp('#2e1065', '#4c1d95', '#6d28d9')
  );
  g.line(23 + lx * 0.5, cy - 1, 39, cy - 10 - flap, bone.mid, 0.9);

  // Near sweeping wing membrane + fingers
  g.spline(
    [
      [19 + lx * 0.4, cy + 1, 3.4],
      [11, cy - 3 + flap * 0.75, 4.2],
      [3, cy - 7 + flap, 1.9],
    ],
    wing
  );
  g.line(19 + lx * 0.4, cy, 3, cy - 8 + flap, bone.light, 1.1);
  // Wing membrane ribbing
  g.line(13, cy - 2 + flap * 0.65, 12, cy + 4 + flap * 0.4, wing.dark, 0.7);
  g.line(8, cy - 5 + flap * 0.85, 9, cy + 1 + flap * 0.6, wing.dark, 0.7);

  // Quiver of bone arrows on hip
  g.rect(14 + lx * 0.4, cy + 3, 4, 7, C_WOOD_M);
  g.px(15 + lx * 0.4, cy + 2, C_CYAN_L);
  g.px(17 + lx * 0.4, cy + 2, C_CYAN_M);

  // Torso & tucked aerial talons
  g.shadedEllipse(21 + lx * 0.5, cy + 2, 5.2, 6.2, body);
  g.shadedEllipse(22 + lx * 0.6, cy + 3, 3.2, 4.2, makeRamp('#d97706', '#fbbf24', '#fef3c7'));
  // Talons
  g.line(19 + lx * 0.5, cy + 8, 18 + lx * 0.5, cy + 13, bone.mid, 1.0);
  g.line(23 + lx * 0.5, cy + 8, 24 + lx * 0.5, cy + 13, bone.light, 1.0);

  // Aerodynamic swept-back Pteranodon head crest & sharp beak
  const hx = 24 + lx * 0.8;
  const hy = cy - 7;
  g.taper(hx + 1, hy, 2.6, hx - 10, hy - 5, 0.9, body); // long rear crest!
  g.shadedEllipse(hx + 2, hy + 1, 3.6, 3.0, body);
  g.taper(hx + 4, hy + 1, 1.9, hx + 13, hy + 2.5, 0.7, bone); // razor beak
  g.rect(hx + 3, hy, 2, 1.5, C_GOLD_L);
  g.px(hx + 4, hy, C_WHITE);

  // ORNATE RECURVE BONE BOW & GLOWING WIND ARROW
  const bx = Math.min(36, 32 + lx * 0.8);
  const by = cy + 2;
  const drawPull = m.atkStep === 0 ? 3.5 : m.atkStep === 1 ? 5.5 : 0;
  const releasing = m.atkStep === 2 || m.atkStep === 3;

  // Bow limbs
  g.spline(
    [
      [bx - 1, by - 9, 1.1],
      [bx + 3, by - 4, 1.3],
      [bx + 4, by, 1.4],
      [bx + 3, by + 4, 1.3],
      [bx - 1, by + 9, 1.1],
    ],
    makeRamp('#a8a29e', '#e7e5e4', '#ffffff')
  );
  // Taut bowstring pulling back during windup!
  g.line(bx - 1, by - 8, bx - 1 - drawPull, by, C_STEEL_L, 0.5);
  g.line(bx - 1 - drawPull, by, bx - 1, by + 8, C_STEEL_L, 0.5);

  if (releasing) {
    // Wind burst & arrow release flash!
    g.smearArc(bx + 2, by, 9, 2.8, -1.0, 1.0, C_CYAN_D, C_CYAN_M, C_WHITE);
    g.line(bx + 2, by, Math.min(46, bx + 13), by, C_WHITE, 1.1);
    g.line(bx + 4, by - 1, Math.min(45, bx + 11), by - 1, C_CYAN_M, 0.7);
  } else {
    // Nocked glowing cyan arrow
    g.line(bx - 1 - drawPull, by, Math.min(45, bx + 9 - drawPull * 0.4), by, C_CYAN_M, 0.9);
    g.px(Math.min(45, bx + 9 - drawPull * 0.4), by - 1, C_WHITE);
    g.px(Math.min(45, bx + 9 - drawPull * 0.4), by + 1, C_WHITE);
    g.px(Math.min(46, bx + 10 - drawPull * 0.4), by, C_WHITE);
  }

  g.outline('#140d21');
  return g.toCanvas(2);
}

/* ============================================================================
 * 6. BOSS: SPINOSAURUS HOJA-ABISAL (64×64 logical → 128×128 crisp!)
 *    Directly honoring the DinoBlade screenshot duel!
 * ========================================================================== */
function drawSpinosaurusBossFrame(pose: AnimPose, frame: number): HTMLCanvasElement {
  const g = new PixelGrid(64, 64);
  const m = getMotion(pose, frame);
  const hide = makeRamp('#450a0a', '#881337', '#be123c', '#fb7185');
  const sail = makeRamp('#7f1d1d', '#dc2626', '#f97316', '#fde047');
  const belly = makeRamp('#7c2d12', '#c2410c', '#fdba74');
  const by = Math.round(m.bob * 1.15);
  const lx = m.leanX * 1.4;

  // Back predator leg
  const bX = 24 + m.legB * 1.25;
  const bY = 57 - m.liftB * 1.2;
  g.spline(
    [
      [25 + lx * 0.4, 39 + by, 4.4],
      [22 + m.legB * 0.5, 48, 3.0],
      [bX, bY - 2, 2.3],
    ],
    makeRamp('#2d0606', '#580d1e', '#881337')
  );
  g.px(bX + 3, bY, C_IVORY);

  // SPECTACULAR ARCHED DORSAL SAIL WITH GOLDEN SPINES & ABYSSAL GLOW!
  g.shadedEllipse(27 + lx * 0.5, 22 + by, 13.0, 12.2, sail);
  // Glowing golden sail ribs
  for (let i = -2; i <= 2; i++) {
    const rx = 27 + lx * 0.5 + i * 4.4;
    const topY = 11 + Math.abs(i) * 2.5 + by;
    g.line(rx, topY, rx - i * 0.8, 29 + by, C_GOLD_L, 0.8);
    g.px(rx, topY - 1, C_CYAN_L); // glowing spine tips
  }

  // Long sinuous crocodile tail with dorsal ridge
  g.spline(
    [
      [3, 39 + by + m.tailWave * 1.3, 1.5],
      [10, 39 + by + m.tailWave * 0.7, 3.0],
      [18, 36 + by + m.tailWave * 0.3, 4.8],
      [26 + lx * 0.4, 34 + by, 6.4],
    ],
    hide
  );

  // Massive crimson body & plated belly
  g.shadedEllipse(29 + lx * 0.6, 33 + by, 10.5, 8.2, hide);
  g.shadedEllipse(32 + lx * 0.7, 37 + by, 6.8, 4.0, belly);

  // Near muscular leg with ivory claws
  const fX = 30 + m.legA * 1.25;
  const fY = 58 - m.liftA * 1.2;
  g.spline(
    [
      [29 + lx * 0.5, 39 + by, 5.0],
      [26 + m.legA * 0.6, 49, 3.3],
      [fX, fY - 2, 2.6],
    ],
    hide
  );
  g.rect(fX - 1, fY - 2, 7, 3, hide.mid);
  g.px(fX + 4, fY, C_WHITE);
  g.px(fX + 6, fY, C_WHITE);

  // Clawed predator forearm
  g.line(37 + lx * 0.8, 35 + by, 42 + lx * 0.9, 38 + by, hide.light, 1.6);
  g.px(44 + lx * 0.9, 39 + by, C_WHITE);

  // Curved neck & elongated Spinosaurus crocodilian jaws
  const hx = 41 + lx * 1.2;
  const hy = 22 + by + (m.atkStep === 0 ? -3.0 : m.atkStep === 2 ? 3.5 : 0);
  g.taper(34 + lx * 0.7, 29 + by, 4.8, hx - 2, hy + 2, 4.0, hide);
  g.shadedEllipse(hx + 2, hy, 7.0, 4.0, hide);
  g.taper(hx + 5, hy + 0.5, 3.0, Math.min(60, hx + 14), hy + 2.2, 1.8, hide);
  // Lower jaw & fangs
  g.taper(hx + 1, hy + 3.6, 2.2, Math.min(59, hx + 13), hy + 4.4, 1.3, makeRamp('#3b0712', '#6b1024', '#9f1239'));
  for (let t = 4; t <= 11; t += 2.3) {
    g.px(Math.min(60, hx + t), hy + 3.2, C_WHITE);
  }
  // Glowing Abyssal Cyan eye
  g.rect(hx + 2, hy - 2, 3, 2, C_CYAN_M);
  g.px(hx + 3, hy - 2, C_WHITE);

  // GIANT CURSED ABYSSAL ODACHI GRIPPED ACROSS JAWS!
  const gx = hx + 6;
  const gy = hy + 3;

  if (m.atkStep === -1) {
    // Sweeping long horizontal-angled odachi right across jaws (just like the DinoBlade screenshot!)
    g.line(gx - 12, gy + 1, gx - 2, gy + 1, C_WOOD_M, 1.5); // long hilt
    g.line(gx - 2, gy - 3, gx - 2, gy + 5, C_GOLD_L, 1.5); // ornate tsuba guard
    g.blade(gx - 1, gy + 1, Math.min(62, gx + 17), gy - 2 + m.breath, 3.4, 2.0, C_CYAN_D, C_STEEL_L, C_WHITE);
    g.line(gx + 3, gy, Math.min(61, gx + 16), gy - 2 + m.breath, C_CYAN_M, 0.7);
  } else if (m.atkStep === 0) {
    // Raises colossal odachi high behind head
    g.blade(gx, gy, gx - 18, 4, 3.6, 2.2, C_CYAN_D, C_STEEL_L, C_WHITE);
    g.line(gx - 2, gy - 2, gx + 2, gy + 2, C_GOLD_L, 1.5);
  } else if (m.atkStep === 1 || m.atkStep === 2) {
    // Massive hydro-abyssal crescent cleave!
    g.smearArc(gx - 6, gy + 6, 24, 7.2, -1.9, 0.85, C_CYAN_D, C_CYAN_M, C_WHITE);
    g.blade(gx, gy, Math.min(62, gx + 16), Math.min(60, gy + 16), 3.8, 2.2, C_CYAN_D, C_CYAN_L, C_WHITE);
    g.line(gx - 2, gy + 2, gx + 2, gy - 2, C_GOLD_L, 1.5);
  } else {
    g.smearArc(gx - 6, gy + 6, 20, 3.0, -0.5, 0.95, C_CYAN_D, C_CYAN_M, C_CYAN_L);
    g.blade(gx, gy, Math.min(62, gx + 14), Math.min(58, gy + 10), 3.4, 2.0, C_STEEL_D, C_STEEL_L, C_WHITE);
  }

  g.outline('#0c060a');
  return g.toCanvas(2);
}

/* ============================================================================
 * 7. ENEMY DINOSAURS (40×40 logical → 80×80 crisp) × 15 smooth frames each!
 * ========================================================================== */
function drawEnemyFrame(
  kind: 'compy' | 'raptor' | 'pachy' | 'spitter' | 'ankylo' | 'carno',
  pose: AnimPose,
  frame: number
): HTMLCanvasElement {
  const g = new PixelGrid(40, 40);
  const m = getMotion(pose, frame);
  const by = Math.round(m.bob * 0.85);
  const lx = m.leanX;

  if (kind === 'compy') {
    const skin = makeRamp('#365314', '#65a30d', '#a3e635', '#ecfccb');
    g.taper(16 + m.legB * 0.8, 26 + by, 1.5, 16 + m.legB, 34 - m.liftB, 1.0, skin.dark);
    g.spline([[4, 24 + by + m.tailWave, 0.7], [11, 25 + by, 1.4], [17, 24 + by, 2.0]], skin);
    g.shadedEllipse(19 + lx * 0.5, 24 + by, 4.5, 3.2, skin);
    g.taper(19 + m.legA * 0.8, 26 + by, 1.7, 20 + m.legA, 35 - m.liftA, 1.1, skin);
    const hx = 25 + lx * 1.1;
    const hy = 18 + by;
    g.taper(22 + lx * 0.6, 22 + by, 1.8, hx, hy, 1.6, skin);
    g.taper(hx, hy, 2.0, hx + 5, hy + 0.5, 1.0, skin);
    g.px(hx + 2, hy - 1, C_FIRE_D);
    if (m.atkStep === 1 || m.atkStep === 2) {
      g.smearArc(hx + 2, hy + 1, 7, 2.2, -1.0, 1.0, C_FIRE_D, C_GOLD_L, C_WHITE);
    }
  } else if (kind === 'raptor') {
    const skin = makeRamp('#7f1d1d', '#dc2626', '#f87171', '#fecaca');
    g.taper(15 + m.legB, 25 + by, 2.0, 15 + m.legB, 35 - m.liftB, 1.2, skin.dark);
    g.spline([[3, 21 + by + m.tailWave, 0.8], [10, 23 + by, 1.8], [17, 23 + by, 2.8]], skin);
    g.shadedEllipse(19 + lx * 0.6, 22 + by, 5.5, 3.8, skin);
    g.taper(19 + m.legA, 25 + by, 2.2, 20 + m.legA, 36 - m.liftA, 1.3, skin);
    const hx = 26 + lx * 1.1;
    const hy = 15 + by;
    g.taper(22 + lx * 0.6, 20 + by, 2.3, hx, hy, 2.0, skin);
    g.taper(hx, hy, 2.3, hx + 6, hy + 0.8, 1.2, skin);
    g.px(hx + 2, hy - 1, C_GOLD_L);
    if (m.atkStep === 1 || m.atkStep === 2) {
      g.smearArc(hx + 2, hy + 3, 10, 3.0, -1.2, 1.0, C_FIRE_D, C_FIRE_M, C_WHITE);
    }
  } else if (kind === 'pachy') {
    const skin = makeRamp('#78350f', '#b45309', '#f59e0b', '#fde68a');
    const dome = makeRamp('#a8a29e', '#e7e5e4', '#ffffff');
    g.taper(15 + m.legB, 26 + by, 2.4, 15 + m.legB, 35 - m.liftB, 1.6, skin.dark);
    g.spline([[4, 24 + by + m.tailWave * 0.6, 1.0], [11, 24 + by, 2.2], [17, 24 + by, 3.2]], skin);
    g.shadedEllipse(19 + lx * 0.6, 23 + by, 6.2, 4.8, skin);
    g.taper(20 + m.legA, 26 + by, 2.5, 21 + m.legA, 36 - m.liftA, 1.7, skin);
    const hx = 26 + lx * 1.3;
    const hy = 16 + by + (m.atkStep >= 1 && m.atkStep <= 2 ? 3 : 0);
    g.shadedEllipse(hx + 1, hy + 1, 4.2, 3.6, skin);
    // Thick ivory skull dome
    g.shadedEllipse(hx + 2, hy - 2, 4.4, 2.8, dome);
    g.px(hx + 3, hy + 1, hexToU32('#111827'));
    if (m.atkStep === 1 || m.atkStep === 2) {
      g.smearArc(hx + 4, hy, 8, 2.8, -1.1, 1.1, C_GOLD_D, C_GOLD_L, C_WHITE);
    }
  } else if (kind === 'spitter') {
    const skin = makeRamp('#115e59', '#0d9488', '#2dd4bf', '#ccfbf1');
    const venom = makeRamp('#3f6212', '#84cc16', '#d9f99d');
    g.taper(15 + m.legB, 26 + by, 2.0, 15 + m.legB, 35 - m.liftB, 1.2, skin.dark);
    g.spline([[4, 25 + by + m.tailWave * 0.8, 0.8], [11, 25 + by, 1.8], [17, 24 + by, 2.5]], skin);
    g.shadedEllipse(19 + lx * 0.5, 23 + by, 5.2, 4.5, skin);
    g.taper(19 + m.legA, 26 + by, 2.2, 20 + m.legA, 36 - m.liftA, 1.3, skin);
    const hx = 25 + lx;
    const hy = 15 + by;
    const flare = m.atkStep >= 1 && m.atkStep <= 3 ? 5.2 : 3.2;
    g.shadedEllipse(hx - 2, hy, flare, flare + 1.5, venom);
    g.shadedEllipse(hx + 2, hy, 4.0, 2.8, skin);
    g.px(hx + 3, hy - 1, C_GOLD_L);
    if (m.atkStep === 1 || m.atkStep === 2) {
      g.shadedEllipse(hx + 8, hy + 1, 2.5, 2.0, venom);
    }
  } else if (kind === 'ankylo') {
    const rock = makeRamp('#1c1917', '#44403c', '#78716c', '#a8a29e');
    const lava = makeRamp('#9a3412', '#ea580c', '#fde047');
    g.taper(12 + m.legB * 0.6, 28 + by, 2.2, 12 + m.legB * 0.6, 35, 1.8, rock.dark);
    g.taper(24 + m.legA * 0.6, 28 + by, 2.2, 24 + m.legA * 0.6, 35, 1.8, rock.dark);
    // Tail club swings during attack!
    const clubY = m.atkStep === 1 || m.atkStep === 2 ? 18 : 26 + by + m.tailWave * 0.5;
    g.taper(12, 25 + by, 2.5, 5, clubY, 1.5, rock);
    g.shadedEllipse(4, clubY, 3.2, 3.0, lava);
    // Heavy spiked obsidian shell
    g.shadedEllipse(20 + lx * 0.4, 22 + by, 9.2, 6.2, rock);
    for (let s = -2; s <= 2; s++) {
      g.shadedEllipse(20 + lx * 0.4 + s * 3.4, 16 + Math.abs(s) * 1.1 + by, 1.5, 2.2, lava);
    }
    g.taper(15 + m.legA * 0.6, 28 + by, 2.4, 15 + m.legA * 0.6, 36, 2.0, rock);
    g.taper(26 + m.legB * 0.6, 28 + by, 2.4, 26 + m.legB * 0.6, 36, 2.0, rock);
    g.shadedEllipse(30 + lx * 0.6, 25 + by, 4.2, 3.2, rock);
    g.px(32 + lx * 0.6, 24 + by, C_FIRE_L);
  } else {
    // Ash Carnotaurus (horned predator)
    const hide = makeRamp('#450a0a', '#991b1b', '#dc2626', '#f97316');
    g.taper(15 + m.legB, 25 + by, 2.4, 15 + m.legB, 35 - m.liftB, 1.6, hide.dark);
    g.spline([[3, 23 + by + m.tailWave * 0.8, 1.0], [10, 24 + by, 2.2], [17, 23 + by, 3.4]], hide);
    g.shadedEllipse(19 + lx * 0.6, 22 + by, 6.5, 5.2, hide);
    g.taper(20 + m.legA, 25 + by, 2.8, 21 + m.legA, 36 - m.liftA, 1.8, hide);
    const hx = 27 + lx * 1.2;
    const hy = 13 + by;
    g.taper(22 + lx * 0.6, 19 + by, 3.0, hx, hy + 1, 2.6, hide);
    g.shadedEllipse(hx + 2, hy, 5.0, 3.6, hide);
    // Bull horns!
    g.taper(hx + 1, hy - 3, 1.4, hx + 3, hy - 7, 0.7, C_IVORY);
    g.taper(hx + 4, hy - 3, 1.3, hx + 7, hy - 6, 0.6, C_IVORY);
    g.px(hx + 4, hy - 1, C_GOLD_L);
    if (m.atkStep === 1 || m.atkStep === 2) {
      g.smearArc(hx + 4, hy + 3, 10, 3.4, -1.3, 1.1, C_FIRE_D, C_FIRE_M, C_FIRE_L);
    }
  }

  g.outline('#110d14');
  return g.toCanvas(2);
}

/* ============================================================================
 * 7B. FLOATING CODEX PET — PIXEL-ART CLOUD + BLINKING ">_" TERMINAL PROMPT
 *     (28×28 logical → 56×56 crisp; 4 idle + 4 cast frames)
 * ========================================================================== */
function drawCodexPetFrame(casting: boolean, frame: number): HTMLCanvasElement {
  const g = new PixelGrid(28, 28);
  const bob = Math.round(Math.sin((frame / 4) * Math.PI * 2) * 1.1);
  const cloud = casting
    ? makeRamp('#0b1120', '#172554', '#1e3a8a', '#38bdf8')
    : makeRamp('#090b10', '#12161f', '#222938', '#475569');

  // Iconic 7-lobe Codex cloud silhouette matching the reference logo!
  const cy = 14 + bob;
  const lobes: readonly [number, number, number][] = [
    [13.5, cy - 5.2, 5.2], // top-center puff
    [19.2, cy - 3.0, 4.9], // top-right puff
    [20.6, cy + 2.2, 4.6], // right puff
    [15.4, cy + 5.8, 5.1], // bottom-right puff
    [9.4, cy + 4.8, 5.0],  // bottom-left puff
    [6.6, cy - 0.4, 4.8],  // left puff
    [9.0, cy - 4.2, 4.2],  // upper-left puff
    [14.0, cy + 0.5, 6.2], // solid center core
  ];

  // Fill dark core + soft top-left rim sheen
  for (const [lx, ly, r] of lobes) {
    g.shadedEllipse(lx, ly, r, r, cloud);
  }
  // Smooth interior darkness so the white ">_" terminal icon pops with crisp contrast!
  g.ellipse(14, cy + 0.5, 7.6, 6.4, casting ? hexToU32('#0f172a') : hexToU32('#0b0d12'));

  // Crisp white pixel-art ">" chevron on left
  const promptCol = casting ? (frame % 2 === 0 ? C_CYAN_L : C_GOLD_L) : C_WHITE;
  g.line(9, cy - 3, 12.2, cy + 0.2, promptCol, 1.05);
  g.line(12.2, cy + 0.2, 9, cy + 3.4, promptCol, 1.05);

  // Crisp pixel-art "_" cursor on right (blinks subtly on frame 3 during idle, pulses on cast!)
  const showCursor = casting || frame !== 3;
  if (showCursor) {
    g.line(14.5, cy + 3.2, 19.5, cy + 3.2, promptCol, 1.05);
  } else {
    g.line(14.5, cy + 3.2, 19.5, cy + 3.2, C_STEEL_D, 0.85);
  }

  // Orbiting pixel magic sparkles while hovering / casting
  if (casting) {
    const a = (frame / 4) * Math.PI * 2;
    g.px(14 + Math.cos(a) * 11, cy + Math.sin(a) * 9, C_CYAN_M);
    g.px(14 - Math.cos(a) * 11, cy - Math.sin(a) * 9, C_GOLD_L);
    g.px(14 + Math.sin(a) * 10, cy - Math.cos(a) * 9, C_WHITE);
  } else {
    const sp = frame % 2 === 0 ? 1 : -1;
    g.px(5, cy + 6 + sp, C_CYAN_M);
    g.px(23, cy - 5 - sp, C_STEEL_L);
  }

  g.outline(casting ? '#38bdf8' : '#050608');
  return g.toCanvas(2);
}

/* ============================================================================
 * 8. ISOMETRIC PIXEL-ART TILES, PROPS & VFX
 * ========================================================================== */
function drawIsoDiamondTile(
  base: string,
  shadeA: string,
  shadeB: string,
  border: string,
  variant: number,
  extraWallHeight = 0
): HTMLCanvasElement {
  const g = new PixelGrid(32, 16 + extraWallHeight);
  const cBase = hexToU32(base);
  const cA = hexToU32(shadeA);
  const cB = hexToU32(shadeB);
  const cBord = hexToU32(border);
  const cDeep = hexToU32('#111014');

  for (let y = 0; y < 16; y++) {
    const span = y < 8 ? (y + 1) * 2 : (16 - y) * 2;
    const x0 = 16 - span;
    const x1 = 16 + span - 1;
    for (let x = x0; x <= x1; x++) {
      const hash = (x * 73 + y * 151 + variant * 37) & 15;
      let col = cBase;
      if (x === x0 || x === x1) col = cBord;
      else if (hash < 3) col = cA;
      else if (hash > 12) col = cB;
      g.px(x, y, col);
    }
  }

  if (extraWallHeight > 0) {
    for (let dy = 0; dy < extraWallHeight; dy++) {
      for (let i = 0; i < 16; i++) {
        g.px(i, 8 + Math.floor(i * 0.5) + dy, dy % 3 === 0 ? cBord : cA);
        g.px(31 - i, 8 + Math.floor(i * 0.5) + dy, dy % 3 === 0 ? cA : cDeep);
      }
    }
  }

  return g.toCanvas(2);
}

function drawPropSprite(kind: string): HTMLCanvasElement {
  const g = new PixelGrid(28, 32);
  if (kind === 'fern') {
    const f = makeRamp('#14532d', '#16a34a', '#4ade80');
    g.taper(14, 28, 1.5, 5, 16, 0.9, f);
    g.taper(14, 28, 1.5, 23, 16, 0.9, f);
    g.taper(14, 28, 1.5, 9, 11, 0.9, f);
    g.taper(14, 28, 1.5, 19, 11, 0.9, f);
    g.taper(14, 28, 1.6, 14, 9, 0.9, f);
  } else if (kind === 'palm') {
    g.taper(14, 29, 2.0, 13, 12, 1.4, makeRamp('#451a03', '#78350f', '#b45309'));
    const leaf = makeRamp('#14532d', '#15803d', '#4ade80');
    g.taper(13, 12, 1.8, 3, 15, 0.9, leaf);
    g.taper(13, 12, 1.8, 24, 14, 0.9, leaf);
    g.taper(13, 12, 1.8, 6, 6, 0.9, leaf);
    g.taper(13, 12, 1.8, 21, 7, 0.9, leaf);
    g.taper(13, 11, 1.5, 14, 4, 0.8, leaf);
  } else if (kind === 'ribcage') {
    const bone = makeRamp('#a8a29e', '#e7e5e4', '#ffffff');
    g.taper(5, 25, 1.2, 23, 22, 1.1, bone);
    g.spline([[8, 24, 1.1], [7, 17, 1.0], [10, 13, 0.8]], bone);
    g.spline([[13, 23, 1.2], [12, 15, 1.0], [15, 11, 0.8]], bone);
    g.spline([[18, 22, 1.1], [18, 16, 0.9], [20, 13, 0.7]], bone);
  } else if (kind === 'amber_crystal') {
    const amb = makeRamp('#b45309', '#f59e0b', '#fef08a', '#ffffff');
    g.taper(14, 28, 2.4, 9, 12, 1.1, amb);
    g.taper(14, 28, 2.4, 19, 14, 1.1, amb);
    g.taper(14, 28, 2.8, 14, 6, 1.0, amb);
  } else if (kind === 'lava_vent') {
    g.shadedEllipse(14, 24, 7, 4, makeRamp('#1c1917', '#44403c', '#78716c'));
    g.shadedEllipse(14, 20, 5, 3, makeRamp('#292524', '#57534e', '#78716c'));
    g.shadedEllipse(14, 18, 3.2, 1.8, makeRamp('#dc2626', '#f97316', '#fef08a'));
  } else if (kind === 'giant_sword') {
    g.shadedEllipse(14, 25, 6.5, 3.2, makeRamp('#292524', '#57534e', '#78716c'));
    g.blade(14, 25, 18, 6, 3.6, 3.8, C_STEEL_D, C_STEEL_M, C_STEEL_L);
    g.line(12, 9, 22, 8, C_GOLD_M, 1.2);
    g.line(17, 7, 18, 3, C_WOOD_M, 1.1);
  } else {
    g.shadedEllipse(14, 23, 7.2, 4.5, makeRamp('#292524', '#57534e', '#a8a29e'));
    g.shadedEllipse(12, 20, 4.5, 3.2, makeRamp('#44403c', '#78716c', '#d6d3d1'));
  }
  g.outline('#111116');
  return g.toCanvas(2);
}

function drawSmallIcon(
  kind: 'potion' | 'amber' | 'chest' | 'portal' | 'arrow' | 'fire' | 'wind' | 'venom' | 'water' | 'particle' | 'slash' | 'ring'
): HTMLCanvasElement {
  if (kind === 'portal') {
    const g = new PixelGrid(32, 16);
    for (let y = 1; y < 15; y++) {
      for (let x = 2; x < 30; x++) {
        const r = Math.hypot((x - 16) / 13, (y - 8) / 6.5);
        if (r <= 1.0 && r >= 0.72) g.px(x, y, C_CYAN_M);
        else if (r < 0.72 && r >= 0.38) g.px(x, y, C_CYAN_D);
        else if (r < 0.38) g.px(x, y, C_CYAN_L);
      }
    }
    return g.toCanvas(2);
  }
  if (kind === 'slash') {
    const g = new PixelGrid(32, 32);
    g.smearArc(14, 16, 12, 4.0, -1.25, 1.25, C_GOLD_M, C_GOLD_L, C_WHITE);
    return g.toCanvas(2);
  }
  if (kind === 'ring') {
    const g = new PixelGrid(32, 32);
    for (let a = 0; a < Math.PI * 2; a += 0.05) {
      g.px(16 + Math.cos(a) * 14, 16 + Math.sin(a) * 14, C_WHITE);
    }
    return g.toCanvas(2);
  }

  const g = new PixelGrid(16, 16);
  if (kind === 'potion') {
    g.rect(6, 3, 4, 2, C_BONE_D);
    g.shadedEllipse(8, 10, 4.2, 4.2, makeRamp('#b45309', '#f59e0b', '#fef08a', '#ffffff'));
    g.outline('#111116');
  } else if (kind === 'amber') {
    g.shadedEllipse(8, 8, 3.5, 4.8, makeRamp('#b45309', '#f59e0b', '#fef08a', '#ffffff'));
    g.outline('#111116');
  } else if (kind === 'chest') {
    g.rect(3, 5, 10, 8, C_GOLD_D);
    g.rect(4, 6, 8, 6, C_GOLD_M);
    g.rect(3, 8, 10, 2, C_GOLD_L);
    g.rect(7, 7, 2, 3, C_WHITE);
    g.outline('#111116');
  } else if (kind === 'arrow') {
    g.line(2, 8, 13, 8, C_STEEL_L, 0.9);
    g.rect(11, 6, 3, 5, C_CYAN_M);
    g.px(14, 8, C_WHITE);
    g.rect(2, 6, 2, 5, C_GOLD_M);
  } else if (kind === 'fire') {
    g.shadedEllipse(8, 8, 4.0, 4.0, makeRamp('#dc2626', '#f97316', '#fef08a', '#ffffff'));
  } else if (kind === 'wind') {
    g.shadedEllipse(8, 8, 4.5, 2.4, makeRamp('#0284c7', '#38bdf8', '#e0f2fe', '#ffffff'));
  } else if (kind === 'venom') {
    g.shadedEllipse(8, 8, 3.8, 3.8, makeRamp('#3f6212', '#84cc16', '#d9f99d'));
  } else if (kind === 'water') {
    g.shadedEllipse(8, 8, 4.4, 3.0, makeRamp('#0369a1', '#0ea5e9', '#bae6fd', '#ffffff'));
  } else {
    g.rect(6, 6, 4, 4, C_WHITE);
  }
  return g.toCanvas(2);
}

const previewFramesCache = new Map<string, string[]>();

/** Returns all 4 crisp animated idle data-URLs for Title Screen / HUD previews */
export function getDinoPreviewFrames(spriteId: string): string[] {
  const cached = previewFramesCache.get(spriteId);
  if (cached) return cached;
  const urls: string[] = [];
  for (let f = 0; f < ANIM_COUNTS.idle; f++) {
    let canvas: HTMLCanvasElement;
    switch (spriteId) {
      case 'dino_trex':
        canvas = drawTRexFrame('idle', f);
        break;
      case 'dino_raptor':
        canvas = drawRaptorFrame('idle', f);
        break;
      case 'dino_triceratops':
        canvas = drawTriceratopsFrame('idle', f);
        break;
      case 'dino_dodo':
        canvas = drawDodoWizardFrame('idle', f);
        break;
      case 'dino_pteranodon':
        canvas = drawPteranodonFrame('idle', f);
        break;
      case 'pet_codex':
        canvas = drawCodexPetFrame(false, f);
        break;
      default:
        canvas = drawSpinosaurusBossFrame('idle', f);
        break;
    }
    urls.push(canvas.toDataURL());
  }
  previewFramesCache.set(spriteId, urls);
  return urls;
}

export function getDinoPreviewDataUrl(spriteId: string): string {
  return getDinoPreviewFrames(spriteId)[0]!;
}

export function buildPixelAtlas(scene: Phaser.Scene): void {
  if (scene.textures.exists(ATLAS_KEY)) return;

  const entries: [string, HTMLCanvasElement][] = [];
  const poses: AnimPose[] = ['idle', 'walk', 'atk'];

  const addDinoAnim = (prefix: string, drawer: (pose: AnimPose, f: number) => HTMLCanvasElement): void => {
    for (const pose of poses) {
      const count = ANIM_COUNTS[pose];
      for (let f = 0; f < count; f++) {
        entries.push([`${prefix}_${pose}_${f}`, drawer(pose, f)]);
      }
    }
  };

  addDinoAnim('dino_trex', drawTRexFrame);
  addDinoAnim('dino_raptor', drawRaptorFrame);
  addDinoAnim('dino_triceratops', drawTriceratopsFrame);
  addDinoAnim('dino_dodo', drawDodoWizardFrame);
  addDinoAnim('dino_pteranodon', drawPteranodonFrame);
  addDinoAnim('boss_spinosaurus', drawSpinosaurusBossFrame);

  for (const kind of ['compy', 'raptor', 'pachy', 'spitter', 'ankylo', 'carno'] as const) {
    addDinoAnim(`mob_${kind}`, (pose, f) => drawEnemyFrame(kind, pose, f));
  }

  for (let f = 0; f < 4; f++) {
    entries.push([`pet_codex_idle_${f}`, drawCodexPetFrame(false, f)]);
    entries.push([`pet_codex_cast_${f}`, drawCodexPetFrame(true, f)]);
  }

  // Isometric pixel tiles per biome
  const palettes: Record<
    BiomeId,
    {
      ground: [string, string, string, string];
      path: [string, string, string, string];
      wall: [string, string, string, string];
    }
  > = {
    jungle: {
      ground: ['#2d5a34', '#244a2a', '#3a7040', '#1d3c22'],
      path: ['#7c5c3b', '#6b4d31', '#8f6b47', '#583f27'],
      wall: ['#3f473e', '#2d332d', '#545e53', '#1c201c'],
    },
    volcano: {
      ground: ['#3a3335', '#2c2628', '#4a4144', '#221c1e'],
      path: ['#574139', '#47332c', '#6b4f44', '#33231e'],
      wall: ['#261f22', '#1a1417', '#7c2d12', '#0f0c0e'],
    },
    canyon: {
      ground: ['#6e5c4b', '#5c4b3c', '#826e5a', '#4a3c30'],
      path: ['#87735d', '#756350', '#99836b', '#5e4f3f'],
      wall: ['#4a423d', '#36302c', '#5e544d', '#24201e'],
    },
  };

  for (const biome of ['jungle', 'volcano', 'canyon'] as BiomeId[]) {
    const pal = palettes[biome];
    for (let v = 0; v < 4; v++) {
      entries.push([`tile_${biome}_ground_${v}`, drawIsoDiamondTile(...pal.ground, v)]);
      entries.push([`tile_${biome}_path_${v}`, drawIsoDiamondTile(...pal.path, v)]);
    }
    entries.push([`tile_${biome}_wall`, drawIsoDiamondTile(...pal.wall, 0, 8)]);
  }

  for (const prop of ['fern', 'palm', 'ribcage', 'rock', 'amber_crystal', 'lava_vent', 'giant_sword']) {
    entries.push([`prop_${prop}`, drawPropSprite(prop)]);
  }

  for (const icon of [
    'potion',
    'amber',
    'chest',
    'portal',
    'arrow',
    'fire',
    'wind',
    'venom',
    'water',
    'particle',
    'slash',
    'ring',
  ] as const) {
    entries.push([`fx_${icon}`, drawSmallIcon(icon)]);
  }

  // Pack cleanly into a 2048-wide single WebGL texture atlas
  const sheetW = 2048;
  const pad = 2;
  let curX = pad;
  let curY = pad;
  let rowH = 0;
  const rects = new Map<string, FrameRect>();

  for (const [name, c] of entries) {
    if (curX + c.width + pad > sheetW) {
      curX = pad;
      curY += rowH + pad;
      rowH = 0;
    }
    rects.set(name, { x: curX, y: curY, w: c.width, h: c.height });
    curX += c.width + pad;
    rowH = Math.max(rowH, c.height);
  }

  const sheetH = Math.max(1024, Math.ceil((curY + rowH + pad) / 64) * 64);
  const sheet = document.createElement('canvas');
  sheet.width = sheetW;
  sheet.height = sheetH;
  const sctx = sheet.getContext('2d')!;
  sctx.imageSmoothingEnabled = false;

  for (const [name, c] of entries) {
    const r = rects.get(name)!;
    sctx.drawImage(c, r.x, r.y);
  }

  const tex = scene.textures.addCanvas(ATLAS_KEY, sheet);
  if (!tex) throw new Error('Failed to create dino_atlas texture');
  for (const [name, r] of rects.entries()) {
    tex.add(name, 0, r.x, r.y, r.w, r.h);
  }
}
