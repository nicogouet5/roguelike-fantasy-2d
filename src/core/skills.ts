import { enqueueOffer, spawnAmberChestNearPlayer } from './boons.ts';
import type { GameData } from './data.ts';
import { getElementMultiplier } from './elements.ts';
import { isWalkable } from './mapGen.ts';
import { createRng } from './rng.ts';
import {
  PTERA_LONG_RANGE_BONUS,
  PTERA_LONG_RANGE_TILES,
  TREX_EXECUTE_BONUS,
  TREX_EXECUTE_HP_RATIO,
  computeDerivedStats,
  expRequiredForLevel,
  mitigateDamage,
} from './stats.ts';
import type {
  BuffId,
  CastResult,
  CastTarget,
  DerivedStats,
  ElementName,
  GameState,
  MobEntity,
  ProjectileEntity,
  SkillDef,
} from './types.ts';

function nextCombatRng(state: GameState) {
  return createRng(state.rngCombatState);
}

function saveCombatRng(state: GameState, rngState: number): void {
  state.rngCombatState = rngState;
}

export function findNearestMob(
  state: GameState,
  maxRange = Infinity,
  origin: { x: number; y: number } = state.player,
  excludedIds?: ReadonlySet<string>
): MobEntity | null {
  let best: MobEntity | null = null;
  let bestDist = maxRange;
  for (const mob of state.mobs) {
    if (mob.hp <= 0 || excludedIds?.has(mob.id)) continue;
    const d = Math.hypot(mob.x - origin.x, mob.y - origin.y);
    if (d <= bestDist) {
      bestDist = d;
      best = mob;
    }
  }
  return best;
}

export function grantPlayerExp(state: GameState, data: GameData, amount: number): void {
  const player = state.player;
  const cls = data.classesById[player.classId]!;
  player.exp += amount;

  while (player.exp >= player.expToNext) {
    player.exp -= player.expToNext;
    player.level += 1;
    player.expToNext = expRequiredForLevel(player.level);

    // Automatic species stat growth per level (build customization happens via 1-of-3 offers!)
    const growthStat = cls.statGrowth[(player.level - 2) % cls.statGrowth.length]!;
    player.stats[growthStat] += 1;

    const derived = computeDerivedStats(state, data);
    player.hp = derived.maxHp;
    player.sp = derived.maxSp;

    const levelMsg =
      player.classId === 'triceratops' ? `¡Nivel ${player.level}! Cuernos +Alcance` : `¡Nivel ${player.level}!`;
    state.events.push({
      type: 'notice',
      x: player.x,
      y: player.y,
      text: levelMsg,
      color: '#fde047',
    });
    state.events.push({ type: 'sfx', sfx: 'levelup' });

    // Every level-up offers 1-of-3 Brotato/Hades style build cards!
    enqueueOffer(state, data, 'levelup');
  }
}

export function addPlayerBuff(state: GameState, buffId: BuffId, durationMs: number): void {
  const existing = state.player.buffs.find((b) => b.id === buffId);
  if (existing) {
    existing.remainingMs = Math.max(existing.remainingMs, durationMs);
    existing.durationMs = Math.max(existing.durationMs, durationMs);
  } else {
    state.player.buffs.push({ id: buffId, remainingMs: durationMs, durationMs });
  }
}

/**
 * Innate class damage passives:
 * - T-Rex "Ejecución Tiránica": +25% damage vs enemies below 45% HP.
 * - Pteranodon "Vuelo de Precisión": +22% damage vs enemies farther than 4 tiles.
 */
export function getClassPassiveDamageMult(state: GameState, mob: MobEntity): number {
  const player = state.player;
  if (player.classId === 'trex') {
    return mob.hp < mob.maxHp * TREX_EXECUTE_HP_RATIO ? 1 + TREX_EXECUTE_BONUS : 1;
  }
  if (player.classId === 'pteranodon') {
    const dist = Math.hypot(mob.x - player.x, mob.y - player.y);
    return dist > PTERA_LONG_RANGE_TILES ? 1 + PTERA_LONG_RANGE_BONUS : 1;
  }
  return 1;
}

const CRIT_CAPSTONE_HIT = { allowRelics: false, forceCrit: false };

function tryCritTeleport(state: GameState, data: GameData, mob: MobEntity, atk: number): void {
  const { player } = state;
  const isRaptor = player.classId === 'velociraptor';
  const boonId = isRaptor ? 'boon_cap_crit_raptor' : 'boon_cap_crit_trex';
  if ((state.boonRanks[boonId] ?? 0) <= 0) return;
  const elapsedMs = state.stats.elapsedMs;
  if (elapsedMs - (player.lastCritCapstoneMs ?? -Infinity) < (isRaptor ? 350 : 450)) return;

  const fromX = player.x;
  const fromY = player.y;
  const landingOffsets = isRaptor ? [0, 45, -45, 90, -90] : [0, 45, -45, 90, -90, 135, -135, 180];
  const landingDistance = 1.1;
  let bestDistance = isRaptor ? 8.5 : 7.5;
  let landing: { target: MobEntity; x: number; y: number } | undefined;

  for (const other of state.mobs) {
    if (other.id === mob.id || other.hp <= 0) continue;
    const distance = Math.hypot(other.x - fromX, other.y - fromY);
    if (distance > bestDistance) continue;
    const bearing = isRaptor
      ? Math.atan2(-other.facingY, -other.facingX)
      : Math.atan2(fromY - other.y, fromX - other.x);

    for (const offset of landingOffsets) {
      const angle = bearing + (offset * Math.PI) / 180;
      const x = other.x + Math.cos(angle) * landingDistance;
      const y = other.y + Math.sin(angle) * landingDistance;
      if (!isWalkable(state.zone, x, y)) continue;
      landing = { target: other, x, y };
      bestDistance = distance;
      break;
    }
  }
  if (!landing) return;

  const { target, x, y } = landing;
  const cls = data.classesById[player.classId]!;
  const element = isRaptor ? 'Wind' : 'Fire';
  const angle = Math.atan2(target.y - y, target.x - x);
  player.lastCritCapstoneMs = elapsedMs;
  player.x = x;
  player.y = y;
  player.facingX = Math.cos(angle);
  player.facingY = Math.sin(angle);
  if (isRaptor) player.sprintMomentum = Math.min(1, player.sprintMomentum + 0.2);
  state.events.push(
    { type: 'dash_trail', fromX, fromY, toX: x, toY: y, spriteId: cls.spriteId, element },
    { type: 'slash', x, y, angle, radius: 1.5, element, weaponType: cls.weaponType, fromPlayer: true },
    { type: 'sfx', sfx: isRaptor ? 'katana' : 'greatsword' }
  );
  damageMob(state, data, target, Math.round(atk * (isRaptor ? 0.75 : 0.85)), element, false, CRIT_CAPSTONE_HIT);
}

