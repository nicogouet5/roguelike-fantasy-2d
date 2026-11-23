export type ElementName = 'Neutral' | 'Fire' | 'Water' | 'Wind' | 'Earth' | 'Venom';

export type StatKey = 'STR' | 'AGI' | 'VIT' | 'INT' | 'DEX' | 'LUK';

export type WeaponType = 'greatsword' | 'katana' | 'shield_lance' | 'amber_staff' | 'bone_bow';

export type ArchetypeId = 'colossus' | 'glass_cannon' | 'tank' | 'mage' | 'archer';

export type BiomeId = 'jungle' | 'volcano' | 'canyon';

export type BuildTag = 'fire' | 'crit' | 'speed' | 'tank' | 'bleed' | 'arcane';

export type BoonRarity = 'common' | 'rare' | 'epic' | 'legendary';

export type SkillTemplate =
  | 'melee_arc'
  | 'line_pierce'
  | 'leap_slam'
  | 'dash_slash'
  | 'nova'
  | 'self_buff'
  | 'projectile'
  | 'volley'
  | 'ground_aoe'
  | 'evade_shot'
  | 'telegraph_aoe';

export type BuffId =
  | 'tyrant_fury'
  | 'predator_instinct'
  | 'bone_aegis'
  | 'sky_tailwind'
  | 'boss_enrage'
  | 'codex_overclock'
  | 'codex_shield';

export type SfxKind =
  | 'greatsword'
  | 'katana'
  | 'shield'
  | 'bow'
  | 'magic'
  | 'fire'
  | 'wind'
  | 'slam'
  | 'roar'
  | 'buff'
  | 'hit'
  | 'hurt'
  | 'levelup'
  | 'chest'
  | 'portal'
  | 'boss_phase';

export interface PrimaryStats {
  STR: number;
  AGI: number;
  VIT: number;
  INT: number;
  DEX: number;
  LUK: number;
}

export interface BoonMods {
  str?: number;
  agi?: number;
  vit?: number;
  int?: number;
  dex?: number;
  luk?: number;
  atkPct?: number;
  matkPct?: number;
  aspdPct?: number;
  moveSpeedPct?: number;
  maxHpPct?: number;
  maxSpPct?: number;
  flatDef?: number;
  spRegen?: number;
  cdrPct?: number;
  critChance?: number;
  critDamage?: number;
  lifesteal?: number;
  ignoreDef?: number;
  skillPowerPct?: number;
  areaPct?: number;
  extraProjectiles?: number;
  thornsRatio?: number;
  hpToAtkRatio?: number;
  berserkMaxPct?: number;
  bleedOnHitChance?: number;
  damageVsBleedingPct?: number;
  critLightningRatio?: number;
  fireBurstOnHitChance?: number;
  hornRangePct?: number;
}

export interface DinoClassDef {
  id: string;
  spriteId: string;
  weaponType: WeaponType;
  archetype: ArchetypeId;
  accentColor: string;
  element: ElementName;
  baseHp: number;
  hpPerLv: number;
  baseSp: number;
  spPerLv: number;
  baseAtk: number;
  baseMatk: number;
  baseDef: number;
  baseMdef: number;
  baseAspd: number;
  baseMoveSpeed: number;
  critMult: number;
  attackRange: number;
  isRanged: boolean;
  baseStats: PrimaryStats;
  statGrowth: StatKey[];
  basicSkillId: string;
  activeSkillIds: string[];
}

export interface SkillDef {
  id: string;
  template: SkillTemplate;
  isPhysical: boolean;
  element: ElementName;
  targetType: 'direction' | 'tile' | 'self';
  spCost: number;
  cooldownMs: number;
  castMs: number;
  range: number;
  rangePerLevel?: number;
  lineWidth?: number;
  radius?: number;
  atkMult?: number;
  matkMult?: number;
  arcDeg?: number;
  hits?: number;
  knockback?: number;
  stunMs?: number;
  bleedMs?: number;
  speed?: number;
  pierce?: boolean;
  splashRadius?: number;
  ignoreDefRatio?: number;
  count?: number;
  spreadDeg?: number;
  waves?: number;
  waveIntervalMs?: number;
  healRatio?: number;
  buffId?: BuffId;
  buffDurationMs?: number;
  telegraphMs?: number;
  leapToTarget?: boolean;
  multiRing?: number;
  sfx: SfxKind;
}

