import { ActionResult } from './actionResult';
import { Registry } from './registry';
import { Resource } from './resource';
import { endAction, GameState, PoolLevels, RuntimeError } from './state';
import { statValue } from './stats';

// Everything that changes game state, and the pool mechanics those changes move.
//
// `state.resources` is typed readonly everywhere else (see PoolLevels), so this
// module is the ONLY one that can move a pool's level, and setPoolLevel is the
// only thing inside it that does. That used to be a rule held by vigilance, and
// it had duly drifted: a max shrinking to 0 wrote state.resources directly, past
// the seam, so the pool zeroed in silence and the `stop` in its `on empty:`
// never fired. save.ts writes levels too, through restorePools — but replacing a
// whole state is not moving a pool, and no rule of movement applies to it.

// The span of simulated time results are applied into, and the two things a
// result can ask for that only the span's end can honour.
//
// Every application of a result happens against one of these, which is the whole
// point: applying results and applying them associatively used to be two
// different functions each, and picking the wrong one of the pair was a silent
// bug rather than a type error.
//
// `deltas` — instantaneous pool changes (`drain:`/`restore:`) are accrued, never
// written as they happen. A segment settles each pool once, summing its discrete
// deltas with its integrated rate before a single clamp. Clamping per write is
// what breaks resolve()'s associativity: draining a pool to 0 and then
// regenerating gives a different level than letting the two net out, so where a
// caller happened to split the span would change the answer.
//
// `stopped` — `stop` is control flow, not a write. Both resolvers hold the
// ActiveAction in a local and go on mutating it after a batch, so clearing
// state.activeAction from inside an application left the two disagreeing and the
// next participants() dereferenced the null. Only whoever owns the segment ends
// the action; this is how they find out they should.
export interface Segment {
  state: GameState;
  registry: Registry;
  deltas: PoolDeltas;
  stopped: boolean;
}
export type PoolDeltas = Map<string, number>;

// THE application of results, as if the action producing them completed `count`
// times. Numeric verbs (give/take/xp/add) scale by count; one-shot verbs
// (say/set/unset/relocate/discover/open-modal) fire once however large the batch,
// because they describe a state the world reaches rather than a quantity it
// accrues.
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
        state.flags[`${result.location}.discovered`] = true;
        break;
      case 'open-modal':
        state.log.push(`modal:${result.modal}`);
        state.pendingModal = result.modal;
        break;
      case 'pool':
        requireResource(registry, result.resource);
        segment.deltas.set(result.resource, (segment.deltas.get(result.resource) ?? 0) + result.delta * count);
        break;
      case 'stop':
        // Idempotent, so neither a batched count nor a rollover firing N times
        // can stop an action "more" than once.
        segment.stopped = true;
        break;
    }
  }
}

// Results that fire with no segment around them to fold into — an instant
// action, a dialogue step, a boundary firing, a pool's own on empty/on full
// handler. They get a segment of zero length, which settles their pool writes on
// the spot and honours a `stop` on the spot: no resolver is mid-loop holding an
// ActiveAction that could disagree. This is the path a `# resource`'s `on empty:`
// stop travels, which is how content declares a pool fatal.
export function applyResultsNow(state: GameState, registry: Registry, results: readonly ActionResult[] | undefined, count = 1): void {
  const segment: Segment = { state, registry, deltas: new Map(), stopped: false };
  applyResults(segment, results ?? [], count);
  settlePools(state, registry, [], 0, segment.deltas);
  if (segment.stopped) endAction(state);
}

// Fills any pool the state doesn't already carry with its starting level: the
// authored `start` if given, else full (the live max). Called wherever a fresh
// baseline is built (save's initialState) or a live session begins (session's
// startSession); createGameState can't do it because it has no registry. Only
// missing pools are set, so a state loaded from a save keeps its levels — and a
// save that predates a newly-added resource gains it at full (free migration).
// At init there are no buffs, so max == the base stat.
export function initResources(state: GameState, registry: Registry): void {
  for (const resource of registry.resources.values()) {
    if (state.resources[resource.id] === undefined) {
      levels(state)[resource.id] = resource.start ?? statValue(resource.max, state, registry);
    }
  }
}

export const EPSILON = 1e-9;
export const SECONDS_PER_MINUTE = 60;

// A resource's rate/max snapshot taken at a segment's start, while the
// (possibly about-to-clear) active action's modifiers are still in force. The
// rate is constant across a segment — stat values only change at boundaries —
// so this snapshot drives the whole segment's closed-form integration.
export interface ResourceSnapshot {
  resource: Resource;
  ratePerMinute: number;
  max: number;
}