function triggerCritCapstone(state: GameState, data: GameData, mob: MobEntity, dealt: number, derived: DerivedStats): void {
  const { player } = state;
  switch (player.classId) {
    case 'trex':
    case 'velociraptor':
      tryCritTeleport(state, data, mob, derived.atk);
      break;
    case 'triceratops': {
      if ((state.boonRanks.boon_cap_crit_trike ?? 0) <= 0) return;
      const elapsedMs = state.stats.elapsedMs;
      if (elapsedMs - (player.lastCritCapstoneMs ?? -Infinity) < 450) return;
      player.lastCritCapstoneMs = elapsedMs;
      const radius = 3.2;
      const damage = Math.round(derived.atk * 0.8);
      state.events.push(
        { type: 'impact', x: mob.x, y: mob.y, radius, element: 'Earth', heavy: false },
        { type: 'sfx', sfx: 'slam' }
      );
      for (const other of state.mobs) {
        if (other.hp <= 0 || Math.hypot(other.x - mob.x, other.y - mob.y) > radius) continue;
        other.stunMs = Math.max(other.stunMs, 500);
        damageMob(state, data, other, damage, 'Earth', false, CRIT_CAPSTONE_HIT);
      }
      break;
    }
    case 'dodo':
    case 'pteranodon': {
      const isDodo = player.classId === 'dodo';
      const boonId = isDodo ? 'boon_cap_crit_dodo' : 'boon_cap_crit_ptera';
      if ((state.boonRanks[boonId] ?? 0) <= 0) return;
      if (isDodo) {
        const { maxSp } = computeDerivedStats(state, data);
        player.sp = Math.min(maxSp, player.sp + 6);
      }

      const hitIds = new Set([mob.id]);
      const range = isDodo ? 6.5 : 7.5;
      const damage = Math.round(dealt * (isDodo ? derived.critLightningRatio : 0.8));
      let origin = mob;
      for (let hop = 0; hop < (isDodo ? 2 : 1); hop++) {
        const target = findNearestMob(state, range, origin, hitIds);
        if (!target) break;
        if (hop === 0) state.events.push({ type: 'sfx', sfx: isDodo ? 'wind' : 'bow' });
        state.events.push({ type: 'lightning_arc', fromX: origin.x, fromY: origin.y, toX: target.x, toY: target.y });
        hitIds.add(target.id);
        damageMob(state, data, target, damage, 'Wind', false, CRIT_CAPSTONE_HIT);
        origin = target;
      }
      break;
    }
  }
}

