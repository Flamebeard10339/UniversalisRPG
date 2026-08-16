import { ActionResult, DropRow, nestedResults, Party } from '../grammar/actionResult';
import { DISCOVERED } from '../content/location';
import { DropTable } from '../content/dropTable';
import { EventTrigger, GameEvent } from '../content/event';
import { isPoint, Range, sampleCount, sampleRange } from '../grammar/range';
import { Registry } from '../content/registry';
import { Resource } from '../content/resource';
import { evaluateCondition } from './conditions';
import { actorEntity, hasPool } from './encounter';
import { stockItem } from './itemInstance';
import { openModalNamed } from './modals';
import { localizerOf } from './localized';
import { nextRandom } from './rng';
import { experienceFor } from './skillGrants';
import { skillLevel } from './skills';
import { endAction, GameState, PLAYER, RuntimeError } from './state';
import { hitChance, statValue } from './stats';
import { divideRateRemainder, MILLI_UNITS, toMilliUnits } from './units';
import { applyDeclared } from './buffs';

export interface Segment {
  state: GameState;
  registry: Registry;
  // Accrued, so where a caller splits a span cannot change the level reached.
  deltas: PoolDeltas;
  // Control flow, not a write: only the segment's owner may end the action.
  stopped: boolean;
  observers: readonly ResultObserver[];
  // Who last emptied whose pool, so a handler's `credit:` reaches the causer.
  causedBy: Map<string, string>;
  // Who a `credit:` inside a handler moves its results to. The moment supplies
  // it, which is why an author never names one.
  credit?: string;
  // Which character a hook's `me` and `them` name, for as long as one is
  // firing. Absent outside that moment, which is the only moment the grammar
  // lets a result name a party in.
  parties?: { readonly [P in Party]: string };
}
export type PoolDeltas = Map<string, Map<string, number>>;

export interface ResultApplication {
  result: ActionResult;
  actor: string;
  // Signed, in the result's own units, with `count` already folded in, and the
  // amount that actually moved rather than the one asked for: a `take` of five
  // from an inventory holding two reports -2. Zero where the kind moves no
  // quantity at all.
  magnitude: number;
  lead: boolean;
}

export type ResultObserver = (segment: Segment, application: ResultApplication) => void;

// Narration only — opening the modal happens in the switch below. Reaching the
// log from an observer is what keeps the narration out of that switch.
const narrateModal: ResultObserver = ({ state, registry }, { result, lead }) => {
  if (result.kind !== 'open-modal' || !lead) return;
  const localizer = localizerOf(registry, state);
  state.log.push(localizer.engine('engine.modal.opened', { modal: localizer.identifier(result.modal) }));
};

// Every result a segment applies is offered to each of these, in application
// order: a consumer of applied results joins this list rather than growing the
// switch that applies them. Exported so a caller building its own segment can
// spread it and keep what the game already does.
export const RESULT_OBSERVERS: readonly ResultObserver[] = [narrateModal];

export function newSegment(state: GameState, registry: Registry, observers: readonly ResultObserver[] = RESULT_OBSERVERS): Segment {
  return { state, registry, deltas: new Map(), stopped: false, observers, causedBy: new Map() };
}

// Which names are bound to a pool crossing a threshold. Asked rather than
// stored on the resource, because a `# resource` declares the pool's shape and
// nothing else.
export function eventsFor(registry: Registry, resourceId: string | undefined, trigger: EventTrigger): GameEvent[] {
  return [...registry.events.values()].filter((event) => event.resource === resourceId && event.trigger === trigger);
}

export function addDelta(deltas: PoolDeltas, actorId: string, resourceId: string, milliAmount: number): void {
  if (!deltas.has(actorId)) deltas.set(actorId, new Map());
  const actorDeltas = deltas.get(actorId)!;
  actorDeltas.set(resourceId, (actorDeltas.get(resourceId) ?? 0) + milliAmount);
}

export function getDelta(deltas: PoolDeltas, actorId: string, resourceId: string): number {
  return deltas.get(actorId)?.get(resourceId) ?? 0;
}

// A foe's pools vanish with its fight, so what a segment accrued against the one
// that just died must not land on the one standing up in its place.
export function clearActorDeltas(deltas: PoolDeltas, actorId: string): void {
  deltas.delete(actorId);
}

// Whether applying this group `count` times is the same as applying it once and
// scaling. A draw is not, and neither is a range: both would collapse `count`
// independent outcomes into one outcome repeated. Every wrapper answers yes,
// which is also what puts a nested `stop` on the repetition that rolled it —
// `stopsOnOutcome` stays shallow on the strength of that.
export function samplesPerApplication(results: readonly ActionResult[]): boolean {
  return results.some((result) => {
    if (nestedResults(result).length > 0 || result.kind === 'roll') return true;
    if (result.kind === 'give') return result.amount !== undefined && !isPoint(result.amount);
    if (result.kind === 'xp') return !isPoint(result.amount);
    if (result.kind === 'pool') return !isPoint(result.delta);
    return false;
  });
}

