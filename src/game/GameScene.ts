import Phaser from 'phaser';
import { ANIM_COUNTS, ATLAS_KEY, buildPixelAtlas, clearDinoPreviewCache, getDinoFrameName, type AnimPose } from '../assets/pixelArt.ts';
import { codexBodyMotion } from '../assets/actorMotion.ts';
import { preloadCodexArt, registerCodexArt } from '../assets/codexArt.ts';
import { preloadPlayableSheets, registerPlayableSheets } from '../assets/playableSheets.ts';
import { preloadMobSheets, registerMobSheets } from '../assets/mobSheets.ts';
import { buildArenaArchitecture } from './arenaArchitecture.ts';
import { audioManager } from '../audio/synth.ts';
import { buyAmberOffer, pickBoon, rerollOffer, skipOffer } from '../core/boons.ts';
import type { GameData } from '../core/data.ts';
import { loadGameData } from '../core/data.ts';
import { buyAmberPotion, createGameState, enterZone, stepGame, usePotion } from '../core/engine.ts';
import { gridToScreen, ISO_TILE_WIDTH, screenToGrid } from '../core/iso.ts';
import { cast, findNearestMob, grantPlayerExp } from '../core/skills.ts';
import type { ElementName, GameState } from '../core/types.ts';
import type { GameHud } from './hud.ts';
import { renderMapVisuals } from './mapRenderer.ts';
import { preloadScenarioTextures } from './scenarioArt.ts';
import { drawTriceratopsHornGrowth } from './triceratopsHorns.ts';
import {
  AfterimagePool,
  DamageTextPool,
  ELEMENT_COLORS_HEX,
  ParticlePool,
  SlashEffectPool,
  tintSprite,
} from './pools.ts';

interface MobVisual {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  hpBg: Phaser.GameObjects.Rectangle;
  hpBar: Phaser.GameObjects.Rectangle;
  walkPhase: number;
  baseScale: number;
}

interface HornThrustFx {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  level: number;
  element: ElementName;
  lifeMs: number;
  maxLifeMs: number;
}

interface LightningFx {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  lifeMs: number;
  maxLifeMs: number;
}

export class GameScene extends Phaser.Scene {
  private gameData!: GameData;
  private state: GameState | null = null;
  private hud: GameHud | null = null;

  private tileGroup: Phaser.GameObjects.Image[] = [];
  private propSprites: Phaser.GameObjects.Sprite[] = [];
  private portalSprite: Phaser.GameObjects.Sprite | null = null;

  private playerSprite: Phaser.GameObjects.Sprite | null = null;
  private playerShadow: Phaser.GameObjects.Ellipse | null = null;
  private triceratopsHornGrowth: Phaser.GameObjects.Graphics | null = null;
  private petSprite: Phaser.GameObjects.Sprite | null = null;
  private petShadow: Phaser.GameObjects.Ellipse | null = null;
  private mobVisuals = new Map<string, MobVisual>();
  private projSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private dropSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private telegraphGraphics: Phaser.GameObjects.Graphics | null = null;
  private lineFxGraphics: Phaser.GameObjects.Graphics | null = null;
  private hornThrusts: HornThrustFx[] = [];
  private lightningArcs: LightningFx[] = [];

  private particles!: ParticlePool;
  private damageText!: DamageTextPool;
  private slashFx!: SlashEffectPool;
  private afterimages!: AfterimagePool;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private touchMove = { x: 0, y: 0 };
  private hitstopMs = 0;
  private animClockMs = 0;
  private playerWalkPhase = 0;
  private lastPlayerStepIdx = -1;

  constructor() {
    super({ key: 'GameScene' });
  }

  attachHud(hud: GameHud): void {
    this.hud = hud;
  }

  preload(): void {
    preloadCodexArt(this);
    preloadPlayableSheets(this);
    preloadMobSheets(this);
    preloadScenarioTextures(this);
  }

  create(): void {
    this.gameData = loadGameData();
    registerCodexArt(this);
    registerPlayableSheets(this);
    registerMobSheets(this);
    clearDinoPreviewCache();
    buildPixelAtlas(this);
    buildArenaArchitecture(this);

    this.particles = new ParticlePool(this, 100);
    this.damageText = new DamageTextPool(this, 48);
    this.slashFx = new SlashEffectPool(this);
    this.afterimages = new AfterimagePool(this);
    this.telegraphGraphics = this.add.graphics();
    this.telegraphGraphics.setDepth(15);
    this.lineFxGraphics = this.add.graphics();
    this.lineFxGraphics.setDepth(1400);

    this.cameras.main.setBackgroundColor('#141c15');
    this.cameras.main.setRoundPixels(true);

    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = {
        W: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        A: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        S: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        D: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      };

      this.input.keyboard.on('keydown-ONE', () => this.handleNumberKey(0));
      this.input.keyboard.on('keydown-TWO', () => this.handleNumberKey(1));
      this.input.keyboard.on('keydown-THREE', () => this.handleNumberKey(2));
      this.input.keyboard.on('keydown-SPACE', () => this.triggerDash());
      this.input.keyboard.on('keydown-E', () => this.triggerUltimate());
      this.input.keyboard.on('keydown-Q', () => this.handleUsePotion());
      this.input.keyboard.on('keydown-C', () => this.hud?.toggleStatsDrawer());
      this.input.keyboard.on('keydown-R', () => this.handleToggleAutoCast());
      this.input.keyboard.on('keydown-M', () => {
        audioManager.unlock();
        const muted = audioManager.toggleMute();
        this.hud?.setMuteState(muted);
      });
      this.input.keyboard.on('keydown-ESC', () => this.hud?.toggleEscMenu());
    }

