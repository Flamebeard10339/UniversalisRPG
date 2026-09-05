import { endAction } from './actionEnd';
import { RuntimeError } from './error';
import { ActionResult, DropRow, nestedResults, Party, STARTING_LOCATION } from '../grammar/actionResult';
import { Amount, isStatAmount } from '../grammar/values';
import { DISCOVERED } from '../content/sections/location';
import { TOUCHED } from '../content/sections/define';
import { DropTable } from '../content/sections/droptable';
import { EventTrigger, GameEvent } from '../content/sections/event';
import { isPoint, isRange, Range, sampleCount, sampleRange, scaleRange } from '../grammar/range';
import { Registry, startingLocationId } from '../content/registry';
import { Resource } from '../content/sections/resource';
import { evaluateCondition, weighing } from './conditions';
import { effectiveAdjacent } from './journey';
import { actorEntity } from './actionLookup';
import { hasPool } from './stats';
import { destroyItem, handOver, HandOver, heldSignature, NOTHING_HELD, receiveItem, stripHoldings } from './itemInstance';
import { bundleCount, bundleHeld, bundleStack, bundleWholePack, pourOut } from './bundle';
import { openModalNamed } from './modalStack';
import { Localized, localizerOf } from './localized';
import { nextRandom } from './rng';
import { armedAction } from './roster';
import { experienceFor } from './skillGrants';
import { skillLevel } from './skills';
import { debugging, GameState, PLAYER, templateOf } from './state';
import { hitChance, statRange, statValue } from './stats';
import { wearFor } from './population';
import { engagementDelay } from './tuning';
import { divideRateRemainder, fromMilliUnits, MILLI_UNITS, toMilliUnits } from './units';
import { applyDeclared, buffsOf, clearBuffs, shakeOffBuff } from './buffs';
import { beginPerformNext } from './perform';

export interface Segment {
  state: GameState;
  registry: Registry;
  deltas: PoolDeltas;
  stopped: Localized | null;
  observers: readonly ResultObserver[];
  causedBy: Map<string, string>;
  credit?: string;
  firing?: Localized;
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
  state.log.push(localizer.engine('engine.modal.opened', { modal: localizer.minted(result.modal) }));
};

export const RESULT_OBSERVERS: readonly ResultObserver[] = [narrateModal];

