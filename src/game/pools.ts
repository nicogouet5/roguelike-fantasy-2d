import Phaser from 'phaser';
import { ATLAS_KEY } from '../assets/pixelArt.ts';
import type { ElementName } from '../core/types.ts';

export const ELEMENT_COLORS_HEX: Record<ElementName, number> = {
  Neutral: 0xf8fafc,
  Fire: 0xff6b2b,
  Water: 0x38bdf8,
  Wind: 0x67e8f9,
  Earth: 0xd97706,
  Venom: 0xa3e635,
};

export const ELEMENT_COLORS_CSS: Record<ElementName, string> = {
  Neutral: '#f8fafc',
  Fire: '#ff7b3b',
  Water: '#38bdf8',
  Wind: '#67e8f9',
  Earth: '#fbbf24',
  Venom: '#bef264',
};

export function tintSprite(sprite: Phaser.GameObjects.Sprite, tint = 0xffffff, flash = false): void {
  const mode = flash ? Phaser.TintModes.FILL : Phaser.TintModes.MULTIPLY;
  if (tint === 0xffffff && !flash) {
    if (sprite.isTinted) sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
  } else if (sprite.tintTopLeft !== tint || sprite.tintMode !== mode) {
    sprite.setTint(tint).setTintMode(mode);
  }
}

interface ParticleItem {
  sprite: Phaser.GameObjects.Sprite;
  vx: number;
  vy: number;
  lifeMs: number;
  maxLifeMs: number;
}

export class ParticlePool {
  private readonly free: Phaser.GameObjects.Sprite[] = [];
  private readonly active: ParticleItem[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    prewarm = 96
  ) {
    for (let i = 0; i < prewarm; i++) {
      const s = scene.add.sprite(0, 0, ATLAS_KEY, 'fx_particle');
      s.setActive(false).setVisible(false);
      this.free.push(s);
    }
  }

  burst(x: number, y: number, element: ElementName, count = 8, speed = 110): void {
    const color = ELEMENT_COLORS_HEX[element];
    for (let i = 0; i < count; i++) {
      const s = this.free.pop() ?? this.scene.add.sprite(0, 0, ATLAS_KEY, 'fx_particle');
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.6;
      const spd = speed * (0.45 + Math.random() * 0.85);
      s.setTexture(ATLAS_KEY, 'fx_particle');
      s.setPosition(x, y);
      s.setScale(0.4 + Math.random() * 0.45);
      s.setAlpha(1);
      s.setDepth(y + 300);
      tintSprite(s, color, true);
      s.setActive(true).setVisible(true);
      this.active.push({
        sprite: s,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 35,
        lifeMs: 320,
        maxLifeMs: 320,
      });
    }
  }

  dustPuff(x: number, y: number): void {
    for (let i = 0; i < 3; i++) {
      const s = this.free.pop() ?? this.scene.add.sprite(0, 0, ATLAS_KEY, 'fx_particle');
      s.setTexture(ATLAS_KEY, 'fx_particle');
      s.setPosition(x + (Math.random() - 0.5) * 10, y + 2);
      s.setScale(0.28 + Math.random() * 0.22);
      s.setAlpha(0.55);
      s.setDepth(y - 1);
      tintSprite(s, 0xd6d3d1, true);
      s.setActive(true).setVisible(true);
      this.active.push({
        sprite: s,
        vx: (Math.random() - 0.5) * 34,
        vy: -14 - Math.random() * 18,
        lifeMs: 220,
        maxLifeMs: 220,
      });
    }
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i]!;
      p.lifeMs -= dtMs;
      if (p.lifeMs <= 0) {
        p.sprite.setActive(false).setVisible(false);
        this.free.push(p.sprite);
        this.active.splice(i, 1);
        continue;
      }
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;
      p.vy += 120 * dt;
      p.sprite.setAlpha(p.lifeMs / p.maxLifeMs);
    }
  }

  clear(): void {
    for (const p of this.active) {
      p.sprite.setActive(false).setVisible(false);
      this.free.push(p.sprite);
    }
    this.active.length = 0;
  }
}

interface FloatingTextItem {
  text: Phaser.GameObjects.Text;
  vy: number;
  lifeMs: number;
  maxLifeMs: number;
}

export class DamageTextPool {
  private readonly free: Phaser.GameObjects.Text[] = [];
  private readonly active: FloatingTextItem[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    prewarm = 40
  ) {
    for (let i = 0; i < prewarm; i++) {
      const t = this.createOne();
      t.setActive(false).setVisible(false);
      this.free.push(t);
    }
  }

  private createOne(): Phaser.GameObjects.Text {
    return this.scene.add
      .text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '15px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#0d0c10',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0.5);
  }

  spawnDamage(
    x: number,
    y: number,
    amount: number,
    element: ElementName,
    isCrit: boolean,
    isWeakness: boolean,
    fromPlayer: boolean
  ): void {
    const t = this.free.pop() ?? this.createOne();
    const label = `${amount}${isCrit || isWeakness ? '!' : ''}`;
    t.setText(label);
    t.setColor(fromPlayer ? ELEMENT_COLORS_CSS[element] : '#f87171');
    t.setFontSize(isCrit || isWeakness ? 20 : 15);
    t.setPosition(x + (Math.random() - 0.5) * 16, y - 34);
    t.setAlpha(1);
    t.setDepth(y + 500);
    t.setActive(true).setVisible(true);
    this.active.push({ text: t, vy: -52, lifeMs: 680, maxLifeMs: 680 });
  }

  spawnNotice(x: number, y: number, label: string, color = '#fde047'): void {
    const t = this.free.pop() ?? this.createOne();
    t.setText(label);
    t.setColor(color);
    t.setFontSize(14);
    t.setPosition(x, y - 46);
    t.setAlpha(1);
    t.setDepth(y + 550);
    t.setActive(true).setVisible(true);
    this.active.push({ text: t, vy: -34, lifeMs: 1050, maxLifeMs: 1050 });
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const item = this.active[i]!;
      item.lifeMs -= dtMs;
      if (item.lifeMs <= 0) {
        item.text.setActive(false).setVisible(false);
        this.free.push(item.text);
        this.active.splice(i, 1);
        continue;
      }
      item.text.y += item.vy * dt;
      item.vy *= 0.96;
      item.text.setAlpha(Math.min(1, (item.lifeMs / item.maxLifeMs) * 1.4));
    }
  }

  clear(): void {
    for (const item of this.active) {
      item.text.setActive(false).setVisible(false);
      this.free.push(item.text);
    }
    this.active.length = 0;
  }
}

