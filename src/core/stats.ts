import type { GameData } from './data.ts';
import type { BoonMods, DerivedStats, GameState } from './types.ts';

export function expRequiredForLevel(level: number): number {
  return Math.round(70 + (level - 1) * 48 + Math.pow(level - 1, 1.55) * 18);
}

function accumulateMods(target: Required<BoonMods>, mods: BoonMods, mult = 1): void {
  if (mods.atkPct) target.atkPct += mods.atkPct * mult;
  if (mods.matkPct) target.matkPct += mods.matkPct * mult;
  if (mods.aspdPct) target.aspdPct += mods.aspdPct * mult;
  if (mods.moveSpeedPct) target.moveSpeedPct += mods.moveSpeedPct * mult;
  if (mods.maxHpPct) target.maxHpPct += mods.maxHpPct * mult;
  if (mods.maxSpPct) target.maxSpPct += mods.maxSpPct * mult;
  if (mods.flatDef) target.flatDef += mods.flatDef * mult;
  if (mods.spRegen) target.spRegen += mods.spRegen * mult;
  if (mods.cdrPct) target.cdrPct += mods.cdrPct * mult;
  if (mods.critChance) target.critChance += mods.critChance * mult;
  if (mods.critDamage) target.critDamage += mods.critDamage * mult;
  if (mods.lifesteal) target.lifesteal += mods.lifesteal * mult;
  if (mods.ignoreDef) target.ignoreDef += mods.ignoreDef * mult;
  if (mods.skillPowerPct) target.skillPowerPct += mods.skillPowerPct * mult;
  if (mods.areaPct) target.areaPct += mods.areaPct * mult;
  if (mods.extraProjectiles) target.extraProjectiles += mods.extraProjectiles * mult;
}

export function computeDerivedStats(state: GameState, data: GameData): DerivedStats {
  const player = state.player;
  const cls = data.classesById[player.classId]!;
  const mods: Required<BoonMods> = {
    atkPct: 0,
    matkPct: 0,
    aspdPct: 0,
    moveSpeedPct: 0,
    maxHpPct: 0,
    maxSpPct: 0,
    flatDef: 0,
    spRegen: 0,
    cdrPct: 0,
    critChance: 0,
    critDamage: 0,
    lifesteal: 0,
    ignoreDef: 0,
    skillPowerPct: 0,
    areaPct: 0,
    extraProjectiles: 0,
  };

  for (const [boonId, rank] of Object.entries(state.boonRanks)) {
    const boon = data.boonsById[boonId];
    if (boon && rank > 0) accumulateMods(mods, boon.mods, rank);
  }
  for (const relicId of state.relics) {
    const relic = data.relicsById[relicId];
    if (relic) accumulateMods(mods, relic.statMods, 1);
  }

  let buffAtkPct = 0;
  let buffAspdPct = 0;
  let buffSpeedPct = 0;
  let buffCrit = 0;
  let damageReduction = 0;
  let thornsRatio = 0;

  for (const buff of player.buffs) {
    if (buff.remainingMs <= 0) continue;
    switch (buff.id) {
      case 'tyrant_fury':
        buffAtkPct += 0.35;
        buffSpeedPct += 0.1;
        break;
      case 'predator_instinct':
        buffAspdPct += 0.45;
        buffCrit += 0.25;
        buffSpeedPct += 0.25;
        break;
      case 'bone_aegis':
        damageReduction += 0.55;
        thornsRatio += 0.45;
        break;
      case 'sky_tailwind':
        buffSpeedPct += 0.3;
        buffAspdPct += 0.2;
        break;
      case 'codex_overclock':
        buffAtkPct += 0.22;
        buffAspdPct += 0.22;
        buffSpeedPct += 0.14;
        break;
      case 'codex_shield':
        damageReduction += 0.3;
        break;
      default:
        break;
    }
  }

  for (const relicId of state.relics) {
    const relic = data.relicsById[relicId];
    if (relic?.hook === 'onDamaged' && relic.thornsRatio) {
      thornsRatio += relic.thornsRatio;
    }
  }

  const lv = player.level;
  const s = player.stats;

  const maxHp = Math.round(
    (cls.baseHp + (lv - 1) * cls.hpPerLv) * (1 + 0.015 * s.VIT) * (1 + mods.maxHpPct)
  );
  const maxSp = Math.round(
    (cls.baseSp + (lv - 1) * cls.spPerLv) * (1 + 0.015 * s.INT) * (1 + mods.maxSpPct)
  );

  const rawAtk = cls.isRanged
    ? cls.baseAtk + Math.floor(lv * 1.8) + s.DEX * 2.1 + Math.floor(s.STR * 0.35)
    : cls.baseAtk + Math.floor(lv * 1.8) + s.STR * 2.1 + Math.floor(s.DEX * 0.35);

  const atk = Math.max(1, Math.round(rawAtk * (1 + mods.atkPct + buffAtkPct)));
  const rawMatk = cls.baseMatk + Math.floor(lv * 1.9) + s.INT * 2.3 + Math.floor(s.DEX * 0.35);
  const matk = Math.max(
    1,
    Math.round(rawMatk * (1 + mods.matkPct + (player.buffs.some((b) => b.id === 'codex_overclock') ? 0.22 : 0)))
  );

  const hardDef = Math.round(cls.baseDef + Math.floor(lv * 0.8) + mods.flatDef);
  const softDef = Math.floor(s.VIT * 0.65);
  const hardMdef = Math.round(cls.baseMdef + Math.floor(lv * 0.6));
  const softMdef = Math.floor(s.INT * 0.65);

  const aspd = Math.min(
    3.9,
    Math.max(
      0.65,
      cls.baseAspd * (1 + 0.011 * s.AGI + 0.003 * s.DEX) * (1 + mods.aspdPct + buffAspdPct)
    )
  );

  const moveSpeed = Math.min(
    7.6,
    Math.max(2.6, cls.baseMoveSpeed * (1 + 0.0045 * s.AGI) * (1 + mods.moveSpeedPct + buffSpeedPct))
  );

  const critChance = Math.min(
    0.88,
    Math.max(0.05, (0.05 + 0.0045 * s.LUK) * cls.critMult + mods.critChance + buffCrit)
  );
  const critDamage = 1.5 + mods.critDamage;
  const cdr = Math.min(0.55, mods.cdrPct);
  const spRegen = 4.2 + s.INT * 0.28 + mods.spRegen;

  return {
    maxHp,
    maxSp,
    atk,
    matk,
    hardDef,
    softDef,
    hardMdef,
    softMdef,
    aspd,
    moveSpeed,
    critChance,
    critDamage,
    cdr,
    lifesteal: Math.min(0.35, mods.lifesteal),
    ignoreDef: Math.min(0.75, mods.ignoreDef),
    skillPower: 1 + mods.skillPowerPct,
    areaMult: 1 + mods.areaPct,
    spRegen,
    damageReduction: Math.min(0.72, damageReduction),
    thornsRatio,
    extraProjectiles: mods.extraProjectiles,
  };
}

export function mitigateDamage(
  rawDamage: number,
  hardDef: number,
  softDef: number,
  isPhysical: boolean,
  ignoreDefRatio = 0
): number {
  const effectiveDef = Math.max(0, hardDef * (1 - ignoreDefRatio));
  const k = isPhysical ? 240 : 200;
  const reduced = rawDamage * (k / (k + effectiveDef)) - softDef * (1 - ignoreDefRatio * 0.5);
  return Math.max(1, Math.round(reduced));
}
