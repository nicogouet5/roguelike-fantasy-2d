import type { GameData } from './data.ts';
import { isWalkable } from './mapGen.ts';
import { createRng } from './rng.ts';
import { computeDerivedStats } from './stats.ts';
import type { BoonDef, BoonOffer, GameState } from './types.ts';

function nextOfferRng(state: GameState) {
  return createRng(state.rngOfferState);
}

function saveOfferRng(state: GameState, rngState: number): void {
  state.rngOfferState = rngState;
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

function rarityWeight(boon: BoonDef, source: 'levelup' | 'chest'): number {
  if (source === 'chest') {
    if (boon.rarity === 'epic') return 36;
    if (boon.rarity === 'rare') return 48;
    return 16;
  }
  if (boon.rarity === 'epic') return 14;
  if (boon.rarity === 'rare') return 36;
  return 50;
}

export function rollBoonOffer(
  state: GameState,
  data: GameData,
  source: 'levelup' | 'chest'
): BoonOffer | null {
  const pool = getEligibleBoons(state, data);
  if (pool.length === 0) return null;

  const rng = nextOfferRng(state);
  const remaining = [...pool];
  const choices: string[] = [];

  while (choices.length < 3 && remaining.length > 0) {
    let totalWeight = 0;
    for (const b of remaining) totalWeight += rarityWeight(b, source);
    let roll = rng.float(0, totalWeight);
    let pickedIdx = 0;
    for (let i = 0; i < remaining.length; i++) {
      roll -= rarityWeight(remaining[i]!, source);
      if (roll <= 0) {
        pickedIdx = i;
        break;
      }
    }
    const chosen = remaining.splice(pickedIdx, 1)[0]!;
    choices.push(chosen.id);
  }

  saveOfferRng(state, rng.getState());
  return { source, choices };
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
  }
  if (nextDerived.maxSp > prevDerived.maxSp) {
    state.player.sp = Math.min(nextDerived.maxSp, state.player.sp + (nextDerived.maxSp - prevDerived.maxSp));
  }

  state.stats.boonsPicked += 1;
  state.events.push({
    type: 'notice',
    x: state.player.x,
    y: state.player.y,
    text: data.names.boons[boonId]?.name ?? boonId,
    color: '#fbbf24',
  });
  state.events.push({ type: 'sfx', sfx: 'buff' });

  state.pendingOffer = null;
  advanceOfferQueue(state, data);
  return true;
}

export function rerollOffer(state: GameState, data: GameData): boolean {
  if (!state.pendingOffer || state.rerolls <= 0) return false;
  state.rerolls -= 1;
  const next = rollBoonOffer(state, data, state.pendingOffer.source);
  if (next) state.pendingOffer = next;
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