interface SlashEffectItem {
  sprite: Phaser.GameObjects.Sprite;
  lifeMs: number;
  maxLifeMs: number;
  startScale: number;
  endScale: number;
}

export class SlashEffectPool {
  private readonly free: Phaser.GameObjects.Sprite[] = [];
  private readonly active: SlashEffectItem[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  spawnSlash(x: number, y: number, screenAngle: number, radiusTiles: number, element: ElementName): void {
    const s = this.free.pop() ?? this.scene.add.sprite(0, 0, ATLAS_KEY, 'fx_slash');
    s.setTexture(ATLAS_KEY, 'fx_slash');
    s.setPosition(x, y - 10);
    s.setRotation(screenAngle);
    const scale = Math.max(0.9, radiusTiles * 0.62);
    s.setScale(scale * 0.8);
    s.setAlpha(0.95);
    s.setDepth(y + 260);
    tintSprite(s, ELEMENT_COLORS_HEX[element], false);
    s.setActive(true).setVisible(true);
    this.active.push({
      sprite: s,
      lifeMs: 190,
      maxLifeMs: 190,
      startScale: scale * 0.8,
      endScale: scale * 1.18,
    });
  }

  spawnRing(x: number, y: number, radiusTiles: number, element: ElementName): void {
    const s = this.free.pop() ?? this.scene.add.sprite(0, 0, ATLAS_KEY, 'fx_ring');
    s.setTexture(ATLAS_KEY, 'fx_ring');
    s.setPosition(x, y);
    s.setRotation(0);
    const targetScale = Math.max(0.8, radiusTiles * 0.95);
    s.setScale(targetScale * 0.35, targetScale * 0.18);
    s.setAlpha(0.95);
    s.setDepth(y + 20);
    tintSprite(s, ELEMENT_COLORS_HEX[element], true);
    s.setActive(true).setVisible(true);
    this.active.push({
      sprite: s,
      lifeMs: 280,
      maxLifeMs: 280,
      startScale: targetScale * 0.35,
      endScale: targetScale,
    });
  }

  update(dtMs: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const fx = this.active[i]!;
      fx.lifeMs -= dtMs;
      if (fx.lifeMs <= 0) {
        fx.sprite.setActive(false).setVisible(false);
        this.free.push(fx.sprite);
        this.active.splice(i, 1);
        continue;
      }
      const p = 1 - fx.lifeMs / fx.maxLifeMs;
      const sc = fx.startScale + (fx.endScale - fx.startScale) * p;
      if (fx.sprite.frame.name === 'fx_ring') {
        fx.sprite.setScale(sc, sc * 0.52);
      } else {
        fx.sprite.setScale(sc);
      }
      fx.sprite.setAlpha(1 - p);
    }
  }

  clear(): void {
    for (const fx of this.active) {
      fx.sprite.setActive(false).setVisible(false);
      this.free.push(fx.sprite);
    }
    this.active.length = 0;
  }
}

interface AfterimageItem {
  sprite: Phaser.GameObjects.Sprite;
  lifeMs: number;
  maxLifeMs: number;
  startAlpha: number;
}

export class AfterimagePool {
  private readonly free: Phaser.GameObjects.Sprite[] = [];
  private readonly active: AfterimageItem[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  spawn(
    x: number,
    y: number,
    frame: string,
    flipX: boolean,
    scale: number,
    element: ElementName,
    alpha = 0.58,
    lifeMs = 230
  ): void {
    const s = this.free.pop() ?? this.scene.add.sprite(0, 0, ATLAS_KEY, frame);
    s.setTexture(ATLAS_KEY, frame);
    s.setOrigin(0.5, 0.84);
    s.setPosition(x, y);
    s.setFlipX(flipX);
    s.setScale(scale);
    s.setAlpha(alpha);
    s.setDepth(y - 1);
    tintSprite(s, ELEMENT_COLORS_HEX[element], true);
    s.setActive(true).setVisible(true);
    this.active.push({ sprite: s, lifeMs, maxLifeMs: lifeMs, startAlpha: alpha });
  }

  update(dtMs: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const item = this.active[i]!;
      item.lifeMs -= dtMs;
      if (item.lifeMs <= 0) {
        item.sprite.setActive(false).setVisible(false);
        this.free.push(item.sprite);
        this.active.splice(i, 1);
        continue;
      }
      item.sprite.setAlpha((item.lifeMs / item.maxLifeMs) * item.startAlpha);
    }
  }

  clear(): void {
    for (const item of this.active) {
      item.sprite.setActive(false).setVisible(false);
      this.free.push(item.sprite);
    }
    this.active.length = 0;
  }
}
