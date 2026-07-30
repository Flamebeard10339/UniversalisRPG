import { ActionResult } from '../grammar/actionResult';
import { DISCOVERED } from '../content/location';
import { Registry } from '../content/registry';
import { Resource } from '../content/resource';
import { endAction, GameState, RuntimeError } from './state';
import { statValue } from './stats';
import { divideRateRemainder, fromMilliUnits, toMilliUnits } from './units';

export interface Segment {
  state: GameState;
  registry: Registry;
  // Accrued, so where a caller splits a span cannot change the level reached.
  deltas: PoolDeltas;
  // Control flow, not a write: only the segment's owner may end the action.
  stopped: boolean;
}
export type PoolDeltas = Map<string, number>;

export function applyResults(segment: Segment, results: readonly ActionResult[], count = 1): void {
  if (count <= 0) return;
  const { state, registry } = segment;

  for (const result of results) {
    switch (result.kind) {
      case 'say':
        state.log.push(result.text);
        break;
      case 'set':
        state.flags[result.variable] = true;
        break;
      case 'unset':
        delete state.flags[result.variable];
        break;
      case 'add': {
        const current = state.flags[result.variable];
        const base = typeof current === 'number' ? current : 0;
        state.flags[result.variable] = base + result.amount * count;
        break;
      }
      case 'give':
        state.inventory[result.item] = (state.inventory[result.item] ?? 0) + (result.amount ?? 1) * count;
        break;
      case 'take':
        state.inventory[result.item] = Math.max(0, (state.inventory[result.item] ?? 0) - (result.amount ?? 1) * count);
        break;
      case 'xp':
        state.xp[result.skill] = (state.xp[result.skill] ?? 0) + result.amount * count;
        break;
      case 'relocate':
        state.location = result.location;
        break;
      case 'discover':
        state.flags[`${result.location}.${DISCOVERED}`] = true;
        break;
      case 'open-modal':
        state.log.push(`modal:${result.modal}`);
        state.pendingModal = result.modal;
        break;
      case 'pool':
        requireResource(registry, result.resource);
        segment.deltas.set(result.resource, (segment.deltas.get(result.resource) ?? 0) + toMilliUnits(result.delta) * count);
        break;
      case 'stop':
        segment.stopped = true;
        break;
    }
  }
}

export function applyResultsNow(state: GameState, registry: Registry, results: readonly ActionResult[] | undefined, count = 1): void {
  const segment: Segment = { state, registry, deltas: new Map(), stopped: false };
  applyResults(segment, results ?? [], count);
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
  ratePerMinute: number;
  max: number;
}

export function captureResourceRates(state: GameState, registry: Registry): ResourceSnapshot[] {
  const snapshots: ResourceSnapshot[] = [];
  for (const resource of registry.resources.values()) {
    const ratePerMinute = resource.rate ? toMilliUnits(statValue(resource.rate, state, registry)) : 0;
    if (ratePerMinute === 0) continue;
    snapshots.push({ resource, ratePerMinute, max: toMilliUnits(statValue(resource.max, state, registry)) });
  }
  return snapshots;
}

// The one cast that opens PoolLevels for writing.
function levels(state: GameState): Record<string, number> {
  return state.resources as Record<string, number>;
}

export function poolDisplayValue(level: number): number {
  return fromMilliUnits(level);
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

// Iterates the registry, not the deltas, so settle order is split-independent.
export function settlePools(state: GameState, registry: Registry, snapshots: ResourceSnapshot[], dt: number, deltas: PoolDeltas): void {
  const rated = new Map(snapshots.map((snapshot) => [snapshot.resource.id, snapshot]));

  for (const resource of registry.resources.values()) {
    const snapshot = rated.get(resource.id);
    const delta = deltas.get(resource.id) ?? 0;
    if (!snapshot && delta === 0) continue;
    const current = state.resources[resource.id] ?? 0;
    const rateAcc = snapshot ? snapshot.ratePerMinute * dt + (state.resourceRateRemainders[resource.id] ?? 0) : 0;
    const rate = snapshot ? divideRateRemainder(rateAcc) : { units: 0, remainder: 0 };
    const raw = current + delta + rate.units;
    const result = setPoolLevel(state, registry, resource, current, raw, snapshot?.max ?? toMilliUnits(statValue(resource.max, state, registry)));
    if (snapshot) state.resourceRateRemainders[resource.id] = result === 'clamped' ? 0 : rate.remainder;
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
