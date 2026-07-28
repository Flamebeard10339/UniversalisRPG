import { Action } from './entity';
import { addRanges, isPoint, midpoint, point, Range, sampleRange, scaleRange } from './range';
import { findActiveAction } from './actions';
import { Registry } from './registry';
import { nextRandom } from './rng';
import { GameState, PLAYER, RuntimeError } from './state';
import { contestSpread, minDamage } from './tuning';

// Difficulty is a stat, never an authored probability, so gear and buffs move it.
export function hitChance(accuracy: number, evasion: number, registry: Registry): number {
  return 1 / (1 + 10 ** ((evasion - accuracy) / contestSpread(registry)));
}

export function statRange(statId: string, state: GameState, registry: Registry, actorId: string = PLAYER): Range {
  let added = registry.entities.get(actorId)?.stats[statId] ?? registry.stats.get(statId)?.base ?? point(0);
  let increased = 0;
  if (actorId === PLAYER) {
    for (const buff of Object.values(state.activeBuffs)) {
      if (buff.statId !== statId) continue;
      if (buff.kind === 'added') added = addRanges(added, buff.amount);
      else increased += buff.amount;
    }
    if (state.activeAction) {
      const action = findActiveAction(state.activeAction, registry);
      for (const tag of action.tags ?? []) {
        if (tag.kind !== 'stat-bonus' || tag.statId !== statId) continue;
        if (tag.percent) increased += tag.amount / 100;
        else added = addRanges(added, tag.amount);
      }
    }
  }
  return scaleRange(added, 1 + increased);
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
  return Math.max(minDamage(registry), Math.trunc(attack - dr));
}

export function attemptDuration(action: Action, state: GameState, registry: Registry, actorId: string = PLAYER): number {
  const speed = action.speed ? statValue(action.speed, state, registry, actorId) : 1;
  const duration = (action.time ?? 0) / speed;
  // Zero stays legal: an action with no time: is instant.
  if (!Number.isFinite(duration) || duration < 0) {
    throw new RuntimeError(
      `action ${action.label} resolved an impossible attempt duration (${duration}) from time: ${action.time ?? 0} and speed stat ${action.speed ?? '1'} = ${speed}`,
    );
  }
  return duration;
}