// The one place a produced amount meets the rng, shaped like `sampleStat`: a
// point range is a certainty and draws nothing, which is what keeps every
// pre-existing seeded expectation where it was.
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

// Rows whose gate is false leave the pool BEFORE the draw, so the survivors'
// shares grow. Selecting a gated-off row and then producing nothing would be a
// different distribution.
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

// `lead` is false for every repetition after a batch's first. A result that
// ignores `count` speaks once for the whole batch — 100 crafted loaves are one
// line — and that has to stay true of an action whether or not one of its
// results happens to draw. A `say:` INSIDE a wrapper is a different sentence: it
// leads its own group, and speaks on each repetition that reaches it.
export function applyResults(segment: Segment, results: readonly ActionResult[], actor: string, count = 1, lead = true): void {
  if (count <= 0) return;
  // A group that draws is applied once per repetition, in order, rather than
  // once and scaled — a batched craft rolls its table for every completion.
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

// `undefined` where nothing was applied: a wrapper only selects, and a `say:`
// that is not the batch's lead does not speak.
// A place is discovered two ways: it was scouted from somewhere else, which is
// what the `discover:` result is for, or the player could walk to it. The second
// is what makes a map fill in as it is played rather than only where an author
// remembered to say so, and it is why a locked door withholds what is behind it:
// the edge's condition is read now, so unlocking the door discovers the beach
// without the player having to leave the room and come back.
//
// Recomputed rather than remembered, because its two inputs -- where the player
// is and what the flags say -- are written in this file and nowhere else.
export function spreadDiscovery(state: GameState, registry: Registry): void {
  const here = registry.locations.get(state.location);
  if (!here) return;
  state.flags[`${here.id}.${DISCOVERED}`] = true;
  for (const edge of here.adjacent) {
    const key = `${edge.target}.${DISCOVERED}`;
    // Already known, so there is nothing a condition could tell us: discovery
    // only ever adds. This runs on every flag written anywhere, and evaluating
    // a condition per edge per write costs more than everything above it.
    if (state.flags[key]) continue;
    if (edge.condition && !evaluateCondition(edge.condition, state)) continue;
    state.flags[key] = true;
  }
}

// Whose pool an amount moves. An unmarked result lands on whoever the list is
// being applied to, which under a hook is the carrier that wrote it.
function subjectOf(segment: Segment, party: Party | undefined, actor: string): string {
  return party === undefined ? actor : segment.parties?.[party] ?? actor;
}

function applyOne(segment: Segment, result: ActionResult, actor: string, count: number, lead: boolean): number | undefined {
  const { state, registry } = segment;
  switch (result.kind) {
    case 'say':
      if (!lead) return undefined;
      // The address the load path stamped on this line. A result that reached
      // here without one was built in code rather than loaded, and there is no
      // language it could be shown in.
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
    // The stack alone: a grown copy affords this cost but is never the thing
    // spent for it, so the stack running out is what stops the take.
    case 'take':
      return stockItem(state, result.item, -(result.amount ?? 1) * count);
    case 'xp': {
      const amount = drawCount(state, result.amount) * count;
      const before = state.xp[result.skill] ?? 0;
      state.xp[result.skill] = before + amount;
      // Said where the total moves, so every route that grants experience says
      // it and none of them has to remember to. The level is derived from the
      // total and stored nowhere, which is why the crossing is only visible
      // here, between the two totals.
      const reached = skillLevel(state.xp[result.skill]);
      if (reached > skillLevel(before)) {
        const localizer = localizerOf(registry, state);
        state.log.push(localizer.engine('engine.skill.levelled', { skill: localizer.title('skill', result.skill), level: reached }));
      }
      return amount;
    }
    case 'relocate':
      state.location = result.location;
      spreadDiscovery(state, registry);
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
      // Once per repetition rather than once scaled: whether a second
      // application stacks or replaces is the source's rule, and granting it
      // `count` times is what asks that rule `count` times.
      for (let i = 0; i < count; i++) applyDeclared(state, subjectOf(segment, result.party, actor), source, state.time);
      return count;
    }
    case 'stop':
      segment.stopped = true;
      return 0;
    // Depth-first in source order: a wrapper draws for its own selector, then
    // its body draws for whatever is inside it.
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
    // The one marked exception to "results land on the entity it happened to".
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
  }
}

export function applyResultsNow(state: GameState, registry: Registry, results: readonly ActionResult[] | undefined, count = 1): void {
  const segment = newSegment(state, registry);
  applyResults(segment, results ?? [], PLAYER, count);
  settlePools(state, registry, [], 0, segment.deltas);
  if (segment.stopped) endAction(state);
}

