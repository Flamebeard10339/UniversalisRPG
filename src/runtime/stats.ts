import { RuntimeError } from './error';
import { Action } from '../content/entity';
import { actionKind } from '../grammar/action';
import { addRanges, isPoint, midpoint, point, Range, sampleRange, scaleRange } from '../grammar/range';
import { actorEntity, participants, sideOf } from './encounter';
import { Registry } from '../content/registry';
import { carriedPassives, CounterLevel, itemContribution, scaledAmount, StatContribution } from './itemContribution';
import { Item } from '../content/item';
import { itemInstance, itemTemplate } from './itemInstance';
import { nextRandom } from './rng';
import { skillLevel } from './skills';
import { BuffInstance, buffsOf, stackCount } from './buffs';
import { GameState, PLAYER } from './state';
import { contestSpread, defaultActionDuration, minDamage } from './tuning';
import { fromMilliUnits, MS_PER_MINUTE, secondsToMs, toMilliUnits } from './units';
import { BonusAmount, TagClause } from '../grammar/tagClause';
import { HookCarrier } from '../grammar/hook';

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

// A resource's level or a buff's stack count, beside a skill's, as a source for
// the count `foldBonus` and `itemContribution` both multiply by. Floored,
// because `per fury` is per point of it, and zero for a character holding no
// such pool. This is the path by which a stack is worth more than the last:
// what a buff pays out is its own payload, and what a counter reads is how many
// of it are held.
export function counterLevels(state: GameState, actorId: string = PLAYER): CounterLevel {
  const levels = actorId === PLAYER ? state.resources : state.activeAction?.actors?.[actorId]?.resources;
  return (counter) => (counter.kind === 'stack' ? stackCount(state, actorId, counter.id) : Math.floor(fromMilliUnits(levels?.[counter.id] ?? 0)));
}

function foldStatBonuses(tags: readonly TagClause[], statId: string, fold: StatFold, counter: CounterLevel): void {
  for (const tag of tags) {
    if (tag.kind !== 'stat-bonus' || tag.statId !== statId) continue;
    foldBonus(tag, fold, tag.per === undefined ? 1 : counter(tag.per));
  }
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

// A state holds one store of equipment and one of skill xp, and both belong to
// `PLAYER`; every other actor reads an empty store because it has none. Buffs
// are not among them: buffs.ts holds them per character, so a rat reads its own
// the way the player reads theirs.
function ownStores(state: GameState, actorId: string): { buffs: readonly BuffInstance[]; equipped: string[]; xp: Record<string, number> } {
  const stored = actorId === PLAYER;
  return { buffs: buffsOf(state, actorId), equipped: stored ? Object.values(state.equipped) : [], xp: stored ? state.xp : {} };
}

// What a character carries a modifier on, and the order a fold reads them in:
// its own sheet and the passives it was authored with, then what is buffing it,
// then each equipped item it still carries and the passives that item's spent
// points stand on. A stat bonus and a hook are read off this one walk, so a
// source appears on it once and joins as a carrier of both at once. A skill's
// `per-level:` is not here because it is a declaration on `# skill` rather
// than a thing carried, and the performing action is not here because an
// action is a verb and no character carries it.
export interface ModifierCarrier {
  // Absent where the source declares no hook block, which a buff never does:
  // what it grants is an amount the engine wrote and not an authored section.
  hooks?: HookCarrier;
  // What this source pays out by itself. Absent on a worn item and on the
  // passives its plane holds, because `itemContribution` assembles both into
  // one worth and folding them here as well would pay them twice.
  tags?: readonly TagClause[];
  // The worn item and the id its slot holds, which is what `itemContribution`
  // assembles a worth off — the copy, never the template.
  item?: Item;
  wornId?: string;
}

// A declaration this character carries, whether it pays out here or has already
// been counted into an item's worth.
function passiveCarrier(registry: Registry, passiveId: string, paysOut: boolean): ModifierCarrier | undefined {
  const passive = registry.passives.get(passiveId);
  if (!passive) return undefined;
  return paysOut ? { hooks: passive, tags: passive.tags } : { hooks: passive };
}

export function modifierCarriers(state: GameState, registry: Registry, actorId: string): ModifierCarrier[] {
  const carriers: ModifierCarrier[] = [];
  const entity = actorEntity(registry, actorId);
  if (entity) carriers.push({ hooks: entity });
  for (const passiveId of entity?.passives ?? []) {
    const carrier = passiveCarrier(registry, passiveId, true);
    if (carrier) carriers.push(carrier);
  }
  const own = ownStores(state, actorId);
  for (const buff of own.buffs) carriers.push({ tags: buff.tags });
  for (const wornId of own.equipped) {
    const item = registry.items.get(itemTemplate(state, wornId));
    if (!item) continue;
    carriers.push({ hooks: item, item, wornId });
    for (const passiveId of carriedPassives(registry, item, itemInstance(state, wornId))) {
      const carrier = passiveCarrier(registry, passiveId, false);
      if (carrier) carriers.push(carrier);
    }
  }
  return carriers;
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
  const counter = counterLevels(state, actorId);
  foldSkillLevels(registry, actorId, statId, ownStores(state, actorId).xp, fold);
  foldStatBonuses(performing(state, registry, actorId)?.tags ?? [], statId, fold, counter);
  // c21: a slot is the only place its copy is, so what is worn contributes on
  // the strength of being worn. Asking whether it is also carried would fold
  // nothing at all, because being worn is exactly what says it is not.
  for (const carrier of modifierCarriers(state, registry, actorId)) {
    if (carrier.tags) foldStatBonuses(carrier.tags, statId, fold, counter);
    if (carrier.item) foldContribution(itemContribution(registry, carrier.item, itemInstance(state, carrier.wornId!), counter), statId, fold);
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