export function damageMob(
  state: GameState,
  data: GameData,
  mob: MobEntity,
  rawDamage: number,
  element: ElementName,
  isPhysical: boolean,
  options?: {
    ignoreDefRatio?: number;
    knockback?: number;
    fromX?: number;
    fromY?: number;
    stunMs?: number;
    bleedMs?: number;
    allowRelics?: boolean;
    forceCrit?: boolean;
  }
): { dealt: number; killed: boolean; isCrit: boolean } {
  if (mob.hp <= 0) return { dealt: 0, killed: false, isCrit: false };
  const mobDef = data.mobsById[mob.mobId]!;
  const derived = computeDerivedStats(state, data);
  const rng = nextCombatRng(state);

  const elemMult = getElementMultiplier(data.elementMatrix, element, mobDef.element);
  const isCrit = options?.forceCrit ?? rng.next() < derived.critChance;
  const critMult = isCrit ? derived.critDamage : 1.0;
  const bleedBonusMult = mob.bleedMs > 0 && derived.damageVsBleedingPct > 0 ? 1 + derived.damageVsBleedingPct : 1.0;
  const variance = rng.float(0.93, 1.07);
  const ignoreDef = Math.min(0.85, (options?.ignoreDefRatio ?? 0) + derived.ignoreDef);

  const passiveMult = getClassPassiveDamageMult(state, mob);

  const scaledRaw = rawDamage * elemMult * critMult * bleedBonusMult * passiveMult * variance;
  const def = isPhysical ? mobDef.def : mobDef.mdef;
  const dealt = mitigateDamage(scaledRaw, def, Math.floor(def * 0.15), isPhysical, ignoreDef);

  mob.hp = Math.max(0, mob.hp - dealt);
  mob.hitFlashMs = 130;
  state.stats.damageDealt += dealt;

  // Lifesteal
  if (derived.lifesteal > 0) {
    const heal = Math.max(1, Math.round(dealt * derived.lifesteal));
    state.player.hp = Math.min(derived.maxHp, state.player.hp + heal);
  }

  // Knockback (reduced on bosses)
  if (options?.knockback && options.knockback > 0) {
    const fx = options.fromX ?? state.player.x;
    const fy = options.fromY ?? state.player.y;
    const dx = mob.x - fx;
    const dy = mob.y - fy;
    const len = Math.hypot(dx, dy) || 1;
    const kb = mob.isBoss ? options.knockback * 0.2 : options.knockback;
    const nx = mob.x + (dx / len) * kb;
    const ny = mob.y + (dy / len) * kb;
    if (isWalkable(state.zone, nx, ny)) {
      mob.x = nx;
      mob.y = ny;
    }
  }

  if (options?.stunMs && options.stunMs > 0 && !mob.isBoss) {
    mob.stunMs = Math.max(mob.stunMs, options.stunMs);
  }

  if (options?.bleedMs && options.bleedMs > 0) {
    mob.bleedMs = Math.max(mob.bleedMs, options.bleedMs);
    mob.bleedDps = Math.max(mob.bleedDps, Math.round(derived.atk * 0.45));
  }

  state.events.push({
    type: 'damage',
    targetId: mob.id,
    x: mob.x,
    y: mob.y,
    amount: dealt,
    element,
    isCrit,
    isWeakness: elemMult >= 1.3,
    fromPlayer: true,
  });

  // On-hit capstone & relic hooks
  if (options?.allowRelics !== false) {
    // Bleed-on-hit synergy (Garras Dentadas / Cosecha Carmesí)
    if (mob.hp > 0 && derived.bleedOnHitChance > 0 && rng.next() < derived.bleedOnHitChance) {
      mob.bleedMs = Math.max(mob.bleedMs, 3200);
      mob.bleedDps = Math.max(mob.bleedDps, Math.round(Math.max(derived.atk, derived.matk) * 0.48));
    }

    // Volcanic Core Fire Burst capstone (Núcleo Volcánico)
    if (derived.fireBurstOnHitChance > 0 && rng.next() < derived.fireBurstOnHitChance) {
      const blastR = 2.1 * derived.areaMult;
      state.events.push({ type: 'impact', x: mob.x, y: mob.y, radius: blastR, element: 'Fire', heavy: false });
      const blastRaw = Math.max(derived.atk, derived.matk) * 0.65;
      for (const other of [...state.mobs]) {
        if (other.hp <= 0) continue;
        if (Math.hypot(other.x - mob.x, other.y - mob.y) <= blastR) {
          damageMob(state, data, other, blastRaw, 'Fire', false, { allowRelics: false });
        }
      }
    }

    if (mob.hp > 0) {
      for (const relicId of state.relics) {
        const relic = data.relicsById[relicId];
        if (!relic || relic.hook !== 'onHit') continue;
        if (rng.next() < relic.chance) {
          if (relic.bonusDamageRatio) {
            const bonus = Math.max(1, Math.round(derived.atk * relic.bonusDamageRatio));
            mob.hp = Math.max(0, mob.hp - bonus);
            state.stats.damageDealt += bonus;
            state.events.push({
              type: 'damage',
              targetId: mob.id,
              x: mob.x + 0.15,
              y: mob.y - 0.15,
              amount: bonus,
              element: relic.element,
              isCrit: false,
              isWeakness: false,
              fromPlayer: true,
            });
            state.events.push({ type: 'impact', x: mob.x, y: mob.y, radius: 1.0, element: relic.element, heavy: false });
          }
          if (relic.bleedMs) {
            mob.bleedMs = Math.max(mob.bleedMs, relic.bleedMs);
            mob.bleedDps = Math.max(mob.bleedDps, Math.round(derived.atk * 0.4));
          }
        }
      }
    }
  }

  saveCombatRng(state, rng.getState());

  if (mob.hp <= 0) {
    handleMobDeath(state, data, mob);
  }
  // Finish resolving the primary hit before a shockwave can hit the same mob.
  if (isCrit && options?.allowRelics !== false) {
    triggerCritCapstone(state, data, mob, dealt, derived);
  }
  return { dealt, killed: mob.hp <= 0, isCrit };
}

