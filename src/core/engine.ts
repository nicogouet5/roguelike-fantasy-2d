import { spawnMob, stepMobsAi } from './ai.ts';
import { AMBER_POTION_COST, enqueueOffer } from './boons.ts';
import type { GameData } from './data.ts';
import { generateZoneMap, isWalkable } from './mapGen.ts';
import { createRng, hashSeed } from './rng.ts';
import { addPlayerBuff, cast, damageMob, damagePlayer, findNearestMob } from './skills.ts';
import { computeDerivedStats, expRequiredForLevel, getBasicAttackRange } from './stats.ts';
import type { GameState, MapDef } from './types.ts';

function pickWeightedMob(mapDef: MapDef, rng: ReturnType<typeof createRng>): string {
  let total = 0;
  for (const m of mapDef.mobs) total += m.weight;
  let roll = rng.float(0, total);
  for (const m of mapDef.mobs) {
    roll -= m.weight;
    if (roll <= 0) return m.mobId;
  }
  return mapDef.mobs[0]!.mobId;
}

function populateZoneMobs(state: GameState, data: GameData, mapDef: MapDef): void {
  state.mobs = [];
  const rng = createRng(state.rngCombatState);

  if (mapDef.bossId) {
    const cx = mapDef.width * 0.52;
    const cy = mapDef.height * 0.48;
    spawnMob(state, data, mapDef.bossId, cx, cy, false);
    state.rngCombatState = rng.getState();
    return;
  }

  const initialCount = Math.max(6, Math.round(mapDef.maxMobs * 0.8));
  for (let i = 0; i < initialCount; i++) {
    for (let tries = 0; tries < 25; tries++) {
      const mx = rng.int(4, state.zone.width - 5) + 0.5;
      const my = rng.int(4, state.zone.height - 5) + 0.5;
      if (!isWalkable(state.zone, mx, my)) continue;
      if (Math.hypot(mx - state.player.x, my - state.player.y) < 7.0) continue;
      const mobId = pickWeightedMob(mapDef, rng);
      const isElite = rng.next() < mapDef.eliteChance;
      spawnMob(state, data, mobId, mx, my, isElite);
      break;
    }
  }
  state.rngCombatState = rng.getState();
}

export function createGameState(
  data: GameData,
  options: {
    classId: string;
    seed: string;
    autoCast?: boolean;
    floorIndex?: number;
  }
): GameState {
  const cls = data.classesById[options.classId] ?? data.classes[0]!;
  const floorIndex = Math.max(0, Math.min(data.mapsByFloor.length - 1, options.floorIndex ?? 0));
  const mapDef = data.mapsByFloor[floorIndex]!;
  const zone = generateZoneMap(mapDef, options.seed);

  const state: GameState = {
    seed: options.seed,
    rngCombatState: hashSeed(`${options.seed}:combat`),
    rngOfferState: hashSeed(`${options.seed}:offers`),
    nextEntityId: 1,
    status: 'playing',
    paused: false,
    floorIndex,
    zoneKills: 0,
    portalUnlocked: false,
    zone,
    player: {
      id: 'player',
      classId: cls.id,
      x: zone.spawn.x,
      y: zone.spawn.y,
      vx: 0,
      vy: 0,
      facingX: 1,
      facingY: 0,
      level: 1,
      exp: 0,
      expToNext: expRequiredForLevel(1),
      stats: { ...cls.baseStats },
      hp: 100,
      sp: 100,
      potions: 3,
      amber: 0,
      basicCooldownMs: 0,
      skillCooldowns: {},
      buffs: [],
      hitFlashMs: 0,
      attackAnimMs: 0,
      attackAnimDurationMs: 340,
      invulnMs: 0,
      leapAnimMs: 0,
      autoAttack: true,
      autoCast: options.autoCast ?? false,
    },
    pet: {
      id: 'pet_codex',
      spriteId: 'pet_codex',
      x: zone.spawn.x - 1.1,
      y: zone.spawn.y - 0.8,
      facingX: 1,
      facingY: 0,
      supportCooldownMs: 4500,
      castAnimMs: 0,
      lastAction: null,
    },
    mobs: [],
    projectiles: [],
    telegraphs: [],
    drops: [],
    respawnTimerMs: 2500,
    killsSinceChest: 0,
    boonRanks: {},
    relics: [],
    rerolls: 3,
    pendingOffer: null,
    offerQueue: [],
    stats: {
      elapsedMs: 0,
      kills: 0,
      elitesKilled: 0,
      damageDealt: 0,
      damageTaken: 0,
      chestsOpened: 0,
      boonsPicked: 0,
      floorsCleared: 0,
    },
    events: [],
  };

  const derived = computeDerivedStats(state, data);
  state.player.hp = derived.maxHp;
  state.player.sp = derived.maxSp;

  populateZoneMobs(state, data, mapDef);
  return state;
}

