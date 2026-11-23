import type { GameData } from './data.ts';
import { isWalkable } from './mapGen.ts';
import { createRng } from './rng.ts';
import { computeDerivedStats } from './stats.ts';
import type { BoonDef, BoonOffer, BuildTag, GameState } from './types.ts';

function nextOfferRng(state: GameState) {
  return createRng(state.rngOfferState);
}

function saveOfferRng(state: GameState, rngState: number): void {
  state.rngOfferState = rngState;
}

export function getBuildTagCounts(state: GameState, data: GameData): Record<BuildTag, number> {
  const counts: Record<BuildTag, number> = {
    fire: 0,
    crit: 0,
    speed: 0,
    tank: 0,
    bleed: 0,
    arcane: 0,
  };
  for (const [boonId, rank] of Object.entries(state.boonRanks)) {
    if (rank <= 0) continue;
    const boon = data.boonsById[boonId];
    if (!boon) continue;
    for (const tag of boon.tags) {
      counts[tag] += rank;
    }
  }
  return counts;
}

export function getEligibleBoons(state: GameState, data: GameData): BoonDef[] {
  return data.boons.filter((b) => {
    if (b.classIds && !b.classIds.includes(state.player.classId)) return false;
    const rank = state.boonRanks[b.id] ?? 0;
    if (rank >= b.maxRank) return false;
    if (b.relicId && state.relics.includes(b.relicId)) return false;
    return true;
  });
}

/**
 * Brotato + Hades inspired weighted card roller:
 * 1. LUK & player level progressively elevate Rare / Epic / Legendary drop odds.
 * 2. Tag Synergy Bias: cards sharing BuildTags with already-picked boons gain
 *    a strong multiplier so every run snowballs into a cohesive, distinct build.
 * 3. Class-signature cards get a natural discovery bump.
 */
function cardDrawWeight(
  boon: BoonDef,
  source: 'levelup' | 'chest',
  level: number,
  luk: number,
  tagCounts: Record<BuildTag, number>
): { weight: number; hasSynergy: boolean } {
  const luckFactor = Math.max(0, (luk - 6) * 0.045) + Math.max(0, (level - 1) * 0.08);

  let base: number;
  if (source === 'chest') {
    if (boon.rarity === 'legendary') base = 20 + luckFactor * 14;
    else if (boon.rarity === 'epic') base = 36 + luckFactor * 10;
    else if (boon.rarity === 'rare') base = 42;
    else base = 12;
  } else {
    if (boon.rarity === 'legendary') {
      base = level >= 3 || luk >= 14 ? 8 + luckFactor * 10 : 2.5;
    } else if (boon.rarity === 'epic') {
      base = 16 + luckFactor * 9;
    } else if (boon.rarity === 'rare') {
      base = 34 + luckFactor * 6;
    } else {
      base = 48;
    }
  }

  // Synergy multiplier (Brotato tag-bias + Hades god-pool lock-in)
  let matchingTagPower = 0;
  for (const tag of boon.tags) {
    matchingTagPower += tagCounts[tag] ?? 0;
  }
  const hasSynergy = matchingTagPower >= 1;
  const synergyMult = 1 + Math.min(2.6, matchingTagPower * 0.55);

  // Class-specific cards get a mild nudge so players frequently see their species identity
  const classMult = boon.classIds ? 1.45 : 1.0;

  return {
    weight: Math.max(1, base * synergyMult * classMult),
    hasSynergy,
  };
}

export function rollBoonOffer(
  state: GameState,
  data: GameData,
  source: 'levelup' | 'chest'
): BoonOffer | null {
  const pool = getEligibleBoons(state, data);
  if (pool.length === 0) return null;

  const rng = nextOfferRng(state);
  const derived = computeDerivedStats(state, data);
  const tagCounts = getBuildTagCounts(state, data);
  const remaining = [...pool];
  const choices: string[] = [];
  const synergyIds: string[] = [];
  const usedCategories = new Set<string>();

  while (choices.length < 3 && remaining.length > 0) {
    let totalWeight = 0;
    const weights = remaining.map((b) => {
      const info = cardDrawWeight(b, source, state.player.level, derived.effectiveStats.LUK, tagCounts);
      // Soft category diversity so the 3 cards feel distinct (e.g. Stat + Mutation + Capstone/Skill)
      const divMult = usedCategories.has(b.category) ? 0.52 : 1.0;
      const w = info.weight * divMult;
      totalWeight += w;
      return { w, hasSynergy: info.hasSynergy };
    });

    let roll = rng.float(0, totalWeight);
    let pickedIdx = 0;
    for (let i = 0; i < remaining.length; i++) {
      roll -= weights[i]!.w;
      if (roll <= 0) {
        pickedIdx = i;
        break;
      }
    }

    const chosen = remaining.splice(pickedIdx, 1)[0]!;
    const chosenMeta = weights[pickedIdx]!;
    choices.push(chosen.id);
    usedCategories.add(chosen.category);
    if (chosenMeta.hasSynergy) synergyIds.push(chosen.id);
  }

  saveOfferRng(state, rng.getState());
  return { source, choices, synergyIds };
}

