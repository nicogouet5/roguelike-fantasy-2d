import type { GameData } from './data.ts';
import { isWalkable } from './mapGen.ts';
import { cast } from './skills.ts';
import type { GameState, MobEntity } from './types.ts';

function moveMobTowards(state: GameState, mob: MobEntity, dirX: number, dirY: number, speed: number, dtSec: number): void {
  const len = Math.hypot(dirX, dirY);
  if (len < 0.001) return;
  const nx = dirX / len;
  const ny = dirY / len;
  mob.facingX = nx;
  mob.facingY = ny;

  const candX = mob.x + nx * speed * dtSec;
  const candY = mob.y + ny * speed * dtSec;
  if (isWalkable(state.zone, candX, candY)) {
    mob.x = candX;
    mob.y = candY;
    mob.vx = nx * speed;
    mob.vy = ny * speed;
  } else if (isWalkable(state.zone, candX, mob.y)) {
    mob.x = candX;
    mob.vx = nx * speed;
    mob.vy = 0;
  } else if (isWalkable(state.zone, mob.x, candY)) {
    mob.y = candY;
    mob.vx = 0;
    mob.vy = ny * speed;
  } else {
    // Slide around obstacles/pillars so chasing mobs never stall on corners
    const px = -ny;
    const py = nx;
    const alt1X = mob.x + px * speed * dtSec;
    const alt1Y = mob.y + py * speed * dtSec;
    const alt2X = mob.x - px * speed * dtSec;
    const alt2Y = mob.y - py * speed * dtSec;
    if (isWalkable(state.zone, alt1X, alt1Y)) {
      mob.x = alt1X;
      mob.y = alt1Y;
      mob.vx = px * speed;
      mob.vy = py * speed;
    } else if (isWalkable(state.zone, alt2X, alt2Y)) {
      mob.x = alt2X;
      mob.y = alt2Y;
      mob.vx = -px * speed;
      mob.vy = -py * speed;
    } else {
      mob.vx = 0;
      mob.vy = 0;
    }
  }
}

export function spawnMob(
  state: GameState,
  data: GameData,
  mobId: string,
  x: number,
  y: number,
  isElite = false
): MobEntity {
  const def = data.mobsById[mobId]!;
  const maxHp = Math.round(def.maxHp * (isElite ? 2.1 : 1.0));
  const mob: MobEntity = {
    id: `mob_${state.nextEntityId++}`,
    mobId,
    x,
    y,
    vx: 0,
    vy: 0,
    facingX: -1,
    facingY: 0,
    hp: maxHp,
    maxHp,
    isElite: Boolean(isElite && !def.isBoss),
    isBoss: Boolean(def.isBoss),
    bossPhase: 1,
    cooldowns: {},
    stunMs: 0,
    bleedMs: 0,
    bleedTickMs: 0,
    bleedDps: 0,
    hitFlashMs: 0,
    attackAnimMs: 0,
    attackAnimDurationMs: 360,
    wanderTimerMs: 0,
    wanderDirX: 0,
    wanderDirY: 0,
  };
  state.mobs.push(mob);
  return mob;
}

