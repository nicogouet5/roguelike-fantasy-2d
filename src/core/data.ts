import { z } from 'zod';
import boonsJson from '../data/boons.json';
import classesJson from '../data/classes.json';
import elementsJson from '../data/elements.json';
import foodsJson from '../data/foods.json';
import mapsJson from '../data/maps.json';
import mapPalettesJson from '../data/mapPalettes.json';
import mobsJson from '../data/mobs.json';
import namesEsJson from '../data/names.es.json';
import relicsJson from '../data/relics.json';
import skillsJson from '../data/skills.json';
import type { ElementMatrix } from './elements.ts';
import type {
  BoonDef,
  DinoClassDef,
  ElementName,
  FoodDef,
  MapDef,
  MapPaletteDef,
  MobDef,
  RelicDef,
  SkillDef,
} from './types.ts';

const elementEnum = z.enum(['Neutral', 'Fire', 'Water', 'Wind', 'Earth', 'Venom']);
const statEnum = z.enum(['STR', 'AGI', 'VIT', 'INT', 'DEX', 'LUK']);
const weaponEnum = z.enum(['greatsword', 'katana', 'shield_lance', 'amber_staff', 'bone_bow']);
const archetypeEnum = z.enum(['colossus', 'glass_cannon', 'tank', 'mage', 'archer']);
const biomeEnum = z.enum(['jungle', 'volcano', 'canyon']);
const buildTagEnum = z.enum(['fire', 'crit', 'speed', 'tank', 'bleed', 'arcane']);
const sfxEnum = z.enum([
  'greatsword',
  'katana',
  'shield',
  'bow',
  'dash',
  'magic',
  'fire',
  'wind',
  'slam',
  'roar',
  'buff',
  'potion',
  'hit',
  'crit',
  'hurt',
  'death',
  'victory',
  'levelup',
  'chest',
  'portal',
  'pickup',
  'ui_click',
  'boss_phase',
]);

const boonModsSchema = z
  .object({
    str: z.number().int().optional(),
    agi: z.number().int().optional(),
    vit: z.number().int().optional(),
    int: z.number().int().optional(),
    dex: z.number().int().optional(),
    luk: z.number().int().optional(),
    atkPct: z.number().optional(),
    matkPct: z.number().optional(),
    aspdPct: z.number().optional(),
    moveSpeedPct: z.number().optional(),
    maxHpPct: z.number().optional(),
    maxSpPct: z.number().optional(),
    flatDef: z.number().optional(),
    spRegen: z.number().optional(),
    cdrPct: z.number().optional(),
    critChance: z.number().optional(),
    critDamage: z.number().optional(),
    lifesteal: z.number().optional(),
    ignoreDef: z.number().optional(),
    skillPowerPct: z.number().optional(),
    areaPct: z.number().optional(),
    extraProjectiles: z.number().int().optional(),
    thornsRatio: z.number().optional(),
    hpToAtkRatio: z.number().optional(),
    berserkMaxPct: z.number().optional(),
    bleedOnHitChance: z.number().optional(),
    damageVsBleedingPct: z.number().optional(),
    critLightningRatio: z.number().optional(),
    fireBurstOnHitChance: z.number().optional(),
    hornRangePct: z.number().optional(),
  })
  .strict();

const classSchema = z.object({
  id: z.string().min(1),
  spriteId: z.string().min(1),
  weaponType: weaponEnum,
  archetype: archetypeEnum,
  accentColor: z.string().min(4),
  element: elementEnum,
  baseHp: z.number().positive(),
  hpPerLv: z.number().positive(),
  baseSp: z.number().positive(),
  spPerLv: z.number().positive(),
  baseAtk: z.number().positive(),
  baseMatk: z.number().positive(),
  baseDef: z.number().nonnegative(),
  baseMdef: z.number().nonnegative(),
  baseAspd: z.number().positive(),
  baseMoveSpeed: z.number().positive(),
  critMult: z.number().positive(),
  attackRange: z.number().positive(),
  isRanged: z.boolean(),
  baseStats: z.object({
    STR: z.number().int().positive(),
    AGI: z.number().int().positive(),
    VIT: z.number().int().positive(),
    INT: z.number().int().positive(),
    DEX: z.number().int().positive(),
    LUK: z.number().int().positive(),
  }),
  statGrowth: z.array(statEnum).min(1),
  basicSkillId: z.string().min(1),
  dashSkillId: z.string().min(1),
  activeSkillIds: z.array(z.string().min(1)).length(2),
  ultimateSkillId: z.string().min(1),
});