    // Left click casts primary attack or moves aim toward cursor
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.state || this.state.paused || this.state.status !== 'playing') return;
      if (pointer.button !== 0) return;
      audioManager.unlock();
      const target = this.getPointerGridTarget(pointer);
      const cls = this.gameData.classesById[this.state.player.classId]!;
      cast(this.state, this.gameData, 'player', cls.basicSkillId, target);
    });
  }

  startRun(classId: string, seed: string, autoCast: boolean): void {
    audioManager.unlock();
    this.state = createGameState(this.gameData, { classId, seed, autoCast });
    this.rebuildZoneVisuals();
    this.hud?.hideTitle();
    this.hud?.sync(this.state, true);
  }

  handleDevLevelUp(): void {
    if (!this.state || this.state.status !== 'playing' || this.state.pendingOffer) return;
    grantPlayerExp(this.state, this.gameData, this.state.player.expToNext - this.state.player.exp);
    this.consumeEvents();
    this.hud?.sync(this.state, true);
  }

  handleDevStage(floorIndex: number): void {
    if (!this.state || this.state.status !== 'playing' || this.state.pendingOffer) return;
    const cleared = this.state.stats.floorsCleared;
    if (!enterZone(this.state, this.gameData, floorIndex)) return;
    this.state.stats.floorsCleared = cleared;
    this.state.player.vx = 0;
    this.state.player.vy = 0;
    this.hornThrusts = [];
    this.lightningArcs = [];
    this.consumeEvents();
    this.hud?.sync(this.state, true);
  }

  returnToTitle(): void {
    this.clearWorldVisuals();
    this.state = null;
    this.hud?.showTitle();
  }

  setPaused(paused: boolean): void {
    if (!this.state) return;
    if (this.state.pendingOffer || this.state.status !== 'playing') {
      this.state.paused = true;
      return;
    }
    this.state.paused = paused;
  }

  setTouchMove(sx: number, sy: number): void {
    this.touchMove.x = sx;
    this.touchMove.y = sy;
  }

  handleNumberKey(idx: number): void {
    if (!this.state) return;
    if (this.state.pendingOffer) {
      const choice = this.state.pendingOffer.choices[idx];
      if (choice) {
        pickBoon(this.state, this.gameData, choice);
        this.hud?.sync(this.state, true);
      }
      return;
    }
    if (idx === 2) {
      this.triggerUltimate();
      return;
    }
    this.triggerSkillSlot(idx);
  }

  triggerSkillSlot(idx: number): void {
    if (!this.state || this.state.paused || this.state.status !== 'playing') return;
    audioManager.unlock();
    const cls = this.gameData.classesById[this.state.player.classId]!;
    const skillId = cls.activeSkillIds[idx];
    if (!skillId) return;
    const target = this.getBestSkillTarget();
    cast(this.state, this.gameData, 'player', skillId, target);
  }

  triggerDash(): void {
    if (!this.state || this.state.paused || this.state.status !== 'playing') return;
    audioManager.unlock();
    const cls = this.gameData.classesById[this.state.player.classId]!;
    const target = this.getBestSkillTarget();
    cast(this.state, this.gameData, 'player', cls.dashSkillId, target);
  }

  triggerUltimate(): void {
    if (!this.state || this.state.paused || this.state.status !== 'playing') return;
    audioManager.unlock();
    const cls = this.gameData.classesById[this.state.player.classId]!;
    const target = this.getBestSkillTarget();
    cast(this.state, this.gameData, 'player', cls.ultimateSkillId, target);
  }

  handleUsePotion(): void {
    if (!this.state || this.state.paused || this.state.status !== 'playing') return;
    usePotion(this.state, this.gameData);
  }

  handleToggleAutoAttack(): void {
    if (!this.state) return;
    this.state.player.autoAttack = !this.state.player.autoAttack;
    this.hud?.sync(this.state, true);
  }

  handleToggleAutoCast(): void {
    if (!this.state) return;
    this.state.player.autoCast = !this.state.player.autoCast;
    this.hud?.sync(this.state, true);
  }

  handlePickBoon(boonId: string): void {
    if (!this.state) return;
    pickBoon(this.state, this.gameData, boonId);
    this.hud?.sync(this.state, true);
  }

  handleRerollOffer(): void {
    if (!this.state) return;
    rerollOffer(this.state, this.gameData);
    this.hud?.sync(this.state, true);
  }

  handleSkipOffer(): void {
    if (!this.state) return;
    skipOffer(this.state, this.gameData);
    this.hud?.sync(this.state, true);
  }

  handleBuyAmberPotion(): void {
    if (!this.state) return;
    buyAmberPotion(this.state);
    this.hud?.sync(this.state, true);
  }

  handleBuyAmberOffer(): void {
    if (!this.state) return;
    buyAmberOffer(this.state, this.gameData);
    this.hud?.sync(this.state, true);
  }

  private getPointerGridTarget(pointer?: Phaser.Input.Pointer): { x: number; y: number } {
    const p = pointer ?? this.input.activePointer;
    const worldPoint = this.cameras.main.getWorldPoint(p.x, p.y);
    return screenToGrid(worldPoint.x, worldPoint.y);
  }

  private getBestSkillTarget(): { x: number; y: number } {
    if (!this.state) return { x: 0, y: 0 };
    const ptr = this.input.activePointer;
    if (ptr && (ptr.x > 0 || ptr.y > 0) && !ptr.wasTouch) {
      return this.getPointerGridTarget(ptr);
    }
    const nearest = findNearestMob(this.state, 9.5);
    if (nearest) return { x: nearest.x, y: nearest.y };
    return {
      x: this.state.player.x + this.state.player.facingX * 3,
      y: this.state.player.y + this.state.player.facingY * 3,
    };
  }

  private clearWorldVisuals(): void {
    for (const t of this.tileGroup) t.destroy();
    this.tileGroup = [];
    for (const p of this.propSprites) p.destroy();
    this.propSprites = [];
    this.portalSprite?.destroy();
    this.portalSprite = null;
    this.playerSprite?.destroy();
    this.playerSprite = null;
    this.playerShadow?.destroy();
    this.playerShadow = null;
    this.triceratopsHornGrowth?.destroy();
    this.triceratopsHornGrowth = null;
    this.petSprite?.destroy();
    this.petSprite = null;
    this.petShadow?.destroy();
    this.petShadow = null;
    for (const v of this.mobVisuals.values()) {
      v.sprite.destroy();
      v.shadow.destroy();
      v.hpBg.destroy();
      v.hpBar.destroy();
    }
    this.mobVisuals.clear();
    for (const s of this.projSprites.values()) s.destroy();
    this.projSprites.clear();
    for (const d of this.dropSprites.values()) d.destroy();
    this.dropSprites.clear();
    this.telegraphGraphics?.clear();
    this.lineFxGraphics?.clear();
    this.hornThrusts = [];
    this.lightningArcs = [];
    this.particles.clear();
    this.damageText.clear();
    this.slashFx.clear();
    this.afterimages.clear();
  }

  private rebuildZoneVisuals(): void {
    this.clearWorldVisuals();
    if (!this.state) return;

    const zone = this.state.zone;
    const mapDef = this.gameData.mapsByFloor[zone.floorIndex]!;
    const isBossZone = Boolean(mapDef.bossId);
    audioManager.setMusicMode(isBossZone ? 'boss' : 'ambient');
    if (isBossZone) audioManager.play('roar');
    const palette = this.gameData.mapPalettesById[mapDef.paletteId]!;
    this.cameras.main.setBackgroundColor(palette.background);
    const mapVisuals = renderMapVisuals(
      this,
      zone,
      palette,
      false,
      isBossZone
    );
    this.tileGroup = mapVisuals.tiles;
    this.propSprites = mapVisuals.props;
    this.portalSprite = mapVisuals.portal;

    // Player shadow + sprite (crisp 96x96 multi-frame pixel art)
    const cls = this.gameData.classesById[this.state.player.classId]!;
    const plPos = gridToScreen(this.state.player.x, this.state.player.y);
    this.playerShadow = this.add.ellipse(plPos.x, plPos.y + 4, 42, 18, 0x000000, 0.44);
    this.playerShadow.setDepth(plPos.y - 2);
    this.playerSprite = this.add.sprite(plPos.x, plPos.y, ATLAS_KEY, getDinoFrameName(cls.spriteId, 'idle', 0));
    this.playerSprite.setOrigin(0.5, 0.84);
    this.playerSprite.setScale(0.96);
    this.playerSprite.setDepth(plPos.y);
    this.triceratopsHornGrowth = this.add.graphics();

    // Floating Codex Pet companion
    const petPos = gridToScreen(this.state.pet.x, this.state.pet.y);
    this.petShadow = this.add.ellipse(petPos.x, petPos.y + 6, 22, 9, 0x000000, 0.34);
    this.petShadow.setDepth(petPos.y - 3);
    this.petSprite = this.add.sprite(petPos.x, petPos.y - 26, ATLAS_KEY, 'pet_codex_idle_0');
    this.petSprite.setOrigin(0.5, 0.5);
    this.petSprite.setScale(0.92);
    this.petSprite.setDepth(petPos.y + 6);

    this.cameras.main.startFollow(this.playerSprite, true, 0.14, 0.14);
  }

  private readMoveInput(): { moveX: number; moveY: number } {
    let sx = this.touchMove.x;
    let sy = this.touchMove.y;
    if (this.cursors?.left.isDown || this.wasd?.A.isDown) sx -= 1;
    if (this.cursors?.right.isDown || this.wasd?.D.isDown) sx += 1;
    if (this.cursors?.up.isDown || this.wasd?.W.isDown) sy -= 1;
    if (this.cursors?.down.isDown || this.wasd?.S.isDown) sy += 1;
    if (Math.abs(sx) < 0.01 && Math.abs(sy) < 0.01) return { moveX: 0, moveY: 0 };

    // Convert screen-space directional input to Cartesian grid movement (matching 2:1 iso)
    const gx = sx * 0.5 + sy;
    const gy = sy - sx * 0.5;
    const len = Math.hypot(gx, gy) || 1;
    return { moveX: gx / len, moveY: gy / len };
  }

  update(_time: number, delta: number): void {
    if (!this.state) return;
    const dtMs = Math.min(delta, 50);
    this.animClockMs += dtMs;

    this.particles.update(dtMs);
    this.damageText.update(dtMs);
    this.slashFx.update(dtMs);
    this.afterimages.update(dtMs);
    this.updateLineFx(dtMs);

    if (this.hitstopMs > 0) {
      this.hitstopMs -= dtMs;
      return;
    }

    if (!this.state.paused && this.state.status === 'playing') {
      const move = this.readMoveInput();
      stepGame(this.state, this.gameData, dtMs, move);
      this.consumeEvents();
    }

    this.syncSprites(dtMs);
    this.hud?.sync(this.state, false);
  }

  private consumeEvents(): void {
    if (!this.state) return;
    let zoneChanged = false;
    for (const ev of this.state.events) {
      switch (ev.type) {
        case 'damage': {
          const p = gridToScreen(ev.x, ev.y);
          this.damageText.spawnDamage(p.x, p.y, ev.amount, ev.element, ev.isCrit, ev.isWeakness, ev.fromPlayer);
          this.particles.burst(p.x, p.y - 12, ev.element, ev.isCrit ? 10 : 5, ev.isCrit ? 130 : 85);
          if (ev.fromPlayer) {
            if (ev.isCrit) {
              audioManager.play('crit');
              this.hitstopMs = 28;
              this.cameras.main.shake(90, 0.004);
            } else {
              audioManager.play('hit');
            }
          }
          break;
        }
        case 'heal': {
          const p = gridToScreen(ev.x, ev.y);
          this.damageText.spawnNotice(p.x, p.y, `+${ev.amount} HP`, '#4ade80');
          break;
        }
        case 'slash': {
          const p = gridToScreen(ev.x, ev.y);
          const dx = Math.cos(ev.angle);
          const dy = Math.sin(ev.angle);
          const sdx = dx - dy;
          const sdy = (dx + dy) * 0.5;
          this.slashFx.spawnSlash(p.x, p.y, Math.atan2(sdy, sdx), ev.radius, ev.element);
          break;
        }
        case 'horn_thrust': {
          const p0 = gridToScreen(ev.x, ev.y);
          const p1 = gridToScreen(ev.endX, ev.endY);
          this.hornThrusts.push({
            x0: p0.x,
            y0: p0.y - 16,
            x1: p1.x,
            y1: p1.y - 12,
            level: ev.level,
            element: ev.element,
            lifeMs: 250,
            maxLifeMs: 250,
          });
          this.particles.burst(p1.x, p1.y - 10, ev.element, 6, 95);
          break;
        }
        case 'lightning_arc': {
          const p0 = gridToScreen(ev.fromX, ev.fromY);
          const p1 = gridToScreen(ev.toX, ev.toY);
          this.lightningArcs.push({
            x0: p0.x,
            y0: p0.y - 22,
            x1: p1.x,
            y1: p1.y - 22,
            lifeMs: 190,
            maxLifeMs: 190,
          });
          this.particles.burst(p1.x, p1.y - 18, 'Wind', 6, 110);
          break;
        }
        case 'impact': {
          const p = gridToScreen(ev.x, ev.y);
          this.slashFx.spawnRing(p.x, p.y, ev.radius, ev.element);
          this.particles.burst(p.x, p.y, ev.element, ev.heavy ? 14 : 7, ev.heavy ? 150 : 90);
          if (ev.heavy) {
            this.cameras.main.shake(140, 0.0065);
          }
          audioManager.playImpact(ev.heavy);
          break;
        }
        case 'notice': {
          const p = gridToScreen(ev.x, ev.y);
          this.damageText.spawnNotice(p.x, p.y, ev.text, ev.color);
          break;
        }
        case 'sfx':
          audioManager.play(ev.sfx);
          break;
        case 'boss_phase':
          this.cameras.main.shake(320, 0.012);
          audioManager.setMusicMode('boss');
          audioManager.play('boss_phase');
          break;
        case 'dash_trail': {
          const flipX = ev.toX - ev.fromX - (ev.toY - ev.fromY) < 0;
          const ghostFrame = getDinoFrameName(ev.spriteId, 'atk', 2);
          const steps = 4;
          for (let i = 0; i < steps; i++) {
            const t = i / steps;
            const gx = ev.fromX + (ev.toX - ev.fromX) * t;
            const gy = ev.fromY + (ev.toY - ev.fromY) * t;
            const pt = gridToScreen(gx, gy);
            this.afterimages.spawn(pt.x, pt.y, ghostFrame, flipX, 0.96, ev.element, 0.55 - t * 0.12, 240);
          }
          break;
        }
        case 'zone_change':
          zoneChanged = true;
          break;
        default:
          break;
      }
    }
    this.state.events.length = 0;

    if (zoneChanged) {
      this.rebuildZoneVisuals();
    }
  }

  private syncSprites(dtMs: number): void {
    if (!this.state || !this.playerSprite || !this.playerShadow) return;
    const state = this.state;
    const player = state.player;
    const cls = this.gameData.classesById[player.classId]!;
    const dtSec = dtMs / 1000;

    // Portal glow pulse
    if (this.portalSprite) {
      if (state.portalUnlocked) {
        const pulse = 0.85 + Math.sin(this.animClockMs * 0.008) * 0.15;
        this.portalSprite.setAlpha(pulse);
        this.portalSprite.setScale(1 + Math.sin(this.animClockMs * 0.006) * 0.08);
      } else {
        this.portalSprite.setAlpha(0.22);
      }
    }

    // Player fluid multi-frame animation + dynamic squash/stretch + footstep dust
    const pScreen = gridToScreen(player.x, player.y);
    const leapLift = player.leapAnimMs > 0 ? Math.sin((player.leapAnimMs / 300) * Math.PI) * 38 : 0;
    const speedMag = Math.hypot(player.vx, player.vy);
    const isMoving = speedMag > 0.15;

    let frameKey: string;
    let pose: AnimPose;
    let poseFrame: number;
    let sx = 0.96;
    let sy = 0.96;

    if (player.attackAnimMs > 0) {
      const total = Math.max(120, player.attackAnimDurationMs || 340);
      const progress = Math.max(0, Math.min(0.999, 1 - player.attackAnimMs / total));
      const atkFrame = Math.floor(progress * ANIM_COUNTS.atk);
      pose = 'atk';
      poseFrame = atkFrame;
      frameKey = getDinoFrameName(cls.spriteId, pose, poseFrame);
      // Punchy anticipation squash on windup, stretch on impact peak
      if (atkFrame === 0) {
        sx = 1.03;
        sy = 0.91;
      } else if (atkFrame === 1 || atkFrame === 2) {
        sx = 1.06;
        sy = 0.95;
      }
    } else if (isMoving) {
      this.playerWalkPhase = (this.playerWalkPhase + dtSec * (2.6 * speedMag)) % ANIM_COUNTS.walk;
      const walkIdx = Math.floor(this.playerWalkPhase);
      pose = 'walk';
      poseFrame = walkIdx;
      frameKey = getDinoFrameName(cls.spriteId, pose, poseFrame);
      // Subtle stride stretch & contact dust puffs on footfall frames 1 and 4
      const strideBounce = Math.sin((this.playerWalkPhase / ANIM_COUNTS.walk) * Math.PI * 2);
      if (cls.id === 'velociraptor' || cls.id === 'pteranodon') {
        sx = 0.96 + Math.abs(strideBounce) * 0.035;
        sy = 0.96 - Math.abs(strideBounce) * 0.035;
      }
      if ((walkIdx === 1 || walkIdx === 4) && walkIdx !== this.lastPlayerStepIdx && cls.id !== 'pteranodon') {
        this.particles.dustPuff(pScreen.x, pScreen.y + 4);
      }
      this.lastPlayerStepIdx = walkIdx;
    } else {
      const idleIdx = Math.floor((this.animClockMs / 210) % ANIM_COUNTS.idle);
      pose = 'idle';
      poseFrame = idleIdx;
      frameKey = getDinoFrameName(cls.spriteId, pose, poseFrame);
      this.lastPlayerStepIdx = -1;
    }

    if (this.playerSprite.frame.name !== frameKey) {
      this.playerSprite.setFrame(frameKey);
    }

    const screenFacingX = player.facingX - player.facingY;
    if (Math.abs(screenFacingX) > 0.05) {
      this.playerSprite.setFlipX(screenFacingX < 0);
    }
    this.playerSprite.setScale(sx, sy);
    this.playerSprite.setPosition(pScreen.x, pScreen.y - leapLift);
    this.playerSprite.setDepth(pScreen.y + 4);
    if (cls.id === 'triceratops' && this.triceratopsHornGrowth) {
      drawTriceratopsHornGrowth(
        this.triceratopsHornGrowth,
        player.level,
        pScreen.x,
        pScreen.y - leapLift,
        this.playerSprite.flipX,
        sx,
        sy,
        pScreen.y + 4,
        codexBodyMotion(pose, poseFrame)
      );
    } else {
      this.triceratopsHornGrowth?.clear();
    }
    this.playerShadow.setPosition(pScreen.x, pScreen.y + 5);
    this.playerShadow.setScale(Math.max(0.55, 1 - leapLift * 0.01));
    this.playerShadow.setDepth(pScreen.y - 2);

    if (player.hitFlashMs > 0) {
      tintSprite(this.playerSprite, 0xffffff, true);
    } else if (player.buffs.some((b) => b.id === 'bone_aegis')) {
      tintSprite(this.playerSprite, 0x86efac, false);
    } else if (player.buffs.some((b) => b.id === 'tyrant_fury')) {
      tintSprite(this.playerSprite, 0xfca5a5, false);
    } else if (player.buffs.some((b) => b.id === 'codex_overclock')) {
      tintSprite(this.playerSprite, 0xbae6fd, false);
    } else {
      tintSprite(this.playerSprite);
    }

    // Floating Codex Pet companion animation
    if (this.petSprite && this.petShadow) {
      const pet = state.pet;
      const petScreen = gridToScreen(pet.x, pet.y);
      const hover = Math.sin(this.animClockMs * 0.0055) * 6;
      const isCasting = pet.castAnimMs > 0;
      const petFrameIdx = Math.floor((this.animClockMs / (isCasting ? 110 : 260)) % 4);
      const petFrame = isCasting ? `pet_codex_cast_${petFrameIdx}` : `pet_codex_idle_${petFrameIdx}`;
      if (this.petSprite.frame.name !== petFrame) this.petSprite.setFrame(petFrame);
      const pulseScale = isCasting ? 1.06 + Math.sin(this.animClockMs * 0.025) * 0.08 : 0.92;
      this.petSprite.setScale(pulseScale);
      this.petSprite.setPosition(petScreen.x, petScreen.y - 28 + hover);
      this.petSprite.setDepth(petScreen.y + 8);
      this.petShadow.setPosition(petScreen.x, petScreen.y + 5);
      this.petShadow.setScale(0.95 - hover * 0.02);
      this.petShadow.setDepth(petScreen.y - 3);
    }

    // Mobs with fluid 4/6/5-frame animations
    const aliveIds = new Set<string>();
    for (const mob of state.mobs) {
      aliveIds.add(mob.id);
      const mobDef = this.gameData.mobsById[mob.mobId]!;
      let vis = this.mobVisuals.get(mob.id);
      if (!vis) {
        const baseScale = (mob.isBoss ? 1.05 : 0.86) * mobDef.scale * (mob.isElite ? 1.15 : 1.0);
        const shadow = this.add.ellipse(0, 0, mob.isBoss ? 72 : 34, mob.isBoss ? 28 : 14, 0x000000, 0.42);
        const sprite = this.add.sprite(0, 0, ATLAS_KEY, getDinoFrameName(mobDef.spriteId, 'idle', 0));
        sprite.setOrigin(0.5, 0.84);
        sprite.setScale(baseScale);
        const barW = mob.isBoss ? 78 : mob.isElite ? 44 : 32;
        const hpBg = this.add.rectangle(0, 0, barW + 2, 6, 0x09090b, 0.85);
        const hpBar = this.add.rectangle(0, 0, barW, 4, mob.isBoss ? 0xef4444 : mob.isElite ? 0xf59e0b : 0x22c55e, 1);
        vis = { sprite, shadow, hpBg, hpBar, walkPhase: Math.random() * 6, baseScale };
        this.mobVisuals.set(mob.id, vis);
      }

      const mScreen = gridToScreen(mob.x, mob.y);
      const mSpeed = Math.hypot(mob.vx, mob.vy);
      let mFrame: string;
      let msx = vis.baseScale;
      let msy = vis.baseScale;

      if (mob.attackAnimMs > 0) {
        const mDur = Math.max(150, mob.attackAnimDurationMs || 340);
        const prog = Math.max(0, Math.min(0.999, 1 - mob.attackAnimMs / mDur));
        const aIdx = Math.floor(prog * ANIM_COUNTS.atk);
        mFrame = getDinoFrameName(mobDef.spriteId, 'atk', aIdx);
        if (aIdx === 1 || aIdx === 2) {
          msx = vis.baseScale * 1.07;
          msy = vis.baseScale * 0.94;
        }
      } else if (mSpeed > 0.12) {
        vis.walkPhase = (vis.walkPhase + dtSec * (2.6 * mSpeed)) % ANIM_COUNTS.walk;
        mFrame = getDinoFrameName(mobDef.spriteId, 'walk', Math.floor(vis.walkPhase));
      } else {
        const offset = vis.walkPhase * 120;
        const iIdx = Math.floor(((this.animClockMs + offset) / 230) % ANIM_COUNTS.idle);
        mFrame = getDinoFrameName(mobDef.spriteId, 'idle', iIdx);
      }

      if (vis.sprite.frame.name !== mFrame) vis.sprite.setFrame(mFrame);
      vis.sprite.setScale(msx, msy);

      const mFaceScreenX = mob.facingX - mob.facingY;
      if (Math.abs(mFaceScreenX) > 0.05) vis.sprite.setFlipX(mFaceScreenX < 0);

      vis.sprite.setPosition(mScreen.x, mScreen.y);
      vis.sprite.setDepth(mScreen.y + 2);
      vis.shadow.setPosition(mScreen.x, mScreen.y + 4);
      vis.shadow.setDepth(mScreen.y - 3);

      const barY = mScreen.y - (mob.isBoss ? 104 : 52);
      const barW = mob.isBoss ? 78 : mob.isElite ? 44 : 32;
      const ratio = Math.max(0, Math.min(1, mob.hp / mob.maxHp));
      vis.hpBg.setPosition(mScreen.x, barY).setDepth(mScreen.y + 200);
      vis.hpBar
        .setPosition(mScreen.x - (barW * (1 - ratio)) * 0.5, barY)
        .setSize(Math.max(1, barW * ratio), 4)
        .setDepth(mScreen.y + 201);

      if (mob.hitFlashMs > 0) {
        tintSprite(vis.sprite, 0xffffff, true);
      } else if (mob.stunMs > 0) {
        tintSprite(vis.sprite, 0xfef08a, false);
      } else if (mob.isBoss && mob.bossPhase === 2) {
        tintSprite(vis.sprite, 0xff9e9e, false);
      } else if (mob.isElite) {
        tintSprite(vis.sprite, 0xfde68a, false);
      } else {
        tintSprite(vis.sprite);
      }
    }

    for (const [id, vis] of this.mobVisuals.entries()) {
      if (!aliveIds.has(id)) {
        vis.sprite.destroy();
        vis.shadow.destroy();
        vis.hpBg.destroy();
        vis.hpBar.destroy();
        this.mobVisuals.delete(id);
      }
    }

    // Projectiles
    const projIds = new Set<string>();
    for (const p of state.projectiles) {
      projIds.add(p.id);
      let sp = this.projSprites.get(p.id);
      if (!sp) {
        sp = this.add.sprite(0, 0, ATLAS_KEY, `fx_${p.visual}`);
        this.projSprites.set(p.id, sp);
      }
      const pos = gridToScreen(p.x, p.y);
      const sdx = p.vx - p.vy;
      const sdy = (p.vx + p.vy) * 0.5;
      sp.setPosition(pos.x, pos.y - 14);
      sp.setRotation(Math.atan2(sdy, sdx));
      sp.setDepth(pos.y + 120);
    }
    for (const [id, sp] of this.projSprites.entries()) {
      if (!projIds.has(id)) {
        sp.destroy();
        this.projSprites.delete(id);
      }
    }

    // Drops (Potions, Amber, Chests, Chilean Fast Food)
    const dropIds = new Set<string>();
    for (const d of state.drops) {
      dropIds.add(d.id);
      let sp = this.dropSprites.get(d.id);
      if (!sp) {
        const frame =
          d.kind === 'food' && d.foodId
            ? (this.gameData.foodsById[d.foodId]?.spriteFrame ?? 'fx_potion')
            : `fx_${d.kind}`;
        sp = this.add.sprite(0, 0, ATLAS_KEY, frame);
        sp.setScale(d.kind === 'chest' ? 1.45 : d.kind === 'food' ? 1.3 : 1.05);
        this.dropSprites.set(d.id, sp);
      }
      const pos = gridToScreen(d.x, d.y);
      const bob = Math.sin(this.animClockMs * 0.007 + pos.x) * 3;
      sp.setPosition(pos.x, pos.y - 6 + bob);
      sp.setDepth(pos.y + 1);
    }
    for (const [id, sp] of this.dropSprites.entries()) {
      if (!dropIds.has(id)) {
        sp.destroy();
        this.dropSprites.delete(id);
      }
    }

    // Telegraphs (Boss red warning rings & Dilophosaurus Meteor Rain zones)
    if (this.telegraphGraphics) {
      this.telegraphGraphics.clear();
      for (const t of state.telegraphs) {
        const pos = gridToScreen(t.x, t.y);
        const rx = t.radius * ISO_TILE_WIDTH * 0.52;
        const ry = rx * 0.5;
        const progress = Math.min(1, t.elapsedMs / Math.max(1, t.durationMs));
        const col = t.fromPlayer ? ELEMENT_COLORS_HEX[t.element] : 0xef4444;
        this.telegraphGraphics.lineStyle(2, col, 0.9);
        this.telegraphGraphics.strokeEllipse(pos.x, pos.y, rx * 2, ry * 2);
        this.telegraphGraphics.fillStyle(col, 0.14 + progress * 0.28);
        this.telegraphGraphics.fillEllipse(pos.x, pos.y, rx * 2 * progress, ry * 2 * progress);
      }
    }
  }

  private updateLineFx(dtMs: number): void {
    if (!this.lineFxGraphics) return;
    this.lineFxGraphics.clear();

    // Twin growing horn-lances thrust VFX (Jarvan IV Q style)
    for (let i = this.hornThrusts.length - 1; i >= 0; i--) {
      const fx = this.hornThrusts[i]!;
      fx.lifeMs -= dtMs;
      if (fx.lifeMs <= 0) {
        this.hornThrusts.splice(i, 1);
        continue;
      }
      const p = 1 - fx.lifeMs / fx.maxLifeMs;
      // Fast snap extension (0..28%), hold briefly, smooth retract (55..100%)
      const ext = p < 0.28 ? p / 0.28 : p < 0.55 ? 1.0 : Math.max(0.15, 1 - (p - 0.55) / 0.45);
      const alpha = Math.min(1, (1 - p) * 1.5);
      const dx = fx.x1 - fx.x0;
      const dy = fx.y1 - fx.y0;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const nx = -uy;
      const ny = ux;

      const tipX = fx.x0 + dx * ext;
      const tipY = fx.y0 + dy * ext;
      const baseSpread = 6 + Math.min(4, fx.level * 0.4);
      const hornThick = 3 + Math.min(3.5, fx.level * 0.35);

      // Golden piercing shockwave beam in center
      this.lineFxGraphics.lineStyle(hornThick * 2.4, ELEMENT_COLORS_HEX[fx.element], alpha * 0.35);
      this.lineFxGraphics.lineBetween(fx.x0, fx.y0, tipX, tipY);

      // Left & right twin ivory-steel extending horn-lances converging toward the piercing tip!
      for (const side of [-1, 1] as const) {
        const bx = fx.x0 + nx * side * baseSpread;
        const by = fx.y0 + ny * side * baseSpread;
        const tx = tipX + nx * side * 2.2;
        const ty = tipY + ny * side * 2.2;
        // Dark outline
        this.lineFxGraphics.lineStyle(hornThick + 2.5, 0x1c1917, alpha * 0.9);
        this.lineFxGraphics.lineBetween(bx, by, tx, ty);
        // Ivory horn shaft
        this.lineFxGraphics.lineStyle(hornThick, 0xf5f5f4, alpha);
        this.lineFxGraphics.lineBetween(bx, by, tx, ty);
        // Glowing golden-white spear edge
        this.lineFxGraphics.lineStyle(Math.max(1.5, hornThick * 0.45), 0xfde047, alpha);
        this.lineFxGraphics.lineBetween(bx + ux * (len * 0.35 * ext), by + uy * (len * 0.35 * ext), tx, ty);
      }

      // Piercing arrowhead burst at tip
      this.lineFxGraphics.fillStyle(0xffffff, alpha);
      this.lineFxGraphics.fillCircle(tipX, tipY, 3.2 + Math.min(2.5, fx.level * 0.25));
    }

    // Chain lightning arcs (Tormenta Crítica capstone)
    for (let i = this.lightningArcs.length - 1; i >= 0; i--) {
      const arc = this.lightningArcs[i]!;
      arc.lifeMs -= dtMs;
      if (arc.lifeMs <= 0) {
        this.lightningArcs.splice(i, 1);
        continue;
      }
      const alpha = arc.lifeMs / arc.maxLifeMs;
      const mx1 = arc.x0 + (arc.x1 - arc.x0) * 0.33 + (Math.random() - 0.5) * 18;
      const my1 = arc.y0 + (arc.y1 - arc.y0) * 0.33 + (Math.random() - 0.5) * 14;
      const mx2 = arc.x0 + (arc.x1 - arc.x0) * 0.66 + (Math.random() - 0.5) * 18;
      const my2 = arc.y0 + (arc.y1 - arc.y0) * 0.66 + (Math.random() - 0.5) * 14;

      this.lineFxGraphics.lineStyle(5, 0x38bdf8, alpha * 0.55);
      this.lineFxGraphics.beginPath();
      this.lineFxGraphics.moveTo(arc.x0, arc.y0);
      this.lineFxGraphics.lineTo(mx1, my1);
      this.lineFxGraphics.lineTo(mx2, my2);
      this.lineFxGraphics.lineTo(arc.x1, arc.y1);
      this.lineFxGraphics.strokePath();

      this.lineFxGraphics.lineStyle(2, 0xffffff, alpha);
      this.lineFxGraphics.beginPath();
      this.lineFxGraphics.moveTo(arc.x0, arc.y0);
      this.lineFxGraphics.lineTo(mx1, my1);
      this.lineFxGraphics.lineTo(mx2, my2);
      this.lineFxGraphics.lineTo(arc.x1, arc.y1);
      this.lineFxGraphics.strokePath();
    }
  }
}