export function newSegment(state: GameState, registry: Registry, observers: readonly ResultObserver[] = RESULT_OBSERVERS): Segment {
  return { state, registry, deltas: new Map(), stopped: null, observers, causedBy: new Map() };
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

export function poolFell(segment: Segment, actorId: string, resourceId: string, milliFall: number, count = 1): void {
  if (milliFall <= 0 || count <= 0) return;
  const store = poolStores(segment.state).find((each) => each.actorId === actorId);
  const standing = store?.levels[resourceId];
  const taken = standing === undefined ? milliFall : Math.min(milliFall, Math.max(standing, 0));
  if (taken <= 0) return;
  if (actorId === PLAYER) segment.state.spent[resourceId] = (segment.state.spent[resourceId] ?? 0) + taken * count;
  fireEvents(segment, actorId, 'damage-taken', resourceId, count, fromMilliUnits(taken));
}

const variesPerSubject = (held: unknown): boolean => {
  if (typeof held !== 'object' || held === null) return false;
  return isRange(held) ? !isPoint(held) : isStatAmount(held as Amount);
};

export function samplesPerApplication(results: readonly ActionResult[]): boolean {
  return results.some((result) => {
    if (nestedResults(result).length > 0 || result.kind === 'roll') return true;
    return Object.values(result).some(variesPerSubject);
  });
}

function rewardScale(state: GameState, registry: Registry): number {
  if (!state.activeAction) return 1;
  const named = armedAction(state, registry).rewardScale;
  return named === undefined ? 1 : Math.max(0, 1 + statValue(named, state, registry) / 100);
}

function readAmount(segment: Segment, value: Amount, actor: string): Range {
  if (!isStatAmount(value)) return value;
  const subject = value.side === 'them' ? (segment.parties?.them ?? actor) : actor;
  const read = statRange(value.id, segment.state, segment.registry, subject);
  return value.falls ? scaleRange(read, -1) : read;
}

function drawCount(state: GameState, registry: Registry, amount: Range | undefined): number {
  if (amount === undefined) return 1;
  const scaled = scaleRange(amount, rewardScale(state, registry));
  const whole = { min: Math.floor(scaled.min), max: Math.floor(scaled.max) };
  return isPoint(whole) ? whole.min : sampleCount(whole, nextRandom(state));
}

function drawAmount(state: GameState, amount: Range): number {
  return isPoint(amount) ? amount.min : sampleRange(amount, nextRandom(state));
}

function statSide(value: number | string, state: GameState, registry: Registry, actorId?: string): number {
  return typeof value === 'number' ? value : statValue(value, state, registry, actorId);
}

function rowWeight(row: DropRow, state: GameState, registry: Registry): number {
  const weight = statSide(row.weight, state, registry);
  if (weight < 0) {
    throw new RuntimeError(`one of: row ${row.weight} weighs ${weight} — a weight is a quantity, so weigh the row by something that cannot read below nothing`);
  }
  return weight;
}

function selectRow(rows: readonly DropRow[], state: GameState, registry: Registry): DropRow | undefined {
  const live = rows.filter((row) => row.requires === undefined || evaluateCondition(row.requires, state, registry));
  const weights = live.map((row) => rowWeight(row, state, registry));
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

export function contestSettled(state: GameState): boolean | null {
  const sure = debugging(state, 'succeed-checks');
  const thumbs = debugging(state, 'fail-checks');
  if (sure && thumbs) throw new RuntimeError('succeed-checks and fail-checks both stand, and a contest cannot be settled both ways: a route asks for one of them');
  return sure ? true : thumbs ? false : null;
}

export function applyResults(segment: Segment, results: readonly ActionResult[], actor: string, count = 1, lead = true): void {
  if (count <= 0) return;
  if (count > 1 && samplesPerApplication(results)) {
    for (let i = 0; i < count && !segment.stopped; i++) applyResults(segment, results, actor, 1, lead && i === 0);
    return;
  }

  for (const result of results) {
    if (segment.stopped) return;
    const magnitude = applyOne(segment, result, actor, count, lead);
    if (magnitude === undefined) continue;
    for (const observer of segment.observers) observer(segment, { result, actor, magnitude, lead });
  }
}

export function standWhereTheyAre(state: GameState, registry: Registry): void {
  const here = registry.locations.get(state.location);
  if (!here) return;
  state.flags[`${here.id}.${TOUCHED}`] = true;
  state.flags[`${here.id}.${DISCOVERED}`] = true;
  for (const edge of effectiveAdjacent(registry, here.id)) {
    const key = `${edge.target}.${DISCOVERED}`;
    if (state.flags[key]) continue;
    if (edge.condition && !evaluateCondition(edge.condition, state, registry)) continue;
    state.flags[key] = true;
  }
}

export function locationNamed(registry: Registry, location: string): string {
  if (location !== STARTING_LOCATION) return location;
  const starting = startingLocationId(registry);
  if (starting === undefined) throw new RuntimeError(`${STARTING_LOCATION} was named, but no # location is marked starting`);
  return starting;
}

export function relocateTo(state: GameState, registry: Registry, location: string): void {
  state.location = locationNamed(registry, location);
  state.engagesAt = state.time + engagementDelay(registry);
  standWhereTheyAre(state, registry);
}

function subjectOf(segment: Segment, party: Party | undefined, actor: string): string {
  return party === undefined ? actor : segment.parties?.[party] ?? actor;
}

export function facing<T>(segment: Segment, me: string, them: string, run: () => T): T {
  const outer = segment.parties;
  segment.parties = { me, them };
  try {
    return run();
  } finally {
    segment.parties = outer;
  }
}

function applyOne(segment: Segment, result: ActionResult, actor: string, count: number, lead: boolean): number | undefined {
  const { state, registry } = segment;
  switch (result.kind) {
    case 'say':
      if (!lead) return undefined;
      if (result.key === undefined) throw new RuntimeError(`a say: reached the log with no address: ${JSON.stringify(result.text)}`);
      state.log.push(localizerOf(registry, state).line(result.key, weighing(state, registry)));
      return 0;
    case 'set':
      state.flags[result.variable] = true;
      standWhereTheyAre(state, registry);
      return 0;
    case 'unset':
      delete state.flags[result.variable];
      standWhereTheyAre(state, registry);
      return 0;
    case 'add': {
      const current = state.flags[result.variable];
      const base = typeof current === 'number' ? current : 0;
      const amount = result.amount * count;
      state.flags[result.variable] = base + amount;
      standWhereTheyAre(state, registry);
      return amount;
    }
    case 'give': {
      const wanted = drawCount(state, registry, result.amount) * count;
      const moved = receiveItem(state, registry, result.item, wanted);
      announceCarried(segment, Math.abs(moved));
      if (moved < wanted) segment.stopped = localizerOf(registry, state).engine('engine.stopped.pack-full');
      return moved;
    }
    case 'take': {
      const wanted = (result.amount ?? 1) * count;
      const parting = result.atMost === true ? HandOver.asMuchAs(state, result.item, wanted) : HandOver.asked(state, result.item, wanted);
      if (!parting) {
        const say = localizerOf(registry, state);
        state.log.push(say.engine('engine.inputs.short', { item: say.title('item', result.item) }));
        return 0;
      }
      const gone = handOver(state, parting);
      if (result.into !== undefined) bundleStack(state, result.into, result.item, gone);
      announceCarried(segment, gone);
      return -gone;
    }
    case 'take-worn': {
      const say = localizerOf(registry, state);
      const worn = state.equipped[result.slot];
      if (worn === undefined) {
        state.log.push(say.engine('engine.inputs.bare-slot', { slot: say.title('slot', result.slot) }));
        return 0;
      }
      const gone = destroyItem(state, worn);
      if (!gone.ok) return 0;
      if (result.into !== undefined) bundleStack(state, result.into, gone.item, 1);
      announceCarried(segment, 1);
      return -1;
    }
    case 'xp': {
      const amount = drawCount(state, registry, readAmount(segment, result.amount, actor)) * count;
      const before = state.xp[result.skill] ?? 0;
      state.xp[result.skill] = before + amount;
      const reached = skillLevel(state.xp[result.skill]);
      const climbed = reached - skillLevel(before);
      if (climbed > 0) {
        const localizer = localizerOf(registry, state);
        state.log.push(localizer.engine('engine.skill.levelled', { skill: localizer.title('skill', result.skill), level: reached }));
        fireEvents(segment, actor, 'level-up', undefined, climbed, reached);
      }
      return amount;
    }
    case 'relocate':
      relocateTo(state, registry, result.location);
      return 0;
    case 'discover':
      state.flags[`${locationNamed(registry, result.location)}.${DISCOVERED}`] = true;
      return 0;
    case 'open-modal':
      openModalNamed(state, result.modal);
      return 0;
    case 'perform': {
      if (actor !== PLAYER) throw new RuntimeError(`perform: ${result.action} is asked of ${actor}, and only the player can be made to do something: nothing else has anything under way`);
      if (!registry.actions.has(result.action)) throw new RuntimeError(`perform: names an unknown action: ${result.action}`);
      state.performNext = result.action;
      return 1;
    }
    case 'pool': {
      requireResource(registry, result.resource);
      const milliAmount = toMilliUnits(drawAmount(state, readAmount(segment, result.delta, actor))) * count;
      const subject = subjectOf(segment, result.party, actor);
      addDelta(segment.deltas, subject, result.resource, milliAmount);
      if (milliAmount < 0) poolFell(segment, subject, result.resource, -milliAmount / count, count);
      return milliAmount;
    }
    case 'fill': {
      const resource = requireResource(registry, result.resource);
      const subject = subjectOf(segment, result.party, actor);
      const store = poolStores(state).find((each) => each.actorId === subject);
      if (!store) return 0;
      const room = toMilliUnits(statValue(resource.max, state, registry, subject)) - (store.levels[resource.id] ?? 0);
      if (room <= 0) return 0;
      addDelta(segment.deltas, subject, result.resource, room);
      return room;
    }
    case 'strip': {
      const gone = result.into === undefined ? stripHoldings(state) : bundleWholePack(state, result.into);
      if (gone > 0) announceCarried(segment, gone);
      return -gone;
    }
    case 'empty': {
      const wanted = bundleCount(bundleHeld(state, result.bundle));
      const moved = pourOut(state, registry, result.bundle);
      announceCarried(segment, moved);
      if (moved < wanted) segment.stopped = localizerOf(registry, state).engine('engine.stopped.pack-full');
      return moved;
    }
    case 'inflict': {
      const source = registry.items.get(result.buff);
      if (!source) throw new RuntimeError(`unknown buff source: ${result.buff}`);
      const subject = subjectOf(segment, result.party, actor);
      const lasts = result.lasts === undefined ? undefined : statSide(result.lasts, state, registry, subject);
      for (let i = 0; i < count; i++) applyDeclared(state, subject, source, state.time, lasts);
      return count;
    }
    case 'shake-off': {
      const subject = subjectOf(segment, result.party, actor);
      const held = buffsOf(state, subject).length;
      if (result.buff === null) clearBuffs(state, [subject]);
      else shakeOffBuff(state, subject, result.buff);
      return held - buffsOf(state, subject).length;
    }
    case 'stands': {
      const stood = segment.parties?.them;
      if (stood === undefined || stood === actor) return 0;
      if (!registry.guises.has(result.guise)) throw new RuntimeError(`unknown guise to stand in: ${result.guise}`);
      const seconds = statSide(result.lasts, state, registry, stood);
      return wearFor(state, registry, state.location, templateOf(stood), result.guise, seconds) ? 1 : 0;
    }
    case 'stop':
      segment.stopped = segment.firing ?? localizerOf(registry, state).engine('engine.stopped.itself');
      return 0;
    case 'chance':
      if (nextRandom(state) * result.denominator < result.numerator) applyResults(segment, result.results, actor, count);
      return undefined;
    case 'contest': {
      const settled = contestSettled(state);
      if (settled ?? nextRandom(state) < hitChance(statSide(result.left, state, registry), statSide(result.right, state, registry), registry)) {
        applyResults(segment, result.results, actor, count);
      }
      return undefined;
    }
    case 'gate':
      if (evaluateCondition(result.condition, state, registry)) applyResults(segment, result.results, actor, count);
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
  if (segment.stopped) endAction(state, segment.stopped);
  beginPerformNext(state, registry);
}

export function initResources(state: GameState, registry: Registry): void {
  for (const resource of registry.resources.values()) {
    const held = state.resources[resource.id] !== undefined;
    const ceiling = statValue(resource.max, state, registry);
    if (resource.start === undefined && ceiling <= 0) {
      if (held) delete levels(state)[resource.id];
      continue;
    }
    if (!held) levels(state)[resource.id] = toMilliUnits(resource.start ?? ceiling);
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

function endingEvents(segment: Segment, actorId: string): readonly string[] {
  if (actorId !== PLAYER || !segment.state.activeAction) return NO_STOPPERS;
  return armedAction(segment.state, segment.registry).stopsOn ?? NO_STOPPERS;
}

const NO_STOPPERS: readonly string[] = [];

export function fireEvents(segment: Segment, actorId: string, trigger: EventTrigger, resourceId?: string, count = 1, amount = 1): void {
  if (count <= 0) return;
  const events = eventsFor(segment.registry, resourceId, trigger);
  if (events.length === 0) return;
  const ends = endingEvents(segment, actorId);
  const say = localizerOf(segment.registry, segment.state);
  for (const event of events) {
    const happened = say.engine('engine.stopped.event', { event: say.title('event', event.id) });
    const outer = segment.firing;
    segment.firing = happened;
    for (const results of handlersFor(segment.registry, actorId, event.id)) {
      applyResults(segment, results, actorId, count);
    }
    const earned = experienceFor(segment.registry, actorEntity(segment.registry, actorId), event.id, amount);
    if (earned.length > 0) applyResults(segment, earned, actorId, count);
    segment.firing = outer;
    if (ends.includes(event.id)) segment.stopped = happened;
  }
}

export function announceCarried(segment: Segment, moved = 1): void {
  const now = heldSignature(segment.state);
  if ((segment.state.carriedTold ?? NOTHING_HELD) === now) return;
  segment.state.carriedTold = now;
  fireEvents(segment, PLAYER, 'inventory-changed', undefined, Math.max(1, moved));
}

export function settleCarried(state: GameState, registry: Registry): void {
  const segment = newSegment(state, registry);
  announceCarried(segment);
  settleHandlerDeltas(state, registry, segment);
}

export function requireResource(registry: Registry, resourceId: string): Resource {
  const resource = registry.resources.get(resourceId);
  if (!resource) throw new RuntimeError(`unknown resource: ${resourceId}`);
  return resource;
}

export function emptyPoolNow(segment: Segment, actorId: string, resourceId: string, credit: string): void {
  const store = poolStores(segment.state).find((each) => each.actorId === actorId);
  if (!store) return;
  const resource = requireResource(segment.registry, resourceId);
  const max = toMilliUnits(statValue(resource.max, segment.state, segment.registry, actorId));
  clearActorDeltas(segment.deltas, actorId);
  const previous = segment.credit;
  segment.credit = credit;
  setPoolLevel(segment, store, resource, store.levels[resourceId] ?? 0, 0, max);
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

export const SPENT_BELOW = MILLI_UNITS;

export const spendable = (level: number): number => level - SPENT_BELOW + 1;

export const isSpent = (level: number): boolean => spendable(level) <= 0;

function setPoolLevel(segment: Segment, store: PoolStore, resource: Resource, current: number, raw: number, max: number): 'stored' | 'clamped' {
  const mine = store.actorId === PLAYER;
  if (mine && debugging(segment.state, 'lock-pools') && raw < current) {
    store.levels[resource.id] = Math.min(current, max);
    return 'clamped';
  }
  const floor = mine && debugging(segment.state, 'unkillable') ? SPENT_BELOW : 0;
  if (raw > current && max > 0 && eventsFor(segment.registry, resource.id, 'on full').length > 0) {
    const fires = Math.floor(raw / max);
    store.levels[resource.id] = raw - fires * max;
    if (fires > 0) fireEvents(segment, store.actorId, 'on full', resource.id, fires);
    return 'stored';
  }
  const clamped = Math.min(max, Math.max(floor, raw));
  store.levels[resource.id] = clamped;
  if (raw < current && !isSpent(current) && isSpent(clamped)) fireEvents(segment, store.actorId, 'on empty', resource.id);
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
      setPoolLevel(segment, store, resource, current, raw, max);
      if (snapshot) store.remainders[resource.id] = rate.remainder;
    }
  }
  settleHandlerDeltas(state, registry, segment);
}

export const HANDLER_SETTLE_PASSES = 8;

function settleHandlerDeltas(state: GameState, registry: Registry, segment: Segment): void {
  for (let pass = 0; segment.deltas.size > 0; pass++) {
    if (pass >= HANDLER_SETTLE_PASSES) {
      throw new RuntimeError(`settling pools: handlers moved a pool again on ${HANDLER_SETTLE_PASSES} passes running — an event handler is feeding the pool that fired it`);
    }
    const pending = segment.deltas;
    segment.deltas = new Map();
    const stores = poolStores(state);
    for (const resource of registry.resources.values()) {
      for (const store of stores) {
        const delta = getDelta(pending, store.actorId, resource.id);
        if (delta === 0) continue;
        const current = store.levels[resource.id] ?? 0;
        const max = toMilliUnits(statValue(resource.max, state, registry, store.actorId));
        setPoolLevel(segment, store, resource, current, current + delta, max);
      }
    }
  }
  if (segment.stopped) endAction(state, segment.stopped);
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