const skillSchema = z.object({
  id: z.string().min(1),
  template: z.enum([
    'melee_arc',
    'line_pierce',
    'leap_slam',
    'dash_slash',
    'nova',
    'self_buff',
    'projectile',
    'volley',
    'ground_aoe',
    'evade_shot',
    'telegraph_aoe',
    'ultimate_flurry',
  ]),
  isPhysical: z.boolean(),
  isUltimate: z.boolean().optional(),
  element: elementEnum,
  targetType: z.enum(['direction', 'tile', 'self']),
  spCost: z.number().nonnegative(),
  cooldownMs: z.number().nonnegative(),
  castMs: z.number().nonnegative(),
  range: z.number().nonnegative(),
  rangePerLevel: z.number().nonnegative().optional(),
  lineWidth: z.number().positive().optional(),
  radius: z.number().positive().optional(),
  atkMult: z.number().positive().optional(),
  matkMult: z.number().positive().optional(),
  arcDeg: z.number().positive().optional(),
  hits: z.number().int().positive().optional(),
  knockback: z.number().nonnegative().optional(),
  stunMs: z.number().nonnegative().optional(),
  bleedMs: z.number().nonnegative().optional(),
  speed: z.number().positive().optional(),
  pierce: z.boolean().optional(),
  splashRadius: z.number().positive().optional(),
  ignoreDefRatio: z.number().min(0).max(1).optional(),
  count: z.number().int().positive().optional(),
  spreadDeg: z.number().nonnegative().optional(),
  waves: z.number().int().positive().optional(),
  waveIntervalMs: z.number().positive().optional(),
  healRatio: z.number().min(0).max(1).optional(),
  buffId: z.enum(['tyrant_fury', 'predator_instinct', 'bone_aegis', 'sky_tailwind', 'boss_enrage']).optional(),
  buffDurationMs: z.number().positive().optional(),
  telegraphMs: z.number().positive().optional(),
  leapToTarget: z.boolean().optional(),
  multiRing: z.number().int().positive().optional(),
  sfx: sfxEnum,
});

const mobSchema = z.object({
  id: z.string().min(1),
  spriteId: z.string().min(1),
  element: elementEnum,
  maxHp: z.number().positive(),
  atk: z.number().positive(),
  matk: z.number().nonnegative(),
  def: z.number().nonnegative(),
  mdef: z.number().nonnegative(),
  moveSpeed: z.number().positive(),
  aggroRange: z.number().positive(),
  attackRange: z.number().positive(),
  expReward: z.number().positive(),
  amberReward: z.number().nonnegative(),
  aiProfile: z.enum(['swarmer', 'hunter', 'charger', 'ranged', 'juggernaut', 'boss']),
  isBoss: z.boolean().optional(),
  skillIds: z.array(z.string().min(1)).min(1),
  scale: z.number().positive(),
});

const mapSchema = z.object({
  id: z.string().min(1),
  floorIndex: z.number().int().nonnegative(),
  biome: biomeEnum,
  paletteId: z.enum([
    'fortaleza_acero_coral',
    'claustro_jade_ambar',
    'puente_violeta_cobre',
    'osario_hueso_petroleo',
  ]),
  width: z.number().int().min(16),
  height: z.number().int().min(16),
  targetKills: z.number().int().positive(),
  totalWaves: z.number().int().positive(),
  waveIntervalMs: z.number().int().nonnegative(),
  mobsPerWave: z.number().int().positive(),
  maxMobs: z.number().int().positive(),
  eliteChance: z.number().min(0).max(1),
  bgColor: z.string().min(4),
  bossId: z.string().optional(),
  mobs: z.array(z.object({ mobId: z.string().min(1), weight: z.number().positive() })).min(1),
});

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected an opaque #RRGGBB color');

