import Phaser from 'phaser';
import './style.css';
import { audioManager } from './audio/synth.ts';
import { loadGameData } from './core/data.ts';
import { GameScene } from './game/GameScene.ts';
import { GameHud } from './game/hud.ts';

const data = loadGameData();
const gameScene = new GameScene();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-container',
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#142016',
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [gameScene],
});

const hudRoot = document.getElementById('hud-root')!;
const hud = new GameHud(hudRoot, data, {
  onStartRun: (classId, seed, autoCast) => gameScene.startRun(classId, seed, autoCast),
  onDevLevelUp: () => gameScene.handleDevLevelUp(),
  onDevStage: (index) => gameScene.handleDevStage(index),
  onSkillSlot: (index) => gameScene.triggerSkillSlot(index),
  onUsePotion: () => gameScene.handleUsePotion(),
  onToggleAutoAttack: () => gameScene.handleToggleAutoAttack(),
  onToggleAutoCast: () => gameScene.handleToggleAutoCast(),
  onToggleMute: () => {
    audioManager.unlock();
    const muted = audioManager.toggleMute();
    hud.setMuteState(muted);
  },
  onPickBoon: (boonId) => gameScene.handlePickBoon(boonId),
  onRerollOffer: () => gameScene.handleRerollOffer(),
  onSkipOffer: () => gameScene.handleSkipOffer(),
  onBuyAmberPotion: () => gameScene.handleBuyAmberPotion(),
  onBuyAmberOffer: () => gameScene.handleBuyAmberOffer(),
  onSetPaused: (paused) => gameScene.setPaused(paused),
  onReturnToTitle: () => gameScene.returnToTitle(),
  onJoystickMove: (sx, sy) => gameScene.setTouchMove(sx, sy),
});

gameScene.attachHud(hud);

(window as unknown as { __DINOBLADE_GAME__?: Phaser.Game }).__DINOBLADE_GAME__ = game;
