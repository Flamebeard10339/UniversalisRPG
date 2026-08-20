import { endAction } from './actionEnd';
import { RuntimeError } from './error';
import { ActionResult, DropRow, nestedResults, Party } from '../grammar/actionResult';
import { DISCOVERED } from '../content/location';
import { DropTable } from '../content/dropTable';
import { EventTrigger, GameEvent } from '../content/event';
import { isPoint, Range, sampleCount, sampleRange } from '../grammar/range';
import { Registry } from '../content/registry';
import { Resource } from '../content/resource';
import { evaluateCondition } from './conditions';
import { actorEntity } from './roster';
import { hasPool } from './stats';
import { stockItem } from './itemInstance';
import { openModalNamed } from './modalStack';
import { localizerOf } from './localized';
import { nextRandom } from './rng';
import { experienceFor } from './skillGrants';
import { skillLevel } from './skills';
import { GameState, PLAYER } from './state';
import { hitChance, statValue } from './stats';
import { divideRateRemainder, toMilliUnits } from './units';
import { applyDeclared } from './buffs';

export interface Segment {
  state: GameState;
  registry: Registry;
  deltas: PoolDeltas;
  stopped: boolean;
  observers: readonly ResultObserver[];
  causedBy: Map<string, string>;
  credit?: string;
  parties?: { readonly [P in Party]: string };
}
export type PoolDeltas = Map<string, Map<string, number>>;

export interface ResultApplication {
  result: ActionResult;
  actor: string;
  magnitude: number;
  lead: boolean;
}

export type ResultObserver = (segment: Segment, application: ResultApplication) => void;

const narrateModal: ResultObserver = ({ state, registry }, { result, lead }) => {
  if (result.kind !== 'open-modal' || !lead) return;
  const localizer = localizerOf(registry, state);
  state.log.push(localizer.engine('engine.modal.opened', { modal: localizer.identifier(result.modal) }));
};

export const RESULT_OBSERVERS: readonly ResultObserver[] = [narrateModal];

export function newSegment(state: GameState, registry: Registry, observers: readonly ResultObserver[] = RESULT_OBSERVERS): Segment {
  return { state, registry, deltas: new Map(), stopped: false, observers, causedBy: new Map() };
}

const eventIndexes = new WeakMap<Registry, Map<string, GameEvent[]>>();

const NO_EVENTS: readonly GameEvent[] = [];

export function eventsFor(registry: Registry, resourceId: string | undefined, trigger: EventTrigger): readonly GameEvent[] {
  let index = eventIndexes.get(registry);
  if (index === undefined) {
    index = new Map();
    for (const event of registry.events.values()) {
      const key = `${event.trigger}|${event.resource ?? ''}`;
      const held = index.get(key);
      if (held) held.push(event);
      else index.set(key, [event]);
    }
    eventIndexes.set(registry, index);
  }
  return index.get(`${trigger}|${resourceId ?? ''}`) ?? NO_EVENTS;
}

export function addDelta(deltas: PoolDeltas, actorId: string, resourceId: string, milliAmount: number): void {
  if (!deltas.has(actorId)) deltas.set(actorId, new Map());
  const actorDeltas = deltas.get(actorId)!;
  actorDeltas.set(resourceId, (actorDeltas.get(resourceId) ?? 0) + milliAmount);
}

export function getDelta(deltas: PoolDeltas, actorId: string, resourceId: string): number {
  return deltas.get(actorId)?.get(resourceId) ?? 0;
}

export function clearActorDeltas(deltas: PoolDeltas, actorId: string): void {
  deltas.delete(actorId);
}

export function samplesPerApplication(results: readonly ActionResult[]): boolean {
  return results.some((result) => {
    if (nestedResults(result).length > 0 || result.kind === 'roll') return true;
    if (result.kind === 'give') return result.amount !== undefined && !isPoint(result.amount);
    if (result.kind === 'xp') return !isPoint(result.amount);
    if (result.kind === 'pool') return !isPoint(result.delta);
    return false;
  });
}

function drawCount(state: GameState, amount: Range | undefined): number {
  if (amount === undefined) return 1;
  return isPoint(amount) ? amount.min : sampleCount(amount, nextRandom(state));
}

function drawAmount(state: GameState, amount: Range): number {
  return isPoint(amount) ? amount.min : sampleRange(amount, nextRandom(state));
}

