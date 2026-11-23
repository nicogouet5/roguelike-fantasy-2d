import { enqueueOffer, spawnAmberChestNearPlayer } from './boons.ts';
import type { GameData } from './data.ts';
import { getElementMultiplier } from './elements.ts';
import { isWalkable } from './mapGen.ts';
import { createRng } from './rng.ts';
import { computeDerivedStats, expRequiredForLevel, mitigateDamage } from './stats.ts';
import type {
  BuffId,
  CastResult,
  CastTarget,
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

export function findNearestMob(state: GameState, maxRange = Infinity): MobEntity | null {
  let best: MobEntity | null = null;
  let bestDist = maxRange;
  for (const mob of state.mobs) {
    if (mob.hp <= 0) continue;
    const d = Math.hypot(mob.x - state.player.x, mob.y - state.player.y);
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

  const scaledRaw = rawDamage * elemMult * critMult * bleedBonusMult * variance;
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

    // Crit Chain Lightning capstone (Tormenta Crítica)
    if (isCrit && derived.critLightningRatio > 0) {
      let chainTarget: MobEntity | null = null;
      let chainDist = 4.8;
      for (const other of state.mobs) {
        if (other.id === mob.id || other.hp <= 0) continue;
        const d = Math.hypot(other.x - mob.x, other.y - mob.y);
        if (d <= chainDist) {
          chainDist = d;
          chainTarget = other;
        }
      }
      if (chainTarget) {
        state.events.push({
          type: 'lightning_arc',
          fromX: mob.x,
          fromY: mob.y,
          toX: chainTarget.x,
          toY: chainTarget.y,
        });
        state.events.push({ type: 'sfx', sfx: 'wind' });
        damageMob(state, data, chainTarget, dealt * derived.critLightningRatio, 'Wind', false, {
          allowRelics: false,
        });
      }
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
    return { dealt, killed: true, isCrit };
  }
  return { dealt, killed: false, isCrit };
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
  });

  // Drops
  const rng = nextCombatRng(state);
  if (mob.isElite || rng.next() < 0.22) {
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
  const mapDef = data.mapsByFloor[state.floorIndex]!;
  const chestThreshold = 12 + state.floorIndex * 4;
  if (!mob.isBoss && state.killsSinceChest >= chestThreshold) {
    state.killsSinceChest = 0;
    spawnAmberChestNearPlayer(state);
  }

  // Unlock zone portal or victory
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
  } else if (!state.portalUnlocked && state.zoneKills >= mapDef.targetKills) {
    state.portalUnlocked = true;
    state.events.push({
      type: 'notice',
      x: state.player.x,
      y: state.player.y,
      text: '¡Portal Abierto! Avanza al este',
      color: '#38bdf8',
    });
    state.events.push({ type: 'sfx', sfx: 'portal' });
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
      const reach = skill.range * (isBasic ? 1 : derived.areaMult);
      const halfArc = (((skill.arcDeg ?? 110) * Math.PI) / 180) * 0.5;
      const hitCount = skill.hits ?? 1;

      state.events.push({
        type: 'slash',
        x: player.x,
        y: player.y,
        angle,
        radius: reach,
        element: skill.element,
        weaponType: cls.weaponType,
        fromPlayer: true,
      });

      for (const mob of [...state.mobs]) {
        if (mob.hp <= 0) continue;
        const mdx = mob.x - player.x;
        const mdy = mob.y - player.y;
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
            knockback: h === hitCount - 1 ? skill.knockback : 0,
            stunMs: skill.stunMs,
            bleedMs: skill.bleedMs,
          });
          hits += 1;
          totalDamage += res.dealt;
        }
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
      state.events.push({ type: 'impact', x: player.x, y: player.y, radius, element: skill.element, heavy: true });
      state.events.push({
        type: 'slash',
        x: player.x,
        y: player.y,
        angle,
        radius: radius * 1.15,
        element: skill.element,
        weaponType: cls.weaponType,
        fromPlayer: true,
      });

      for (const mob of [...state.mobs]) {
        if (mob.hp <= 0) continue;
        if (Math.hypot(mob.x - player.x, mob.y - player.y) <= radius + 0.45) {
          const res = damageMob(state, data, mob, rawDamage, skill.element, skill.isPhysical, {
            knockback: skill.knockback,
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
            stunMs: skill.stunMs,
            bleedMs: skill.bleedMs,
          });
          hits += 1;
          totalDamage += res.dealt;
        }
      }
      break;
    }

    case 'nova': {
      const radius = (skill.radius ?? 3.0) * derived.areaMult;
      state.events.push({ type: 'impact', x: player.x, y: player.y, radius, element: skill.element, heavy: true });
      if (skill.buffId && skill.buffDurationMs) {
        addPlayerBuff(state, skill.buffId, skill.buffDurationMs);
      }
      for (const mob of [...state.mobs]) {
        if (mob.hp <= 0) continue;
        if (Math.hypot(mob.x - player.x, mob.y - player.y) <= radius + 0.45) {
          const res = damageMob(state, data, mob, rawDamage, skill.element, skill.isPhysical, {
            knockback: skill.knockback,
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
      const spreadRad = ((skill.spreadDeg ?? 32) * Math.PI) / 180;
      const speed = skill.speed ?? 14;
      for (let i = 0; i < count; i++) {
        const frac = count === 1 ? 0 : i / (count - 1) - 0.5;
        const a = angle + frac * spreadRad;
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
