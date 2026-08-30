import { endAction } from './actionEnd';
import { RuntimeError } from './error';
import { ActionResult, DropRow, nestedResults, Party, STARTING_LOCATION } from '../grammar/actionResult';
import { DISCOVERED } from '../content/sections/location';
import { TOUCHED } from '../content/sections/define';
import { DropTable } from '../content/sections/droptable';
import { EventTrigger, GameEvent } from '../content/sections/event';
import { isPoint, Range, sampleCount, sampleRange } from '../grammar/range';
import { Registry, startingLocationId } from '../content/registry';
import { Resource } from '../content/sections/resource';
import { evaluateCondition } from './conditions';
import { effectiveAdjacent } from './journey';
import { actorEntity } from './actionLookup';
import { hasPool } from './stats';
import { handOver, HandOver, heldSignature, NOTHING_HELD, receiveItem, stripHoldings } from './itemInstance';
import { openModalNamed } from './modalStack';
import { Localized, localizerOf } from './localized';
import { nextRandom } from './rng';
import { armedAction } from './roster';
import { experienceFor } from './skillGrants';
import { skillLevel } from './skills';
import { debugging, GameState, PLAYER } from './state';
import { hitChance, statValue } from './stats';
import { engagementDelay } from './tuning';
import { divideRateRemainder, MILLI_UNITS, toMilliUnits } from './units';
import { applyDeclared } from './buffs';

export interface Segment {
  state: GameState;
  registry: Registry;
  deltas: PoolDeltas;
  // Why the action is over, in the player's words, or null while it is not. A `stop` result and an
  // event an action `stops on:` are the same fact to whoever was away — the moment named it — so
  // both are written here by the code that fires the event rather than told apart afterwards.
  stopped: Localized | null;
  observers: readonly ResultObserver[];
  causedBy: Map<string, string>;
  credit?: string;
  // The event whose handlers are running, so a `stop` inside one says what happened rather than
  // that something did.
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
  const live = rows.filter((row) => row.requires === undefined || evaluateCondition(row.requires, state, registry));
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

// Standing somewhere is the only thing that touches a place, and the one road from touched to
// discovered: a neighbour is put on the map without being touched, which is the whole difference
// between a place heard of and a place been to.
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

// A name the engine answers is answered against the registry that is loaded now, so a world whose
// starting mark moved while it ran moves what the name means with it.
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
      // The one arrival that happens while the world is running on the player's behalf. A pack with
      // no room for it does not swallow it quietly: `receiveItem` says so, and what is under way
      // stops with a reason, because carrying on would produce nothing.
      const wanted = drawCount(state, result.amount) * count;
      const moved = receiveItem(state, registry, result.item, wanted);
      announceCarried(segment, Math.abs(moved));
      if (moved < wanted) segment.stopped = localizerOf(registry, state).engine('engine.stopped.pack-full');
      return moved;
    }
    case 'take': {
      // Nothing partial and nothing silent: a hand-over the player cannot make takes none of what
      // they do have and says so. It ends nothing — a take reached from a handler or from under a
      // roll is a loss nobody could weigh beforehand, and only what an action names ends it.
      const wanted = (result.amount ?? 1) * count;
      const parting = HandOver.asked(state, result.item, wanted);
      if (!parting) {
        const say = localizerOf(registry, state);
        state.log.push(say.engine('engine.inputs.short', { item: say.title('item', result.item) }));
        return 0;
      }
      const gone = handOver(state, parting);
      announceCarried(segment, gone);
      return -gone;
    }
    case 'xp': {
      const amount = drawCount(state, result.amount) * count;
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
    case 'pool': {
      requireResource(registry, result.resource);
      const milliAmount = toMilliUnits(drawAmount(state, result.delta)) * count;
      addDelta(segment.deltas, subjectOf(segment, result.party, actor), result.resource, milliAmount);
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
      const gone = stripHoldings(state);
      if (gone > 0) announceCarried(segment, gone);
      return -gone;
    }
    case 'inflict': {
      const source = registry.items.get(result.buff);
      if (!source) throw new RuntimeError(`unknown buff source: ${result.buff}`);
      for (let i = 0; i < count; i++) applyDeclared(state, subjectOf(segment, result.party, actor), source, state.time);
      return count;
    }
    case 'stop':
      segment.stopped = segment.firing ?? localizerOf(registry, state).engine('engine.stopped.itself');
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

// The action under way is the player's, so the events that end it are the ones that happen to the player.
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

// What the player carries changing is news, and news is an event. Nothing here asks who moved it or
// what they moved: the fact is a difference between what the player holds and what they were last
// told they hold, so a hand that reaches the inventory by a door nobody has built yet is still
// news, and noticing twice over one act is not.
// It counts things the way a batched swing counts hits: a cycle that settled ten completions at
// once moved ten things, and ten cycles settled one at a time moved the same ten, so what an author
// hangs on the event does not read differently for having been away.
export function announceCarried(segment: Segment, moved = 1): void {
  const now = heldSignature(segment.state);
  if ((segment.state.carriedTold ?? NOTHING_HELD) === now) return;
  segment.state.carriedTold = now;
  fireEvents(segment, PLAYER, 'inventory-changed', undefined, Math.max(1, moved));
}

// The same notice for whoever is not already inside a segment — a command the player gave rather
// than a world running on their behalf.
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

// A pool that has fallen under one whole unit is spent, and whoever holds it is down. The engine
// counts in milli-units, so the threshold is a thousand of them. The level itself stays where it
// fell: whether a pool is spent and what is left in it are different questions, and a pool nobody
// binds an event to is an ordinary number that has to survive a span being split anywhere.
export const SPENT_BELOW = MILLI_UNITS;

// How much may still come off a pool before it is spent, so a planner asking when that happens and
// a settle asking whether it has read the same threshold.
export const spendable = (level: number): number => level - SPENT_BELOW + 1;

export const isSpent = (level: number): boolean => spendable(level) <= 0;

function setPoolLevel(segment: Segment, store: PoolStore, resource: Resource, current: number, raw: number, max: number): 'stored' | 'clamped' {
  // A blow, a hook, a drain and a rate all come to rest here, so both switches that hold a pool of
  // the player's up are read here and nowhere else, and every way one could fall is covered by
  // saying it once. `lock-pools` holds it where it stands — a max that has dropped out from under a
  // full pool still brings it down, because that is the pool shrinking rather than something taking
  // from it. `unkillable` lets it be worn down to the last of it and no further, so nothing of
  // theirs is ever spent and nothing bound to one emptying is ever reached.
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
      const result = setPoolLevel(segment, store, resource, current, raw, max);
      if (snapshot) store.remainders[resource.id] = result === 'clamped' ? 0 : rate.remainder;
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
