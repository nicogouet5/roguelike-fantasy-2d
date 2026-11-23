import type { GameData } from './data.ts';
import type { BoonMods, BuildTag, DerivedStats, GameState, PrimaryStats } from './types.ts';

export interface TagSetTier {
  threshold: number;
  label: string;
  mods: BoonMods;
}

export const TAG_SET_TIERS: Record<BuildTag, readonly [TagSetTier, TagSetTier]> = {
  fire: [
    { threshold: 2, label: '+12% daño de habilidades', mods: { skillPowerPct: 0.12 } },
    { threshold: 4, label: '+25% daño de habilidades y +20% tamaño de explosiones/ataques', mods: { skillPowerPct: 0.25, areaPct: 0.2 } },
  ],
  crit: [
    { threshold: 2, label: '+8% crítico y +15% daño crítico', mods: { critChance: 0.08, critDamage: 0.15 } },
    { threshold: 4, label: '+16% crítico y +35% daño crítico', mods: { critChance: 0.16, critDamage: 0.35 } },
  ],
  speed: [
    { threshold: 2, label: '+12% vel. ataque y +8% vel. mov.', mods: { aspdPct: 0.12, moveSpeedPct: 0.08 } },
    { threshold: 4, label: '+24% vel. ataque y +16% vel. mov.', mods: { aspdPct: 0.24, moveSpeedPct: 0.16 } },
  ],
  tank: [
    { threshold: 2, label: '+15% HP máx. y +15 DEF', mods: { maxHpPct: 0.15, flatDef: 15 } },
    { threshold: 4, label: '+32% HP máx., +35 DEF y +15% espinas', mods: { maxHpPct: 0.32, flatDef: 35, thornsRatio: 0.15 } },
  ],
  bleed: [
    { threshold: 2, label: '+15% daño a sangrando y +4% robo vida', mods: { damageVsBleedingPct: 0.15, lifesteal: 0.04 } },
    { threshold: 4, label: '+30% daño a sangrando y +9% robo vida', mods: { damageVsBleedingPct: 0.3, lifesteal: 0.09 } },
  ],
  arcane: [
    { threshold: 2, label: '-12% cooldown y +2 SP/s', mods: { cdrPct: 0.12, spRegen: 2.0 } },
    { threshold: 4, label: '-24% cooldown, +4 SP/s y +1 proyectil', mods: { cdrPct: 0.24, spRegen: 4.0, extraProjectiles: 1 } },
  ],
};

export function expRequiredForLevel(level: number): number {
  return Math.round(70 + (level - 1) * 48 + Math.pow(level - 1, 1.55) * 18);
}

function accumulateMods(target: Required<BoonMods>, mods: BoonMods, mult = 1): void {
  if (mods.str) target.str += mods.str * mult;
  if (mods.agi) target.agi += mods.agi * mult;
  if (mods.vit) target.vit += mods.vit * mult;
  if (mods.int) target.int += mods.int * mult;
  if (mods.dex) target.dex += mods.dex * mult;
  if (mods.luk) target.luk += mods.luk * mult;
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
  if (mods.thornsRatio) target.thornsRatio += mods.thornsRatio * mult;
  if (mods.hpToAtkRatio) target.hpToAtkRatio += mods.hpToAtkRatio * mult;
  if (mods.berserkMaxPct) target.berserkMaxPct += mods.berserkMaxPct * mult;
  if (mods.bleedOnHitChance) target.bleedOnHitChance += mods.bleedOnHitChance * mult;
  if (mods.damageVsBleedingPct) target.damageVsBleedingPct += mods.damageVsBleedingPct * mult;
  if (mods.critLightningRatio) target.critLightningRatio += mods.critLightningRatio * mult;
  if (mods.fireBurstOnHitChance) target.fireBurstOnHitChance += mods.fireBurstOnHitChance * mult;
  if (mods.hornRangePct) target.hornRangePct += mods.hornRangePct * mult;
}

