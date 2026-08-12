import { Action } from '../content/entity';
import { actionKind } from '../grammar/action';
import { addRanges, isPoint, midpoint, point, Range, sampleRange, scaleRange } from '../grammar/range';
import { actorEntity, participants, sideOf } from './encounter';
import { Registry } from '../content/registry';
import { instancePayloads } from './clusterEffect';
import { originPlane } from './clusterPlane';
import { carriesItem, itemInstance, itemTemplate } from './itemInstance';
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

// The one multiplication of a BonusAmount there is. A surface that shows what a
// payload is worth calls this rather than scaling for itself, so the number on
// screen and the number the fold takes cannot be two different answers (c19).
export function scaledAmount(bonus: BonusAmount, times: number): BonusAmount {
  return bonus.percent ? { percent: true, amount: bonus.amount * times } : { percent: false, amount: scaleRange(bonus.amount, times) };
}

function foldBonus(bonus: BonusAmount, fold: StatFold, times: number): void {
  const scaled = scaledAmount(bonus, times);
  if (scaled.percent) fold.increased += scaled.amount / 100;
  else fold.added = addRanges(fold.added, scaled.amount);
}

function foldStatBonuses(tags: readonly TagClause[], statId: string, fold: StatFold): void {
  for (const tag of tags) if (tag.kind === 'stat-bonus' && tag.statId === statId) foldBonus(tag, fold, 1);
}

// A worn item that was grown adds no channel and no arithmetic (c18): what its
// cluster effects decided a payload is worth arrives as the same `times` a
// skill's level arrives as, through the same fold. A worn stack copy is the
// degenerate argument to the same instancePayloads (c9, c20): zero experience
// and the item's default plane, not a second path that skips the fold.
function foldPlanePayloads(registry: Registry, state: GameState, wornId: string, statId: string, fold: StatFold): void {
  const item = registry.items.get(itemTemplate(state, wornId));
  if (!item) return;
  const instance = itemInstance(state, wornId) ?? { experience: 0, plane: originPlane(item.clusterJewel ?? null) };
  for (const payload of instancePayloads(registry, instance)) {
    if (payload.statId === statId) foldBonus(payload.bonus, fold, payload.scale);
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
  for (const wornId of own.equipped) {
    if (!carriesItem(state, wornId)) continue;
    const item = registry.items.get(itemTemplate(state, wornId));
    if (item) foldStatBonuses(item.tags, statId, fold);
    foldPlanePayloads(registry, state, wornId, statId, fold);
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