export interface MobDef {
  id: string;
  spriteId: string;
  element: ElementName;
  maxHp: number;
  atk: number;
  matk: number;
  def: number;
  mdef: number;
  moveSpeed: number;
  aggroRange: number;
  attackRange: number;
  expReward: number;
  amberReward: number;
  aiProfile: 'swarmer' | 'hunter' | 'charger' | 'ranged' | 'juggernaut' | 'boss';
  isBoss?: boolean;
  skillIds: string[];
  scale: number;
}

export interface MapDef {
  id: string;
  floorIndex: number;
  biome: BiomeId;
  width: number;
  height: number;
  targetKills: number;
  maxMobs: number;
  eliteChance: number;
  bgColor: string;
  bossId?: string;
  mobs: { mobId: string; weight: number }[];
}

export interface BoonDef {
  id: string;
  category: 'stat' | 'mutation' | 'skill' | 'relic' | 'capstone';
  rarity: BoonRarity;
  tags: BuildTag[];
  classIds?: string[];
  maxRank: number;
  relicId?: string;
  mods: BoonMods;
}

export interface RelicDef {
  id: string;
  hook: 'onHit' | 'onDamaged' | 'onKill';
  chance: number;
  element: ElementName;
  bonusDamageRatio?: number;
  bleedMs?: number;
  thornsRatio?: number;
  novaRadius?: number;
  novaDamageRatio?: number;
  healRatio?: number;
  spRestore?: number;
  statMods: BoonMods;
}

export interface ActiveBuff {
  id: BuffId;
  remainingMs: number;
  durationMs: number;
}

export interface DerivedStats {
  effectiveStats: PrimaryStats;
  maxHp: number;
  maxSp: number;
  atk: number;
  matk: number;
  hardDef: number;
  softDef: number;
  hardMdef: number;
  softMdef: number;
  aspd: number;
  moveSpeed: number;
  critChance: number;
  critDamage: number;
  cdr: number;
  lifesteal: number;
  ignoreDef: number;
  skillPower: number;
  areaMult: number;
  spRegen: number;
  damageReduction: number;
  thornsRatio: number;
  extraProjectiles: number;
  bleedOnHitChance: number;
  damageVsBleedingPct: number;
  critLightningRatio: number;
  fireBurstOnHitChance: number;
  hornRangeMult: number;
}

export interface PlayerEntity {
  id: 'player';
  classId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facingX: number;
  facingY: number;
  level: number;
  exp: number;
  expToNext: number;
  stats: PrimaryStats;
  hp: number;
  sp: number;
  potions: number;
  amber: number;
  basicCooldownMs: number;
  skillCooldowns: Record<string, number>;
  buffs: ActiveBuff[];
  hitFlashMs: number;
  attackAnimMs: number;
  attackAnimDurationMs: number;
  invulnMs: number;
  leapAnimMs: number;
  autoAttack: boolean;
  autoCast: boolean;
}

export interface PetEntity {
  id: 'pet_codex';
  spriteId: string;
  x: number;
  y: number;
  facingX: number;
  facingY: number;
  supportCooldownMs: number;
  castAnimMs: number;
  lastAction: 'heal' | 'overclock' | 'shield' | null;
}

export interface MobEntity {
  id: string;
  mobId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facingX: number;
  facingY: number;
  hp: number;
  maxHp: number;
  isElite: boolean;
  isBoss: boolean;
  bossPhase: 1 | 2;
  cooldowns: Record<string, number>;
  stunMs: number;
  bleedMs: number;
  bleedTickMs: number;
  bleedDps: number;
  hitFlashMs: number;
  attackAnimMs: number;
  attackAnimDurationMs: number;
  wanderTimerMs: number;
  wanderDirX: number;
  wanderDirY: number;
  summonedPhase2?: boolean;
}

export interface ProjectileEntity {
  id: string;
  ownerId: 'player' | string;
  fromPlayer: boolean;
  skillId: string;
  element: ElementName;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  remainingDist: number;
  damage: number;
  isPhysical: boolean;
  isCrit: boolean;
  pierce: boolean;
  splashRadius: number;
  ignoreDefRatio: number;
  hitIds: string[];
  visual: 'arrow' | 'fire' | 'wind' | 'venom' | 'water';
}