export function transitionToNextZone(state: GameState, data: GameData): boolean {
  const nextFloor = state.floorIndex + 1;
  const nextMap = data.mapsByFloor[nextFloor];
  if (!nextMap) return false;

  state.stats.floorsCleared += 1;
  state.floorIndex = nextFloor;
  state.zoneKills = 0;
  state.portalUnlocked = false;
  state.zone = generateZoneMap(nextMap, state.seed);
  state.player.x = state.zone.spawn.x;
  state.player.y = state.zone.spawn.y;
  state.pet.x = state.zone.spawn.x - 1.1;
  state.pet.y = state.zone.spawn.y - 0.8;
  state.projectiles = [];
  state.telegraphs = [];
  state.drops = [];

  const derived = computeDerivedStats(state, data);
  state.player.hp = Math.min(derived.maxHp, state.player.hp + Math.round(derived.maxHp * 0.35));
  state.player.sp = derived.maxSp;

  populateZoneMobs(state, data, nextMap);

  state.events.push({ type: 'zone_change', mapId: nextMap.id, floorIndex: nextFloor });
  state.events.push({ type: 'sfx', sfx: 'portal' });
  state.events.push({
    type: 'notice',
    x: state.player.x,
    y: state.player.y,
    text: data.names.maps[nextMap.id] ?? nextMap.id,
    color: '#fbbf24',
  });
  return true;
}

export function usePotion(state: GameState, data: GameData): boolean {
  const player = state.player;
  const derived = computeDerivedStats(state, data);
  if (player.potions <= 0 || (player.hp >= derived.maxHp && player.sp >= derived.maxSp)) {
    return false;
  }
  player.potions -= 1;
  const hpHeal = Math.round(derived.maxHp * 0.42);
  const spHeal = Math.round(derived.maxSp * 0.45);
  player.hp = Math.min(derived.maxHp, player.hp + hpHeal);
  player.sp = Math.min(derived.maxSp, player.sp + spHeal);
  state.events.push({ type: 'heal', targetId: 'player', x: player.x, y: player.y, amount: hpHeal });
  state.events.push({ type: 'sfx', sfx: 'buff' });
  return true;
}

export function buyAmberPotion(state: GameState): boolean {
  if (state.status !== 'playing' || state.player.amber < AMBER_POTION_COST) return false;
  state.player.amber -= AMBER_POTION_COST;
  state.player.potions += 1;
  state.events.push({
    type: 'notice',
    x: state.player.x,
    y: state.player.y,
    text: '+1 Poción de Ámbar',
    color: '#4ade80',
  });
  state.events.push({ type: 'sfx', sfx: 'buff' });
  return true;
}

export interface StepInput {
  moveX: number;
  moveY: number;
}

