import { ActionResult, DropRow, nestedResults } from '../grammar/actionResult';
import { DISCOVERED } from '../content/location';
import { DropTable } from '../content/dropTable';
import { isPoint, Range, sampleCount, sampleRange } from '../grammar/range';
import { Registry } from '../content/registry';
import { Resource } from '../content/resource';
import { evaluateCondition } from './conditions';
import { nextRandom } from './rng';
import { endAction, GameState, PLAYER, RuntimeError } from './state';
import { hitChance, statValue } from './stats';
import { divideRateRemainder, toMilliUnits } from './units';

export interface Segment {
  state: GameState;
  registry: Registry;
  // Accrued, so where a caller splits a span cannot change the level reached.
  deltas: PoolDeltas;
  // Control flow, not a write: only the segment's owner may end the action.
  stopped: boolean;
  observers: readonly ResultObserver[];
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

// The `modal:` line narrates an applied result; the modal itself is
// `pendingModal`. Reaching the log from out here is what lets a modal system
// replace the narration without reopening the switch that applies results.
const narrateModal: ResultObserver = ({ state }, { result, lead }) => {
  if (result.kind === 'open-modal' && lead) state.log.push(`modal:${result.modal}`);
};

// Every result a segment applies is offered to each of these, in application
// order: a consumer of applied results joins this list rather than growing the
// switch that applies them.
const RESULT_OBSERVERS: readonly ResultObserver[] = [narrateModal];

export function newSegment(state: GameState, registry: Registry, observers: readonly ResultObserver[] = RESULT_OBSERVERS): Segment {
  return { state, registry, deltas: new Map(), stopped: false, observers };
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
function applyOne(segment: Segment, result: ActionResult, actor: string, count: number, lead: boolean): number | undefined {
  const { state, registry } = segment;
  switch (result.kind) {
    case 'say':
      if (!lead) return undefined;
      state.log.push(result.text);
      return 0;
    case 'set':
      state.flags[result.variable] = true;
      return 0;
    case 'unset':
      delete state.flags[result.variable];
      return 0;
    case 'add': {
      const current = state.flags[result.variable];
      const base = typeof current === 'number' ? current : 0;
      const amount = result.amount * count;
      state.flags[result.variable] = base + amount;
      return amount;
    }
    case 'give': {
      const amount = drawCount(state, result.amount) * count;
      state.inventory[result.item] = (state.inventory[result.item] ?? 0) + amount;
      return amount;
    }
    case 'take': {
      const held = state.inventory[result.item] ?? 0;
      const left = Math.max(0, held - (result.amount ?? 1) * count);
      state.inventory[result.item] = left;
      return left - held;
    }
    case 'xp': {
      const amount = drawCount(state, result.amount) * count;
      state.xp[result.skill] = (state.xp[result.skill] ?? 0) + amount;
      return amount;
    }
    case 'relocate':
      state.location = result.location;
      return 0;
    case 'discover':
      state.flags[`${result.location}.${DISCOVERED}`] = true;
      return 0;
    case 'open-modal':
      state.pendingModal = result.modal;
      return 0;
    case 'pool': {
      requireResource(registry, result.resource);
      const milliAmount = toMilliUnits(drawAmount(state, result.delta)) * count;
      addDelta(segment.deltas, actor, result.resource, milliAmount);
      return milliAmount;
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

function setPoolLevel(state: GameState, registry: Registry, resource: Resource, current: number, raw: number, max: number): 'stored' | 'clamped' {
  if (raw > current && resource.onFull.length > 0 && max > 0) {
    const fires = Math.floor(raw / max);
    levels(state)[resource.id] = raw - fires * max;
    if (fires > 0) applyResultsNow(state, registry, resource.onFull, fires);
    return 'stored';
  }
  const clamped = Math.min(max, Math.max(0, raw));
  levels(state)[resource.id] = clamped;
  if (raw < current && current > 0 && clamped <= 0 && resource.onEmpty.length > 0) {
    applyResultsNow(state, registry, resource.onEmpty);
  }
  return clamped === raw ? 'stored' : 'clamped';
}

export function requireResource(registry: Registry, resourceId: string): Resource {
  const resource = registry.resources.get(resourceId);
  if (!resource) throw new RuntimeError(`unknown resource: ${resourceId}`);
  return resource;
}

interface PoolStore {
  actorId: string;
  levels: Record<string, number>;
  remainders: Record<string, number>;
  // A foe's pool takes the clamp but not the authored handlers: `on empty:` and
  // `on full:` are written in the player's voice.
  handlers: boolean;
}

function poolStores(state: GameState): PoolStore[] {
  const stores: PoolStore[] = [{ actorId: PLAYER, levels: levels(state), remainders: state.resourceRateRemainders, handlers: true }];
  for (const [actorId, actor] of Object.entries(state.activeAction?.actors ?? {})) {
    stores.push({ actorId, levels: actor.resources, remainders: actor.rateRemainders, handlers: false });
  }
  return stores;
}

function clampInto(store: PoolStore, resource: Resource, raw: number, max: number): 'stored' | 'clamped' {
  const clamped = Math.min(max, Math.max(0, raw));
  store.levels[resource.id] = clamped;
  return clamped === raw ? 'stored' : 'clamped';
}

// Iterates the registry, not the deltas, so settle order is split-independent.
export function settlePools(state: GameState, registry: Registry, snapshots: ResourceSnapshot[], dt: number, deltas: PoolDeltas): void {
  const rated = new Map<string, Map<string, ResourceSnapshot>>();
  for (const snapshot of snapshots) {
    const byResource = rated.get(snapshot.actorId) ?? new Map<string, ResourceSnapshot>();
    byResource.set(snapshot.resource.id, snapshot);
    rated.set(snapshot.actorId, byResource);
  }
  const stores = poolStores(state);

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
      const result = store.handlers ? setPoolLevel(state, registry, resource, current, raw, max) : clampInto(store, resource, raw, max);
      if (snapshot) store.remainders[resource.id] = result === 'clamped' ? 0 : rate.remainder;
    }
  }
}

export function clampResources(state: GameState, registry: Registry): void {
  for (const resource of registry.resources.values()) {
    const level = state.resources[resource.id];
    if (level === undefined) continue;
    const max = toMilliUnits(statValue(resource.max, state, registry));
    // The ceiling-limited destination is what lets setPoolLevel fire `on empty`.
    setPoolLevel(state, registry, resource, level, Math.min(max, level), max);
  }
}