const mapPaletteSchema = z.object({
  id: z.enum([
    'fortaleza_acero_coral',
    'claustro_jade_ambar',
    'puente_violeta_cobre',
    'osario_hueso_petroleo',
  ]),
  background: hexColor,
  groundTint: hexColor,
  pathTint: hexColor,
  wallTint: hexColor,
  propTint: hexColor,
  portalTint: hexColor,
}).strict();

const boonSchema = z.object({
  id: z.string().min(1),
  category: z.enum(['stat', 'mutation', 'skill', 'relic', 'capstone']),
  rarity: z.enum(['common', 'rare', 'epic', 'legendary']),
  tags: z.array(buildTagEnum).min(1),
  classIds: z.array(z.string().min(1)).optional(),
  maxRank: z.number().int().positive(),
  relicId: z.string().optional(),
  mods: boonModsSchema,
});

const relicSchema = z.object({
  id: z.string().min(1),
  hook: z.enum(['onHit', 'onDamaged', 'onKill']),
  chance: z.number().min(0).max(1),
  element: elementEnum,
  bonusDamageRatio: z.number().positive().optional(),
  bleedMs: z.number().positive().optional(),
  thornsRatio: z.number().positive().optional(),
  novaRadius: z.number().positive().optional(),
  novaDamageRatio: z.number().positive().optional(),
  healRatio: z.number().positive().optional(),
  spRestore: z.number().positive().optional(),
  statMods: boonModsSchema,
});

const foodSchema = z.object({
  id: z.string().min(1),
  spriteFrame: z.string().min(1),
  weight: z.number().positive(),
  healRatio: z.number().min(0).max(1),
  spRatio: z.number().min(0).max(1),
  buffId: z
    .enum(['food_italiano', 'food_as', 'food_salchipapas', 'food_sopaipilla', 'food_chancaca'])
    .optional(),
  buffDurationMs: z.number().positive().optional(),
  color: z.string().min(4),
});

const elementsSchema = z.object({
  elements: z.array(elementEnum).length(6),
  matrix: z.record(elementEnum, z.record(elementEnum, z.number().positive())),
});

const nameDescSchema = z.object({
  name: z.string().min(1),
  desc: z.string().min(1),
});

const namesSchema = z.object({
  ui: z.object({
    title: z.string().min(1),
    subtitle: z.string().min(1),
    devTitle: z.string(),
    devLevel: z.string(),
    devStage: z.string(),
    devHint: z.string(),
  }),
  elements: z.record(elementEnum, z.string().min(1)),
  weapons: z.record(weaponEnum, z.string().min(1)),
  archetypes: z.record(archetypeEnum, z.string().min(1)),
  tags: z.record(buildTagEnum, z.string().min(1)),
  classes: z.record(z.string(), nameDescSchema),
  skills: z.record(z.string(), nameDescSchema),
  mobs: z.record(z.string(), z.string().min(1)),
  maps: z.record(z.string(), z.string().min(1)),
  boons: z.record(z.string(), nameDescSchema),
  relics: z.record(z.string(), nameDescSchema),
  foods: z.record(z.string(), nameDescSchema),
});

export type NamesEs = z.infer<typeof namesSchema>;

export interface GameData {
  elements: ElementName[];
  elementMatrix: ElementMatrix;
  classes: DinoClassDef[];
  classesById: Record<string, DinoClassDef>;
  skills: SkillDef[];
  skillsById: Record<string, SkillDef>;
  mobs: MobDef[];
  mobsById: Record<string, MobDef>;
  maps: MapDef[];
  mapsByFloor: MapDef[];
  mapPalettesById: Record<string, MapPaletteDef>;
  boons: BoonDef[];
  boonsById: Record<string, BoonDef>;
  relics: RelicDef[];
  relicsById: Record<string, RelicDef>;
  foods: FoodDef[];
  foodsById: Record<string, FoodDef>;
  names: NamesEs;
}

let cachedData: GameData | null = null;