export function computeDerivedStats(state: GameState, data: GameData): DerivedStats {
  const player = state.player;
  const cls = data.classesById[player.classId]!;
  const mods: Required<BoonMods> = {
    str: 0,
    agi: 0,
    vit: 0,
    int: 0,
    dex: 0,
    luk: 0,
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
    thornsRatio: 0,
    hpToAtkRatio: 0,
    berserkMaxPct: 0,
    bleedOnHitChance: 0,
    damageVsBleedingPct: 0,
    critLightningRatio: 0,
    fireBurstOnHitChance: 0,
    hornRangePct: 0,
  };

  const tagCounts: Record<BuildTag, number> = {
    fire: 0,
    crit: 0,
    speed: 0,
    tank: 0,
    bleed: 0,
    arcane: 0,
  };
  for (const [boonId, rank] of Object.entries(state.boonRanks)) {
    const boon = data.boonsById[boonId];
    if (boon && rank > 0) {
      accumulateMods(mods, boon.mods, rank);
      for (const tag of boon.tags) tagCounts[tag] += rank;
    }
  }
  // Apply Brotato/TFT-style Tag Set Bonuses at thresholds 2 and 4!
  for (const tag of Object.keys(TAG_SET_TIERS) as BuildTag[]) {
    const count = tagCounts[tag];
    const [tier2, tier4] = TAG_SET_TIERS[tag];
    if (count >= tier4.threshold) accumulateMods(mods, tier4.mods, 1);
    else if (count >= tier2.threshold) accumulateMods(mods, tier2.mods, 1);
  }
  for (const relicId of state.relics) {
    const relic = data.relicsById[relicId];
    if (relic) accumulateMods(mods, relic.statMods, 1);
  }

  let buffAtkPct = 0;
  let buffMatkPct = 0;
  let buffAspdPct = 0;
  let buffSpeedPct = 0;
  let buffCrit = 0;
  let damageReduction = 0;
  let thornsRatio = mods.thornsRatio;

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
        buffMatkPct += 0.22;
        buffAspdPct += 0.22;
        buffSpeedPct += 0.14;
        break;
      case 'codex_shield':
        damageReduction += 0.3;
        break;
      case 'food_italiano':
        buffAtkPct += 0.2;
        buffMatkPct += 0.2;
        buffSpeedPct += 0.15;
        break;
      case 'food_as':
        buffAtkPct += 0.28;
        buffMatkPct += 0.28;
        break;
      case 'food_salchipapas':
        buffAspdPct += 0.3;
        break;
      case 'food_sopaipilla':
        buffSpeedPct += 0.26;
        break;
      case 'food_chancaca':
        damageReduction += 0.25;
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
  const s: PrimaryStats = {
    STR: player.stats.STR + mods.str,
    AGI: player.stats.AGI + mods.agi,
    VIT: player.stats.VIT + mods.vit,
    INT: player.stats.INT + mods.int,
    DEX: player.stats.DEX + mods.dex,
    LUK: player.stats.LUK + mods.luk,
  };

  const hpMult = Math.max(0.45, 1 + mods.maxHpPct);
  const maxHp = Math.max(60, Math.round((cls.baseHp + (lv - 1) * cls.hpPerLv) * (1 + 0.015 * s.VIT) * hpMult));
  const maxSp = Math.max(
    40,
    Math.round((cls.baseSp + (lv - 1) * cls.spPerLv) * (1 + 0.015 * s.INT) * Math.max(0.5, 1 + mods.maxSpPct))
  );

  // Berserker scaling as HP drops
  const missingHpRatio = Math.max(0, Math.min(1, 1 - player.hp / Math.max(1, maxHp)));
  const berserkBonus = mods.berserkMaxPct > 0 ? missingHpRatio * mods.berserkMaxPct : 0;

  const rawAtk =
    (cls.isRanged
      ? cls.baseAtk + Math.floor(lv * 1.8) + s.DEX * 2.1 + Math.floor(s.STR * 0.35)
      : cls.baseAtk + Math.floor(lv * 1.8) + s.STR * 2.1 + Math.floor(s.DEX * 0.35)) +
    Math.round(maxHp * mods.hpToAtkRatio);

  const atk = Math.max(1, Math.round(rawAtk * Math.max(0.4, 1 + mods.atkPct + buffAtkPct + berserkBonus)));
  const rawMatk = cls.baseMatk + Math.floor(lv * 1.9) + s.INT * 2.3 + Math.floor(s.DEX * 0.35);
  const matk = Math.max(1, Math.round(rawMatk * Math.max(0.4, 1 + mods.matkPct + buffMatkPct + berserkBonus)));

  const hardDef = Math.max(0, Math.round(cls.baseDef + Math.floor(lv * 0.8) + mods.flatDef));
  const softDef = Math.floor(s.VIT * 0.65);
  const hardMdef = Math.max(0, Math.round(cls.baseMdef + Math.floor(lv * 0.6)));
  const softMdef = Math.floor(s.INT * 0.65);

  const aspd = Math.min(
    4.2,
    Math.max(
      0.65,
      cls.baseAspd * (1 + 0.011 * s.AGI + 0.003 * s.DEX) * Math.max(0.5, 1 + mods.aspdPct + buffAspdPct)
    )
  );

  const moveSpeed = Math.min(
    7.8,
    Math.max(2.4, cls.baseMoveSpeed * (1 + 0.0045 * s.AGI) * Math.max(0.65, 1 + mods.moveSpeedPct + buffSpeedPct))
  );

  const critChance = Math.min(
    0.92,
    Math.max(0.05, (0.05 + 0.0045 * s.LUK) * cls.critMult + mods.critChance + buffCrit)
  );
  const critDamage = 1.5 + mods.critDamage;
  const cdr = Math.min(0.6, mods.cdrPct);
  const spRegen = 4.2 + s.INT * 0.28 + mods.spRegen;

  return {
    effectiveStats: s,
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
    lifesteal: Math.min(0.4, mods.lifesteal),
    ignoreDef: Math.min(0.85, mods.ignoreDef),
    skillPower: 1 + mods.skillPowerPct,
    areaMult: 1 + mods.areaPct,
    spRegen,
    damageReduction: Math.min(0.75, damageReduction),
    thornsRatio,
    extraProjectiles: mods.extraProjectiles,
    bleedOnHitChance: Math.min(1, mods.bleedOnHitChance),
    damageVsBleedingPct: mods.damageVsBleedingPct,
    critLightningRatio: mods.critLightningRatio,
    fireBurstOnHitChance: Math.min(0.85, mods.fireBurstOnHitChance),
    hornRangeMult: 1 + mods.hornRangePct,
  };
}

/** Computes current basic-attack reach (accounting for Triceratops's growing horn-lances!) */
export function getBasicAttackRange(state: GameState, data: GameData): number {
  const cls = data.classesById[state.player.classId]!;
  const basic = data.skillsById[cls.basicSkillId]!;
  if (basic.template === 'line_pierce') {
    const derived = computeDerivedStats(state, data);
    const levelBonus = (state.player.level - 1) * (basic.rangePerLevel ?? 0);
    return (basic.range + levelBonus) * derived.hornRangeMult * (1 + (derived.areaMult - 1) * 0.5);
  }
  return cls.attackRange;
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