// Only pools with a nonzero net rate move; a static or net-zero pool is skipped
// entirely, which is what keeps an idle world crossing huge spans in O(1).
export function captureResourceRates(state: GameState, registry: Registry): ResourceSnapshot[] {
  const snapshots: ResourceSnapshot[] = [];
  for (const resource of registry.resources.values()) {
    const ratePerMinute = resource.rate ? statValue(resource.rate, state, registry) : 0;
    if (ratePerMinute === 0) continue;
    snapshots.push({ resource, ratePerMinute, max: statValue(resource.max, state, registry) });
  }
  return snapshots;
}

// A plain pool clamps to [0, max]. A pool with `on full` is a rollover meter:
// it empties and fires its effects ⌊raw/max⌋ times, batched per rollover
// (associative across arbitrary splits — the same guarantee fightBatch gives
// fight completions). `on empty` fires once as a pool crosses from >0 to 0; for
// a draining rate that firing is exact, because nextBoundary puts a boundary at
// the emptying instant so the crossing lands on a segment end.
// The one cast that opens PoolLevels for writing, so "what can move a pool" is
// answerable by reading one function's callers.
function levels(state: GameState): Record<string, number> {
  return state.resources as Record<string, number>;
}

// Places levels outright rather than moving them: no rollover, no on-empty, no
// clamp. That is what loading a save does — it constructs a state rather than
// changing one — and it is the only reason this is not private.
export function restorePools(state: GameState, restored: Record<string, number>): void {
  for (const [id, level] of Object.entries(restored)) levels(state)[id] = level;
}

function setPoolLevel(state: GameState, registry: Registry, resource: Resource, current: number, raw: number, max: number): void {
  if (raw > current && resource.onFull.length > 0 && max > 0) {
    const fires = Math.floor(raw / max);
    levels(state)[resource.id] = raw - fires * max;
    if (fires > 0) applyResultsNow(state, registry, resource.onFull, fires);
    return;
  }
  const clamped = Math.min(max, Math.max(0, raw));
  levels(state)[resource.id] = clamped;
  if (raw < current && current > EPSILON && clamped <= EPSILON && resource.onEmpty.length > 0) {
    applyResultsNow(state, registry, resource.onEmpty);
  }
}

export function requireResource(registry: Registry, resourceId: string): Resource {
  const resource = registry.resources.get(resourceId);
  if (!resource) throw new RuntimeError(`unknown resource: ${resourceId}`);
  return resource;
}

// Writes every pool the segment touched — those with a nonzero rate, those with
// a discrete delta, and those with both. Iterates the registry rather than the
// delta map so the order pools settle in (and therefore the order their on
// empty / on full effects fire in) can't depend on how the span was split.
// `dt` is the segment's elapsed seconds; rates are per MINUTE, hence dt/60.
export function settlePools(state: GameState, registry: Registry, snapshots: ResourceSnapshot[], dt: number, deltas: PoolDeltas): void {
  const dtMinutes = dt / SECONDS_PER_MINUTE;
  const rated = new Map(snapshots.map((snapshot) => [snapshot.resource.id, snapshot]));

  for (const resource of registry.resources.values()) {
    const snapshot = rated.get(resource.id);
    const delta = deltas.get(resource.id) ?? 0;
    // Skipping untouched pools is what keeps an idle world crossing huge spans
    // in O(1).
    if (!snapshot && delta === 0) continue;
    const current = state.resources[resource.id] ?? 0;
    const raw = current + delta + (snapshot ? snapshot.ratePerMinute * dtMinutes : 0);
    setPoolLevel(state, registry, resource, current, raw, snapshot?.max ?? statValue(resource.max, state, registry));
  }
}

// Re-seats every pool under its live max; called once a boundary settles, so a
// max-shrinking event (a +max buff expiring, a max stat driven down) can't leave
// a pool above its new ceiling.
export function clampResources(state: GameState, registry: Registry): void {
  for (const resource of registry.resources.values()) {
    const level = state.resources[resource.id];
    if (level === undefined) continue;
    const max = statValue(resource.max, state, registry);
    // A ceiling only ever pushes a level down, so this can never read as a
    // rollover. Passing the ceiling-limited level as the destination is what
    // lets setPoolLevel see the fall and fire `on empty` at the bottom of it.
    setPoolLevel(state, registry, resource, level, Math.min(max, level), max);
  }
}