export function handleMobDeath(state: GameState, data: GameData, mob: MobEntity): void {
  const mobDef = data.mobsById[mob.mobId]!;
  const expMult = mob.isElite ? 2.6 : 1.0;
  const amberMult = mob.isElite ? 2.5 : 1.0;

  state.stats.kills += 1;
  if (mob.isElite) state.stats.elitesKilled += 1;
  state.zoneKills += 1;
  state.killsSinceChest += 1;

  state.player.amber += Math.round(mobDef.amberReward * amberMult);
  grantPlayerExp(state, data, Math.round(mobDef.expReward * expMult));

  state.events.push({
    type: 'kill',
    mobId: mob.mobId,
    isBoss: mob.isBoss,
    isElite: mob.isElite,
    x: mob.x,
    y: mob.y,
  });

  // Drops: Chilean fast food drops (~34% normal mobs, 100% elites) + occasional potions!
  const rng = nextCombatRng(state);
  if (mob.isElite || rng.next() < 0.34) {
    let totalW = 0;
    for (const f of data.foods) totalW += f.weight;
    let roll = rng.float(0, totalW);
    let pickedFood = data.foods[0]!;
    for (const f of data.foods) {
      roll -= f.weight;
      if (roll <= 0) {
        pickedFood = f;
        break;
      }
    }
    state.drops.push({
      id: `drop_${state.nextEntityId++}`,
      kind: 'food',
      foodId: pickedFood.id,
      x: mob.x + rng.float(-0.35, 0.35),
      y: mob.y + rng.float(-0.35, 0.35),
      amount: 1,
    });
  } else if (rng.next() < 0.14) {
    state.drops.push({
      id: `drop_${state.nextEntityId++}`,
      kind: 'potion',
      x: mob.x,
      y: mob.y,
      amount: 1,
    });
  }
  saveCombatRng(state, rng.getState());

  // On-kill relic hooks
  const derived = computeDerivedStats(state, data);
  for (const relicId of state.relics) {
    const relic = data.relicsById[relicId];
    if (!relic || relic.hook !== 'onKill') continue;
    if (relic.healRatio) {
      const heal = Math.max(1, Math.round(derived.maxHp * relic.healRatio));
      state.player.hp = Math.min(derived.maxHp, state.player.hp + heal);
      state.events.push({ type: 'heal', targetId: 'player', x: state.player.x, y: state.player.y, amount: heal });
    }
    if (relic.spRestore) {
      state.player.sp = Math.min(derived.maxSp, state.player.sp + relic.spRestore);
    }
    if (relic.novaRadius && relic.novaDamageRatio) {
      state.events.push({
        type: 'impact',
        x: mob.x,
        y: mob.y,
        radius: relic.novaRadius,
        element: relic.element,
        heavy: true,
      });
      const novaRaw = Math.max(derived.atk, derived.matk) * relic.novaDamageRatio;
      for (const other of state.mobs) {
        if (other.id === mob.id || other.hp <= 0) continue;
        if (Math.hypot(other.x - mob.x, other.y - mob.y) <= relic.novaRadius) {
          damageMob(state, data, other, novaRaw, relic.element, false, { allowRelics: false });
        }
      }
    }
  }

  // Kill chest trigger
  const chestThreshold = 12 + state.floorIndex * 4;
  if (!mob.isBoss && state.killsSinceChest >= chestThreshold) {
    state.killsSinceChest = 0;
    spawnAmberChestNearPlayer(state);
  }

  // Unlock boss victory (non-boss floors now advance automatically after clearing timed waves!)
  if (mob.isBoss) {
    state.stats.floorsCleared += 1;
    state.status = 'victory';
    state.paused = true;
    state.events.push({
      type: 'notice',
      x: mob.x,
      y: mob.y,
      text: '¡Spinosaurus Derrotado!',
      color: '#fde047',
    });
    state.events.push({ type: 'sfx', sfx: 'victory' });
  }
}

export function damagePlayer(
  state: GameState,
  data: GameData,
  rawDamage: number,
  element: ElementName,
  isPhysical: boolean,
  attacker?: MobEntity
): number {
  const player = state.player;
  if (player.hp <= 0 || player.invulnMs > 0) return 0;

  const cls = data.classesById[player.classId]!;
  const derived = computeDerivedStats(state, data);
  const elemMult = getElementMultiplier(data.elementMatrix, element, cls.element);
  const def = isPhysical ? derived.hardDef : derived.hardMdef;
  const softDef = isPhysical ? derived.softDef : derived.softMdef;

  let dealt = mitigateDamage(rawDamage * elemMult, def, softDef, isPhysical, 0);
  dealt = Math.max(1, Math.round(dealt * (1 - derived.damageReduction)));

  player.hp = Math.max(0, player.hp - dealt);
  player.hitFlashMs = 150;
  player.invulnMs = 260;
  state.stats.damageTaken += dealt;

  state.events.push({
    type: 'damage',
    targetId: 'player',
    x: player.x,
    y: player.y,
    amount: dealt,
    element,
    isCrit: false,
    isWeakness: elemMult >= 1.3,
    fromPlayer: false,
  });
  state.events.push({ type: 'sfx', sfx: 'hurt' });

  // Thorns / Bone Aegis / Trike Plate reflect
  if (attacker && attacker.hp > 0 && derived.thornsRatio > 0) {
    const reflect = Math.max(2, Math.round(dealt * derived.thornsRatio + derived.hardDef * 0.45));
    damageMob(state, data, attacker, reflect, 'Earth', true, { allowRelics: false });
  }

  if (player.hp <= 0) {
    state.status = 'defeat';
    state.paused = true;
    state.events.push({ type: 'sfx', sfx: 'death' });
  }
  return dealt;
}

function projectileVisual(skill: SkillDef): ProjectileEntity['visual'] {
  if (skill.sfx === 'bow') return 'arrow';
  if (skill.element === 'Fire') return 'fire';
  if (skill.element === 'Water') return 'water';
  if (skill.element === 'Venom') return 'venom';
  return 'wind';
}

function stepDashToTarget(
  state: GameState,
  fromX: number,
  fromY: number,
  dirX: number,
  dirY: number,
  maxDist: number
): { x: number; y: number } {
  const steps = Math.max(4, Math.ceil(maxDist * 3));
  let curX = fromX;
  let curY = fromY;
  for (let i = 1; i <= steps; i++) {
    const nx = fromX + dirX * (maxDist * (i / steps));
    const ny = fromY + dirY * (maxDist * (i / steps));
    if (!isWalkable(state.zone, nx, ny)) break;
    curX = nx;
    curY = ny;
  }
  return { x: curX, y: curY };
}

export function cast(
  state: GameState,
  data: GameData,
  casterId: 'player' | string,
  skillId: string,
  target: CastTarget
): CastResult {
  const skill = data.skillsById[skillId];
  if (!skill) return { ok: false, reason: 'unknown_skill', hits: 0, totalDamage: 0 };

  const fromPlayer = casterId === 'player';
  if (fromPlayer) {
    return castPlayerSkill(state, data, skill, target);
  }
  const mob = state.mobs.find((m) => m.id === casterId && m.hp > 0);
  if (!mob) return { ok: false, reason: 'missing_caster', hits: 0, totalDamage: 0 };
  return castMobSkill(state, data, mob, skill, target);
}

