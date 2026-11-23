import Phaser from 'phaser';
import './style.css';
import { audioManager } from './audio/synth.ts';
import { loadGameData } from './core/data.ts';
import { playClassCutscene } from './game/cutscene.ts';
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
let startingRun = false;
const hud = new GameHud(hudRoot, data, {
  onStartRun: async (classId, seed, autoCast, playCutscene) => {
    if (startingRun) return;
    startingRun = true;
    try {
      if (playCutscene) {
        audioManager.setCutscenePlaying(true);
        try {
          audioManager.unlock();
          hud.hideTitleForCutscene();
          await playClassCutscene(hudRoot, {
            classId,
            className: data.names.classes[classId]?.name ?? classId,
            muted: audioManager.isMuted(),
          });
        } finally {
          audioManager.setCutscenePlaying(false);
        }
      }
      gameScene.startRun(classId, seed, autoCast);
    } finally {
      startingRun = false;
    }
  },
  onDevLevelUp: () => gameScene.handleDevLevelUp(),
  onDevStage: (index) => gameScene.handleDevStage(index),
  onSkillSlot: (index) => gameScene.triggerSkillSlot(index),
  onDash: () => gameScene.triggerDash(),
  onUltimate: () => gameScene.triggerUltimate(),
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
