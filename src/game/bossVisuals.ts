import type Phaser from 'phaser';

/**
 * Visual-only grammar for Bodoque Hoja-Abisal.  The values here deliberately
 * move the whole Spinosaurus silhouette (sail, snout and tail together), so
 * it never reads as a small mascot pasted onto a generic boss body.
 */
export type BossAttackId =
  | 'boss_odachi_cleave'
  | 'boss_hydro_wave'
  | 'boss_abyssal_leap'
  | 'boss_cross_rend'
  | 'boss_tidal_barrage'
  | 'boss_maelstrom'
  | 'boss_riptide_chain'
  | 'boss_ember_surge';

export type BossAttackFamily = 'cleave' | 'volley' | 'leap' | 'ritual';

export interface BossAttackCue {
  family: BossAttackFamily;
  /** Frame order is authored for anticipation -> contact -> recovery. */
  frames: readonly number[];
  impactAt: number;
}

export interface BossMotionInput {
  attackSkillId?: string;
  attackProgress?: number;
  moving: boolean;
  walkPhase: number;
  phase: 1 | 2;
  hitFlashMs: number;
}

export interface BossMotion {
  frame: number;
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
  shadowScale: number;
  shadowAlpha: number;
}

const DEFAULT_CUE: BossAttackCue = {
  family: 'cleave',
  frames: [0, 0, 1, 2, 4],
  impactAt: 0.54,
};

const ATTACK_CUES: Readonly<Record<BossAttackId, BossAttackCue>> = {
  boss_odachi_cleave: { family: 'cleave', frames: [0, 0, 1, 3, 4], impactAt: 0.56 },
  boss_hydro_wave: { family: 'volley', frames: [0, 0, 1, 3, 4], impactAt: 0.62 },
  boss_abyssal_leap: { family: 'leap', frames: [0, 0, 0, 2, 4], impactAt: 0.72 },
  boss_cross_rend: { family: 'ritual', frames: [0, 0, 1, 2, 4], impactAt: 0.68 },
  boss_tidal_barrage: { family: 'volley', frames: [0, 0, 1, 3, 4], impactAt: 0.64 },
  boss_maelstrom: { family: 'ritual', frames: [0, 0, 1, 2, 4], impactAt: 0.7 },
  boss_riptide_chain: { family: 'ritual', frames: [0, 0, 1, 2, 4], impactAt: 0.66 },
  boss_ember_surge: { family: 'volley', frames: [0, 0, 1, 3, 4], impactAt: 0.62 },
};

export function getBossAttackCue(skillId?: string): BossAttackCue {
  return ATTACK_CUES[skillId as BossAttackId] ?? DEFAULT_CUE;
}

function attackMotion(cue: BossAttackCue, progress: number): BossMotion {
  const p = Math.max(0, Math.min(0.999, progress));
  const index = Math.min(cue.frames.length - 1, Math.floor(p * cue.frames.length));
  const contact = Math.max(0, 1 - Math.abs(p - cue.impactAt) / 0.19);
  const windup = Math.max(0, 1 - p / Math.max(0.01, cue.impactAt));
  const frame = cue.frames[index]!;

  if (cue.family === 'cleave') {
    return {
      frame,
      scaleX: 1 + contact * 0.12 + windup * 0.035,
      scaleY: 1 - contact * 0.09 - windup * 0.12,
      offsetX: -windup * 7 + contact * 12,
      offsetY: windup * 7 - contact * 3,
      shadowScale: 1 + contact * 0.24,
      shadowAlpha: 0.44 + contact * 0.16,
    };
  }
  if (cue.family === 'volley') {
    return {
      frame,
      scaleX: 1 + windup * 0.075 - contact * 0.035,
      scaleY: 1 - windup * 0.1 + contact * 0.06,
      offsetX: -windup * 4 + contact * 5,
      offsetY: windup * 4 - contact * 5,
      shadowScale: 1 - contact * 0.08,
      shadowAlpha: 0.42,
    };
  }
  if (cue.family === 'leap') {
    // The combat core owns the leap destination. This only communicates the
    // compression, launch and planted landing without changing the hitbox.
    const launch = Math.max(0, (p - 0.48) / 0.36);
    return {
      frame,
      scaleX: 1 + windup * 0.12 - launch * 0.04,
      scaleY: 1 - windup * 0.25 + launch * 0.1,
      offsetX: launch * 4,
      offsetY: windup * 9 - launch * 15,
      shadowScale: 1 + windup * 0.18 - launch * 0.28,
      shadowAlpha: 0.42 - launch * 0.16,
    };
  }
  return {
    frame,
    scaleX: 1 + windup * 0.065,
    scaleY: 1 - windup * 0.07,
    offsetX: -windup * 3,
    offsetY: windup * 3 - contact * 2,
    shadowScale: 1 + windup * 0.06,
    shadowAlpha: 0.42,
  };
}