function castPlayerSkill(
  state: GameState,
  data: GameData,
  skill: SkillDef,
  target: CastTarget
): CastResult {
  const player = state.player;
  const cls = data.classesById[player.classId]!;
  const derived = computeDerivedStats(state, data);
  const isBasic = skill.id === cls.basicSkillId;

  if (isBasic) {
    if (player.basicCooldownMs > 0) return { ok: false, reason: 'cooldown', hits: 0, totalDamage: 0 };
  } else {
    if ((player.skillCooldowns[skill.id] ?? 0) > 0) {
      return { ok: false, reason: 'cooldown', hits: 0, totalDamage: 0 };
    }
    if (player.sp < skill.spCost) {
      return { ok: false, reason: 'no_sp', hits: 0, totalDamage: 0 };
    }
  }

  // Pay costs & set cooldowns
  player.sp = Math.max(0, player.sp - skill.spCost);
  if (isBasic) {
    player.basicCooldownMs = Math.round(1000 / derived.aspd);
  } else {
    player.skillCooldowns[skill.id] = Math.round(skill.cooldownMs * (1 - derived.cdr));
  }

  let dx = target.x - player.x;
  let dy = target.y - player.y;
  let dist = Math.hypot(dx, dy);
  if (dist < 0.01) {
    dx = player.facingX || 1;
    dy = player.facingY || 0;
    dist = Math.hypot(dx, dy) || 1;
  }
  const dirX = dx / dist;
  const dirY = dy / dist;
  player.facingX = dirX;
  player.facingY = dirY;
  const animDur = isBasic ? Math.min(340, Math.max(220, Math.round(920 / derived.aspd))) : 360;
  player.attackAnimDurationMs = animDur;
  player.attackAnimMs = animDur;

  const angle = Math.atan2(dirY, dirX);
  const powerMult = isBasic ? 1.0 : derived.skillPower;
  const baseStat = skill.isPhysical ? derived.atk : derived.matk;
  const skillMult = (skill.isPhysical ? skill.atkMult : skill.matkMult) ?? 1.0;
  const rawDamage = baseStat * skillMult * powerMult;

  state.events.push({ type: 'sfx', sfx: skill.sfx });

  let hits = 0;
  let totalDamage = 0;

  switch (skill.template) {
    case 'melee_arc': {
      const fromX = player.x;
      const fromY = player.y;
      const reach = skill.range * (isBasic ? 1 : derived.areaMult);
      const halfArc = (((skill.arcDeg ?? 110) * Math.PI) / 180) * 0.5;
      const hitCount = skill.hits ?? 1;

      state.events.push({
        type: 'slash',
        x: fromX,
        y: fromY,
        angle,
        radius: reach,
        element: skill.element,
        weaponType: cls.weaponType,
        fromPlayer: true,
      });

      for (const mob of [...state.mobs]) {
        if (mob.hp <= 0) continue;
        const mdx = mob.x - fromX;
        const mdy = mob.y - fromY;
        const md = Math.hypot(mdx, mdy);
        if (md > reach + 0.55) continue;
        const mAngle = Math.atan2(mdy, mdx);
        let diff = mAngle - angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (md > 0.9 && Math.abs(diff) > halfArc) continue;

        for (let h = 0; h < hitCount; h++) {
          if (mob.hp <= 0) break;
          const res = damageMob(state, data, mob, rawDamage, skill.element, skill.isPhysical, {
            ignoreDefRatio: skill.ignoreDefRatio,
            knockback: h === hitCount - 1 ? skill.knockback : 0,
            fromX,
            fromY,
            stunMs: skill.stunMs,
            bleedMs: skill.bleedMs,
          });
          hits += 1;
          totalDamage += res.dealt;
        }
      }
      if (skill.isUltimate) {
        state.events.push({
          type: 'impact',
          x: fromX + dirX * 2.2,
          y: fromY + dirY * 2.2,
          radius: reach * 0.75,
          element: skill.element,
          heavy: true,
        });
      }
      break;
    }

    case 'line_pierce': {
      // Triceratops growing horn-lances thrust (Jarvan IV Q style): pierces ALL mobs along the line!
      const levelBonus = (player.level - 1) * (skill.rangePerLevel ?? 0);
      const reach =
        (skill.range + levelBonus) * derived.hornRangeMult * (isBasic ? 1 + (derived.areaMult - 1) * 0.5 : derived.areaMult);
      const endX = player.x + dirX * reach;
      const endY = player.y + dirY * reach;
      const halfWidth = (skill.lineWidth ?? 0.9) * 0.55 + Math.min(0.35, (player.level - 1) * 0.03);
      const pierceRatio = Math.min(0.65, (skill.ignoreDefRatio ?? 0.3) + (player.level - 1) * 0.02);

      state.events.push({
        type: 'horn_thrust',
        x: player.x,
        y: player.y,
        endX,
        endY,
        angle,
        length: reach,
        level: player.level,
        element: skill.element,
      });

      for (const mob of [...state.mobs]) {
        if (mob.hp <= 0) continue;
        const rx = mob.x - player.x;
        const ry = mob.y - player.y;
        const along = rx * dirX + ry * dirY;
        const mobPad = mob.isBoss ? 0.95 : 0.48;
        if (along < -0.25 || along > reach + mobPad) continue;
        const perp = Math.abs(rx * -dirY + ry * dirX);
        if (perp > halfWidth + mobPad) continue;

        const res = damageMob(state, data, mob, rawDamage, skill.element, skill.isPhysical, {
          ignoreDefRatio: pierceRatio,
          knockback: skill.knockback,
          stunMs: skill.stunMs,
          bleedMs: skill.bleedMs,
        });
        hits += 1;
        totalDamage += res.dealt;
      }
      break;
    }

    case 'leap_slam': {
      const startX = player.x;
      const startY = player.y;
      const leapDist = Math.min(skill.range, dist);
      const dest = stepDashToTarget(state, startX, startY, dirX, dirY, leapDist);
      player.x = dest.x;
      player.y = dest.y;
      player.leapAnimMs = 300;
      state.events.push({ type: 'sfx', sfx: 'dash' });
      state.events.push({
        type: 'dash_trail',
        fromX: startX,
        fromY: startY,
        toX: dest.x,
        toY: dest.y,
        spriteId: cls.spriteId,
        element: skill.element,
      });
      const radius = (skill.radius ?? 2.3) * derived.areaMult;
      state.events.push({ type: 'impact', x: dest.x, y: dest.y, radius, element: skill.element, heavy: true });
      state.events.push({
        type: 'slash',
        x: dest.x,
        y: dest.y,
        angle,
        radius: radius * 1.15,
        element: skill.element,
        weaponType: cls.weaponType,
        fromPlayer: true,
      });

      for (const mob of [...state.mobs]) {
        if (mob.hp <= 0) continue;
        if (Math.hypot(mob.x - dest.x, mob.y - dest.y) <= radius + 0.45) {
          const res = damageMob(state, data, mob, rawDamage, skill.element, skill.isPhysical, {
            knockback: skill.knockback,
            fromX: dest.x,
            fromY: dest.y,
            stunMs: skill.stunMs,
          });
          hits += 1;
          totalDamage += res.dealt;
        }
      }
      break;
    }

    case 'dash_slash': {
      const startX = player.x;
      const startY = player.y;
      const dest = stepDashToTarget(state, startX, startY, dirX, dirY, skill.range);
      player.x = dest.x;
      player.y = dest.y;
      player.invulnMs = Math.max(player.invulnMs, 260);
      state.events.push({ type: 'sfx', sfx: 'dash' });
      state.events.push({
        type: 'dash_trail',
        fromX: startX,
        fromY: startY,
        toX: dest.x,
        toY: dest.y,
        spriteId: cls.spriteId,
        element: skill.element,
      });
      const hitRadius = (skill.radius ?? 1.2) * derived.areaMult;

      state.events.push({
        type: 'slash',
        x: (startX + dest.x) * 0.5,
        y: (startY + dest.y) * 0.5,
        angle,
        radius: Math.max(2.0, Math.hypot(dest.x - startX, dest.y - startY) * 0.65),
        element: skill.element,
        weaponType: cls.weaponType,
        fromPlayer: true,
      });

      const segLen = Math.hypot(dest.x - startX, dest.y - startY) || 1;
      for (const mob of [...state.mobs]) {
        if (mob.hp <= 0) continue;
        const proj = Math.max(
          0,
          Math.min(segLen, ((mob.x - startX) * (dest.x - startX) + (mob.y - startY) * (dest.y - startY)) / segLen)
        );
        const cx = startX + ((dest.x - startX) / segLen) * proj;
        const cy = startY + ((dest.y - startY) / segLen) * proj;
        if (Math.hypot(mob.x - cx, mob.y - cy) <= hitRadius + 0.45) {
          const res = damageMob(state, data, mob, rawDamage, skill.element, skill.isPhysical, {
            knockback: skill.knockback,
            fromX: dest.x,
            fromY: dest.y,
            stunMs: skill.stunMs,
            bleedMs: skill.bleedMs,
          });
          hits += 1;
          totalDamage += res.dealt;
        }
      }
      if (skill.buffId && skill.buffDurationMs) {
        addPlayerBuff(state, skill.buffId, skill.buffDurationMs);
      }
      if (skill.isUltimate) {
        state.events.push({
          type: 'impact',
          x: dest.x,
          y: dest.y,
          radius: hitRadius * 1.65,
          element: skill.element,
          heavy: true,
        });
      }
      break;
    }

    case 'ultimate_flurry': {
      // Velociraptor Ultimate: Danza de los Mil Cortes — invulnerable + 7 guaranteed-crit chain slashes!
      const totalHits = skill.hits ?? 7;
      const searchRange = skill.range * derived.areaMult;
      player.invulnMs = Math.max(player.invulnMs, 1500);
      const fromX = player.x;
      const fromY = player.y;
      let curX = fromX;
      let curY = fromY;

      for (let step = 0; step < totalHits; step++) {
        const candidates = state.mobs.filter(
          (m) => m.hp > 0 && Math.hypot(m.x - fromX, m.y - fromY) <= searchRange
        );
        if (candidates.length === 0) break;
        const picked = candidates[step % candidates.length]!;
        state.events.push({
          type: 'dash_trail',
          fromX: curX,
          fromY: curY,
          toX: picked.x,
          toY: picked.y,
          spriteId: cls.spriteId,
          element: skill.element,
        });
        state.events.push({
          type: 'slash',
          x: picked.x,
          y: picked.y,
          angle: Math.atan2(picked.y - curY, picked.x - curX),
          radius: 2.2,
          element: skill.element,
          weaponType: cls.weaponType,
          fromPlayer: true,
        });
        curX = picked.x;
        curY = picked.y;
        const res = damageMob(state, data, picked, rawDamage, skill.element, skill.isPhysical, {
          forceCrit: true,
          bleedMs: skill.bleedMs,
        });
        hits += 1;
        totalDamage += res.dealt;
      }
      state.events.push({ type: 'sfx', sfx: 'dash' });
      state.events.push({ type: 'impact', x: curX, y: curY, radius: 2.5, element: skill.element, heavy: true });
      break;
    }

    case 'nova': {
      const fromX = player.x;
      const fromY = player.y;
      const radius = (skill.radius ?? 3.0) * derived.areaMult;
      state.events.push({ type: 'impact', x: fromX, y: fromY, radius, element: skill.element, heavy: true });
      if (skill.buffId && skill.buffDurationMs) {
        addPlayerBuff(state, skill.buffId, skill.buffDurationMs);
      }
      for (const mob of [...state.mobs]) {
        if (mob.hp <= 0) continue;
        if (Math.hypot(mob.x - fromX, mob.y - fromY) <= radius + 0.45) {
          const res = damageMob(state, data, mob, rawDamage, skill.element, skill.isPhysical, {
            knockback: skill.knockback,
            fromX,
            fromY,
            stunMs: skill.stunMs,
          });
          hits += 1;
          totalDamage += res.dealt;
        }
      }
      break;
    }

    case 'self_buff': {
      if (skill.buffId && skill.buffDurationMs) {
        addPlayerBuff(state, skill.buffId, skill.buffDurationMs);
      }
      if (skill.healRatio) {
        const heal = Math.round(derived.maxHp * skill.healRatio);
        player.hp = Math.min(derived.maxHp, player.hp + heal);
        state.events.push({ type: 'heal', targetId: 'player', x: player.x, y: player.y, amount: heal });
      }
      state.events.push({
        type: 'impact',
        x: player.x,
        y: player.y,
        radius: 1.6,
        element: skill.element,
        heavy: false,
      });
      break;
    }

    case 'projectile': {
      const speed = skill.speed ?? 12;
      state.projectiles.push({
        id: `proj_${state.nextEntityId++}`,
        ownerId: 'player',
        fromPlayer: true,
        skillId: skill.id,
        element: skill.element,
        x: player.x + dirX * 0.45,
        y: player.y + dirY * 0.45,
        vx: dirX * speed,
        vy: dirY * speed,
        radius: skill.radius ?? 0.5,
        remainingDist: skill.range,
        damage: rawDamage,
        isPhysical: skill.isPhysical,
        isCrit: false,
        pierce: Boolean(skill.pierce),
        splashRadius: (skill.splashRadius ?? 0) * derived.areaMult,
        ignoreDefRatio: skill.ignoreDefRatio ?? 0,
        hitIds: [],
        visual: projectileVisual(skill),
      });
      break;
    }

    case 'volley': {
      const count = (skill.count ?? 3) + derived.extraProjectiles;
      const isFullCircle = (skill.spreadDeg ?? 32) >= 350;
      const spreadRad = ((skill.spreadDeg ?? 32) * Math.PI) / 180;
      const speed = skill.speed ?? 14;
      for (let i = 0; i < count; i++) {
        const a = isFullCircle
          ? angle + (i / count) * Math.PI * 2
          : angle + (count === 1 ? 0 : i / (count - 1) - 0.5) * spreadRad;
        state.projectiles.push({
          id: `proj_${state.nextEntityId++}`,
          ownerId: 'player',
          fromPlayer: true,
          skillId: skill.id,
          element: skill.element,
          x: player.x + Math.cos(a) * 0.45,
          y: player.y + Math.sin(a) * 0.45,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          radius: skill.radius ?? 0.45,
          remainingDist: skill.range,
          damage: rawDamage,
          isPhysical: skill.isPhysical,
          isCrit: false,
          pierce: Boolean(skill.pierce),
          splashRadius: 0,
          ignoreDefRatio: skill.ignoreDefRatio ?? 0,
          hitIds: [],
          visual: projectileVisual(skill),
        });
      }
      if (skill.buffId && skill.buffDurationMs) {
        addPlayerBuff(state, skill.buffId, skill.buffDurationMs);
      }
      break;
    }

    case 'ground_aoe': {
      const clampedDist = Math.min(skill.range, dist);
      const tx = player.x + dirX * clampedDist;
      const ty = player.y + dirY * clampedDist;
      const radius = (skill.radius ?? 2.6) * derived.areaMult;
      state.telegraphs.push({
        id: `tele_${state.nextEntityId++}`,
        ownerId: 'player',
        fromPlayer: true,
        skillId: skill.id,
        element: skill.element,
        x: tx,
        y: ty,
        radius,
        elapsedMs: 0,
        durationMs: 280,
        damage: rawDamage,
        isPhysical: skill.isPhysical,
        stunMs: skill.stunMs ?? 0,
        leapOwner: false,
        wavesRemaining: skill.waves ?? 3,
        waveIntervalMs: skill.waveIntervalMs ?? 420,
      });
      break;
    }

    case 'evade_shot': {
      // Blast in front, then vault backwards safely!
      const blastX = player.x + dirX * 1.4;
      const blastY = player.y + dirY * 1.4;
      const radius = (skill.radius ?? 2.2) * derived.areaMult;
      state.events.push({ type: 'impact', x: blastX, y: blastY, radius, element: skill.element, heavy: false });
      for (const mob of [...state.mobs]) {
        if (mob.hp <= 0) continue;
        if (Math.hypot(mob.x - blastX, mob.y - blastY) <= radius + 0.5) {
          const res = damageMob(state, data, mob, rawDamage, skill.element, skill.isPhysical, {
            knockback: skill.knockback ?? 1.2,
            fromX: player.x,
            fromY: player.y,
          });
          hits += 1;
          totalDamage += res.dealt;
        }
      }
      const startX = player.x;
      const startY = player.y;
      const dest = stepDashToTarget(state, startX, startY, -dirX, -dirY, skill.range);
      player.x = dest.x;
      player.y = dest.y;
      player.invulnMs = Math.max(player.invulnMs, 300);
      state.events.push({ type: 'sfx', sfx: 'dash' });
      state.events.push({
        type: 'dash_trail',
        fromX: startX,
        fromY: startY,
        toX: dest.x,
        toY: dest.y,
        spriteId: cls.spriteId,
        element: skill.element,
      });
      if (skill.buffId && skill.buffDurationMs) {
        addPlayerBuff(state, skill.buffId, skill.buffDurationMs);
      }
      break;
    }

    default:
      break;
  }

  return { ok: true, hits, totalDamage };
}