function statSide(value: number | string, state: GameState, registry: Registry): number {
  return typeof value === 'number' ? value : statValue(value, state, registry);
}

function selectRow(rows: readonly DropRow[], state: GameState, registry: Registry): DropRow | undefined {
  const live = rows.filter((row) => row.requires === undefined || evaluateCondition(row.requires, state));
  const weights = live.map((row) => Math.max(0, statSide(row.weight, state, registry)));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return undefined;
  let picked = nextRandom(state) * total;
  for (let i = 0; i < live.length; i++) {
    picked -= weights[i];
    if (picked < 0) return live[i];
  }
  return live[live.length - 1];
}

function requireDropTable(registry: Registry, id: string): DropTable {
  const table = registry.dropTables.get(id);
  if (!table) throw new RuntimeError(`unknown droptable: ${id}`);
  return table;
}

export function applyResults(segment: Segment, results: readonly ActionResult[], actor: string, count = 1, lead = true): void {
  if (count <= 0) return;
  if (count > 1 && samplesPerApplication(results)) {
    for (let i = 0; i < count && !segment.stopped; i++) applyResults(segment, results, actor, 1, lead && i === 0);
    return;
  }

  for (const result of results) {
    const magnitude = applyOne(segment, result, actor, count, lead);
    if (magnitude === undefined) continue;
    for (const observer of segment.observers) observer(segment, { result, actor, magnitude, lead });
  }
}

export function spreadDiscovery(state: GameState, registry: Registry): void {
  const here = registry.locations.get(state.location);
  if (!here) return;
  state.flags[`${here.id}.${DISCOVERED}`] = true;
  for (const edge of here.adjacent) {
    const key = `${edge.target}.${DISCOVERED}`;
    if (state.flags[key]) continue;
    if (edge.condition && !evaluateCondition(edge.condition, state)) continue;
    state.flags[key] = true;
  }
}

export function relocateTo(state: GameState, registry: Registry, location: string): void {
  state.location = location;
  spreadDiscovery(state, registry);
}

function subjectOf(segment: Segment, party: Party | undefined, actor: string): string {
  return party === undefined ? actor : segment.parties?.[party] ?? actor;
}

function applyOne(segment: Segment, result: ActionResult, actor: string, count: number, lead: boolean): number | undefined {
  const { state, registry } = segment;
  switch (result.kind) {
    case 'say':
      if (!lead) return undefined;
      if (result.key === undefined) throw new RuntimeError(`a say: reached the log with no address: ${JSON.stringify(result.text)}`);
      state.log.push(localizerOf(registry, state).spoken(result.key));
      return 0;
    case 'set':
      state.flags[result.variable] = true;
      spreadDiscovery(state, registry);
      return 0;
    case 'unset':
      delete state.flags[result.variable];
      spreadDiscovery(state, registry);
      return 0;
    case 'add': {
      const current = state.flags[result.variable];
      const base = typeof current === 'number' ? current : 0;
      const amount = result.amount * count;
      state.flags[result.variable] = base + amount;
      spreadDiscovery(state, registry);
      return amount;
    }
    case 'give':
      return stockItem(state, result.item, drawCount(state, result.amount) * count);
    case 'take':
      return stockItem(state, result.item, -(result.amount ?? 1) * count);
    case 'xp': {
      const amount = drawCount(state, result.amount) * count;
      const before = state.xp[result.skill] ?? 0;
      state.xp[result.skill] = before + amount;
      const reached = skillLevel(state.xp[result.skill]);
      if (reached > skillLevel(before)) {
        const localizer = localizerOf(registry, state);
        state.log.push(localizer.engine('engine.skill.levelled', { skill: localizer.title('skill', result.skill), level: reached }));
      }
      return amount;
    }
    case 'relocate':
      relocateTo(state, registry, result.location);
      return 0;
    case 'discover':
      state.flags[`${result.location}.${DISCOVERED}`] = true;
      return 0;
    case 'open-modal':
      openModalNamed(state, result.modal);
      return 0;
    case 'pool': {
      requireResource(registry, result.resource);
      const milliAmount = toMilliUnits(drawAmount(state, result.delta)) * count;
      addDelta(segment.deltas, subjectOf(segment, result.party, actor), result.resource, milliAmount);
      return milliAmount;
    }
    case 'inflict': {
      const source = registry.items.get(result.buff);
      if (!source) throw new RuntimeError(`unknown buff source: ${result.buff}`);
      for (let i = 0; i < count; i++) applyDeclared(state, subjectOf(segment, result.party, actor), source, state.time);
      return count;
    }
    case 'stop':
      segment.stopped = true;
      return 0;
    case 'chance':
      if (nextRandom(state) * result.denominator < result.numerator) applyResults(segment, result.results, actor, count);
      return undefined;
    case 'contest':
      if (nextRandom(state) < hitChance(statSide(result.left, state, registry), statSide(result.right, state, registry), registry)) {
        applyResults(segment, result.results, actor, count);
      }
      return undefined;
    case 'gate':
      if (evaluateCondition(result.condition, state)) applyResults(segment, result.results, actor, count);
      return undefined;
    case 'credit':
      applyResults(segment, result.results, segment.credit ?? actor, count);
      return undefined;
    case 'one-of': {
      const row = selectRow(result.rows, state, registry);
      if (row) applyResults(segment, row.results, actor, count);
      return undefined;
    }
    case 'roll':
      applyResults(segment, requireDropTable(registry, result.table).results, actor, count);
      return undefined;
    default: {
      const unreached: never = result;
      return unreached;
    }
  }
}

