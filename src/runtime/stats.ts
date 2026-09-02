import { RuntimeError } from './error';
import { Action } from '../content/sections/entity';
import { actionAddress, actionTextSection } from '../content/sections/action';
import { actionKind } from '../grammar/action';
import { addRanges, isPoint, midpoint, point, Range, sampleRange, scaleRange } from '../grammar/range';
import { actorEntity, seatedAction } from './actionLookup';
import { sideOf } from '../grammar/action';
import { Registry } from '../content/registry';
import { carriedPassives, CounterLevel, itemContribution, scaledAmount, StatContribution } from './itemContribution';
import { Item } from '../content/sections/item';
import { itemInstance, itemTemplate } from './itemInstance';
import { nextRandom } from './rng';
import { skillLevel } from './skills';
import { skillTags } from '../content/sections/skill';
import { buffsOf, stackCount } from './buffs';
import { type BuffInstance, GameState, parseOwnerRef, PLAYER } from './state';
import { contestSpread, defaultActionDuration, minDamage } from './tuning';
import { fromMilliUnits, MS_PER_MINUTE, secondsToMs, toMilliUnits } from './units';
import { BonusAmount, Counter, TagClause } from '../grammar/tagClause';
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
  if (scaled.percent) fold.increased += scaled.amount;
  else fold.added = addRanges(fold.added, scaled.amount);
}

export function counterLevels(state: GameState, actorId: string = PLAYER): CounterLevel {
  const own = ownStores(state, actorId);
  const levels = actorId === PLAYER ? state.resources : state.activeAction?.actors?.[actorId]?.resources;
  const reads: Readonly<Record<Counter['kind'], (id: string) => number>> = {
    stack: (id) => stackCount(state, actorId, id),
    resource: (id) => Math.floor(fromMilliUnits(levels?.[id] ?? 0)),
    level: (id) => skillLevel(own.xp[id] ?? 0),
  };
  return (counter) => reads[counter.kind](counter.id);
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
    fold.increased += contribution.increased;
  }
}

function ownStores(state: GameState, actorId: string): { buffs: readonly BuffInstance[]; equipped: string[]; xp: Record<string, number> } {
  const stored = actorId === PLAYER;
  return { buffs: buffsOf(state, actorId), equipped: stored ? Object.values(state.equipped) : [], xp: stored ? state.xp : {} };
}

export interface StatSource {
  readonly kind: string;
  readonly id: string;
  readonly field: string;
}

const titled = (kind: string, id: string): StatSource => ({ kind, id, field: 'title' });

export interface ModifierCarrier {
  source: StatSource;
  hooks?: HookCarrier;
  tags?: readonly TagClause[];
  item?: Item;
  wornId?: string;
}

function passiveCarrier(registry: Registry, passiveId: string, paysOut: boolean): ModifierCarrier | undefined {
  const passive = registry.passives.get(passiveId);
  if (!passive) return undefined;
  const source = titled('passive', passiveId);
  return paysOut ? { source, hooks: passive, tags: passive.tags } : { source, hooks: passive };
}

export function modifierCarriers(state: GameState, registry: Registry, actorId: string): ModifierCarrier[] {
  const carriers: ModifierCarrier[] = [];
  const entity = actorEntity(registry, actorId);
  if (entity) carriers.push({ source: titled('entity', entity.id), hooks: entity });
  for (const passiveId of entity?.passives ?? []) {
    const carrier = passiveCarrier(registry, passiveId, true);
    if (carrier) carriers.push(carrier);
  }
  for (const skillId of entity?.skills ?? []) {
    const skill = registry.skills.get(skillId);
    if (skill) carriers.push({ source: titled('skill', skillId), tags: skillTags(skill) });
  }
  const race = actorId === PLAYER ? registry.races.get(state.player.race) : undefined;
  if (race) carriers.push({ source: titled('race', race.id), tags: race.tags });
  const own = ownStores(state, actorId);
  for (const buff of own.buffs) carriers.push({ source: titled('item', buff.source), tags: buff.tags });
  for (const wornId of own.equipped) {
    const templateId = itemTemplate(state, wornId);
    const item = registry.items.get(templateId);
    if (!item) continue;
    carriers.push({ source: titled('item', templateId), hooks: item, item, wornId });
    for (const passiveId of carriedPassives(registry, itemInstance(state, wornId))) {
      const carrier = passiveCarrier(registry, passiveId, false);
      if (carrier) carriers.push(carrier);
    }
  }
  return carriers;
}

