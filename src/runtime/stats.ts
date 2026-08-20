import { RuntimeError } from './error';
import { Action } from '../content/sections/entity';
import { actionKind } from '../grammar/action';
import { addRanges, isPoint, midpoint, point, Range, sampleRange, scaleRange } from '../grammar/range';
import { actorEntity, participants } from './roster';
import { sideOf } from '../grammar/action';
import { Registry } from '../content/registry';
import { carriedPassives, CounterLevel, itemContribution, scaledAmount, StatContribution } from './itemContribution';
import { Item } from '../content/sections/item';
import { itemInstance, itemTemplate } from './itemInstance';
import { nextRandom } from './rng';
import { skillLevel } from './skills';
import { buffsOf, stackCount } from './buffs';
import { type BuffInstance, GameState, PLAYER } from './state';
import { contestSpread, defaultActionDuration, minDamage } from './tuning';
import { fromMilliUnits, MS_PER_MINUTE, secondsToMs, toMilliUnits } from './units';
import { BonusAmount, TagClause } from '../grammar/tagClause';
import { HookCarrier } from '../grammar/hook';

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

function foldContribution(contributions: readonly StatContribution[], statId: string, fold: StatFold): void {
  for (const contribution of contributions) {
    if (contribution.statId !== statId) continue;
    fold.added = addRanges(fold.added, contribution.added);
    fold.increased += contribution.increased / 100;
  }
}

function ownStores(state: GameState, actorId: string): { buffs: readonly BuffInstance[]; equipped: string[]; xp: Record<string, number> } {
  const stored = actorId === PLAYER;
  return { buffs: buffsOf(state, actorId), equipped: stored ? Object.values(state.equipped) : [], xp: stored ? state.xp : {} };
}

export interface ModifierCarrier {
  hooks?: HookCarrier;
  tags?: readonly TagClause[];
  item?: Item;
  wornId?: string;
}

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

function foldSkillLevels(registry: Registry, actorId: string, statId: string, xp: Record<string, number>, fold: StatFold): void {
  for (const skillId of actorEntity(registry, actorId)?.skills ?? []) {
    const skill = registry.skills.get(skillId);
    if (!skill?.['per-level'] || skill['stat-id'] !== statId) continue;
    foldBonus(skill['per-level'], fold, skillLevel(xp[skillId] ?? 0));
  }
}

function performing(state: GameState, registry: Registry, actorId: string): Action | undefined {
  if (!state.activeAction) return undefined;
  return participants(state, registry).find((each) => each.self === actorId)?.action;
}

export function hasPool(state: GameState, registry: Registry, actorId: string, resourceId: string): boolean {
  const resource = registry.resources.get(resourceId);
  return resource !== undefined && statValue(resource.max, state, registry, actorId) > 0;
}

export function statRange(statId: string, state: GameState, registry: Registry, actorId: string = PLAYER): Range {
  const fold: StatFold = {
    added: actorEntity(registry, actorId)?.stats[statId] ?? registry.stats.get(statId)?.base ?? point(0),
    increased: 0,
  };
  const counter = counterLevels(state, actorId);
  foldSkillLevels(registry, actorId, statId, ownStores(state, actorId).xp, fold);
  foldStatBonuses(performing(state, registry, actorId)?.tags ?? [], statId, fold, counter);
  for (const carrier of modifierCarriers(state, registry, actorId)) {
    if (carrier.tags) foldStatBonuses(carrier.tags, statId, fold, counter);
    if (carrier.item) foldContribution(itemContribution(registry, carrier.item, itemInstance(state, carrier.wornId!), counter), statId, fold);
  }
  return scaleRange(fold.added, 1 + fold.increased);
}

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