function stepCodexPet(state: GameState, data: GameData, dtMs: number): void {
  const pet = state.pet;
  const player = state.player;
  const dtSec = dtMs / 1000;

  if (pet.castAnimMs > 0) pet.castAnimMs = Math.max(0, pet.castAnimMs - dtMs);

  // Smooth floating companion follow offset behind/beside the player
  const orbitAngle = state.stats.elapsedMs * 0.0014;
  const desiredX = player.x - player.facingX * 1.15 + Math.cos(orbitAngle) * 0.65;
  const desiredY = player.y - player.facingY * 1.15 + Math.sin(orbitAngle) * 0.65;
  const dx = desiredX - pet.x;
  const dy = desiredY - pet.y;
  const dist = Math.hypot(dx, dy);

  if (dist > 8.5) {
    // Teleport back if somehow far behind
    pet.x = desiredX;
    pet.y = desiredY;
  } else if (dist > 0.06) {
    const followSpeed = Math.min(1, dtSec * 4.8);
    pet.x += dx * followSpeed;
    pet.y += dy * followSpeed;
    pet.facingX = dx / dist;
    pet.facingY = dy / dist;
  }

  // Periodic support buff or heal
  pet.supportCooldownMs -= dtMs;
  if (pet.supportCooldownMs > 0) return;

  const derived = computeDerivedStats(state, data);
  const hpRatio = player.hp / Math.max(1, derived.maxHp);
  pet.castAnimMs = 700;
  pet.supportCooldownMs = 8500;

  if (hpRatio < 0.72) {
    const healAmt = Math.max(12, Math.round(derived.maxHp * 0.18));
    const spAmt = Math.round(derived.maxSp * 0.22);
    player.hp = Math.min(derived.maxHp, player.hp + healAmt);
    player.sp = Math.min(derived.maxSp, player.sp + spAmt);
    pet.lastAction = 'heal';
    state.events.push({ type: 'heal', targetId: 'player', x: player.x, y: player.y, amount: healAmt });
    state.events.push({ type: 'impact', x: player.x, y: player.y, radius: 1.5, element: 'Water', heavy: false });
    state.events.push({ type: 'notice', x: pet.x, y: pet.y, text: 'Codex > heal()', color: '#4ade80' });
    state.events.push({ type: 'sfx', sfx: 'buff' });
    return;
  }

  // Alternate between Overclock (+ATK/MATK/ASPD/Speed) and Firewall (-30% dmg taken + SP)
  const rng = createRng(state.rngCombatState);
  const giveOverclock = pet.lastAction === 'shield' || (pet.lastAction !== 'overclock' && rng.next() < 0.6);
  state.rngCombatState = rng.getState();

  if (giveOverclock) {
    addPlayerBuff(state, 'codex_overclock', 6500);
    pet.lastAction = 'overclock';
    state.events.push({ type: 'impact', x: player.x, y: player.y, radius: 1.5, element: 'Wind', heavy: false });
    state.events.push({ type: 'notice', x: pet.x, y: pet.y, text: 'Codex > boost()', color: '#38bdf8' });
    state.events.push({ type: 'sfx', sfx: 'buff' });
  } else {
    addPlayerBuff(state, 'codex_shield', 6500);
    player.sp = Math.min(derived.maxSp, player.sp + Math.round(derived.maxSp * 0.16));
    pet.lastAction = 'shield';
    state.events.push({ type: 'impact', x: player.x, y: player.y, radius: 1.5, element: 'Earth', heavy: false });
    state.events.push({ type: 'notice', x: pet.x, y: pet.y, text: 'Codex > guard()', color: '#a78bfa' });
    state.events.push({ type: 'sfx', sfx: 'buff' });
  }
}