// Only missing pools are filled, so a save predating a resource gains it at full.
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
      // A pool this character has no ceiling for is not a pool: nothing accrues
      // into it, so no rate is snapshotted and no remainder is carried for it.
      // Without this a declared rate reaches every character in the universe and
      // writes a remainder into every save, whether or not anything can hold it.
      if (!hasPool(state, registry, actorId, resource.id)) continue;
      const ratePerMinute = resource.rate ? toMilliUnits(statValue(resource.rate, state, registry, actorId)) : 0;
      if (ratePerMinute === 0) continue;
      snapshots.push({ resource, actorId, ratePerMinute, max: toMilliUnits(statValue(resource.max, state, registry, actorId)) });
    }
  }
  return snapshots;
}

// The one cast that opens PoolLevels for writing.
function levels(state: GameState): Record<string, number> {
  return state.resources as Record<string, number>;
}

// Loading a save constructs a state rather than moving pools: no rollover, no clamp.
export function restorePools(state: GameState, restored: Record<string, number>): void {
  for (const [id, level] of Object.entries(restored)) levels(state)[id] = level;
}

// What an entity answers a name with. A handler's results apply to the entity
// the event happened to, on the player and on the rat alike.
export function handlersFor(registry: Registry, actorId: string, eventId: string): ActionResult[][] {
  const entity = actorEntity(registry, actorId);
  return (entity?.handlers ?? []).filter((handler) => handler.event === eventId).map((handler) => handler.results);
}

// What a moment does to whoever it happened to: the handlers that entity wrote
// for it, and the experience the skills it carries are trained by. `amount` is
// the moment's own quantity, in the units its row under `### Triggers` names.
export function fireEvents(segment: Segment, actorId: string, trigger: EventTrigger, resourceId?: string, count = 1, amount = 1): void {
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

// A pool that ran out mid-segment settles at the instant it ran out, because
// what happens next — a fresh target standing up, the fight ending — would
// otherwise erase the level that reached zero before anything read it.
export function emptyPoolNow(segment: Segment, actorId: string, resourceId: string, credit: string): void {
  const store = poolStores(segment.state).find((each) => each.actorId === actorId);
  if (!store) return;
  clearActorDeltas(segment.deltas, actorId);
  const previous = segment.credit;
  segment.credit = credit;
  writeLevel(segment, store, requireResource(segment.registry, resourceId), 0);
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

// Where a settle leaves a pool, and the whole units that moved. Rates, results
// and the instant a pool runs out all write through here, so what `restored`
// and `drained` report summed over a span is the pool's own net movement and
// does not depend on where the span was split. A handler's own deltas settle
// below without passing here, under the rule stated there.
//
// Whole units, because a settle can move a pool by a fraction of one: the
// integer level is what a span's split cannot change, where a fractional
// amount would be counted once per tick and again as one movement.
function writeLevel(segment: Segment, store: PoolStore, resource: Resource, level: number): void {
  const before = store.levels[resource.id] ?? 0;
  store.levels[resource.id] = level;
  const units = Math.floor(level / MILLI_UNITS) - Math.floor(before / MILLI_UNITS);
  if (units === 0) return;
  fireEvents(segment, store.actorId, units > 0 ? 'restored' : 'drained', resource.id, 1, Math.abs(units));
}

// The one write of a pool level, for every actor alike. A rollover meter is one
// whose pool has a name bound to `on full`; without one it is a plain capped
// pool, which is the same rule the resource's own block used to carry.
function setPoolLevel(segment: Segment, store: PoolStore, resource: Resource, current: number, raw: number, max: number): 'stored' | 'clamped' {
  if (raw > current && max > 0 && eventsFor(segment.registry, resource.id, 'on full').length > 0) {
    const fires = Math.floor(raw / max);
    writeLevel(segment, store, resource, raw - fires * max);
    if (fires > 0) fireEvents(segment, store.actorId, 'on full', resource.id, fires);
    return 'stored';
  }
  const clamped = Math.min(max, Math.max(0, raw));
  writeLevel(segment, store, resource, clamped);
  if (raw < current && current > 0 && clamped <= 0) fireEvents(segment, store.actorId, 'on empty', resource.id);
  return clamped === raw ? 'stored' : 'clamped';
}

// Iterates the registry, not the deltas, so settle order is split-independent.
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

// A handler is an ordinary result list, so it can drain a pool of its own. Its
// deltas settle here rather than being dropped, and without handlers of their
// own to run, because a handler that empties the pool it handles would recurse.
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
      // The ceiling-limited destination is what lets setPoolLevel fire `on empty`.
      setPoolLevel(segment, store, resource, level, Math.min(max, level), max);
    }
  }
  settleHandlerDeltas(state, registry, segment);
}
