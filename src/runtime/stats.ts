import { Action } from '../content/entity';
import { addRanges, isPoint, midpoint, point, Range, sampleRange, scaleRange } from '../grammar/range';
import { findActiveAction } from './actions';
import { Registry } from '../content/registry';
import { nextRandom } from './rng';
import { GameState, PLAYER, RuntimeError } from './state';
import { contestSpread, minDamage } from './tuning';
import { secondsToMs, toMilliUnits } from './units';
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

export function statRange(statId: string, state: GameState, registry: Registry, actorId: string = PLAYER): Range {
  const fold: StatFold = {
    added: registry.entities.get(actorId)?.stats[statId] ?? registry.stats.get(statId)?.base ?? point(0),
    increased: 0,
  };
  if (actorId === PLAYER) {
    for (const buff of Object.values(state.activeBuffs)) {
      if (buff.statId !== statId) continue;
      if (buff.kind === 'added') fold.added = addRanges(fold.added, buff.amount);
      else fold.increased += buff.amount;
    }
    if (state.activeAction) {
      foldStatBonuses(findActiveAction(state.activeAction, registry).tags ?? [], statId, fold);
    }
    // Equipped but no longer carried contributes nothing, so a `take:` that
    // removes the last copy needs no second write to keep the slot honest.
    for (const itemId of Object.values(state.equipped)) {
      if ((state.inventory[itemId] ?? 0) === 0) continue;
      const item = registry.items.get(itemId);
      if (item) foldStatBonuses(item.tags, statId, fold);
    }
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

// The floor answers damage reduction, so it never exceeds what the unreduced
// attack would have done — an `ability:` below `min-damage` is worth its own
// value, not the floor. It stays above zero whatever the stats say, because a
// hit worth nothing empties no pool and ends no fight.
export function hitDamage(attack: number, dr: number, registry: Registry): number {
  const floor = Math.max(1, Math.min(toMilliUnits(minDamage(registry)), toMilliUnits(attack)));
  return Math.max(floor, toMilliUnits(attack - dr));
}

export function attemptDuration(action: Action, state: GameState, registry: Registry, actorId: string = PLAYER): number {
  const speed = action.speed ? statValue(action.speed, state, registry, actorId) : 1;
  const timeMs = secondsToMs(action.time ?? 0);
  const duration = Math.floor(timeMs / speed);
  if (!Number.isFinite(duration) || duration < 0) {
    throw new RuntimeError(
      `action ${action.label} resolved an impossible attempt duration (${duration}) from time: ${action.time ?? 0} and speed stat ${action.speed ?? '1'} = ${speed}`,
    );
  }
  return duration;
}