export function applyResultsNow(state: GameState, registry: Registry, results: readonly ActionResult[] | undefined, count = 1): void {
  const segment = newSegment(state, registry);
  applyResults(segment, results ?? [], PLAYER, count);
  settlePools(state, registry, [], 0, segment.deltas);
  if (segment.stopped) endAction(state);
}

export function initResources(state: GameState, registry: Registry): void {
  for (const resource of registry.resources.values()) {
    if (state.resources[resource.id] === undefined) {
      levels(state)[resource.id] = toMilliUnits(resource.start ?? statValue(resource.max, state, registry));
    }
  }
}

export interface ResourceSnapshot {
  resource: Resource;
  actorId: string;
  ratePerMinute: number;
  max: number;
}

export function captureResourceRates(state: GameState, registry: Registry): ResourceSnapshot[] {
  const snapshots: ResourceSnapshot[] = [];
  const actors = [PLAYER];
  if (state.activeAction?.actors) {
    actors.push(...Object.keys(state.activeAction.actors));
  }
  for (const actorId of actors) {
    for (const resource of registry.resources.values()) {
      if (!hasPool(state, registry, actorId, resource.id)) continue;
      const ratePerMinute = resource.rate ? toMilliUnits(statValue(resource.rate, state, registry, actorId)) : 0;
      if (ratePerMinute === 0) continue;
      snapshots.push({ resource, actorId, ratePerMinute, max: toMilliUnits(statValue(resource.max, state, registry, actorId)) });
    }
  }
  return snapshots;
}

function levels(state: GameState): Record<string, number> {
  return state.resources as Record<string, number>;
}

export function restorePools(state: GameState, restored: Record<string, number>): void {
  for (const [id, level] of Object.entries(restored)) levels(state)[id] = level;
}

export function handlersFor(registry: Registry, actorId: string, eventId: string): ActionResult[][] {
  const entity = actorEntity(registry, actorId);
  return (entity?.handlers ?? []).filter((handler) => handler.event === eventId).map((handler) => handler.results);
}

export function fireEvents(segment: Segment, actorId: string, trigger: EventTrigger, resourceId?: string, count = 1, amount = 1): void {
  if (count <= 0) return;
  for (const event of eventsFor(segment.registry, resourceId, trigger)) {
    for (const results of handlersFor(segment.registry, actorId, event.id)) {
      applyResults(segment, results, actorId, count);
    }
    const earned = experienceFor(segment.registry, actorEntity(segment.registry, actorId), event.id, amount);
    if (earned.length > 0) applyResults(segment, earned, actorId, count);
  }
}

export function requireResource(registry: Registry, resourceId: string): Resource {
  const resource = registry.resources.get(resourceId);
  if (!resource) throw new RuntimeError(`unknown resource: ${resourceId}`);
  return resource;
}