function performing(state: GameState, registry: Registry, actorId: string): ModifierCarrier | undefined {
  const seat = state.activeAction?.roster?.[actorId];
  const action = seat && seatedAction(seat, registry, actorId);
  if (!seat || !action) return undefined;
  const { obj, objId } = parseOwnerRef(seat.ownerRef);
  return { source: { ...actionTextSection(obj, objId, action), field: actionAddress(action) }, tags: action.tags };
}

export function hasPool(state: GameState, registry: Registry, actorId: string, resourceId: string): boolean {
  const resource = registry.resources.get(resourceId);
  return resource !== undefined && statValue(resource.max, state, registry, actorId) > 0;
}

export interface StatPart extends StatFold {
  readonly source: StatSource;
}

export interface StatBreakdown {
  readonly base: Range;
  readonly parts: readonly StatPart[];
}

const contributes = (fold: StatFold): boolean => fold.increased !== 0 || fold.added.min !== 0 || fold.added.max !== 0;

const addressOf = (source: StatSource): string => [source.kind, source.id, source.field].join(' ');

export function statBreakdown(statId: string, state: GameState, registry: Registry, actorId: string = PLAYER): StatBreakdown {
  const counter = counterLevels(state, actorId);
  const carriers = modifierCarriers(state, registry, actorId);
  const seated = performing(state, registry, actorId);
  if (seated) carriers.unshift(seated);
  const parts = new Map<string, StatPart>();

  for (const carrier of carriers) {
    const fold: StatFold = { added: point(0), increased: 0 };
    if (carrier.tags) foldStatBonuses(carrier.tags, statId, fold, counter);
    if (carrier.item) foldContribution(itemContribution(registry, carrier.item, itemInstance(state, carrier.wornId!), counter), statId, fold);
    if (!contributes(fold)) continue;
    const address = addressOf(carrier.source);
    const held = parts.get(address);
    parts.set(address, held === undefined ? { source: carrier.source, ...fold } : { source: held.source, added: addRanges(held.added, fold.added), increased: held.increased + fold.increased });
  }

  const sheet = actorEntity(registry, actorId);
  if (sheet === undefined && actorId !== PLAYER)
    throw new RuntimeError(`${actorId} is asked for ${statId} and is no entity, so it carries no sheet to read one off — only the player is a side rather than a member of one`);
  return { base: sheet?.stats[statId] ?? registry.stats.get(statId)?.base ?? point(0), parts: [...parts.values()] };
}

export function foldStat({ base, parts }: StatBreakdown): Range {
  let added = base;
  let increased = 0;
  for (const part of parts) {
    added = addRanges(added, part.added);
    increased += part.increased;
  }
  return scaleRange(added, 1 + increased / 100);
}

export function statRange(statId: string, state: GameState, registry: Registry, actorId: string = PLAYER): Range {
  return foldStat(statBreakdown(statId, state, registry, actorId));
}

export function statChanged(statId: string, state: GameState, registry: Registry, actorId: string = PLAYER): boolean {
  return statBreakdown(statId, state, registry, actorId).parts.length > 0;
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
  if (perMinute <= 0) return Infinity;
  const duration = Math.floor(MS_PER_MINUTE / perMinute);
  if (!Number.isFinite(duration) || duration < 0) {
    throw new RuntimeError(`action ${action.label} resolved an impossible attempt duration (${duration}) from rate: ${perMinute} per minute`);
  }
  return duration;
}

export const stalledPace = (duration: number): boolean => !Number.isFinite(duration);
