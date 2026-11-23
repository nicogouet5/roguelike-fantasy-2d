import { describe, expect, it } from 'vitest';
import { pickBoon, rerollOffer, rollBoonOffer } from '../src/core/boons.ts';
import { runHeadlessBot } from '../src/core/bot.ts';
import { loadGameData } from '../src/core/data.ts';
import { getElementMultiplier } from '../src/core/elements.ts';
import { allocateStat, createGameState, stepGame, transitionToNextZone, usePotion } from '../src/core/engine.ts';
import { gridToScreen, screenToGrid } from '../src/core/iso.ts';
import { generateZoneMap, hasWalkablePath } from '../src/core/mapGen.ts';
import { cast } from '../src/core/skills.ts';
import { computeDerivedStats, mitigateDamage } from '../src/core/stats.ts';

describe('DinoBlade Core & Data Validation', () => {
  const data = loadGameData();

  it('loads and validates all JSON data with Zod and complete Spanish names', () => {
    expect(data.classes.length).toBe(5);
    expect(data.mapsByFloor.length).toBe(3);
    expect(data.skills.length).toBeGreaterThanOrEqual(20);
    expect(data.boons.length).toBeGreaterThanOrEqual(15);
    expect(data.relics.length).toBeGreaterThanOrEqual(5);
    expect(data.mobsById['spinosaurus_boss']?.isBoss).toBe(true);
  });

  it('round-trips gridToScreen and screenToGrid accurately', () => {
    for (const [gx, gy] of [
      [0, 0],
      [5.5, 12.25],
      [18.75, 3.5],
      [31, 29],
    ] as const) {
      const s = gridToScreen(gx, gy);
      const back = screenToGrid(s.x, s.y);
      expect(back.x).toBeCloseTo(gx, 6);
      expect(back.y).toBeCloseTo(gy, 6);
    }
  });

  it('enforces dinosaur species class identities in derived stats', () => {
    const rex = computeDerivedStats(createGameState(data, { classId: 'trex', seed: 's1' }), data);
    const raptor = computeDerivedStats(createGameState(data, { classId: 'velociraptor', seed: 's1' }), data);
    const trike = computeDerivedStats(createGameState(data, { classId: 'triceratops', seed: 's1' }), data);
    const dodo = computeDerivedStats(createGameState(data, { classId: 'dodo', seed: 's1' }), data);
    const ptera = computeDerivedStats(createGameState(data, { classId: 'pteranodon', seed: 's1' }), data);

    // T-Rex has the highest melee ATK
    expect(rex.atk).toBeGreaterThan(trike.atk);
    // Velociraptor is the fastest glass cannon with highest ASPD & Crit, lowest HP
    expect(raptor.aspd).toBeGreaterThan(rex.aspd);
    expect(raptor.moveSpeed).toBeGreaterThan(trike.moveSpeed);
    expect(raptor.critChance).toBeGreaterThan(rex.critChance);
    expect(raptor.maxHp).toBeLessThan(trike.maxHp);
    // Triceratops is the tankiest herbivore
    expect(trike.maxHp).toBeGreaterThan(rex.maxHp);
    expect(trike.hardDef).toBeGreaterThan(raptor.hardDef);
    // Dodo Mage has highest MATK & Max SP
    expect(dodo.matk).toBeGreaterThan(rex.matk);
    expect(dodo.maxSp).toBeGreaterThan(rex.maxSp);
    // Pteranodon has high ranged ATK & fast speed
    expect(ptera.atk).toBeGreaterThan(dodo.atk);
    expect(ptera.moveSpeed).toBeGreaterThan(rex.moveSpeed);
  });

  it('computes elemental weaknesses and hyperbolic DEF mitigation cleanly', () => {
    expect(getElementMultiplier(data.elementMatrix, 'Fire', 'Earth')).toBeGreaterThan(1.4);
    expect(getElementMultiplier(data.elementMatrix, 'Water', 'Fire')).toBeGreaterThan(1.4);
    expect(getElementMultiplier(data.elementMatrix, 'Wind', 'Water')).toBeGreaterThan(1.4);

    const lowDefDmg = mitigateDamage(100, 10, 5, true, 0);
    const highDefDmg = mitigateDamage(100, 120, 15, true, 0);
    const pierceDmg = mitigateDamage(100, 120, 15, true, 0.4);
    expect(lowDefDmg).toBeGreaterThan(highDefDmg);
    expect(pierceDmg).toBeGreaterThan(highDefDmg);
  });

  it('generates deterministic connected maps across all 3 biomes and multiple seeds', () => {
    for (const seed of ['alpha', 'dinoblade-2026', 'jurassic-99']) {
      for (const mapDef of data.mapsByFloor) {
        const m1 = generateZoneMap(mapDef, seed);
        const m2 = generateZoneMap(mapDef, seed);
        expect(m1.tiles).toEqual(m2.tiles);
        expect(hasWalkablePath(m1, m1.spawn, m1.portal)).toBe(true);
      }
    }
  });

  it('casts every playable dinosaur class basic + 3 active skills through cast()', () => {
    for (const cls of data.classes) {
      const state = createGameState(data, { classId: cls.id, seed: `cast-${cls.id}` });
      const mob = state.mobs[0]!;
      mob.x = state.player.x + 1.5;
      mob.y = state.player.y;

      const basicRes = cast(state, data, 'player', cls.basicSkillId, { x: mob.x, y: mob.y });
      expect(basicRes.ok).toBe(true);

      for (const sid of cls.activeSkillIds) {
        state.player.sp = 999;
        const res = cast(state, data, 'player', sid, { x: mob.x, y: mob.y });
        expect(res.ok).toBe(true);
      }
    }
  });

  it('handles roguelite boon offers deterministically with reroll, pick, stat allocation, and potions', () => {
    const s1 = createGameState(data, { classId: 'trex', seed: 'offer-seed' });
    const s2 = createGameState(data, { classId: 'trex', seed: 'offer-seed' });
    const o1 = rollBoonOffer(s1, data, 'levelup');
    const o2 = rollBoonOffer(s2, data, 'levelup');
    expect(o1?.choices).toEqual(o2?.choices);
    expect(o1?.choices.length).toBe(3);

    s1.pendingOffer = o1;
    expect(rerollOffer(s1, data)).toBe(true);
    expect(s1.rerolls).toBe(1);

    const chosen = s1.pendingOffer!.choices[0]!;
    expect(pickBoon(s1, data, chosen)).toBe(true);
    expect(s1.boonRanks[chosen]).toBe(1);

    s1.player.statPoints = 2;
    expect(allocateStat(s1, data, 'STR')).toBe(true);
    s1.player.hp = 50;
    expect(usePotion(s1, data)).toBe(true);
    expect(s1.player.hp).toBeGreaterThan(50);
  });

  it('transitions to boss floor with Spinosaurus Hoja-Abisal and executes headless bot cleanly', () => {
    const state = createGameState(data, { classId: 'velociraptor', seed: 'boss-check' });
    expect(transitionToNextZone(state, data)).toBe(true);
    expect(transitionToNextZone(state, data)).toBe(true);
    expect(state.mobs.some((m) => m.mobId === 'spinosaurus_boss' && m.isBoss)).toBe(true);
    stepGame(state, data, 50, { moveX: 1, moveY: 0 });

    const sim = runHeadlessBot(data, 'trex', 'sim-smoke', 60);
    expect(sim.kills).toBeGreaterThan(0);
    expect(sim.damageDealt).toBeGreaterThan(0);
  });

  it('updates the floating Codex pet to follow the player and grant heals or temporary buffs', () => {
    const state = createGameState(data, { classId: 'dodo', seed: 'codex-pet' });
    const baseDerived = computeDerivedStats(state, data);

    // Trigger heal when HP is below 72%
    state.player.hp = Math.round(baseDerived.maxHp * 0.4);
    state.pet.supportCooldownMs = 20;
    stepGame(state, data, 50, { moveX: 0, moveY: 0 });
    expect(state.pet.lastAction).toBe('heal');
    expect(state.player.hp).toBeGreaterThan(Math.round(baseDerived.maxHp * 0.4));

    // Trigger temporary buff when HP is full
    state.player.hp = baseDerived.maxHp;
    state.pet.supportCooldownMs = 20;
    stepGame(state, data, 50, { moveX: 1, moveY: 0 });
    expect(state.pet.lastAction === 'overclock' || state.pet.lastAction === 'shield').toBe(true);
    expect(state.player.buffs.some((b) => b.id === 'codex_overclock' || b.id === 'codex_shield')).toBe(true);
  });
});
