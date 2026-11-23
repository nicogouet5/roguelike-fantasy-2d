import { describe, expect, it } from 'vitest';
import {
  AMBER_OFFER_COST,
  AMBER_POTION_COST,
  AMBER_REROLL_COST,
  buyAmberOffer,
  getBuildTagCounts,
  getEligibleBoons,
  pickBoon,
  rerollOffer,
  rollBoonOffer,
} from '../src/core/boons.ts';
import { runHeadlessBot } from '../src/core/bot.ts';
import { loadGameData } from '../src/core/data.ts';
import { getElementMultiplier } from '../src/core/elements.ts';
import { buyAmberPotion, createGameState, stepGame, transitionToNextZone, usePotion } from '../src/core/engine.ts';
import { gridToScreen, screenToGrid } from '../src/core/iso.ts';
import { generateZoneMap, hasWalkablePath, isWalkable } from '../src/core/mapGen.ts';
import { cast, grantPlayerExp } from '../src/core/skills.ts';
import { computeDerivedStats, getBasicAttackRange, mitigateDamage } from '../src/core/stats.ts';

describe('DinoBlade Core & Data Validation', () => {
  const data = loadGameData();

  it('loads and validates all JSON data with Zod and complete Spanish names', () => {
    expect(data.classes.length).toBe(5);
    expect(data.mapsByFloor.length).toBe(4);
    expect(data.skills.length).toBeGreaterThanOrEqual(20);
    expect(data.boons.length).toBeGreaterThanOrEqual(15);
    expect(data.relics.length).toBeGreaterThanOrEqual(5);
    expect(data.mobsById['spinosaurus_boss']?.isBoss).toBe(true);
    expect(data.mapsByFloor.map((map) => map.paletteId)).toEqual([
      'claustro_jade_ambar',
      'puente_violeta_cobre',
      'fortaleza_acero_coral',
      'osario_hueso_petroleo',
    ]);
    for (const map of data.mapsByFloor) {
      expect(data.mapPalettesById[map.paletteId]).toBeDefined();
    }
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

  it('generates deterministic connected scenarios across multiple seeds', () => {
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

  it('handles roguelite boon offers deterministically with synergy weighting, reroll, pick, and potions', () => {
    const s1 = createGameState(data, { classId: 'trex', seed: 'offer-seed' });
    const s2 = createGameState(data, { classId: 'trex', seed: 'offer-seed' });
    const o1 = rollBoonOffer(s1, data, 'levelup');
    const o2 = rollBoonOffer(s2, data, 'levelup');
    expect(o1?.choices).toEqual(o2?.choices);
    expect(o1?.choices.length).toBe(3);

    s1.pendingOffer = o1;
    expect(rerollOffer(s1, data)).toBe(true);
    expect(s1.rerolls).toBe(2);

    const chosen = s1.pendingOffer!.choices[0]!;
    expect(pickBoon(s1, data, chosen)).toBe(true);
    expect(s1.boonRanks[chosen]).toBe(1);
    const tags = getBuildTagCounts(s1, data);
    expect(Object.values(tags).some((c) => c > 0)).toBe(true);

    s1.player.hp = 50;
    expect(usePotion(s1, data)).toBe(true);
    expect(s1.player.hp).toBeGreaterThan(50);
  });

  it('grows Triceratops horn-lances with level and pierces all enemies in a line (Jarvan Q style)', () => {
    const state = createGameState(data, { classId: 'triceratops', seed: 'trike-horns' });
    const lv1Reach = getBasicAttackRange(state, data);

    // Level up Triceratops to Lv 6 and verify horn reach grows + every level queues an offer
    grantPlayerExp(state, data, 1500);
    expect(state.player.level).toBeGreaterThanOrEqual(5);
    expect(state.pendingOffer).not.toBeNull();
    const highLvReach = getBasicAttackRange(state, data);
    expect(highLvReach).toBeGreaterThan(lv1Reach + 1.2);

    // Line up 3 mobs along +X axis inside grown horn reach and fire 1 basic thrust!
    const m0 = state.mobs[0]!;
    const m1 = state.mobs[1]!;
    const m2 = state.mobs[2]!;
    m0.x = state.player.x + 1.4;
    m0.y = state.player.y;
    m1.x = state.player.x + 2.6;
    m1.y = state.player.y;
    m2.x = state.player.x + 3.8;
    m2.y = state.player.y;

    const res = cast(state, data, 'player', 'trike_lance_basic', { x: state.player.x + 4, y: state.player.y });
    expect(res.ok).toBe(true);
    expect(res.hits).toBeGreaterThanOrEqual(3);
    expect(state.events.some((e) => e.type === 'horn_thrust')).toBe(true);
  });

  it('applies Brotato/Hades capstone build synergies like Corazón de Titán (HP to ATK)', () => {
    const state = createGameState(data, { classId: 'triceratops', seed: 'capstone-test' });
    const before = computeDerivedStats(state, data);
    state.boonRanks['boon_cap_titan_heart'] = 1;
    const after = computeDerivedStats(state, data);
    expect(after.maxHp).toBeGreaterThan(before.maxHp);
    expect(after.atk).toBeGreaterThan(before.atk + 35);
    expect(after.thornsRatio).toBeGreaterThanOrEqual(0.25);
  });

  it('activates Tag Set Bonuses at 2 and 4 stacks and allows spending Amber on rerolls, potions, and extra offers', () => {
    const state = createGameState(data, { classId: 'dodo', seed: 'amber-sets' });
    const base = computeDerivedStats(state, data);

    // 2 Arcane cards unlock Tier 2 set bonus (-12% CDR, +2 SP/s)
    state.boonRanks['boon_stat_int'] = 2;
    const tier2 = computeDerivedStats(state, data);
    expect(tier2.cdr).toBeGreaterThanOrEqual(base.cdr + 0.12);

    // 4 Arcane cards unlock Tier 4 set bonus (+1 extra projectile)
    state.boonRanks['boon_stat_int'] = 4;
    const tier4 = computeDerivedStats(state, data);
    expect(tier4.extraProjectiles).toBeGreaterThanOrEqual(1);

    // Spending Amber on potion, extra offer, and paid reroll
    state.player.amber = AMBER_POTION_COST + AMBER_OFFER_COST + AMBER_REROLL_COST;
    const startPotions = state.player.potions;
    expect(buyAmberPotion(state)).toBe(true);
    expect(state.player.potions).toBe(startPotions + 1);

    expect(buyAmberOffer(state, data)).toBe(true);
    expect(state.pendingOffer).not.toBeNull();

    state.rerolls = 0;
    expect(rerollOffer(state, data)).toBe(true);
    expect(state.player.amber).toBe(0);

    // Class-relevant boon pool filtering: Dodo never rolls STR or melee-only cards; T-Rex never rolls INT or projectile overload
    const dodoPool = getEligibleBoons(createGameState(data, { classId: 'dodo', seed: 'pool-dodo' }), data).map((b) => b.id);
    expect(dodoPool).not.toContain('boon_stat_str');
    expect(dodoPool).not.toContain('boon_cap_titan_heart');
    expect(dodoPool).toContain('boon_stat_int');
    expect(dodoPool).toContain('boon_projectile_overload');

    const rexPool = getEligibleBoons(createGameState(data, { classId: 'trex', seed: 'pool-rex' }), data).map((b) => b.id);
    expect(rexPool).toContain('boon_stat_str');
    expect(rexPool).not.toContain('boon_stat_int');
    expect(rexPool).not.toContain('boon_projectile_overload');
  });

  it('uses collision tiles for gallery walls, the bridge drop and the ossuary corners', () => {
    for (const def of data.mapsByFloor) {
      const zone = generateZoneMap(def, 'scenario-collision');
      expect(zone.tiles).toContain('void');
      expect(zone.tiles).toContain('wall');
      expect(isWalkable(zone, 0.5, 0.5)).toBe(false);
      expect(hasWalkablePath(zone, zone.spawn, { x: def.width / 2, y: def.height / 2 })).toBe(true);
    }
    const bridge = generateZoneMap(data.mapsByFloor[1]!, 'bridge');
    expect(isWalkable(bridge, 5.5, bridge.height / 2 + 9)).toBe(true);
    expect(isWalkable(bridge, bridge.width / 2, bridge.height / 2 + 9)).toBe(false);
  });

  it('transitions to boss floor with Spinosaurus Hoja-Abisal and executes headless bot cleanly', () => {
    const state = createGameState(data, { classId: 'velociraptor', seed: 'boss-check' });
    expect(transitionToNextZone(state, data)).toBe(true);
    expect(transitionToNextZone(state, data)).toBe(true);
    expect(state.zone.mapId).toBe('fortaleza_falla_23');
    state.portalUnlocked = true;
    state.player.x = state.zone.portal.x;
    state.player.y = state.zone.portal.y;
    stepGame(state, data, 50, { moveX: 0, moveY: 0 });
    expect(state.zone.mapId).toBe('canon_dinoblade');
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