/** Returns body motion only; collision and cast timing remain in src/core. */
export function getBossMotion(input: BossMotionInput): BossMotion {
  if (input.attackProgress !== undefined) {
    const motion = attackMotion(getBossAttackCue(input.attackSkillId), input.attackProgress);
    if (input.hitFlashMs <= 0) return motion;
    return {
      ...motion,
      scaleX: motion.scaleX * 0.97,
      scaleY: motion.scaleY * 1.03,
      offsetX: motion.offsetX - 8,
    };
  }

  if (input.moving) {
    const stride = Math.sin(input.walkPhase * Math.PI / 3);
    return {
      frame: Math.floor(input.walkPhase) % 6,
      scaleX: 1 + Math.abs(stride) * 0.045,
      scaleY: 1 - Math.abs(stride) * 0.055,
      offsetX: stride * 2,
      offsetY: -Math.abs(stride) * 2,
      shadowScale: 1 + Math.abs(stride) * 0.08,
      shadowAlpha: 0.42,
    };
  }

  const breathe = input.phase === 2 ? 0.035 : 0.02;
  const recoil = input.hitFlashMs > 0 ? -2 : 0;
  return {
    frame: 0,
    scaleX: 1 + breathe,
    scaleY: 1 - breathe,
    offsetX: recoil,
    offsetY: input.phase === 2 ? -1 : 0,
    shadowScale: 1,
    shadowAlpha: 0.42,
  };
}

interface RingFx {
  x: number;
  y: number;
  lifeMs: number;
  maxLifeMs: number;
  color: number;
  maxRadius: number;
}

interface CorpseFx {
  sprite: Phaser.GameObjects.Sprite;
  lifeMs: number;
  maxLifeMs: number;
}

/**
 * Sparse presentation effects kept below the actor. It never fills attack
 * zones: the core telegraphs remain the only filled danger language.
 */
export class BossVisuals {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly rings: RingFx[] = [];
  private readonly corpses: CorpseFx[] = [];
  private readonly previousPositions = new Map<string, { x: number; y: number }>();

  constructor(private readonly scene: Phaser.Scene) {
    this.graphics = scene.add.graphics();
  }

  reset(): void {
    this.graphics.clear();
    this.rings.length = 0;
    this.previousPositions.clear();
    for (const corpse of this.corpses) corpse.sprite.destroy();
    this.corpses.length = 0;
  }

  observeMovement(id: string, x: number, y: number): number {
    const previous = this.previousPositions.get(id);
    this.previousPositions.set(id, { x, y });
    if (!previous) return 0;
    const jumped = Math.hypot(x - previous.x, y - previous.y) > 48;
    if (jumped) {
      this.rings.push({ x, y: y + 4, lifeMs: 360, maxLifeMs: 360, color: 0x7dd3fc, maxRadius: 44 });
      return 1;
    }
    return 0;
  }

  phaseShift(x: number, y: number): void {
    this.rings.push({ x, y: y + 4, lifeMs: 680, maxLifeMs: 680, color: 0xfb7185, maxRadius: 68 });
  }

  defeat(source: Phaser.GameObjects.Sprite): void {
    const corpse = this.scene.add.sprite(source.x, source.y + 2, source.texture.key, source.frame.name)
      .setOrigin(source.originX, source.originY)
      .setScale(source.scaleX, source.scaleY)
      .setFlipX(source.flipX)
      .setTint(0x6b2535)
      .setAlpha(0.92)
      .setDepth(source.depth - 0.5);
    this.corpses.push({ sprite: corpse, lifeMs: 760, maxLifeMs: 760 });
    this.rings.push({ x: source.x, y: source.y + 5, lifeMs: 760, maxLifeMs: 760, color: 0xfda4af, maxRadius: 76 });
  }

  update(dtMs: number): void {
    this.graphics.clear();
    let depth = -Infinity;
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i]!;
      ring.lifeMs -= dtMs;
      if (ring.lifeMs <= 0) {
        this.rings.splice(i, 1);
        continue;
      }
      const p = 1 - ring.lifeMs / ring.maxLifeMs;
      const radius = 16 + ring.maxRadius * p;
      this.graphics.lineStyle(2, ring.color, (1 - p) * 0.62);
      this.graphics.strokeEllipse(ring.x, ring.y, radius * 2, radius);
      depth = Math.max(depth, ring.y + 1);
    }
    if (depth > -Infinity) this.graphics.setDepth(depth);

    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const corpse = this.corpses[i]!;
      corpse.lifeMs -= dtMs;
      if (corpse.lifeMs <= 0) {
        corpse.sprite.destroy();
        this.corpses.splice(i, 1);
        continue;
      }
      const p = 1 - corpse.lifeMs / corpse.maxLifeMs;
      corpse.sprite.setY(corpse.sprite.y + dtMs * 0.018);
      corpse.sprite.setAlpha(0.92 * (1 - p));
      corpse.sprite.setScale(corpse.sprite.scaleX + dtMs * 0.00007, corpse.sprite.scaleY * (1 - dtMs * 0.00016));
    }
  }
}