export interface TelegraphEntity {
  id: string;
  ownerId: string;
  fromPlayer: boolean;
  skillId: string;
  element: ElementName;
  x: number;
  y: number;
  radius: number;
  elapsedMs: number;
  durationMs: number;
  damage: number;
  isPhysical: boolean;
  stunMs: number;
  leapOwner: boolean;
  wavesRemaining: number;
  waveIntervalMs: number;
}

export interface DropEntity {
  id: string;
  kind: 'potion' | 'amber' | 'chest';
  x: number;
  y: number;
  amount: number;
}

export interface PropEntity {
  id: string;
  kind: 'fern' | 'palm' | 'ribcage' | 'rock' | 'amber_crystal' | 'lava_vent' | 'giant_sword';
  x: number;
  y: number;
  blocking: boolean;
}

export type TileKind = 'void' | 'ground' | 'path' | 'wall' | 'hazard' | 'portal';

export interface ZoneMap {
  mapId: string;
  floorIndex: number;
  biome: BiomeId;
  width: number;
  height: number;
  tiles: TileKind[];
  variants: number[];
  spawn: { x: number; y: number };
  portal: { x: number; y: number };
  props: PropEntity[];
}

export interface BoonOffer {
  source: 'levelup' | 'chest';
  choices: string[];
  synergyIds: string[];
}

export interface CastTarget {
  x: number;
  y: number;
  targetId?: string;
}

export interface CastResult {
  ok: boolean;
  reason?: string;
  hits: number;
  totalDamage: number;
}

export type GameEvent =
  | {
      type: 'damage';
      targetId: string;
      x: number;
      y: number;
      amount: number;
      element: ElementName;
      isCrit: boolean;
      isWeakness: boolean;
      fromPlayer: boolean;
    }
  | {
      type: 'heal';
      targetId: string;
      x: number;
      y: number;
      amount: number;
    }
  | {
      type: 'slash';
      x: number;
      y: number;
      angle: number;
      radius: number;
      element: ElementName;
      weaponType?: WeaponType;
      fromPlayer: boolean;
    }
  | {
      type: 'horn_thrust';
      x: number;
      y: number;
      endX: number;
      endY: number;
      angle: number;
      length: number;
      level: number;
      element: ElementName;
    }
  | {
      type: 'lightning_arc';
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
    }
  | {
      type: 'impact';
      x: number;
      y: number;
      radius: number;
      element: ElementName;
      heavy: boolean;
    }
  | {
      type: 'sfx';
      sfx: SfxKind;
    }
  | {
      type: 'notice';
      x: number;
      y: number;
      text: string;
      color: string;
    }
  | {
      type: 'kill';
      mobId: string;
      isBoss: boolean;
      isElite: boolean;
    }
  | {
      type: 'boss_phase';
      phase: 2;
    }
  | {
      type: 'dash_trail';
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      spriteId: string;
      element: ElementName;
    }
  | {
      type: 'zone_change';
      mapId: string;
      floorIndex: number;
    };

export interface RunStats {
  elapsedMs: number;
  kills: number;
  elitesKilled: number;
  damageDealt: number;
  damageTaken: number;
  chestsOpened: number;
  boonsPicked: number;
  floorsCleared: number;
}

export interface GameState {
  seed: string;
  rngCombatState: number;
  rngOfferState: number;
  nextEntityId: number;
  status: 'playing' | 'victory' | 'defeat';
  paused: boolean;
  floorIndex: number;
  zoneKills: number;
  portalUnlocked: boolean;
  zone: ZoneMap;
  player: PlayerEntity;
  pet: PetEntity;
  mobs: MobEntity[];
  projectiles: ProjectileEntity[];
  telegraphs: TelegraphEntity[];
  drops: DropEntity[];
  respawnTimerMs: number;
  killsSinceChest: number;
  boonRanks: Record<string, number>;
  relics: string[];
  rerolls: number;
  pendingOffer: BoonOffer | null;
  offerQueue: ('levelup' | 'chest')[];
  stats: RunStats;
  events: GameEvent[];
}
