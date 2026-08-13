import { Action } from '../content/entity';
import { actionKind } from '../grammar/action';
import { addRanges, isPoint, midpoint, point, Range, sampleRange, scaleRange } from '../grammar/range';
import { actorEntity, participants, sideOf } from './encounter';
import { Registry } from '../content/registry';
import { itemContribution, scaledAmount, StatContribution } from './itemContribution';
import { itemInstance, itemTemplate } from './itemInstance';
import { nextRandom } from './rng';
import { skillLevel } from './skills';
import { ActiveBuff, GameState, PLAYER, RuntimeError } from './state';
import { contestSpread, defaultActionDuration, minDamage } from './tuning';
import { MS_PER_MINUTE, secondsToMs, toMilliUnits } from './units';
import { BonusAmount, TagClause } from '../grammar/tagClause';

// Difficulty is a stat, never an authored probability, so gear and buffs move it.
export function hitChance(accuracy: number, evasion: number, registry: Registry): number {
  return 1 / (1 + 10 ** ((evasion - accuracy) / contestSpread(registry)));
}

interface StatFold {
  added: Range;
  increased: number;
}

function foldBonus(bonus: BonusAmount, fold: StatFold, times: number): void {
  const scaled = scaledAmount(bonus, times);
  if (scaled.percent) fold.increased += scaled.amount / 100;
  else fold.added = addRanges(fold.added, scaled.amount);
}

function foldStatBonuses(tags: readonly TagClause[], statId: string, fold: StatFold): void {
  for (const tag of tags) if (tag.kind === 'stat-bonus' && tag.statId === statId) foldBonus(tag, fold, 1);
}

// A worn item arrives already summarised, in the two channels this fold already
// has (c8, c18): what it is worth is assembled once, below here, so the screen
// that states it and the stat that spends it cannot be two answers.
function foldContribution(contributions: readonly StatContribution[], statId: string, fold: StatFold): void {
  for (const contribution of contributions) {
    if (contribution.statId !== statId) continue;
    fold.added = addRanges(fold.added, contribution.added);
    fold.increased += contribution.increased / 100;
  }
}

// A state holds one store of buffs, one of equipment and one of skill xp, and
// all three belong to `PLAYER`. Every other actor reads an empty store because
// it has none.
function ownStores(state: GameState, actorId: string): { buffs: ActiveBuff[]; equipped: string[]; xp: Record<string, number> } {
  const stored = actorId === PLAYER;
  return { buffs: stored ? Object.values(state.activeBuffs) : [], equipped: stored ? Object.values(state.equipped) : [], xp: stored ? state.xp : {} };
}

// Which skills an actor has is the entity's to say, so a skill sheet is read off
// whoever is being evaluated rather than off the player.
function foldSkillLevels(registry: Registry, actorId: string, statId: string, xp: Record<string, number>, fold: StatFold): void {
  for (const skillId of actorEntity(registry, actorId)?.skills ?? []) {
    const skill = registry.skills.get(skillId);
    if (!skill?.['per-level'] || skill['stat-id'] !== statId) continue;
    foldBonus(skill['per-level'], fold, skillLevel(xp[skillId] ?? 0));
  }
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
  foldSkillLevels(registry, actorId, statId, own.xp, fold);
  for (const buff of own.buffs) {
    if (buff.statId !== statId) continue;
    if (buff.kind === 'added') fold.added = addRanges(fold.added, buff.amount);
    else fold.increased += buff.amount;
  }
  foldStatBonuses(performing(state, registry, actorId)?.tags ?? [], statId, fold);
  // c21: a slot is the only place its copy is, so what is worn contributes on
  // the strength of being worn. Asking whether it is also carried would fold
  // nothing at all, because being worn is exactly what says it is not.
  for (const wornId of own.equipped) {
    const item = registry.items.get(itemTemplate(state, wornId));
    if (item) foldContribution(itemContribution(registry, item, itemInstance(state, wornId)), statId, fold);
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