export function stepGame(state: GameState, data: GameData, dtMs: number, input: StepInput): void {
  if (state.status !== 'playing' || state.paused) return;
  const clampedDt = Math.min(dtMs, 80);
  const dtSec = clampedDt / 1000;
  state.stats.elapsedMs += clampedDt;

  const player = state.player;
  const cls = data.classesById[player.classId]!;
  const derived = computeDerivedStats(state, data);

  // Decay player timers & buffs
  if (player.basicCooldownMs > 0) player.basicCooldownMs = Math.max(0, player.basicCooldownMs - clampedDt);
  if (player.hitFlashMs > 0) player.hitFlashMs = Math.max(0, player.hitFlashMs - clampedDt);
  if (player.attackAnimMs > 0) player.attackAnimMs = Math.max(0, player.attackAnimMs - clampedDt);
  if (player.invulnMs > 0) player.invulnMs = Math.max(0, player.invulnMs - clampedDt);
  if (player.leapAnimMs > 0) player.leapAnimMs = Math.max(0, player.leapAnimMs - clampedDt);

  for (const sid of Object.keys(player.skillCooldowns)) {
    const rem = (player.skillCooldowns[sid] ?? 0) - clampedDt;
    if (rem <= 0) delete player.skillCooldowns[sid];
    else player.skillCooldowns[sid] = rem;
  }
  for (let i = player.buffs.length - 1; i >= 0; i--) {
    player.buffs[i]!.remainingMs -= clampedDt;
    if (player.buffs[i]!.remainingMs <= 0) player.buffs.splice(i, 1);
  }

  // Passive SP regen
  player.sp = Math.min(derived.maxSp, player.sp + derived.spRegen * dtSec);

  // Player movement in Cartesian grid space
  const mag = Math.hypot(input.moveX, input.moveY);
  if (mag > 0.02) {
    const nx = input.moveX / Math.max(1, mag);
    const ny = input.moveY / Math.max(1, mag);
    const candX = player.x + nx * derived.moveSpeed * dtSec;
    const candY = player.y + ny * derived.moveSpeed * dtSec;
    if (isWalkable(state.zone, candX, candY)) {
      player.x = candX;
      player.y = candY;
    } else if (isWalkable(state.zone, candX, player.y)) {
      player.x = candX;
    } else if (isWalkable(state.zone, player.x, candY)) {
      player.y = candY;
    }
    player.vx = nx * derived.moveSpeed;
    player.vy = ny * derived.moveSpeed;
    player.facingX = nx;
    player.facingY = ny;
  } else {
    player.vx = 0;
    player.vy = 0;
  }

  // Update floating Codex pet companion
  stepCodexPet(state, data, clampedDt);

  // Auto-attack & Auto-cast (uses dynamic basic reach so Triceratops's grown horn-lances strike farther!)
  const basicReach = getBasicAttackRange(state, data);
  const nearest = findNearestMob(state, Math.max(basicReach + 0.4, 7.2));
  if (nearest) {
    const dist = Math.hypot(nearest.x - player.x, nearest.y - player.y);
    if (player.autoCast) {
      for (const sid of cls.activeSkillIds) {
        const sk = data.skillsById[sid]!;
        if ((player.skillCooldowns[sid] ?? 0) > 0 || player.sp < sk.spCost) continue;
        if (sk.targetType === 'self') {
          if (sk.healRatio && player.hp > derived.maxHp * 0.72) continue;
          if (dist <= (sk.radius ?? 4.2)) {
            cast(state, data, 'player', sid, { x: nearest.x, y: nearest.y });
            break;
          }
        } else if (dist <= sk.range) {
          cast(state, data, 'player', sid, { x: nearest.x, y: nearest.y });
          break;
        }
      }
    }
    if (player.autoAttack && player.basicCooldownMs <= 0 && dist <= basicReach + 0.3) {
      cast(state, data, 'player', cls.basicSkillId, { x: nearest.x, y: nearest.y });
    }
  }

  // Update projectiles
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const p = state.projectiles[i]!;
    const stepX = p.vx * dtSec;
    const stepY = p.vy * dtSec;
    p.x += stepX;
    p.y += stepY;
    p.remainingDist -= Math.hypot(stepX, stepY);

    let remove = p.remainingDist <= 0 || !isWalkable(state.zone, p.x, p.y);

    if (!remove && p.fromPlayer) {
      for (const mob of [...state.mobs]) {
        if (mob.hp <= 0 || p.hitIds.includes(mob.id)) continue;
        if (Math.hypot(mob.x - p.x, mob.y - p.y) <= p.radius + (mob.isBoss ? 0.95 : 0.55)) {
          p.hitIds.push(mob.id);
          damageMob(state, data, mob, p.damage, p.element, p.isPhysical, {
            ignoreDefRatio: p.ignoreDefRatio,
          });
          if (p.splashRadius > 0) {
            state.events.push({ type: 'impact', x: p.x, y: p.y, radius: p.splashRadius, element: p.element, heavy: false });
            for (const other of [...state.mobs]) {
              if (other.id === mob.id || other.hp <= 0) continue;
              if (Math.hypot(other.x - p.x, other.y - p.y) <= p.splashRadius) {
                damageMob(state, data, other, p.damage * 0.65, p.element, p.isPhysical, { allowRelics: false });
              }
            }
          }
          if (!p.pierce) {
            remove = true;
            break;
          }
        }
      }
    } else if (!remove && !p.fromPlayer) {
      if (Math.hypot(player.x - p.x, player.y - p.y) <= p.radius + 0.5) {
        const owner = state.mobs.find((m) => m.id === p.ownerId);
        damagePlayer(state, data, p.damage, p.element, p.isPhysical, owner);
        remove = true;
      }
    }

    if (remove) state.projectiles.splice(i, 1);
  }

  // Update telegraphs (Meteor Rain waves & Boss/Elite AoEs)
  for (let i = state.telegraphs.length - 1; i >= 0; i--) {
    const t = state.telegraphs[i]!;
    t.elapsedMs += clampedDt;
    if (t.elapsedMs < t.durationMs) continue;

    state.events.push({ type: 'impact', x: t.x, y: t.y, radius: t.radius, element: t.element, heavy: true });
    state.events.push({ type: 'sfx', sfx: t.element === 'Fire' ? 'fire' : 'slam' });

    if (t.fromPlayer) {
      for (const mob of [...state.mobs]) {
        if (mob.hp <= 0) continue;
        if (Math.hypot(mob.x - t.x, mob.y - t.y) <= t.radius + 0.45) {
          damageMob(state, data, mob, t.damage, t.element, t.isPhysical, { stunMs: t.stunMs });
        }
      }
    } else {
      const owner = state.mobs.find((m) => m.id === t.ownerId && m.hp > 0);
      if (t.leapOwner && owner && isWalkable(state.zone, t.x, t.y)) {
        owner.x = t.x;
        owner.y = t.y;
      }
      if (Math.hypot(player.x - t.x, player.y - t.y) <= t.radius + 0.35) {
        damagePlayer(state, data, t.damage, t.element, t.isPhysical, owner);
      }
    }

    t.wavesRemaining -= 1;
    if (t.wavesRemaining > 0) {
      t.elapsedMs = 0;
      t.durationMs = t.waveIntervalMs;
    } else {
      state.telegraphs.splice(i, 1);
    }
  }

  // Update mobs AI & purge dead mobs
  stepMobsAi(state, data, clampedDt);
  state.mobs = state.mobs.filter((m) => m.hp > 0);

  // Pickups
  for (let i = state.drops.length - 1; i >= 0; i--) {
    const drop = state.drops[i]!;
    if (Math.hypot(drop.x - player.x, drop.y - player.y) > 1.25) continue;
    state.drops.splice(i, 1);
    if (drop.kind === 'potion') {
      player.potions += drop.amount;
      state.events.push({ type: 'notice', x: player.x, y: player.y, text: '+1 Poción de Ámbar', color: '#4ade80' });
    } else if (drop.kind === 'amber') {
      player.amber += drop.amount;
    } else if (drop.kind === 'chest') {
      state.stats.chestsOpened += 1;
      enqueueOffer(state, data, 'chest');
    }
  }

  // Respawn non-boss zones to keep action lively
  const mapDef = data.mapsByFloor[state.floorIndex]!;
  if (!mapDef.bossId && state.mobs.length < mapDef.maxMobs) {
    state.respawnTimerMs -= clampedDt;
    if (state.respawnTimerMs <= 0) {
      state.respawnTimerMs = 2600;
      const rng = createRng(state.rngCombatState);
      for (let tries = 0; tries < 20; tries++) {
        const mx = rng.int(4, state.zone.width - 5) + 0.5;
        const my = rng.int(4, state.zone.height - 5) + 0.5;
        if (!isWalkable(state.zone, mx, my)) continue;
        if (Math.hypot(mx - player.x, my - player.y) < 8.0) continue;
        spawnMob(state, data, pickWeightedMob(mapDef, rng), mx, my, rng.next() < mapDef.eliteChance);
        break;
      }
      state.rngCombatState = rng.getState();
    }
  }

  // Portal transition check
  if (state.portalUnlocked && state.floorIndex < data.mapsByFloor.length - 1) {
    if (Math.hypot(player.x - state.zone.portal.x, player.y - state.zone.portal.y) <= 1.35) {
      transitionToNextZone(state, data);
    }
  }
}