export function stepMobsAi(state: GameState, data: GameData, dtMs: number): void {
  const dtSec = dtMs / 1000;

  for (const mob of [...state.mobs]) {
    if (mob.hp <= 0) continue;
    const def = data.mobsById[mob.mobId]!;

    // Decay timers
    if (mob.hitFlashMs > 0) mob.hitFlashMs = Math.max(0, mob.hitFlashMs - dtMs);
    if (mob.attackAnimMs > 0) mob.attackAnimMs = Math.max(0, mob.attackAnimMs - dtMs);
    for (const sid of Object.keys(mob.cooldowns)) {
      const rem = (mob.cooldowns[sid] ?? 0) - dtMs;
      if (rem <= 0) delete mob.cooldowns[sid];
      else mob.cooldowns[sid] = rem;
    }

    // Bleed DoT
    if (mob.bleedMs > 0) {
      mob.bleedMs = Math.max(0, mob.bleedMs - dtMs);
      mob.bleedTickMs += dtMs;
      if (mob.bleedTickMs >= 500) {
        mob.bleedTickMs -= 500;
        const bleedDmg = Math.max(2, Math.round(mob.bleedDps * 0.5));
        mob.hp = Math.max(1, mob.hp - bleedDmg);
        state.stats.damageDealt += bleedDmg;
        state.events.push({
          type: 'damage',
          targetId: mob.id,
          x: mob.x,
          y: mob.y,
          amount: bleedDmg,
          element: 'Venom',
          isCrit: false,
          isWeakness: false,
          fromPlayer: true,
        });
      }
    }

    if (mob.stunMs > 0) {
      mob.stunMs = Math.max(0, mob.stunMs - dtMs);
      mob.vx = 0;
      mob.vy = 0;
      continue;
    }

    // Boss Phase 2 transition (<50% HP)
    if (mob.isBoss && mob.bossPhase === 1 && mob.hp <= mob.maxHp * 0.5) {
      mob.bossPhase = 2;
      state.events.push({ type: 'boss_phase', phase: 2 });
      state.events.push({ type: 'sfx', sfx: 'boss_phase' });
      state.events.push({
        type: 'notice',
        x: mob.x,
        y: mob.y,
        text: '¡FASE 2: FURIA ABISAL!',
        color: '#f87171',
      });

      if (!mob.summonedPhase2) {
        mob.summonedPhase2 = true;
        for (let i = 0; i < 4; i++) {
          const angle = (i / 4) * Math.PI * 2;
          const sx = mob.x + Math.cos(angle) * 3.0;
          const sy = mob.y + Math.sin(angle) * 3.0;
          if (isWalkable(state.zone, sx, sy)) {
            spawnMob(state, data, i % 2 === 0 ? 'wild_raptor' : 'compsognathus', sx, sy, false);
          }
        }
      }
    }

    const dx = state.player.x - mob.x;
    const dy = state.player.y - mob.y;
    const dist = Math.hypot(dx, dy);

    // Global aggro + anti-stuck off-screen flank: if a non-boss mob gets stuck far behind walls,
    // reposition it to a walkable flanking spot around the player so you never hunt stragglers.
    if (!mob.isBoss) {
      const blockedFar = dist > 20 || (dist > def.attackRange + 1.5 && Math.hypot(mob.vx, mob.vy) < 0.05);
      if (blockedFar) {
        mob.wanderTimerMs += dtMs;
        if (mob.wanderTimerMs >= 2600) {
          mob.wanderTimerMs = 0;
          const baseAngle = ((Number(mob.id.replace(/\D/g, '')) || 1) * 1.618 + state.stats.elapsedMs * 0.001) % (Math.PI * 2);
          for (let step = 0; step < 12; step++) {
            const a = baseAngle + (step * Math.PI) / 6;
            const fx = state.player.x + Math.cos(a) * 10.5;
            const fy = state.player.y + Math.sin(a) * 10.5;
            if (isWalkable(state.zone, fx, fy)) {
              mob.x = fx;
              mob.y = fy;
              break;
            }
          }
        }
      } else {
        mob.wanderTimerMs = 0;
      }
    }

    // Soft separation from other mobs so packs spread naturally
    let sepX = 0;
    let sepY = 0;
    for (const other of state.mobs) {
      if (other.id === mob.id || other.hp <= 0) continue;
      const ox = mob.x - other.x;
      const oy = mob.y - other.y;
      const od = Math.hypot(ox, oy);
      if (od > 0.01 && od < 1.1) {
        sepX += (ox / od) * (1.1 - od);
        sepY += (oy / od) * (1.1 - od);
      }
    }

    const speed = def.moveSpeed * (mob.isBoss && mob.bossPhase === 2 ? 1.24 : 1.0);

    // Boss AI: rotate signature skills
    if (mob.isBoss) {
      let casted = false;
      const aim = { x: state.player.x, y: state.player.y };
      if (mob.bossPhase === 2 && !mob.cooldowns['boss_maelstrom'] && dist <= 6.0) {
        casted = cast(state, data, mob.id, 'boss_maelstrom', aim).ok;
      }
      if (!casted && mob.bossPhase === 2 && !mob.cooldowns['boss_ember_surge'] && dist >= 3.0 && dist <= 9.5) {
        casted = cast(state, data, mob.id, 'boss_ember_surge', aim).ok;
      }
      if (!casted && mob.bossPhase === 2 && !mob.cooldowns['boss_cross_rend'] && dist <= 8.2) {
        casted = cast(state, data, mob.id, 'boss_cross_rend', { x: state.player.x, y: state.player.y }).ok;
      }
      if (!casted && !mob.cooldowns['boss_riptide_chain'] && dist >= 2.5 && dist <= 9.0) {
        casted = cast(state, data, mob.id, 'boss_riptide_chain', aim).ok;
      }
      if (!casted && !mob.cooldowns['boss_tidal_barrage'] && dist >= 4.0 && dist <= 10.0) {
        casted = cast(state, data, mob.id, 'boss_tidal_barrage', aim).ok;
      }
      if (!casted && !mob.cooldowns['boss_abyssal_leap'] && dist >= 3.2 && dist <= 7.8) {
        casted = cast(state, data, mob.id, 'boss_abyssal_leap', { x: state.player.x, y: state.player.y }).ok;
      }
      if (!casted && !mob.cooldowns['boss_hydro_wave'] && dist >= 2.8 && dist <= 8.8) {
        casted = cast(state, data, mob.id, 'boss_hydro_wave', { x: state.player.x, y: state.player.y }).ok;
      }
      if (!casted && dist <= def.attackRange && !mob.cooldowns['boss_odachi_cleave']) {
        casted = cast(state, data, mob.id, 'boss_odachi_cleave', { x: state.player.x, y: state.player.y }).ok;
      }
      if (!casted && dist > def.attackRange * 0.85) {
        moveMobTowards(state, mob, dx + sepX, dy + sepY, speed, dtSec);
      }
      continue;
    }

    // Ranged mobs keep comfortable distance
    if (def.aiProfile === 'ranged') {
      if (dist < 3.4) {
        moveMobTowards(state, mob, -dx + sepX, -dy + sepY, speed, dtSec);
      } else if (dist > def.attackRange * 0.92) {
        moveMobTowards(state, mob, dx + sepX, dy + sepY, speed, dtSec);
      } else {
        mob.vx = 0;
        mob.vy = 0;
      }
      if (dist <= def.attackRange) {
        cast(state, data, mob.id, def.skillIds[0]!, { x: state.player.x, y: state.player.y });
      }
      continue;
    }

    // Melee / charger / juggernaut
    if (def.skillIds.length > 1 && dist <= 3.0) {
      const heavySkill = def.skillIds[1]!;
      if (!mob.cooldowns[heavySkill]) {
        cast(state, data, mob.id, heavySkill, { x: state.player.x, y: state.player.y });
        continue;
      }
    }

    if (dist <= def.attackRange) {
      mob.vx = 0;
      mob.vy = 0;
      cast(state, data, mob.id, def.skillIds[0]!, { x: state.player.x, y: state.player.y });
    } else {
      moveMobTowards(state, mob, dx + sepX * 1.4, dy + sepY * 1.4, speed, dtSec);
    }
  }
}