export function emptyPoolNow(segment: Segment, actorId: string, resourceId: string, credit: string): void {
  const store = poolStores(segment.state).find((each) => each.actorId === actorId);
  if (!store) return;
  store.levels[resourceId] = 0;
  clearActorDeltas(segment.deltas, actorId);
  const previous = segment.credit;
  segment.credit = credit;
  fireEvents(segment, actorId, 'on empty', resourceId);
  segment.credit = previous;
}

interface PoolStore {
  actorId: string;
  levels: Record<string, number>;
  remainders: Record<string, number>;
}

function poolStores(state: GameState): PoolStore[] {
  const stores: PoolStore[] = [{ actorId: PLAYER, levels: levels(state), remainders: state.resourceRateRemainders }];
  for (const [actorId, actor] of Object.entries(state.activeAction?.actors ?? {})) {
    stores.push({ actorId, levels: actor.resources, remainders: actor.rateRemainders });
  }
  return stores;
}

function setPoolLevel(segment: Segment, store: PoolStore, resource: Resource, current: number, raw: number, max: number): 'stored' | 'clamped' {
  if (raw > current && max > 0 && eventsFor(segment.registry, resource.id, 'on full').length > 0) {
    const fires = Math.floor(raw / max);
    store.levels[resource.id] = raw - fires * max;
    if (fires > 0) fireEvents(segment, store.actorId, 'on full', resource.id, fires);
    return 'stored';
  }
  const clamped = Math.min(max, Math.max(0, raw));
  store.levels[resource.id] = clamped;
  if (raw < current && current > 0 && clamped <= 0) fireEvents(segment, store.actorId, 'on empty', resource.id);
  return clamped === raw ? 'stored' : 'clamped';
}

export function settlePools(state: GameState, registry: Registry, snapshots: ResourceSnapshot[], dt: number, deltas: PoolDeltas, credit?: ReadonlyMap<string, string>): void {
  const rated = new Map<string, Map<string, ResourceSnapshot>>();
  for (const snapshot of snapshots) {
    const byResource = rated.get(snapshot.actorId) ?? new Map<string, ResourceSnapshot>();
    byResource.set(snapshot.resource.id, snapshot);
    rated.set(snapshot.actorId, byResource);
  }
  const stores = poolStores(state);
  const segment = newSegment(state, registry);

  for (const resource of registry.resources.values()) {
    for (const store of stores) {
      const snapshot = rated.get(store.actorId)?.get(resource.id);
      const delta = getDelta(deltas, store.actorId, resource.id);
      if (!snapshot && delta === 0) continue;
      const current = store.levels[resource.id] ?? 0;
      const rateAcc = snapshot ? snapshot.ratePerMinute * dt + (store.remainders[resource.id] ?? 0) : 0;
      const rate = snapshot ? divideRateRemainder(rateAcc) : { units: 0, remainder: 0 };
      const raw = current + delta + rate.units;
      const max = snapshot?.max ?? toMilliUnits(statValue(resource.max, state, registry, store.actorId));
      segment.credit = credit?.get(store.actorId);
      const result = setPoolLevel(segment, store, resource, current, raw, max);
      if (snapshot) store.remainders[resource.id] = result === 'clamped' ? 0 : rate.remainder;
    }
  }
  settleHandlerDeltas(state, registry, segment);
}

function settleHandlerDeltas(state: GameState, registry: Registry, segment: Segment): void {
  if (segment.deltas.size === 0) {
    if (segment.stopped) endAction(state);
    return;
  }
  const stores = poolStores(state);
  for (const resource of registry.resources.values()) {
    for (const store of stores) {
      const delta = getDelta(segment.deltas, store.actorId, resource.id);
      if (delta === 0) continue;
      const max = toMilliUnits(statValue(resource.max, state, registry, store.actorId));
      store.levels[resource.id] = Math.min(max, Math.max(0, (store.levels[resource.id] ?? 0) + delta));
    }
  }
  if (segment.stopped) endAction(state);
}

export function clampResources(state: GameState, registry: Registry): void {
  const segment = newSegment(state, registry);
  const stores = poolStores(state);
  for (const resource of registry.resources.values()) {
    for (const store of stores) {
      const level = store.levels[resource.id];
      if (level === undefined) continue;
      const max = toMilliUnits(statValue(resource.max, state, registry, store.actorId));
      setPoolLevel(segment, store, resource, level, Math.min(max, level), max);
    }
  }
  settleHandlerDeltas(state, registry, segment);
}