function castMobSkill(
  state: GameState,
  data: GameData,
  mob: MobEntity,
  skill: SkillDef,
  target: CastTarget
): CastResult {
  if ((mob.cooldowns[skill.id] ?? 0) > 0) return { ok: false, reason: 'cooldown', hits: 0, totalDamage: 0 };

  const mobDef = data.mobsById[mob.mobId]!;
  const eliteMult = mob.isElite ? 1.35 : 1.0;
  const phaseMult = mob.isBoss && mob.bossPhase === 2 ? 1.18 : 1.0;
  const cdMult = mob.isBoss && mob.bossPhase === 2 ? 0.78 : 1.0;
  mob.cooldowns[skill.id] = Math.round(skill.cooldownMs * cdMult);

  let dx = target.x - mob.x;
  let dy = target.y - mob.y;
  const dist = Math.hypot(dx, dy) || 1;
  dx /= dist;
  dy /= dist;
  mob.facingX = dx;
  mob.facingY = dy;
  mob.attackAnimDurationMs = mob.isBoss ? 400 : 340;
  mob.attackAnimMs = mob.attackAnimDurationMs;
  // This is presentation metadata only. Damage, hitboxes and cooldowns stay
  // exclusively in the template switch below.
  mob.attackSkillId = skill.id;

  const base = (skill.isPhysical ? mobDef.atk : mobDef.matk) * eliteMult * phaseMult;
  const mult = (skill.isPhysical ? skill.atkMult : skill.matkMult) ?? 1.0;
  const rawDamage = base * mult;

  state.events.push({ type: 'sfx', sfx: skill.sfx });

  let hits = 0;
  let totalDamage = 0;

  switch (skill.template) {
    case 'melee_arc': {
      state.events.push({
        type: 'slash',
        x: mob.x,
        y: mob.y,
        angle: Math.atan2(dy, dx),
        radius: skill.range,
        element: skill.element,
        fromPlayer: false,
      });
      const pd = Math.hypot(state.player.x - mob.x, state.player.y - mob.y);
      if (pd <= skill.range + 0.55) {
        const dealt = damagePlayer(state, data, rawDamage, skill.element, skill.isPhysical, mob);
        if (dealt > 0) {
          hits = 1;
          totalDamage = dealt;
        }
      }
      break;
    }

    case 'projectile': {
      const speed = skill.speed ?? 9;
      state.projectiles.push({
        id: `proj_${state.nextEntityId++}`,
        ownerId: mob.id,
        fromPlayer: false,
        skillId: skill.id,
        element: skill.element,
        x: mob.x + dx * 0.5,
        y: mob.y + dy * 0.5,
        vx: dx * speed,
        vy: dy * speed,
        radius: skill.radius ?? 0.5,
        remainingDist: skill.range,
        damage: rawDamage,
        isPhysical: skill.isPhysical,
        isCrit: false,
        pierce: false,
        splashRadius: 0,
        ignoreDefRatio: 0,
        hitIds: [],
        visual: projectileVisual(skill),
      });
      break;
    }

    case 'volley': {
      const count = skill.count ?? 3;
      const spreadRad = ((skill.spreadDeg ?? 28) * Math.PI) / 180;
      const speed = skill.speed ?? 10;
      const baseAngle = Math.atan2(dy, dx);
      for (let i = 0; i < count; i++) {
        const frac = count === 1 ? 0 : i / (count - 1) - 0.5;
        const a = baseAngle + frac * spreadRad;
        state.projectiles.push({
          id: `proj_${state.nextEntityId++}`,
          ownerId: mob.id,
          fromPlayer: false,
          skillId: skill.id,
          element: skill.element,
          x: mob.x + Math.cos(a) * 0.6,
          y: mob.y + Math.sin(a) * 0.6,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          radius: skill.radius ?? 0.6,
          remainingDist: skill.range,
          damage: rawDamage,
          isPhysical: skill.isPhysical,
          isCrit: false,
          pierce: false,
          splashRadius: 0,
          ignoreDefRatio: 0,
          hitIds: [],
          visual: projectileVisual(skill),
        });
      }
      break;
    }

    case 'telegraph_aoe': {
      const rings = skill.multiRing ?? 1;
      for (let r = 0; r < rings; r++) {
        const offsetAngle = (r / rings) * Math.PI * 2;
        const offDist = rings > 1 && r > 0 ? 2.4 : 0;
        const tx = target.x + Math.cos(offsetAngle) * offDist;
        const ty = target.y + Math.sin(offsetAngle) * offDist;
        state.telegraphs.push({
          id: `tele_${state.nextEntityId++}`,
          ownerId: mob.id,
          fromPlayer: false,
          skillId: skill.id,
          element: skill.element,
          x: tx,
          y: ty,
          radius: skill.radius ?? 2.3,
          elapsedMs: 0,
          durationMs: skill.telegraphMs ?? 950,
          damage: rawDamage,
          isPhysical: skill.isPhysical,
          stunMs: 0,
          leapOwner: Boolean(skill.leapToTarget && r === 0),
          wavesRemaining: 1,
          waveIntervalMs: 0,
        });
      }
      break;
    }

    default:
      break;
  }

  return { ok: true, hits, totalDamage };
}
