import { pickBoon } from './boons.ts';
import type { GameData } from './data.ts';
import { allocateStat, createGameState, stepGame, usePotion } from './engine.ts';
import { findNearestMob } from './skills.ts';
import { computeDerivedStats } from './stats.ts';
import type { GameState } from './types.ts';

export interface SimRunResult {
  classId: string;
  seed: string;
  victory: boolean;
  level: number;
  floorReached: number;
  kills: number;
  elapsedSec: number;
  damageDealt: number;
}

export function runHeadlessBot(
  data: GameData,
  classId: string,
  seed: string,
  maxSeconds = 240
): SimRunResult {
  const state: GameState = createGameState(data, { classId, seed, autoCast: true });
  const cls = data.classesById[classId]!;
  const stepMs = 50;
  const maxSteps = Math.floor((maxSeconds * 1000) / stepMs);

  for (let i = 0; i < maxSteps && state.status === 'playing'; i++) {
    // Handle offers greedily
    if (state.pendingOffer) {
      const choice = state.pendingOffer.choices[0]!;
      pickBoon(state, data, choice);
    }

    // Spend stat points on species preferred growth
    while (state.player.statPoints > 0) {
      const preferred = cls.statGrowth[state.player.level % cls.statGrowth.length]!;
      allocateStat(state, data, preferred);
    }

    const derived = computeDerivedStats(state, data);
    if (state.player.hp < derived.maxHp * 0.45 && state.player.potions > 0) {
      usePotion(state, data);
    }

    // Dodge enemy telegraphs first!
    let moveX = 0;
    let moveY = 0;
    const danger = state.telegraphs.find(
      (t) => !t.fromPlayer && Math.hypot(t.x - state.player.x, t.y - state.player.y) <= t.radius + 0.9
    );

    if (danger) {
      moveX = state.player.x - danger.x || 1;
      moveY = state.player.y - danger.y || 1;
    } else if (state.portalUnlocked && state.floorIndex < data.mapsByFloor.length - 1) {
      moveX = state.zone.portal.x - state.player.x;
      moveY = state.zone.portal.y - state.player.y;
    } else {
      const chest = state.drops.find((d) => d.kind === 'chest');
      const targetMob = findNearestMob(state);
      if (chest) {
        moveX = chest.x - state.player.x;
        moveY = chest.y - state.player.y;
      } else if (targetMob) {
        const dx = targetMob.x - state.player.x;
        const dy = targetMob.y - state.player.y;
        const dist = Math.hypot(dx, dy);
        const idealRange = cls.isRanged ? cls.attackRange * 0.72 : cls.attackRange * 0.75;
        if (dist > idealRange) {
          moveX = dx;
          moveY = dy;
        } else if (cls.isRanged && dist < 3.4) {
          moveX = -dx;
          moveY = -dy;
        }
      }
    }

    stepGame(state, data, stepMs, { moveX, moveY });
    state.events.length = 0;
  }

  return {
    classId,
    seed,
    victory: state.status === 'victory',
    level: state.player.level,
    floorReached: state.floorIndex,
    kills: state.stats.kills,
    elapsedSec: Math.round(state.stats.elapsedMs / 1000),
    damageDealt: state.stats.damageDealt,
  };
}