export function enqueueOffer(state: GameState, data: GameData, source: 'levelup' | 'chest'): void {
  if (!state.pendingOffer) {
    const offer = rollBoonOffer(state, data, source);
    if (offer) {
      state.pendingOffer = offer;
      state.paused = true;
    }
    return;
  }
  state.offerQueue.push(source);
}

export function advanceOfferQueue(state: GameState, data: GameData): void {
  if (state.pendingOffer) return;
  while (state.offerQueue.length > 0) {
    const nextSource = state.offerQueue.shift()!;
    const offer = rollBoonOffer(state, data, nextSource);
    if (offer) {
      state.pendingOffer = offer;
      state.paused = true;
      return;
    }
  }
  state.paused = false;
}

export function pickBoon(state: GameState, data: GameData, boonId: string): boolean {
  if (!state.pendingOffer) return false;
  if (!state.pendingOffer.choices.includes(boonId)) return false;
  const boon = data.boonsById[boonId];
  if (!boon) return false;

  const prevDerived = computeDerivedStats(state, data);
  state.boonRanks[boonId] = (state.boonRanks[boonId] ?? 0) + 1;
  if (boon.relicId && !state.relics.includes(boon.relicId)) {
    state.relics.push(boon.relicId);
  }
  const nextDerived = computeDerivedStats(state, data);
  if (nextDerived.maxHp > prevDerived.maxHp) {
    state.player.hp = Math.min(nextDerived.maxHp, state.player.hp + (nextDerived.maxHp - prevDerived.maxHp));
  } else {
    state.player.hp = Math.min(nextDerived.maxHp, state.player.hp);
  }
  if (nextDerived.maxSp > prevDerived.maxSp) {
    state.player.sp = Math.min(nextDerived.maxSp, state.player.sp + (nextDerived.maxSp - prevDerived.maxSp));
  } else {
    state.player.sp = Math.min(nextDerived.maxSp, state.player.sp);
  }

  state.stats.boonsPicked += 1;
  state.events.push({
    type: 'notice',
    x: state.player.x,
    y: state.player.y,
    text: data.names.boons[boonId]?.name ?? boonId,
    color: boon.rarity === 'legendary' ? '#f97316' : '#fbbf24',
  });
  state.events.push({ type: 'sfx', sfx: 'buff' });

  state.pendingOffer = null;
  advanceOfferQueue(state, data);
  return true;
}

export const AMBER_REROLL_COST = 40;
export const AMBER_POTION_COST = 35;
export const AMBER_OFFER_COST = 85;

export function rerollOffer(state: GameState, data: GameData): boolean {
  if (!state.pendingOffer) return false;
  if (state.rerolls > 0) {
    state.rerolls -= 1;
  } else if (state.player.amber >= AMBER_REROLL_COST) {
    state.player.amber -= AMBER_REROLL_COST;
  } else {
    return false;
  }
  const next = rollBoonOffer(state, data, state.pendingOffer.source);
  if (next) state.pendingOffer = next;
  return true;
}

export function buyAmberOffer(state: GameState, data: GameData): boolean {
  if (state.status !== 'playing' || state.pendingOffer || state.player.amber < AMBER_OFFER_COST) {
    return false;
  }
  const offer = rollBoonOffer(state, data, 'chest');
  if (!offer) return false;
  state.player.amber -= AMBER_OFFER_COST;
  state.pendingOffer = offer;
  state.paused = true;
  state.events.push({ type: 'sfx', sfx: 'chest' });
  return true;
}

export function skipOffer(state: GameState, data: GameData): boolean {
  if (!state.pendingOffer) return false;
  const derived = computeDerivedStats(state, data);
  const heal = Math.round(derived.maxHp * 0.25);
  state.player.hp = Math.min(derived.maxHp, state.player.hp + heal);
  state.player.sp = Math.min(derived.maxSp, state.player.sp + Math.round(derived.maxSp * 0.35));
  state.player.amber += 35;
  state.events.push({ type: 'heal', targetId: 'player', x: state.player.x, y: state.player.y, amount: heal });
  state.pendingOffer = null;
  advanceOfferQueue(state, data);
  return true;
}

export function spawnAmberChestNearPlayer(state: GameState): void {
  const rng = createRng(state.rngCombatState);
  let chosenX = state.player.x;
  let chosenY = state.player.y;
  for (let i = 0; i < 24; i++) {
    const angle = rng.float(0, Math.PI * 2);
    const dist = rng.float(2.4, 4.6);
    const cx = state.player.x + Math.cos(angle) * dist;
    const cy = state.player.y + Math.sin(angle) * dist;
    if (isWalkable(state.zone, cx, cy)) {
      chosenX = cx;
      chosenY = cy;
      break;
    }
  }
  state.rngCombatState = rng.getState();
  state.drops.push({
    id: `drop_${state.nextEntityId++}`,
    kind: 'chest',
    x: chosenX,
    y: chosenY,
    amount: 1,
  });
  state.events.push({
    type: 'notice',
    x: chosenX,
    y: chosenY,
    text: '¡Cofre de Ámbar!',
    color: '#f59e0b',
  });
  state.events.push({ type: 'sfx', sfx: 'chest' });
}
