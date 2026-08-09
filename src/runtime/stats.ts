import { Action } from '../content/entity';
import { actionKind } from '../grammar/action';
import { addRanges, isPoint, midpoint, point, Range, sampleRange, scaleRange } from '../grammar/range';
import { actorEntity, participants, sideOf } from './encounter';
import { Registry } from '../content/registry';
import { nextRandom } from './rng';
import { ActiveBuff, GameState, PLAYER, RuntimeError } from './state';
import { contestSpread, defaultActionDuration, minDamage } from './tuning';
import { MS_PER_MINUTE, secondsToMs, toMilliUnits } from './units';
import { TagClause } from '../grammar/tagClause';

// Difficulty is a stat, never an authored probability, so gear and buffs move it.
export function hitChance(accuracy: number, evasion: number, registry: Registry): number {
  return 1 / (1 + 10 ** ((evasion - accuracy) / contestSpread(registry)));
}

interface StatFold {
  added: Range;
  increased: number;
}

function foldStatBonuses(tags: readonly TagClause[], statId: string, fold: StatFold): void {
  for (const tag of tags) {
    if (tag.kind !== 'stat-bonus' || tag.statId !== statId) continue;
    if (tag.percent) fold.increased += tag.amount / 100;
    else fold.added = addRanges(fold.added, tag.amount);
  }
}

// What an actor carries of its own. `activeBuffs` and `equipped` are the stores
// of the entity this save is about; a fight-scoped participant is minted with
// the fight and owns nothing, so it reads empty rather than reading the
// player's sword.
function ownStores(state: GameState, actorId: string): { buffs: ActiveBuff[]; equipped: string[] } {
  const durable = actorId === PLAYER;
  return { buffs: durable ? Object.values(state.activeBuffs) : [], equipped: durable ? Object.values(state.equipped) : [] };
}

// The action this actor is performing, which is where its tag bonuses come from
// — read off the participant rather than off `state.activeAction`, so a bonus on
// the rat's swing lands on the rat.
function performing(state: GameState, registry: Registry, actorId: string): Action | undefined {
  if (!state.activeAction) return undefined;
  return participants(state, registry).find((each) => each.self === actorId)?.action;
}

export function statRange(statId: string, state: GameState, registry: Registry, actorId: string = PLAYER): Range {
  const fold: StatFold = {
    added: actorEntity(registry, actorId)?.stats[statId] ?? registry.stats.get(statId)?.base ?? point(0),
    increased: 0,
  };
  const own = ownStores(state, actorId);
  for (const buff of own.buffs) {
    if (buff.statId !== statId) continue;
    if (buff.kind === 'added') fold.added = addRanges(fold.added, buff.amount);
    else fold.increased += buff.amount;
  }
  foldStatBonuses(performing(state, registry, actorId)?.tags ?? [], statId, fold);
  for (const itemId of own.equipped) {
    if ((state.inventory[itemId] ?? 0) === 0) continue;
    const item = registry.items.get(itemId);
    if (item) foldStatBonuses(item.tags, statId, fold);
  }
  return scaleRange(fold.added, 1 + fold.increased);
}

// Midpoint, not a sample: pool ceilings and durations must not jitter.
export function statValue(statId: string, state: GameState, registry: Registry, actorId: string = PLAYER): number {
  return midpoint(statRange(statId, state, registry, actorId));
}

export function sampleStat(statId: string, state: GameState, registry: Registry, actorId: string = PLAYER): number {
  const range = statRange(statId, state, registry, actorId);
  return isPoint(range) ? range.min : sampleRange(range, nextRandom(state));
}

export function hitDamage(attack: number, dr: number, registry: Registry): number {
  const floor = Math.max(1, Math.min(toMilliUnits(minDamage(registry)), toMilliUnits(attack)));
  return Math.max(floor, toMilliUnits(attack - dr));
}

// The one place the three kinds and the two cadence spellings meet a clock.
// `rate` is the live half: a stat there is read against whoever is swinging, so
// a buff moves the cadence without the action knowing.
export function attemptDuration(action: Action, state: GameState, registry: Registry, actorId: string = PLAYER, other: string = actorId): number {
  if (actionKind(action) === 'instant') return 0;
  if (action.rate === undefined) return secondsToMs(action.time ?? defaultActionDuration(registry));

  const perMinute = typeof action.rate === 'number' ? action.rate : statValue(action.rate.id, state, registry, sideOf(action.rate, actorId, other));
  const duration = Math.floor(MS_PER_MINUTE / perMinute);
  if (!Number.isFinite(duration) || duration < 0) {
    throw new RuntimeError(`action ${action.label} resolved an impossible attempt duration (${duration}) from rate: ${perMinute} per minute`);
  }
  return duration;
}
