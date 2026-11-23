import { describe, expect, it } from 'vitest';
import { loadGameData } from '../src/core/data.ts';
import { createGameState, enterZone } from '../src/core/engine.ts';
import { grantPlayerExp } from '../src/core/skills.ts';

const data = loadGameData();

describe('Developer testing controls', () => {
  it('visits every stage in both directions without losing the build', () => {
    const state = createGameState(data, { classId: 'triceratops', seed: 'dev-test' });
    state.player.level = 8;
    state.player.amber = 120;
    state.boonRanks.boon_stat_str = 1;
    for (const index of [3, 1, 0, 2, 2]) {
      expect(enterZone(state, data, index)).toBe(true);
      expect(state.zone.mapId).toBe(data.mapsByFloor[index]!.id);
      expect(state.floorIndex).toBe(index);
      expect(state.player.x).toBe(state.zone.spawn.x);
      expect(state.player.level).toBe(8);
      expect(state.player.amber).toBe(120);
      expect(state.boonRanks.boon_stat_str).toBe(1);
      expect(state.projectiles).toEqual([]);
      expect(state.telegraphs).toEqual([]);
    }
  });

  it('rejects invalid stage indices without changing the state', () => {
    const state = createGameState(data, { classId: 'trex', seed: 'dev-test' });
    const before = structuredClone(state);
    for (const index of [-1, 0.5, NaN, Infinity, data.mapsByFloor.length]) {
      expect(enterZone(state, data, index)).toBe(false);
      expect(state).toEqual(before);
    }
  });

  it('gains exactly one level using remaining XP and opens the normal boon offer', () => {
    const state = createGameState(data, { classId: 'triceratops', seed: 'dev-test' });
    state.player.exp = 10;
    grantPlayerExp(state, data, state.player.expToNext - state.player.exp);
    expect(state.player.level).toBe(2);
    expect(state.player.exp).toBe(0);
    expect(state.pendingOffer).not.toBeNull();
    expect(state.paused).toBe(true);
  });
});