export function loadGameData(): GameData {
  if (cachedData) return cachedData;

  const parsedElements = elementsSchema.parse(elementsJson);
  const classes = z.array(classSchema).min(5).parse(classesJson) as DinoClassDef[];
  const skills = z.array(skillSchema).min(15).parse(skillsJson) as SkillDef[];
  const mobs = z.array(mobSchema).min(5).parse(mobsJson) as MobDef[];
  const maps = z.array(mapSchema).min(3).parse(mapsJson) as MapDef[];
  const mapPalettes = z.array(mapPaletteSchema).min(4).parse(mapPalettesJson) as MapPaletteDef[];
  const boons = z.array(boonSchema).min(10).parse(boonsJson) as BoonDef[];
  const relics = z.array(relicSchema).min(5).parse(relicsJson) as RelicDef[];
  const foods = z.array(foodSchema).min(4).parse(foodsJson) as FoodDef[];
  const names = namesSchema.parse(namesEsJson);

  const classesById = Object.fromEntries(classes.map((c) => [c.id, c]));
  const skillsById = Object.fromEntries(skills.map((s) => [s.id, s]));
  const mobsById = Object.fromEntries(mobs.map((m) => [m.id, m]));
  const boonsById = Object.fromEntries(boons.map((b) => [b.id, b]));
  const relicsById = Object.fromEntries(relics.map((r) => [r.id, r]));
  const foodsById = Object.fromEntries(foods.map((f) => [f.id, f]));
  const mapsByFloor = [...maps].sort((a, b) => a.floorIndex - b.floorIndex);
  const mapPalettesById = Object.fromEntries(mapPalettes.map((palette) => [palette.id, palette]));

  // Cross-reference integrity checks
  for (const cls of classes) {
    if (!skillsById[cls.basicSkillId]) {
      throw new Error(`Missing basicSkillId ${cls.basicSkillId} for class ${cls.id}`);
    }
    if (!skillsById[cls.dashSkillId]) {
      throw new Error(`Missing dashSkillId ${cls.dashSkillId} for class ${cls.id}`);
    }
    if (!skillsById[cls.ultimateSkillId]) {
      throw new Error(`Missing ultimateSkillId ${cls.ultimateSkillId} for class ${cls.id}`);
    }
    for (const sid of cls.activeSkillIds) {
      if (!skillsById[sid]) throw new Error(`Missing skill ${sid} for class ${cls.id}`);
    }
    if (!names.classes[cls.id]) throw new Error(`Missing Spanish name for class ${cls.id}`);
  }
  for (const sk of skills) {
    if (!names.skills[sk.id]) throw new Error(`Missing Spanish name for skill ${sk.id}`);
  }
  for (const mob of mobs) {
    if (!names.mobs[mob.id]) throw new Error(`Missing Spanish name for mob ${mob.id}`);
    for (const sid of mob.skillIds) {
      if (!skillsById[sid]) throw new Error(`Missing skill ${sid} for mob ${mob.id}`);
    }
  }
  for (const map of maps) {
    if (!names.maps[map.id]) throw new Error(`Missing Spanish name for map ${map.id}`);
    if (!mapPalettesById[map.paletteId]) {
      throw new Error(`Missing paletteId ${map.paletteId} for map ${map.id}`);
    }
    if (map.bossId && !mobsById[map.bossId]) {
      throw new Error(`Missing bossId ${map.bossId} for map ${map.id}`);
    }
    for (const entry of map.mobs) {
      if (!mobsById[entry.mobId]) throw new Error(`Missing mob ${entry.mobId} in map ${map.id}`);
    }
  }
  for (const boon of boons) {
    if (!names.boons[boon.id]) throw new Error(`Missing Spanish name for boon ${boon.id}`);
    if (boon.relicId && !relicsById[boon.relicId]) {
      throw new Error(`Missing relicId ${boon.relicId} in boon ${boon.id}`);
    }
  }
  for (const relic of relics) {
    if (!names.relics[relic.id]) throw new Error(`Missing Spanish name for relic ${relic.id}`);
  }
  for (const food of foods) {
    if (!names.foods[food.id]) throw new Error(`Missing Spanish name for food ${food.id}`);
  }

  cachedData = {
    elements: parsedElements.elements,
    elementMatrix: parsedElements.matrix as ElementMatrix,
    classes,
    classesById,
    skills,
    skillsById,
    mobs,
    mobsById,
    maps,
    mapsByFloor,
    mapPalettesById,
    boons,
    boonsById,
    relics,
    relicsById,
    foods,
    foodsById,
    names,
  };
  return cachedData;
}
